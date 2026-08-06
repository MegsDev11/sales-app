import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/supabase/server-auth";
import { adminClient, errorMessage } from "@/lib/api/route-helpers";

/**
 * Real billing figures for the owner dashboard.
 *
 * The /company hero used to be computed from leads.dealValue — the CRM
 * pipeline, which holds demo rows — so the owner's "revenue" figure and the AR
 * ledger disagreed by construction. This returns what was actually invoiced
 * (accounts_invoices, drafts excluded — a failed send is still a recorded
 * document) and what was collected (financial_receipts), month by month.
 *
 * `live: false` means migrations 053/056 aren't applied or hold no rows yet;
 * the page then keeps its pipeline figures but says so honestly.
 */

const MONTHS = 6;

/** Pages through a table Supabase caps at 1000 rows per select. */
const PAGE = 1000;
const MAX_PAGES = 20;

function monthStarts(): Date[] {
  const now = new Date();
  return Array.from(
    { length: MONTHS },
    (_, i) => new Date(now.getFullYear(), now.getMonth() - (MONTHS - 1 - i), 1)
  );
}

const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export async function GET(request: Request) {
  const user = await requireOwner(request);
  if (!user) {
    return NextResponse.json({ error: "Owner only" }, { status: 403 });
  }

  try {
    const supabase = adminClient();
    const months = monthStarts();
    const since = months[0].toISOString().slice(0, 10);
    const labels = months.map((d) => d.toLocaleDateString("en-ZA", { month: "short" }));
    const keys = months.map(keyOf);

    async function sumByMonth(
      table: string,
      dateColumn: string,
      amountColumn: string,
      excludeDraft = false
    ): Promise<Map<string, number> | null> {
      const sums = new Map<string, number>();
      for (let page = 0; page < MAX_PAGES; page += 1) {
        let query = supabase
          .from(table)
          .select(`${dateColumn}, ${amountColumn}`)
          .gte(dateColumn, since)
          .range(page * PAGE, (page + 1) * PAGE - 1);
        if (excludeDraft) query = query.neq("status", "draft");
        const { data, error } = await query;
        if (error) return null; // table missing -> not live yet
        for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
          const date = new Date(String(row[dateColumn]));
          if (Number.isNaN(date.getTime())) continue;
          const key = keyOf(new Date(date.getFullYear(), date.getMonth(), 1));
          sums.set(key, (sums.get(key) ?? 0) + Number(row[amountColumn] ?? 0));
        }
        if (!data || data.length < PAGE) break;
      }
      return sums;
    }

    const [invoiced, collected] = await Promise.all([
      sumByMonth("accounts_invoices", "invoice_date", "total_incl", true),
      sumByMonth("financial_receipts", "receipt_date", "amount"),
    ]);

    if (invoiced === null) {
      return NextResponse.json(
        { live: false },
        { headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }

    const invoicedValues = keys.map((k) => invoiced.get(k) ?? 0);
    const collectedValues = keys.map((k) => collected?.get(k) ?? 0);
    const anyBilling = invoicedValues.some((v) => v > 0) || collectedValues.some((v) => v > 0);

    return NextResponse.json(
      {
        live: anyBilling,
        labels,
        invoiced: invoicedValues,
        collected: collectedValues,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
