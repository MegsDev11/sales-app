"use client";

import { useState } from "react";
import { ChartFrame, EmptyChart } from "@/components/charts/chart-frame";
import {
  CHROME,
  MARKS,
  ORDINAL,
  compact,
  formatFull,
  niceMax,
  seriesColor,
} from "@/components/charts/tokens";

export interface BarDatum {
  label: string;
  value: number;
  /** Optional explicit colour — use for status, not for rank. */
  color?: string;
  href?: string;
}

/**
 * Horizontal bar chart. The default for comparing magnitude across named things,
 * because long category names fit on the left without rotating text.
 *
 * One series -> one colour for every bar. Colouring each bar darker-where-bigger
 * would double-encode length as hue and burn the only free channel.
 */
export function BarChart({
  title,
  subtitle,
  data,
  currency = false,
  /** Use the ordinal ramp — ONLY for genuinely ordered categories (funnel, tiers). */
  ordinal = false,
  maxRows = 8,
  action,
}: {
  title: string;
  subtitle?: string;
  data: BarDatum[];
  currency?: boolean;
  ordinal?: boolean;
  maxRows?: number;
  action?: React.ReactNode;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const rows = data.slice(0, maxRows);
  const max = niceMax(Math.max(1, ...rows.map((r) => r.value)));

  const table = {
    columns: ["Item", currency ? "Value" : "Count"],
    rows: data.map((d) => [d.label, formatFull(d.value, currency)]),
  };

  return (
    <ChartFrame title={title} subtitle={subtitle} table={table} action={action}>
      {rows.length === 0 ? (
        <EmptyChart message="Nothing to show yet" />
      ) : (
        <ul className="space-y-2.5">
          {rows.map((row, i) => {
            const pct = (row.value / max) * 100;
            const color =
              row.color ?? (ordinal ? ORDINAL[Math.min(i, ORDINAL.length - 1)] : seriesColor(0));
            const Wrapper = row.href ? "a" : "div";
            return (
              <li key={row.label + i}>
                <Wrapper
                  {...(row.href ? { href: row.href } : {})}
                  className={`block ${row.href ? "cursor-pointer" : ""}`}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                >
                  <div className="mb-1 flex items-baseline justify-between gap-3">
                    <span className="truncate text-xs text-muted-foreground">{row.label}</span>
                    {/* Direct label at the tip — this is the required relief for the
                        low-contrast palette slots, so it is never optional. */}
                    <span className="shrink-0 text-xs font-medium tabular-nums text-foreground">
                      {compact(row.value, currency)}
                    </span>
                  </div>
                  <div
                    className="w-full overflow-hidden rounded-sm"
                    style={{ height: 10, background: CHROME.grid }}
                  >
                    <div
                      className="h-full transition-[width,opacity] duration-500"
                      style={{
                        width: `${Math.max(pct, row.value > 0 ? 1.5 : 0)}%`,
                        background: color,
                        opacity: hover === null || hover === i ? 1 : 0.55,
                        borderTopRightRadius: MARKS.barRadius,
                        borderBottomRightRadius: MARKS.barRadius,
                      }}
                    />
                  </div>
                </Wrapper>
              </li>
            );
          })}
        </ul>
      )}
    </ChartFrame>
  );
}

export interface StackSegment {
  label: string;
  value: number;
  colorIndex?: number;
  color?: string;
}

/**
 * Single stacked bar — part-to-whole at a glance.
 *
 * Segments are separated by a 2px gap in the surface colour, never by a stroke
 * drawn around them. An interior segment whose label will not fit is left to the
 * legend and the table rather than clipped.
 */
export function StackedBar({
  title,
  subtitle,
  segments,
  currency = false,
  action,
}: {
  title: string;
  subtitle?: string;
  segments: StackSegment[];
  currency?: boolean;
  action?: React.ReactNode;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const total = segments.reduce((s, x) => s + x.value, 0);

  const table = {
    columns: ["Segment", currency ? "Value" : "Count", "Share"],
    rows: segments.map((s) => [
      s.label,
      formatFull(s.value, currency),
      total > 0 ? `${((s.value / total) * 100).toFixed(1)}%` : "0%",
    ]),
  };

  const legend = segments.map((s, i) => ({
    label: s.label,
    color: s.color ?? seriesColor(s.colorIndex ?? i),
  }));

  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      legend={segments.length >= 2 ? legend : undefined}
      table={table}
      action={action}
    >
      {total === 0 ? (
        <EmptyChart message="Nothing to show yet" />
      ) : (
        <>
          <div className="mb-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-foreground">
              {compact(total, currency)}
            </span>
            <span className="text-xs text-muted-foreground">total</span>
          </div>

          <div className="flex w-full gap-[2px] overflow-hidden" style={{ height: 14 }}>
            {segments.map((s, i) => {
              if (s.value <= 0) return null;
              return (
                <div
                  key={s.label}
                  className="h-full transition-opacity first:rounded-l-sm last:rounded-r-sm"
                  style={{
                    flexGrow: s.value,
                    flexBasis: 0,
                    background: s.color ?? seriesColor(s.colorIndex ?? i),
                    opacity: hover === null || hover === i ? 1 : 0.5,
                  }}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  title={`${s.label}: ${formatFull(s.value, currency)}`}
                />
              );
            })}
          </div>

          <ul className="mt-3 space-y-1">
            {segments.map((s, i) => (
              <li
                key={s.label}
                className="flex items-center justify-between gap-3 text-xs"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: s.color ?? seriesColor(s.colorIndex ?? i) }}
                  />
                  <span className="truncate text-muted-foreground">{s.label}</span>
                </span>
                <span className="shrink-0 tabular-nums text-foreground">
                  {compact(s.value, currency)}
                  <span className="ml-1 text-muted-foreground">
                    {total > 0 ? `${Math.round((s.value / total) * 100)}%` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </ChartFrame>
  );
}

/**
 * Vertical column chart, for time buckets where reading left-to-right matters.
 * Bars are capped at 24px so the band's leftover space stays as air.
 */
export function ColumnChart({
  title,
  subtitle,
  data,
  currency = false,
  height = 180,
  action,
}: {
  title: string;
  subtitle?: string;
  data: BarDatum[];
  currency?: boolean;
  height?: number;
  action?: React.ReactNode;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const max = niceMax(Math.max(1, ...data.map((d) => d.value)));
  const plotH = height - 30; // leave the x-axis band room

  const table = {
    columns: ["Period", currency ? "Value" : "Count"],
    rows: data.map((d) => [d.label, formatFull(d.value, currency)]),
  };

  return (
    <ChartFrame title={title} subtitle={subtitle} table={table} height={height} action={action}>
      {data.length === 0 ? (
        <EmptyChart message="Nothing to show yet" />
      ) : (
        <div className="flex items-end justify-between gap-1" style={{ height }}>
          {data.map((d, i) => {
            const h = (d.value / max) * plotH;
            const isHover = hover === i;
            return (
              <div
                key={d.label + i}
                className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                title={`${d.label}: ${formatFull(d.value, currency)}`}
              >
                <span
                  className="text-[10px] font-medium tabular-nums text-foreground transition-opacity"
                  style={{ opacity: isHover || data.length <= 8 ? 1 : 0 }}
                >
                  {d.value > 0 ? compact(d.value, currency) : ""}
                </span>
                <div
                  className="w-full transition-all duration-500"
                  style={{
                    height: Math.max(h, d.value > 0 ? 3 : 1),
                    maxWidth: MARKS.barMaxThickness,
                    background: d.color ?? seriesColor(0),
                    opacity: hover === null || isHover ? 1 : 0.55,
                    borderTopLeftRadius: MARKS.barRadius,
                    borderTopRightRadius: MARKS.barRadius,
                  }}
                />
                <span className="w-full truncate text-center text-[10px] text-muted-foreground">
                  {d.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </ChartFrame>
  );
}
