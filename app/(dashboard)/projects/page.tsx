"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useStaffStore } from "@/lib/store/staff-store";
import { PageHeader, PageShell, Panel, AlertBanner } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatTile } from "@/components/charts/primitives";
import { DonutChart } from "@/components/charts/donut-chart";
import { BarChart } from "@/components/charts/bar-chart";
import { SERIES, STATUS, compact } from "@/components/charts/tokens";
import { MODULES } from "@/lib/modules";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import {
  PROJECT_STATUSES,
  PROJECT_TYPES,
  priorityMeta,
  statusMeta,
  typeLabel,
  type Project,
  type ProjectDepartment,
  type ProjectMember,
  type ProjectTask,
} from "@/lib/projects/constants";
import type { ModuleKey } from "@/lib/types";
import {
  AlertTriangle,
  CalendarClock,
  FolderKanban,
  Lightbulb,
  Loader2,
  Lock,
  Plus,
  Search,
  Users,
} from "lucide-react";

export default function ProjectsPage() {
  const { accessToken, currentUser, can } = useAuth();
  const { users } = useStaffStore();

  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [departments, setDepartments] = useState<ProjectDepartment[]>([]);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [mineOnly, setMineOnly] = useState(false);

  const canEdit = can("projects", "edit");

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/projects", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load projects");
      setProjects(body.projects ?? []);
      setMembers(body.members ?? []);
      setDepartments(body.departments ?? []);
      setTasks(body.tasks ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const myProjectIds = useMemo(
    () =>
      new Set(members.filter((m) => m.user_id === currentUser?.id).map((m) => m.project_id)),
    [members, currentUser]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (typeFilter !== "all" && p.type !== typeFilter) return false;
      if (mineOnly && !myProjectIds.has(p.id) && p.owner_id !== currentUser?.id) return false;
      if (q && !`${p.name} ${p.code} ${p.description}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [projects, search, statusFilter, typeFilter, mineOnly, myProjectIds, currentUser]);

  const m = useMemo(() => {
    const active = projects.filter((p) => p.status === "active");
    const ideas = projects.filter((p) =>
      ["idea", "evaluating", "approved"].includes(p.status)
    );
    const today = new Date().toISOString().slice(0, 10);
    const overdue = projects.filter(
      (p) =>
        p.target_date &&
        p.target_date < today &&
        !["completed", "cancelled"].includes(p.status)
    );
    const overBudget = projects.filter(
      (p) => p.budget_amount != null && Number(p.actual_cost) > Number(p.budget_amount)
    );

    const byStatus = PROJECT_STATUSES.map((s) => ({
      label: s.label,
      value: projects.filter((p) => p.status === s.value).length,
      color: s.color,
    })).filter((s) => s.value > 0);

    // How many projects each department is pulled into — the cross-department load.
    const deptCounts = new Map<string, number>();
    for (const d of departments) {
      deptCounts.set(d.module_key, (deptCounts.get(d.module_key) ?? 0) + 1);
    }
    const byDept = Array.from(deptCounts.entries())
      .map(([key, value]) => ({
        label: MODULES[key as ModuleKey]?.label ?? key,
        value,
      }))
      .sort((a, b) => b.value - a.value);

    return {
      active,
      ideas,
      overdue,
      overBudget,
      byStatus,
      byDept,
      totalBudget: projects.reduce((s, p) => s + Number(p.budget_amount ?? 0), 0),
      totalSpend: projects.reduce((s, p) => s + Number(p.actual_cost ?? 0), 0),
    };
  }, [projects, departments]);

  const memberCount = (id: string) => members.filter((x) => x.project_id === id).length;
  const taskProgress = (id: string) => {
    const list = tasks.filter((t) => t.project_id === id);
    if (list.length === 0) return null;
    return { done: list.filter((t) => t.status === "done").length, total: list.length };
  };
  const deptsFor = (id: string) =>
    departments.filter((d) => d.project_id === id).map((d) => d.module_key);

  return (
    <PageShell>
      <PageHeader
        title="Projects"
        description="Cross-department work, from a business idea through to delivery"
        actions={
          <div className="flex gap-2">
            <Link href="/projects/ideas">
              <Button variant="outline">
                <Lightbulb className="mr-1.5 h-4 w-4" /> Idea funnel
              </Button>
            </Link>
            <Link href="/projects/board">
              <Button variant="outline">Board</Button>
            </Link>
            {canEdit ? (
              <Button
                onClick={() => setDialogOpen(true)}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="mr-1.5 h-4 w-4" /> New project
              </Button>
            ) : null}
          </div>
        }
      />

      {error ? <AlertBanner tone="danger">{error}</AlertBanner> : null}

      {m.overdue.length > 0 ? (
        <AlertBanner tone="warn">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">
            {m.overdue.length} project{m.overdue.length === 1 ? " is" : "s are"} past their
            target date.
          </span>
        </AlertBanner>
      ) : null}

      {m.overBudget.length > 0 ? (
        <AlertBanner tone="warn">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">
            {m.overBudget.length} project{m.overBudget.length === 1 ? " is" : "s are"} over
            budget.
          </span>
        </AlertBanner>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Active projects"
          value={m.active.length}
          icon={FolderKanban}
          accent={SERIES[0]}
        />
        <StatTile
          label="Ideas in the funnel"
          value={m.ideas.length}
          icon={Lightbulb}
          accent={SERIES[3]}
          href="/projects/ideas"
        />
        <StatTile
          label="Past target date"
          value={m.overdue.length}
          icon={CalendarClock}
          accent={m.overdue.length > 0 ? STATUS.critical : SERIES[2]}
          higherIsBetter={false}
        />
        <StatTile
          label="Committed budget"
          value={m.totalBudget}
          currency
          icon={FolderKanban}
          accent={SERIES[6]}
        />
      </div>

      {projects.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <DonutChart
            title="Projects by stage"
            subtitle="Where everything currently sits"
            segments={m.byStatus}
            centerLabel="projects"
          />
          <BarChart
            title="Department involvement"
            subtitle="How many projects each department is pulled into"
            data={m.byDept}
          />
        </div>
      ) : null}

      {/* One filter row above everything it scopes. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects…"
            className="pl-8"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 rounded-md border border-border bg-card px-2 text-sm"
        >
          <option value="all">Any status</option>
          {PROJECT_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="h-9 rounded-md border border-border bg-card px-2 text-sm"
        >
          <option value="all">Any type</option>
          {PROJECT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <Button
          variant={mineOnly ? "default" : "outline"}
          onClick={() => setMineOnly((v) => !v)}
          className={mineOnly ? "bg-primary text-primary-foreground" : ""}
        >
          My projects
        </Button>
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
      </div>

      <Panel
        title={`${filtered.length} project${filtered.length === 1 ? "" : "s"}`}
        padded={false}
      >
        {filtered.length === 0 ? (
          <div className="py-10 text-center">
            <FolderKanban className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {projects.length === 0 ? "No projects yet." : "No projects match those filters."}
            </p>
            {canEdit && projects.length === 0 ? (
              <Button variant="outline" className="mt-3" onClick={() => setDialogOpen(true)}>
                Create the first one
              </Button>
            ) : null}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((p) => {
              const s = statusMeta(p.status);
              const pr = priorityMeta(p.priority);
              const progress = taskProgress(p.id);
              const owner = users.find((u) => u.id === p.owner_id);
              const pDepts = deptsFor(p.id);
              const overBudget =
                p.budget_amount != null && Number(p.actual_cost) > Number(p.budget_amount);

              return (
                <li key={p.id}>
                  <Link
                    href={`/projects/${p.id}`}
                    className="flex flex-wrap items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
                  >
                    <span
                      aria-hidden
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                      style={{ background: s.color }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        <span className="truncate">{p.name}</span>
                        {p.is_private ? (
                          <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />
                        ) : null}
                        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                          {p.code}
                        </span>
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{s.label}</span>
                        <span>{typeLabel(p.type)}</span>
                        <span style={{ color: pr.color }}>{pr.label} priority</span>
                        {owner ? <span>Owner: {owner.name}</span> : null}
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" /> {memberCount(p.id)}
                        </span>
                        {p.target_date ? (
                          <span className="flex items-center gap-1">
                            <CalendarClock className="h-3 w-3" />
                            {new Date(p.target_date).toLocaleDateString("en-ZA", {
                              day: "numeric",
                              month: "short",
                            })}
                          </span>
                        ) : null}
                      </p>
                      {pDepts.length > 0 ? (
                        <p className="mt-1 flex flex-wrap gap-1">
                          {pDepts.map((d) => (
                            <span
                              key={d}
                              className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                            >
                              {MODULES[d as ModuleKey]?.label ?? d}
                            </span>
                          ))}
                        </p>
                      ) : null}
                    </div>

                    <div className="shrink-0 text-right">
                      {progress ? (
                        <>
                          <p className="text-xs tabular-nums text-muted-foreground">
                            {progress.done}/{progress.total} tasks
                          </p>
                          <div
                            className="mt-1 h-1.5 w-24 overflow-hidden rounded-full"
                            style={{ background: "#e8eaed" }}
                          >
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${(progress.done / progress.total) * 100}%`,
                                background: SERIES[2],
                              }}
                            />
                          </div>
                        </>
                      ) : null}
                      {p.budget_amount != null ? (
                        <p
                          className="mt-1 text-xs tabular-nums"
                          style={{ color: overBudget ? STATUS.critical : undefined }}
                        >
                          {compact(Number(p.actual_cost), true)} /{" "}
                          {compact(Number(p.budget_amount), true)}
                        </p>
                      ) : null}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {dialogOpen ? (
        <ProjectFormDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onSaved={() => {
            setDialogOpen(false);
            void load();
          }}
          project={null}
          members={[]}
          departments={[]}
          users={users}
          currentUserId={currentUser?.id ?? ""}
          accessToken={accessToken ?? ""}
        />
      ) : null}
    </PageShell>
  );
}
