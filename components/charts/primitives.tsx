"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { CHROME, MARKS, STATUS, compact, type StatusKey } from "@/components/charts/tokens";

/**
 * Sparkline — 12ish points, de-emphasis hue with the latest point accented.
 * No axes, no labels: it is a shape cue inside a stat tile, not a chart.
 */
export function Sparkline({
  points,
  color = CHROME.textSecondary,
  width = 88,
  height = 28,
}: {
  points: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (points.length < 2) return null;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const pad = MARKS.markerRadius + 1;
  const stepX = (width - pad * 2) / (points.length - 1);

  const coords = points.map((p, i) => ({
    x: pad + i * stepX,
    y: pad + (height - pad * 2) * (1 - (p - min) / span),
  }));

  const d = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(" ");
  const last = coords[coords.length - 1];

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden focusable="false">
      <path
        d={d}
        fill="none"
        stroke={CHROME.deEmphasis}
        strokeWidth={MARKS.lineWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Surface ring keeps the end dot legible where it crosses the line. */}
      <circle cx={last.x} cy={last.y} r={MARKS.markerRadius + 1} fill={CHROME.surface} />
      <circle cx={last.x} cy={last.y} r={MARKS.markerRadius - 0.5} fill={color} />
    </svg>
  );
}

/**
 * Stat tile — label, value, optional delta and sparkline.
 *
 * This is the right form for a single number. A one-bar bar chart is not.
 * Value uses proportional figures deliberately: tabular-nums makes a number like
 * 121 look loose at display sizes.
 */
export function StatTile({
  label,
  value,
  currency = false,
  raw,
  delta,
  deltaLabel,
  higherIsBetter = true,
  trend,
  icon: Icon,
  accent = CHROME.textPrimary,
  status,
  href,
}: {
  label: string;
  value: number | string;
  currency?: boolean;
  /** Full-precision value for the title attribute when the display is compacted. */
  raw?: string;
  delta?: number;
  deltaLabel?: string;
  higherIsBetter?: boolean;
  trend?: number[];
  icon?: LucideIcon;
  accent?: string;
  status?: StatusKey;
  href?: string;
}) {
  const display = typeof value === "number" ? compact(value, currency) : value;

  const direction = delta === undefined ? null : delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const isGood = direction === "flat" || direction === null
    ? null
    : (direction === "up") === higherIsBetter;

  const DeltaIcon =
    direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : ArrowRight;

  const deltaColor =
    isGood === null ? CHROME.textMuted : isGood ? CHROME.goodText : CHROME.badText;

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {Icon ? <Icon className="h-4 w-4 shrink-0" style={{ color: accent }} /> : null}
      </div>

      <div className="mt-1 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p
            className="truncate text-2xl font-semibold leading-tight text-foreground"
            title={raw ?? String(value)}
          >
            {display}
          </p>
          {direction ? (
            <p className="mt-0.5 flex items-center gap-1 text-xs" style={{ color: deltaColor }}>
              <DeltaIcon className="h-3 w-3 shrink-0" aria-hidden />
              <span className="font-medium tabular-nums">
                {delta! > 0 ? "+" : ""}
                {Math.abs(delta!) < 1 && delta !== 0
                  ? delta!.toFixed(1)
                  : Math.round(delta!)}
                %
              </span>
              {deltaLabel ? (
                <span className="truncate text-muted-foreground">{deltaLabel}</span>
              ) : null}
            </p>
          ) : null}
        </div>
        {trend && trend.length > 1 ? <Sparkline points={trend} color={accent} /> : null}
      </div>

      {status ? (
        <p className="mt-2 flex items-center gap-1.5 text-[11px]">
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: STATUS[status] }}
          />
          <span className="capitalize text-muted-foreground">{status}</span>
        </p>
      ) : null}
    </>
  );

  const className =
    "block rounded-lg border border-border bg-card p-3 transition-colors" +
    (href ? " hover:border-primary/40 hover:bg-muted/40" : "");

  if (href) {
    return (
      <Link href={href} className={className}>
        {body}
      </Link>
    );
  }
  return <div className={className}>{body}</div>;
}

/**
 * Meter — one ratio against a limit.
 * Track is a lighter step of the fill's own ramp so state reads across the whole bar.
 */
export function Meter({
  label,
  value,
  max,
  unit,
  thresholds,
  compactValue = false,
  invert = false,
}: {
  label: string;
  value: number;
  max: number;
  unit?: string;
  /** Ratios at which the fill escalates. Defaults: 0.75 warning, 0.9 critical. */
  thresholds?: { warning: number; critical: number };
  compactValue?: boolean;
  /**
   * Flip the escalation so a LOW ratio is the problem.
   *
   * Needed more often than not: "stock available against total" and "revenue against
   * target" both get worse as the bar empties, whereas the default ("disk usage")
   * gets worse as it fills. Without this the severity colour is exactly backwards —
   * a nearly-empty stock meter renders calm blue and a great sales month renders red.
   */
  invert?: boolean;
}) {
  const t = thresholds ?? (invert ? { warning: 0.5, critical: 0.25 } : { warning: 0.75, critical: 0.9 });
  const ratio = max > 0 ? Math.min(value / max, 1) : 0;

  const severity = invert
    ? ratio <= t.critical
      ? "critical"
      : ratio <= t.warning
        ? "warning"
        : "ok"
    : ratio >= t.critical
      ? "critical"
      : ratio >= t.warning
        ? "warning"
        : "ok";

  const fill =
    severity === "critical" ? STATUS.critical : severity === "warning" ? STATUS.warning : "#2a78d6";
  const track =
    severity === "critical" ? "#f6dada" : severity === "warning" ? "#fdf0d4" : "#dce9fb";

  const fmt = (n: number) => (compactValue ? compact(n) : n.toLocaleString("en-ZA"));

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="truncate text-xs text-muted-foreground">{label}</span>
        <span className="shrink-0 text-xs font-medium tabular-nums text-foreground">
          {fmt(value)}
          {unit ? ` ${unit}` : ""}
          <span className="text-muted-foreground"> / {fmt(max)}</span>
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: track }}>
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${Math.max(ratio * 100, value > 0 ? 2 : 0)}%`, background: fill }}
          role="meter"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-label={label}
        />
      </div>
    </div>
  );
}

/**
 * Hero figure — the one number a view leads with. Exactly one per view.
 * Same sans as everything else; a display/serif face reads as off-brand decoration.
 */
export function HeroFigure({
  label,
  value,
  currency = false,
  delta,
  deltaLabel,
  higherIsBetter = true,
}: {
  label: string;
  value: number;
  currency?: boolean;
  delta?: number;
  deltaLabel?: string;
  higherIsBetter?: boolean;
}) {
  const isGood = delta === undefined ? null : (delta > 0) === higherIsBetter;
  const DeltaIcon = (delta ?? 0) >= 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-[44px] font-semibold leading-[1.1] tracking-tight text-foreground">
        {compact(value, currency)}
      </p>
      {delta !== undefined ? (
        <p
          className="mt-1 flex items-center gap-1 text-sm"
          style={{ color: isGood ? CHROME.goodText : CHROME.badText }}
        >
          <DeltaIcon className="h-4 w-4" aria-hidden />
          <span className="font-medium tabular-nums">
            {delta > 0 ? "+" : ""}
            {Math.round(delta)}%
          </span>
          {deltaLabel ? <span className="text-muted-foreground">{deltaLabel}</span> : null}
        </p>
      ) : null}
    </div>
  );
}
