import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAccess, requireAnyAccess } from "@/lib/supabase/server-auth";
import { can } from "@/lib/access";
import { parseStatement } from "@/lib/financial/parse-statement";
import { adminClient, errorMessage, newId, withHint } from "@/lib/api/route-helpers";
import {
  matchBankLine,
  allocateOldestFirst,
  isAutoPostable,
  type MatchableClient,
  type OpenInvoice,
} from "@/lib/financial/match-payment";

/**
 * Money in: statement import, matching, and receipts.
 *
 * GET  ?view=queue     -> unmatched credits with their suggested clients
 * GET  ?view=receipts  -> recent receipts
 * GET                  -> bank accounts, recent imports, queue size
 * POST multipart       -> import a bank statement (dryRun=1 to preview)
 * POST {action:"match"}   -> turn a bank line into a receipt against a client
 * POST {action:"capture"} -> record a receipt with no bank line (cash at the office)
 * POST {action:"ignore"}  -> mark a line as not client money
 * POST {action:"unmatch"} -> reverse a receipt
 *
 * Reads are open to Financial OR Accounts — a clerk chasing a debtor has to be able
 * to see that they paid. Writes require financial/edit: recording money is Finance's
 * job, and that separation is the segregation of duties the department split exists
 * for.
 *
 * NO TRANSACTIONS ARE AVAILABLE over PostgREST, so a receipt is written in a fixed
 * order and unwound on failure: the receipt row first, then its AR ledger entry, then
 * allocations, then the bank line is flagged. If any step fails the receipt is
 * deleted, which cascades its allocations away. The ordering matters — a receipt with
 * no ledger entry is invisible on a statement, whereas a ledger entry with no receipt
 * is money that appears from nowhere.
 */

export const runtime = "nodejs";

const MIGRATION_HINT =
  "run supabase/migrations/056_financial_payments.sql in Supabase (and 051–055 first).";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const noStore = { headers: { "Cache-Control": "no-store, max-age=0" } };

const num = (v: unknown, d = 0) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : d;
};

const round2 = (v: number) => Math.round(v * 100) / 100;

/* ------------------------------------------------------------------ *
 * Shared loading
 * ------------------------------------------------------------------ */

/**
 * The client list the matcher works against.
 *
 * Loaded whole (id, name, PPPoE only — a few hundred KB for 5 400 clients) because
 * matching is fuzzy and cannot be expressed as a SQL predicate. Doing it in memory
 * once per request beats 200 round trips per statement.
 */
async function loadMatchableClients(db: SupabaseClient): Promise<MatchableClient[]> {
  const out: MatchableClient[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("accounts_clients")
      .select("id, name, pppoe_username, email")
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      out.push({
        id: String(r.id),
        name: String(r.name ?? ""),
        pppoeUsername: String(r.pppoe_username ?? ""),
        email: String(r.email ?? ""),
      });
    }
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Invoices with money still owing, and how much. */
async function loadOpenInvoices(db: SupabaseClient): Promise<OpenInvoice[]> {
  const { data: invoices, error } = await db
    .from("accounts_invoices")
    .select("id, client_id, invoice_number, total_incl, invoice_date")
    .in("status", ["issued", "sent"])
    .order("invoice_date", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = (invoices ?? []) as Record<string, unknown>[];
  if (!rows.length) return [];

  // Subtract what has already been allocated to each.
  const { data: allocs } = await db
    .from("financial_receipt_allocations")
    .select("invoice_id, amount")
    .in("invoice_id", rows.map((r) => String(r.id)));

  const paid = new Map<string, number>();
  for (const a of (allocs ?? []) as Record<string, unknown>[]) {
    const key = String(a.invoice_id);
    paid.set(key, (paid.get(key) ?? 0) + num(a.amount));
  }

  return rows
    .map((r) => ({
      id: String(r.id),
      clientId: String(r.client_id),
      invoiceNumber: String(r.invoice_number ?? ""),
      outstanding: round2(num(r.total_incl) - (paid.get(String(r.id)) ?? 0)),
      invoiceDate: String(r.invoice_date ?? ""),
    }))
    .filter((i) => i.outstanding > 0.005);
}

/* ------------------------------------------------------------------ *
 * GET
 * ------------------------------------------------------------------ */

export async function GET(request: Request) {
  const user = await requireAnyAccess(request, ["financial", "accounts"], "view");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const url = new URL(request.url);
  const view = url.searchParams.get("view") ?? "";
  const db = adminClient();

  try {
    if (view === "queue") {
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 50) || 50, 200);

      const { data: lines, error } = await db
        .from("financial_bank_transactions")
        .select("*")
        .eq("status", "unmatched")
        .gt("amount", 0) // credits only; debits are Phase 2's problem
        .order("txn_date", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);

      const rows = (lines ?? []) as Record<string, unknown>[];
      const [clients, open] = rows.length
        ? await Promise.all([loadMatchableClients(db), loadOpenInvoices(db)])
        : [[], []];

      return NextResponse.json(
        {
          queue: rows.map((r) => {
            const line = {
              description: String(r.description ?? ""),
              reference: String(r.reference ?? ""),
              amount: num(r.amount),
            };
            const candidates = matchBankLine(line, clients, open);
            return {
              id: String(r.id),
              date: String(r.txn_date),
              description: line.description,
              reference: line.reference,
              amount: line.amount,
              candidates,
              // Only a clear winner is offered as a one-click confirm.
              autoPostable: !!candidates[0] && isAutoPostable(candidates[0].confidence),
            };
          }),
          canEdit: can(user, "financial", "edit"),
        },
        noStore
      );
    }

    if (view === "receipts") {
      const { data, error } = await db
        .from("financial_receipts")
        .select("*")
        .order("receipt_date", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      return NextResponse.json({ receipts: data ?? [] }, noStore);
    }

    const [{ data: accounts }, { data: imports }, { count: queueSize }] = await Promise.all([
      db.from("financial_bank_accounts").select("*").eq("active", true).order("name"),
      db
        .from("financial_bank_imports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5),
      db
        .from("financial_bank_transactions")
        .select("id", { count: "exact", head: true })
        .eq("status", "unmatched")
        .gt("amount", 0),
    ]);

    return NextResponse.json(
      {
        accounts: accounts ?? [],
        imports: imports ?? [],
        queueSize: queueSize ?? 0,
        canEdit: can(user, "financial", "edit"),
      },
      noStore
    );
  } catch (e) {
    return NextResponse.json({ error: withHint(errorMessage(e), MIGRATION_HINT) }, { status: 500 });
  }
}

/* ------------------------------------------------------------------ *
 * Import
 * ------------------------------------------------------------------ */

async function handleImport(request: Request, userId: string) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `That file is ${(file.size / 1e6).toFixed(1)}MB; the limit is 15MB.` },
      { status: 400 }
    );
  }

  const bankAccountId = String(form.get("bankAccountId") ?? "fba-main");
  const dryRun = String(form.get("dryRun") ?? "") === "1";
  const { lines, summary } = parseStatement(await file.text(), file.name);

  if (!lines.length) {
    return NextResponse.json(
      { error: "No transactions were found in that file." },
      { status: 400 }
    );
  }

  const db = adminClient();

  // Which of these we already hold. Checked up front so the preview can report
  // honestly how much of the file is a re-import rather than new money.
  const { data: existing } = await db
    .from("financial_bank_transactions")
    .select("fingerprint")
    .eq("bank_account_id", bankAccountId)
    .in("fingerprint", lines.map((l) => l.fingerprint));

  const seen = new Set(
    ((existing ?? []) as { fingerprint: string }[]).map((r) => r.fingerprint)
  );
  const fresh = lines.filter((l) => !seen.has(l.fingerprint));

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      summary,
      wouldImport: fresh.length,
      duplicates: lines.length - fresh.length,
      sample: fresh.slice(0, 20),
    });
  }

  const importId = newId("fbi");
  const { error: importErr } = await db.from("financial_bank_imports").insert({
    id: importId,
    bank_account_id: bankAccountId,
    source_filename: file.name,
    statement_from: summary.dateFrom,
    statement_to: summary.dateTo,
    rows_read: summary.rowsRead,
    rows_imported: fresh.length,
    duplicates_skipped: lines.length - fresh.length,
    summary,
    imported_by: userId,
  });
  if (importErr) throw new Error(importErr.message);

  for (let i = 0; i < fresh.length; i += 500) {
    const chunk = fresh.slice(i, i + 500).map((l) => ({
      id: newId("fbt"),
      bank_account_id: bankAccountId,
      import_id: importId,
      txn_date: l.date,
      description: l.description,
      reference: l.reference,
      amount: l.amount,
      statement_balance: l.balance,
      fingerprint: l.fingerprint,
      status: "unmatched",
    }));
    const { error } = await db.from("financial_bank_transactions").insert(chunk);
    if (error) throw new Error(error.message);
  }

  return NextResponse.json({
    ok: true,
    importId,
    imported: fresh.length,
    duplicates: lines.length - fresh.length,
    summary,
  });
}

/* ------------------------------------------------------------------ *
 * Creating a receipt
 * ------------------------------------------------------------------ */

interface ReceiptInput {
  clientId: string;
  amount: number;
  date: string;
  method: string;
  reference: string;
  notes: string;
  bankTransactionId?: string | null;
}

/**
 * Write a receipt, its AR ledger entry, and its allocations.
 *
 * Unwound on failure — see the module header for why the order is what it is.
 */
async function createReceipt(db: SupabaseClient, input: ReceiptInput, userId: string) {
  const { data: client, error: clientErr } = await db
    .from("accounts_clients")
    .select("id, name")
    .eq("id", input.clientId)
    .maybeSingle();
  if (clientErr) throw new Error(clientErr.message);
  if (!client) throw new Error("Client not found");

  const { data: numberData, error: numberErr } = await db.rpc(
    "next_financial_receipt_number"
  );
  if (numberErr) throw new Error(numberErr.message);
  const receiptNumber = String(numberData);

  const receiptId = newId("rct");
  const { error: receiptErr } = await db.from("financial_receipts").insert({
    id: receiptId,
    receipt_number: receiptNumber,
    client_id: input.clientId,
    receipt_date: input.date,
    amount: input.amount,
    method: input.method,
    reference: input.reference,
    notes: input.notes,
    bank_transaction_id: input.bankTransactionId ?? null,
    captured_by: userId,
  });
  if (receiptErr) throw new Error(receiptErr.message);

  // From here on, undo the receipt if anything fails.
  const undo = async () => {
    await db.from("financial_receipts").delete().eq("id", receiptId);
  };

  try {
    // The AR ledger entry — this is what makes the client's statement true.
    const txnId = newId("atx");
    const { error: txnErr } = await db.from("accounts_transactions").insert({
      id: txnId,
      client_id: input.clientId,
      txn_date: input.date,
      reference: receiptNumber,
      txn_type: "payment",
      description: input.reference || "Payment received",
      debit: 0,
      credit: input.amount,
      source: "app",
      created_by: userId,
    });
    if (txnErr) throw new Error(txnErr.message);

    const { error: linkErr } = await db
      .from("financial_receipts")
      .update({ transaction_id: txnId })
      .eq("id", receiptId);
    if (linkErr) throw new Error(linkErr.message);

    // Settle the client's oldest invoices first.
    const open = (await loadOpenInvoices(db)).filter((i) => i.clientId === input.clientId);
    const { allocations, unallocated } = allocateOldestFirst(input.amount, open);

    if (allocations.length) {
      const { error: allocErr } = await db.from("financial_receipt_allocations").insert(
        allocations.map((a) => ({
          id: newId("rca"),
          receipt_id: receiptId,
          invoice_id: a.invoiceId,
          amount: a.amount,
        }))
      );
      if (allocErr) throw new Error(allocErr.message);
    }

    if (input.bankTransactionId) {
      await db
        .from("financial_bank_transactions")
        .update({ status: "matched" })
        .eq("id", input.bankTransactionId);
    }

    return {
      receiptId,
      receiptNumber,
      clientName: String((client as Record<string, unknown>).name ?? ""),
      allocated: allocations.length,
      unallocated,
    };
  } catch (e) {
    await undo();
    throw e;
  }
}

/* ------------------------------------------------------------------ *
 * POST
 * ------------------------------------------------------------------ */

export async function POST(request: Request) {
  const user = await requireAccess(request, "financial", "edit");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const contentType = request.headers.get("content-type") ?? "";
  const db = adminClient();

  try {
    if (contentType.includes("multipart/form-data")) {
      return await handleImport(request, user.id);
    }

    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");

    if (action === "match") {
      const bankTransactionId = String(body.bankTransactionId ?? "");
      const clientId = String(body.clientId ?? "");
      if (!bankTransactionId || !clientId) {
        return NextResponse.json(
          { error: "bankTransactionId and clientId required" },
          { status: 400 }
        );
      }

      const { data: line, error } = await db
        .from("financial_bank_transactions")
        .select("*")
        .eq("id", bankTransactionId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!line) return NextResponse.json({ error: "Bank line not found" }, { status: 404 });

      const row = line as Record<string, unknown>;
      if (String(row.status) === "matched") {
        return NextResponse.json(
          { error: "That line has already been receipted." },
          { status: 400 }
        );
      }
      const amount = num(row.amount);
      if (amount <= 0) {
        return NextResponse.json(
          { error: "That line is money out, not a client receipt." },
          { status: 400 }
        );
      }

      const result = await createReceipt(
        db,
        {
          clientId,
          amount,
          date: String(row.txn_date),
          method: String(body.method ?? "eft"),
          reference: String(row.reference || row.description || ""),
          notes: String(body.notes ?? ""),
          bankTransactionId,
        },
        user.id
      );
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "capture") {
      const clientId = String(body.clientId ?? "");
      const amount = round2(num(body.amount));
      const date = String(body.date ?? "").slice(0, 10);
      if (!clientId || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return NextResponse.json(
          { error: "clientId, a positive amount and a date (yyyy-mm-dd) are required" },
          { status: 400 }
        );
      }
      const result = await createReceipt(
        db,
        {
          clientId,
          amount,
          date,
          method: String(body.method ?? "cash"),
          reference: String(body.reference ?? ""),
          notes: String(body.notes ?? ""),
        },
        user.id
      );
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "ignore") {
      const id = String(body.bankTransactionId ?? "");
      if (!id) return NextResponse.json({ error: "bankTransactionId required" }, { status: 400 });
      const { error } = await db
        .from("financial_bank_transactions")
        .update({ status: "ignored", ignored_reason: String(body.reason ?? "") })
        .eq("id", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    /**
     * Reverse a receipt.
     *
     * Deletes the receipt (cascading its allocations), removes the ledger entry, and
     * returns the bank line to the queue. A mis-allocated receipt has to be
     * correctable, or the first mistake becomes permanent.
     */
    if (action === "unmatch") {
      const receiptId = String(body.receiptId ?? "");
      if (!receiptId) return NextResponse.json({ error: "receiptId required" }, { status: 400 });

      const { data: receipt, error } = await db
        .from("financial_receipts")
        .select("id, transaction_id, bank_transaction_id")
        .eq("id", receiptId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!receipt) return NextResponse.json({ error: "Receipt not found" }, { status: 404 });

      const r = receipt as Record<string, unknown>;
      if (r.transaction_id) {
        await db.from("accounts_transactions").delete().eq("id", String(r.transaction_id));
      }
      await db.from("financial_receipts").delete().eq("id", receiptId);
      if (r.bank_transaction_id) {
        await db
          .from("financial_bank_transactions")
          .update({ status: "unmatched" })
          .eq("id", String(r.bank_transaction_id));
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: withHint(errorMessage(e), MIGRATION_HINT) }, { status: 500 });
  }
}
