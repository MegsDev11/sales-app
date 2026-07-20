"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useCrmStore } from "@/lib/store/crm-store";
import { StatCard } from "@/components/stats/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <div className="space-y-6 p-4 lg:p-6">
        <div>
          <h1 className="text-2xl font-bold">Command Center</h1>
          <p className="text-sm text-muted-foreground">Team overview and action items</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Active Leads" value={active.length} icon={Target} accent="#C83733" />
          <StatCard title="Due Today" value={dueToday.length} icon={Calendar} accent="#C83733" />
          <StatCard title="Stuck in Stage" value={stuck.length} icon={AlertTriangle} accent="#dc2626" />
          <StatCard title="Unassigned" value={notifs?.unassigned.length ?? 0} icon={Inbox} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Follow-ups Due Today</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {dueToday.length === 0 ? (
                <p className="text-sm text-muted-foreground">No follow-ups due today.</p>
              ) : (
                dueToday.map((l) => (
                  <Link key={l.id} href={`/leads/${l.id}`} className="flex items-center justify-between rounded-lg border p-3 hover:bg-gray-50">
                    <div>
                      <p className="font-medium">{l.clientName}</p>
                      <p className="text-xs text-muted-foreground">{l.nextAction ?? "Follow up"}</p>
                    </div>
                    <Badge style={{ backgroundColor: getUserById(l.assignedToId ?? "")?.color }} className="text-white">
                      {getUserById(l.assignedToId ?? "")?.name.split(" ")[0] ?? "?"}
                    </Badge>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Rep Workload</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {repWorkload.map(({ rep, count, stats }) => (
                <div key={rep.id} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{rep.name}</span>
                    <span>{count} active · R{stats.revenueClosed.toLocaleString()} closed</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full rounded-full" style={{ width: `${Math.min((stats.revenueClosed / rep.monthlyRevenueTarget) * 100, 100)}%`, backgroundColor: rep.color }} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Recent Wins</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {recentWins.map((l) => (
                <Link key={l.id} href={`/leads/${l.id}`} className="flex justify-between rounded-lg border p-2 text-sm hover:bg-gray-50">
                  <span>{l.clientName}</span>
                  <span className="font-medium text-green-600">R{(l.dealValue ?? 0).toLocaleString()}</span>
                </Link>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Quick Links</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Link href="/board"><Button variant="outline" size="sm"><Kanban className="mr-1 h-4 w-4" />Board</Button></Link>
              <Link href="/inbox"><Button variant="outline" size="sm"><Inbox className="mr-1 h-4 w-4" />Inbox</Button></Link>
              <Link href="/surveys"><Button variant="outline" size="sm">Surveys</Button></Link>
              <Link href="/team"><Button variant="outline" size="sm">Team</Button></Link>
              <Link href="/analytics"><Button variant="outline" size="sm">Analytics</Button></Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const myStats = currentUser ? getRepMonthlyStats(leads, currentUser.id) : { dealsClosed: 0, revenueClosed: 0 };

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-bold">Good day, {currentUser?.name.split(" ")[0]}</h1>
        <p className="text-sm text-muted-foreground">Here&apos;s what needs your attention</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="My Active Leads" value={active.length} icon={Target} accent={currentUser?.color} />
        <StatCard title="Due Today" value={dueToday.length} icon={Calendar} accent="#C83733" />
        <StatCard title="Deals Closed" value={myStats.dealsClosed} icon={TrendingUp} accent="#16a34a" />
        <StatCard title="Revenue" value={`R${myStats.revenueClosed.toLocaleString()}`} accent="#C83733" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Today&apos;s Tasks</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {dueToday.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tasks due today. Check your pipeline!</p>
            ) : (
              dueToday.map((l) => (
                <Link key={l.id} href={`/leads/${l.id}`} className="block rounded-lg border p-3 hover:bg-gray-50">
                  <p className="font-medium">{l.clientName}</p>
                  <p className="text-xs text-muted-foreground">{l.nextAction} · {formatFollowUpDate(l.nextFollowUpAt)}</p>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Hot Leads</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {hotLeads.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hot leads right now.</p>
            ) : (
              hotLeads.map((l) => (
                <Link key={l.id} href={`/leads/${l.id}`} className="flex items-center justify-between rounded-lg border p-3 hover:bg-gray-50">
                  <div>
                    <p className="font-medium">{l.clientName}</p>
                    <p className="text-xs text-muted-foreground">{STAGE_LABELS[l.stage]} · {ACTIVITY_LABELS[l.currentActivity]}</p>
                  </div>
                  <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Hot</Badge>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2">
        <Link href="/board"><Button className="bg-[#C83733] hover:bg-[#a82f2b]">Go to Pipeline</Button></Link>
        <Link href="/my-stats"><Button variant="outline">My Stats</Button></Link>
      </div>
    </div>
  );
}
