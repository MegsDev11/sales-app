"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useStaffStore } from "@/lib/store/staff-store";
import { PageHeader, PageShell, Panel, AlertBanner } from "@/components/layout/page-shell";
import { StatTile } from "@/components/charts/primitives";
import { SERIES, STATUS, compact } from "@/components/charts/tokens";
import { MODULES } from "@/lib/modules";
import { priorityMeta, statusMeta, typeLabel } from "@/lib/projects/constants";
import type { ModuleKey } from "@/lib/types";
import {
  CalendarClock,
  CheckCircle2,
  FolderKanban,
  ListTodo,
  Loader2,
  Lock,
  Users,
} from "lucide-react";

interface DeptProject {
  id: string;
  code: string;
  name: string;
  description: string;
  type: string;
  status: string;
  priority: string;
  owner_id: string | null;
  start_date: string | null;
  target_date: string | null;
  is_private: boolean;
  memberCount: number;
  isMember: boolean;
  taskTotal: number;
  taskDone: number;
  myOpenTasks: { title: string; status: string; due_date: string | null }[];
  departments: string[];
  budget_amount: number | null;
  actual_cost: number | null;
}

const CLOSED = new Set(["completed", "cancelled"]);

function fmtDate(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
}

/**
 * The Projects tab every department gets.
 *
 * Shows only the projects this department has been formally assigned to, so a
 * technician sees the work they have been pulled into without needing the
 * Projects module. Read-only by design — the full workspace stays in /projects.
 */
export function DepartmentProjects({ moduleKey }: { moduleKey: ModuleKey }) {
  const { accessToken } = useAuth();
  const { users } = useStaffStore();

  const [projects, setProjects] = useState<DeptProject[]>([]);
  const [canOpenDetail, setCanOpenDetail] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mineOnly, setMineOnly] = useState(false);

  const label = MODULES[moduleKey]?.label ?? moduleKey;

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/projects/department?module=${moduleKey}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load projects");
      setProjects(body.projects ?? []);
      setCanOpenDetail(Boolean(body.canOpenDetail));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, moduleKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const active = projects.filter((p) => !CLOSED.has(p.status));
    const myTasks = projects.reduce((n, p) => n + p.myOpenTasks.length, 0);
    const today = new Date().toISOString().slice(0, 10);
    const overdue = active.filter((p) => p.target_date && p.target_date < today);
    return { active: active.length, myTasks, overdue: overdue.length };
  }, [projects]);

  const visible = useMemo(
    () => (mineOnly ? projects.filter((p) => p.isMember || p.myOpenTasks.length > 0) : projects),
    [projects, mineOnly]
  );

  const ownerName = (id: string | null) =>
    id ? users.find((u) => u.id === id)?.name ?? null : null;

  return (
    <PageShell>
      <PageHeader
        eyebrow={label}
        title="Projects"
        description={`Cross-department work ${label} has been assigned to. Open a project to see the full plan.`}
        actions={
          projects.length > 0 ? (
            <button
              type="button"
              onClick={() => setMineOnly((v) => !v)}
              className={`rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-colors ${
                mineOnly
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground/80 hover:bg-muted"
              }`}
            >
              Only mine
            </button>
          ) : undefined
        }
      />

      {error ? <AlertBanner tone="danger">{error}</AlertBanner> : null}

      {isLoading && projects.length === 0 ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg border border-border bg-muted/40" />
          ))}
        </div>
      ) : projects.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile label="Active projects" value={stats.active} icon={FolderKanban} accent={SERIES[0]} />
          <StatTile label="My open tasks" value={stats.myTasks} icon={ListTodo} accent={SERIES[3]} />
          <StatTile
            label="Past target date"
            value={stats.overdue}
            icon={CalendarClock}
            accent={stats.overdue > 0 ? STATUS.critical : SERIES[2]}
            higherIsBetter={false}
          />
        </div>
      ) : null}

      <Panel
        title={`${visible.length} project${visible.length === 1 ? "" : "s"}`}
        padded={false}
        actions={
          isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null
        }
      >
        {visible.length === 0 ? (
          <div className="py-10 text-center">
            <FolderKanban className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {projects.length === 0
                ? `No projects have been assigned to ${label} yet.`
                : "No projects match that filter."}
            </p>
            {projects.length === 0 ? (
              <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                When a project lists {label} as an involved department, it appears here for
                everyone in the section.
              </p>
            ) : null}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((p) => {
              const s = statusMeta(p.status);
              const pr = priorityMeta(p.priority);
              const owner = ownerName(p.owner_id);
              const others = p.departments.filter((d) => d !== moduleKey);
              const body = (
                <div className="flex flex-wrap items-start gap-3 px-4 py-3">
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
                      {p.isMember ? (
                        <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground">
                          You&apos;re on this
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{s.label}</span>
                      <span>{typeLabel(p.type)}</span>
                      <span style={{ color: pr.color }}>{pr.label} priority</span>
                      {owner ? <span>Owner: {owner}</span> : null}
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" /> {p.memberCount}
                      </span>
                      {p.target_date ? (
                        <span className="flex items-center gap-1">
                          <CalendarClock className="h-3 w-3" />
                          {fmtDate(p.target_date)}
                        </span>
                      ) : null}
                    </p>

                    {others.length > 0 ? (
                      <p className="mt-1 flex flex-wrap gap-1">
                        {others.map((d) => (
                          <span
                            key={d}
                            className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                          >
                            {MODULES[d as ModuleKey]?.label ?? d}
                          </span>
                        ))}
                      </p>
                    ) : null}

                    {p.myOpenTasks.length > 0 ? (
                      <ul className="mt-2 space-y-0.5 border-l-2 border-primary/30 pl-2.5">
                        {p.myOpenTasks.slice(0, 3).map((t, i) => (
                          <li key={i} className="flex items-center gap-1.5 text-xs">
                            <CheckCircle2 className="h-3 w-3 shrink-0 text-muted-foreground" />
                            <span className="truncate">{t.title}</span>
                            {t.due_date ? (
                              <span className="shrink-0 text-muted-foreground">
                                · {fmtDate(t.due_date)}
                              </span>
                            ) : null}
                          </li>
                        ))}
                        {p.myOpenTasks.length > 3 ? (
                          <li className="text-xs text-muted-foreground">
                            +{p.myOpenTasks.length - 3} more assigned to you
                          </li>
                        ) : null}
                      </ul>
                    ) : null}
                  </div>

                  <div className="shrink-0 text-right">
                    {p.taskTotal > 0 ? (
                      <>
                        <p className="text-xs tabular-nums text-muted-foreground">
                          {p.taskDone}/{p.taskTotal} tasks
                        </p>
                        <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${(p.taskDone / p.taskTotal) * 100}%`,
                              background: SERIES[2],
                            }}
                          />
                        </div>
                      </>
                    ) : null}
                    {p.budget_amount != null ? (
                      <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                        {compact(Number(p.actual_cost ?? 0), true)} /{" "}
                        {compact(Number(p.budget_amount), true)}
                      </p>
                    ) : null}
                  </div>
                </div>
              );

              return (
                <li key={p.id}>
                  {canOpenDetail ? (
                    <Link href={`/projects/${p.id}`} className="block transition-colors hover:bg-muted/40">
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {!canOpenDetail && projects.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          This is a read-only view for {label}. Ask for Projects access to open the full
          project workspace.
        </p>
      ) : null}
    </PageShell>
  );
}
