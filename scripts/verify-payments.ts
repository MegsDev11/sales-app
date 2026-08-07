/**
 * Regression harness for bank statement import and payment matching.
 *
 * Run:  npx tsx scripts/verify-payments.ts
 *
 * Two pieces of logic decide whether a client is credited with money they sent, and
 * both fail silently when wrong:
 *
 *   - the STATEMENT PARSER, where a duplicated row invents a payment and a
 *     misread date moves one into the wrong month;
 *   - the MATCHER, where a false positive credits the wrong client and leaves a real
 *     debtor being chased for money they already paid.
 *
 * Neither produces an error message when it goes wrong, so both are pinned here
 * against the export shapes South African banks actually produce.
 *
 * Exits non-zero on any failed expectation.
 */

import {
  parseStatement,
  parseAmount,
  fingerprintFor,
} from "../lib/financial/parse-statement";
import {
  matchBankLine,
  allocateOldestFirst,
  isAutoPostable,
  findInvoiceNumbers,
  nameTokens,
  pppoeKey,
  type MatchableClient,
  type OpenInvoice,
} from "../lib/financial/match-payment";

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

/* ------------------------------------------------------------------ *
 * 1. Amounts, as each bank writes them
 * ------------------------------------------------------------------ */

console.log("Amount parsing");
check("plain", parseAmount("399.00"), 399);
check("thousands comma", parseAmount("1,234.56"), 1234.56);
check("thousands space", parseAmount("1 234.56"), 1234.56);
check("rand prefix", parseAmount("R 1 552.50"), 1552.5);
check("leading minus", parseAmount("-57.50"), -57.5);
check("trailing minus", parseAmount("57.50-"), -57.5);
check("parentheses", parseAmount("(57.50)"), -57.5);
check("Dr suffix means out", parseAmount("57.50 Dr"), -57.5);
check("Cr suffix means in", parseAmount("399.00 Cr"), 399);
check("decimal comma", parseAmount("399,00"), 399);
check("empty is null, not zero", parseAmount(""), null);
check("text is null", parseAmount("BALANCE B/F"), null);

/* ------------------------------------------------------------------ *
 * 2. Statement shapes
 * ------------------------------------------------------------------ */

console.log("Statement formats");

// FNB-style: one signed Amount column.
const FNB = `Date,Description,Amount,Balance
01/07/2026,"ACB CREDIT MEGSWB FTTHKOBUSPIENAAR",399.00,10399.00
01/07/2026,"FNB APP PAYMENT FROM ABERA MULUKENA",389.00,10788.00
02/07/2026,"BANK CHARGES",-57.50,10730.50`;

const fnb = parseStatement(FNB);
check("fnb rows", fnb.summary.parsed, 3);
check("fnb convention", fnb.summary.convention, "signed");
check("fnb credit is positive", fnb.lines[0].amount, 399);
check("fnb charge is negative", fnb.lines[2].amount, -57.5);
check("fnb date read as dd/mm", fnb.lines[0].date, "2026-07-01");
check("fnb total in", fnb.summary.totalIn, 788);
check("fnb total out", fnb.summary.totalOut, -57.5);

// Nedbank-style: separate Debit / Credit columns, semicolon delimited.
const NEDBANK = `Transaction Date;Narrative;Debit;Credit;Balance
03/07/2026;IB PAYMENT FROM J PIENAAR;;399.00;11129.50
04/07/2026;SALARY RUN;25000.00;;-13870.50`;

const ned = parseStatement(NEDBANK);
check("nedbank convention", ned.summary.convention, "debit_credit");
check("nedbank credit positive", ned.lines[0].amount, 399);
// The debit column holds a positive magnitude; it must come out negative.
check("nedbank debit negative", ned.lines[1].amount, -25000);

// Capitec-style: Money In / Money Out, ISO dates.
const CAPITEC = `Date,Description,Money In,Money Out,Balance
2026-07-05,EFT INV1000042,100.00,,-13770.50
2026-07-06,CARD PURCHASE,,250.00,-14020.50`;

const cap = parseStatement(CAPITEC);
check("capitec money in", cap.lines[0].amount, 100);
check("capitec money out", cap.lines[1].amount, -250);
check("capitec iso date", cap.lines[0].date, "2026-07-05");
check("capitec date order", cap.summary.dateOrder, "ymd");

/* ------------------------------------------------------------------ *
 * 3. Dates — the ambiguity that moves money between months
 * ------------------------------------------------------------------ */

console.log("Date handling");

// A day above 12 proves dd/mm.
const DMY = parseStatement(`Date,Description,Amount,Balance
13/07/2026,PAYMENT,100.00,100.00
01/07/2026,PAYMENT,100.00,200.00`);
check("dd/mm detected", DMY.summary.dateOrder, "dmy");
check("dd/mm applied to the ambiguous row", DMY.lines[1].date, "2026-07-01");

// A second component above 12 proves mm/dd.
const MDY = parseStatement(`Date,Description,Amount,Balance
07/13/2026,PAYMENT,100.00,100.00
07/01/2026,PAYMENT,100.00,200.00`);
check("mm/dd detected", MDY.summary.dateOrder, "mdy");
check("mm/dd applied to the ambiguous row", MDY.lines[1].date, "2026-07-01");

// When every row is ambiguous, assume SA format but SAY SO.
const AMBIG = parseStatement(`Date,Description,Amount,Balance
03/07/2026,PAYMENT,100.00,100.00
05/08/2026,PAYMENT,100.00,200.00`);
check("ambiguous defaults to dd/mm", AMBIG.lines[0].date, "2026-07-03");
check(
  "ambiguity is warned about",
  AMBIG.summary.warnings.some((w) => w.kind === "date_ambiguous"),
  true
);

check("named month", parseStatement(`Date,Description,Amount,Balance
01 Jul 2026,PAYMENT,100.00,100.00`).lines[0].date, "2026-07-01");

/* ------------------------------------------------------------------ *
 * 4. Deduplication — the one that invents payments
 * ------------------------------------------------------------------ */

console.log("Deduplication");

const OVERLAP = `Date,Description,Amount,Balance
01/07/2026,ACB CREDIT SMITH,299.00,299.00
02/07/2026,ACB CREDIT JONES,299.00,598.00`;

const first = parseStatement(OVERLAP);
const second = parseStatement(OVERLAP);
check(
  "re-importing the same file yields identical fingerprints",
  first.lines.map((l) => l.fingerprint),
  second.lines.map((l) => l.fingerprint)
);

// THE case that a naive fingerprint gets wrong: two different clients paying the
// same amount on the same day with the same narration. These are two real payments.
const SAME_DAY = parseStatement(`Date,Description,Amount,Balance
06/07/2026,DEBIT ORDER,299.00,299.00
06/07/2026,DEBIT ORDER,299.00,598.00
06/07/2026,DEBIT ORDER,299.00,897.00`);
check("three identical same-day rows are kept", SAME_DAY.lines.length, 3);
check(
  "and are given distinct fingerprints",
  new Set(SAME_DAY.lines.map((l) => l.fingerprint)).size,
  3
);
// Stability: re-importing that same statement must reproduce the same three.
check(
  "same-day fingerprints are stable across imports",
  parseStatement(`Date,Description,Amount,Balance
06/07/2026,DEBIT ORDER,299.00,299.00
06/07/2026,DEBIT ORDER,299.00,598.00
06/07/2026,DEBIT ORDER,299.00,897.00`).lines.map((l) => l.fingerprint),
  SAME_DAY.lines.map((l) => l.fingerprint)
);
// Narration case and spacing must not change identity.
check(
  "narration whitespace/case doesn't change the fingerprint",
  fingerprintFor("2026-07-01", 299, "acb   credit  smith", 1),
  fingerprintFor("2026-07-01", 299, "ACB CREDIT SMITH", 1)
);
check(
  "a different amount is a different line",
  fingerprintFor("2026-07-01", 300, "ACB CREDIT SMITH", 1) ===
    fingerprintFor("2026-07-01", 299, "ACB CREDIT SMITH", 1),
  false
);

/* ------------------------------------------------------------------ *
 * 5. Completeness
 * ------------------------------------------------------------------ */

console.log("Completeness");
const GAPPED = parseStatement(`Date,Description,Amount,Balance
01/07/2026,PAYMENT,100.00,100.00
02/07/2026,PAYMENT,100.00,500.00`);
check(
  "a balance that doesn't add up is reported",
  GAPPED.summary.warnings.some((w) => w.kind === "balance_gap"),
  true
);
check(
  "a clean statement reports no gap",
  fnb.summary.warnings.some((w) => w.kind === "balance_gap"),
  false
);
check(
  "no balance column is called out",
  parseStatement(`Date,Description,Amount
01/07/2026,PAYMENT,100.00`).summary.warnings.some((w) => w.kind === "no_balance_column"),
  true
);

/* ------------------------------------------------------------------ *
 * 6. Matching
 * ------------------------------------------------------------------ */

console.log("Matching");

// Real clients from the MEGS book.
const CLIENTS: MatchableClient[] = [
  {
    id: "c-pienaar",
    name: "A.J Pienaar",
    pppoeUsername: "ftthkobuspienaar@megswb.co.za",
    email: "kobuspienaar01@outlook.com",
  },
  {
    id: "c-abera",
    name: "Abera Mulukena",
    pppoeUsername: "ftthmulukenaabera@megswb.co.za",
    email: "mulkonmuab@gmail.com",
  },
  {
    id: "c-ukulima",
    name: "971 Ukulima (Pty) Ltd",
    pppoeUsername: "louisborman@megswb.co.za",
    email: "michelle@971ukulima.com",
  },
  { id: "c-walker", name: "A . Walker and C. Walker", pppoeUsername: "", email: "" },
  // Deliberately overlapping with "Abera Mulukena": the realistic ambiguity is two
  // clients whose names share words, not two unrelated names in one narration.
  { id: "c-mulukena-stores", name: "Mulukena Stores", pppoeUsername: "", email: "" },
];

const OPEN: OpenInvoice[] = [
  { id: "i-1", clientId: "c-pienaar", invoiceNumber: "INV1000042", outstanding: 399, invoiceDate: "2026-06-01" },
  { id: "i-2", clientId: "c-abera", invoiceNumber: "INV1000043", outstanding: 389, invoiceDate: "2026-06-01" },
  { id: "i-3", clientId: "c-ukulima", invoiceNumber: "INV1000044", outstanding: 1552.5, invoiceDate: "2026-06-01" },
];

check("invoice numbers found in text", findInvoiceNumbers("EFT INV1000042 THANKS"), ["INV1000042"]);
check("company noise words dropped", nameTokens("971 Ukulima (Pty) Ltd"), ["971", "UKULIMA"]);
check("pppoe key is the local part", pppoeKey("ftthkobuspienaar@megswb.co.za"), "FTTHKOBUSPIENAAR");

const m = (description: string, amount: number, reference = "") =>
  matchBankLine({ description, reference, amount }, CLIENTS, OPEN);

// Quoting an invoice number is conclusive.
const byInvoice = m("EFT INV1000042", 399);
check("invoice number -> right client", byInvoice[0]?.clientId, "c-pienaar");
check("invoice number -> certain", byInvoice[0]?.confidence, "certain");
check("invoice number -> auto-postable", isAutoPostable(byInvoice[0].confidence), true);
check("invoice number -> invoice attached", byInvoice[0]?.invoiceNumber, "INV1000042");

// PPPoE username in a mangled narration.
const byPppoe = m("ACB CREDIT MEGSWB FTTHKOBUSPIENAAR", 399);
check("pppoe -> right client", byPppoe[0]?.clientId, "c-pienaar");
check("pppoe -> auto-postable", isAutoPostable(byPppoe[0].confidence), true);

// Prefix collision, taken from the real book: two branches hold `ajmotorspares` and
// `ajmotorspares2`, so a narration quoting the SECOND literally contains the first.
// Scoring both would tie the wrong branch with the right one and demote the correct
// match to "needs review".
const BRANCHES: MatchableClient[] = [
  { id: "c-vaalwater", name: "AJ Motors Spares - Vaalwater", pppoeUsername: "ajmotorspares@megswb.co.za", email: "" },
  { id: "c-ellisras", name: "AJ Motor Spares - Ellisras Shongoane", pppoeUsername: "ajmotorspares2@megswb.co.za", email: "" },
];
const branch = matchBankLine(
  { description: "ACB CREDIT MEGSWB AJMOTORSPARES2", reference: "", amount: 299 },
  BRANCHES,
  []
);
check("the exact branch wins", branch[0]?.clientId, "c-ellisras");
check("and is not demoted by the prefix", isAutoPostable(branch[0].confidence), true);
check("the shorter prefix isn't offered at all", branch.length, 1);

// The reverse direction must still work: quoting the SHORTER key matches only it.
const shorter = matchBankLine(
  { description: "ACB CREDIT MEGSWB AJMOTORSPARES", reference: "", amount: 299 },
  BRANCHES,
  []
);
check("quoting the shorter key matches that branch", shorter[0]?.clientId, "c-vaalwater");

// A bare first name as a username identifies a person about as well as "PAYMENT FROM
// MARTIN" does. The real book contains one. Suggestive, never conclusive.
const GENERIC: MatchableClient[] = [
  { id: "c-kotzee", name: "Anne-Marie Kotzee Prokureurs", pppoeUsername: "martin@megswb.co.za", email: "" },
];
const generic = matchBankLine(
  { description: "ACB CREDIT MARTIN", reference: "", amount: 299 },
  GENERIC,
  []
);
check("a short username still finds the client", generic[0]?.clientId, "c-kotzee");
check("but does not auto-post", isAutoPostable(generic[0].confidence), false);
check("and says why", generic[0].reasons.some((r) => /short username/.test(r)), true);

// Full name, in either word order.
check("name -> right client", m("FNB APP PAYMENT FROM ABERA MULUKENA", 389)[0]?.clientId, "c-abera");
check(
  "reversed name still matches",
  m("PAYMENT FROM MULUKENA ABERA", 389)[0]?.clientId,
  "c-abera"
);
check(
  "name run together still matches",
  m("MEGSWB ABERAMULUKENA", 389)[0]?.clientId,
  "c-abera"
);

// A bare amount must NEVER auto-post — hundreds of clients pay the same figure.
const bare = m("PAYMENT", 399);
check("bare amount does not reach auto-post", bare.length === 0 || !isAutoPostable(bare[0].confidence), true);

// Amount uniqueness alone is a suggestion, not a decision.
const unique = m("EFT PAYMENT", 1552.5);
check("unique amount suggests a client", unique[0]?.clientId, "c-ukulima");
check("but only at medium", unique[0]?.confidence, "medium");
check("and is not auto-postable", isAutoPostable(unique[0].confidence), false);

// Debits are never client receipts.
check("a debit yields no candidates", m("SALARY RUN", -25000).length, 0);

// Two clients matching equally well must reach a human rather than be guessed at.
const ambiguous = m("PAYMENT ABERA MULUKENA STORES", 250);
check(
  "an ambiguous narration is demoted below auto-post",
  isAutoPostable(ambiguous[0].confidence),
  false
);
check(
  "and says why",
  ambiguous[0].reasons.some((r) => /Ambiguous/.test(r)),
  true
);

// The converse: overwhelming evidence for one client must NOT be demoted just
// because a weaker candidate also matched. PPPoE + name + exact amount wins.
const decisive = m("PAYMENT ABERA MULUKENA AND A J PIENAAR FTTHKOBUSPIENAAR", 399);
check("decisive evidence picks the right client", decisive[0]?.clientId, "c-pienaar");
check("and stays auto-postable", isAutoPostable(decisive[0].confidence), true);

// Nothing recognisable: no guess at all.
check("unrecognisable narration yields nothing", m("ATM DEPOSIT 4471", 12.34).length, 0);

/* ------------------------------------------------------------------ *
 * 7. Allocation
 * ------------------------------------------------------------------ */

console.log("Allocation");

const CLIENT_INVOICES: OpenInvoice[] = [
  { id: "i-may", clientId: "c1", invoiceNumber: "INV1000001", outstanding: 299, invoiceDate: "2026-05-01" },
  { id: "i-jun", clientId: "c1", invoiceNumber: "INV1000002", outstanding: 299, invoiceDate: "2026-06-01" },
  { id: "i-jul", clientId: "c1", invoiceNumber: "INV1000003", outstanding: 299, invoiceDate: "2026-07-01" },
];

// Oldest first, which is what every accounting package does and what clients expect.
const exact = allocateOldestFirst(598, CLIENT_INVOICES);
check("settles the two oldest", exact.allocations.map((a) => a.invoiceId), ["i-may", "i-jun"]);
check("nothing left over", exact.unallocated, 0);

const partial = allocateOldestFirst(150, CLIENT_INVOICES);
check("part payment hits the oldest only", partial.allocations, [{ invoiceId: "i-may", amount: 150 }]);

// Overpayment stays as a credit rather than being forced onto an invoice.
const over = allocateOldestFirst(1000, CLIENT_INVOICES);
check("all three settled", over.allocations.length, 3);
check("remainder is a credit on account", over.unallocated, 103);

// Cents must not drift when splitting.
const odd = allocateOldestFirst(
  100,
  [{ id: "a", clientId: "c", invoiceNumber: "X", outstanding: 33.33, invoiceDate: "2026-01-01" },
   { id: "b", clientId: "c", invoiceNumber: "Y", outstanding: 33.33, invoiceDate: "2026-02-01" }]
);
check(
  "allocations plus remainder equal the receipt",
  Number((odd.allocations.reduce((s, a) => s + a.amount, 0) + odd.unallocated).toFixed(2)),
  100
);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
