"use client";

import { useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useCrmStore } from "@/lib/store/crm-store";
import { StatCard } from "@/components/stats/stat-card";
import { STAGES, STAGE_LABELS } from "@/lib/constants";
import { daysToClose } from "@/lib/utils/time";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LOST_REASON_LABELS } from "@/lib/constants";
import { BarChart3, TrendingUp, DollarSign, Wifi, Wrench } from "lucide-react";

export default function AnalyticsPage() {
  const { isAdmin } = useAuth();
  const router = useRouter();
  const { leads } = useCrmStore();

  useEffect(() => {
    if (!isAdmin) router.replace("/board");
  }, [isAdmin, router]);

  const stats = useMemo(() => {
    const won = leads.filter((l) => l.stage === "closed_won");
    const lost = leads.filter((l) => l.stage === "closed_lost");
    const active = leads.filter(
      (l) => l.stage !== "closed_won" && l.stage !== "closed_lost"
    );
    const closeTimes = won.map(daysToClose).filter((d): d is number => d !== null);
    const avgClose =
      closeTimes.length > 0
        ? Math.round(closeTimes.reduce((a, b) => a + b, 0) / closeTimes.length)
        : 0;
    const winRate =
      won.length + lost.length > 0
        ? Math.round((won.length / (won.length + lost.length)) * 100)
        : 0;
    const pipeline = active.reduce((s, l) => s + (l.dealValue ?? 0), 0);
    const revenue = won.reduce((s, l) => s + (l.dealValue ?? 0), 0);
    const fiber = leads.filter((l) => l.serviceType === "fiber").length;
    const wireless = leads.filter((l) => l.serviceType === "wireless").length;
    const both = leads.filter((l) => l.serviceType === "both").length;

    const byStage = STAGES.map((stage) => ({
      ...stage,
      count: leads.filter((l) => l.stage === stage.id).length,
    }));

    const lostReasons = Object.keys(LOST_REASON_LABELS).map((key) => ({
      reason: key as keyof typeof LOST_REASON_LABELS,
      count: lost.filter((l) => l.lostReason === key).length,
    })).filter((r) => r.count > 0);

    const installations = {
      scheduled: won.filter((l) => l.installationStatus === "scheduled").length,
      in_progress: won.filter((l) => l.installationStatus === "in_progress").length,
      completed: won.filter((l) => l.installationStatus === "completed").length,
    };

    return { won, lost, active, avgClose, winRate, pipeline, revenue, fiber, wireless, both, byStage, lostReasons, installations };
  }, [leads]);

  if (!isAdmin) return null;

  const maxCount = Math.max(...stats.byStage.map((s) => s.count), 1);

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Sales performance and pipeline insights
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Win Rate" value={`${stats.winRate}%`} icon={TrendingUp} accent="#16a34a" />
        <StatCard title="Avg Days to Close" value={`${stats.avgClose}d`} icon={BarChart3} />
        <StatCard
          title="Pipeline Value"
          value={`R${stats.pipeline.toLocaleString()}`}
          icon={DollarSign}
          accent="#C83733"
        />
        <StatCard
          title="Revenue Closed"
          value={`R${stats.revenue.toLocaleString()}`}
          icon={DollarSign}
          accent="#16a34a"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Leads by Stage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.byStage
              .filter((s) => s.count > 0)
              .map((stage) => (
                <div key={stage.id}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{stage.label}</span>
                    <span className="font-medium">{stage.count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(stage.count / maxCount) * 100}%`,
                        backgroundColor: stage.headerColor,
                      }}
                    />
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wifi className="h-4 w-4" />
              Service Type Split
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ServiceBar label="Fiber" count={stats.fiber} total={leads.length} color="#2563eb" />
            <ServiceBar label="Wireless" count={stats.wireless} total={leads.length} color="#f97316" />
            <ServiceBar label="Fiber + Wireless" count={stats.both} total={leads.length} color="#a855f7" />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Loss Reasons</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {stats.lostReasons.length === 0 ? (
              <p className="text-sm text-muted-foreground">No lost deals recorded yet.</p>
            ) : (
              stats.lostReasons.map((r) => (
                <div key={r.reason} className="flex justify-between text-sm">
                  <span>{LOST_REASON_LABELS[r.reason]}</span>
                  <span className="font-medium">{r.count}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Wrench className="h-4 w-4" />Installation Pipeline</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm"><span>Scheduled</span><span className="font-medium">{stats.installations.scheduled}</span></div>
            <div className="flex justify-between text-sm"><span>In Progress</span><span className="font-medium">{stats.installations.in_progress}</span></div>
            <div className="flex justify-between text-sm"><span>Completed</span><span className="font-medium">{stats.installations.completed}</span></div>
            <p className="text-xs text-muted-foreground">Revenue closed: R{stats.revenue.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ServiceBar({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-medium">
          {count} ({pct}%)
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}
