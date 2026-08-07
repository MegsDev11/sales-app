import { NextResponse } from "next/server";
import { requireAnyAccess } from "@/lib/supabase/server-auth";
import { calculateAgeing, type AgeingInvoice } from "@/lib/financial/ageing";
import { adminClient, isMissingSchemaError } from "@/lib/api/route-helpers";

/**
 * Debtor age analysis.
 *
 * GET ?asAt=yyyy-mm-dd&owner=&minDays=&limit=
 *
 * Readable by Accounts OR Financial. It lives under Accounts because that is who acts
 * on it — the clerk who owns the client relationship makes the call — while Finance
 * needs the same numbers for reporting. Neither department can write anything here:
 * ageing is derived entirely from invoices and receipts, so there is nothing to edit.
 *
 * DEGRADES BEFORE PAYMENTS EXIST. The receipts tables arrive with migration 056, but
 * the report is useful the moment invoices and opening balances exist (051–054). If
 * the receipt tables are absent, allocations and credits are treated as zero and the
 * report still answers "who owes what, and how old is it" — it simply cannot yet show
 * anything as paid. Refusing to run at all until every migration is applied would
 * withhold the most useful report in the department for no reason.
 */

export const runtime = "nodejs";

const MIGRATION_HINT =
  "run supabase/migrations/051–054 in Supabase (client book, invoicing, transactions).";

const num = (v: unknown, d = 0) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : d;
};

type PageResult = {
  data: Record<string, unknown>[] | null;
  error: { message: string } | null;
};

/**
 * Fetch every row of a query in pages; the book is thousands of rows.
 *
 * The caller builds the query so filters stay fully typed — the `.order("id")` is
 * theirs to include, and it matters: without a stable sort, `range()` gives no
 * guarantee that pages don't repeat or skip rows.
 */
async function fetchAll(
  build: (from: number, to: number) => PromiseLike<PageResult>
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function GET(request: Request) {
  const user = await requireAnyAccess(request, ["accounts", "financial"], "view");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const url = new URL(request.url);
  const asAtRaw = (url.searchParams.get("asAt") ?? "").trim();
  const asAt = /^\d{4}-\d{2}-\d{2}$/.test(asAtRaw)
    ? new Date(`${asAtRaw}T00:00:00Z`)
    : new Date();
  const owner = (url.searchParams.get("owner") ?? "").trim();
  const minDays = Number(url.searchParams.get("minDays") ?? 0) || 0;
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 200) || 200, 1000);

  const db = adminClient();

  try {
    // --- invoices ---
    const invoiceRows = await fetchAll((from, to) =>
      db
        .from("accounts_invoices")
        .select("id, client_id, invoice_number, invoice_date, total_incl, status")
        .in("status", ["issued", "sent"])
        .order("id")
        .range(from, to)
    );

    // --- allocations and unallocated credits (absent before migration 056) ---
    const allocated = new Map<string, number>();
    const credits = new Map<string, number>();
    let paymentsLive = true;
    try {
      for (const a of await fetchAll((from, to) =>
        db
          .from("financial_receipt_allocations")
          .select("id, invoice_id, amount")
          .order("id")
          .range(from, to)
      )) {
        const key = String(a.invoice_id);
        allocated.set(key, (allocated.get(key) ?? 0) + num(a.amount));
      }

      const receipts = await fetchAll((from, to) =>
        db.from("financial_receipts").select("id, client_id, amount").order("id").range(from, to)
      );
      // A receipt's unallocated remainder is a credit sitting on the account.
      const allocByReceipt = new Map<string, number>();
      for (const a of await fetchAll((from, to) =>
        db
          .from("financial_receipt_allocations")
          .select("id, receipt_id, amount")
          .order("id")
          .range(from, to)
      )) {
        const key = String(a.receipt_id);
        allocByReceipt.set(key, (allocByReceipt.get(key) ?? 0) + num(a.amount));
      }
      for (const r of receipts) {
        const remainder = num(r.amount) - (allocByReceipt.get(String(r.id)) ?? 0);
        if (remainder > 0.005) {
          const key = String(r.client_id);
          credits.set(key, (credits.get(key) ?? 0) + remainder);
        }
      }
    } catch (e) {
      if (!isMissingSchemaError(e instanceof Error ? e.message : "")) throw e;
      paymentsLive = false;
    }

    // --- Sage opening balances ---
    const openingRows = await fetchAll((from, to) =>
      db
        .from("accounts_transactions")
        .select("id, client_id, txn_type, debit, credit")
        .eq("txn_type", "opening")
        .order("id")
        .range(from, to)
    );

    const invoices: AgeingInvoice[] = invoiceRows.map((r) => ({
      id: String(r.id),
      clientId: String(r.client_id),
      invoiceNumber: String(r.invoice_number ?? ""),
      invoiceDate: String(r.invoice_date ?? ""),
      totalIncl: num(r.total_incl),
      allocated: allocated.get(String(r.id)) ?? 0,
    }));

    const { clients, totals } = calculateAgeing({
      asAt,
      invoices,
      openingBalances: openingRows.map((r) => ({
        clientId: String(r.client_id),
        amount: num(r.debit) - num(r.credit),
      })),
      unallocatedCredits: [...credits.entries()].map(([clientId, amount]) => ({
        clientId,
        amount,
      })),
    });

    // --- attach the details a collections call needs ---
    const ids = clients.map((c) => c.clientId);
    const names = new Map<string, Record<string, unknown>>();
    for (let i = 0; i < ids.length; i += 500) {
      const { data } = await db
        .from("accounts_clients")
        .select("id, name, contact_name, email, mobile, tel, accounts_owner, billing_status")
        .in("id", ids.slice(i, i + 500));
      for (const row of (data ?? []) as Record<string, unknown>[]) {
        names.set(String(row.id), row);
      }
    }

    let rows = clients.map((c) => {
      const client = names.get(c.clientId);
      return {
        ...c,
        name: String(client?.name ?? "Unknown client"),
        contactName: String(client?.contact_name ?? ""),
        email: String(client?.email ?? ""),
        phone: String(client?.mobile ?? "") || String(client?.tel ?? ""),
        accountsOwner: (client?.accounts_owner as string | null) ?? null,
        billingStatus: String(client?.billing_status ?? "unclassified"),
      };
    });

    if (owner && owner !== "all") {
      rows = rows.filter((r) =>
        owner === "none" ? !r.accountsOwner : r.accountsOwner === owner
      );
    }
    if (minDays > 0) {
      rows = rows.filter((r) => (r.oldestDays ?? 0) >= minDays);
    }

    return NextResponse.json(
      {
        asAt: asAt.toISOString().slice(0, 10),
        clients: rows.slice(0, limit),
        shown: Math.min(rows.length, limit),
        matched: rows.length,
        totals,
        // Lets the screen say why nothing shows as paid yet.
        paymentsLive,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to build the age analysis";
    return NextResponse.json(
      { error: isMissingSchemaError(message) ? `${message} — ${MIGRATION_HINT}` : message },
      { status: 500 }
    );
  }
}
