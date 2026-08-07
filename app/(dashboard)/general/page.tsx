"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { MODULES } from "@/lib/modules";
import { AlertBanner, PageHeader, PageShell, Panel } from "@/components/layout/page-shell";
import { buttonVariants } from "@/components/ui/button";
import { BarChart } from "@/components/charts/bar-chart";
import { HeroFigure, Meter, StatTile } from "@/components/charts/primitives";
import { SERIES, STATUS } from "@/components/charts/tokens";
import { DepartmentBlock } from "@/components/general/department-blocks";
import { useCompanyOverview } from "@/lib/general/use-company-overview";
import { OVERVIEW_SECTIONS, type OverviewSectionId } from "@/lib/general/overview-types";
import type { ModuleKey } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  Calendar,
  Fuel,
  Package,
  Radio,
  RefreshCw,
  ShoppingCart,
  Target,
  TrendingUp,
  Users,
  Wrench,
} from "lucide-react";

/**
 * General Management — the whole company on one screen.
 *
 * The GM's job is noticing which department is drifting, so this page shows all of
 * them at once rather than making him tour eight overviews. Every department gets
 * the same card: its headline numbers and the one chart that answers "is this
 * healthy?". The tab rail narrows to a single department and reveals the rest of
 * its charts — a filter over the same data, never a different page.
 *
 * The numbers arrive pre-aggregated from /api/general/overview. See that route for
 * why this does not simply mount the department stores.
 */

type Tab = "all" | OverviewSectionId;

export default function GeneralPage() {
  // Only for the per-department "Open" links below — the module gate itself is
  // RouteGuard's job, in the dashboard layout.
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>("all");
  const { data, isLoading, error, reload } = useCompanyOverview();

  const tabs = useMemo(
    () => [
      { id: "all" as Tab, label: "All departments" },
      ...OVERVIEW_SECTIONS.map((s) => ({ id: s.id as Tab, label: MODULES[s.module].label })),
    ],
    []
  );

  /**
   * Cross-department alerts, worst first.
   *
   * The point of a management view is that a stock shortfall and an overdue job
   * queue arrive in the same glance. Each one carries a route to the team that
   * owns it — a dashboard that reports a problem without a way to act on it is a
   * poster.
   */
  const alerts = useMemo(() => {
    if (!data) return [];
    const rows: { tone: "warn" | "danger"; text: string; href: string }[] = [];
    const pick = (n: number, one: string, many: string) => (n === 1 ? one : many);

    if (data.support.activeOutages > 0) {
      rows.push({
        tone: "danger",
        text: `${data.support.activeOutages} active network ${pick(data.support.activeOutages, "outage", "outages")}`,
        href: "/support/towers",
      });
    }
    if (data.coordination.overdue > 0) {
      rows.push({
        tone: "danger",
        text: `${data.coordination.overdue} ${pick(data.coordination.overdue, "job is", "jobs are")} past the scheduled end and still open`,
        href: "/coordination/jobs",
      });
    }
    if (data.stock.outOfStock > 0) {
      rows.push({
        tone: "warn",
        text: `${data.stock.outOfStock} ${pick(data.stock.outOfStock, "product has", "products have")} no units available`,
        href: "/stock/inventory",
      });
    }
    if (data.stock.returnsOverdue > 0) {
      rows.push({
        tone: "warn",
        text: `${data.stock.returnsOverdue} stock ${pick(data.stock.returnsOverdue, "item is", "items are")} past the return date`,
        href: "/stock/booked-out",
      });
    }
    if (data.sales.unassigned > 0) {
      rows.push({
        tone: "warn",
        text: `${data.sales.unassigned} ${pick(data.sales.unassigned, "lead is", "leads are")} unassigned in the inbox`,
        href: "/inbox",
      });
    }
    if (data.sales.overdueFollowUps > 0) {
      rows.push({
        tone: "warn",
        text: `${data.sales.overdueFollowUps} sales ${pick(data.sales.overdueFollowUps, "follow-up is", "follow-ups are")} overdue`,
        href: "/board",
      });
    }
    if (data.projects.atRisk > 0) {
      rows.push({
        tone: "warn",
        text: `${data.projects.atRisk} ${pick(data.projects.atRisk, "project is", "projects are")} past the target date`,
        href: "/projects",
      });
    }
    return rows;
  }, [data]);

  const visible =
    tab === "all" ? OVERVIEW_SECTIONS : OVERVIEW_SECTIONS.filter((s) => s.id === tab);
  const canOpen = (key: ModuleKey) => can(key, "view");

  return (
    <PageShell>
      <PageHeader
        title="General Management"
        description="Every department on one screen — the numbers, the charts, and where to act"
        meta={
          data ? (
            <span>
              Updated{" "}
              {new Date(data.generatedAt).toLocaleTimeString("en-ZA", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          ) : null
        }
        actions={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void reload()}
              disabled={isLoading}
              className={buttonVariants({ variant: "outline" })}
            >
              <RefreshCw className={cn("mr-1.5 h-4 w-4", isLoading && "animate-spin")} />
              Refresh
            </button>
            <Link href="/scheduler" className={buttonVariants({ variant: "outline" })}>
              <Calendar className="mr-1.5 h-4 w-4" /> Scheduler
            </Link>
          </div>
        }
      >
        {/* The tab rail sits on the header's bottom rail, so the filter belongs to
            the page rather than floating above the first card. */}
        <div role="tablist" aria-label="Department" className="flex flex-wrap gap-1.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                tab === t.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-background hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </PageHeader>

      {error ? (
        <AlertBanner tone="danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">Could not load the company overview — {error}</span>
          <button
            type="button"
            onClick={() => void reload()}
            className="shrink-0 font-medium underline"
          >
            Retry
          </button>
        </AlertBanner>
      ) : null}

      {isLoading && !data ? (
        <>
          <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
            <div className="h-44 animate-pulse rounded-lg border border-border bg-muted/40" />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="h-24 animate-pulse rounded-lg border border-border bg-muted/40"
                />
              ))}
            </div>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-72 animate-pulse rounded-lg border border-border bg-muted/40"
              />
            ))}
          </div>
        </>
      ) : null}

      {data ? (
        <>
          {alerts.length > 0 ? (
            <div className="space-y-2">
              {alerts.map((a) => (
                <AlertBanner key={a.text} tone={a.tone}>
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="flex-1">{a.text}</span>
                  <Link href={a.href} className="shrink-0 font-medium underline">
                    View
                  </Link>
                </AlertBanner>
              ))}
            </div>
          ) : null}

          {/* Company band. Exactly one hero figure on the page — the department
              cards below carry metric strips, not competing heroes. */}
          <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
            <Panel title="This month">
              <HeroFigure
                label="Revenue closed"
                value={data.sales.thisMonthRevenue}
                currency
                delta={data.sales.revenueChange}
                deltaLabel="vs last month"
              />
              {data.sales.revenueTarget > 0 ? (
                <div className="mt-4">
                  <Meter
                    label="Against team target"
                    value={data.sales.thisMonthRevenue}
                    max={data.sales.revenueTarget}
                    compactValue
                    // Missing the target is the problem, not exceeding it.
                    invert
                  />
                </div>
              ) : null}
            </Panel>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile
                label="Open pipeline"
                value={data.sales.openPipeline}
                currency
                icon={Target}
                accent={SERIES[0]}
                href="/board"
              />
              <StatTile
                label="Active jobs"
                value={data.coordination.activeJobs}
                icon={Wrench}
                accent={SERIES[3]}
                href="/coordination/jobs"
              />
              <StatTile
                label="Committed spend"
                value={data.procurement.committedSpend}
                currency
                icon={ShoppingCart}
                accent={SERIES[1]}
                higherIsBetter={false}
                href="/procurement/orders"
              />
              <StatTile
                label="Active staff"
                value={data.people.activeStaff}
                icon={Users}
                accent={SERIES[6]}
                href="/staff"
              />
              <StatTile
                label="Fuel this month"
                value={data.financial.thisMonthSpend}
                currency
                icon={Fuel}
                accent={SERIES[4]}
                delta={data.financial.spendChange}
                deltaLabel="vs last month"
                higherIsBetter={false}
                href="/financial"
              />
              <StatTile
                label="Towers online"
                value={`${data.support.towers - data.support.offlineTowers}/${data.support.towers}`}
                icon={Radio}
                accent={data.support.offlineTowers > 0 ? STATUS.critical : STATUS.good}
                href="/support/towers"
              />
              <StatTile
                label="Open pick lists"
                value={data.stock.openPickLists}
                icon={Package}
                accent={data.stock.openPickLists > 0 ? STATUS.warning : SERIES[2]}
                href="/stock/requests"
              />
              <StatTile
                label="Live projects"
                value={data.projects.active}
                icon={TrendingUp}
                accent={SERIES[2]}
                href="/projects"
              />
            </div>
          </div>

          {/* Two columns when every department is shown; a focused department takes
              the full width so its extra charts can sit two-up. */}
          <div className={cn("grid gap-4", tab === "all" && "xl:grid-cols-2")}>
            {visible.map((s) => (
              <DepartmentBlock
                key={s.id}
                id={s.id}
                data={data}
                focused={tab !== "all"}
                canOpen={canOpen}
              />
            ))}
          </div>

          {tab === "all" && data.people.headcountByDepartment.length > 0 ? (
            <BarChart
              title="Headcount by department"
              subtitle="Active staff assigned to each department"
              data={data.people.headcountByDepartment}
              maxRows={12}
            />
          ) : null}
        </>
      ) : null}
    </PageShell>
  );
}
