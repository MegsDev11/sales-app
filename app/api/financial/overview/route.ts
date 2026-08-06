import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAnyAccess } from "@/lib/supabase/server-auth";
import { adminClient, errorMessage } from "@/lib/api/route-helpers";

/**
 * The financial manager's overview.
 *
 * /financial reported on fuel because fuel was the only real cost feed the
 * system had. Invoicing, receipts and an AR ledger exist now, so this answers
 * the four questions a finance manager actually opens a dashboard for: what
 * did we bill, what did we collect, who owes us, and how much of what we bill
 * is coming back.
 *
 * Every figure is derived from the same tables the statements and age analysis
 * use, so this page and those reports cannot disagree.
 *
 * Reachable by financial OR accounts access — the two are separate modules and
 * either one is a legitimate reason to see the company's money.
 */

export const runtime = "nodejs";

const MONTHS = 6;
const PAGE = 1000;
const MAX_PAGES = 20;

const monthStarts = () => {
  const now = new Date();
  return Array.from(
    { length: MONTHS },
    (_, i) => new Date(now.getFullYear(), now.getMonth() - (MONTHS - 1 - i), 1)
  );
};

const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/** Sums a dated money column into calendar months. Null when the table is absent. */
async function sumByMonth(
  db: SupabaseClient,
  table: string,
  dateColumn: string,
  amountColumn: string,
  since: string,
  excludeDraft = false
): Promise<Map<string, number> | null> {
  const sums = new Map<string, number>();
  for (let page = 0; page < MAX_PAGES; page += 1) {
    let query = db
      .from(table)
      .select(`${dateColumn}, ${amountColumn}`)
      .gte(dateColumn, since)
      .range(page * PAGE, (page + 1) * PAGE - 1);
    if (excludeDraft) query = query.neq("status", "draft");
    const { data, error } = await query;
    if (error) return null;
    for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
      const when = new Date(String(row[dateColumn]));
      if (Number.isNaN(when.getTime())) continue;
      const key = keyOf(new Date(when.getFullYear(), when.getMonth(), 1));
      sums.set(key, (sums.get(key) ?? 0) + Number(row[amountColumn] ?? 0));
    }
    if (!data || data.length < PAGE) break;
  }
  return sums;
}

export async function GET(request: Request) {
  const user = await requireAnyAccess(request, ["financial", "accounts"]);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized — financial or accounts access required" },
      { status: 403 }
    );
  }

  try {
    const db = adminClient();
    const months = monthStarts();
    const since = months[0].toISOString().slice(0, 10);
    const labels = months.map((d) => d.toLocaleDateString("en-ZA", { month: "short" }));
    const keys = months.map(keyOf);

    const [invoicedMap, collectedMap, clientsRes] = await Promise.all([
      sumByMonth(db, "accounts_invoices", "invoice_date", "total_incl", since, true),
      sumByMonth(db, "financial_receipts", "receipt_date", "amount", since),
      db
        .from("accounts_clients")
        .select("id, name, balance, billing_status, accounts_owner, balance_as_at")
        .gt("balance", 0)
        .order("balance", { ascending: false })
        .limit(500),
    ]);

    const billingLive = invoicedMap !== null;
    const invoiced = keys.map((k) => invoicedMap?.get(k) ?? 0);
    const collected = keys.map((k) => collectedMap?.get(k) ?? 0);

    const debtorRows = (clientsRes.data ?? []) as Record<string, unknown>[];
    const debtorsTotal = debtorRows.reduce((sum, c) => sum + Number(c.balance ?? 0), 0);

    // Collection rate over the window: what came back against what went out.
    const invoicedTotal = invoiced.reduce((a, b) => a + b, 0);
    const collectedTotal = collected.reduce((a, b) => a + b, 0);
    const collectionRate =
      invoicedTotal > 0 ? Math.round((collectedTotal / invoicedTotal) * 100) : null;

    // The balance is a Sage snapshot, not a live ledger — 051 says so, and the
    // dashboard must repeat it rather than imply a real-time debtors book.
    const balanceAsAt = debtorRows
      .map((c) => (c.balance_as_at as string | null) ?? null)
      .filter(Boolean)
      .sort()
      .pop() ?? null;

    // Fuel stays on this page: it is a real cost and the only one wired so far.
    const { data: fuelRows } = await db
      .from("fuel_entries")
      .select("price, litres, recorded_at")
      .gte("recorded_at", since);
    const fuelSpend = (fuelRows ?? []).reduce(
      (sum, f) => sum + Number((f as Record<string, unknown>).price ?? 0),
      0
    );

    return NextResponse.json(
      {
        billingLive,
        labels,
        invoiced,
        collected,
        invoicedThisMonth: invoiced[invoiced.length - 1] ?? 0,
        collectedThisMonth: collected[collected.length - 1] ?? 0,
        invoicedTotal,
        collectedTotal,
        collectionRate,
        debtorsTotal,
        debtorCount: debtorRows.length,
        balanceAsAt,
        topDebtors: debtorRows.slice(0, 10).map((c) => ({
          id: String(c.id),
          name: String(c.name ?? ""),
          balance: Number(c.balance ?? 0),
          billingStatus: String(c.billing_status ?? ""),
          owner: (c.accounts_owner as string | null) ?? null,
        })),
        fuelSpend,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
