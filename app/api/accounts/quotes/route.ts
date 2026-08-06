import { NextResponse } from "next/server";
import { requireAccess } from "@/lib/supabase/server-auth";
import { can } from "@/lib/access";
import { adminClient, errorMessage, newId } from "@/lib/api/route-helpers";
import { loadClient, loadLogo, loadSettings } from "@/lib/accounts/documents";
import { renderInvoicePdf, type InvoiceLineInput } from "@/lib/accounts/invoice-pdf";
import { sendClientMail } from "@/lib/accounts/mailer";
import { round2 } from "@/lib/accounts/constants";

/**
 * Quotes — the record 060 deliberately didn't build, built (migration 068).
 *
 * GET                 -> { quotes, canEdit } (newest first)
 * GET ?id=<quote>     -> { quote, lines, canEdit }
 * GET ?id=<q>&pdf=1   -> the quotation PDF itself (inline)
 * POST {action}       -> create / update / send / setStatus / convert / delete
 *
 * A quote reuses the invoice machinery on purpose: the same PDF layout with a
 * QUOTATION heading, the same clerk send-as identity, and on conversion the
 * same numbering, ledger posting and line shape — a converted quote IS an
 * invoice (kind='project'), so it lands in ageing and statements like any
 * other billing.
 *
 * Guarded at accounts/view for reads, accounts/edit for writes. Untyped admin
 * client — the generated types predate 068.
 */

export const runtime = "nodejs";

const MIGRATION_HINT = "run supabase/migrations/068_accounts_quotes.sql in Supabase.";

const noStore = { headers: { "Cache-Control": "no-store, max-age=0" } };

const withHint = (message: string) =>
  /does not exist|schema cache/i.test(message) ? `${message} — ${MIGRATION_HINT}` : message;

interface LineInput {
  description?: string;
  qty?: number;
  unitPriceIncl?: number;
  discountPct?: number;
}

interface Body {
  action?: string;
  quoteId?: string;
  clientId?: string | null;
  clientName?: string;
  clientEmail?: string;
  projectId?: string | null;
  leadId?: string | null;
  validUntil?: string | null;
  notes?: string;
  lines?: LineInput[];
  status?: string;
  subject?: string;
  body?: string;
}

/** Line + totals maths, shared by create and update. */
function computeLines(inputs: LineInput[], vatPct: number) {
  const lines = inputs
    .filter((l) => (l.description ?? "").trim() && Number(l.qty ?? 0) > 0)
    .map((l, index) => {
      const qty = Number(l.qty ?? 1);
      const unitPriceIncl = round2(Number(l.unitPriceIncl ?? 0));
      const discountPct = Math.min(100, Math.max(0, Number(l.discountPct ?? 0)));
      const totalIncl = round2(qty * unitPriceIncl * (1 - discountPct / 100));
      const totalExcl = round2(totalIncl / (1 + vatPct / 100));
      return {
        line_index: index,
        code: "",
        description: (l.description ?? "").trim(),
        qty,
        unit_price_incl: unitPriceIncl,
        discount_pct: discountPct,
        vat_pct: vatPct,
        total_excl: totalExcl,
        total_incl: totalIncl,
      };
    });
  const totalIncl = round2(lines.reduce((s, l) => s + l.total_incl, 0));
  const totalExcl = round2(lines.reduce((s, l) => s + l.total_excl, 0));
  return { lines, totalIncl, totalExcl, totalVat: round2(totalIncl - totalExcl) };
}

async function loadQuote(db: ReturnType<typeof adminClient>, quoteId: string) {
  const { data: quote, error } = await db
    .from("accounts_quotes")
    .select("*")
    .eq("id", quoteId)
    .maybeSingle();
  if (error) throw new Error(withHint(error.message));
  return quote as Record<string, unknown> | null;
}

async function buildQuotePdf(
  db: ReturnType<typeof adminClient>,
  quote: Record<string, unknown>
) {
  const settings = await loadSettings(db);
  const { data: lineRows, error } = await db
    .from("accounts_quote_lines")
    .select("*")
    .eq("quote_id", quote.id as string)
    .order("line_index");
  if (error) throw new Error(withHint(error.message));

  const lines: InvoiceLineInput[] = (lineRows ?? []).map((l) => ({
    code: (l.code as string) ?? "",
    description: (l.description as string) ?? "",
    qty: Number(l.qty ?? 1),
    unitPriceIncl: Number(l.unit_price_incl ?? 0),
    discountPct: Number(l.discount_pct ?? 0),
    vatPct: Number(l.vat_pct ?? settings.vatPct),
    totalExcl: Number(l.total_excl ?? 0),
    totalIncl: Number(l.total_incl ?? 0),
  }));

  const quoteDate = quote.quote_date ? new Date(String(quote.quote_date)) : new Date();
  const validUntil = quote.valid_until
    ? new Date(String(quote.valid_until))
    : new Date(quoteDate.getTime() + 14 * 24 * 60 * 60 * 1000);

  const pdf = await renderInvoicePdf({
    invoiceNumber: quote.quote_number as string,
    reference: (quote.client_name as string) ?? "",
    invoiceDate: quoteDate,
    dueDate: validUntil,
    salesRep: (quote.accounts_owner as string) || "",
    clientName: (quote.client_name as string) ?? "",
    lines,
    totalExcl: Number(quote.total_excl ?? 0),
    totalVat: Number(quote.total_vat ?? 0),
    totalIncl: Number(quote.total_incl ?? 0),
    company: settings.company,
    logo: await loadLogo(),
    documentTitle: "QUOTATION",
    dueDateLabel: "VALID UNTIL:",
  });
  return { pdf, filename: `Quotation - ${quote.quote_number}.pdf` };
}

export async function GET(request: Request) {
  const user = await requireAccess(request, "accounts", "view");
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const db = adminClient();
    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (id) {
      const quote = await loadQuote(db, id);
      if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 });

      if (url.searchParams.get("pdf")) {
        const { pdf, filename } = await buildQuotePdf(db, quote);
        return new NextResponse(Buffer.from(pdf), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="${filename}"`,
            "Cache-Control": "no-store, max-age=0",
          },
        });
      }

      const { data: lines } = await db
        .from("accounts_quote_lines")
        .select("*")
        .eq("quote_id", id)
        .order("line_index");
      return NextResponse.json(
        { quote, lines: lines ?? [], canEdit: can(user, "accounts", "edit") },
        noStore
      );
    }

    const { data: quotes, error } = await db
      .from("accounts_quotes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(withHint(error.message));

    return NextResponse.json(
      { quotes: quotes ?? [], canEdit: can(user, "accounts", "edit") },
      noStore
    );
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await requireAccess(request, "accounts", "edit");
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const db = adminClient();
    const body = (await request.json()) as Body;
    const action = String(body.action ?? "");
    const now = new Date().toISOString();

    switch (action) {
      case "create": {
        const clientId = body.clientId || null;
        let clientName = (body.clientName ?? "").trim();
        let clientEmail = (body.clientEmail ?? "").trim();
        let accountsOwner = "";
        if (clientId) {
          const client = await loadClient(db, clientId);
          if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
          clientName = clientName || client.name;
          clientEmail = clientEmail || client.email;
          accountsOwner = client.accounts_owner ?? "";
        }
        if (!clientName) {
          return NextResponse.json(
            { error: "Pick a client or type who the quote is for" },
            { status: 400 }
          );
        }

        const settings = await loadSettings(db);
        const computed = computeLines(body.lines ?? [], settings.vatPct);
        if (computed.lines.length === 0) {
          return NextResponse.json(
            { error: "A quote needs at least one line with a description and quantity" },
            { status: 400 }
          );
        }

        const { data: numberRow, error: numberError } = await db.rpc(
          "next_accounts_quote_number"
        );
        if (numberError) throw new Error(withHint(numberError.message));

        const id = newId("aqt");
        const { error: insertError } = await db.from("accounts_quotes").insert({
          id,
          quote_number: (numberRow as string) ?? id.toUpperCase(),
          client_id: clientId,
          client_name: clientName,
          client_email: clientEmail,
          project_id: body.projectId || null,
          lead_id: body.leadId || null,
          valid_until: body.validUntil || null,
          total_excl: computed.totalExcl,
          total_vat: computed.totalVat,
          total_incl: computed.totalIncl,
          status: "draft",
          accounts_owner: accountsOwner,
          notes: body.notes?.trim() ?? "",
          created_by: user.id,
        });
        if (insertError) throw new Error(withHint(insertError.message));

        const { error: linesError } = await db.from("accounts_quote_lines").insert(
          computed.lines.map((l) => ({ id: newId("aql"), quote_id: id, ...l }))
        );
        if (linesError) throw new Error(withHint(linesError.message));

        return NextResponse.json({ ok: true, id });
      }

      case "update": {
        if (!body.quoteId) return NextResponse.json({ error: "quoteId required" }, { status: 400 });
        const quote = await loadQuote(db, body.quoteId);
        if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
        if (quote.invoice_id) {
          return NextResponse.json(
            { error: "This quote was converted to an invoice and is read-only" },
            { status: 400 }
          );
        }

        const patch: Record<string, unknown> = {};
        if (body.validUntil !== undefined) patch.valid_until = body.validUntil || null;
        if (body.notes !== undefined) patch.notes = body.notes.trim();
        if (body.projectId !== undefined) patch.project_id = body.projectId || null;
        if (body.clientId !== undefined) {
          patch.client_id = body.clientId || null;
          if (body.clientId) {
            const client = await loadClient(db, body.clientId);
            if (client) {
              patch.client_name = client.name;
              patch.client_email = client.email;
              patch.accounts_owner = client.accounts_owner ?? "";
            }
          }
        }

        if (body.lines) {
          const settings = await loadSettings(db);
          const computed = computeLines(body.lines, settings.vatPct);
          if (computed.lines.length === 0) {
            return NextResponse.json(
              { error: "A quote needs at least one line" },
              { status: 400 }
            );
          }
          await db.from("accounts_quote_lines").delete().eq("quote_id", body.quoteId);
          const { error: linesError } = await db.from("accounts_quote_lines").insert(
            computed.lines.map((l) => ({ id: newId("aql"), quote_id: body.quoteId, ...l }))
          );
          if (linesError) throw new Error(withHint(linesError.message));
          patch.total_excl = computed.totalExcl;
          patch.total_vat = computed.totalVat;
          patch.total_incl = computed.totalIncl;
        }

        const { error } = await db
          .from("accounts_quotes")
          .update(patch)
          .eq("id", body.quoteId);
        if (error) throw new Error(withHint(error.message));
        return NextResponse.json({ ok: true });
      }

      case "send": {
        if (!body.quoteId) return NextResponse.json({ error: "quoteId required" }, { status: 400 });
        const quote = await loadQuote(db, body.quoteId);
        if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
        const to = (quote.client_email as string) || "";
        if (!to) {
          return NextResponse.json(
            { error: "The quote has no email address to send to" },
            { status: 400 }
          );
        }

        const { pdf, filename } = await buildQuotePdf(db, quote);

        // Same clerk send-as identity the invoice path uses.
        let senderName = "MEGS Waterberg";
        let senderEmail = "";
        let canSendAs = false;
        const ownerKey = (quote.accounts_owner as string) || "";
        if (ownerKey) {
          const { data: clerk } = await db
            .from("accounts_staff")
            .select("display_name, email, can_send_as")
            .ilike("owner_key", ownerKey)
            .maybeSingle();
          if (clerk) {
            senderName = (clerk.display_name as string) || ownerKey;
            senderEmail = (clerk.email as string) || "";
            canSendAs = Boolean(clerk.can_send_as);
          }
        }

        const result = await sendClientMail({
          to,
          subject: body.subject?.trim() || `Quotation ${quote.quote_number} — MEGS Waterberg`,
          body:
            body.body?.trim() ||
            `Good day ${quote.client_name}\n\nPlease find our quotation ${quote.quote_number} attached. It is valid until ${quote.valid_until ?? "further notice"}.\n\nKind regards\n${senderName}`,
          senderName,
          senderEmail,
          canSendAs,
          attachments: [{ filename, content: pdf }],
        });

        if (!result.ok) {
          await db
            .from("accounts_quotes")
            .update({ send_error: result.error ?? "Send failed" })
            .eq("id", body.quoteId);
          return NextResponse.json({ error: result.error ?? "Send failed" }, { status: 502 });
        }

        const { error } = await db
          .from("accounts_quotes")
          .update({
            status: quote.status === "draft" ? "sent" : quote.status,
            sent_at: now,
            sent_to: to,
            send_error: "",
          })
          .eq("id", body.quoteId);
        if (error) throw new Error(withHint(error.message));
        return NextResponse.json({ ok: true, sentTo: to });
      }

      case "setStatus": {
        if (!body.quoteId || !body.status) {
          return NextResponse.json({ error: "quoteId and status required" }, { status: 400 });
        }
        const allowed = ["draft", "sent", "accepted", "declined", "expired"];
        if (!allowed.includes(body.status)) {
          return NextResponse.json({ error: "Invalid status" }, { status: 400 });
        }
        const quote = await loadQuote(db, body.quoteId);
        if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
        if (quote.invoice_id) {
          return NextResponse.json(
            { error: "This quote was converted to an invoice and is read-only" },
            { status: 400 }
          );
        }
        const patch: Record<string, unknown> = { status: body.status };
        if (body.status === "accepted") patch.accepted_at = now;
        if (body.status === "declined") patch.declined_at = now;
        const { error } = await db
          .from("accounts_quotes")
          .update(patch)
          .eq("id", body.quoteId);
        if (error) throw new Error(withHint(error.message));
        return NextResponse.json({ ok: true });
      }

      case "convert": {
        if (!body.quoteId) return NextResponse.json({ error: "quoteId required" }, { status: 400 });
        const quote = await loadQuote(db, body.quoteId);
        if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
        if (quote.invoice_id) {
          return NextResponse.json(
            { error: "Already converted — the invoice is the billing record now" },
            { status: 400 }
          );
        }
        if (!quote.client_id) {
          return NextResponse.json(
            {
              error:
                "Link this quote to a client on the book first — invoices need a real client account",
            },
            { status: 400 }
          );
        }
        const client = await loadClient(db, quote.client_id as string);
        if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

        const settings = await loadSettings(db);
        const { data: numberRow, error: numberError } = await db.rpc(
          "next_accounts_invoice_number"
        );
        if (numberError) throw new Error(numberError.message);
        const invoiceNumber = (numberRow as string) ?? "";

        const invoiceDate = new Date();
        const dueDate = new Date(
          invoiceDate.getTime() + settings.termsDays * 24 * 60 * 60 * 1000
        );
        const isoDay = (d: Date) => d.toISOString().slice(0, 10);

        const invoiceId = newId("ainv");
        const { error: invoiceError } = await db.from("accounts_invoices").insert({
          id: invoiceId,
          invoice_number: invoiceNumber,
          client_id: client.id,
          client_name: client.name,
          client_email: client.email ?? "",
          kind: "project",
          billing_period: null,
          project_id: quote.project_id ?? null,
          quote_id: quote.id,
          invoice_date: isoDay(invoiceDate),
          due_date: isoDay(dueDate),
          total_excl: Number(quote.total_excl ?? 0),
          total_vat: Number(quote.total_vat ?? 0),
          total_incl: Number(quote.total_incl ?? 0),
          status: "issued",
          accounts_owner: client.accounts_owner ?? "",
          created_by: user.id,
        });
        if (invoiceError) {
          // The partial unique index on quote_id (068) is the real guard against
          // two clicks billing twice; the read above only catches the slow case.
          if (/accounts_invoices_quote_key|duplicate key/i.test(invoiceError.message)) {
            return NextResponse.json(
              { error: "This quote has already been converted to an invoice" },
              { status: 409 }
            );
          }
          throw new Error(withHint(invoiceError.message));
        }

        const { data: quoteLines } = await db
          .from("accounts_quote_lines")
          .select("*")
          .eq("quote_id", quote.id as string)
          .order("line_index");
        if (quoteLines?.length) {
          const { error: linesError } = await db.from("accounts_invoice_lines").insert(
            quoteLines.map((l) => ({
              id: newId("ainl"),
              invoice_id: invoiceId,
              line_index: l.line_index,
              code: l.code,
              description: l.description,
              qty: l.qty,
              unit_price_incl: l.unit_price_incl,
              discount_pct: l.discount_pct,
              vat_pct: l.vat_pct,
              total_excl: l.total_excl,
              total_incl: l.total_incl,
            }))
          );
          if (linesError) throw new Error(linesError.message);
        }

        // Post to the AR ledger exactly like issueInvoice does.
        const { error: txnError } = await db.from("accounts_transactions").insert({
          id: newId("atx"),
          client_id: client.id,
          txn_date: isoDay(invoiceDate),
          reference: invoiceNumber,
          txn_type: "invoice",
          description: `${client.name} — quote ${quote.quote_number}`,
          debit: Number(quote.total_incl ?? 0),
          credit: 0,
          invoice_id: invoiceId,
          source: "app",
          created_by: user.id,
        });
        if (txnError) throw new Error(txnError.message);

        const { error: quoteError } = await db
          .from("accounts_quotes")
          .update({
            invoice_id: invoiceId,
            status: "accepted",
            accepted_at: (quote.accepted_at as string | null) ?? now,
          })
          .eq("id", quote.id as string);
        if (quoteError) throw new Error(withHint(quoteError.message));

        return NextResponse.json({ ok: true, invoiceId, invoiceNumber });
      }

      case "delete": {
        if (!body.quoteId) return NextResponse.json({ error: "quoteId required" }, { status: 400 });
        const quote = await loadQuote(db, body.quoteId);
        if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
        if (quote.status !== "draft") {
          return NextResponse.json(
            { error: "Only draft quotes can be deleted — decline or expire the rest" },
            { status: 400 }
          );
        }
        const { error } = await db.from("accounts_quotes").delete().eq("id", body.quoteId);
        if (error) throw new Error(withHint(error.message));
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
