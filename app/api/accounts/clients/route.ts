import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAccess } from "@/lib/supabase/server-auth";
import { can } from "@/lib/access";
import { parseClientExport } from "@/lib/accounts/parse-clients";
import { adminClient, fail, newId } from "@/lib/api/route-helpers";
import {
  round2,
  VAT_DIVISOR,
  type BillingStatus,
  type ClientRecord,
  type PaymentMethod,
} from "@/lib/accounts/constants";

/**
 * Accounts client book.
 *
 * GET                 -> clients (filtered/paged) plus the counts the list header shows
 * GET ?facets=1       -> just the counts, for the filter bar
 * POST multipart      -> import a Sage "Megs Kliente lys" export
 * POST json {action}  -> update one client, or bulk-set a status
 *
 * Guarded at accounts/view for reads and accounts/edit for writes. RLS (migration
 * 051) enforces the same rule independently; these checks turn a refusal into a clean
 * 403 rather than a silently empty list.
 *
 * The generated Database types don't know the migration 051 tables, so this route
 * uses an untyped view of the admin client — same approach as the procurement and
 * commission routes. Response shapes are pinned by lib/accounts/constants.
 */

// Spreadsheet parsing needs the Node runtime, not edge.
export const runtime = "nodejs";

const MIGRATION_HINT = "run supabase/migrations/051_accounts_clients.sql in Supabase.";

/** The export is ~700KB; this only stops a stray huge file reaching the parser. */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Supabase rejects very large single statements, and 5 400 rows needs chunking. */
const UPSERT_CHUNK = 500;

const noStore = { headers: { "Cache-Control": "no-store, max-age=0" } };

interface ClientRow {
  id: string;
  name: string;
  staff_raw: string;
  billing_status: string;
  debit_order_day: number | null;
  accounts_owner: string | null;
  seasonal: boolean;
  contact_name: string;
  tel: string;
  mobile: string;
  email: string;
  emails: string[] | null;
  sales_rep: string;
  pppoe_username: string;
  package_raw: string;
  package_speed_mbps: number | string | null;
  package_price_incl: number | string | null;
  payment_method: string | null;
  billing_note: string | null;
  balance: number | string;
  lead_id: string | null;
  needs_review: boolean;
  updated_at: string;
}

const num = (value: number | string | null): number | null => {
  if (value === null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

function toRecord(row: ClientRow): ClientRecord {
  const incl = num(row.package_price_incl);
  return {
    id: row.id,
    name: row.name,
    staffRaw: row.staff_raw ?? "",
    billingStatus: (row.billing_status ?? "unclassified") as BillingStatus,
    debitOrderDay: row.debit_order_day,
    accountsOwner: row.accounts_owner,
    seasonal: !!row.seasonal,
    contactName: row.contact_name ?? "",
    tel: row.tel ?? "",
    mobile: row.mobile ?? "",
    email: row.email ?? "",
    emails: row.emails ?? [],
    salesRep: row.sales_rep ?? "",
    pppoeUsername: row.pppoe_username ?? "",
    packageRaw: row.package_raw ?? "",
    packageSpeedMbps: num(row.package_speed_mbps),
    packagePriceIncl: incl,
    // Derived, never stored: one rounding rule lives in one place.
    packagePriceExcl: incl === null ? null : round2(incl / VAT_DIVISOR),
    paymentMethod: (row.payment_method ?? "unknown") as PaymentMethod,
    billingNote: row.billing_note ?? "",
    balance: num(row.balance) ?? 0,
    leadId: row.lead_id,
    needsReview: !!row.needs_review,
    updatedAt: row.updated_at,
  };
}

/* ------------------------------------------------------------------ *
 * GET
 * ------------------------------------------------------------------ */

/**
 * Counts for the filter bar.
 *
 * Head-only count queries rather than fetching rows: the list is 5 400 clients and
 * the header needs eleven numbers, not eleven copies of the table.
 */
async function loadFacets(db: SupabaseClient) {
  const statuses: BillingStatus[] = [
    "active",
    "cancelled",
    "temp_cancelled",
    "quote_only",
    "red_client",
    "one_time",
    "sponsored",
    "duplicate",
    "deceased",
    "internal",
    "unclassified",
  ];

  const counts = await Promise.all(
    statuses.map(async (status) => {
      const { count } = await db
        .from("accounts_clients")
        .select("id", { count: "exact", head: true })
        .eq("billing_status", status);
      return [status, count ?? 0] as const;
    })
  );

  const [{ count: total }, { count: review }, { count: owners }] = await Promise.all([
    db.from("accounts_clients").select("id", { count: "exact", head: true }),
    db
      .from("accounts_clients")
      .select("id", { count: "exact", head: true })
      .eq("needs_review", true),
    db
      .from("accounts_clients")
      .select("id", { count: "exact", head: true })
      .eq("billing_status", "active")
      .not("package_price_incl", "is", null)
      .neq("email", ""),
  ]);

  return {
    byStatus: Object.fromEntries(counts),
    total: total ?? 0,
    needsReview: review ?? 0,
    readyToInvoice: owners ?? 0,
  };
}

export async function GET(request: Request) {
  const user = await requireAccess(request, "accounts", "view");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const url = new URL(request.url);
  const db = adminClient();

  try {
    if (url.searchParams.get("facets") === "1") {
      return NextResponse.json(await loadFacets(db), noStore);
    }

    const search = (url.searchParams.get("q") ?? "").trim();
    const status = (url.searchParams.get("status") ?? "").trim();
    const owner = (url.searchParams.get("owner") ?? "").trim();
    const debitDay = (url.searchParams.get("debitDay") ?? "").trim();
    const payment = (url.searchParams.get("payment") ?? "").trim();
    const reviewOnly = url.searchParams.get("review") === "1";
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 100) || 100, 500);
    const offset = Math.max(Number(url.searchParams.get("offset") ?? 0) || 0, 0);

    let query = db
      .from("accounts_clients")
      .select("*", { count: "exact" })
      .order("name", { ascending: true })
      .range(offset, offset + limit - 1);

    if (search) {
      // Name is what people search by; contact and PPPoE username are how support
      // and the technicians refer to the same client.
      const term = `%${search.replace(/[%_]/g, "")}%`;
      query = query.or(
        `name.ilike.${term},contact_name.ilike.${term},email.ilike.${term},pppoe_username.ilike.${term}`
      );
    }
    if (status && status !== "all") query = query.eq("billing_status", status);
    if (owner && owner !== "all") {
      query = owner === "none" ? query.is("accounts_owner", null) : query.eq("accounts_owner", owner);
    }
    if (debitDay && debitDay !== "all") {
      query = debitDay === "none"
        ? query.is("debit_order_day", null)
        : query.eq("debit_order_day", Number(debitDay));
    }
    if (payment && payment !== "all") query = query.eq("payment_method", payment);
    if (reviewOnly) query = query.eq("needs_review", true);

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    const { data: imports } = await db
      .from("accounts_client_imports")
      .select("id, source_filename, created_at, rows_read, clients_created, clients_updated")
      .order("created_at", { ascending: false })
      .limit(5);

    return NextResponse.json(
      {
        clients: ((data ?? []) as ClientRow[]).map(toRecord),
        total: count ?? 0,
        offset,
        limit,
        imports: imports ?? [],
        canEdit: can(user, "accounts", "edit"),
      },
      noStore
    );
  } catch (e) {
    return fail(e, 500, MIGRATION_HINT);
  }
}

/* ------------------------------------------------------------------ *
 * POST — import
 * ------------------------------------------------------------------ */

async function handleImport(request: Request, userId: string) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `That file is ${(file.size / 1e6).toFixed(1)}MB; the limit is 25MB.` },
      { status: 400 }
    );
  }

  const dryRun = String(form.get("dryRun") ?? "") === "1";
  const buffer = await file.arrayBuffer();

  const { clients, summary } = await parseClientExport(buffer, file.name);
  if (!clients.length) {
    return NextResponse.json(
      { error: "No client rows were found in that file." },
      { status: 400 }
    );
  }

  // A preview run parses and reports but writes nothing, so the department can see
  // what an import would do to 5 400 live records before it does it.
  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      summary,
      sample: clients.slice(0, 25),
    });
  }

  const db = adminClient();

  // Which names already exist decides created-vs-updated, and keeps a re-import
  // updating in place instead of duplicating the book. Fetched in one pass rather
  // than per row. The explicit order matters: without it Postgres gives no stable
  // row order across `range()` calls, so a page could repeat or skip clients.
  const existing = new Map<string, string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("accounts_clients")
      .select("id, name")
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as { id: string; name: string }[]) {
      existing.set(row.name.toLowerCase(), row.id);
    }
    if (!data || data.length < 1000) break;
  }

  const importId = newId("aci");
  const now = new Date().toISOString();

  let created = 0;
  let updated = 0;
  const rows = clients.map((c) => {
    const key = c.name.toLowerCase();
    const id = existing.get(key);
    if (id) updated += 1;
    else created += 1;
    return {
      id: id ?? newId("acl"),
      name: c.name,
      staff_raw: c.staffRaw,
      billing_status: c.billingStatus,
      debit_order_day: c.debitOrderDay,
      accounts_owner: c.accountsOwner,
      seasonal: c.seasonal,
      contact_name: c.contactName,
      tel: c.tel,
      mobile: c.mobile,
      email: c.email,
      emails: c.emails,
      email_raw: c.emailRaw,
      sales_rep: c.salesRep,
      pppoe_username: c.pppoeUsername,
      package_raw: c.packageRaw,
      package_speed_mbps: c.packageSpeedMbps,
      package_price_incl: c.packagePriceIncl,
      balance: c.balance,
      balance_as_at: now,
      needs_review: c.issues.length > 0,
      issues: c.issues,
      import_id: importId,
      updated_at: now,
    };
  });

  const { error: importErr } = await db.from("accounts_client_imports").insert({
    id: importId,
    source_filename: file.name,
    rows_read: summary.rowsRead,
    clients_created: created,
    clients_updated: updated,
    billable_count: summary.billable,
    needs_review_count: rows.filter((r) => r.needs_review).length,
    total_owing: summary.totalOwing,
    total_credit: summary.totalCredit,
    summary,
    imported_by: userId,
    created_at: now,
  });
  if (importErr) throw new Error(importErr.message);

  // Upsert on the name index so a re-import updates in place and never duplicates.
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    const { error } = await db
      .from("accounts_clients")
      .upsert(chunk, { onConflict: "id", ignoreDuplicates: false });
    if (error) {
      throw new Error(
        `${error.message} (failed on rows ${i + 1}–${i + chunk.length} of ${rows.length})`
      );
    }
  }

  return NextResponse.json({
    ok: true,
    importId,
    created,
    updated,
    summary,
  });
}

/* ------------------------------------------------------------------ *
 * POST — edits
 * ------------------------------------------------------------------ */

/**
 * Fields a person may correct by hand.
 *
 * `nullable` is not cosmetic: the text columns are NOT NULL with a '' default, so
 * clearing one has to write '' rather than null. Blanking a client's phone number
 * must not fail the whole save on a constraint violation.
 */
const EDITABLE: Record<string, { column: string; nullable: boolean }> = {
  billingStatus: { column: "billing_status", nullable: false },
  debitOrderDay: { column: "debit_order_day", nullable: true },
  accountsOwner: { column: "accounts_owner", nullable: true },
  seasonal: { column: "seasonal", nullable: false },
  contactName: { column: "contact_name", nullable: false },
  tel: { column: "tel", nullable: false },
  mobile: { column: "mobile", nullable: false },
  email: { column: "email", nullable: false },
  packagePriceIncl: { column: "package_price_incl", nullable: true },
  packageSpeedMbps: { column: "package_speed_mbps", nullable: true },
  paymentMethod: { column: "payment_method", nullable: false },
  billingNote: { column: "billing_note", nullable: false },
  leadId: { column: "lead_id", nullable: true },
  needsReview: { column: "needs_review", nullable: false },
};

export async function POST(request: Request) {
  const user = await requireAccess(request, "accounts", "edit");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const contentType = request.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("multipart/form-data")) {
      return await handleImport(request, user.id);
    }

    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");
    const db = adminClient();

    if (action === "update") {
      const id = String(body.id ?? "");
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

      const patch: Record<string, unknown> = {};
      for (const [field, { column, nullable }] of Object.entries(EDITABLE)) {
        if (!(field in body)) continue;
        const value = body[field];
        patch[column] = value === "" && nullable ? null : value;
      }
      if (!Object.keys(patch).length) {
        return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
      }

      // A hand-corrected row has been looked at, so it leaves the review queue unless
      // the caller is explicitly setting that flag.
      if (!("needsReview" in body)) {
        patch.needs_review = false;
        patch.issues = [];
      }

      const { data, error } = await db
        .from("accounts_clients")
        .update(patch)
        .eq("id", id)
        .select("*")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return NextResponse.json({ error: "Client not found" }, { status: 404 });

      return NextResponse.json({ ok: true, client: toRecord(data as ClientRow) });
    }

    /**
     * Set a status and/or a payment method across a selection.
     *
     * Marking a few hundred clients "quote only" or "cash" one dialog at a time is
     * not work anybody will finish, so both fields are settable in bulk and either
     * may be omitted — sending only `paymentMethod` leaves the statuses alone.
     */
    if (action === "bulk_status") {
      const ids = Array.isArray(body.ids) ? (body.ids as string[]) : [];
      const status = String(body.billingStatus ?? "");
      const method = String(body.paymentMethod ?? "");
      if (!ids.length) {
        return NextResponse.json({ error: "ids required" }, { status: 400 });
      }
      if (!status && !method) {
        return NextResponse.json(
          { error: "billingStatus or paymentMethod required" },
          { status: 400 }
        );
      }

      const patch: Record<string, unknown> = { needs_review: false, issues: [] };
      if (status) patch.billing_status = status;
      if (method) patch.payment_method = method;

      const { error } = await db.from("accounts_clients").update(patch).in("id", ids);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, updated: ids.length });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (e) {
    return fail(e, 500, MIGRATION_HINT);
  }
}
