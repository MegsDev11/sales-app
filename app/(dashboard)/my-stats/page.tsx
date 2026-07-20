"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useCrmStore } from "@/lib/store/crm-store";
import { StatCard } from "@/components/stats/stat-card";
import { STAGE_LABELS, ACTIVITY_LABELS } from "@/lib/constants";
import { daysToClose } from "@/lib/utils/time";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getRepMonthlyStats } from "@/lib/utils/leads";
import { Target, TrendingUp, Clock, DollarSign } from "lucide-react";

export default function MyStatsPage() {
  const { currentUser } = useAuth();
  const { leads } = useCrmStore();

  const stats = useMemo(() => {
    if (!currentUser) return null;

    const myLeads = leads.filter((l) => l.assignedToId === currentUser.id);
    const active = myLeads.filter(
      (l) => l.stage !== "closed_won" && l.stage !== "closed_lost"
    );
    const won = myLeads.filter((l) => l.stage === "closed_won");
    const closeTimes = won.map(daysToClose).filter((d): d is number => d !== null);
    const avgClose =
      closeTimes.length > 0
        ? Math.round(closeTimes.reduce((a, b) => a + b, 0) / closeTimes.length)
        : 0;
    const pipeline = active.reduce((s, l) => s + (l.dealValue ?? 0), 0);
    const revenue = won.reduce((s, l) => s + (l.dealValue ?? 0), 0);

    const monthly = getRepMonthlyStats(leads, currentUser.id);

    return { myLeads, active, won, avgClose, pipeline, revenue, monthly };
  }, [leads, currentUser]);

  if (!currentUser || !stats) return null;

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-bold">My Stats</h1>
        <p className="text-sm text-muted-foreground">
          Your personal sales performance
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Active Leads" value={stats.active.length} icon={Target} accent={currentUser.color} />
        <StatCard title="Deals Won" value={stats.won.length} icon={TrendingUp} accent="#16a34a" />
        <StatCard title="Avg Days to Close" value={`${stats.avgClose}d`} icon={Clock} />
        <StatCard
          title="Revenue Closed"
          value={`R${stats.revenue.toLocaleString()}`}
          icon={DollarSign}
          accent="#C83733"
        />
      </div>

      <Card>
        <CardHeader><CardTitle>Monthly Target</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>R{stats.monthly.revenueClosed.toLocaleString()} closed</span>
            <span className="text-muted-foreground">Target: R{currentUser.monthlyRevenueTarget.toLocaleString()}</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-[#C83733]" style={{ width: `${Math.min((stats.monthly.revenueClosed / currentUser.monthlyRevenueTarget) * 100, 100)}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">{stats.monthly.dealsClosed} of {currentUser.monthlyDealsTarget} deals closed this month</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>My Active Leads</CardTitle>
        </CardHeader>
        <CardContent>
          {stats.active.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No active leads. Check the pipeline board for closed deals.
            </p>
          ) : (
            <div className="space-y-3">
              {stats.active.map((lead) => (
                <Link
                  key={lead.id}
                  href={`/leads/${lead.id}`}
                  className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-gray-50"
                >
                  <div>
                    <p className="font-medium">{lead.clientName}</p>
                    <p className="text-sm text-muted-foreground">{lead.packageTier}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{STAGE_LABELS[lead.stage]}</Badge>
                    <Badge variant="outline">{ACTIVITY_LABELS[lead.currentActivity]}</Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pipeline Value</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold text-[#C83733]">
            R{stats.pipeline.toLocaleString()}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Total value of your {stats.active.length} active leads
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
