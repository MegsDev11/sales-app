"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useCrmStore } from "@/lib/store/crm-store";
import { StatCard } from "@/components/stats/stat-card";
import { PageHeader, PageShell, Panel } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  filterLeadsForUser,
  getNotifications,
  getRepMonthlyStats,
  isActiveLead,
  isFollowUpDueToday,
  formatFollowUpDate,
} from "@/lib/utils/leads";
import { isOverdue } from "@/lib/utils/time";
import { STAGE_LABELS, ACTIVITY_LABELS } from "@/lib/constants";
import { getSalesStaff } from "@/lib/permissions";
import { Target, Calendar, AlertTriangle, TrendingUp, Inbox, Kanban } from "lucide-react";

function ListRow({
  href,
  title,
  subtitle,
  trailing,
}: {
  href: string;
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 border-b border-border px-1 py-2.5 last:border-0 hover:bg-muted/40"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{title}</p>
        {subtitle ? (
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {trailing}
    </Link>
  );
}

export default function DashboardPage() {
  const { currentUser, isAdmin } = useAuth();
  const { leads, users, getUserById } = useCrmStore();

  const visible = useMemo(
    () => filterLeadsForUser(leads, currentUser?.id, isAdmin),
    [leads, currentUser, isAdmin]
  );

  const active = visible.filter(isActiveLead);
  const dueToday = active.filter(isFollowUpDueToday);
  const stuck = active.filter(isOverdue);
  const recentWins = visible.filter((l) => l.stage === "closed_won").slice(0, 5);
  const hotLeads = active.filter((l) => l.temperature === "hot").slice(0, 5);

  const notifs = currentUser
    ? getNotifications(leads, users, currentUser.id, isAdmin)
    : null;

  if (isAdmin) {
    const repWorkload = getSalesStaff(users).map((rep) => ({
      rep,
      count: active.filter((l) => l.assignedToId === rep.id).length,
      stats: getRepMonthlyStats(leads, rep.id),
    }));

    return (
      <PageShell>
        <PageHeader
          title="Command Center"
          description="Team overview and action items"
          actions={
            <>
              <Link href="/board">
                <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
                  <Kanban className="mr-1 h-4 w-4" />
                  Board
                </Button>
              </Link>
              <Link href="/inbox">
                <Button size="sm" variant="outline">
                  <Inbox className="mr-1 h-4 w-4" />
                  Inbox
                </Button>
              </Link>
            </>
          }
        />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Active Leads" value={active.length} icon={Target} accent="var(--primary)" />
          <StatCard title="Due Today" value={dueToday.length} icon={Calendar} accent="var(--primary)" />
          <StatCard title="Stuck in Stage" value={stuck.length} icon={AlertTriangle} accent="#dc2626" />
          <StatCard title="Unassigned" value={notifs?.unassigned.length ?? 0} icon={Inbox} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Follow-ups due today" padded={false}>
            <div className="px-3 py-1">
              {dueToday.length === 0 ? (
                <p className="px-1 py-3 text-sm text-muted-foreground">No follow-ups due today.</p>
              ) : (
                dueToday.map((l) => (
                  <ListRow
                    key={l.id}
                    href={`/leads/${l.id}`}
                    title={l.clientName}
                    subtitle={l.nextAction ?? "Follow up"}
                    trailing={
                      <Badge
                        style={{ backgroundColor: getUserById(l.assignedToId ?? "")?.color }}
                        className="shrink-0 text-white"
                      >
                        {getUserById(l.assignedToId ?? "")?.name.split(" ")[0] ?? "?"}
                      </Badge>
                    }
                  />
                ))
              )}
            </div>
          </Panel>

          <Panel title="Rep workload">
            <div className="space-y-3">
              {repWorkload.map(({ rep, count, stats }) => (
                <div key={rep.id} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{rep.name}</span>
                    <span className="text-muted-foreground">
                      {count} active · R{stats.revenueClosed.toLocaleString()} closed
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min((stats.revenueClosed / rep.monthlyRevenueTarget) * 100, 100)}%`,
                        backgroundColor: rep.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Recent wins" padded={false}>
            <div className="px-3 py-1">
              {recentWins.length === 0 ? (
                <p className="px-1 py-3 text-sm text-muted-foreground">No recent wins.</p>
              ) : (
                recentWins.map((l) => (
                  <ListRow
                    key={l.id}
                    href={`/leads/${l.id}`}
                    title={l.clientName}
                    trailing={
                      <span className="shrink-0 text-sm font-medium text-green-600">
                        R{(l.dealValue ?? 0).toLocaleString()}
                      </span>
                    }
                  />
                ))
              )}
            </div>
          </Panel>

          <Panel title="Quick links">
            <div className="flex flex-wrap gap-2">
              <Link href="/surveys">
                <Button variant="outline" size="sm">
                  Surveys
                </Button>
              </Link>
              <Link href="/team">
                <Button variant="outline" size="sm">
                  Team
                </Button>
              </Link>
              <Link href="/analytics">
                <Button variant="outline" size="sm">
                  Analytics
                </Button>
              </Link>
            </div>
          </Panel>
        </div>
      </PageShell>
    );
  }

  const myStats = currentUser
    ? getRepMonthlyStats(leads, currentUser.id)
    : { dealsClosed: 0, revenueClosed: 0 };

  return (
    <PageShell>
      <PageHeader
        title={`Good day, ${currentUser?.name.split(" ")[0]}`}
        description="Here's what needs your attention"
        actions={
          <>
            <Link href="/board">
              <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
                Go to pipeline
              </Button>
            </Link>
            <Link href="/my-stats">
              <Button size="sm" variant="outline">
                My stats
              </Button>
            </Link>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="My Active Leads"
          value={active.length}
          icon={Target}
          accent={currentUser?.color}
        />
        <StatCard title="Due Today" value={dueToday.length} icon={Calendar} accent="var(--primary)" />
        <StatCard title="Deals Closed" value={myStats.dealsClosed} icon={TrendingUp} accent="#16a34a" />
        <StatCard
          title="Revenue"
          value={`R${myStats.revenueClosed.toLocaleString()}`}
          accent="var(--primary)"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Today's tasks" padded={false}>
          <div className="px-3 py-1">
            {dueToday.length === 0 ? (
              <p className="px-1 py-3 text-sm text-muted-foreground">
                No tasks due today. Check your pipeline!
              </p>
            ) : (
              dueToday.map((l) => (
                <ListRow
                  key={l.id}
                  href={`/leads/${l.id}`}
                  title={l.clientName}
                  subtitle={`${l.nextAction} · ${formatFollowUpDate(l.nextFollowUpAt)}`}
                />
              ))
            )}
          </div>
        </Panel>

        <Panel title="Hot leads" padded={false}>
          <div className="px-3 py-1">
            {hotLeads.length === 0 ? (
              <p className="px-1 py-3 text-sm text-muted-foreground">No hot leads right now.</p>
            ) : (
              hotLeads.map((l) => (
                <ListRow
                  key={l.id}
                  href={`/leads/${l.id}`}
                  title={l.clientName}
                  subtitle={`${STAGE_LABELS[l.stage]} · ${ACTIVITY_LABELS[l.currentActivity]}`}
                  trailing={
                    <Badge className="shrink-0 bg-red-100 text-red-700 hover:bg-red-100">Hot</Badge>
                  }
                />
              ))
            )}
          </div>
        </Panel>
      </div>
    </PageShell>
  );
}
