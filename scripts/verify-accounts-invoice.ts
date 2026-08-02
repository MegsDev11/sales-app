/**
 * Regression harness for the Accounts invoice generator.
 *
 * Run:  npx tsx scripts/verify-accounts-invoice.ts [out.pdf]
 *
 * Reproduces a REAL invoice — INV0192812, the one the department supplied — with the
 * app's own renderer, then reads the generated PDF back out and checks that every
 * field the client sees survived the round trip. Comparing against a genuine document
 * rather than a made-up one is the point: it pins the layout to what MEGS clients have
 * actually been receiving from Sage.
 *
 * Also pins the arithmetic (R100.00 incl -> R86.96 excl -> R13.04 VAT) and the
 * covering-letter merge, including the debit-order variant that must never ask an
 * automatically-debited client to pay again.
 *
 * Exits non-zero on any failed expectation.
 */

import { readFile, writeFile } from "node:fs/promises";
import { extractText, getDocumentProxy } from "unpdf";
import { renderInvoicePdf, money, percent, shortDate } from "../lib/accounts/invoice-pdf";
import { renderStatementPdf, openingBalanceFor } from "../lib/accounts/statement-pdf";
import { statementMoney, printedDate } from "../lib/accounts/pdf-layout";
import {
  buildSubscriptionLine,
  totalsFor,
  lineDescription,
  renderTemplate,
  bodyForClient,
  periodLabel,
  addDays,
} from "../lib/accounts/invoicing";

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

function contains(label: string, haystack: string, needle: string) {
  const flat = haystack.replace(/\s+/g, " ");
  if (!flat.includes(needle.replace(/\s+/g, " "))) {
    failures += 1;
    console.error(`  FAIL  ${label}\n        PDF text is missing: ${JSON.stringify(needle)}`);
    return false;
  }
  return true;
}

/* ------------------------------------------------------------------ *
 * 1. Formatting — Sage's two different decimal separators
 * ------------------------------------------------------------------ */

console.log("Formatting");
check("money uses a dot decimal", money(100), "R100.00");
check("money keeps two places", money(86.96), "R86.96");
check("money handles negatives", money(-18.4), "-R18.40");
// Sage prints percentages with a COMMA and money with a DOT on the same document.
check("percent uses a comma decimal", percent(0), "0,00%");
check("percent VAT", percent(15), "15,00%");
check("date is dd/mm/yyyy", shortDate(new Date(Date.UTC(2026, 6, 23))), "23/07/2026");

// The statement formats money DIFFERENTLY from the invoice, and Sage really does
// print both on documents that go out in the same email. Reproduced, not tidied.
check("statement money has a space after R", statementMoney(200), "R 200.00");
check("statement money uses comma thousands", statementMoney(1225.62), "R 1,225.62");
check("statement money on a large figure", statementMoney(2088.12), "R 2,088.12");
check("invoice money has neither", money(1225.62), "R1225.62");
check("printed date is yyyy/mm/dd", printedDate(new Date(Date.UTC(2026, 6, 31))), "2026/07/31");

/* ------------------------------------------------------------------ *
 * 2. Arithmetic — inclusive price is authoritative
 * ------------------------------------------------------------------ */

console.log("Invoice arithmetic");
const line = buildSubscriptionLine({
  name: "HORAK WESLEY",
  packageRaw: "50 Mbps @ R100.00",
  packageSpeedMbps: 50,
  packagePriceIncl: 100,
  serviceDescription: "50M-HF - 50 MEG UNCAPPED FIBRE HOME USER",
});
check("line built", line !== null, true);
check("inclusive total is the quoted price", line?.totalIncl, 100);
check("exclusive derived from inclusive", line?.totalExcl, 86.96);
check("vat percent", line?.vatPct, 15);

const totals = totalsFor(line ? [line] : []);
check("total excl", totals.totalExcl, 86.96);
// VAT is the remainder, so the three printed figures always add up.
check("total vat is the remainder", totals.totalVat, 13.04);
check("total incl", totals.totalIncl, 100);
check("excl + vat === incl", totals.totalExcl + totals.totalVat, totals.totalIncl);

// A client with no price must never produce a line — that is what blocks the invoice.
check(
  "unpriced client yields no line",
  buildSubscriptionLine({
    name: "X",
    packageRaw: "20 Meg",
    packageSpeedMbps: 20,
    packagePriceIncl: null,
  }),
  null
);

console.log("Line descriptions");
check(
  "explicit description splits on the first ' - '",
  lineDescription({
    name: "X",
    packageRaw: "",
    packageSpeedMbps: null,
    packagePriceIncl: 0,
    serviceDescription: "50M-HF - 50 MEG UNCAPPED FIBRE HOME USER",
  }),
  { code: "50M-HF", description: "50 MEG UNCAPPED FIBRE HOME USER" }
);
// The derived fallback must NOT claim fibre or wireless — Sage doesn't say which.
const derived = lineDescription({
  name: "X",
  packageRaw: "50 Mbps @ R399.00",
  packageSpeedMbps: 50,
  packagePriceIncl: 399,
});
check("derived code", derived.code, "50M");
check("derived description", derived.description, "50 MEG UNCAPPED - MONTHLY SUBSCRIPTION");
check("derived description claims no medium", /fibre|wireless/i.test(derived.description), false);
check(
  "no speed falls back to the Sage text",
  lineDescription({
    name: "X",
    packageRaw: "Voip + Domain",
    packageSpeedMbps: null,
    packagePriceIncl: 500,
  }).description,
  "Voip + Domain"
);

/* ------------------------------------------------------------------ *
 * 3. The covering letter
 * ------------------------------------------------------------------ */

console.log("Covering letter");
const TEMPLATE = {
  body:
    "Dear Valued Megs Client,\n\nKindly find attached your monthly Transaction Report and Invoices for your account.\n\n" +
    "Would you please be so kind as to revert payment at your earliest convenience and provide me with a POP.\n\n" +
    "Warm Regards\n{{accounts_owner}}\nMEGS Waterberg",
  bodyDebitOrder:
    "Dear Valued Megs Client,\n\nYour account is paid by debit order and will be deducted on the {{debit_order_day}} of the month.\n\n" +
    "Warm Regards\n{{accounts_owner}}\nMEGS Waterberg",
};

const ctx = {
  clientName: "HORAK WESLEY",
  contactName: "Wesley",
  accountsOwner: "Leané van Deventer",
  invoiceNumber: "INV1000042",
  invoiceTotal: "R100.00",
  balanceDue: "R100.00",
  period: "July 2026",
  debitOrderDay: "1st",
  dueDate: "30/07/2026",
};

const eftLetter = renderTemplate(bodyForClient(TEMPLATE, "eft"), ctx);
check("clerk signs the letter", eftLetter.includes("Leané van Deventer"), true);
check("EFT client is asked for a POP", eftLetter.includes("provide me with a POP"), true);
check("no unfilled tokens remain", /\{\{/.test(eftLetter), false);

const debitLetter = renderTemplate(bodyForClient(TEMPLATE, "debit_order"), ctx);
// The whole point of the variant: never ask an auto-debited client to pay again.
check("debit-order client is NOT asked to pay", debitLetter.includes("revert payment"), false);
check("debit-order client is NOT asked for a POP", debitLetter.includes("POP"), false);
check("debit day is merged", debitLetter.includes("deducted on the 1st"), true);

// With no variant written, everyone gets the main body rather than nothing.
check(
  "missing variant falls back to the main body",
  renderTemplate(bodyForClient({ body: TEMPLATE.body, bodyDebitOrder: "" }, "debit_order"), ctx).includes(
    "revert payment"
  ),
  true
);
// An unknown token is left standing so it is obvious, not silently blanked.
check(
  "unknown token is left visible",
  renderTemplate("Hello {{client_naem}}", ctx),
  "Hello {{client_naem}}"
);
check("period label", periodLabel(new Date(Date.UTC(2026, 6, 1))), "July 2026");
check("due date is terms days later", shortDate(addDays(new Date(Date.UTC(2026, 6, 23)), 7)), "30/07/2026");

/* ------------------------------------------------------------------ *
 * 4. Render the real invoice and read it back
 * ------------------------------------------------------------------ */

const COMPANY = {
  companyName: "MEGS WATERBERG (PTY) LTD",
  vatNumber: "4730281922",
  postalAddress: "P O Box 57\nPostnet Modimolle\nModimolle",
  physicalAddress: "20 Dirk Van Den Berg Straat\nModimolle\nLimpopo\n0510",
  officePhone: "087 820 5290",
  bankAccountName: "MEGS WATERBERG",
  bankName: "STANDARDBANK",
  bankAccountNumber: "300063431",
  bankBranchCode: "051001",
  popEmail: "marily@megswb.co.za",
  invoiceNotice: "PLEASE NOTE THAT THIS INVOICE IS DUE FOR PAYMENT IMMEDIATELY",
  smsNotice:
    "** IF YOU WOULD LIKE TO RECEIVE AN SMS, STATING OF ANY SIGNAL LOSS OR TOWER PROBLEMS, " +
    "PLEASE SEND YOUR NAME, SURNAME AND LOCATION TO 060 418 6311 - PLEASE SAVE THIS NUMBER " +
    "IN ORDER TO RECEIVE ANY MESSAGES **",
};

async function renderAndVerify() {
  let logo: Uint8Array | undefined;
  try {
    logo = new Uint8Array(await readFile("public/megs-logo.png"));
  } catch {
    console.log("  (no logo found; rendering the company name as text)");
  }

  const pdf = await renderInvoicePdf({
    invoiceNumber: "INV0192812",
    reference: "HORAK WESLEY",
    invoiceDate: new Date(Date.UTC(2026, 6, 23)),
    dueDate: new Date(Date.UTC(2026, 6, 30)),
    salesRep: "ANDREW JENKINS",
    clientName: "HORAK WESLEY",
    clientAddress: "11 Chris Hani str\nModimolle\nOffice 087 820 5290",
    lines: line ? [line] : [],
    totalExcl: totals.totalExcl,
    totalVat: totals.totalVat,
    totalIncl: totals.totalIncl,
    company: COMPANY,
    logo,
  });

  const out = process.argv[2] ?? "megs-invoice-sample.pdf";
  await writeFile(out, pdf);
  console.log(`\nRendered ${(pdf.byteLength / 1024).toFixed(0)} KB -> ${out}`);

  // The letterhead must actually be IN the file. This caught a real bug: the asset
  // at public/megs-logo.png is a JPEG despite its name, embedPng refused it, and the
  // fallback quietly printed the company name instead — a failure that is invisible
  // unless you open the PDF. Rendering the same invoice without a logo and comparing
  // sizes detects the drop without needing to decode the PDF.
  if (logo) {
    const withoutLogo = await renderInvoicePdf({
      invoiceNumber: "INV0192812",
      reference: "HORAK WESLEY",
      invoiceDate: new Date(Date.UTC(2026, 6, 23)),
      dueDate: new Date(Date.UTC(2026, 6, 30)),
      salesRep: "ANDREW JENKINS",
      clientName: "HORAK WESLEY",
      lines: line ? [line] : [],
      totalExcl: totals.totalExcl,
      totalVat: totals.totalVat,
      totalIncl: totals.totalIncl,
      company: COMPANY,
    });
    const grew = pdf.byteLength - withoutLogo.byteLength;
    console.log(`  letterhead adds ${(grew / 1024).toFixed(0)} KB`);
    if (grew < 5000) {
      failures += 1;
      console.error(
        `  FAIL  letterhead was not embedded — the logo only added ${grew} bytes.\n` +
          "        Check lib/accounts/invoice-pdf.ts imageKind(); the asset may be a\n" +
          "        format pdf-lib cannot read."
      );
    }
  }

  // Read it back the same way the commission module reads Sage invoices.
  const proxy = await getDocumentProxy(new Uint8Array(pdf));
  const { text: pages } = await extractText(proxy, { mergePages: true });
  const body = Array.isArray(pages) ? pages.join("\n") : pages;

  console.log("\nRound trip — every field the client sees");
  contains("title", body, "TAX INVOICE");
  contains("invoice number", body, "INV0192812");
  contains("reference", body, "HORAK WESLEY");
  contains("date", body, "23/07/2026");
  contains("due date", body, "30/07/2026");
  contains("sales rep", body, "ANDREW JENKINS");
  contains("our VAT number", body, "4730281922");
  contains("company name", body, "MEGS WATERBERG (PTY) LTD");
  contains("postal address", body, "P O Box 57");
  contains("physical address", body, "20 Dirk Van Den Berg Straat");
  contains("table heading", body, "Description");
  contains("line description", body, "50 MEG UNCAPPED FIBRE HOME USER");
  contains("quantity", body, "1.0");
  contains("inclusive price", body, "R100.00");
  contains("vat percent", body, "15,00%");
  contains("exclusive total", body, "R86.96");
  contains("payment notice", body, "PLEASE NOTE THAT THIS INVOICE IS DUE FOR PAYMENT IMMEDIATELY");
  contains("bank name", body, "STANDARDBANK");
  contains("bank account", body, "300063431");
  contains("branch code", body, "051001");
  contains("POP address", body, "EMAIL PROOF OF PAYMENT TO: marily@megswb.co.za");
  contains("SMS notice", body, "060 418 6311");
  contains("total exclusive", body, "Total Exclusive:");
  contains("total VAT figure", body, "R13.04");
  contains("grand total", body, "Grand Total:");
  contains("balance due", body, "BALANCE DUE");
}

/* ------------------------------------------------------------------ *
 * 5. The customer transactions report
 * ------------------------------------------------------------------ */

/**
 * Reproduces the department's real 31/07/2026 statement for Horak Wesley, including
 * its exact running balances. Those figures are the point of the test: opening R200,
 * four invoices, closing R2 088.12 and a movement of R1 888.12 — all of which must
 * fall out of the ledger arithmetic rather than being printed from a stored column.
 */
const STATEMENT_TXNS = [
  {
    date: new Date(Date.UTC(2026, 5, 23)),
    reference: "INV0189781",
    transactionType: "Tax Invoice",
    description: "Horak Wesley",
    debit: 100,
    credit: 0,
  },
  {
    date: new Date(Date.UTC(2026, 6, 23)),
    reference: "INV0192812",
    transactionType: "Tax Invoice",
    description: "Horak Wesley",
    debit: 100,
    credit: 0,
  },
  {
    date: new Date(Date.UTC(2026, 6, 23)),
    reference: "INV0192946",
    transactionType: "Tax Invoice",
    description: "Lasarus",
    debit: 825.62,
    credit: 0,
  },
  {
    date: new Date(Date.UTC(2026, 6, 24)),
    reference: "INV0192951",
    transactionType: "Tax Invoice",
    description: "Bosveldsig Fase 7",
    debit: 862.5,
    credit: 0,
  },
];

async function renderStatementAndVerify() {
  console.log("\nStatement arithmetic");
  const opening = 200;
  const closing = STATEMENT_TXNS.reduce((sum, t) => sum + t.debit - t.credit, opening);
  check("closing balance matches the real report", Number(closing.toFixed(2)), 2088.12);
  check("movement matches the real report", Number((closing - opening).toFixed(2)), 1888.12);

  // Opening balance is derived from the ledger, never read off a stored column.
  check(
    "opening balance counts only rows before the range",
    openingBalanceFor(
      [
        { date: new Date(Date.UTC(2026, 4, 1)), debit: 200, credit: 0 },
        { date: new Date(Date.UTC(2026, 5, 23)), debit: 100, credit: 0 },
      ],
      new Date(Date.UTC(2026, 5, 1))
    ),
    200
  );
  check(
    "a payment reduces the balance",
    openingBalanceFor(
      [
        { date: new Date(Date.UTC(2026, 4, 1)), debit: 500, credit: 0 },
        { date: new Date(Date.UTC(2026, 4, 20)), debit: 0, credit: 300 },
      ],
      new Date(Date.UTC(2026, 5, 1))
    ),
    200
  );

  let logo: Uint8Array | undefined;
  try {
    logo = new Uint8Array(await readFile("public/megs-logo.png"));
  } catch {
    /* rendered without a letterhead */
  }

  const pdf = await renderStatementPdf({
    companyName: "Megs Waterberg (Pty) Ltd",
    clientName: "Horak Wesley",
    rangeStart: new Date(Date.UTC(2026, 5, 1)),
    rangeEnd: new Date(Date.UTC(2026, 6, 31)),
    openingBalance: opening,
    transactions: STATEMENT_TXNS,
    historyStartsAt: new Date(Date.UTC(2026, 6, 31)),
    printedAt: new Date(Date.UTC(2026, 6, 31)),
    logo,
  });

  const out = process.argv[3] ?? "megs-statement-sample.pdf";
  await writeFile(out, pdf);
  console.log(`Rendered ${(pdf.byteLength / 1024).toFixed(0)} KB -> ${out}`);

  const proxy = await getDocumentProxy(new Uint8Array(pdf));
  const { text: pages } = await extractText(proxy, { mergePages: true });
  const body = Array.isArray(pages) ? pages.join("\n") : pages;

  console.log("\nStatement round trip");
  contains("title", body, "Customer Transactions Report");
  contains("company", body, "Megs Waterberg (Pty) Ltd");
  contains("customer line", body, "Customer: Horak Wesley - Horak Wesley");
  contains("category", body, "Category: All Categories");
  contains("date range", body, "Date Range: 01/06/2026 - 31/07/2026");
  contains("column headings", body, "Date");
  contains("transaction type heading", body, "Transaction Type");
  contains("opening balance", body, "Opening Balance as at: 01/06/2026");
  contains("opening figure", body, "R 200.00");
  contains("first invoice", body, "INV0189781");
  contains("last invoice", body, "INV0192951");
  contains("a described line", body, "Bosveldsig Fase 7");
  contains("largest debit", body, "R 862.50");
  contains("running balance mid-way", body, "R 1,225.62");
  contains("closing balance", body, "Closing Balance as at: 31/07/2026");
  contains("closing figure", body, "R 2,088.12");
  contains("movement", body, "Movement for the period");
  contains("movement figure", body, "R 1,888.12");
  contains("grand total", body, "Grand Total:");
  contains("date printed", body, "Date Printed: 2026/07/31");
  contains("page footer", body, "Page 1 of 1");
  // The document must admit where the app's history begins.
  contains("history note", body, "are held in Sage");
}

renderAndVerify()
  .then(renderStatementAndVerify)
  .catch((e) => {
    failures += 1;
    console.error(`\n  FAIL  rendering: ${e instanceof Error ? e.stack : e}`);
  })
  .then(() => {
    console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
    process.exit(failures === 0 ? 0 : 1);
  });
