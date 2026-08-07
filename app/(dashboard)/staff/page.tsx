"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, PageShell, Panel, AlertBanner } from "@/components/layout/page-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select-field";
import { getDepartmentLabel } from "@/lib/permissions";
import type { Department } from "@/lib/types";
import { StatTile } from "@/components/charts/primitives";
import { BarChart } from "@/components/charts/bar-chart";
import { SERIES, compact } from "@/components/charts/tokens";
import {
  ArrowDown,
  ArrowUp,
  BadgeCheck,
  Briefcase,
  ClipboardCheck,
  Clock,
  Download,
  Loader2,
  Search,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";

interface PerfRow {
  id: string;
  name: string;
  title: string;
  department: string | null;
  role: string;
  color: string;
  avatarInitials: string;
  active: boolean;
  revenueTarget: number;
  dealsTarget: number;
  dealsWon: number;
  dealsLost: number;
  revenue: number;
  openLeads: number;
  openValue: number;
  winRate: number;
  jobsCompleted: number;
  jobsActive: number;
  hours: number;
  itemsBookedOut: number;
  activities: number;
}

interface Totals {
  activeStaff: number;
  dealsWon: number;
  revenue: number;
  jobsCompleted: number;
  hours: number;
}

const RANGES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "12 months" },
];

type SortKey =
  | "name"
  | "revenue"
  | "dealsWon"
  | "winRate"
  | "openLeads"
  | "jobsCompleted"
  | "hours"
  | "activities";

const COLUMNS: { key: SortKey; label: string; numeric: boolean; hint?: string }[] = [
  { key: "name", label: "Staff member", numeric: false },
  { key: "dealsWon", label: "Deals won", numeric: true },
  { key: "revenue", label: "Revenue", numeric: true },
  { key: "winRate", label: "Win rate", numeric: true },
  { key: "openLeads", label: "Open leads", numeric: true, hint: "Right now, not the period" },
  { key: "jobsCompleted", label: "Jobs done", numeric: true },
  { key: "hours", label: "Hours", numeric: true },
  { key: "activities", label: "Activity", numeric: true, hint: "Logged on their leads" },
];

export default function StaffPerformancePage() {
  const { accessToken, can } = useAuth();

  const [rows, setRows] = useState<PerfRow[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [days, setDays] = useState(30);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [sortDesc, setSortDesc] = useState(true);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/staff/performance?days=${days}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load staff performance");
      setRows(body.rows ?? []);
      setTotals(body.totals ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load staff performance");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, days]);

  useEffect(() => {
    void load();
  }, [load]);

  const departments = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.department) set.add(r.department);
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (!includeInactive && !r.active) return false;
      if (department !== "all" && r.department !== department) return false;
      if (q && !`${r.name} ${r.title} ${r.department ?? ""}`.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
    return [...list].sort((a, b) => {
      if (sortKey === "name") {
        return sortDesc ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name);
      }
      const av = a[sortKey] as number;
      const bv = b[sortKey] as number;
      return sortDesc ? bv - av : av - bv;
    });
  }, [rows, search, department, includeInactive, sortKey, sortDesc]);

  const charts = useMemo(() => {
    const top = (key: "revenue" | "jobsCompleted" | "hours") =>
      [...filtered]
        .filter((r) => (r[key] as number) > 0)
        .sort((a, b) => (b[key] as number) - (a[key] as number))
        .slice(0, 8)
        .map((r) => ({ label: r.name.split(" ")[0], value: r[key] as number }));
    return {
      revenue: top("revenue"),
      jobs: top("jobsCompleted"),
      hours: top("hours"),
    };
  }, [filtered]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDesc((v) => !v);
    else {
      setSortKey(key);
      setSortDesc(key !== "name");
    }
  };

  function exportCsv() {
    const header = [
      "Name", "Title", "Department", "Active",
      "Deals won", "Deals lost", "Revenue", "Win rate %",
      "Open leads", "Open value", "Jobs completed", "Jobs active",
      "Hours", "Items booked out", "Activity",
    ];
    const lines = filtered.map((r) =>
      [
        r.name, r.title, r.department ?? "", r.active ? "yes" : "no",
        r.dealsWon, r.dealsLost, Math.round(r.revenue), Math.round(r.winRate),
        r.openLeads, Math.round(r.openValue), r.jobsCompleted, r.jobsActive,
        r.hours, r.itemsBookedOut, r.activities,
      ]
        .map((v) => {
          const s = String(v);
          return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(",")
    );
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `staff-performance-${days}d-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const rangeLabel = RANGES.find((r) => r.days === days)?.label ?? `${days} days`;

  return (
    <PageShell>
      <PageHeader
        title="Staff Performance"
        description={`Output and workload per staff member — last ${rangeLabel}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {can("admin", "manage") ? (
              <Link href="/admin" className={buttonVariants({ variant: "outline" })}>
                <ShieldCheck className="mr-1.5 h-4 w-4" /> Manage accounts
              </Link>
            ) : null}
            <Button variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
              <Download className="mr-1.5 h-4 w-4" /> Export CSV
            </Button>
          </div>
        }
      />

      {error ? <AlertBanner tone="danger">{error}</AlertBanner> : null}

      {/* Range */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              onClick={() => setDays(r.days)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                days === r.days
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
      </div>

      {isLoading && !totals ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg border border-border bg-muted/40" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatTile
            label="Active staff"
            value={totals?.activeStaff ?? 0}
            icon={Users}
            accent={SERIES[0]}
          />
          <StatTile
            label="Revenue closed"
            value={totals?.revenue ?? 0}
            currency
            icon={TrendingUp}
            accent={SERIES[2]}
          />
          <StatTile
            label="Deals won"
            value={totals?.dealsWon ?? 0}
            icon={BadgeCheck}
            accent={SERIES[3]}
          />
          <StatTile
            label="Jobs completed"
            value={totals?.jobsCompleted ?? 0}
            icon={ClipboardCheck}
            accent={SERIES[6]}
          />
          <StatTile
            label="Hours logged"
            value={totals?.hours ?? 0}
            icon={Clock}
            accent={SERIES[1]}
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search staff…"
            className="pl-8"
          />
        </div>
        <SelectField
          aria-label="Filter by department"
          value={department}
          onValueChange={setDepartment}
          options={[
            { value: "all", label: "All departments" },
            ...departments.map((d) => ({
              value: d,
              label: getDepartmentLabel(d as Department),
            })),
          ]}
        />
        <Button
          variant={includeInactive ? "default" : "outline"}
          onClick={() => setIncludeInactive((v) => !v)}
          className={includeInactive ? "bg-primary text-primary-foreground" : ""}
        >
          Include inactive
        </Button>
      </div>

      {/* Charts */}
      {charts.revenue.length > 0 || charts.jobs.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {charts.revenue.length > 0 ? (
            <BarChart
              title="Revenue closed"
              subtitle={`Top performers · last ${rangeLabel}`}
              data={charts.revenue}
              currency
            />
          ) : null}
          {charts.jobs.length > 0 ? (
            <BarChart
              title="Jobs completed"
              subtitle={`Field output · last ${rangeLabel}`}
              data={charts.jobs}
            />
          ) : null}
          {charts.hours.length > 0 ? (
            <BarChart
              title="Hours logged"
              subtitle={`Timesheets · last ${rangeLabel}`}
              data={charts.hours}
            />
          ) : null}
        </div>
      ) : null}

      {/* Report */}
      <Panel
        title={`${filtered.length} staff member${filtered.length === 1 ? "" : "s"}`}
        description={`Figures cover the last ${rangeLabel}, except open leads which are current.`}
        padded={false}
      >
        {isLoading && rows.length === 0 ? (
          <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center">
            <Briefcase className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {rows.length === 0
                ? "No staff accounts yet."
                : "No staff match those filters."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  {COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      className={`px-4 py-2 font-medium ${col.numeric ? "text-right" : ""}`}
                      title={col.hint}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        className={`inline-flex items-center gap-1 transition-colors hover:text-foreground ${
                          sortKey === col.key ? "text-foreground" : ""
                        }`}
                      >
                        {col.label}
                        {sortKey === col.key ? (
                          sortDesc ? (
                            <ArrowDown className="h-3 w-3" />
                          ) : (
                            <ArrowUp className="h-3 w-3" />
                          )
                        ) : null}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span
                          aria-hidden
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                          style={{ background: r.color }}
                        >
                          {r.avatarInitials}
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate font-medium">{r.name}</span>
                            {!r.active ? (
                              <span className="rounded bg-muted px-1.5 text-[10px] uppercase text-muted-foreground">
                                inactive
                              </span>
                            ) : null}
                          </span>
                          <span className="block truncate text-xs capitalize text-muted-foreground">
                            {r.title || r.department || "—"}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.dealsWon || "—"}</td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                      {r.revenue > 0 ? compact(r.revenue, true) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {r.dealsWon + r.dealsLost > 0 ? `${Math.round(r.winRate)}%` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                      {r.openLeads || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {r.jobsCompleted || "—"}
                      {r.jobsActive > 0 ? (
                        <span className="ml-1 text-xs text-muted-foreground">
                          (+{r.jobsActive})
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {r.hours > 0 ? r.hours.toFixed(1) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                      {r.activities || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <p className="text-xs text-muted-foreground">
        Deals, jobs, hours and activity are counted within the selected period. Open leads and
        jobs in flight are current totals. Activity counts what was logged against a person&apos;s
        leads.
      </p>
    </PageShell>
  );
}
