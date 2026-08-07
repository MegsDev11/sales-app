/**
 * Decides what a Sage price-list row should become in inventory.
 *
 * The export mixes three kinds of thing: serialised hardware you QR-tag and book out,
 * consumables you count, and charges that are not stock at all (airtime packages,
 * labour, road works).
 *
 * About 60% of rows carry no category, and for those this returns "unknown" rather
 * than guessing. Defaulting them to "tracked product" would suggest QR-tagging some
 * 1,600 items including anchors and washers — a suggestion that is wrong that often
 * teaches people to ignore it. When this says "tracked product" it is because the
 * category says so; otherwise the stock manager decides. Nothing imports on its own.
 */

export type CatalogueDestination = "product" | "sundry";
export type CatalogueSuggestion = CatalogueDestination | "skip" | "unknown";

/** Services and subscriptions — billed, never stocked. Checked first. */
const NON_STOCK_CATEGORY = /monthly|line rental|service|work done|road works/i;

/** Codes that are charges rather than things. */
const NON_STOCK_CODE = /^(LABOUR|TRAVEL|INSTALL|SUNDRIES|CALLOUT)$/i;

/** Counted in bulk, not serialised. */
const SUNDRY_CATEGORY = /sundries|cabling|brackets/i;

/**
 * Categories of equipment worth tracking unit by unit. Listed explicitly rather than
 * inferred, so an unfamiliar category falls through to "unknown" instead of silently
 * becoming a QR-tagged product.
 */
const PRODUCT_CATEGORY =
  /^(cctv|router|battery|solar|ups|voip|sector|mast|pole|360|external antenna|cabinets? ?\/? ?enclosures?|site stock|stock|workshop)$/i;

export function suggestDestination(code: string, category: string): CatalogueSuggestion {
  if (NON_STOCK_CODE.test(code.trim())) return "skip";

  const cat = category.trim();
  if (!cat) return "unknown";

  if (NON_STOCK_CATEGORY.test(cat)) return "skip";
  if (SUNDRY_CATEGORY.test(cat)) return "sundry";
  if (PRODUCT_CATEGORY.test(cat)) return "product";
  return "unknown";
}

/** Cable and trunking are sold per metre; everything else is counted. */
export function suggestUnitLabel(description: string, category: string) {
  if (/\bp\/m\b|per met|\/m\b/i.test(description)) return "metre";
  if (/cabling/i.test(category)) return "metre";
  return "each";
}
