"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useStockStore } from "@/lib/store/stock-store";
import { useCrmStore } from "@/lib/store/crm-store";
import { getFieldTechnicians } from "@/lib/permissions";
import { isJobOverdue } from "@/lib/overdue/rules";
import { AlertBanner, PageHeader, PageShell, Panel } from "@/components/layout/page-shell";
import { buttonVariants } from "@/components/ui/button";
import { StatTile } from "@/components/charts/primitives";
import { StackedBar, BarChart, ColumnChart } from "@/components/charts/bar-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { SERIES, STATUS } from "@/components/charts/tokens";
import type { FieldJob } from "@megs/shared";
import {
  AlertTriangle,
  Boxes,
  Briefcase,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  Users,
} from "lucide-react";

/** Job status is a workflow state, so it gets categorical colour by identity. */
const STATUS_COLOR: Record<string, string> = {
  scheduled: SERIES[0],
  en_route: SERIES[3],
  on_site: SERIES[1],
  completed: SERIES[2],
  cancelled: "#94a3b8",
};

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Scheduled",
  en_route: "En route",
  on_site: "On site",
  completed: "Completed",
  cancelled: "Cancelled",
};

export default function CoordinationOverviewPage() {
  const { accessToken } = useAuth();
  const { products, items, requests, isLoaded } = useStockStore();
  const { users } = useCrmStore();

  const [jobs, setJobs] = useState<FieldJob[]>([]);
  const [jobsError, setJobsError] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await fetch("/api/coordination/jobs", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load jobs");
      setJobs(body.jobs ?? []);
      setJobsError(null);
    } catch (err) {
      setJobsError(err instanceof Error ? err.message : "Failed to load jobs");
    }
  }, [accessToken]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  const techs = useMemo(() => getFieldTechnicians(users), [users]);

  const m = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(startOfToday.getDate() + 1);

    const active = jobs.filter((j) => j.status !== "completed" && j.status !== "cancelled");

    const today = jobs.filter((j) => {
      if (!j.scheduledStart) return false;
      const t = new Date(j.scheduledStart).getTime();
      return t >= startOfToday.getTime() && t < endOfToday.getTime();
    });

    const overdue = active.filter((j) => isJobOverdue(j.scheduledEnd, j.status, now.getTime()));

    const unassigned = active.filter(
      (j) => !j.technicianIds || j.technicianIds.length === 0
    );

    const byStatus = (
      ["scheduled", "en_route", "on_site", "completed", "cancelled"] as const
    ).map((s) => ({
      label: STATUS_LABEL[s],
      value: jobs.filter((j) => j.status === s).length,
      color: STATUS_COLOR[s],
    }));

    // Jobs per technician — workload balance at a glance.
    const perTech = techs
      .map((t) => ({
        label: t.name,
        value: active.filter((j) => (j.technicianIds ?? []).includes(t.id)).length,
      }))
      .sort((a, b) => b.value - a.value);

    // Completed jobs per week, last 8 weeks.
    const weeks = Array.from({ length: 8 }, (_, i) => {
      const end = new Date(now);
      end.setDate(now.getDate() - (7 - i) * 7);
      const start = new Date(end);
      start.setDate(end.getDate() - 7);
      return { start, end, label: `${start.getDate()}/${start.getMonth() + 1}` };
    });
    const completedTrend = weeks.map((w) => ({
      label: w.label,
      value: jobs.filter((j) => {
        if (j.status !== "completed") return false;
        const t = new Date(j.updatedAt).getTime();
        return t >= w.start.getTime() && t < w.end.getTime();
      }).length,
    }));

    const byType = new Map<string, number>();
    for (const j of jobs) {
      const key = j.jobType || "Unspecified";
      byType.set(key, (byType.get(key) ?? 0) + 1);
    }

    return {
      active,
      today,
      overdue,
      unassigned,
      byStatus,
      perTech,
      completedTrend,
      byType: Array.from(byType.entries())
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value),
    };
  }, [jobs, techs]);

  const openRequests = requests.filter((r) => r.status === "open" || r.status === "partial");

  /** Products a pick list needs but stock cannot currently satisfy. */
  const shortfalls = useMemo(() => {
    if (!isLoaded) return [];
    const needed = new Map<string, number>();
    for (const r of openRequests) {
      for (const line of r.lines ?? []) {
        if (!line.productId) continue;
        needed.set(
          line.productId,
          (needed.get(line.productId) ?? 0) + Math.max(line.qtyNeeded - line.qtyFulfilled, 0)
        );
      }
    }
    return Array.from(needed.entries())
      .map(([productId, qty]) => {
        const product = products.find((p) => p.id === productId);
        const available = items.filter(
          (i) => i.productId === productId && i.status === "available"
        ).length;
        return {
          label: product?.name ?? "Unknown product",
          needed: qty,
          available,
          short: Math.max(qty - available, 0),
        };
      })
      .filter((x) => x.short > 0)
      .sort((a, b) => b.short - a.short);
  }, [openRequests, products, items, isLoaded]);

  return (
    <PageShell>
      <PageHeader
        title="Coordination"
        description="Jobs, technicians and pick lists"
        actions={
          <div className="flex gap-2">
            <Link href="/coordination/requests" className={buttonVariants({ variant: "outline" })}>
              <ClipboardList className="mr-1.5 h-4 w-4" /> Pick lists
            </Link>
            <Link
              href="/coordination/jobs"
              className={buttonVariants({
                className: "bg-primary text-primary-foreground hover:bg-primary/90",
              })}
            >
              <Briefcase className="mr-1.5 h-4 w-4" /> Jobs
            </Link>
          </div>
        }
      />

      {jobsError ? <AlertBanner tone="danger">{jobsError}</AlertBanner> : null}

      {m.overdue.length > 0 ? (
        <AlertBanner tone="warn">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">
            {m.overdue.length} job{m.overdue.length === 1 ? " is" : "s are"} past their
            scheduled end and still open.
          </span>
          <Link href="/coordination/jobs" className="shrink-0 font-medium underline">
            Open jobs
          </Link>
        </AlertBanner>
      ) : null}

      {shortfalls.length > 0 ? (
        <AlertBanner tone="warn">
          <Boxes className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">
            {shortfalls.length} product{shortfalls.length === 1 ? "" : "s"} on open pick lists
            cannot be fulfilled from available stock.
          </span>
          <Link href="/coordination/availability" className="shrink-0 font-medium underline">
            Availability
          </Link>
        </AlertBanner>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Active jobs"
          value={m.active.length}
          icon={Briefcase}
          accent={SERIES[0]}
          href="/coordination/jobs"
        />
        <StatTile
          label="Scheduled today"
          value={m.today.length}
          icon={CalendarClock}
          accent={SERIES[3]}
          href="/coordination/jobs"
        />
        <StatTile
          label="Overdue"
          value={m.overdue.length}
          icon={AlertTriangle}
          accent={m.overdue.length > 0 ? STATUS.critical : SERIES[2]}
          higherIsBetter={false}
          href="/coordination/jobs"
        />
        <StatTile
          label="Unassigned jobs"
          value={m.unassigned.length}
          icon={Users}
          accent={m.unassigned.length > 0 ? STATUS.warning : SERIES[2]}
          higherIsBetter={false}
          href="/coordination/jobs"
        />
        <StatTile
          label="Field technicians"
          value={techs.length}
          icon={Users}
          accent={SERIES[6]}
          href="/coordination/technicians"
        />
        <StatTile
          label="Open pick lists"
          value={openRequests.length}
          icon={ClipboardList}
          accent={openRequests.length > 0 ? STATUS.warning : SERIES[2]}
          href="/coordination/requests"
        />
        <StatTile
          label="Stock shortfalls"
          value={shortfalls.length}
          icon={Boxes}
          accent={shortfalls.length > 0 ? STATUS.critical : SERIES[2]}
          higherIsBetter={false}
          href="/coordination/availability"
        />
        <StatTile
          label="Completed jobs"
          value={jobs.filter((j) => j.status === "completed").length}
          icon={ClipboardCheck}
          accent={SERIES[2]}
          href="/coordination/job-cards"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <StackedBar
          title="Jobs by status"
          subtitle="Every job currently in the system"
          segments={m.byStatus.filter((s) => s.value > 0)}
        />
        <ColumnChart
          title="Completed jobs"
          subtitle="Per week, last 8 weeks"
          data={m.completedTrend}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <BarChart
          title="Workload by technician"
          subtitle="Active jobs currently assigned"
          data={m.perTech}
        />
        <DonutChart
          title="Job types"
          subtitle="All jobs by type"
          segments={m.byType.map((t, i) => ({ ...t, colorIndex: i }))}
          centerLabel="jobs"
        />
      </div>

      {shortfalls.length > 0 ? (
        <Panel
          title="Stock shortfalls"
          description="Open pick lists needing more than is available"
          padded={false}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Product</th>
                  <th className="px-4 py-2 text-right font-medium">Needed</th>
                  <th className="px-4 py-2 text-right font-medium">Available</th>
                  <th className="px-4 py-2 text-right font-medium">Short by</th>
                </tr>
              </thead>
              <tbody>
                {shortfalls.map((s) => (
                  <tr key={s.label} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2">{s.label}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{s.needed}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{s.available}</td>
                    <td
                      className="px-4 py-2 text-right font-medium tabular-nums"
                      style={{ color: STATUS.critical }}
                    >
                      {s.short}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}
    </PageShell>
  );
}
