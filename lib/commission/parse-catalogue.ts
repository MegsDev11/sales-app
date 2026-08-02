import ExcelJS from "exceljs";
import type { CatalogueItem, CatalogueImportSummary } from "./constants";

/**
 * Reads a Sage item listing into catalogue rows.
 *
 * Sage exports this report under more than one column vocabulary — the Excel
 * "Item Listing Report" writes `Excl. Price` / `Avg. Cost` / `GP Amount`, while the
 * CSV item export writes `Price Excl.` / `Avg Cost` and omits GP entirely. Columns
 * are therefore matched on their WORD SET rather than an exact string, so
 * "Price Excl." and "Excl. Price" both resolve, and margin falls back to
 * `price − average cost` (which is exactly how Sage derives GP Amount anyway).
 *
 * Layout is discovered, never assumed: the header row is located by its column names
 * and every column is then addressed by name, so a Sage upgrade that reorders or
 * inserts columns cannot silently shift costs into prices.
 */

export interface ParsedCatalogue {
  items: CatalogueItem[];
  summary: CatalogueImportSummary;
  sheetName: string;
  /** Headings as found, for error messages. */
  headings: string[];
}

/**
 * Accepted column names as word sets. Order within a name doesn't matter, so one
 * entry covers every arrangement Sage might print.
 */
const COLUMNS: Record<string, string[][]> = {
  code: [["code"], ["item", "code"], ["stock", "code"]],
  description: [["description"], ["item", "description"]],
  category: [["category"], ["group"]],
  avgCost: [
    ["avg", "cost"],
    ["average", "cost"],
    ["cost", "average"],
  ],
  exclPrice: [
    ["excl", "price"],
    ["exclusive", "price"],
    ["price", "excl", "vat"],
    ["price", "exclusive", "vat"],
    ["selling", "price", "excl"],
  ],
  gpAmount: [
    ["gp", "amount"],
    ["gp", "value"],
    ["gross", "profit", "amount"],
  ],
};

type ColumnKey = keyof typeof COLUMNS;

/** Lowercase, drop punctuation, sort the words — "Price Excl." === "Excl. Price". */
function wordKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

const COLUMN_KEYS: Record<ColumnKey, Set<string>> = Object.fromEntries(
  Object.entries(COLUMNS).map(([key, names]) => [
    key,
    new Set(names.map((words) => [...words].sort().join(" "))),
  ])
) as Record<ColumnKey, Set<string>>;

/** exceljs cells can hold formulas, rich text or hyperlinks — reduce to plain text. */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const candidate = value as {
      text?: unknown;
      result?: unknown;
      richText?: { text: string }[];
    };
    if (Array.isArray(candidate.richText)) {
      return candidate.richText.map((part) => part.text).join("");
    }
    if (typeof candidate.text === "string") return candidate.text;
    if (candidate.result !== undefined && candidate.result !== null) {
      return String(candidate.result);
    }
  }
  return "";
}

/**
 * "R 2,095.00" / "(1 234.50)" / 2095 → number. Returns null when the text is present
 * but is not a number at all — that means the row is misaligned, and importing a
 * silent zero there would turn a whole selling price into apparent margin.
 */
function strictNumber(value: ExcelJS.CellValue): number | null {
  if (typeof value === "number") return value;
  const text = cellText(value).trim();
  if (!text) return 0;
  const negative = /^\(.*\)$/.test(text);
  const cleaned = text.replace(/[()]/g, "").replace(/[R\s,]/gi, "");
  if (!/^-?\d*\.?\d+$/.test(cleaned)) return null;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -parsed : parsed;
}

interface Header {
  columns: Map<ColumnKey, number>;
  /** Everything above this is report furniture ("Item:", "Category:", "Date:"). */
  rowNumber: number;
  /** Highest populated column in the header — the expected field count per row. */
  width: number;
  headings: string[];
}

function findHeader(sheet: ExcelJS.Worksheet): Header | null {
  const limit = Math.min(sheet.rowCount, 40);
  for (let rowNumber = 1; rowNumber <= limit; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const found = new Map<ColumnKey, number>();
    const headings: string[] = [];

    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const text = cellText(cell.value).trim();
      if (!text) return;
      headings.push(text);
      const key = wordKey(text);
      for (const column of Object.keys(COLUMN_KEYS) as ColumnKey[]) {
        if (!found.has(column) && COLUMN_KEYS[column].has(key)) {
          found.set(column, colNumber);
        }
      }
    });

    // Code + description + a price column is enough to be confident.
    if (found.has("code") && found.has("description") && found.has("exclPrice")) {
      return { columns: found, rowNumber, width: row.cellCount, headings };
    }
  }
  return null;
}

function pickSheet(workbook: ExcelJS.Workbook) {
  const preferred = workbook.worksheets.find((sheet) =>
    /stock list|item listing|item export/i.test(sheet.name)
  );
  const ordered = preferred
    ? [preferred, ...workbook.worksheets.filter((s) => s !== preferred)]
    : workbook.worksheets;

  let lastHeadings: string[] = [];
  for (const sheet of ordered) {
    const header = findHeader(sheet);
    if (header) return { sheet, header };
    // Remember something to show the user if nothing matches anywhere.
    const first = sheet.getRow(1);
    const seen: string[] = [];
    first.eachCell({ includeEmpty: false }, (cell) => {
      const text = cellText(cell.value).trim();
      if (text) seen.push(text);
    });
    if (seen.length > lastHeadings.length) lastHeadings = seen;
  }
  return { sheet: null, header: null, lastHeadings };
}

export async function parseCatalogue(
  data: Buffer | ArrayBuffer,
  filename = ""
): Promise<ParsedCatalogue> {
  const workbook = new ExcelJS.Workbook();
  // Buffer.isBuffer is a real type guard; `instanceof Buffer` does not narrow against
  // the generic Buffer<ArrayBufferLike> that current @types/node declares.
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(new Uint8Array(data));
  const isCsv = /\.csv$/i.test(filename);

  if (isCsv) {
    const { Readable } = await import("node:stream");
    await workbook.csv.read(Readable.from(buffer));
  } else {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  }

  const picked = pickSheet(workbook);
  if (!picked.sheet || !picked.header) {
    const seen = picked.lastHeadings?.length
      ? ` Found: ${picked.lastHeadings.join(", ")}.`
      : "";
    throw new Error(
      "Couldn't find the item listing columns. Need a Code column, a Description " +
        `column and a price column (e.g. "Price Excl." or "Excl. Price").${seen}`
    );
  }
  const { sheet, header } = picked;

  const items: CatalogueItem[] = [];
  const seenCodes = new Set<string>();
  let repaired = 0;
  const skipped: string[] = [];

  const descriptionIndex = header.columns.get("description") ?? 2;
  const gpColumn = header.columns.get("gpAmount");

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= header.rowNumber) return;

    /*
     * The CSV export does not quote descriptions, so any description containing a
     * comma splits into extra fields and pushes every later column right. Only the
     * description can overflow, so the columns after it are re-read from the right —
     * which realigns the row exactly. Not applied to spreadsheets: there is no
     * delimiter to misparse there, and a sheet's used range is wider than its
     * populated columns, which would make this shift nonsense.
     */
    const overflow = isCsv ? Math.max(0, row.cellCount - header.width) : 0;
    const at = (column: ColumnKey) => {
      const index = header.columns.get(column);
      if (index === undefined) return null;
      const shifted = index > descriptionIndex ? index + overflow : index;
      return row.getCell(shifted).value;
    };

    const code = cellText(at("code")).trim();
    if (!code) return;
    if (wordKey(code) === "code") return; // header repeated at a page break

    const key = code.toUpperCase();
    if (seenCodes.has(key)) return;

    // Description absorbs the overflow fields it was split into.
    let description = cellText(at("description")).trim();
    if (overflow > 0) {
      repaired += 1;
      const parts: string[] = [];
      for (let i = descriptionIndex; i <= descriptionIndex + overflow; i += 1) {
        const part = cellText(row.getCell(i).value).trim();
        if (part) parts.push(part);
      }
      description = parts.join(", ");
    }

    const exclPrice = strictNumber(at("exclPrice"));
    const avgCost = strictNumber(at("avgCost"));

    // A row whose money columns aren't numbers is misaligned beyond repair. Dropping
    // it is the only safe option: importing zeros would make the full selling price
    // look like margin and overpay commission on it.
    if (exclPrice === null || avgCost === null) {
      skipped.push(code);
      return;
    }

    seenCodes.add(key);

    const gpAmount = gpColumn ? strictNumber(at("gpAmount")) : null;

    items.push({
      code,
      description,
      category: cellText(at("category")).trim(),
      avgCost,
      exclPrice,
      // Prefer the report's own GP Amount so the figures agree with the paper; when
      // the export omits it, derive it the same way Sage does.
      gpAmount: gpAmount ?? exclPrice - avgCost,
    });
  });

  return {
    items,
    sheetName: sheet.name,
    headings: header.headings,
    summary: {
      itemCount: items.length,
      zeroPriceCount: items.filter((item) => item.exclPrice === 0).length,
      nonPositiveGpCount: items.filter((item) => item.gpAmount <= 0).length,
      repairedCount: repaired,
      skippedCodes: skipped,
      gpDerived: !gpColumn,
    },
  };
}
