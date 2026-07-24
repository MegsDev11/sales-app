"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useCrmStore } from "@/lib/store/crm-store";
import { StatCard } from "@/components/stats/stat-card";
import { UserFormDialog } from "@/components/team/user-form-dialog";
import { ACTIVITY_LABELS, STAGE_LABELS } from "@/lib/constants";
import { daysToClose } from "@/lib/utils/time";
import { getRepMonthlyStats } from "@/lib/utils/leads";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { User } from "@/lib/types";
import { getSalesStaff, getVisibleUsers, isSalesManager } from "@/lib/permissions";
import { PageHeader, PageShell } from "@/components/layout/page-shell";
import { Users, Target, Clock, TrendingUp, Trophy, Pencil } from "lucide-react";

export default function TeamPage() {
  const { isAdmin, currentUser } = useAuth();
  const router = useRouter();
  const { users, leads } = useCrmStore();
  const [editUser, setEditUser] = useState<User | undefined>();

  useEffect(() => {
    if (!isAdmin || !currentUser) router.replace("/board");
  }, [isAdmin, currentUser, router]);

  const visibleUsers = currentUser ? getVisibleUsers(currentUser, users) : [];
  const salesReps = getSalesStaff(visibleUsers);
  const salesManager = visibleUsers.find((u) => isSalesManager(u));

  const teamStats = useMemo(() => {
    const activeLeads = leads.filter(
      (l) => !l.deleted && l.stage !== "closed_won" && l.stage !== "closed_lost"
    );
    const wonLeads = leads.filter((l) => !l.deleted && l.stage === "closed_won");
    const closeTimes = wonLeads
      .map(daysToClose)
      .filter((d): d is number => d !== null);
    const avgClose =
      closeTimes.length > 0
        ? Math.round(closeTimes.reduce((a, b) => a + b, 0) / closeTimes.length)
        : 0;

    return {
      totalActive: activeLeads.length,
      totalWon: wonLeads.length,
      avgCloseDays: avgClose,
      pipelineValue: activeLeads.reduce((sum, l) => sum + (l.dealValue ?? 0), 0),
    };
  }, [leads]);

  if (!isAdmin) return null;

  const renderMemberCard = (rep: User) => {
    const repLeads = leads.filter((l) => !l.deleted && l.assignedToId === rep.id);
    const active = repLeads.filter(
      (l) => l.stage !== "closed_won" && l.stage !== "closed_lost"
    );
    const currentLead = active[0];
    const won = repLeads.filter((l) => l.stage === "closed_won");
    const closeTimes = won.map(daysToClose).filter((d): d is number => d !== null);
    const avgClose =
      closeTimes.length > 0
        ? Math.round(closeTimes.reduce((a, b) => a + b, 0) / closeTimes.length)
        : 0;
    const monthly = getRepMonthlyStats(leads, rep.id);

    return (
      <Card key={rep.id} className="bg-white">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Avatar style={{ boxShadow: `0 0 0 2px ${rep.color}` }}>
              <AvatarFallback
                className="font-semibold text-white"
                style={{ backgroundColor: rep.color }}
              >
                {rep.avatarInitials}
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-base">{rep.name}</CardTitle>
              <p className="text-sm text-muted-foreground">{rep.title}</p>
              {isSalesManager(rep) && (
                <Badge className="mt-1 bg-primary text-primary-foreground hover:bg-primary">Sales Manager</Badge>
              )}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditUser(rep)}
            title="Edit team member"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-4 text-sm">
            <span><strong>{active.length}</strong> active</span>
            <span><strong>{won.length}</strong> won</span>
            <span><strong>{avgClose}d</strong> avg close</span>
          </div>
          <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs">
            <p className="text-muted-foreground">
              Target: R{rep.monthlyRevenueTarget.toLocaleString()} / {rep.monthlyDealsTarget} deals
            </p>
            <p className="mt-0.5 font-medium">
              This month: R{monthly.revenueClosed.toLocaleString()} · {monthly.dealsClosed} closed
            </p>
          </div>
          {currentLead ? (
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Currently working on</p>
              <Link
                href={`/leads/${currentLead.id}`}
                className="font-medium hover:text-primary"
              >
                {currentLead.clientName}
              </Link>
              <div className="mt-1 flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {ACTIVITY_LABELS[currentLead.currentActivity]}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {STAGE_LABELS[currentLead.stage]}
                </Badge>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No active leads</p>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <PageShell>
      <PageHeader
        title="Team Overview"
        description="Manage your sales team and monitor performance"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Active Leads" value={teamStats.totalActive} icon={Target} accent="var(--primary)" />
        <StatCard title="Deals Won" value={teamStats.totalWon} icon={TrendingUp} accent="#16a34a" />
        <StatCard title="Avg Days to Close" value={`${teamStats.avgCloseDays}d`} icon={Clock} />
        <StatCard
          title="Pipeline Value"
          value={`R${teamStats.pipelineValue.toLocaleString()}`}
          icon={Users}
          accent="var(--primary)"
        />
      </div>

      <Card className="bg-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-4 w-4" />
            Leaderboard (This Month)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[...salesReps]
            .map((rep) => ({ rep, stats: getRepMonthlyStats(leads, rep.id) }))
            .sort((a, b) => b.stats.revenueClosed - a.stats.revenueClosed)
            .map(({ rep, stats }, i) => (
              <div key={rep.id} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">
                    #{i + 1} {rep.name}
                  </span>
                  <span>
                    R{stats.revenueClosed.toLocaleString()} · {stats.dealsClosed} deals
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-100">
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
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Team Members</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {salesManager && renderMemberCard(salesManager)}
          {salesReps.map(renderMemberCard)}
        </div>
      </div>

      <Card className="bg-white">
        <CardHeader>
          <CardTitle>Who&apos;s Working on What</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-4">Rep</th>
                  <th className="pb-2 pr-4">Client</th>
                  <th className="pb-2 pr-4">Stage</th>
                  <th className="pb-2 pr-4">Activity</th>
                  <th className="pb-2">Service</th>
                </tr>
              </thead>
              <tbody>
                {leads
                  .filter(
                    (l) =>
                      !l.deleted &&
                      l.stage !== "closed_won" &&
                      l.stage !== "closed_lost"
                  )
                  .map((lead) => {
                    const rep = users.find((u) => u.id === lead.assignedToId);
                    return (
                      <tr key={lead.id} className="border-b last:border-0">
                        <td className="py-2 pr-4">
                          <span className="flex items-center gap-2">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: rep?.color }}
                            />
                            {rep?.name.split(" ")[0] ?? "Unassigned"}
                          </span>
                        </td>
                        <td className="py-2 pr-4">
                          <Link
                            href={`/leads/${lead.id}`}
                            className="hover:text-primary"
                          >
                            {lead.clientName}
                          </Link>
                        </td>
                        <td className="py-2 pr-4">{STAGE_LABELS[lead.stage]}</td>
                        <td className="py-2 pr-4">
                          {ACTIVITY_LABELS[lead.currentActivity]}
                        </td>
                        <td className="py-2 capitalize">{lead.serviceType}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <UserFormDialog
        open={!!editUser}
        onOpenChange={(open) => {
          if (!open) setEditUser(undefined);
        }}
        user={editUser}
      />
    </PageShell>
  );
}
