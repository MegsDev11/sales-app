/**
 * Regression harness for the Accounts client importer.
 *
 * Run:  npx tsx scripts/verify-accounts.ts [path-to-export.csv]
 *
 * Mirrors scripts/verify-commission.ts. Two jobs:
 *
 *   1. Pin `classifyStaff` against every distinct `Staff` value the real export
 *      contains. That column drives whether a client gets invoiced, so a rule change
 *      that silently reclassifies 400 accounts must fail loudly here first.
 *   2. Parse the real export end to end and print the data-quality picture, so the
 *      numbers quoted to the department are measured rather than estimated.
 *
 * Exits non-zero on any failed expectation.
 */

import { readFile } from "node:fs/promises";
import { classifyStaff, parseEmails, parsePackage, parseClientExport } from "../lib/accounts/parse-clients";
import { isBillable, type BillingStatus } from "../lib/accounts/constants";

const DEFAULT_EXPORT = "C:/Users/User/Downloads/Megs Kliente lys .csv";

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures += 1;
    console.error(`  FAIL  ${label}\n        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`);
  }
  return ok;
}

/* ------------------------------------------------------------------ *
 * 1. Staff classification — every distinct value in the real export
 * ------------------------------------------------------------------ */

interface StaffCase {
  raw: string;
  status: BillingStatus;
  day?: number | null;
  owner?: string | null;
  seasonal?: boolean;
}

const STAFF_CASES: StaffCase[] = [
  // --- live: debit order ---
  { raw: "1ST DEBIT ORDER", status: "active", day: 1 },
  { raw: "8TH DEBIT ORDER", status: "active", day: 8 },
  { raw: "20TH DEBIT ORDER", status: "active", day: 20 },
  { raw: "VOIP 1ST DEBIT ORDER", status: "active", day: 1 },
  // --- live: owning clerk ---
  { raw: "Leane", status: "active", owner: "Leané van Deventer" },
  { raw: "Meg vd Walt", status: "active", owner: "Meg van der Walt" },
  { raw: "SANTI", status: "active", owner: "Santi Bessinger" },
  { raw: "MARILY", status: "active", owner: "Marily Barnard" },
  { raw: "MARLYNA", status: "active", owner: "Marlyna de Villiers" },
  { raw: "SANTI-SEASONAL USER", status: "active", owner: "Santi Bessinger", seasonal: true },
  { raw: "Seasonal User", status: "active", seasonal: true },
  // --- suspended beats cancelled ---
  { raw: "Temp Cancelled", status: "temp_cancelled" },
  { raw: "TEMP CANCELLED COVID", status: "temp_cancelled" },
  { raw: "On Hold", status: "temp_cancelled" },
  { raw: "Mauriche/Tharien Suspend", status: "temp_cancelled" },
  // --- cancelled beats red client ---
  { raw: "Cancelled", status: "cancelled" },
  { raw: "CANCELLED", status: "cancelled" },
  { raw: "Cancelled/Closed/Red client - All combined", status: "cancelled" },
  { raw: "EQUIPMENT UITHAAL - RED CLIENT", status: "red_client" },
  { raw: "RED CLIENT", status: "red_client" },
  // --- other terminal states ---
  { raw: "Deseased", status: "deceased" },
  { raw: "Duplicate", status: "duplicate" },
  { raw: "Quote only", status: "quote_only" },
  { raw: "Sponsored", status: "sponsored" },
  { raw: "Sponsor / Fibre Customer", status: "sponsored" },
  { raw: "One Time Client", status: "one_time" },
  { raw: "One Time Account", status: "one_time" },
  // --- not customers ---
  { raw: "Site", status: "internal" },
  { raw: "Site owner", status: "internal" },
  { raw: "Megs Site", status: "internal" },
  { raw: "Tower Owner", status: "internal" },
  { raw: "Technician", status: "internal" },
  { raw: "Technician/Fibre", status: "internal" },
  { raw: "Megs WTB Tech", status: "internal" },
  { raw: "Head Office", status: "internal" },
  // --- deliberately NOT guessed ---
  { raw: "", status: "unclassified" },
  { raw: "Domain Only", status: "unclassified" },
  { raw: "WSI-BONA", status: "unclassified" },
  { raw: "Temp Install", status: "unclassified" },
];

console.log("Staff classification");
for (const c of STAFF_CASES) {
  const got = classifyStaff(c.raw);
  const label = `Staff ${JSON.stringify(c.raw)}`;
  check(`${label} -> status`, got.billingStatus, c.status);
  if (c.day !== undefined) check(`${label} -> debit day`, got.debitOrderDay, c.day);
  if (c.owner !== undefined) check(`${label} -> owner`, got.accountsOwner, c.owner);
  if (c.seasonal !== undefined) check(`${label} -> seasonal`, got.seasonal, c.seasonal);
}
console.log(`  ${STAFF_CASES.length} values pinned`);

// "Temp Install" is temporary but not cancelled — the single most dangerous
// misreading available, because it would stop billing a live client.
check("Temp Install is not billable-suspended", classifyStaff("Temp Install").billingStatus, "unclassified");

/* ------------------------------------------------------------------ *
 * 2. Field parsers
 * ------------------------------------------------------------------ */

console.log("Package parsing");
const PACKAGE_CASES: [string, number | null, number | null][] = [
  // [raw, speedMbps, priceIncl]
  ["20 Meg @ R299.00", 20, 299],
  ["20 Mbps @ R299.00", 20, 299],
  ["20 Mbps @ R299", 20, 299],
  ["50 Mpbs @ 399", 50, 399],          // typo'd unit, bare price
  ["50Meg @ R 399.00", 50, 399],       // no space before unit, space after R
  ["20M @ R299.00", 20, 299],
  ["50 mbps @ R399.00 pm", 50, 399],
  ["4 mbps @R483.00 pm", 4, 483],
  ["2M @ R 402.50 - Special price old client", 2, 402.5],
  ["Voip + 10 M 1552.50", 10, 1552.5],
  ["R109.00 x 1", null, 109],          // price without a speed is still billable
  ["20 Meg", 20, null],                // speed alone must NOT become a price
  ["6 Meg", 6, null],
  ["10 MEG - SPONSORED", 10, null],
  ["4Meg @ Sponsored", 4, null],
  ["Museum", null, null],
  ["Domain Only", null, null],
  ["Not a internet client", null, null],
  ["", null, null],
];
for (const [raw, speed, price] of PACKAGE_CASES) {
  const got = parsePackage(raw);
  check(`package ${JSON.stringify(raw)} -> speed`, got.speedMbps, speed);
  check(`package ${JSON.stringify(raw)} -> price`, got.priceIncl, price);
}
console.log(`  ${PACKAGE_CASES.length} package strings pinned`);

console.log("Email parsing");
check("single address", parseEmails("mpho@20squared.co").emails, ["mpho@20squared.co"]);
check("uppercased is normalised", parseEmails("Anton@SPROMS.co.za").emails, ["anton@sproms.co.za"]);
check("phone number is not an address", parseEmails("739603783").emails, []);
check("phone number flagged invalid", parseEmails("743 878 572").invalid, true);
check("blank is not flagged invalid", parseEmails("").invalid, false);
check("two addresses split", parseEmails("a@b.co.za; c@d.co.za").emails, ["a@b.co.za", "c@d.co.za"]);
check("slash splits only when two @", parseEmails("a@b.co.za/c@d.co.za").emails, ["a@b.co.za", "c@d.co.za"]);
check("slash inside one address is kept whole", parseEmails("faso/a64@yahoo.co.za").emails, ["faso/a64@yahoo.co.za"]);
check("duplicates collapse", parseEmails("a@b.co.za, a@b.co.za").emails, ["a@b.co.za"]);

/* ------------------------------------------------------------------ *
 * 3. The real export, end to end
 * ------------------------------------------------------------------ */

const path = process.argv[2] ?? DEFAULT_EXPORT;
const money = (n: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(n);

async function verifyRealExport() {
  const buffer = await readFile(path);
  const { clients, summary } = await parseClientExport(
    new Uint8Array(buffer),
    path.split(/[\\/]/).pop() ?? "clients.csv"
  );

  console.log(`\nReal export: ${path}`);
  console.log(`  headings         ${summary.headings.filter(Boolean).join(" | ")}`);
  console.log(`  rows read        ${summary.rowsRead}`);
  console.log(`  clients parsed   ${summary.parsed}`);
  console.log(`  skipped (noname) ${summary.skippedNoName}`);
  console.log(`  duplicate names  ${summary.duplicateNames.length}`);

  console.log("\n  By billing status");
  const statuses = Object.entries(summary.byStatus).sort((a, b) => b[1] - a[1]);
  for (const [status, count] of statuses) {
    const flag = isBillable(status as BillingStatus) ? "BILLABLE" : "        ";
    console.log(`    ${flag}  ${String(count).padStart(5)}  ${status}`);
  }

  console.log("\n  Billing readiness");
  const active = clients.filter((c) => c.billingStatus === "active");
  const ready = active.filter((c) => c.email && c.packagePriceIncl !== null);
  const noEmail = active.filter((c) => !c.email);
  const noPrice = active.filter((c) => c.packagePriceIncl === null);
  console.log(`    active clients            ${active.length}`);
  console.log(`    ready to invoice          ${ready.length}  (has email AND a priced package)`);
  console.log(`    active, no email          ${noEmail.length}`);
  console.log(`    active, no priced package ${noPrice.length}`);
  const mrr = active.reduce((s, c) => s + (c.packagePriceIncl ?? 0), 0);
  console.log(`    monthly billing (incl VAT) ${money(mrr)}`);

  console.log("\n  Balances (Sage snapshot)");
  console.log(`    owed to MEGS   ${money(summary.totalOwing)}`);
  console.log(`    in credit      ${money(summary.totalCredit)}`);

  console.log("\n  Rows needing a human");
  for (const [kind, count] of Object.entries(summary.issueCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(count).padStart(5)}  ${kind}`);
  }

  console.log("\n  Accounts owners found");
  const owners = new Map<string, number>();
  for (const c of clients) {
    if (c.accountsOwner) owners.set(c.accountsOwner, (owners.get(c.accountsOwner) ?? 0) + 1);
  }
  for (const [owner, count] of [...owners].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(count).padStart(5)}  ${owner}`);
  }

  console.log("\n  Unclassified Staff values (never billed until reviewed)");
  const unknown = new Map<string, number>();
  for (const c of clients) {
    if (c.billingStatus === "unclassified") {
      unknown.set(c.staffRaw, (unknown.get(c.staffRaw) ?? 0) + 1);
    }
  }
  for (const [raw, count] of [...unknown].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(count).padStart(5)}  ${JSON.stringify(raw)}`);
  }

  // Sanity: every parsed client must have a name, and no client may be billable
  // without the department having positively said so.
  check("every client has a name", clients.filter((c) => !c.name).length, 0);
  check(
    "no unclassified client is billable",
    clients.filter((c) => c.billingStatus === "unclassified" && isBillable(c.billingStatus)).length,
    0
  );
}

verifyRealExport()
  .catch((e) => {
    failures += 1;
    console.error(`\n  FAIL  couldn't parse ${path}: ${e instanceof Error ? e.message : e}`);
  })
  .then(() => {
    console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
    process.exit(failures === 0 ? 0 : 1);
  });
