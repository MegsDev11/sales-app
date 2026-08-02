import ExcelJS from "exceljs";
import {
  round2,
  type BillingStatus,
  type ClientImportSummary,
  type ClientIssue,
  type ParsedClient,
} from "./constants";

/**
 * Reads the Sage "Megs Kliente lys" customer export into structured clients.
 *
 * Two jobs, and the second is the reason this file is long.
 *
 * 1. READ THE FILE. Sage exports this as semicolon-separated CSV, but the same report
 *    can come out comma-separated or as .xlsx depending on who exports it. The
 *    delimiter is therefore sniffed rather than assumed, and columns are matched on
 *    their WORD SET (as lib/commission/parse-catalogue.ts does) so a reordered or
 *    renamed column cannot silently shift phone numbers into the email field.
 *
 * 2. UNPACK THE `Staff` COLUMN. See lib/accounts/constants.ts for why this matters.
 *    One free-text column encodes billing arrangement, owning clerk and account
 *    status, and the whole department is unusable until they are three fields.
 *
 * The guiding rule throughout: DERIVE, NEVER DISCARD, AND NEVER GUESS. The original
 * cell is always kept in `staffRaw`, and any value the rules don't positively
 * recognise becomes `unclassified` — which bills nobody — rather than being rounded
 * to the nearest plausible status. Billing a cancelled client is a refund and an
 * apology; missing one is a phone call.
 */

/* ------------------------------------------------------------------ *
 * CSV reading
 * ------------------------------------------------------------------ */

/**
 * Split CSV text into rows of cells, honouring RFC-4180 quoting.
 *
 * Written out rather than delegated to ExcelJS's CSV path because that path wants the
 * delimiter up front, and this export's delimiter varies. Quoted fields may contain
 * the delimiter, newlines and doubled quotes — client names like
 * `A&C De Jager T/A "Wegbreek"` do occur.
 */
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
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/**
 * Pick the delimiter by counting candidates in the header line only.
 *
 * The header is the one line guaranteed free of free-text commas, so counting there
 * rather than across the file avoids being fooled by a client called "Smith, J".
 */
function sniffDelimiter(text: string): string {
  const header = text.slice(0, text.indexOf("\n") + 1 || text.length);
  const candidates = [";", ",", "\t", "|"];
  let best = ";";
  let bestCount = 0;
  for (const d of candidates) {
    const count = header.split(d).length - 1;
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

/** Read .xlsx through ExcelJS; anything else as delimited text. */
async function readGrid(
  data: Uint8Array | ArrayBuffer,
  filename: string
): Promise<string[][]> {
  const bytes = new Uint8Array(data as ArrayBufferLike);

  if (/\.xlsx?$/i.test(filename)) {
    const workbook = new ExcelJS.Workbook();
    // ExcelJS wants a Node Buffer-like ArrayBuffer; a plain view is accepted.
    await workbook.xlsx.load(bytes as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) return [];
    const rows: string[][] = [];
    sheet.eachRow({ includeEmpty: true }, (row) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => {
        const v = cell.value;
        if (v === null || v === undefined) cells.push("");
        else if (typeof v === "object" && "text" in v) cells.push(String(v.text ?? ""));
        else if (typeof v === "object" && "result" in v)
          cells.push(String((v as { result?: unknown }).result ?? ""));
        else cells.push(String(v));
      });
      rows.push(cells);
    });
    return rows;
  }

  // Strip a UTF-8 BOM; Sage writes one and it would otherwise glue itself to the
  // first heading, breaking the "Name" match.
  let text = new TextDecoder("utf-8").decode(bytes);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return splitDelimited(text, sniffDelimiter(text));
}

/* ------------------------------------------------------------------ *
 * Column matching
 * ------------------------------------------------------------------ */

/** Accepted headings as word sets, so order and punctuation don't matter. */
const COLUMNS: Record<string, string[][]> = {
  name: [["name"], ["customer"], ["customer", "name"], ["account", "name"]],
  staff: [["staff"], ["staff", "member"], ["group"]],
  balance: [["balance"], ["balance", "due"], ["outstanding"]],
  contactName: [["contact", "name"], ["contact"], ["contact", "person"]],
  tel: [["tel", "number"], ["tel"], ["telephone"], ["landline"]],
  mobile: [["mobile", "number"], ["mobile"], ["cell"], ["cell", "number"]],
  email: [["email"], ["e", "mail"], ["email", "address"]],
  salesRep: [["sales", "rep"], ["rep"], ["sales", "person"]],
  pppoe: [["username", "pppoe"], ["pppoe"], ["pppoe", "username"], ["username"]],
  packages: [["packages"], ["package"], ["product"], ["service"]],
};

const words = (heading: string) =>
  heading
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

function matchColumns(headings: string[]): Record<string, number> {
  const found: Record<string, number> = {};
  const headingWords = headings.map(words);

  for (const [field, accepted] of Object.entries(COLUMNS)) {
    // Longest word-set first: "contact name" must win over bare "contact".
    const ranked = [...accepted].sort((a, b) => b.length - a.length);
    for (const wanted of ranked) {
      const index = headingWords.findIndex(
        (hw) =>
          hw.length === wanted.length && wanted.every((w) => hw.includes(w))
      );
      if (index >= 0 && !Object.values(found).includes(index)) {
        found[field] = index;
        break;
      }
    }
  }
  return found;
}

/* ------------------------------------------------------------------ *
 * The `Staff` column
 * ------------------------------------------------------------------ */

/**
 * Accounts clerks, keyed by the spellings Sage actually contains.
 *
 * The display name is what signs an invoice email, so it carries the full name and
 * the correct accents. These were read off the same export (the `Sales Rep` column
 * spells several of them out) and should be confirmed by the department — the
 * importer never invents a person, it only maps a spelling it has already seen.
 */
const OWNERS: { match: string[]; name: string }[] = [
  { match: ["leane", "leané", "leane v deventer"], name: "Leané van Deventer" },
  { match: ["meg vd walt", "meg v d walt", "meg van der walt"], name: "Meg van der Walt" },
  { match: ["santi", "santi bessinger"], name: "Santi Bessinger" },
  { match: ["marily", "marily barnard"], name: "Marily Barnard" },
  { match: ["marlyna", "marlyna de villiers"], name: "Marlyna de Villiers" },
];

const OWNER_BY_KEY = new Map<string, string>();
for (const owner of OWNERS) {
  for (const spelling of owner.match) OWNER_BY_KEY.set(spelling, owner.name);
}

export const ACCOUNTS_OWNERS = OWNERS.map((o) => o.name);

/** Sites, towers, staff and head office — on the customer list but not customers. */
const INTERNAL = /\b(site|tower|technician|tech|head office|megs)\b/i;

export interface StaffClassification {
  billingStatus: BillingStatus;
  debitOrderDay: number | null;
  accountsOwner: string | null;
  seasonal: boolean;
  recognised: boolean;
}

/**
 * Turn one `Staff` cell into billing status, debit-order day and owning clerk.
 *
 * Rules are ordered, and the order is load-bearing:
 *
 *   - suspension beats cancellation, so "TEMP CANCELLED COVID" is temporarily off
 *     rather than gone, but "Temp Install" (temporary, not cancelled) is neither;
 *   - cancellation beats the red-client flag, so the combined bucket
 *     "Cancelled/Closed/Red client - All combined" reads as cancelled, while
 *     "EQUIPMENT UITHAAL - RED CLIENT" stays a red client;
 *   - a debit-order instruction or a clerk's name implies a live account, because
 *     nobody is assigned a debit-order day for a client who left.
 *
 * Anything else is `unclassified`, which is never billed.
 */
export function classifyStaff(raw: string): StaffClassification {
  const value = raw.trim();
  const lower = value.toLowerCase();

  const seasonal = /seasonal/.test(lower);

  const result = (
    billingStatus: BillingStatus,
    extra: Partial<StaffClassification> = {}
  ): StaffClassification => ({
    billingStatus,
    debitOrderDay: null,
    accountsOwner: null,
    seasonal,
    recognised: true,
    ...extra,
  });

  if (!value) {
    return { ...result("unclassified"), recognised: false };
  }

  // --- live account: a debit-order instruction ---
  const debit = lower.match(/(\d{1,2})\s*(?:st|nd|rd|th)?\s*debit\s*order/);
  if (debit) {
    const day = Number(debit[1]);
    if (day >= 1 && day <= 31) {
      return result("active", { debitOrderDay: day });
    }
  }
  if (/debit\s*order/.test(lower)) {
    // On debit order, but the day is unreadable — live, and someone should look.
    return { ...result("active"), recognised: false };
  }

  // --- live account: an owning clerk ---
  // "SANTI-SEASONAL USER" carries a name plus a qualifier, so try the leading token
  // as well as the whole cell before giving up.
  const ownerKey = lower.replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  const owner =
    OWNER_BY_KEY.get(ownerKey) ??
    OWNER_BY_KEY.get(ownerKey.split(" ")[0] ?? "") ??
    null;
  if (owner) {
    return result("active", { accountsOwner: owner });
  }

  // --- suspended (must precede cancelled) ---
  if (/suspend|on hold/.test(lower)) return result("temp_cancelled");
  if (/temp/.test(lower) && /cancel/.test(lower)) return result("temp_cancelled");

  // --- ended (must precede red client) ---
  if (/cancel|closed/.test(lower)) return result("cancelled");
  if (/deseased|deceased/.test(lower)) return result("deceased");
  if (/red\s*client/.test(lower)) return result("red_client");
  if (/duplicate/.test(lower)) return result("duplicate");

  // --- never started / never billed ---
  if (/quote/.test(lower)) return result("quote_only");
  if (/sponsor/.test(lower)) return result("sponsored");
  if (/one\s*time/.test(lower)) return result("one_time");

  // --- not a customer ---
  if (INTERNAL.test(lower)) return result("internal");

  // Seasonal with no other signal is still a live client, billed part of the year.
  if (seasonal) return result("active");

  return { ...result("unclassified"), recognised: false };
}

/* ------------------------------------------------------------------ *
 * Field cleaning
 * ------------------------------------------------------------------ */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/**
 * Pull every deliverable address out of one cell.
 *
 * The cell is usually one address, sometimes several, and occasionally a phone number
 * that was typed into the wrong column. A slash is only treated as a separator when
 * the cell holds more than one "@" — otherwise `faso/a64@yahoo.co.za`, which is one
 * (odd) address, would be torn in half.
 */
export function parseEmails(raw: string): { emails: string[]; invalid: boolean } {
  const value = raw.trim();
  if (!value) return { emails: [], invalid: false };

  const separators = value.split("@").length - 1 > 1 ? /[;,\s/]+|\sand\s/i : /[;,\s]+|\sand\s/i;
  const parts = value
    .split(separators)
    .map((p) => p.trim().replace(/^[<(]|[>)]$/g, ""))
    .filter(Boolean);

  const emails = parts.filter((p) => EMAIL_RE.test(p)).map((p) => p.toLowerCase());
  // Deduplicate while preserving the order they were listed in.
  const unique = [...new Set(emails)];
  return { emails: unique, invalid: unique.length === 0 };
}

/** Sage writes plain numbers with a dot decimal; thousands may be spaced or comma'd. */
export function parseMoney(raw: string): number | null {
  const cleaned = raw.trim().replace(/[R\s,]/gi, "");
  if (!cleaned) return 0;
  const value = Number(cleaned);
  return Number.isFinite(value) ? round2(value) : null;
}

export interface ParsedPackage {
  speedMbps: number | null;
  priceIncl: number | null;
}

/**
 * Read a speed and a monthly price out of the free-text `Packages` cell.
 *
 * The column was typed by hand over years, so the same package appears as
 * "20 Meg @ R299.00", "20 Mbps @ R299", "20M @ R299.00" and "50 Mpbs @ 399" — and
 * sometimes as "Museum", an IP address, or a note. Roughly one row in seven carries
 * no usable price, so the parser reports what it could not read instead of inventing
 * a figure: an invented price is an invoice sent for the wrong amount.
 */
export function parsePackage(raw: string): ParsedPackage {
  const value = raw.trim();
  if (!value) return { speedMbps: null, priceIncl: null };

  // Speed: a number followed by a megabit unit. "Mpbs" is a common typo in this data.
  // Anchored to a word boundary so the "2" of an IP address can't become a speed.
  const speedMatch = value.match(
    /(\d+(?:[.,]\d+)?)\s*(?:mbps|mpbs|mbit|mbps|megs?|mb|m)\b/i
  );
  const speedMbps = speedMatch ? Number(speedMatch[1].replace(",", ".")) : null;

  // Price: prefer whatever follows the last "@", which is how the column is written.
  // Otherwise search the whole cell minus the speed token, so "20 Meg" alone does not
  // report a price of 20.
  const afterAt = value.includes("@") ? value.slice(value.lastIndexOf("@") + 1) : null;
  const haystack =
    afterAt ?? (speedMatch ? value.replace(speedMatch[0], " ") : value);

  // R-prefixed first (unambiguous), then any decimal amount, then a bare integer.
  const priceMatch =
    haystack.match(/R\s*(\d[\d\s,]*(?:\.\d{1,2})?)/i) ??
    haystack.match(/(\d[\d\s,]*\.\d{1,2})/) ??
    (afterAt ? afterAt.match(/(\d[\d\s,]*)/) : null);

  let priceIncl: number | null = null;
  if (priceMatch) {
    const parsed = Number(priceMatch[1].replace(/[\s,]/g, ""));
    // A "price" under R10 is a stray digit, not a monthly subscription.
    if (Number.isFinite(parsed) && parsed >= 10) priceIncl = round2(parsed);
  }

  return { speedMbps, priceIncl };
}

/* ------------------------------------------------------------------ *
 * The import
 * ------------------------------------------------------------------ */

export interface ParsedClientFile {
  clients: ParsedClient[];
  summary: ClientImportSummary;
}

export async function parseClientExport(
  data: Uint8Array | ArrayBuffer,
  filename = "clients.csv"
): Promise<ParsedClientFile> {
  const grid = await readGrid(data, filename);

  // Find the header row by its column names rather than assuming row 1 — Sage
  // sometimes precedes the table with a title and a blank line.
  let headerIndex = -1;
  let columns: Record<string, number> = {};
  for (let i = 0; i < Math.min(grid.length, 25); i += 1) {
    const candidate = matchColumns(grid[i].map((c) => c.trim()));
    if (candidate.name !== undefined && Object.keys(candidate).length >= 3) {
      headerIndex = i;
      columns = candidate;
      break;
    }
  }

  const headings = headerIndex >= 0 ? grid[headerIndex].map((c) => c.trim()) : [];

  if (headerIndex < 0) {
    throw new Error(
      "Couldn't find the client table in that file — expected a header row with " +
        "at least Name, plus columns like Staff, Email and Packages. " +
        (grid[0]?.length
          ? `First row read: ${grid[0].slice(0, 8).join(" | ")}`
          : "The file appears to be empty.")
    );
  }

  const cell = (row: string[], field: string): string => {
    const index = columns[field];
    if (index === undefined) return "";
    return (row[index] ?? "").trim();
  };

  const byName = new Map<string, ParsedClient>();
  const duplicateNames: string[] = [];
  let rowsRead = 0;
  let skippedNoName = 0;

  for (let i = headerIndex + 1; i < grid.length; i += 1) {
    const row = grid[i];
    if (!row.some((c) => c.trim())) continue;
    rowsRead += 1;

    const name = cell(row, "name");
    if (!name) {
      skippedNoName += 1;
      continue;
    }

    const issues: ClientIssue[] = [];

    const staffRaw = cell(row, "staff");
    const staff = classifyStaff(staffRaw);
    if (!staff.recognised) {
      issues.push({
        kind: "unknown_staff",
        detail: staffRaw
          ? `"${staffRaw}" isn't a status this importer knows — not billed until classified.`
          : "No Staff value — not billed until classified.",
      });
    }

    const emailRaw = cell(row, "email");
    const { emails, invalid } = parseEmails(emailRaw);
    if (!emailRaw) {
      issues.push({ kind: "no_email", detail: "No address — can't be emailed an invoice." });
    } else if (invalid) {
      issues.push({
        kind: "invalid_email",
        detail: `"${emailRaw}" isn't an email address.`,
      });
    }

    const packageRaw = cell(row, "packages");
    const pkg = parsePackage(packageRaw);
    if (!packageRaw) {
      issues.push({ kind: "no_package", detail: "No package recorded." });
    } else if (pkg.priceIncl === null) {
      issues.push({
        kind: "package_unparsed",
        detail: `No monthly price could be read from "${packageRaw}".`,
      });
    }

    const balanceRaw = cell(row, "balance");
    const balance = parseMoney(balanceRaw);
    if (balance === null) {
      issues.push({ kind: "bad_balance", detail: `Balance "${balanceRaw}" isn't a number.` });
    }

    const client: ParsedClient = {
      name,
      staffRaw,
      billingStatus: staff.billingStatus,
      debitOrderDay: staff.debitOrderDay,
      accountsOwner: staff.accountsOwner,
      seasonal: staff.seasonal,
      contactName: cell(row, "contactName"),
      tel: cell(row, "tel"),
      mobile: cell(row, "mobile"),
      email: emails[0] ?? "",
      emails,
      emailRaw: invalid ? emailRaw : "",
      salesRep: cell(row, "salesRep"),
      pppoeUsername: cell(row, "pppoe"),
      packageRaw,
      packageSpeedMbps: pkg.speedMbps,
      packagePriceIncl: pkg.priceIncl,
      balance: balance ?? 0,
      issues,
    };

    // Sage keys customers by name, so a repeat is a genuine collision. Keep the last
    // occurrence (the later row is the more recently edited one) and report it.
    const key = name.toLowerCase();
    if (byName.has(key)) duplicateNames.push(name);
    byName.set(key, client);
  }

  const clients = [...byName.values()];

  const byStatus: Record<string, number> = {};
  const issueCounts: Record<string, number> = {};
  let totalOwing = 0;
  let totalCredit = 0;

  for (const c of clients) {
    byStatus[c.billingStatus] = (byStatus[c.billingStatus] ?? 0) + 1;
    for (const issue of c.issues) {
      issueCounts[issue.kind] = (issueCounts[issue.kind] ?? 0) + 1;
    }
    if (c.balance > 0) totalOwing += c.balance;
    else totalCredit += c.balance;
  }

  return {
    clients,
    summary: {
      rowsRead,
      parsed: clients.length,
      skippedNoName,
      duplicateNames,
      byStatus,
      billable: clients.filter((c) => c.billingStatus === "active").length,
      withEmail: clients.filter((c) => c.email).length,
      withPricedPackage: clients.filter((c) => c.packagePriceIncl !== null).length,
      issueCounts,
      totalOwing: round2(totalOwing),
      totalCredit: round2(totalCredit),
      headings,
    },
  };
}
