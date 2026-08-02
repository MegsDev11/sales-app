import { extractText, getDocumentProxy } from "unpdf";
import type { ParsedInvoice, ParsedInvoiceLine } from "./constants";
import { round2 } from "./constants";

/**
 * Reads a MEGS tax invoice / quote PDF into structured lines.
 *
 * These come out of Sage with a fixed layout, and they are real text PDFs rather
 * than scans, so extraction is exact rather than best-effort. Each item is either
 *
 *   CODE - Description ................ QTY  R PRICE  DISC%  VAT%  R EXCL  R INCL
 *
 * on one line, or wrapped so the description occupies one or more lines and the
 * numbers land on the next. Both shapes appear on the same invoice, so the parser
 * accumulates description text until it sees a row ENDING in the numeric tail.
 *
 * The parse is self-checking: `reconciles` is only true when the lines add up to
 * the invoice's own printed `Total Exclusive`. Callers must refuse to compute a
 * payout from an invoice that doesn't reconcile — a half-read invoice silently
 * under-pays somebody.
 */

/**
 * pdf.js reaches for Math.sumPrecise (a very new proposal) during font handling and
 * logs a warning per document when it's missing. Node 24 doesn't have it yet, so
 * supply it rather than let every upload spam the server log.
 */
function ensureSumPrecise() {
  const math = Math as unknown as { sumPrecise?: (values: Iterable<number>) => number };
  if (typeof math.sumPrecise === "function") return;
  math.sumPrecise = (values: Iterable<number>) => {
    let total = 0;
    for (const value of values) total += value;
    return total;
  };
}

/** QTY  R PRICE  DISC %  VAT %  R EXCL TOTAL  R INCL TOTAL — anchored to end of row only. */
const LINE_TAIL =
  /(-?\d+(?:\.\d+)?)\s+R\s?(-?[\d,]+\.\d{2})\s+(-?[\d.]+)\s?%\s+(-?[\d.]+)\s?%\s+R\s?(-?[\d,]+\.\d{2})\s+R\s?(-?[\d,]+\.\d{2})\s*$/;

const TABLE_START = /^Description\s+Quantity\s+Excl\.\s*Price/i;
const TABLE_END = /^(PLEASE NOTE THAT THIS INVOICE|Total Discount:)/i;

function money(raw: string) {
  return Number(raw.replace(/,/g, ""));
}

/** Sage prints dd/mm/yyyy. */
function toIsoDate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/**
 * The FROM/TO block puts both parties on one line: "<seller> <buyer>". The seller is
 * always us, so the buyer is whatever follows the entity suffix.
 */
function clientFromPartiesRow(row: string): string {
  const suffixed = row.match(/\(PTY\)\s*LTD\s+(.+)$/i);
  if (suffixed) return suffixed[1].trim();
  const megs = row.match(/^MEGS\s+\S+\s+(.+)$/i);
  if (megs) return megs[1].trim();
  return row.trim();
}

export async function parseInvoicePdf(
  data: Uint8Array | ArrayBuffer
): Promise<ParsedInvoice> {
  ensureSumPrecise();

  // pdf.js refuses anything that isn't exactly a Uint8Array — a Node Buffer passes
  // `instanceof Uint8Array` but is rejected by name, so always build a plain view.
  const pdf = await getDocumentProxy(new Uint8Array(data as ArrayBufferLike));
  const { text: pages } = await extractText(pdf, { mergePages: false });

  let invoiceNumber = "";
  let invoiceDate: string | null = null;
  let reference = "";
  let clientName = "";
  let installerName = "";
  let statedExclTotal: number | null = null;
  const lines: ParsedInvoiceLine[] = [];

  for (const page of pages) {
    const rows = page.split("\n").map((row) => row.replace(/\s+/g, " ").trim());

    let inTable = false;
    let pendingDescription: string[] = [];
    let expectParties = false;

    for (const row of rows) {
      if (!row) continue;

      // --- header (repeats on every page; first value wins) ---
      const number = row.match(/^NUMBER:\s*(.+)$/i);
      if (number && !invoiceNumber) invoiceNumber = number[1].trim();

      const ref = row.match(/^REFERENCE:\s*(.+)$/i);
      if (ref && !reference) reference = ref[1].trim();

      const date = row.match(/^DATE:\s*(.+)$/i);
      if (date && !invoiceDate) invoiceDate = toIsoDate(date[1]);

      const rep = row.match(/^SALES REP:\s*(.+)$/i);
      if (rep && !installerName) installerName = rep[1].trim();

      const total = row.match(/^Total Exclusive:\s*R\s?(-?[\d,]+\.\d{2})$/i);
      if (total && statedExclTotal === null) statedExclTotal = money(total[1]);

      if (/^FROM\s+TO$/i.test(row)) {
        expectParties = true;
        continue;
      }
      if (expectParties) {
        expectParties = false;
        if (!clientName) clientName = clientFromPartiesRow(row);
        continue;
      }

      // --- line items ---
      if (TABLE_START.test(row)) {
        inTable = true;
        pendingDescription = [];
        continue;
      }
      if (!inTable) continue;
      if (TABLE_END.test(row)) {
        inTable = false;
        pendingDescription = [];
        continue;
      }

      const tail = row.match(LINE_TAIL);
      if (!tail) {
        pendingDescription.push(row);
        continue;
      }

      const beforeTail = row.slice(0, row.length - tail[0].length).trim();
      const full = [...pendingDescription, beforeTail].filter(Boolean).join(" ").trim();
      pendingDescription = [];
      if (!full) continue;

      // "CODE - Description". The first " - " is the separator; codes themselves may
      // contain hyphens (RJ45-FTP) and even a trailing variant (FLY-6-1 -Grey).
      const split = full.indexOf(" - ");
      lines.push({
        lineIndex: lines.length,
        code: (split > 0 ? full.slice(0, split) : full).trim(),
        description: split > 0 ? full.slice(split + 3).trim() : "",
        qty: Number(tail[1]),
        unitPrice: money(tail[2]),
        discountPct: Number(tail[3]),
        vatPct: Number(tail[4]),
        exclTotal: money(tail[5]),
        inclTotal: money(tail[6]),
      });
    }
  }

  const parsedExclTotal = round2(lines.reduce((sum, line) => sum + line.exclTotal, 0));

  return {
    invoiceNumber,
    invoiceDate,
    reference,
    clientName,
    installerName,
    lines,
    statedExclTotal,
    parsedExclTotal,
    reconciles:
      statedExclTotal !== null && Math.abs(parsedExclTotal - statedExclTotal) < 0.01,
  };
}
