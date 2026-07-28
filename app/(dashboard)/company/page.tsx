"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useCrmStore } from "@/lib/store/crm-store";
import { PageHeader, PageShell, Panel, AlertBanner } from "@/components/layout/page-shell";
import { NetworkOperationsSection } from "@/components/owner/network-operations-section";
import { buttonVariants } from "@/components/ui/button";
import { HeroFigure, Meter, StatTile } from "@/components/charts/primitives";
import { LineChart } from "@/components/charts/line-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { BarChart } from "@/components/charts/bar-chart";
import { SERIES, STATUS } from "@/components/charts/tokens";
import { MODULE_LIST } from "@/lib/modules";
import { getDepartmentManagers, getDepartmentStaff } from "@/lib/permissions";
import { isActiveLead, isFollowUpOverdue, isInLeadInbox, isLeadVisible } from "@/lib/utils/leads";
import {
  avgDaysToClose,
  leadsByServiceType,
  momChange,
  openPipelineValue,
  revenueByMonth,
  winRate,
} from "@/lib/analytics/metrics";
import type { Department } from "@/lib/types";
import { AlertTriangle, Calendar, Lock, Radio, ShieldCheck, Target, TrendingUp, Users } from "lucide-react";

/**
 * Company overview — the owner's landing page.
 *
 * Leads with exactly one hero figure (revenue this month). Everything else is
 * supporting detail, because a dashboard where six things shout equally has no
 * headline at all.
 */
export default function CompanyPage() {
  const { isOwner, can } = useAuth();
  const { users, leads, towers, towerOutages, isLoaded, dbError } = useCrmStore();

  const metrics = useMemo(() => {
    const revenue = revenueByMonth(leads, 6);
    const activeLeads = leads.filter((l) => isLeadVisible(l) && isActiveLead(l));
    const thisMonth = revenue.values[revenue.values.length - 1] ?? 0;

    return {
      revenue,
      thisMonth,
      revenueChange: momChange(revenue.values),
      activeLeads,
      unassigned: activeLeads.filter(isInLeadInbox),
      overdue: activeLeads.filter(isFollowUpOverdue),
      pipeline: openPipelineValue(leads),
      winRate: winRate(leads),
      daysToClose: avgDaysToClose(leads),
      serviceMix: leadsByServiceType(leads),
      activeStaff: users.filter((u) => u.role !== "owner" && u.active !== false),
    };
  }, [leads, users]);

  const outages = towerOutages.filter((o) => !o.resolvedAt);
  const offlineTowers = towers.filter((t) => t.status === "offline");

  /** Headcount per department, from the org structure (not module grants). */
  const headcount = useMemo(() => {
    const departments: Department[] = [
      "sales", "support", "stock", "coordination", "wireless",
      "financial", "fiber", "general", "accounts", "reception",
    ];
    return departments
      .map((d) => ({
        label: d.charAt(0).toUpperCase() + d.slice(1),
        value: getDepartmentStaff(users, d).length + getDepartmentManagers(users, d).length,
      }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [users]);

  const revenueTarget = useMemo(
    () => metrics.activeStaff.reduce((s, u) => s + (u.monthlyRevenueTarget ?? 0), 0),
    [metrics.activeStaff]
  );

  if (!isOwner) {
    return (
      <PageShell>
        <PageHeader
          title="Company Overview"
          description="Company-wide performance across every department"
        />
        <Panel title="Owner only">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Lock className="h-4 w-4 shrink-0" />
            This page is limited to the company owner.
          </p>
        </Panel>
      </PageShell>
    );
  }

  if (!isLoaded) {
    return (
      <PageShell>
        <PageHeader
          title="Company Overview"
          description="Megs Waterberg — every department at a glance"
        />
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          <div className="h-40 animate-pulse rounded-lg border border-border bg-muted/40" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-lg border border-border bg-muted/40" />
            ))}
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-64 animate-pulse rounded-lg border border-border bg-muted/40" />
          ))}
        </div>
      </PageShell>
    );
  }

  const alerts = [
    metrics.unassigned.length > 0
      ? {
          tone: "warn" as const,
          text: `${metrics.unassigned.length} lead${metrics.unassigned.length === 1 ? "" : "s"} unassigned in the inbox`,
          href: "/inbox",
        }
      : null,
    metrics.overdue.length > 0
      ? {
          tone: "warn" as const,
          text: `${metrics.overdue.length} follow-up${metrics.overdue.length === 1 ? "" : "s"} overdue`,
          href: "/board",
        }
      : null,
    outages.length > 0
      ? {
          tone: "danger" as const,
          text: `${outages.length} active network outage${outages.length === 1 ? "" : "s"}`,
          href: "/support/towers",
        }
      : null,
  ].filter(Boolean) as { tone: "warn" | "danger"; text: string; href: string }[];

  return (
    <PageShell>
      <PageHeader
        title="Company Overview"
        description="Megs Waterberg — every department at a glance"
        actions={
          <div className="flex gap-2">
            <Link href="/scheduler" className={buttonVariants({ variant: "outline" })}>
              <Calendar className="mr-1.5 h-4 w-4" /> Scheduler
            </Link>
            <Link
              href="/admin"
              className={buttonVariants({
                className: "bg-primary text-primary-foreground hover:bg-primary/90",
              })}
            >
              <ShieldCheck className="mr-1.5 h-4 w-4" /> Access control
            </Link>
          </div>
        }
      />

      {dbError ? (
        <AlertBanner tone="danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">Could not load company data — {dbError}</span>
        </AlertBanner>
      ) : null}

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

      {/* Hero + supporting KPIs. Exactly one hero figure on the page. */}
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <Panel title="This month">
          <HeroFigure
            label="Revenue closed"
            value={metrics.thisMonth}
            currency
            delta={metrics.revenueChange}
            deltaLabel="vs last month"
          />
          {revenueTarget > 0 ? (
            <div className="mt-4">
              <Meter
                label="Against team target"
                value={metrics.thisMonth}
                max={revenueTarget}
                compactValue
                // Missing target is the problem, not exceeding it.
                invert
              />
            </div>
          ) : null}
        </Panel>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Open pipeline"
            value={metrics.pipeline}
            currency
            icon={Target}
            accent={SERIES[0]}
            href="/board"
          />
          <StatTile
            label="Active leads"
            value={metrics.activeLeads.length}
            icon={TrendingUp}
            accent={SERIES[2]}
            href="/board"
          />
          <StatTile
            label="Win rate"
            value={`${Math.round(metrics.winRate)}%`}
            icon={Target}
            accent={SERIES[3]}
          />
          <StatTile
            label="Staff"
            value={metrics.activeStaff.length}
            icon={Users}
            accent={SERIES[6]}
            href="/staff"
          />
          <StatTile
            label="Avg days to close"
            value={Math.round(metrics.daysToClose)}
            icon={TrendingUp}
            accent={SERIES[1]}
            higherIsBetter={false}
          />
          <StatTile
            label="Unassigned leads"
            value={metrics.unassigned.length}
            icon={AlertTriangle}
            accent={metrics.unassigned.length > 0 ? STATUS.warning : SERIES[2]}
            href="/inbox"
          />
          <StatTile
            label="Towers online"
            value={`${towers.length - offlineTowers.length}/${towers.length}`}
            icon={Radio}
            accent={offlineTowers.length > 0 ? STATUS.critical : STATUS.good}
            href="/support/towers"
          />
          <StatTile
            label="Active outages"
            value={outages.length}
            icon={AlertTriangle}
            accent={outages.length > 0 ? STATUS.critical : SERIES[2]}
            higherIsBetter={false}
            href="/support/towers"
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <LineChart
          title="Revenue closed"
          subtitle="Won deals per month, last 6 months"
          labels={metrics.revenue.labels}
          series={[{ label: "Revenue", points: metrics.revenue.values }]}
          currency
          area
        />
        <DonutChart
          title="Service mix"
          subtitle="All leads by service type"
          segments={metrics.serviceMix.map((s, i) => ({ ...s, colorIndex: i }))}
          centerLabel="leads"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <BarChart
          title="Headcount by department"
          subtitle="Active staff assigned to each department"
          data={headcount}
        />

        <Panel title="Departments" description="Managers, headcount and shortcuts" padded={false}>
          <div className="max-h-[340px] divide-y divide-border overflow-auto">
            {MODULE_LIST.filter((m) => m.group !== "admin").map((mod) => {
              const Icon = mod.icon;
              const deptKey = (mod.key === "crm" ? "sales" : mod.key) as Department;
              const manager = getDepartmentManagers(users, deptKey)[0];
              const staff = getDepartmentStaff(users, deptKey).length;
              return (
                <div
                  key={mod.key}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
                >
                  <div className="flex min-w-0 items-start gap-2.5">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {mod.label}
                        {mod.placeholder ? (
                          <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                            soon
                          </span>
                        ) : null}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {manager ? manager.name : "No manager"} · {staff} staff
                      </p>
                    </div>
                  </div>
                  {can(mod.key, "view") ? (
                    <Link
                      href={mod.root}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      Open
                    </Link>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      <NetworkOperationsSection />
    </PageShell>
  );
}
