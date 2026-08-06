import {
  looseCode,
  needsReview,
  normaliseCode,
  round2,
  type CatalogueItem,
  type CommissionLine,
  type CommissionResult,
  type LineFlag,
  type MarkupBasis,
  type ParsedInvoice,
} from "./constants";

/**
 * Turns a parsed invoice into a commission figure.
 *
 * Pure — no database, no I/O — so it can be run directly against the real invoices
 * in scripts/verify-commission.ts and pinned to known-good numbers.
 *
 * Both bases are always computed, never just the chosen one, because the whole
 * point of the module is being able to see the gap between what the old
 * spreadsheet would have paid and what the work actually earned.
 */

export interface CalculateInput {
  invoice: ParsedInvoice;
  catalogue: CatalogueItem[];
  /** invoice code → catalogue code, for products the two systems name differently. */
  aliases?: { from: string; to: string }[];
  /** Codes that never earn commission (labour, travel, sundries, install). */
  excludedCodes?: string[];
  basis: MarkupBasis;
  installRate: number;
}

interface CatalogueIndex {
  byCode: Map<string, CatalogueItem>;
  byLoose: Map<string, CatalogueItem>;
  items: CatalogueItem[];
}

function indexCatalogue(catalogue: CatalogueItem[]): CatalogueIndex {
  const byCode = new Map<string, CatalogueItem>();
  const byLoose = new Map<string, CatalogueItem>();
  for (const item of catalogue) {
    const code = normaliseCode(item.code);
    if (!byCode.has(code)) byCode.set(code, item);
    const loose = looseCode(item.code);
    if (loose && !byLoose.has(loose)) byLoose.set(loose, item);
  }
  return { byCode, byLoose, items: catalogue };
}

/**
 * Resolve an invoice code to a catalogue row: exact, then alias, then a
 * separator-insensitive match. Description similarity is deliberately NOT used to
 * match automatically — it is offered as a suggestion instead, because a fuzzy
 * match that silently changes somebody's pay is worse than an unmatched line.
 */
function resolve(
  code: string,
  index: CatalogueIndex,
  aliasMap: Map<string, string>
): CatalogueItem | null {
  const exact = index.byCode.get(normaliseCode(code));
  if (exact) return exact;

  const aliased = aliasMap.get(normaliseCode(code));
  if (aliased) {
    const viaAlias =
      index.byCode.get(normaliseCode(aliased)) ?? index.byLoose.get(looseCode(aliased));
    if (viaAlias) return viaAlias;
  }

  return index.byLoose.get(looseCode(code)) ?? null;
}

/** Longest catalogue description that is a substring of this line's, or vice versa. */
function suggest(description: string, index: CatalogueIndex): string | null {
  const needle = description.trim().toUpperCase();
  if (needle.length < 8) return null;

  let best: CatalogueItem | null = null;
  for (const item of index.items) {
    const candidate = item.description.trim().toUpperCase();
    if (candidate.length < 8) continue;
    if (!needle.includes(candidate) && !candidate.includes(needle)) continue;
    if (!best || candidate.length > best.description.trim().length) best = item;
  }
  return best?.code ?? null;
}

export function calculateCommission(input: CalculateInput): CommissionResult {
  const { invoice, basis, installRate } = input;
  const index = indexCatalogue(input.catalogue);

  const aliasMap = new Map<string, string>();
  for (const alias of input.aliases ?? []) {
    aliasMap.set(normaliseCode(alias.from), alias.to);
  }
  const excluded = new Set((input.excludedCodes ?? []).map(normaliseCode));

  const lines: CommissionLine[] = invoice.lines.map((line) => {
    // What was actually billed per unit, discount already applied. Taken from the
    // printed line total rather than recomputed from the discount percentage, so
    // the maths can never disagree with the paper.
    const netUnitPrice = line.qty === 0 ? 0 : round2(line.exclTotal / line.qty);

    const isExcluded = excluded.has(normaliseCode(line.code));
    const item = isExcluded ? null : resolve(line.code, index, aliasMap);
    const flags: LineFlag[] = [];

    if (!isExcluded && !item) flags.push("unmatched_code");
    if (item) {
      if (item.exclPrice === 0 || item.gpAmount <= 0) flags.push("stale_catalogue");
      if (netUnitPrice < item.avgCost) flags.push("below_cost");
      if (item.exclPrice > 0 && Math.abs(netUnitPrice - item.exclPrice) > 0.01) {
        flags.push("off_list_price");
      }
    }

    const catalogueMarkup = item ? item.gpAmount * line.qty : null;
    const asInvoicedMarkup = item ? (netUnitPrice - item.avgCost) * line.qty : null;
    const commissionableMarkup =
      basis === "catalogue" ? catalogueMarkup : asInvoicedMarkup;

    return {
      ...line,
      matchedCode: item?.code ?? null,
      suggestedCode: !isExcluded && !item ? suggest(line.description, index) : null,
      avgCost: item?.avgCost ?? null,
      catalogueGpUnit: item?.gpAmount ?? null,
      netUnitPrice,
      catalogueMarkup: catalogueMarkup === null ? null : round2(catalogueMarkup),
      asInvoicedMarkup: asInvoicedMarkup === null ? null : round2(asInvoicedMarkup),
      commissionableMarkup:
        commissionableMarkup === null ? null : round2(commissionableMarkup),
      commission: round2(installRate * (commissionableMarkup ?? 0)),
      excluded: isExcluded,
      flags,
    };
  });

  const sum = (pick: (line: CommissionLine) => number | null) =>
    lines.reduce((total, line) => total + (pick(line) ?? 0), 0);

  const revenueExcl = sum((line) => line.exclTotal);
  const catalogueMarkup = sum((line) => line.catalogueMarkup);
  const asInvoicedMarkup = sum((line) => line.asInvoicedMarkup);
  const catalogueCommission = installRate * catalogueMarkup;
  const asInvoicedCommission = installRate * asInvoicedMarkup;
  const commission =
    basis === "catalogue" ? catalogueCommission : asInvoicedCommission;
  const other = basis === "catalogue" ? asInvoicedCommission : catalogueCommission;

  return {
    basis,
    installRate,
    lines,
    totals: {
      revenueExcl: round2(revenueExcl),
      catalogueMarkup: round2(catalogueMarkup),
      asInvoicedMarkup: round2(asInvoicedMarkup),
      catalogueCommission: round2(catalogueCommission),
      asInvoicedCommission: round2(asInvoicedCommission),
      commission: round2(commission),
      variance: round2(commission - other),
    },
    needsReview: lines.filter((line) => needsReview(line.flags)),
  };
}
