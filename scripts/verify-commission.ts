/**
 * Commission regression harness.
 *
 *   npx tsx scripts/verify-commission.ts
 *
 * Runs the real parser and engine against the real documents this module was built
 * from, and replays every detail block in the old commission workbook so any drift
 * from the historic numbers shows up as a diff rather than a surprise on a payslip.
 *
 * Paths default to the Desktop copies; override with:
 *   npx tsx scripts/verify-commission.ts --workbook=path.xlsx --invoice=path.pdf
 */

import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { parseInvoicePdf } from "../lib/commission/parse-invoice";
import { parseCatalogue } from "../lib/commission/parse-catalogue";
import { calculateCommission } from "../lib/commission/calculate";
import {
  DEFAULT_EXCLUDED_CODES,
  SEED_CODE_ALIASES,
  normaliseCode,
  round2,
  type CatalogueItem,
} from "../lib/commission/constants";

const DESKTOP = "C:/Users/User/Desktop";
const arg = (name: string, fallback: string) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const WORKBOOK = arg("workbook", `${DESKTOP}/May 2026.xlsx`);
const MAINCON = arg("invoice", `${DESKTOP}/Tax Invoice - INV0181025 - Maincon.pdf`);
const JH = arg("invoice2", `${DESKTOP}/Tax Invoice - INV0175005 -JH.pdf`);
const CSV_EXPORT = arg("csv", `${DESKTOP}/ItemExport1.csv`);

const INSTALL_RATE = 0.1;

let passed = 0;
let failed = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok =
    typeof actual === "number" && typeof expected === "number"
      ? Math.abs(actual - expected) < 0.011
      : actual === expected;
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${label} = ${actual}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}: got ${actual}, expected ${expected}`);
  }
  return ok;
}

function ok(label: string, condition: boolean, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
  return condition;
}

/* ------------------------------------------------------------------ *
 * Replay the old workbook's per-invoice detail blocks
 * ------------------------------------------------------------------ */

interface SheetBlock {
  sheet: string;
  title: string;
  items: { code: string; qty: number }[];
  /** The block's own "Total Markup" and "10% Commision" footers. */
  sheetMarkup: number;
  sheetCommission: number;
}

function numberOf(value: ExcelJS.CellValue): number {
  if (typeof value === "number") return value;
  if (value && typeof value === "object") {
    const result = (value as { result?: unknown }).result;
    if (typeof result === "number") return result;
  }
  const text = String(value ?? "").replace(/[R\s,]/gi, "");
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function textOf(value: ExcelJS.CellValue): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const rich = (value as { richText?: { text: string }[] }).richText;
    if (Array.isArray(rich)) return rich.map((r) => r.text).join("");
    const result = (value as { result?: unknown }).result;
    if (typeof result === "string") return result;
  }
  if (typeof value === "number") return String(value);
  return "";
}

function readBlocks(sheet: ExcelJS.Worksheet): SheetBlock[] {
  const blocks: SheetBlock[] = [];
  for (let row = 1; row <= sheet.rowCount; row += 1) {
    if (textOf(sheet.getRow(row).getCell(1).value).trim() !== "Item") continue;

    const title = textOf(sheet.getRow(row + 1).getCell(1).value).trim();
    const items: SheetBlock["items"] = [];
    let cursor = row + 2;

    for (; cursor <= sheet.rowCount; cursor += 1) {
      const line = sheet.getRow(cursor);
      const code = textOf(line.getCell(1).value).trim();
      if (!code) break;
      items.push({ code, qty: numberOf(line.getCell(2).value) });
    }

    const totals = sheet.getRow(cursor);
    blocks.push({
      sheet: sheet.name,
      title,
      items,
      sheetMarkup: numberOf(totals.getCell(7).value),
      sheetCommission: numberOf(totals.getCell(8).value),
    });
  }
  return blocks;
}

/**
 * Blocks where the engine and the old workbook legitimately disagree, with the cause
 * traced to the cent. In every case it is the SPREADSHEET that departed from its own
 * stated rule — either someone typed over a formula, or the markup was copied from an
 * older price list and never refreshed. Recorded so the harness stays green while any
 * NEW divergence still fails the run.
 */
const KNOWN_WORKBOOK_DIFFS: Record<string, { diff: number; reason: string }> = {
  INV0174978: {
    diff: 331.2,
    reason: "Ezviz H3 ×3 — sheet used a stale 673.52 markup; catalogue GP is 783.92 (+110.40 each)",
  },
  INV0175102: {
    diff: 330.19,
    reason: "BRAC — sheet used a stale 119.20 markup; catalogue GP is 449.39",
  },
  INV0177979: {
    diff: -214.12,
    reason:
      "RB-LHGHP5XL markup hand-typed as 1380.00 over its own 835.69 formula (−544.31), plus the stale BRAC markup (+330.19)",
  },
  INV0181145: {
    diff: -287.5,
    reason: "MULTIPLUG markup hand-typed as 227.50 because the catalogue GP is −60.00 (stale row)",
  },
};

/** Leading invoice number in a block title, e.g. "INV0174978 - Gauthier…". */
function invoiceKey(title: string) {
  return title.match(/INV\d+/i)?.[0].toUpperCase() ?? title;
}

/** Build a ParsedInvoice-shaped stub from workbook rows (no prices — catalogue basis only). */
function blockAsInvoice(block: SheetBlock) {
  return {
    invoiceNumber: block.title,
    invoiceDate: null,
    reference: "",
    clientName: block.title,
    installerName: "",
    statedExclTotal: null,
    parsedExclTotal: 0,
    reconciles: true,
    lines: block.items.map((item, lineIndex) => ({
      lineIndex,
      code: item.code,
      description: "",
      qty: item.qty,
      unitPrice: 0,
      discountPct: 0,
      vatPct: 15,
      exclTotal: 0,
      inclTotal: 0,
    })),
  };
}

/* ------------------------------------------------------------------ */

async function main() {
  console.log("\n=== Catalogue ===");
  const catalogueFile = await readFile(WORKBOOK);
  const catalogue = await parseCatalogue(catalogueFile, WORKBOOK);
  console.log(
    `  sheet "${catalogue.sheetName}": ${catalogue.summary.itemCount} items, ` +
      `${catalogue.summary.zeroPriceCount} with a zero list price, ` +
      `${catalogue.summary.nonPositiveGpCount} with GP <= 0`
  );
  ok("catalogue loaded", catalogue.summary.itemCount > 1000);

  const byCode = new Map<string, CatalogueItem>(
    catalogue.items.map((i) => [normaliseCode(i.code), i])
  );
  check("CABLE CAT5 gp amount", byCode.get("CABLE CAT5")?.gpAmount, 4.1);
  check("RB-LHG5 gp amount", byCode.get("RB-LHG5")?.gpAmount, 609.25);
  check("MULTIPLUG gp amount", byCode.get("MULTIPLUG")?.gpAmount, -60);

  const engineArgs = {
    catalogue: catalogue.items,
    aliases: SEED_CODE_ALIASES,
    excludedCodes: DEFAULT_EXCLUDED_CODES,
    installRate: INSTALL_RATE,
  };

  /* ---------- the OTHER Sage export vocabulary ---------- */
  // The CSV item export names its columns differently ("Price Excl." rather than
  // "Excl. Price"), omits GP entirely, and does not quote descriptions containing
  // commas — which splits those rows across extra columns. All three are handled.
  console.log("\n=== CSV item export ===");
  try {
    const csvFile = await readFile(CSV_EXPORT);
    const csv = await parseCatalogue(csvFile, CSV_EXPORT);
    console.log(`  headings: ${csv.headings.join(" | ")}`);
    check("items read", csv.summary.itemCount, 1848);
    check("rows realigned", csv.summary.repairedCount, 101);
    check("rows skipped", csv.summary.skippedCodes.length, 0);
    ok("margin derived (export has no GP column)", csv.summary.gpDerived);

    const csvByCode = new Map<string, CatalogueItem>(
      csv.items.map((i) => [normaliseCode(i.code), i])
    );
    // A row whose description contained commas: realigned, not mangled.
    const battery = csvByCode.get("B100");
    check("repaired row description", battery?.description,
      "LiFe 16 cell, 51.2V, 100Ah, 5.1 kWh, Battery Module with built in BMS");
    check("repaired row excl price", battery?.exclPrice, 15598);
    check("repaired row avg cost", battery?.avgCost, 8450);
    check("repaired row category", battery?.category, "Battery");
  } catch (err) {
    ok(
      "CSV export parsed",
      false,
      err instanceof Error ? err.message : "unreadable — is ItemExport1.csv on the Desktop?"
    );
  }

  /* ---------- INV0181025 Maincon ---------- */
  console.log("\n=== INV0181025 — Maincon Civils ===");
  const maincon = await parseInvoicePdf(await readFile(MAINCON));
  check("invoice number", maincon.invoiceNumber, "INV0181025");
  check("invoice date", maincon.invoiceDate, "2026-03-20");
  check("client", maincon.clientName, "MAINCON CIVILS");
  check("installer (display only)", maincon.installerName, "HERMAN VAN ASWEGEN");
  check("line count", maincon.lines.length, 25);
  check("stated excl total", maincon.statedExclTotal, 34992.98);
  check("parsed excl total", maincon.parsedExclTotal, 34992.98);
  ok("reconciles against its own total", maincon.reconciles);

  const asInvoiced = calculateCommission({
    ...engineArgs,
    invoice: maincon,
    basis: "as_invoiced",
  });
  const cataloguePass = calculateCommission({
    ...engineArgs,
    invoice: maincon,
    basis: "catalogue",
  });

  check("revenue excl", asInvoiced.totals.revenueExcl, 34992.98);
  check("catalogue commission", cataloguePass.totals.catalogueCommission, 877.84);
  check("as-invoiced commission", asInvoiced.totals.asInvoicedCommission, 1035.46);

  const tc305 = asInvoiced.lines.find((l) => normaliseCode(l.code) === "TC-305");
  check("TC-305 resolves via alias", tc305?.matchedCode, "CABLE CAT5");

  const multiplug = asInvoiced.lines.find((l) => normaliseCode(l.code) === "MULTIPLUG");
  ok(
    "MULTIPLUG flagged stale_catalogue",
    !!multiplug?.flags.includes("stale_catalogue"),
    `flags=[${multiplug?.flags.join(", ")}]`
  );
  check("MULTIPLUG catalogue markup is negative", multiplug?.catalogueMarkup, -120);
  check("MULTIPLUG as-invoiced markup is positive", multiplug?.asInvoicedMarkup, 380);

  const excludedLines = asInvoiced.lines.filter((l) => l.excluded);
  check("excluded line count", excludedLines.length, 3);
  ok(
    "excluded lines earn nothing",
    excludedLines.every((l) => l.commission === 0),
    excludedLines.map((l) => l.code).join(", ")
  );
  ok(
    "review strip is populated",
    asInvoiced.needsReview.length > 0,
    `${asInvoiced.needsReview.length} lines need review`
  );

  /* ---------- INV0175005 JH (100% discount line) ---------- */
  console.log("\n=== INV0175005 — Hoefling John ===");
  const jh = await parseInvoicePdf(await readFile(JH));
  check("invoice number", jh.invoiceNumber, "INV0175005");
  check("client", jh.clientName, "HOEFLING JOHN");
  check("installer (display only)", jh.installerName, "JACQUES SWART");
  check("line count", jh.lines.length, 5);
  check("parsed excl total", jh.parsedExclTotal, 2763.80);
  ok("reconciles against its own total", jh.reconciles);

  const travel = jh.lines.find((l) => normaliseCode(l.code) === "TRAVEL");
  check("100%-discount travel line captured", travel?.discountPct, 100);
  check("...and bills nothing", travel?.exclTotal, 0);

  /* ---------- Replay the old workbook ---------- */
  console.log("\n=== Replaying the old workbook's detail blocks (catalogue basis) ===");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(catalogueFile as unknown as ArrayBuffer);

  let matched = 0;
  let explained = 0;
  const drifted: string[] = [];

  for (const sheetName of ["Installs - Herman", "Installs - Wine"]) {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) {
      ok(`sheet ${sheetName} present`, false);
      continue;
    }
    for (const block of readBlocks(sheet)) {
      const result = calculateCommission({
        ...engineArgs,
        invoice: blockAsInvoice(block),
        basis: "catalogue",
      });
      const diff = round2(result.totals.catalogueMarkup - block.sheetMarkup);
      const label = `${block.title.slice(0, 44)}`;
      const known = KNOWN_WORKBOOK_DIFFS[invoiceKey(block.title)];

      if (Math.abs(diff) < 0.02) {
        matched += 1;
        console.log(
          `  MATCH  ${label.padEnd(46)} markup ${block.sheetMarkup.toFixed(2).padStart(10)}`
        );
      } else if (known && Math.abs(diff - known.diff) < 0.02) {
        explained += 1;
        console.log(
          `  KNOWN  ${label.padEnd(46)} ${diff > 0 ? "+" : ""}${diff.toFixed(2).padStart(9)}  ${known.reason}`
        );
      } else {
        drifted.push(
          `${label} (sheet ${block.sheetMarkup.toFixed(2)}, engine ` +
            `${result.totals.catalogueMarkup.toFixed(2)}, diff ${diff.toFixed(2)}` +
            `${known ? `, expected ${known.diff.toFixed(2)}` : ", no known cause"})`
        );
        console.log(
          `  DRIFT  ${label.padEnd(46)} sheet ${block.sheetMarkup.toFixed(2).padStart(10)}` +
            ` engine ${result.totals.catalogueMarkup.toFixed(2).padStart(10)}  (${diff > 0 ? "+" : ""}${diff.toFixed(2)})`
        );
        const unmatchedCodes = result.needsReview
          .filter((l) => l.flags.includes("unmatched_code"))
          .map((l) => l.code);
        const stale = result.needsReview
          .filter((l) => l.flags.includes("stale_catalogue"))
          .map((l) => l.code);
        if (unmatchedCodes.length) console.log(`           unmatched: ${unmatchedCodes.join(", ")}`);
        if (stale.length) console.log(`           stale catalogue: ${stale.join(", ")}`);
      }
    }
  }

  console.log(
    `\n  ${matched} blocks reproduce the workbook exactly; ${explained} differ for a known reason.`
  );
  ok("every workbook block is accounted for", drifted.length === 0);
  if (drifted.length) {
    console.log(`  ${drifted.length} unexplained:`);
    for (const line of drifted) console.log(`    - ${line}`);
  }

  console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
