/**
 * Reads a bank statement export into normalised transaction lines.
 *
 * Every South African bank exports a different shape. FNB writes a single signed
 * `Amount`; Nedbank writes `Debit` and `Credit`; Capitec writes `Money In` and
 * `Money Out`; Standard Bank does either depending on which screen you exported
 * from. Rather than a parser per bank, columns are matched on their WORD SET and
 * normalised to one convention: **positive is money into the account**. Downstream
 * code never has to know which bank produced the file.
 *
 * THREE THINGS THIS FILE EXISTS TO GET RIGHT:
 *
 * 1. DEDUPLICATION. Statement exports overlap — pull "last 60 days" twice a month
 *    and most rows arrive again. A duplicated receipt tells a client they have paid
 *    when they have not. Every line gets a deterministic fingerprint, and the
 *    fingerprint includes an OCCURRENCE INDEX so that two clients paying R299 on the
 *    same day with the identical narration "DEBIT ORDER" are correctly read as two
 *    payments rather than one payment imported twice.
 *
 * 2. DATE AMBIGUITY. 03/07/2026 is 3 July in South Africa and 7 March in a US
 *    export. Guessing wrong shifts payments into the wrong month and breaks the age
 *    analysis. The order is therefore detected across the WHOLE FILE — if any row
 *    has a first component above 12 the file is dd/mm, if any has a second component
 *    above 12 it is mm/dd — rather than decided row by row.
 *
 * 3. COMPLETENESS. When the export carries a running balance, consecutive rows must
 *    differ by exactly the transaction amount. If they don't, the file is missing
 *    rows or is out of order, and importing it would silently understate what the
 *    business received. That is reported rather than assumed away.
 */

export type AmountConvention = "signed" | "debit_credit";

export interface StatementLine {
  /** ISO date, yyyy-mm-dd. */
  date: string;
  description: string;
  reference: string;
  /** Positive into the account, negative out. */
  amount: number;
  /** The running balance the statement printed, when it gave one. */
  balance: number | null;
  fingerprint: string;
  /** Row number in the source file, for error messages. */
  sourceRow: number;
}

export interface StatementWarning {
  kind: "balance_gap" | "unparsed_row" | "no_balance_column" | "date_ambiguous";
  detail: string;
}

export interface StatementSummary {
  rowsRead: number;
  parsed: number;
  skipped: number;
  dateFrom: string | null;
  dateTo: string | null;
  totalIn: number;
  totalOut: number;
  convention: AmountConvention;
  /** How dates in this file were read, so a mis-detection is visible. */
  dateOrder: "dmy" | "mdy" | "ymd";
  headings: string[];
  warnings: StatementWarning[];
}

export interface ParsedStatement {
  lines: StatementLine[];
  summary: StatementSummary;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/* ------------------------------------------------------------------ *
 * CSV
 * ------------------------------------------------------------------ */

/** RFC-4180 aware split; quoted fields may contain the delimiter and newlines. */
function splitDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/**
 * Pick the delimiter by scoring candidates across the first few lines.
 *
 * Unlike the client import, a bank statement's header is not reliably the first
 * line — exports often begin with account details and blank rows. So the delimiter
 * is chosen by which one yields the most CONSISTENT column count across the sample,
 * which is what a real table looks like.
 */
function sniffDelimiter(text: string): string {
  const sample = text.split("\n").slice(0, 40).filter((l) => l.trim());
  let best = ",";
  let bestScore = -1;
  for (const d of [",", ";", "\t", "|"]) {
    const counts = sample.map((l) => l.split(d).length);
    const max = Math.max(...counts, 0);
    if (max < 2) continue;
    // Reward many columns appearing on many lines.
    const modal = counts.filter((c) => c === max).length;
    const score = max * modal;
    if (score > bestScore) {
      best = d;
      bestScore = score;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * Columns
 * ------------------------------------------------------------------ */

const COLUMNS: Record<string, string[][]> = {
  date: [
    ["date"],
    ["transaction", "date"],
    ["txn", "date"],
    ["posting", "date"],
    ["value", "date"],
    ["effective", "date"],
  ],
  description: [
    ["description"],
    ["narrative"],
    ["details"],
    ["transaction", "description"],
    ["particulars"],
    ["memo"],
  ],
  reference: [["reference"], ["ref"], ["payment", "reference"], ["their", "reference"]],
  amount: [["amount"], ["transaction", "amount"], ["value"]],
  debit: [["debit"], ["money", "out"], ["debits"], ["withdrawal"], ["paid", "out"]],
  credit: [["credit"], ["money", "in"], ["credits"], ["deposit"], ["paid", "in"]],
  balance: [["balance"], ["running", "balance"], ["closing", "balance"]],
};

const words = (h: string) =>
  h.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

function matchColumns(headings: string[]): Record<string, number> {
  const found: Record<string, number> = {};
  const hw = headings.map(words);
  for (const [field, accepted] of Object.entries(COLUMNS)) {
    const ranked = [...accepted].sort((a, b) => b.length - a.length);
    for (const wanted of ranked) {
      const idx = hw.findIndex(
        (h) => h.length === wanted.length && wanted.every((w) => h.includes(w))
      );
      if (idx >= 0 && !Object.values(found).includes(idx)) {
        found[field] = idx;
        break;
      }
    }
  }
  return found;
}

/* ------------------------------------------------------------------ *
 * Values
 * ------------------------------------------------------------------ */

/**
 * Read a bank's money string.
 *
 * Handles `R1 234.56`, `1,234.56`, `(1234.56)` for negative, a trailing minus, and
 * `Cr`/`Dr` suffixes. Returns null for a genuinely empty cell so an empty Debit
 * column is distinguishable from a zero.
 */
export function parseAmount(raw: string): number | null {
  let s = raw.trim();
  if (!s) return null;

  let sign = 1;
  if (/^\(.*\)$/.test(s)) {
    sign = -1;
    s = s.slice(1, -1);
  }
  if (/\bdr\b/i.test(s)) sign = -1;
  if (/\bcr\b/i.test(s)) sign = 1;
  s = s.replace(/\b[cd]r\b/gi, "");

  if (/-\s*$/.test(s)) {
    sign = -1;
    s = s.replace(/-\s*$/, "");
  }
  if (/^\s*-/.test(s)) {
    sign = -1;
    s = s.replace(/^\s*-/, "");
  }

  s = s.replace(/[R\s ]/gi, "");
  // A comma is a thousands separator when followed by exactly three digits and
  // something else follows; otherwise treat it as a decimal comma.
  if (/,\d{3}(\D|$)/.test(s)) s = s.replace(/,/g, "");
  else s = s.replace(",", ".");

  if (!/^\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? round2(sign * n) : null;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

interface RawDate {
  a: number;
  b: number;
  year: number;
  /** True when the format itself removed the ambiguity. */
  resolved?: { month: number; day: number };
}

/** Split a date into parts without deciding day/month order yet. */
function splitDate(raw: string): RawDate | null {
  const s = raw.trim();
  if (!s) return null;

  // 01 Jul 2026 / 1-Jul-26 — unambiguous.
  const named = s.match(/^(\d{1,2})[\s\-/]*([A-Za-z]{3,})[\s\-/]*(\d{2,4})$/);
  if (named) {
    const m = MONTHS[named[2].slice(0, 3).toLowerCase()];
    if (m) {
      return {
        a: 0, b: 0,
        year: normaliseYear(Number(named[3])),
        resolved: { month: m, day: Number(named[1]) },
      };
    }
  }

  // yyyy-mm-dd or yyyy/mm/dd — unambiguous.
  const iso = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso) {
    return {
      a: 0, b: 0,
      year: Number(iso[1]),
      resolved: { month: Number(iso[2]), day: Number(iso[3]) },
    };
  }

  // yyyymmdd
  const compact = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) {
    return {
      a: 0, b: 0,
      year: Number(compact[1]),
      resolved: { month: Number(compact[2]), day: Number(compact[3]) },
    };
  }

  // dd/mm/yyyy or mm/dd/yyyy — ambiguous, decided file-wide.
  const slash = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (slash) {
    return { a: Number(slash[1]), b: Number(slash[2]), year: normaliseYear(Number(slash[3])) };
  }
  return null;
}

function normaliseYear(y: number): number {
  if (y >= 1000) return y;
  // A two-digit year on a bank statement is this century.
  return y + (y < 70 ? 2000 : 1900);
}

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/* ------------------------------------------------------------------ *
 * Fingerprint
 * ------------------------------------------------------------------ */

/** FNV-1a, for a short stable hash of the narration. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * A line's identity, stable across re-exports of the same period.
 *
 * `occurrence` distinguishes genuinely identical same-day transactions — two clients
 * paying R299 with the same narration — from the same transaction imported twice.
 * It is derived from the line's position among its identical siblings within the
 * file, which is stable as long as the bank exports them in the same order (it does;
 * they are ordered by posting sequence).
 */
export function fingerprintFor(
  date: string,
  amount: number,
  description: string,
  occurrence: number
): string {
  const norm = description.replace(/\s+/g, " ").trim().toUpperCase();
  return `${date}|${Math.round(amount * 100)}|${hash(norm)}|${occurrence}`;
}

/* ------------------------------------------------------------------ *
 * The parse
 * ------------------------------------------------------------------ */

export function parseStatement(text: string, filename = "statement.csv"): ParsedStatement {
  void filename;
  let body = text;
  if (body.charCodeAt(0) === 0xfeff) body = body.slice(1);

  const grid = splitDelimited(body, sniffDelimiter(body));

  // The header is found by its column names, not assumed to be row 1 — exports
  // routinely begin with account details and blank rows.
  let headerIndex = -1;
  let columns: Record<string, number> = {};
  for (let i = 0; i < Math.min(grid.length, 40); i += 1) {
    const candidate = matchColumns(grid[i].map((c) => c.trim()));
    const hasMoney =
      candidate.amount !== undefined ||
      candidate.debit !== undefined ||
      candidate.credit !== undefined;
    if (candidate.date !== undefined && hasMoney) {
      headerIndex = i;
      columns = candidate;
      break;
    }
  }

  if (headerIndex < 0) {
    throw new Error(
      "Couldn't find the transaction table in that file — expected a header row with " +
        "a Date column and either an Amount column or Debit/Credit columns. " +
        (grid[0]?.length
          ? `First row read: ${grid[0].slice(0, 8).join(" | ")}`
          : "The file appears to be empty.")
    );
  }

  const headings = grid[headerIndex].map((c) => c.trim());
  const convention: AmountConvention =
    columns.amount !== undefined ? "signed" : "debit_credit";

  const cell = (row: string[], field: string) => {
    const i = columns[field];
    return i === undefined ? "" : (row[i] ?? "").trim();
  };

  const warnings: StatementWarning[] = [];

  // --- pass 1: read raw rows and decide the date order across the whole file ---
  interface Raw {
    parts: RawDate;
    description: string;
    reference: string;
    amount: number;
    balance: number | null;
    sourceRow: number;
  }
  const raws: Raw[] = [];
  let rowsRead = 0;
  let skipped = 0;

  for (let i = headerIndex + 1; i < grid.length; i += 1) {
    const row = grid[i];
    if (!row.some((c) => c.trim())) continue;
    rowsRead += 1;

    const parts = splitDate(cell(row, "date"));
    if (!parts) {
      skipped += 1;
      continue;
    }

    let amount: number | null;
    if (convention === "signed") {
      amount = parseAmount(cell(row, "amount"));
    } else {
      const debit = parseAmount(cell(row, "debit"));
      const credit = parseAmount(cell(row, "credit"));
      // Whichever side carries a value wins; banks are inconsistent about whether
      // the debit column is already negative, so magnitude is taken and re-signed.
      if (credit !== null && credit !== 0) amount = Math.abs(credit);
      else if (debit !== null && debit !== 0) amount = -Math.abs(debit);
      else amount = null;
    }
    if (amount === null) {
      skipped += 1;
      warnings.push({
        kind: "unparsed_row",
        detail: `Row ${i + 1}: no readable amount (${row.slice(0, 4).join(" | ")})`,
      });
      continue;
    }

    raws.push({
      parts,
      description: cell(row, "description"),
      reference: cell(row, "reference"),
      amount,
      balance: parseAmount(cell(row, "balance")),
      sourceRow: i + 1,
    });
  }

  // Ambiguous dd/mm vs mm/dd, decided once for the file.
  let dateOrder: "dmy" | "mdy" | "ymd" = "dmy";
  const ambiguous = raws.filter((r) => !r.parts.resolved);
  if (ambiguous.length) {
    const firstOver12 = ambiguous.some((r) => r.parts.a > 12);
    const secondOver12 = ambiguous.some((r) => r.parts.b > 12);
    if (secondOver12 && !firstOver12) dateOrder = "mdy";
    else dateOrder = "dmy";
    if (!firstOver12 && !secondOver12) {
      // Every row could be read either way. South African exports are dd/mm, so that
      // is the assumption — but say so, because a wrong guess moves money between
      // months and quietly distorts the age analysis.
      warnings.push({
        kind: "date_ambiguous",
        detail:
          "Every date in this file works as either dd/mm or mm/dd. Read as dd/mm " +
          "(South African format). Check a known payment date before relying on it.",
      });
    }
  } else if (raws.length) {
    dateOrder = "ymd";
  }

  // --- pass 2: resolve dates, fingerprint, verify the running balance ---
  const occurrences = new Map<string, number>();
  const lines: StatementLine[] = [];

  for (const raw of raws) {
    const { parts } = raw;
    const month = parts.resolved
      ? parts.resolved.month
      : dateOrder === "dmy"
        ? parts.b
        : parts.a;
    const day = parts.resolved ? parts.resolved.day : dateOrder === "dmy" ? parts.a : parts.b;

    if (month < 1 || month > 12 || day < 1 || day > 31) {
      skipped += 1;
      warnings.push({
        kind: "unparsed_row",
        detail: `Row ${raw.sourceRow}: date ${day}/${month}/${parts.year} isn't a real date.`,
      });
      continue;
    }

    const date = iso(parts.year, month, day);
    const key = `${date}|${Math.round(raw.amount * 100)}|${raw.description.replace(/\s+/g, " ").trim().toUpperCase()}`;
    const occurrence = (occurrences.get(key) ?? 0) + 1;
    occurrences.set(key, occurrence);

    lines.push({
      date,
      description: raw.description,
      reference: raw.reference,
      amount: raw.amount,
      balance: raw.balance,
      fingerprint: fingerprintFor(date, raw.amount, raw.description, occurrence),
      sourceRow: raw.sourceRow,
    });
  }

  // Completeness: consecutive printed balances must differ by the amount between
  // them. A gap means rows are missing from the export.
  const withBalance = lines.filter((l) => l.balance !== null);
  if (withBalance.length < 2) {
    warnings.push({
      kind: "no_balance_column",
      detail:
        "This export has no running balance, so the import can't verify that every " +
        "transaction in the period is present.",
    });
  } else {
    for (let i = 1; i < withBalance.length; i += 1) {
      const prev = withBalance[i - 1];
      const cur = withBalance[i];
      const expected = round2((prev.balance ?? 0) + cur.amount);
      if (Math.abs(expected - (cur.balance ?? 0)) > 0.01) {
        warnings.push({
          kind: "balance_gap",
          detail:
            `Row ${cur.sourceRow}: balance jumps from ${prev.balance} to ${cur.balance}, ` +
            `but the transaction is ${cur.amount}. Rows are probably missing from this export.`,
        });
        break; // One report is enough; the file needs re-exporting either way.
      }
    }
  }

  const dates = lines.map((l) => l.date).sort();

  return {
    lines,
    summary: {
      rowsRead,
      parsed: lines.length,
      skipped,
      dateFrom: dates[0] ?? null,
      dateTo: dates[dates.length - 1] ?? null,
      totalIn: round2(lines.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0)),
      totalOut: round2(lines.filter((l) => l.amount < 0).reduce((s, l) => s + l.amount, 0)),
      convention,
      dateOrder,
      headings,
      warnings,
    },
  };
}
