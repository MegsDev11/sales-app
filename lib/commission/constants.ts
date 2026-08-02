/**
 * Shared commission vocabulary and response shapes.
 *
 * Mirrors lib/procurement/constants.ts: the generated Database types don't know
 * about the migration 049 tables, so the API talks to an untyped client and the
 * shapes are pinned here instead.
 *
 * BACKGROUND — how commission was worked out before this module existed, taken
 * from `May 2026.xlsx` and verified line by line against the Sage item listing:
 *
 *   markup per line = the stock list's `GP Amount` column × quantity
 *   commission      = 10% × Σ markup, with LABOUR / TRAVEL / SUNDRIES / INSTALL excluded
 *
 * `GP Amount` is `Excl. Price − Avg. Cost` — the profit on the CATALOGUE price, not
 * on what the item actually sold for. That is the flaw this module exists to fix, so
 * both bases are always computed and the difference is always shown.
 */

export const VAT_RATE = 0.15;

/** Invoices are priced ex-VAT; ×100/115 converts an inclusive figure back. */
export const VAT_DIVISOR = 1 + VAT_RATE;

export type MarkupBasis = "as_invoiced" | "catalogue";

export const MARKUP_BASES: { value: MarkupBasis; label: string; blurb: string }[] = [
  {
    value: "as_invoiced",
    label: "As invoiced",
    blurb: "Profit actually achieved — (sold price after discount − cost) × qty.",
  },
  {
    value: "catalogue",
    // Named for the price list's own column, which is where the figure comes from.
    // The stored value stays "catalogue" — it is on every saved invoice row.
    label: "GP Amount",
    blurb: "The old spreadsheet method — GP Amount × qty, ignoring what it sold for.",
  },
];

/**
 * Codes that never earn commission. Seeded from the spreadsheet, where these lines
 * were left blank in the markup column by hand every single time.
 */
export const DEFAULT_EXCLUDED_CODES = ["LABOUR", "TRAVEL", "INSTALL", "SUNDRIES"];

/**
 * Seeded because the invoice and the stock list genuinely disagree on this one:
 * invoices bill Cat5e as TC-305, the catalogue calls it CABLE CAT5. Same product,
 * same R12.61 list price.
 */
export const SEED_CODE_ALIASES: { from: string; to: string }[] = [
  { from: "TC-305", to: "CABLE CAT5" },
];

export type LineFlag =
  /** Code isn't in the catalogue at all — can't price the markup. */
  | "unmatched_code"
  /** Catalogue row is stale: zero list price, or GP ≤ 0. */
  | "stale_catalogue"
  /** Sold for less than it cost. */
  | "below_cost"
  /** Sold at a price that isn't the catalogue list price. */
  | "off_list_price";

export const FLAG_LABELS: Record<LineFlag, string> = {
  unmatched_code: "Not in price list",
  stale_catalogue: "Price list row looks stale",
  below_cost: "Sold below cost",
  off_list_price: "Sold off list price",
};

/**
 * Flags material enough to hold up a payout. `off_list_price` is informational —
 * selling off list is normal and would otherwise drown the review strip in noise.
 */
export const REVIEW_FLAGS: LineFlag[] = [
  "unmatched_code",
  "stale_catalogue",
  "below_cost",
];

export function needsReview(flags: readonly LineFlag[]): boolean {
  return flags.some((flag) => REVIEW_FLAGS.includes(flag));
}

/* ---------- Parsed invoice ---------- */

export interface ParsedInvoiceLine {
  lineIndex: number;
  code: string;
  description: string;
  qty: number;
  /** Excl. VAT, BEFORE the line discount. */
  unitPrice: number;
  discountPct: number;
  vatPct: number;
  /** Excl. VAT, AFTER the line discount, as printed on the invoice. */
  exclTotal: number;
  inclTotal: number;
}

export interface ParsedInvoice {
  invoiceNumber: string;
  /** ISO yyyy-mm-dd, or null if the header date couldn't be read. */
  invoiceDate: string | null;
  reference: string;
  clientName: string;
  /**
   * The `SALES REP:` printed in the header. This is who did the INSTALL, not who
   * earns the commission — confirmed by the client. Captured for context only and
   * deliberately never fed into attribution.
   */
  installerName: string;
  lines: ParsedInvoiceLine[];
  statedExclTotal: number | null;
  parsedExclTotal: number;
  /** Parsed lines add up to the invoice's own stated total. */
  reconciles: boolean;
}

/* ---------- Catalogue ---------- */

export interface CatalogueItem {
  code: string;
  description: string;
  category: string;
  avgCost: number;
  exclPrice: number;
  /** `Excl. Price − Avg. Cost`, straight off the Item Listing Report. */
  gpAmount: number;
}

export interface CatalogueImportSummary {
  itemCount: number;
  /** Rows that will misprice a catalogue-basis calculation. */
  zeroPriceCount: number;
  nonPositiveGpCount: number;
  /**
   * Rows realigned after the CSV export split an unquoted description across
   * several fields. Reported so a silent repair never passes for a clean read.
   */
  repairedCount: number;
  /** Codes dropped because their money columns weren't numbers. */
  skippedCodes: string[];
  /** True when the export had no GP column and margin was derived from price − cost. */
  gpDerived: boolean;
}

/* ---------- Calculation ---------- */

export interface CommissionLine extends ParsedInvoiceLine {
  /** Catalogue code this resolved to, after alias lookup. Null when unmatched. */
  matchedCode: string | null;
  /** A likely catalogue match found by description, for the review strip. Never auto-applied. */
  suggestedCode: string | null;
  avgCost: number | null;
  catalogueGpUnit: number | null;
  /** Unit price after the line discount. */
  netUnitPrice: number;
  catalogueMarkup: number | null;
  asInvoicedMarkup: number | null;
  /** Markup under the chosen basis; null when it can't be determined. */
  commissionableMarkup: number | null;
  commission: number;
  excluded: boolean;
  flags: LineFlag[];
}

export interface CommissionTotals {
  revenueExcl: number;
  catalogueMarkup: number;
  asInvoicedMarkup: number;
  catalogueCommission: number;
  asInvoicedCommission: number;
  /** Commission under the chosen basis. */
  commission: number;
  /** chosen − the other basis. Positive means the chosen basis pays more. */
  variance: number;
}

export interface CommissionResult {
  basis: MarkupBasis;
  installRate: number;
  lines: CommissionLine[];
  totals: CommissionTotals;
  /** Lines carrying any flag — surfaced, never silently zeroed. */
  needsReview: CommissionLine[];
}

/* ---------- Persisted rows ---------- */

export interface CommissionRule {
  id: string;
  /** Null is the company default; a rep id overrides it. */
  rep_id: string | null;
  install_rate: number;
  /**
   * Recurring revenue a rep must generate in a month before earning (Phase 2).
   * Herman R15,000, Marlyna R10,000.
   */
  monthly_threshold: number;
  fixed_addition: number;
  markup_basis: MarkupBasis;
  effective_from: string;
  note: string;
}

/**
 * PHASE 2 RULE — recurring commission is earned ONCE PER SUBSCRIPTION, in the month
 * that subscription goes live. It is NOT an annuity: a client signed in March counts
 * towards March and never again, even though they keep paying every month.
 *
 * Whoever builds the recurring half must enforce this at the data layer — one
 * commissionable row per subscription, ever — not merely by filtering on a date
 * range, or a re-import or a corrected live-date will pay the same client twice.
 */
export const RECURRING_EARNED_ONCE = true;

export interface CommissionInvoiceRow {
  id: string;
  ref: string;
  invoice_number: string;
  invoice_date: string | null;
  client_name: string;
  installer_name: string;
  rep_id: string | null;
  basis: MarkupBasis;
  install_rate: number;
  revenue_excl: number;
  catalogue_markup: number;
  as_invoiced_markup: number;
  catalogue_commission: number;
  as_invoiced_commission: number;
  commission: number;
  status: "draft" | "approved";
  source_filename: string;
  catalogue_import_id: string | null;
  /** Parsed lines added up to the invoice's own printed total. */
  reconciled: boolean;
  stated_excl_total: number | null;
  /** How many lines carried a review flag when this was priced. */
  review_count: number;
  created_at: string;
}

export function fmtMoney(value: number, currency = "ZAR") {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Round to cents without float drift creeping into a payout. */
export function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Codes are compared case- and space-insensitively. The invoice and the catalogue
 * are keyed by hand in two different systems, so `ALLU POLE 6M` and `allu pole 6m`
 * are the same product.
 */
export function normaliseCode(code: string) {
  return code.trim().toUpperCase().replace(/\s+/g, " ");
}

/** Looser key for matching: drops every separator. `FLY-6-1` === `FLY 6 1`. */
export function looseCode(code: string) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
