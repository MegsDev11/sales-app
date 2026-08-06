"use client";

import { useId, useState } from "react";
import { Table2, BarChart3 } from "lucide-react";
import { CHROME } from "@/components/charts/tokens";

export interface LegendEntry {
  label: string;
  color: string;
}

/**
 * Shared shell for every chart: title, optional legend, and a table view.
 *
 * The table view is not decoration. Three slots in our validated palette sit below
 * 3:1 contrast on white, which obligates "relief" — a way to read every value
 * without relying on colour. It also means tooltips never *gate* a value, which is
 * the rule tooltips have to satisfy.
 */
export function ChartFrame({
  title,
  subtitle,
  legend,
  table,
  height,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  /** Omit for a single series — the title already says what is plotted. */
  legend?: LegendEntry[];
  table: { columns: string[]; rows: (string | number)[][] };
  /** Plot height in px. The wrapper adds room for the axis band itself. */
  height?: number;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  const tableId = useId();

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {subtitle ? (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          {action}
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            aria-pressed={showTable}
            aria-controls={tableId}
            title={showTable ? "Show chart" : "Show values as a table"}
            className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {showTable ? <BarChart3 className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </header>

      {/* Legend appears for >= 2 series only. One series needs no swatch box. */}
      {legend && legend.length >= 2 && !showTable ? (
        <ul className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
          {legend.map((entry) => (
            <li key={entry.label} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: entry.color }}
              />
              {/* Text wears text tokens, never the series colour. */}
              <span className="text-xs text-muted-foreground">{entry.label}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {showTable ? (
        <div id={tableId} className="max-h-[320px] overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border">
                {table.columns.map((c, i) => (
                  <th
                    key={c}
                    className={`py-1.5 font-medium text-muted-foreground ${i > 0 ? "text-right" : ""}`}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, i) => (
                <tr key={i} className="border-b border-border/60 last:border-0">
                  {row.map((cell, j) => (
                    <td
                      key={j}
                      className={`py-1.5 ${
                        j > 0
                          ? "text-right tabular-nums text-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={height ? { minHeight: height } : undefined}>{children}</div>
      )}
    </section>
  );
}

/** Floating tooltip. Enhances; never the only way to read a value. */
export function ChartTooltip({
  x,
  y,
  title,
  rows,
}: {
  x: number;
  y: number;
  title: string;
  rows: { label: string; value: string; color?: string }[];
}) {
  return (
    <div
      className="pointer-events-none absolute z-20 min-w-[130px] rounded-md border border-border bg-card px-2.5 py-2 shadow-lg"
      style={{
        left: x,
        top: y,
        transform: "translate(-50%, calc(-100% - 12px))",
        borderColor: CHROME.grid,
      }}
      role="tooltip"
    >
      <p className="mb-1 text-[11px] font-medium text-foreground">{title}</p>
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5">
            {row.color ? (
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: row.color }}
              />
            ) : null}
            <span className="text-[11px] text-muted-foreground">{row.label}</span>
          </span>
          <span className="text-[11px] font-medium tabular-nums text-foreground">
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-[140px] items-center justify-center">
      <p className="text-xs text-muted-foreground">{message}</p>
    </div>
  );
}
