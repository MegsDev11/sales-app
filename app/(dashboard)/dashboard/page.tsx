"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useCrmStore } from "@/lib/store/crm-store";
import { PageHeader, PageShell, Panel, AlertBanner } from "@/components/layout/page-shell";
import { buttonVariants } from "@/components/ui/button";
import { HeroFigure, StatTile } from "@/components/charts/primitives";
import { LineChart } from "@/components/charts/line-chart";
import { FunnelChart } from "@/components/charts/funnel-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { BarChart } from "@/components/charts/bar-chart";
import { ColumnChart } from "@/components/charts/bar-chart";
import { SERIES, STATUS, compact } from "@/components/charts/tokens";
import {
  activityByWeek,
  avgDaysToClose,
  leadsByMonth,
  leadsBySource,
  leadsByZone,
  momChange,
  openPipelineValue,
  pipelineFunnel,
  repPerformance,
  revenueByMonth,
  winRate,
  wonLostByMonth,
} from "@/lib/analytics/metrics";
import {
  isActiveLead,
  isFollowUpDueToday,
  isFollowUpOverdue,
  isInLeadInbox,
  isLeadVisible,
  formatFollowUpDate,
} from "@/lib/utils/leads";
import { STAGE_LABELS } from "@/lib/constants";
import { AlertTriangle, Calendar, Inbox, Kanban, Target, TrendingUp } from "lucide-react";

/**
 * Sales command centre.
 *
 * Note there is no dual-axis chart anywhere here. Revenue and lead count are on
 * different scales, so they get two charts rather than two y-axes — a dual axis
 * would invent a correlation the data doesn't contain.
 */
export default function SalesDashboardPage() {
  const { currentUser, can } = useAuth();
  const { leads, users, activities } = useCrmStore();

  const m = useMemo(() => {
    const revenue = revenueByMonth(leads, 6);
    const counts = leadsByMonth(leads, 6);
    const wonLost = wonLostByMonth(leads, 6);
    const visible = leads.filter(isLeadVisible);
    const active = visible.filter(isActiveLead);

    return {
      revenue,
      counts,
      wonLost,
      funnel: pipelineFunnel(leads),
      pipeline: openPipelineValue(leads),
      winRate: winRate(leads),
      daysToClose: avgDaysToClose(leads),
      sources: leadsBySource(leads),
      zones: leadsByZone(leads),
      activity: activityByWeek(activities, 8),
      reps: repPerformance(leads, users),
      active,
      unassigned: active.filter(isInLeadInbox),
      overdue: active.filter(isFollowUpOverdue),
      dueToday: active.filter(isFollowUpDueToday),
      thisMonthRevenue: revenue.values[revenue.values.length - 1] ?? 0,
    };
  }, [leads, users, activities]);

  const isManager = can("crm", "manage");

  /** A rep sees their own numbers; a manager sees the team's. */
  const myLeads = useMemo(
    () => m.active.filter((l) => l.assignedToId === currentUser?.id),
    [m.active, currentUser]
  );

  const focusList = (isManager ? m.overdue : myLeads.filter(isFollowUpOverdue))
    .slice(0, 6);

  return (
    <PageShell>
      <PageHeader
        title={isManager ? "Sales Command Centre" : "Sales Overview"}
        description={
          isManager
            ? "Pipeline health, conversion and team performance"
            : "Your pipeline and what needs attention"
        }
        actions={
          <div className="flex gap-2">
            <Link href="/board" className={buttonVariants({ variant: "outline" })}>
              <Kanban className="mr-1.5 h-4 w-4" /> Board
            </Link>
            {isManager ? (
              <Link
                href="/inbox"
                className={buttonVariants({
                  className: "bg-primary text-primary-foreground hover:bg-primary/90",
                })}
              >
                <Inbox className="mr-1.5 h-4 w-4" /> Inbox
                {m.unassigned.length > 0 ? ` (${m.unassigned.length})` : ""}
              </Link>
            ) : null}
          </div>
        }
      />

      {m.overdue.length > 0 ? (
        <AlertBanner tone="warn">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">
            {m.overdue.length} follow-up{m.overdue.length === 1 ? " is" : "s are"} overdue.
          </span>
          <Link href="/board" className="shrink-0 font-medium underline">
            Open board
          </Link>
        </AlertBanner>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <Panel title="This month">
          <HeroFigure
            label="Revenue closed"
            value={m.thisMonthRevenue}
            currency
            delta={momChange(m.revenue.values)}
            deltaLabel="vs last month"
          />
        </Panel>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Open pipeline"
            value={m.pipeline}
            currency
            icon={Target}
            accent={SERIES[0]}
            trend={m.revenue.values}
            href="/board"
          />
          <StatTile
            label="Active leads"
            value={m.active.length}
            icon={TrendingUp}
            accent={SERIES[2]}
            trend={m.counts.values}
            delta={momChange(m.counts.values)}
            deltaLabel="vs last month"
            href="/board"
          />
          <StatTile
            label="Win rate"
            value={`${Math.round(m.winRate)}%`}
            icon={Target}
            accent={SERIES[3]}
          />
          <StatTile
            label="Avg days to close"
            value={Math.round(m.daysToClose)}
            icon={Calendar}
            accent={SERIES[1]}
            higherIsBetter={false}
          />
          <StatTile
            label="Due today"
            value={m.dueToday.length}
            icon={Calendar}
            accent={SERIES[6]}
            href="/board"
          />
          <StatTile
            label="Overdue"
            value={m.overdue.length}
            icon={AlertTriangle}
            accent={m.overdue.length > 0 ? STATUS.critical : SERIES[2]}
            higherIsBetter={false}
            href="/board"
          />
          <StatTile
            label="Unassigned"
            value={m.unassigned.length}
            icon={Inbox}
            accent={m.unassigned.length > 0 ? STATUS.warning : SERIES[2]}
            higherIsBetter={false}
            href="/inbox"
          />
          <StatTile
            label="My open leads"
            value={myLeads.length}
            icon={Kanban}
            accent={SERIES[4]}
            href="/board"
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <FunnelChart
          title="Pipeline funnel"
          subtitle="Open leads by stage, with stage-to-stage conversion"
          stages={m.funnel.map((s) => ({ ...s, href: "/board" }))}
        />

        <LineChart
          title="Revenue closed"
          subtitle="Won deals per month"
          labels={m.revenue.labels}
          series={[{ label: "Revenue", points: m.revenue.values }]}
          currency
          area
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Two series -> legend is present, and both are direct-labelled at the end. */}
        <LineChart
          title="Won vs lost"
          subtitle="Deals closed per month"
          labels={m.wonLost.labels}
          series={[
            { label: "Won", points: m.wonLost.won, colorIndex: 2 },
            { label: "Lost", points: m.wonLost.lost, colorIndex: 7 },
          ]}
        />
        <ColumnChart
          title="New leads"
          subtitle="Created per month"
          data={m.counts.labels.map((label, i) => ({ label, value: m.counts.values[i] }))}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <DonutChart
          title="Lead sources"
          subtitle="Where leads come from"
          segments={m.sources.map((s, i) => ({ ...s, colorIndex: i }))}
          centerLabel="leads"
        />
        <BarChart
          title="Active leads by area"
          subtitle="Open pipeline by service zone"
          data={m.zones}
        />
        <ColumnChart
          title="Activity volume"
          subtitle="Logged activities per week"
          data={m.activity.labels.map((label, i) => ({
            label,
            value: m.activity.values[i],
          }))}
        />
      </div>

      {isManager && m.reps.length > 0 ? (
        <Panel
          title="Team performance"
          description="Sales representatives, ranked by revenue closed"
          padded={false}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Representative</th>
                  <th className="px-4 py-2 text-right font-medium">Won</th>
                  <th className="px-4 py-2 text-right font-medium">Revenue</th>
                  <th className="px-4 py-2 text-right font-medium">Open</th>
                  <th className="px-4 py-2 text-right font-medium">Open value</th>
                  <th className="px-4 py-2 text-right font-medium">Win rate</th>
                </tr>
              </thead>
              <tbody>
                {m.reps.map((rep) => (
                  <tr key={rep.user.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2">
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-medium text-white"
                          style={{ background: rep.user.color || SERIES[0] }}
                        >
                          {rep.user.avatarInitials}
                        </span>
                        <span className="truncate">{rep.user.name}</span>
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{rep.won}</td>
                    <td className="px-4 py-2 text-right font-medium tabular-nums">
                      {compact(rep.revenue, true)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{rep.open}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                      {compact(rep.openValue, true)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {Math.round(rep.winRate)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}

      {focusList.length > 0 ? (
        <Panel
          title="Needs attention"
          description="Overdue follow-ups, oldest first"
          padded={false}
        >
          <ul className="divide-y divide-border">
            {focusList.map((lead) => (
              <li key={lead.id}>
                <Link
                  href={`/leads/${lead.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{lead.clientName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {STAGE_LABELS[lead.stage]}
                      {lead.nextAction ? ` · ${lead.nextAction}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs" style={{ color: STATUS.critical }}>
                    {formatFollowUpDate(lead.nextFollowUpAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </PageShell>
  );
}
