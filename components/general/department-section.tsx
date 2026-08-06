"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, ArrowRight, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { compact } from "@/components/charts/tokens";
import type { Section } from "@/lib/general/overview-types";

/**
 * One department's slice of the GM dashboard.
 *
 * Shares Panel's chrome exactly — same radius, border, surface and `px-4` — so the
 * eight sections stack into one continuous left rail rather than reading as eight
 * unrelated widgets. What it adds over Panel is the identity row: the module's own
 * icon, who runs it, and a way through to the department itself. A dashboard that
 * shows a problem without a route to the team that owns it is just a poster.
 */

export interface Metric {
  label: string;
  value: number | string;
  currency?: boolean;
  /** Colour for the value — reserve for genuine status, not decoration. */
  tone?: string;
  href?: string;
}

/**
 * Compact KPI row.
 *
 * Deliberately not StatTile: eight departments' worth of full tiles is roughly
 * sixty cards, and at that count the tile's icon, delta and sparkline stop being
 * signal and become texture. Label over number, four across, is what survives the
 * density this page is for.
 */
export function MetricStrip({ metrics }: { metrics: Metric[] }) {
  if (metrics.length === 0) return null;

  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md bg-hairline sm:grid-cols-4">
      {metrics.map((m) => {
        const display = typeof m.value === "number" ? compact(m.value, m.currency) : m.value;
        const body = (
          <>
            <dt className="truncate text-[11px] font-medium leading-4 text-muted-foreground">
              {m.label}
            </dt>
            <dd
              className="mt-0.5 truncate text-lg font-semibold leading-tight"
              style={{ color: m.tone }}
              title={typeof m.value === "number" ? m.value.toLocaleString("en-ZA") : undefined}
            >
              {display}
            </dd>
          </>
        );

        return m.href ? (
          <Link
            key={m.label}
            href={m.href}
            className="bg-surface-elevated px-3 py-2.5 transition-colors hover:bg-muted/50"
          >
            {body}
          </Link>
        ) : (
          <div key={m.label} className="bg-surface-elevated px-3 py-2.5">
            {body}
          </div>
        );
      })}
    </dl>
  );
}

export function DepartmentSection({
  icon: Icon,
  label,
  manager,
  staff,
  href,
  canOpen = true,
  block,
  metrics,
  children,
  className,
}: {
  icon: LucideIcon;
  label: string;
  manager?: string | null;
  staff?: number;
  href: string;
  /** False when the viewer holds `general` but not this department itself. */
  canOpen?: boolean;
  /** Carries the `unavailable` state and its reason. */
  block: Section;
  metrics: Metric[];
  children?: React.ReactNode;
  className?: string;
}) {
  const subtitle = [
    manager ?? "No manager assigned",
    staff === undefined ? null : `${staff} staff`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section
      className={cn(
        "rounded-lg border border-border bg-surface-elevated shadow-panel print:shadow-none",
        className
      )}
    >
      <div className="flex min-h-[3.25rem] flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-hairline px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0">
            <h2 className="truncate text-[13px] font-semibold leading-5 tracking-[-0.005em] text-foreground">
              {label}
            </h2>
            <p className="truncate text-xs leading-relaxed text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        {canOpen ? (
          <Link
            href={href}
            className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Open <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        ) : null}
      </div>

      {block.state === "restricted" ? (
        // Withheld, not missing — say which, or the reader concludes the
        // company took no money this month.
        <div className="flex items-start gap-2 p-4 text-sm text-muted-foreground">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{block.note ?? "You do not have access to this section."}</span>
        </div>
      ) : block.state === "unavailable" ? (
        <div className="flex items-start gap-2 p-4 text-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden />
          <span>
            No data yet — {block.note ?? "this department has not been set up."}
          </span>
        </div>
      ) : (
        <div className="space-y-4 p-4">
          <MetricStrip metrics={metrics} />
          {children}
        </div>
      )}
    </section>
  );
}
