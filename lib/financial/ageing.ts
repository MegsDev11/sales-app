/**
 * Debtor age analysis.
 *
 * Answers the question nobody can currently answer: of the money clients owe MEGS,
 * how much has been owed for how long. Without it there is a single number — R2.6m —
 * and no way to tell a client who is three days late from one who has not paid since
 * last year.
 *
 * OPEN-ITEM, NOT BALANCE-FORWARD. Each unpaid invoice is aged by its own date, and a
 * receipt reduces the specific invoices it was allocated to. The alternative — ageing
 * the running balance — silently re-ages the whole debt every time a client makes any
 * payment, so somebody who pays R50 a month against a two-year-old debt appears
 * permanently current. That is the exact client this report exists to surface.
 *
 * THE SAGE OPENING BALANCE IS NOT AGED, AND THAT IS DELIBERATE. Most of what clients
 * owe today came across as a single opening balance per client when the Sage list was
 * imported. Its age is genuinely unknown: the import told us what a client owed on
 * the day of the export, not when the debt arose. Bucketing it by the import date
 * would date a 2024 debt to July 2026 and show the worst debtors in the book as
 * current — the precise failure this report is meant to prevent. It is therefore
 * reported in its own `broughtForward` column, clearly separate, until a Sage
 * customer age analysis is imported to place it properly.
 *
 * UNALLOCATED CREDITS REDUCE THE TOTAL BUT SIT IN NO BUCKET. A client who overpaid
 * has money on account that is not against any invoice. It lowers what they owe
 * overall without making any particular invoice younger.
 */

export interface AgeingInvoice {
  id: string;
  clientId: string;
  invoiceNumber: string;
  /** ISO yyyy-mm-dd. */
  invoiceDate: string;
  totalIncl: number;
  /** How much of this invoice has been settled by receipts. */
  allocated: number;
}

export interface AgeingOpening {
  clientId: string;
  /** Positive = the client owed us at import. */
  amount: number;
}

export interface AgeingCredit {
  clientId: string;
  /** Positive = money received but not applied to any invoice. */
  amount: number;
}

export interface AgeingInput {
  /** The date the report is run to. Buckets are measured back from here. */
  asAt: Date;
  invoices: AgeingInvoice[];
  openingBalances: AgeingOpening[];
  unallocatedCredits: AgeingCredit[];
}

export type BucketKey = "current" | "d30" | "d60" | "d90" | "d120";

export const BUCKETS: { key: BucketKey; label: string; from: number; to: number | null }[] = [
  { key: "current", label: "Current", from: 0, to: 29 },
  { key: "d30", label: "30 days", from: 30, to: 59 },
  { key: "d60", label: "60 days", from: 60, to: 89 },
  { key: "d90", label: "90 days", from: 90, to: 119 },
  { key: "d120", label: "120+ days", from: 120, to: null },
];

export interface ClientAgeing {
  clientId: string;
  current: number;
  d30: number;
  d60: number;
  d90: number;
  d120: number;
  /** Sage opening balance — real money owed, age unknown. See the header. */
  broughtForward: number;
  /** Money received but not applied to an invoice. Reduces `total`. */
  unallocated: number;
  /** What the client owes overall, including brought-forward, net of credits. */
  total: number;
  /** Days the oldest unpaid app invoice has been outstanding; null if none. */
  oldestDays: number | null;
  /** Invoices still carrying a balance, oldest first. */
  openInvoices: { invoiceNumber: string; invoiceDate: string; outstanding: number; days: number }[];
}

export interface AgeingTotals {
  current: number;
  d30: number;
  d60: number;
  d90: number;
  d120: number;
  broughtForward: number;
  unallocated: number;
  total: number;
  clientsOwing: number;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Whole days between two dates, ignoring time of day and DST. */
export function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.floor((b - a) / 86_400_000);
}

/** Which bucket an invoice this many days old belongs in. */
export function bucketFor(days: number): BucketKey {
  if (days >= 120) return "d120";
  if (days >= 90) return "d90";
  if (days >= 60) return "d60";
  if (days >= 30) return "d30";
  return "current";
}

const emptyClient = (clientId: string): ClientAgeing => ({
  clientId,
  current: 0,
  d30: 0,
  d60: 0,
  d90: 0,
  d120: 0,
  broughtForward: 0,
  unallocated: 0,
  total: 0,
  oldestDays: null,
  openInvoices: [],
});

/**
 * Age every client's outstanding balance.
 *
 * Returns only clients who owe something (or hold a credit), sorted by total owed
 * descending — the order a collections call list is worked in.
 */
export function calculateAgeing(input: AgeingInput): {
  clients: ClientAgeing[];
  totals: AgeingTotals;
} {
  const byClient = new Map<string, ClientAgeing>();
  const get = (clientId: string) => {
    let row = byClient.get(clientId);
    if (!row) {
      row = emptyClient(clientId);
      byClient.set(clientId, row);
    }
    return row;
  };

  // --- invoices, aged by their own date ---
  for (const invoice of input.invoices) {
    const outstanding = round2(invoice.totalIncl - invoice.allocated);
    // A fully settled invoice is not a debtor. A credit note (negative) still counts:
    // it reduces what the client owes and belongs in the same bucket.
    if (Math.abs(outstanding) < 0.005) continue;

    const issued = new Date(`${invoice.invoiceDate}T00:00:00Z`);
    if (Number.isNaN(issued.getTime())) continue;
    // An invoice dated in the future is 0 days old, not negative.
    const days = Math.max(0, daysBetween(issued, input.asAt));

    const row = get(invoice.clientId);
    row[bucketFor(days)] = round2(row[bucketFor(days)] + outstanding);
    if (outstanding > 0) {
      row.oldestDays = row.oldestDays === null ? days : Math.max(row.oldestDays, days);
      row.openInvoices.push({
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        outstanding,
        days,
      });
    }
  }

  // --- Sage opening balances, kept out of the buckets ---
  for (const opening of input.openingBalances) {
    if (Math.abs(opening.amount) < 0.005) continue;
    const row = get(opening.clientId);
    row.broughtForward = round2(row.broughtForward + opening.amount);
  }

  // --- credits on account ---
  for (const credit of input.unallocatedCredits) {
    if (Math.abs(credit.amount) < 0.005) continue;
    const row = get(credit.clientId);
    row.unallocated = round2(row.unallocated + credit.amount);
  }

  const clients: ClientAgeing[] = [];
  for (const row of byClient.values()) {
    row.total = round2(
      row.current +
        row.d30 +
        row.d60 +
        row.d90 +
        row.d120 +
        row.broughtForward -
        row.unallocated
    );
    row.openInvoices.sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate));
    // Everything nets to zero: nothing owed, nothing on account. Not a debtor.
    if (Math.abs(row.total) < 0.005 && Math.abs(row.unallocated) < 0.005) continue;
    clients.push(row);
  }

  clients.sort((a, b) => b.total - a.total);

  const totals: AgeingTotals = {
    current: round2(clients.reduce((s, c) => s + c.current, 0)),
    d30: round2(clients.reduce((s, c) => s + c.d30, 0)),
    d60: round2(clients.reduce((s, c) => s + c.d60, 0)),
    d90: round2(clients.reduce((s, c) => s + c.d90, 0)),
    d120: round2(clients.reduce((s, c) => s + c.d120, 0)),
    broughtForward: round2(clients.reduce((s, c) => s + c.broughtForward, 0)),
    unallocated: round2(clients.reduce((s, c) => s + c.unallocated, 0)),
    total: round2(clients.reduce((s, c) => s + c.total, 0)),
    clientsOwing: clients.filter((c) => c.total > 0.005).length,
  };

  return { clients, totals };
}
