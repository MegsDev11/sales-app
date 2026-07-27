/**
 * Chart design tokens.
 *
 * The categorical order below is NOT arbitrary and must not be reordered casually —
 * the slot ordering is the colourblind-safety mechanism. It was validated against
 * this app's actual chart surface (#ffffff, the card colour) rather than a generic
 * default:
 *
 *   Lightness band      PASS  all 8 inside L 0.43–0.77
 *   Chroma floor        PASS  all 8 >= 0.1
 *   CVD separation      PASS  worst adjacent pair ΔE 9.1 (protan)
 *   Normal-vision floor PASS  worst adjacent pair ΔE 19.6
 *   Contrast vs surface WARN  aqua / yellow / magenta sit below 3:1
 *
 * That WARN is why every chart in this kit ships a table view and direct labels —
 * it is the required relief, not an optional extra.
 *
 * BRAND NOTE: the Megs red (#c83733) is deliberately NOT a series colour. It sits
 * almost on top of `destructive` (#dc2626) and status-critical (#d03b3b), so using
 * it for a data series would make ordinary numbers read as errors. Brand red stays
 * on UI chrome — buttons, active nav, the logo. Charts use the validated palette.
 */

/** Categorical slots, in validated order. Assign by entity, never by rank. */
export const SERIES = [
  "#2a78d6", // 1 blue
  "#eb6834", // 2 orange
  "#1baf7a", // 3 aqua
  "#eda100", // 4 yellow
  "#e87ba4", // 5 magenta
  "#008300", // 6 green
  "#4a3aa7", // 7 violet
  "#e34948", // 8 red
] as const;

/**
 * All-pairs forms (scatter, bubble, small multiples) cap at THREE series — past
 * that, yellow and orange share the screen and fail the all-pairs floor.
 * Adjacent forms (bars, stacks, lines) may use all eight.
 */
export const ALL_PAIRS_SERIES_CAP = 3;

/** Sequential ramp (magnitude). One hue, light -> dark. Never a rainbow. */
export const SEQUENTIAL = [
  "#cde2fb",
  "#b7d3f6",
  "#9ec5f4",
  "#86b6ef",
  "#6da7ec",
  "#5598e7",
  "#3987e5",
  "#2a78d6",
  "#256abf",
  "#1c5cab",
] as const;

/**
 * Ordinal ramp (discrete ordered steps — funnel stages, tiers).
 * Starts at step 250 so the lightest step still clears 2:1 on a light surface.
 */
export const ORDINAL = [
  "#86b6ef",
  "#6da7ec",
  "#5598e7",
  "#3987e5",
  "#2a78d6",
  "#256abf",
  "#1c5cab",
] as const;

/** Status. Reserved — never reused as "series 4". Always paired with icon + label. */
export const STATUS = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
} as const;

export type StatusKey = keyof typeof STATUS;

/** Chart chrome. Gridlines and axes are solid hairlines — never dashed. */
export const CHROME = {
  surface: "#ffffff",
  grid: "#e8eaed",
  axis: "#d6d9de",
  textPrimary: "#0a0a0a",
  textSecondary: "#4b5563",
  textMuted: "#6b7280",
  deEmphasis: "#cbd5e1",
  goodText: "#006300",
  badText: "#b91c1c",
} as const;

/** Fixed mark specs from the design method. */
export const MARKS = {
  barMaxThickness: 24,
  barRadius: 4,
  lineWidth: 2,
  markerRadius: 4.5, // >= 8px diameter
  surfaceGap: 2,
  surfaceRing: 2,
  areaOpacity: 0.1,
} as const;

/** Deterministic colour for a series index. Folds past the ceiling into grey. */
export function seriesColor(index: number): string {
  return index < SERIES.length ? SERIES[index] : CHROME.deEmphasis;
}

/** Compact number formatting for stat tiles and axis ticks. */
export function compact(value: number, currency = false): string {
  const sign = value < 0 ? "-" : "";
  const n = Math.abs(value);
  const prefix = currency ? "R" : "";
  if (n >= 1_000_000_000) return `${sign}${prefix}${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${sign}${prefix}${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${sign}${prefix}${Math.round(n / 1_000)}K`;
  if (n >= 1_000) return `${sign}${prefix}${(n / 1_000).toFixed(1)}K`;
  return `${sign}${prefix}${Number.isInteger(n) ? n : n.toFixed(1)}`;
}

export function formatFull(value: number, currency = false): string {
  const formatted = Math.round(value).toLocaleString("en-ZA");
  return currency ? `R${formatted}` : formatted;
}

/** Round an axis maximum up to a clean tick value (0 / 1,000 / 2,000 …). */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

export function axisTicks(max: number, count = 4): number[] {
  const top = niceMax(max);
  return Array.from({ length: count + 1 }, (_, i) => (top / count) * i);
}
