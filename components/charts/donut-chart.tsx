"use client";

import { useState } from "react";
import { ChartFrame, EmptyChart } from "@/components/charts/chart-frame";
import { CHROME, compact, formatFull, seriesColor } from "@/components/charts/tokens";

export interface DonutSegment {
  label: string;
  value: number;
  colorIndex?: number;
  color?: string;
}

/**
 * Donut — part-to-whole at a glance only, capped at 6 segments.
 *
 * Not for comparing close values: two similar arcs are genuinely hard to rank, and
 * a bar chart does that job better. Anything past the cap folds into "Other" rather
 * than generating a 7th hue.
 */
export function DonutChart({
  title,
  subtitle,
  segments,
  currency = false,
  centerLabel,
  action,
}: {
  title: string;
  subtitle?: string;
  segments: DonutSegment[];
  currency?: boolean;
  centerLabel?: string;
  action?: React.ReactNode;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const MAX_SEGMENTS = 6;
  const sorted = [...segments].sort((a, b) => b.value - a.value);
  const shown =
    sorted.length <= MAX_SEGMENTS
      ? sorted
      : [
          ...sorted.slice(0, MAX_SEGMENTS - 1),
          {
            label: "Other",
            value: sorted.slice(MAX_SEGMENTS - 1).reduce((s, x) => s + x.value, 0),
            color: CHROME.deEmphasis,
          },
        ];

  const total = shown.reduce((s, x) => s + x.value, 0);

  const size = 150;
  const stroke = 20;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;

  // A 2px gap in the surface colour separates touching arcs — no stroke outline.
  const gap = 2;

  const table = {
    columns: ["Segment", currency ? "Value" : "Count", "Share"],
    rows: segments.map((s) => [
      s.label,
      formatFull(s.value, currency),
      total > 0 ? `${((s.value / total) * 100).toFixed(1)}%` : "0%",
    ]),
  };

  const legend = shown.map((s, i) => ({
    label: s.label,
    color: s.color ?? seriesColor(s.colorIndex ?? i),
  }));

  /**
   * Each arc starts where the previous one ended. That running total used to be a
   * `let` incremented from inside the `.map()` that builds the JSX — so the arcs'
   * positions depended on render order and on the render not being replayed.
   * Working it out up front makes each arc a value, not a side effect.
   */
  const arcs = shown.reduce<{ slice: DonutSegment; frac: number; offset: number }[]>(
    (acc, slice) => {
      const frac = slice.value / total;
      const previous = acc[acc.length - 1];
      const offset = previous ? previous.offset + previous.frac * circumference : 0;
      acc.push({ slice, frac, offset });
      return acc;
    },
    []
  );

  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      legend={shown.length >= 2 ? legend : undefined}
      table={table}
      action={action}
    >
      {total === 0 ? (
        <EmptyChart message="Nothing to show yet" />
      ) : (
        <div className="flex flex-wrap items-center justify-center gap-5">
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            role="img"
            aria-label={`${title}: ${shown.map((s) => `${s.label} ${s.value}`).join(", ")}`}
            className="shrink-0"
          >
            <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
              {arcs.map(({ slice: s, frac, offset }, i) => {
                if (s.value <= 0) return null;
                const len = Math.max(frac * circumference - gap, 0.5);
                const dash = `${len} ${circumference - len}`;
                return (
                  <circle
                    key={s.label}
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill="none"
                    stroke={s.color ?? seriesColor(s.colorIndex ?? i)}
                    strokeWidth={stroke}
                    strokeDasharray={dash}
                    strokeDashoffset={-offset}
                    opacity={hover === null || hover === i ? 1 : 0.45}
                    style={{ transition: "opacity 150ms" }}
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                  />
                );
              })}
            </g>
            <text
              x={size / 2}
              y={size / 2 - 2}
              textAnchor="middle"
              fontSize={20}
              fontWeight={600}
              fill={CHROME.textPrimary}
            >
              {compact(hover !== null ? shown[hover].value : total, currency)}
            </text>
            <text
              x={size / 2}
              y={size / 2 + 15}
              textAnchor="middle"
              fontSize={10}
              fill={CHROME.textMuted}
            >
              {hover !== null ? shown[hover].label : (centerLabel ?? "total")}
            </text>
          </svg>

          <ul className="min-w-[140px] flex-1 space-y-1.5">
            {shown.map((s, i) => (
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
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ChartFrame>
  );
}
