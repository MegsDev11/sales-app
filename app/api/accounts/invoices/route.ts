import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAccess } from "@/lib/supabase/server-auth";
import { can } from "@/lib/access";
import {
  buildInvoiceDocument,
  buildStatementDocument,
  loadClient,
  loadSettings,
  type ClientRow,
  type AccountsSettings,
} from "@/lib/accounts/documents";
import {
  bodyForClient,
  renderTemplate,
  periodStart,
  periodLabel,
  MERGE_FIELDS,
} from "@/lib/accounts/invoicing";
import { money } from "@/lib/accounts/pdf-layout";
import { shortDate } from "@/lib/accounts/pdf-layout";
import { isBillable, type BillingStatus, type PaymentMethod } from "@/lib/accounts/constants";
import { mailerStatus, sendClientMail, verifyMailer } from "@/lib/accounts/mailer";
import { adminClient, errorMessage, newId, withHint } from "@/lib/api/route-helpers";

/**
 * Issuing and sending client invoices.
 *
 * GET                      -> mailer status, the letter template, merge fields
 * POST {action:"preview"}  -> the exact letter and attachments for one client, sends nothing
 * POST {action:"issue"}    -> allocate a number, record the invoice, post it to the ledger
 * POST {action:"send"}     -> issue if needed, then email it
 * POST {action:"verify"}   -> prove the SMTP credentials work, sends nothing
 *
 * THREE RULES THIS ROUTE ENFORCES, EACH LEARNED FROM HOW BILLING GOES WRONG:
 *
 * 1. Only a BILLABLE client is ever invoiced. A cancelled or quote-only account is
 *    refused outright, not merely hidden from the run.
 * 2. One invoice per client per month, guaranteed by a unique index rather than by
 *    the caller remembering. A re-run reuses the existing invoice and its number
 *    instead of billing the client twice.
 * 3. A number is only taken from the sequence when an invoice is actually recorded.
 *    Previews print `PREVIEW`, so looking at a document never leaves a hole in the
 *    books.
 *
 * Reads need accounts/view; issuing and sending need accounts/edit.
 */

export const runtime = "nodejs";

const MIGRATION_HINT =
  "run supabase/migrations/052…054 in Supabase (payment method, invoicing, transactions).";

const num = (value: unknown, fallback = 0): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/* ------------------------------------------------------------------ *
 * Template and clerk
 * ------------------------------------------------------------------ */

interface Template {
  id: string;
  subject: string;
  body: string;
  bodyDebitOrder: string;
}

const FALLBACK_TEMPLATE: Template = {
  id: "aet-default",
  subject: "Customer Transactions Report",
  body:
    "Dear Valued Megs Client,\n\n" +
    "We as a company would like to thank you for your loyal support and payments, we appreciate your business.\n\n" +
    "Kindly find attached your monthly Transaction Report and Invoices for your account.\n\n" +
    "Would you please be so kind as to revert payment at your earliest convenience and provide me with a POP.\n\n" +
    "Your assistance would be greatly appreciated.\n\n" +
    "Feel free to contact me should you have queries.\n\n" +
    "Warm Regards\n{{accounts_owner}}\nMEGS Waterberg",
  bodyDebitOrder: "",
};

async function loadTemplate(db: SupabaseClient, id?: string): Promise<Template> {
  const query = db.from("accounts_email_templates").select("*");
  const { data } = id
    ? await query.eq("id", id).maybeSingle()
    : await query.eq("is_default", true).maybeSingle();
  const row = data as Record<string, unknown> | null;
  if (!row) return FALLBACK_TEMPLATE;
  return {
    id: String(row.id),
    subject: String(row.subject ?? FALLBACK_TEMPLATE.subject),
    body: String(row.body ?? FALLBACK_TEMPLATE.body),
    bodyDebitOrder: String(row.body_debit_order ?? ""),
  };
}

interface Clerk {
  displayName: string;
  email: string;
  canSendAs: boolean;
}

/** The clerk who owns this client, or a neutral sender when nobody is assigned. */
async function loadClerk(db: SupabaseClient, ownerKey: string | null): Promise<Clerk> {
  if (!ownerKey) return { displayName: "MEGS Waterberg", email: "", canSendAs: false };
  const { data } = await db
    .from("accounts_staff")
    .select("display_name, email, can_send_as")
    .ilike("owner_key", ownerKey)
    .maybeSingle();
  const row = data as Record<string, unknown> | null;
  if (!row) return { displayName: ownerKey, email: "", canSendAs: false };
  return {
    displayName: String(row.display_name ?? ownerKey),
    email: String(row.email ?? ""),
    canSendAs: !!row.can_send_as,
  };
}

/* ------------------------------------------------------------------ *
 * Composing one client's mail
 * ------------------------------------------------------------------ */

const ordinal = (day: number) => {
  const suffix = day === 1 || day === 21 || day === 31 ? "st"
    : day === 2 || day === 22 ? "nd"
    : day === 3 || day === 23 ? "rd"
    : "th";
  return `${day}${suffix}`;
};

interface Composed {
  subject: string;
  body: string;
  to: string;
  clerk: Clerk;
}

function compose(
  client: ClientRow,
  template: Template,
  clerk: Clerk,
  facts: { invoiceNumber: string; invoiceTotal: number; balanceDue: number; period: Date; dueDate: Date }
): Composed {
  const method = (client.payment_method ?? "unknown") as PaymentMethod;
  const ctx = {
    clientName: client.name,
    contactName: client.contact_name || client.name,
    accountsOwner: clerk.displayName,
    invoiceNumber: facts.invoiceNumber,
    invoiceTotal: money(facts.invoiceTotal),
    balanceDue: money(facts.balanceDue),
    period: periodLabel(facts.period),
    debitOrderDay: client.debit_order_day ? ordinal(client.debit_order_day) : "",
    dueDate: shortDate(facts.dueDate),
  };

  return {
    subject: renderTemplate(template.subject, ctx),
    // Debit-order clients get the variant that doesn't ask them to pay again.
    body: renderTemplate(bodyForClient(template, method), ctx),
    to: client.email ?? "",
    clerk,
  };
}

/** Refuse anything that must not be billed, with the reason a person can act on. */
function assertBillable(client: ClientRow) {
  const status = (client.billing_status ?? "unclassified") as BillingStatus;
  if (!isBillable(status)) {
    throw new Error(
      `${client.name} is not a billable account (status: ${status}). ` +
        "Change the account status if this client should be invoiced."
    );
  }
}

/* ------------------------------------------------------------------ *
 * Issuing
 * ------------------------------------------------------------------ */

interface IssuedInvoice {
  id: string;
  invoiceNumber: string;
  totalIncl: number;
  invoiceDate: Date;
  dueDate: Date;
  reused: boolean;
}

/**
 * Record an invoice for a client's billing month, or return the one already there.
 *
 * The reuse path is what makes a re-run safe. A month's job may be interrupted
 * halfway and started again; without this, the second attempt would raise a second
 * invoice for every client already done.
 */
async function issueInvoice(
  db: SupabaseClient,
  client: ClientRow,
  settings: AccountsSettings,
  period: Date,
  userId: string
): Promise<IssuedInvoice> {
  assertBillable(client);

  const { data: existing, error: existingErr } = await db
    .from("accounts_invoices")
    .select("id, invoice_number, total_incl, invoice_date, due_date")
    .eq("client_id", client.id)
    .eq("billing_period", isoDay(period))
    .maybeSingle();
  if (existingErr) throw new Error(existingErr.message);

  if (existing) {
    const row = existing as Record<string, unknown>;
    return {
      id: String(row.id),
      invoiceNumber: String(row.invoice_number),
      totalIncl: num(row.total_incl),
      invoiceDate: new Date(`${String(row.invoice_date)}T00:00:00Z`),
      dueDate: new Date(`${String(row.due_date)}T00:00:00Z`),
      reused: true,
    };
  }

  // Only now is a number taken from the sequence.
  const { data: numberData, error: numberErr } = await db.rpc("next_accounts_invoice_number");
  if (numberErr) throw new Error(numberErr.message);
  const invoiceNumber = String(numberData);

  const built = await buildInvoiceDocument(client, settings, { invoiceNumber });
  const id = newId("ainv");

  const { error: insertErr } = await db.from("accounts_invoices").insert({
    id,
    invoice_number: invoiceNumber,
    client_id: client.id,
    client_name: client.name,
    client_email: client.email ?? "",
    billing_period: isoDay(period),
    invoice_date: isoDay(built.invoiceDate),
    due_date: isoDay(built.dueDate),
    total_excl: built.totalExcl,
    total_vat: built.totalVat,
    total_incl: built.totalIncl,
    status: "issued",
    accounts_owner: client.accounts_owner ?? "",
    created_by: userId,
  });
  if (insertErr) throw new Error(insertErr.message);

  const { error: lineErr } = await db.from("accounts_invoice_lines").insert({
    id: newId("ainl"),
    invoice_id: id,
    line_index: 0,
    code: built.line.code,
    description: built.line.description,
    qty: built.line.qty,
    unit_price_incl: built.line.unitPriceIncl,
    discount_pct: built.line.discountPct,
    vat_pct: built.line.vatPct,
    total_excl: built.line.totalExcl,
    total_incl: built.line.totalIncl,
  });
  if (lineErr) throw new Error(lineErr.message);

  // Post it to the ledger so the next statement shows it. Unique on invoice_id, so a
  // retry cannot double-post.
  const { error: txnErr } = await db.from("accounts_transactions").insert({
    id: newId("atx"),
    client_id: client.id,
    txn_date: isoDay(built.invoiceDate),
    reference: invoiceNumber,
    txn_type: "invoice",
    description: client.name,
    debit: built.totalIncl,
    credit: 0,
    invoice_id: id,
    source: "app",
    created_by: userId,
  });
  if (txnErr) throw new Error(txnErr.message);

  return {
    id,
    invoiceNumber,
    totalIncl: built.totalIncl,
    invoiceDate: built.invoiceDate,
    dueDate: built.dueDate,
    reused: false,
  };
}

/* ------------------------------------------------------------------ *
 * GET
 * ------------------------------------------------------------------ */

export async function GET(request: Request) {
  const user = await requireAccess(request, "accounts", "view");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const db = adminClient();
  try {
    const template = await loadTemplate(db);
    const { data: recent } = await db
      .from("accounts_invoices")
      .select("id, invoice_number, client_name, total_incl, status, sent_at, billing_period")
      .order("created_at", { ascending: false })
      .limit(20);

    return NextResponse.json(
      {
        mailer: mailerStatus(),
        template,
        mergeFields: MERGE_FIELDS,
        recent: recent ?? [],
        canEdit: can(user, "accounts", "edit"),
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (e) {
    return NextResponse.json({ error: withHint(errorMessage(e), MIGRATION_HINT) }, { status: 500 });
  }
}

/* ------------------------------------------------------------------ *
 * POST
 * ------------------------------------------------------------------ */

export async function POST(request: Request) {
  const user = await requireAccess(request, "accounts", "edit");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const db = adminClient();

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");

    // Prove the credentials work without troubling a client.
    if (action === "verify") {
      return NextResponse.json(await verifyMailer());
    }

    const clientId = String(body.clientId ?? "");
    if (!clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 });

    const client = await loadClient(db, clientId);
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

    const settings = await loadSettings(db);
    const template = await loadTemplate(db, body.templateId ? String(body.templateId) : undefined);
    const clerk = await loadClerk(db, client.accounts_owner);
    const period = periodStart(new Date());

    /* ---------- preview: compose everything, send nothing ---------- */
    if (action === "preview") {
      assertBillable(client);
      // Uses PREVIEW rather than allocating a number — see the header.
      const built = await buildInvoiceDocument(client, settings, { invoiceNumber: "PREVIEW" });
      const composed = compose(client, template, clerk, {
        invoiceNumber: "PREVIEW",
        invoiceTotal: built.totalIncl,
        balanceDue: num(client.balance),
        period,
        dueDate: built.dueDate,
      });

      return NextResponse.json({
        ...composed,
        clerk,
        mailer: mailerStatus(),
        attachments: [`Tax Invoice - PREVIEW.pdf`, `Customer Transactions Report - ${client.name}.pdf`],
        paymentMethod: client.payment_method ?? "unknown",
        total: built.totalIncl,
      });
    }

    /* ---------- issue: record it, no email ---------- */
    if (action === "issue") {
      const issued = await issueInvoice(db, client, settings, period, user.id);
      return NextResponse.json({ ok: true, ...issued });
    }

    /* ---------- send: issue if needed, then email ---------- */
    if (action === "send") {
      if (!client.email?.trim()) {
        return NextResponse.json(
          { error: `${client.name} has no email address to send to.` },
          { status: 400 }
        );
      }

      const issued = await issueInvoice(db, client, settings, period, user.id);

      const invoiceDoc = await buildInvoiceDocument(client, settings, {
        invoiceNumber: issued.invoiceNumber,
        invoiceDate: issued.invoiceDate,
      });

      const attachments = [
        { filename: invoiceDoc.filename, content: invoiceDoc.pdf },
      ];

      // The letter promises a Transaction Report, so one is attached whenever the
      // ledger exists. If it doesn't yet, the invoice still goes rather than failing.
      if (body.includeStatement !== false) {
        try {
          const to = new Date();
          const from = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - 1, 1));
          const statement = await buildStatementDocument(db, client, settings, { from, to });
          attachments.push({ filename: statement.filename, content: statement.pdf });
        } catch {
          /* statement unavailable; the invoice still goes out */
        }
      }

      // A clerk may edit the letter before sending; their text wins.
      const composed = compose(client, template, clerk, {
        invoiceNumber: issued.invoiceNumber,
        invoiceTotal: issued.totalIncl,
        balanceDue: num(client.balance),
        period,
        dueDate: issued.dueDate,
      });
      const subject = body.subject ? String(body.subject) : composed.subject;
      const letter = body.body ? String(body.body) : composed.body;

      const result = await sendClientMail({
        to: client.email,
        subject,
        body: letter,
        senderName: clerk.displayName,
        senderEmail: clerk.email,
        canSendAs: clerk.canSendAs,
        attachments,
        cc: body.cc ? String(body.cc) : undefined,
        bcc: body.bcc ? String(body.bcc) : undefined,
      });

      // Record the outcome either way — a failed send must be visible, not silent.
      await db
        .from("accounts_invoices")
        .update(
          result.ok
            ? {
                status: "sent",
                sent_at: new Date().toISOString(),
                sent_to: client.email,
                send_error: "",
              }
            : { status: "failed", send_error: result.error ?? "Send failed" }
        )
        .eq("id", issued.id);

      if (!result.ok) {
        return NextResponse.json(
          { error: result.error, invoiceNumber: issued.invoiceNumber },
          { status: 502 }
        );
      }

      return NextResponse.json({
        ok: true,
        invoiceNumber: issued.invoiceNumber,
        sentTo: client.email,
        attachments: attachments.map((a) => a.filename),
      });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (e) {
    const message = errorMessage(e);
    const status = /has no monthly price|not a billable account|no email address/.test(message)
      ? 400
      : 500;
    return NextResponse.json({ error: withHint(message, MIGRATION_HINT) }, { status });
  }
}
