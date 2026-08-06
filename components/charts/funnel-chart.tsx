"use client";

import { ChartFrame, EmptyChart } from "@/components/charts/chart-frame";
import { CHROME, ORDINAL, compact, formatFull } from "@/components/charts/tokens";

export interface FunnelStage {
  label: string;
  count: number;
  value?: number;
  href?: string;
}

/**
 * Pipeline funnel.
 *
 * Stages ARE genuinely ordered, which is the one case where a ramp on categories is
 * correct rather than an anti-pattern — it uses the ordinal ramp (starting at a step
 * that still clears 2:1 on white), not the sequential ramp's lightest steps.
 *
 * Conversion is shown between stages rather than as a separate chart, because the
 * drop-off is the thing people actually read a funnel for.
 */
export function FunnelChart({
  title,
  subtitle,
  stages,
  currency = true,
  action,
}: {
  title: string;
  subtitle?: string;
  stages: FunnelStage[];
  currency?: boolean;
  action?: React.ReactNode;
}) {
  const maxCount = Math.max(1, ...stages.map((s) => s.count));
  const first = stages[0]?.count ?? 0;

  const table = {
    columns: ["Stage", "Count", "Value", "% of first"],
    rows: stages.map((s) => [
      s.label,
      String(s.count),
      s.value !== undefined ? formatFull(s.value, currency) : "—",
      first > 0 ? `${((s.count / first) * 100).toFixed(0)}%` : "0%",
    ]),
  };

  return (
    <ChartFrame title={title} subtitle={subtitle} table={table} action={action}>
      {stages.length === 0 ? (
        <EmptyChart message="No pipeline data yet" />
      ) : (
        <ol className="space-y-1">
          {stages.map((stage, i) => {
            const width = (stage.count / maxCount) * 100;
            const color = ORDINAL[Math.min(i, ORDINAL.length - 1)];
            const prev = stages[i - 1];
            const conversion =
              prev && prev.count > 0 ? (stage.count / prev.count) * 100 : null;

            const Wrapper = stage.href ? "a" : "div";

            return (
              <li key={stage.label}>
                {conversion !== null ? (
                  <p className="py-0.5 pl-1 text-[10px] tabular-nums text-muted-foreground">
                    ↓ {conversion.toFixed(0)}%
                  </p>
                ) : null}
                <Wrapper
                  {...(stage.href ? { href: stage.href } : {})}
                  className={`block rounded-md px-1 py-1 transition-colors ${
                    stage.href ? "hover:bg-muted/60" : ""
                  }`}
                >
                  <div className="mb-1 flex items-baseline justify-between gap-3">
                    <span className="truncate text-xs text-muted-foreground">
                      {stage.label}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-foreground">
                      <span className="font-medium">{stage.count}</span>
                      {stage.value !== undefined && stage.value > 0 ? (
                        <span className="ml-2 text-muted-foreground">
                          {compact(stage.value, currency)}
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <div
                    className="overflow-hidden rounded-sm"
                    style={{ height: 12, background: CHROME.grid }}
                  >
                    <div
                      className="h-full rounded-r-[4px] transition-[width] duration-500"
                      style={{
                        width: `${Math.max(width, stage.count > 0 ? 2 : 0)}%`,
                        background: color,
                      }}
                    />
                  </div>
                </Wrapper>
              </li>
            );
          })}
        </ol>
      )}
    </ChartFrame>
  );
}
