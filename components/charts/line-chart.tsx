"use client";

import { useMemo, useRef, useState } from "react";
import { ChartFrame, ChartTooltip, EmptyChart } from "@/components/charts/chart-frame";
import {
  CHROME,
  MARKS,
  axisTicks,
  compact,
  formatFull,
  niceMax,
  seriesColor,
} from "@/components/charts/tokens";

export interface LineSeries {
  label: string;
  points: number[];
  /** Explicit slot index so colour follows the entity, not its position after filtering. */
  colorIndex?: number;
}

/**
 * Line / area chart with a crosshair tooltip.
 *
 * Deliberately single-axis only. A dual-axis chart invents a correlation that is not
 * in the data — if you need two measures of different scale, render two of these.
 */
export function LineChart({
  title,
  subtitle,
  labels,
  series,
  currency = false,
  height = 200,
  area,
  action,
}: {
  title: string;
  subtitle?: string;
  labels: string[];
  series: LineSeries[];
  currency?: boolean;
  height?: number;
  /** Wash under the line. Only meaningful for a single series. */
  area?: boolean;
  action?: React.ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null);

  const width = 640;
  const padLeft = 46;
  const padRight = 16;
  const padTop = 12;
  const padBottom = 26; // room for the x-axis band, so it never gets clipped

  const max = useMemo(
    () => niceMax(Math.max(1, ...series.flatMap((s) => s.points))),
    [series]
  );
  const ticks = useMemo(() => axisTicks(max), [max]);

  const hasData = series.length > 0 && labels.length > 1;

  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;
  const stepX = hasData ? plotW / (labels.length - 1) : 0;

  const xAt = (i: number) => padLeft + i * stepX;
  const yAt = (v: number) => padTop + plotH * (1 - v / max);

  const table = {
    columns: ["Period", ...series.map((s) => s.label)],
    rows: labels.map((label, i) => [
      label,
      ...series.map((s) => formatFull(s.points[i] ?? 0, currency)),
    ]),
  };

  const legend = series.map((s, i) => ({
    label: s.label,
    color: seriesColor(s.colorIndex ?? i),
  }));

  const showArea = area && series.length === 1;

  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      legend={series.length >= 2 ? legend : undefined}
      table={table}
      height={height}
      action={action}
    >
      {!hasData ? (
        <EmptyChart message="Not enough data yet" />
      ) : (
        <div ref={wrapRef} className="relative w-full">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full"
            style={{ height }}
            role="img"
            aria-label={`${title}. ${series.length} series over ${labels.length} periods.`}
            onMouseLeave={() => setHover(null)}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const scale = width / rect.width;
              const svgX = (e.clientX - rect.left) * scale;
              const idx = Math.round((svgX - padLeft) / stepX);
              const clamped = Math.max(0, Math.min(labels.length - 1, idx));
              setHover({
                index: clamped,
                x: (xAt(clamped) / scale) + 0,
                y: (yAt(Math.max(...series.map((s) => s.points[clamped] ?? 0))) / scale),
              });
            }}
          >
            {/* Gridlines: solid hairlines, one step off the surface. Never dashed. */}
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={padLeft}
                  x2={width - padRight}
                  y1={yAt(t)}
                  y2={yAt(t)}
                  stroke={CHROME.grid}
                  strokeWidth={1}
                />
                <text
                  x={padLeft - 8}
                  y={yAt(t) + 3.5}
                  textAnchor="end"
                  fontSize={10}
                  fill={CHROME.textMuted}
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {compact(t, currency)}
                </text>
              </g>
            ))}

            {/* X labels: thinned so they never collide. */}
            {labels.map((label, i) => {
              const every = Math.ceil(labels.length / 7);
              if (i % every !== 0 && i !== labels.length - 1) return null;
              return (
                <text
                  key={label + i}
                  x={xAt(i)}
                  y={height - 8}
                  textAnchor={i === 0 ? "start" : i === labels.length - 1 ? "end" : "middle"}
                  fontSize={10}
                  fill={CHROME.textMuted}
                >
                  {label}
                </text>
              );
            })}

            {showArea ? (
              <path
                d={
                  `M${xAt(0)},${yAt(series[0].points[0] ?? 0)} ` +
                  series[0].points
                    .map((p, i) => `L${xAt(i)},${yAt(p)}`)
                    .join(" ") +
                  ` L${xAt(labels.length - 1)},${yAt(0)} L${xAt(0)},${yAt(0)} Z`
                }
                fill={seriesColor(series[0].colorIndex ?? 0)}
                opacity={MARKS.areaOpacity}
              />
            ) : null}

            {hover ? (
              <line
                x1={xAt(hover.index)}
                x2={xAt(hover.index)}
                y1={padTop}
                y2={padTop + plotH}
                stroke={CHROME.axis}
                strokeWidth={1}
              />
            ) : null}

            {series.map((s, si) => {
              const color = seriesColor(s.colorIndex ?? si);
              const d = s.points
                .map((p, i) => `${i === 0 ? "M" : "L"}${xAt(i)},${yAt(p)}`)
                .join(" ");
              return (
                <g key={s.label}>
                  <path
                    d={d}
                    fill="none"
                    stroke={color}
                    strokeWidth={MARKS.lineWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {/* End marker with a surface ring so it stays legible on crossings. */}
                  <circle
                    cx={xAt(s.points.length - 1)}
                    cy={yAt(s.points[s.points.length - 1] ?? 0)}
                    r={MARKS.markerRadius + 1.5}
                    fill={CHROME.surface}
                  />
                  <circle
                    cx={xAt(s.points.length - 1)}
                    cy={yAt(s.points[s.points.length - 1] ?? 0)}
                    r={MARKS.markerRadius}
                    fill={color}
                  />
                  {hover ? (
                    <>
                      <circle
                        cx={xAt(hover.index)}
                        cy={yAt(s.points[hover.index] ?? 0)}
                        r={MARKS.markerRadius + 1.5}
                        fill={CHROME.surface}
                      />
                      <circle
                        cx={xAt(hover.index)}
                        cy={yAt(s.points[hover.index] ?? 0)}
                        r={MARKS.markerRadius}
                        fill={color}
                      />
                    </>
                  ) : null}
                </g>
              );
            })}

            {/* Direct label on the endpoint only — never a number on every point. */}
            {series.length === 1 ? (
              <text
                x={xAt(series[0].points.length - 1) - 8}
                y={yAt(series[0].points[series[0].points.length - 1] ?? 0) - 12}
                textAnchor="end"
                fontSize={11}
                fontWeight={600}
                fill={CHROME.textPrimary}
              >
                {compact(series[0].points[series[0].points.length - 1] ?? 0, currency)}
              </text>
            ) : null}

            <line
              x1={padLeft}
              x2={width - padRight}
              y1={padTop + plotH}
              y2={padTop + plotH}
              stroke={CHROME.axis}
              strokeWidth={1}
            />
          </svg>

          {hover ? (
            <ChartTooltip
              x={(hover.x / width) * (wrapRef.current?.clientWidth ?? width)}
              y={(hover.y / height) * height}
              title={labels[hover.index]}
              rows={series.map((s, si) => ({
                label: s.label,
                value: formatFull(s.points[hover.index] ?? 0, currency),
                color: seriesColor(s.colorIndex ?? si),
              }))}
            />
          ) : null}
        </div>
      )}
    </ChartFrame>
  );
}
