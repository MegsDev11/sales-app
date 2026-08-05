import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAccess } from "@/lib/supabase/server-auth";
import { parseInvoicePdf } from "@/lib/commission/parse-invoice";
import { parseCatalogue } from "@/lib/commission/parse-catalogue";
import { calculateCommission } from "@/lib/commission/calculate";
import { matchClientToLead, type MatchableLead } from "@/lib/commission/match-client";
import { adminClient, errorMessage, fail, newId } from "@/lib/api/route-helpers";
import {
  DEFAULT_EXCLUDED_CODES,
  normaliseCode,
  type CatalogueItem,
  type CommissionResult,
  type MarkupBasis,
  type ParsedInvoice,
} from "@/lib/commission/constants";

/**
 * Commission API.
 *
 * GET ?id=<invoice>  -> one priced invoice with its lines
 * GET                -> invoices, catalogue imports, aliases, exclusions, rules, reps
 * POST multipart     -> upload a price list (kind=catalogue) or an invoice (kind=invoice)
 * POST json {action}  -> reprice / attribute / approve / delete, aliases, exclusions, rules
 *
 * Guarded at crm/manage throughout: this is pay data, and a sales agent with `edit`
 * on their own pipeline must not see what colleagues earn. RLS (migration 049)
 * enforces the same rule independently; these checks turn a refusal into a clean 403
 * instead of a silently empty list.
 *
 * The generated Database types don't know the migration 049 tables, so this route
 * uses an untyped view of the admin client — same approach as the procurement route.
 * Response shapes are pinned by lib/commission/constants.
 */

// PDF and spreadsheet parsing need the Node runtime, not edge.
export const runtime = "nodejs";

const MIGRATION_HINT = "run supabase/migrations/049_commission.sql in Supabase.";

/** Uploads are small; this only exists to stop a stray 200MB file reaching the parser. */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const noStore = { headers: { "Cache-Control": "no-store, max-age=0" } };

/* ------------------------------------------------------------------ *
 * Shared loading
 * ------------------------------------------------------------------ */

interface RuleRow {
  id: string;
  rep_id: string | null;
  install_rate: number;
  monthly_threshold: number;
  fixed_addition: number;
  markup_basis: MarkupBasis;
  effective_from: string;
}

interface PricingContext {
  aliases: { from: string; to: string }[];
  excludedCodes: string[];
  rules: RuleRow[];
}

async function loadPricingContext(supabase: SupabaseClient): Promise<PricingContext> {
  const [aliases, excluded, rules] = await Promise.all([
    supabase.from("commission_code_aliases").select("invoice_code, catalogue_code"),
    supabase.from("commission_excluded_codes").select("code"),
    supabase.from("commission_rules").select("*").order("effective_from", { ascending: false }),
  ]);
  if (aliases.error) throw new Error(`${aliases.error.message} — ${MIGRATION_HINT}`);

  const excludedCodes = (excluded.data ?? []).map((row) => String(row.code));

  return {
    aliases: (aliases.data ?? []).map((row) => ({
      from: String(row.invoice_code),
      to: String(row.catalogue_code),
    })),
    // Fall back to the built-in list if nobody has configured exclusions yet —
    // paying commission on labour and travel would be a silent regression.
    excludedCodes: excludedCodes.length ? excludedCodes : DEFAULT_EXCLUDED_CODES,
    rules: (rules.data ?? []) as RuleRow[],
  };
}

/** Rep-specific rule wins over the company default; latest effective date wins within that. */
function ruleFor(rules: RuleRow[], repId: string | null): RuleRow | null {
  const today = new Date().toISOString().slice(0, 10);
  const eligible = rules.filter((rule) => rule.effective_from <= today);
  const pool = eligible.length ? eligible : rules;
  return (
    pool.find((rule) => repId && rule.rep_id === repId) ??
    pool.find((rule) => rule.rep_id === null) ??
    null
  );
}

/**
 * The price list in force for a given invoice date. Commission must be reproducible,
 * so an invoice is priced against the snapshot that was live when it was raised, not
 * against whatever was uploaded most recently.
 */
async function catalogueForDate(
  supabase: SupabaseClient,
  invoiceDate: string | null
): Promise<{ importId: string | null; items: CatalogueItem[]; warning: string | null }> {
  const { data: imports, error } = await supabase
    .from("commission_catalogue_imports")
    .select("id, effective_from")
    .order("effective_from", { ascending: false });
  if (error) throw new Error(`${error.message} — ${MIGRATION_HINT}`);
  if (!imports?.length) return { importId: null, items: [], warning: null };

  const onOrBefore = invoiceDate
    ? imports.find((row) => String(row.effective_from) <= invoiceDate)
    : undefined;
  const chosen = onOrBefore ?? imports[imports.length - 1];

  // Falling back to a list that came into force AFTER the invoice was raised means
  // the costs may not be the ones that applied. Say so rather than imply precision.
  const warning =
    invoiceDate && !onOrBefore
      ? `No price list predates ${invoiceDate}; priced against the earliest available ` +
        `(effective ${String(chosen.effective_from)}), so costs may not be the ones in force then.`
      : null;

  return {
    importId: String(chosen.id),
    items: await loadCatalogueItems(supabase, String(chosen.id)),
    warning,
  };
}

async function loadCatalogueItems(
  supabase: SupabaseClient,
  importId: string
): Promise<CatalogueItem[]> {
  const items: CatalogueItem[] = [];
  const pageSize = 1000;
  // Supabase caps a select at 1000 rows and the price list is larger than that.
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("commission_catalogue_items")
      .select("code, description, category, avg_cost, excl_price, gp_amount")
      .eq("import_id", importId)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`${error.message} — ${MIGRATION_HINT}`);
    if (!data?.length) break;
    for (const row of data) {
      items.push({
        code: String(row.code),
        description: String(row.description ?? ""),
        category: String(row.category ?? ""),
        avgCost: Number(row.avg_cost ?? 0),
        exclPrice: Number(row.excl_price ?? 0),
        gpAmount: Number(row.gp_amount ?? 0),
      });
    }
    if (data.length < pageSize) break;
  }
  return items;
}

/** Rebuild a ParsedInvoice from stored rows so a saved invoice can be repriced. */
async function invoiceAsParsed(
  supabase: SupabaseClient,
  invoiceId: string
): Promise<{ invoice: ParsedInvoice; row: Record<string, unknown> }> {
  const [{ data: row, error }, lines] = await Promise.all([
    supabase.from("commission_invoices").select("*").eq("id", invoiceId).maybeSingle(),
    supabase
      .from("commission_invoice_lines")
      .select("*")
      .eq("invoice_id", invoiceId)
      .order("line_index"),
  ]);
  if (error) throw new Error(`${error.message} — ${MIGRATION_HINT}`);
  if (!row) throw new Error("Invoice not found");

  return {
    row: row as Record<string, unknown>,
    invoice: {
      invoiceNumber: String(row.invoice_number),
      invoiceDate: (row.invoice_date as string | null) ?? null,
      reference: String(row.reference ?? ""),
      clientName: String(row.client_name ?? ""),
      installerName: String(row.installer_name ?? ""),
      statedExclTotal: row.stated_excl_total === null ? null : Number(row.stated_excl_total),
      parsedExclTotal: Number(row.revenue_excl ?? 0),
      reconciles: !!row.reconciled,
      lines: (lines.data ?? []).map((line, index) => ({
        lineIndex: Number(line.line_index ?? index),
        code: String(line.code),
        description: String(line.description ?? ""),
        qty: Number(line.qty ?? 0),
        unitPrice: Number(line.unit_price ?? 0),
        discountPct: Number(line.discount_pct ?? 0),
        vatPct: 15,
        exclTotal: Number(line.excl_total ?? 0),
        inclTotal: 0,
      })),
    },
  };
}

/** Write a calculation over an invoice's totals and lines. */
async function persistCalculation(
  supabase: SupabaseClient,
  invoiceId: string,
  result: CommissionResult,
  extra: Record<string, unknown> = {}
) {
  const { error: headError } = await supabase
    .from("commission_invoices")
    .update({
      basis: result.basis,
      install_rate: result.installRate,
      revenue_excl: result.totals.revenueExcl,
      catalogue_markup: result.totals.catalogueMarkup,
      as_invoiced_markup: result.totals.asInvoicedMarkup,
      catalogue_commission: result.totals.catalogueCommission,
      as_invoiced_commission: result.totals.asInvoicedCommission,
      commission: result.totals.commission,
      review_count: result.needsReview.length,
      updated_at: new Date().toISOString(),
      ...extra,
    })
    .eq("id", invoiceId);
  if (headError) throw new Error(`${headError.message} — ${MIGRATION_HINT}`);

  await supabase.from("commission_invoice_lines").delete().eq("invoice_id", invoiceId);

  const rows = result.lines.map((line) => ({
    id: newId("cml"),
    invoice_id: invoiceId,
    line_index: line.lineIndex,
    code: line.code,
    matched_code: line.matchedCode,
    description: line.description,
    qty: line.qty,
    unit_price: line.unitPrice,
    discount_pct: line.discountPct,
    net_unit_price: line.netUnitPrice,
    excl_total: line.exclTotal,
    avg_cost: line.avgCost,
    catalogue_gp_unit: line.catalogueGpUnit,
    catalogue_markup: line.catalogueMarkup,
    as_invoiced_markup: line.asInvoicedMarkup,
    commissionable_markup: line.commissionableMarkup,
    commission: line.commission,
    is_excluded: line.excluded,
    flags: line.flags,
  }));
  if (rows.length) {
    const { error } = await supabase.from("commission_invoice_lines").insert(rows);
    if (error) throw new Error(`${error.message} — ${MIGRATION_HINT}`);
  }
}

/** Reprice a stored invoice from its own lines. Refuses once approved. */
async function repriceInvoice(
  supabase: SupabaseClient,
  invoiceId: string,
  overrides: { basis?: MarkupBasis; repId?: string | null } = {}
) {
  const { invoice, row } = await invoiceAsParsed(supabase, invoiceId);
  if (row.status === "approved") {
    throw new Error("This invoice is approved. Reopen it before repricing.");
  }

  const context = await loadPricingContext(supabase);
  const repId =
    overrides.repId !== undefined ? overrides.repId : ((row.rep_id as string | null) ?? null);
  const rule = ruleFor(context.rules, repId);
  const basis = overrides.basis ?? (row.basis as MarkupBasis) ?? rule?.markup_basis ?? "as_invoiced";

  const importId = (row.catalogue_import_id as string | null) ?? null;
  const items = importId
    ? await loadCatalogueItems(supabase, importId)
    : (await catalogueForDate(supabase, invoice.invoiceDate)).items;

  const result = calculateCommission({
    invoice,
    catalogue: items,
    aliases: context.aliases,
    excludedCodes: context.excludedCodes,
    basis,
    installRate: Number(row.install_rate ?? rule?.install_rate ?? 0.1),
  });

  await persistCalculation(supabase, invoiceId, result, { rep_id: repId });
  return result;
}

/* ------------------------------------------------------------------ *
 * GET
 * ------------------------------------------------------------------ */

export async function GET(request: Request) {
  const user = await requireAccess(request, "crm", "manage");
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized — sales management access required" },
      { status: 403 }
    );
  }

  try {
    const supabase = adminClient();
    const id = new URL(request.url).searchParams.get("id");

    if (id) {
      const [{ data: invoice, error }, lines] = await Promise.all([
        supabase.from("commission_invoices").select("*").eq("id", id).maybeSingle(),
        supabase
          .from("commission_invoice_lines")
          .select("*")
          .eq("invoice_id", id)
          .order("line_index"),
      ]);
      if (error) throw new Error(`${error.message} — ${MIGRATION_HINT}`);
      if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
      return NextResponse.json({ invoice, lines: lines.data ?? [] }, noStore);
    }

    const [invoices, imports, aliases, excluded, rules, reps] = await Promise.all([
      supabase
        .from("commission_invoices")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("commission_catalogue_imports")
        .select("*")
        .order("effective_from", { ascending: false }),
      supabase.from("commission_code_aliases").select("*").order("invoice_code"),
      supabase.from("commission_excluded_codes").select("*").order("code"),
      supabase.from("commission_rules").select("*").order("effective_from", { ascending: false }),
      supabase.from("team_members").select("id, name, title, role, color, avatar_initials").order("name"),
    ]);

    if (invoices.error) throw new Error(`${invoices.error.message} — ${MIGRATION_HINT}`);

    return NextResponse.json(
      {
        invoices: invoices.data ?? [],
        catalogueImports: imports.data ?? [],
        aliases: aliases.data ?? [],
        excludedCodes: (excluded.data ?? []).length
          ? excluded.data
          : DEFAULT_EXCLUDED_CODES.map((code) => ({ code, reason: "Built-in default" })),
        rules: rules.data ?? [],
        reps: reps.data ?? [],
      },
      noStore
    );
  } catch (error) {
    return fail(error);
  }
}

/* ------------------------------------------------------------------ *
 * POST
 * ------------------------------------------------------------------ */

export async function POST(request: Request) {
  const user = await requireAccess(request, "crm", "manage");
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized — sales management access required" },
      { status: 403 }
    );
  }

  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("multipart/form-data")) {
      return await handleUpload(request, user.id);
    }
    return await handleAction(request, user.id);
  } catch (error) {
    return fail(error);
  }
}

async function handleUpload(request: Request, userId: string) {
  const supabase = adminClient();
  const form = await request.formData();
  const kind = String(form.get("kind") ?? "");
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file received" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "That file is empty" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "That file is too large (25 MB limit)" }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();

  /* ---------- price list ---------- */
  if (kind === "catalogue") {
    const effectiveFrom = String(form.get("effectiveFrom") ?? "").trim();
    const parsed = await parseCatalogue(Buffer.from(bytes), file.name);
    if (parsed.items.length === 0) {
      return NextResponse.json(
        { error: "No item rows found in that file." },
        { status: 400 }
      );
    }

    // Provenance of the numbers commission gets calculated from — which export
    // vocabulary was read, whether margin was derived, and what had to be repaired.
    const provenance = [
      `Columns: ${parsed.headings.join(", ")}.`,
      parsed.summary.gpDerived
        ? "No GP column; margin derived as price − average cost."
        : "Margin read from the export's own GP column.",
      parsed.summary.repairedCount > 0
        ? `${parsed.summary.repairedCount} rows realigned after unquoted commas in the description.`
        : null,
      parsed.summary.skippedCodes.length > 0
        ? `Skipped (non-numeric price/cost): ${parsed.summary.skippedCodes.join(", ")}.`
        : null,
    ]
      .filter(Boolean)
      .join(" ");

    const importId = newId("cmi");
    const { error: importError } = await supabase.from("commission_catalogue_imports").insert({
      id: importId,
      source_filename: file.name,
      sheet_name: parsed.sheetName,
      effective_from: effectiveFrom || new Date().toISOString().slice(0, 10),
      item_count: parsed.summary.itemCount,
      zero_price_count: parsed.summary.zeroPriceCount,
      non_positive_gp_count: parsed.summary.nonPositiveGpCount,
      notes: provenance.slice(0, 2000),
      imported_by: userId,
    });
    if (importError) throw new Error(`${importError.message} — ${MIGRATION_HINT}`);

    // Chunked so a 1,200-row price list doesn't hit the statement/payload limits.
    const chunkSize = 500;
    for (let i = 0; i < parsed.items.length; i += chunkSize) {
      const rows = parsed.items.slice(i, i + chunkSize).map((item) => ({
        id: newId("cmc"),
        import_id: importId,
        code: item.code,
        description: item.description,
        category: item.category,
        avg_cost: item.avgCost,
        excl_price: item.exclPrice,
        gp_amount: item.gpAmount,
      }));
      const { error } = await supabase.from("commission_catalogue_items").insert(rows);
      if (error) throw new Error(`${error.message} — ${MIGRATION_HINT}`);
    }

    return NextResponse.json({ importId, ...parsed.summary, sheetName: parsed.sheetName }, noStore);
  }

  /* ---------- invoice ---------- */
  if (kind !== "invoice") {
    return NextResponse.json({ error: `Unknown upload kind "${kind}"` }, { status: 400 });
  }

  const parsed = await parseInvoicePdf(bytes);

  if (parsed.lines.length === 0) {
    return NextResponse.json(
      { error: "No invoice lines found. Is this a MEGS tax invoice or quote PDF?" },
      { status: 400 }
    );
  }
  // A partially-read invoice would quietly under-pay somebody, so refuse it outright.
  if (!parsed.reconciles) {
    return NextResponse.json(
      {
        error:
          `Read ${parsed.lines.length} lines totalling R${parsed.parsedExclTotal.toFixed(2)}, but the ` +
          `invoice states R${parsed.statedExclTotal?.toFixed(2) ?? "?"} excluding VAT. ` +
          `Refusing to price an invoice that doesn't add up.`,
        parsed,
      },
      { status: 422 }
    );
  }

  const { data: existing } = await supabase
    .from("commission_invoices")
    .select("id, ref, status")
    .ilike("invoice_number", parsed.invoiceNumber)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      {
        error: `${parsed.invoiceNumber} was already imported as ${existing.ref}.`,
        existingId: existing.id,
      },
      { status: 409 }
    );
  }

  const context = await loadPricingContext(supabase);
  const { importId, items, warning: catalogueWarning } = await catalogueForDate(
    supabase,
    parsed.invoiceDate
  );
  if (items.length === 0) {
    return NextResponse.json(
      { error: "No price list has been imported yet. Upload the Item Listing Report first." },
      { status: 400 }
    );
  }

  // Attribution follows the client relationship, never the invoice's SALES REP.
  // The real client book is searched first: accounts_clients.sales_rep_member_id
  // (migration 066) is the relationship owner Sage recorded, resolved to a staff
  // member on /accounts/linking. CRM leads remain as a fallback for clients not
  // yet on the book. Before 066 is applied the book query returns nothing and
  // behaviour is unchanged.
  const [{ data: leadRows }, { data: bookRows }] = await Promise.all([
    supabase
      .from("leads")
      .select("id, client_name, company, assigned_to_id")
      .eq("deleted", false),
    supabase.from("accounts_clients").select("id, name, sales_rep_member_id, lead_id"),
  ]);
  const leads: MatchableLead[] = (leadRows ?? []).map((row) => ({
    id: String(row.id),
    clientName: String(row.client_name ?? ""),
    company: (row.company as string | null) ?? null,
    assignedToId: (row.assigned_to_id as string | null) ?? null,
  }));
  const ownerByLeadId = new Map(leads.map((l) => [l.id, l.assignedToId]));
  const bookMatchables: MatchableLead[] = (bookRows ?? []).map((row) => ({
    id: `client:${String(row.id)}`,
    clientName: String(row.name ?? ""),
    company: null,
    assignedToId:
      (row.sales_rep_member_id as string | null) ??
      (row.lead_id ? ownerByLeadId.get(String(row.lead_id)) ?? null : null),
  }));
  const match = matchClientToLead(parsed.clientName, [...bookMatchables, ...leads]);
  const repId = match?.lead.assignedToId ?? null;

  const rule = ruleFor(context.rules, repId);
  const basis: MarkupBasis = rule?.markup_basis ?? "as_invoiced";
  const installRate = Number(rule?.install_rate ?? 0.1);

  const result = calculateCommission({
    invoice: parsed,
    catalogue: items,
    aliases: context.aliases,
    excludedCodes: context.excludedCodes,
    basis,
    installRate,
  });

  const { data: refRow } = await supabase.rpc("next_commission_ref");
  const invoiceId = newId("cmv");

  const { error: insertError } = await supabase.from("commission_invoices").insert({
    id: invoiceId,
    ref: typeof refRow === "string" ? refRow : `CMM-${Date.now().toString(36)}`,
    invoice_number: parsed.invoiceNumber,
    invoice_date: parsed.invoiceDate,
    reference: parsed.reference,
    client_name: parsed.clientName,
    installer_name: parsed.installerName,
    rep_id: repId,
    basis,
    install_rate: installRate,
    revenue_excl: result.totals.revenueExcl,
    catalogue_markup: result.totals.catalogueMarkup,
    as_invoiced_markup: result.totals.asInvoicedMarkup,
    catalogue_commission: result.totals.catalogueCommission,
    as_invoiced_commission: result.totals.asInvoicedCommission,
    commission: result.totals.commission,
    reconciled: parsed.reconciles,
    stated_excl_total: parsed.statedExclTotal,
    review_count: result.needsReview.length,
    status: "draft",
    source_filename: file.name,
    catalogue_import_id: importId,
    created_by: userId,
  });
  if (insertError) throw new Error(`${insertError.message} — ${MIGRATION_HINT}`);

  await persistCalculation(supabase, invoiceId, result);

  return NextResponse.json(
    {
      invoiceId,
      parsed,
      result,
      catalogueWarning,
      match: match
        ? {
            leadId: match.lead.id,
            leadName: match.lead.company || match.lead.clientName,
            confidence: match.confidence,
            reason: match.reason,
            repId: match.lead.assignedToId,
          }
        : null,
    },
    noStore
  );
}

async function handleAction(request: Request, userId: string) {
  const supabase = adminClient();
  const body = (await request.json()) as Record<string, unknown>;
  const action = String(body.action ?? "");
  const str = (key: string) => (body[key] === null ? null : String(body[key] ?? ""));

  switch (action) {
    case "reprice": {
      const id = str("id");
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      const result = await repriceInvoice(supabase, id, {
        basis: body.basis === undefined ? undefined : (String(body.basis) as MarkupBasis),
        repId: body.repId === undefined ? undefined : (str("repId") || null),
      });
      return NextResponse.json({ ok: true, result }, noStore);
    }

    case "approve":
    case "reopen": {
      const id = str("id");
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      const approving = action === "approve";

      if (approving) {
        const { data: row } = await supabase
          .from("commission_invoices")
          .select("rep_id, reconciled")
          .eq("id", id)
          .maybeSingle();
        // Approving without an earner would create a payout nobody receives.
        if (!row?.rep_id) {
          return NextResponse.json(
            { error: "Choose who earns this commission before approving." },
            { status: 400 }
          );
        }
        if (!row.reconciled) {
          return NextResponse.json(
            { error: "This invoice didn't reconcile against its own total." },
            { status: 400 }
          );
        }
      }

      const { error } = await supabase
        .from("commission_invoices")
        .update({
          status: approving ? "approved" : "draft",
          approved_by: approving ? userId : null,
          approved_at: approving ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw new Error(`${error.message} — ${MIGRATION_HINT}`);
      return NextResponse.json({ ok: true }, noStore);
    }

    case "delete_invoice": {
      const id = str("id");
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      const { data: row } = await supabase
        .from("commission_invoices")
        .select("status")
        .eq("id", id)
        .maybeSingle();
      if (row?.status === "approved") {
        return NextResponse.json(
          { error: "Reopen this invoice before deleting it." },
          { status: 400 }
        );
      }
      const { error } = await supabase.from("commission_invoices").delete().eq("id", id);
      if (error) throw new Error(`${error.message} — ${MIGRATION_HINT}`);
      return NextResponse.json({ ok: true }, noStore);
    }

    case "add_alias": {
      const from = normaliseCode(str("invoiceCode") ?? "");
      const to = normaliseCode(str("catalogueCode") ?? "");
      if (!from || !to) {
        return NextResponse.json(
          { error: "Both the invoice code and the catalogue code are required" },
          { status: 400 }
        );
      }
      const { error } = await supabase.from("commission_code_aliases").upsert(
        {
          id: newId("cma"),
          invoice_code: from,
          catalogue_code: to,
          note: str("note") ?? "",
          created_by: userId,
        },
        { onConflict: "invoice_code" }
      );
      if (error) throw new Error(`${error.message} — ${MIGRATION_HINT}`);

      // Repricing here is the point of the mapping — apply it straight away. The
      // alias is already saved, so a locked invoice must not turn this into a failure:
      // report the mapping as done and say why nothing was repriced.
      const id = str("repriceId");
      let result = null;
      let note: string | null = null;
      if (id) {
        try {
          result = await repriceInvoice(supabase, id);
        } catch (repriceError) {
          note = errorMessage(repriceError);
        }
      }
      return NextResponse.json({ ok: true, result, note }, noStore);
    }

    case "remove_alias": {
      const { error } = await supabase
        .from("commission_code_aliases")
        .delete()
        .eq("id", str("id"));
      if (error) throw new Error(`${error.message} — ${MIGRATION_HINT}`);
      return NextResponse.json({ ok: true }, noStore);
    }

    case "set_excluded": {
      const code = normaliseCode(str("code") ?? "");
      if (!code) return NextResponse.json({ error: "code is required" }, { status: 400 });
      const { error } = await supabase
        .from("commission_excluded_codes")
        .upsert({ code, reason: str("reason") ?? "" }, { onConflict: "code" });
      if (error) throw new Error(`${error.message} — ${MIGRATION_HINT}`);
      return NextResponse.json({ ok: true }, noStore);
    }

    case "remove_excluded": {
      const { error } = await supabase
        .from("commission_excluded_codes")
        .delete()
        .eq("code", normaliseCode(str("code") ?? ""));
      if (error) throw new Error(`${error.message} — ${MIGRATION_HINT}`);
      return NextResponse.json({ ok: true }, noStore);
    }

    case "save_rule": {
      const repId = str("repId") || null;
      const effectiveFrom =
        str("effectiveFrom") || new Date().toISOString().slice(0, 10);
      const { error } = await supabase.from("commission_rules").upsert(
        {
          id: str("id") || newId("cmr"),
          rep_id: repId,
          install_rate: Number(body.installRate ?? 0.1),
          monthly_threshold: Number(body.monthlyThreshold ?? 0),
          fixed_addition: Number(body.fixedAddition ?? 0),
          markup_basis: String(body.markupBasis ?? "as_invoiced"),
          effective_from: effectiveFrom,
          note: str("note") ?? "",
        },
        { onConflict: "id" }
      );
      if (error) throw new Error(`${error.message} — ${MIGRATION_HINT}`);
      return NextResponse.json({ ok: true }, noStore);
    }

    case "delete_catalogue_import": {
      const id = str("id");
      const { data: used } = await supabase
        .from("commission_invoices")
        .select("ref")
        .eq("catalogue_import_id", id)
        .limit(1);
      if (used?.length) {
        return NextResponse.json(
          { error: `That price list priced ${used[0].ref} and others. Deleting it would orphan them.` },
          { status: 400 }
        );
      }
      const { error } = await supabase
        .from("commission_catalogue_imports")
        .delete()
        .eq("id", id);
      if (error) throw new Error(`${error.message} — ${MIGRATION_HINT}`);
      return NextResponse.json({ ok: true }, noStore);
    }

    default:
      return NextResponse.json({ error: `Unknown action "${action}"` }, { status: 400 });
  }
}
