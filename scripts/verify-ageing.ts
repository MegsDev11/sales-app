/**
 * Regression harness for debtor age analysis.
 *
 * Run:  npx tsx scripts/verify-ageing.ts
 *
 * Ageing is a report people act on — it decides who gets phoned, who gets a final
 * demand, and who gets cut off. Every failure mode here is silent:
 *
 *   - a bucket boundary off by one day moves a client between "current" and "30 days";
 *   - balance-forward ageing makes a chronic non-payer look current the moment they
 *     pay R50 against an old debt;
 *   - folding the un-aged Sage opening balance into "current" would show the worst
 *     debtors in the book as up to date.
 *
 * Exits non-zero on any failed expectation.
 */

import {
  calculateAgeing,
  bucketFor,
  daysBetween,
  type AgeingInvoice,
} from "../lib/financial/ageing";

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures += 1;
    console.error(
      `  FAIL  ${label}\n        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`
    );
    return false;
  }
  return true;
}

const AS_AT = new Date(Date.UTC(2026, 6, 31)); // 31 July 2026

/** An invoice dated `days` before the as-at date. */
function invoiceAged(
  id: string,
  clientId: string,
  days: number,
  totalIncl: number,
  allocated = 0
): AgeingInvoice {
  const d = new Date(AS_AT);
  d.setUTCDate(d.getUTCDate() - days);
  return {
    id,
    clientId,
    invoiceNumber: `INV${id}`,
    invoiceDate: d.toISOString().slice(0, 10),
    totalIncl,
    allocated,
  };
}

/* ------------------------------------------------------------------ *
 * 1. Bucket boundaries — the off-by-one that moves clients
 * ------------------------------------------------------------------ */

console.log("Bucket boundaries");
check("day 0 is current", bucketFor(0), "current");
check("day 29 is still current", bucketFor(29), "current");
check("day 30 tips into 30 days", bucketFor(30), "d30");
check("day 59 is still 30 days", bucketFor(59), "d30");
check("day 60 tips into 60 days", bucketFor(60), "d60");
check("day 89 is still 60 days", bucketFor(89), "d60");
check("day 90 tips into 90 days", bucketFor(90), "d90");
check("day 119 is still 90 days", bucketFor(119), "d90");
check("day 120 tips into 120+", bucketFor(120), "d120");
check("very old stays 120+", bucketFor(2000), "d120");

console.log("Day counting");
check(
  "same day is zero",
  daysBetween(new Date(Date.UTC(2026, 6, 31)), new Date(Date.UTC(2026, 6, 31))),
  0
);
check(
  "month boundary",
  daysBetween(new Date(Date.UTC(2026, 5, 30)), new Date(Date.UTC(2026, 6, 31))),
  31
);
check(
  "across a DST change is still whole days",
  daysBetween(new Date(Date.UTC(2026, 2, 1)), new Date(Date.UTC(2026, 3, 1))),
  31
);

/* ------------------------------------------------------------------ *
 * 2. Invoices land in the right buckets
 * ------------------------------------------------------------------ */

console.log("Bucketing invoices");
const spread = calculateAgeing({
  asAt: AS_AT,
  invoices: [
    invoiceAged("a", "c1", 5, 299),
    invoiceAged("b", "c1", 35, 299),
    invoiceAged("c", "c1", 65, 299),
    invoiceAged("d", "c1", 95, 299),
    invoiceAged("e", "c1", 200, 299),
  ],
  openingBalances: [],
  unallocatedCredits: [],
});
const c1 = spread.clients[0];
check("current", c1.current, 299);
check("30 days", c1.d30, 299);
check("60 days", c1.d60, 299);
check("90 days", c1.d90, 299);
check("120+", c1.d120, 299);
check("total is the sum", c1.total, 1495);
check("oldest invoice age", c1.oldestDays, 200);
check("five open invoices listed", c1.openInvoices.length, 5);
check("open invoices are oldest first", c1.openInvoices[0].days, 200);

/* ------------------------------------------------------------------ *
 * 3. Payments settle specific invoices — the balance-forward trap
 * ------------------------------------------------------------------ */

console.log("Allocation and ageing");

// A client with an old debt who pays a little each month must NOT appear current.
// Balance-forward ageing gets this wrong; open-item ageing gets it right.
const chronic = calculateAgeing({
  asAt: AS_AT,
  invoices: [
    invoiceAged("old", "c2", 200, 299), // untouched, two hundred days old
    invoiceAged("new", "c2", 5, 299, 299), // this month's, paid in full
  ],
  openingBalances: [],
  unallocatedCredits: [],
});
check("a settled invoice drops out", chronic.clients[0].current, 0);
check("the old debt stays in 120+", chronic.clients[0].d120, 299);
check("and is still reported as 200 days old", chronic.clients[0].oldestDays, 200);

// Part payment reduces the invoice without re-ageing it.
const partial = calculateAgeing({
  asAt: AS_AT,
  invoices: [invoiceAged("p", "c3", 95, 500, 200)],
  openingBalances: [],
  unallocatedCredits: [],
});
check("part-paid invoice keeps its age", partial.clients[0].d90, 300);
check("and nothing lands in current", partial.clients[0].current, 0);

// A fully settled book has no debtors at all.
const settled = calculateAgeing({
  asAt: AS_AT,
  invoices: [invoiceAged("s", "c4", 40, 299, 299)],
  openingBalances: [],
  unallocatedCredits: [],
});
check("nothing owing means no rows", settled.clients.length, 0);

/* ------------------------------------------------------------------ *
 * 4. The Sage opening balance must not be aged
 * ------------------------------------------------------------------ */

console.log("Brought-forward balances");
const carried = calculateAgeing({
  asAt: AS_AT,
  invoices: [invoiceAged("n", "c5", 5, 299)],
  openingBalances: [{ clientId: "c5", amount: 5000 }],
  unallocatedCredits: [],
});
const c5 = carried.clients[0];
check("opening balance is not in current", c5.current, 299);
check("nor in any other bucket", [c5.d30, c5.d60, c5.d90, c5.d120], [0, 0, 0, 0]);
check("it sits in brought forward", c5.broughtForward, 5000);
check("but still counts toward the total", c5.total, 5299);

// A client with only an opening balance is still a debtor.
const onlyOpening = calculateAgeing({
  asAt: AS_AT,
  invoices: [],
  openingBalances: [{ clientId: "c6", amount: 1200 }],
  unallocatedCredits: [],
});
check("opening-only client appears", onlyOpening.clients.length, 1);
check("with the right total", onlyOpening.clients[0].total, 1200);

/* ------------------------------------------------------------------ *
 * 5. Credits on account
 * ------------------------------------------------------------------ */

console.log("Credits");
const credited = calculateAgeing({
  asAt: AS_AT,
  invoices: [invoiceAged("q", "c7", 35, 299)],
  openingBalances: [],
  unallocatedCredits: [{ clientId: "c7", amount: 100 }],
});
check("the invoice keeps its bucket", credited.clients[0].d30, 299);
check("the credit is reported separately", credited.clients[0].unallocated, 100);
check("and reduces what is owed overall", credited.clients[0].total, 199);

// A client purely in credit shows a negative total rather than disappearing.
const inCredit = calculateAgeing({
  asAt: AS_AT,
  invoices: [],
  openingBalances: [],
  unallocatedCredits: [{ clientId: "c8", amount: 250 }],
});
check("a client in credit is still listed", inCredit.clients.length, 1);
check("with a negative total", inCredit.clients[0].total, -250);

/* ------------------------------------------------------------------ *
 * 6. Totals and ordering
 * ------------------------------------------------------------------ */

console.log("Totals");
const book = calculateAgeing({
  asAt: AS_AT,
  invoices: [
    invoiceAged("x", "big", 130, 10000),
    invoiceAged("y", "small", 10, 299),
    invoiceAged("z", "mid", 65, 1552.5),
  ],
  openingBalances: [{ clientId: "small", amount: 40 }],
  unallocatedCredits: [{ clientId: "mid", amount: 52.5 }],
});
check("worst debtor first", book.clients[0].clientId, "big");
check("then the next largest", book.clients[1].clientId, "mid");
check("total 120+", book.totals.d120, 10000);
check("total 60 days", book.totals.d60, 1552.5);
check("total current", book.totals.current, 299);
check("total brought forward", book.totals.broughtForward, 40);
check("total credits", book.totals.unallocated, 52.5);
check("grand total nets credits off", book.totals.total, 11839);
check("clients owing", book.totals.clientsOwing, 3);

// The columns must reconcile to the total — an ageing report that doesn't add up is
// the first thing an auditor notices.
const sumOfColumns =
  book.totals.current +
  book.totals.d30 +
  book.totals.d60 +
  book.totals.d90 +
  book.totals.d120 +
  book.totals.broughtForward -
  book.totals.unallocated;
check("columns reconcile to the total", Number(sumOfColumns.toFixed(2)), book.totals.total);

/* ------------------------------------------------------------------ *
 * 7. Edge cases
 * ------------------------------------------------------------------ */

console.log("Edge cases");
check("an empty book produces nothing", calculateAgeing({
  asAt: AS_AT, invoices: [], openingBalances: [], unallocatedCredits: [],
}).clients.length, 0);

// A future-dated invoice is 0 days old, never negative.
const future = calculateAgeing({
  asAt: AS_AT,
  invoices: [invoiceAged("f", "c9", -10, 299)],
  openingBalances: [],
  unallocatedCredits: [],
});
check("future invoice lands in current", future.clients[0].current, 299);
check("with age clamped to zero", future.clients[0].oldestDays, 0);

// A malformed date must not crash or silently become 1970.
const bad = calculateAgeing({
  asAt: AS_AT,
  invoices: [{ id: "b", clientId: "c10", invoiceNumber: "X", invoiceDate: "not-a-date", totalIncl: 299, allocated: 0 }],
  openingBalances: [],
  unallocatedCredits: [],
});
check("an unreadable invoice date is skipped, not misfiled", bad.clients.length, 0);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
