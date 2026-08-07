"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ProjectAdvisor } from "@/components/projects/project-advisor";
import { BarChart } from "@/components/charts/bar-chart";
import { SERIES, STATUS, compact } from "@/components/charts/tokens";
import { MODULES } from "@/lib/modules";
import {
  BOARD_STATUSES,
  IDEA_STATUSES,
  ISSUE_TYPES,
  canonicalIssueType,
  priorityMeta,
  statusMeta,
  typeLabel,
  type Project,
  type ProjectDeliverySummary,
  type ProjectDepartment,
  type ProjectMember,
  type ProjectTask,
} from "@/lib/projects/constants";
import { delayLabel, percentLabel } from "@/lib/projects/progress";
import type { ModuleKey, User } from "@/lib/types";
import {
  AlertTriangle,
  CalendarClock,
  FolderKanban,
  Loader2,
  Lock,
  Users as UsersIcon,
} from "lucide-react";

/**
 * The four ways of looking at the project list.
 *
 * They used to be four pages, which meant four fetches of the same rows and the same
 * name, owner and date printed four times over — the board was the stage donut in
 * card form, and the portfolio table repeated most of the list. They are lenses, not
 * destinations, so they live together and share one load and one filter row.
 *
 * Each keeps only what the others cannot show: the list carries the department tags,
 * the table carries delay and cause, the board carries side-by-side stage comparison,
 * the funnel carries the advance action.
 */

export type ProjectView = "list" | "table" | "board" | "advisor";

export const PROJECT_VIEWS: { value: ProjectView; label: string; hint: string }[] = [
  { value: "list", label: "List", hint: "Every project, with progress and departments" },
  { value: "table", label: "Table", hint: "Delay and what caused it — the portfolio roll-up" },
  { value: "board", label: "Board", hint: "Side by side, by stage" },
  { value: "advisor", label: "Advisor", hint: "Ask Claude about a project, from your own record" },
];

interface Common {
  projects: Project[];
  summaries: Map<string, ProjectDeliverySummary>;
  users: User[];
}

const shortDate = (value: string | null | undefined, year: "2-digit" | "numeric" = "2-digit") =>
  value
    ? new Date(value).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year })
    : "—";

const ownerName = (users: User[], id: string | null) =>
  users.find((u) => u.id === id)?.name ?? null;

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export function ProjectListView({
  projects,
  summaries,
  users,
  members,
  departments,
  tasks,
  emptyAction,
  canEdit,
  busyId,
  onAdvance,
}: Common & {
  members: ProjectMember[];
  departments: ProjectDepartment[];
  tasks: ProjectTask[];
  emptyAction?: React.ReactNode;
  canEdit: boolean;
  busyId: string | null;
  onAdvance: (id: string, status: string) => void;
}) {
  const memberCount = (id: string) => members.filter((x) => x.project_id === id).length;
  const taskProgress = (id: string) => {
    const list = tasks.filter((t) => t.project_id === id);
    if (list.length === 0) return null;
    return { done: list.filter((t) => t.status === "done").length, total: list.length };
  };
  const deptsFor = (id: string) =>
    departments.filter((d) => d.project_id === id).map((d) => d.module_key);

  if (projects.length === 0) {
    return (
      <div className="py-10 text-center">
        <FolderKanban className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No projects match those filters.</p>
        {emptyAction}
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {projects.map((p) => {
        const s = statusMeta(p.status);
        const pr = priorityMeta(p.priority);
        const progress = taskProgress(p.id);
        const owner = ownerName(users, p.owner_id);
        const pDepts = deptsFor(p.id);
        const overBudget =
          p.budget_amount != null && Number(p.actual_cost) > Number(p.budget_amount);
        const sum = summaries.get(p.id);
        const late = (sum?.delay_days ?? 0) >= 1;

        return (
          <li
            key={p.id}
            className="flex flex-wrap items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
          >
            {/* The link covers the row's content but not the whole row: an advance
                button nested inside an anchor is invalid HTML and browsers disagree
                about what a click on it should do. */}
            <Link
              href={`/projects/${p.id}`}
              className="flex min-w-0 flex-1 flex-wrap items-start gap-3"
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
                  {owner ? <span>Owner: {owner}</span> : null}
                  <span className="flex items-center gap-1">
                    <UsersIcon className="h-3 w-3" /> {memberCount(p.id)}
                  </span>
                  {p.target_date ? (
                    <span
                      className="flex items-center gap-1"
                      title={
                        late && sum?.revised_target_date
                          ? `Originally due ${shortDate(p.target_date, "numeric")}`
                          : undefined
                      }
                    >
                      <CalendarClock className="h-3 w-3" />
                      {new Date(
                        late && sum?.revised_target_date ? sum.revised_target_date : p.target_date
                      ).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
                    </span>
                  ) : null}
                  {late ? (
                    <span
                      className="flex items-center gap-1 font-medium"
                      style={{ color: STATUS.critical }}
                    >
                      <AlertTriangle className="h-3 w-3" />
                      {delayLabel(sum!.delay_days)} lost
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
                {/* The grid's figure wins where there is one — it measures the actual
                    work. Task counts are the fallback for a project with no plan. */}
                {sum?.percent_complete != null ? (
                  <>
                    <p className="text-sm font-semibold tabular-nums">
                      {percentLabel(sum.percent_complete)}
                    </p>
                    <ProgressBar value={sum.percent_complete} />
                    {sum.blocks_total > 0 ? (
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {sum.blocks_done}/{sum.blocks_total} blocks
                      </p>
                    ) : null}
                  </>
                ) : progress ? (
                  <>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {progress.done}/{progress.total} tasks
                    </p>
                    <ProgressBar value={progress.done / progress.total} />
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

            {/* Moving an idea along used to live in the funnel view. It belongs on
                whatever screen shows ideas, and the list is the one people open. */}
            {canEdit && NEXT_STATUS[p.status] ? (
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                disabled={busyId === p.id}
                onClick={() => onAdvance(p.id, NEXT_STATUS[p.status])}
                title={`Move ${p.name} to ${NEXT_STATUS[p.status]}`}
              >
                {busyId === p.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  NEXT_LABEL[p.status]
                )}
              </Button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The idea pipeline, as a single next step per stage.
 *
 * Only these three statuses have a "next" — a live project moves through its own
 * status control, where going backwards and to on-hold are also possible. This is the
 * one-click path forward, not a general status editor.
 */
const NEXT_STATUS: Record<string, string> = {
  idea: "evaluating",
  evaluating: "approved",
  approved: "active",
};
const NEXT_LABEL: Record<string, string> = {
  idea: "Start evaluating",
  evaluating: "Approve",
  approved: "Make it active",
};

function ProgressBar({ value }: { value: number }) {
  return (
    <div
      className="mt-1 h-1.5 w-24 overflow-hidden rounded-full"
      style={{ background: "#e8eaed" }}
    >
      <div
        className="h-full rounded-full"
        style={{ width: `${Math.round(value * 100)}%`, background: SERIES[2] }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table — the portfolio roll-up
// ---------------------------------------------------------------------------

/** Causes that get their own column. Everything else lands in "Other". */
const ISSUE_COLUMNS = ISSUE_TYPES.filter((t) => t !== "Other");

/**
 * Issue counts folded onto the columns, case-insensitively.
 *
 * "Act Of God" and "Act of God" are the same weather. Matching exactly would scatter
 * one cause across two buckets and understate it in both — and this table exists to
 * show which cause is worth spending money on.
 */
function bucketIssues(counts: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = { Other: 0 };
  for (const [type, n] of Object.entries(counts)) {
    const key = canonicalIssueType(type) ?? "Other";
    out[key] = (out[key] ?? 0) + n;
  }
  return out;
}

export function ProjectTableView({
  projects,
  summaries,
  users,
  members,
}: Common & { members: ProjectMember[] }) {
  const rows = useMemo(
    () =>
      projects
        .map((project) => ({ project, summary: summaries.get(project.id) ?? null }))
        // Worst slippage first: the table exists to surface trouble, not to be
        // alphabetical.
        .sort((a, b) => {
          const ad = a.summary?.delay_days ?? 0;
          const bd = b.summary?.delay_days ?? 0;
          if (ad !== bd) return bd - ad;
          return a.project.name.localeCompare(b.project.name);
        }),
    [projects, summaries]
  );

  const byCause = useMemo(() => {
    const totals = new Map<string, number>();
    for (const { summary } of rows) {
      for (const [type, count] of Object.entries(summary?.issue_counts ?? {})) {
        const key = canonicalIssueType(type) ?? type;
        totals.set(key, (totals.get(key) ?? 0) + count);
      }
    }
    return Array.from(totals.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [rows]);

  const leadFor = (projectId: string) => {
    const lead = members.find((m) => m.project_id === projectId && m.role === "lead");
    return lead ? ownerName(users, lead.user_id) : null;
  };

  if (rows.length === 0) {
    return <p className="p-6 text-center text-sm text-muted-foreground">Nothing to show.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="sticky left-0 z-10 min-w-[190px] bg-surface-elevated px-3 py-2 text-left font-semibold text-foreground">
                Project
              </th>
              <th className="px-2 py-2 text-left font-medium">Allocated to</th>
              <th className="px-2 py-2 text-left font-medium">Start</th>
              <th className="px-2 py-2 text-left font-medium">Due</th>
              <th className="px-2 py-2 text-right font-medium">Complete</th>
              <th className="px-2 py-2 text-right font-medium">Late by</th>
              <th className="px-2 py-2 text-left font-medium">Now due</th>
              <th
                colSpan={ISSUE_COLUMNS.length + 1}
                className="border-l border-border px-2 py-2 text-center font-medium"
              >
                Issues logged, by cause
              </th>
            </tr>
            <tr className="border-b border-border text-[10px] text-muted-foreground">
              <th className="sticky left-0 z-10 bg-surface-elevated" />
              <th colSpan={6} />
              {ISSUE_COLUMNS.map((t, i) => (
                <th
                  key={t}
                  className={`px-1 py-1 text-center font-medium ${i === 0 ? "border-l border-border" : ""}`}
                >
                  {t}
                </th>
              ))}
              <th className="px-1 py-1 text-center font-medium">Other</th>
            </tr>
          </thead>

          <tbody>
            {rows.map(({ project, summary }) => {
              const meta = statusMeta(project.status);
              const late = (summary?.delay_days ?? 0) >= 1;
              const counts = bucketIssues(summary?.issue_counts ?? {});

              return (
                <tr
                  key={project.id}
                  className="border-b border-hairline transition-colors hover:bg-muted/30"
                >
                  <td className="sticky left-0 z-10 bg-surface-elevated px-3 py-2">
                    <Link
                      href={`/projects/${project.id}`}
                      className="flex items-center gap-2 hover:underline"
                    >
                      <span
                        aria-hidden
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: meta.color }}
                      />
                      <span className="truncate font-medium">{project.name}</span>
                    </Link>
                    <p className="pl-4 font-mono text-[10px] text-muted-foreground">
                      {project.code} · {meta.label}
                    </p>
                  </td>
                  <td className="px-2 py-2 text-xs text-muted-foreground">
                    {ownerName(users, project.owner_id) ?? leadFor(project.id) ?? "—"}
                  </td>
                  <td className="px-2 py-2 text-xs tabular-nums text-muted-foreground">
                    {shortDate(project.start_date)}
                  </td>
                  <td className="px-2 py-2 text-xs tabular-nums text-muted-foreground">
                    {shortDate(project.target_date)}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <span className="text-sm font-semibold tabular-nums">
                      {percentLabel(summary?.percent_complete ?? null)}
                    </span>
                    {summary && summary.blocks_total > 0 ? (
                      <p className="text-[10px] text-muted-foreground">
                        {summary.blocks_done}/{summary.blocks_total} blocks
                      </p>
                    ) : null}
                  </td>
                  <td
                    className="px-2 py-2 text-right text-xs font-medium tabular-nums"
                    style={{ color: late ? STATUS.critical : undefined }}
                  >
                    {summary ? delayLabel(summary.delay_days) : "—"}
                  </td>
                  <td
                    className="px-2 py-2 text-xs tabular-nums"
                    style={{ color: late ? STATUS.critical : undefined }}
                  >
                    {shortDate(summary?.revised_target_date)}
                  </td>
                  {ISSUE_COLUMNS.map((t, i) => (
                    <td
                      key={t}
                      className={`px-1 py-2 text-center text-xs tabular-nums ${
                        i === 0 ? "border-l border-border" : ""
                      } ${counts[t] ? "font-semibold" : "text-muted-foreground"}`}
                    >
                      {counts[t] ?? 0}
                    </td>
                  ))}
                  <td
                    className={`px-1 py-2 text-center text-xs tabular-nums ${
                      counts.Other ? "font-semibold" : "text-muted-foreground"
                    }`}
                  >
                    {counts.Other ?? 0}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {byCause.length > 0 ? (
        <BarChart
          title="What holds this business up"
          subtitle="Issues logged by cause, across every project shown"
          data={byCause}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

/**
 * Deliberately not drag-and-drop: status changes here are meaningful (an idea being
 * approved, a project going live), so they happen through the project's own status
 * control where the permission check lives, rather than a drag that silently fails
 * for anyone without edit rights.
 */
export function ProjectBoardView({ projects, summaries, users }: Common) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {BOARD_STATUSES.map((status) => {
        const meta = statusMeta(status);
        const column = projects.filter((p) => p.status === status);
        return (
          <div key={status} className="flex w-[264px] shrink-0 flex-col">
            <div className="mb-2 flex items-center gap-2 px-1">
              <span
                aria-hidden
                className="h-2 w-2 rounded-full"
                style={{ background: meta.color }}
              />
              <h3 className="text-sm font-medium">{meta.label}</h3>
              <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                {column.length}
              </span>
            </div>

            <div className="flex-1 space-y-2 rounded-lg bg-muted/40 p-2">
              {column.length === 0 ? (
                <p className="px-1 py-4 text-center text-xs text-muted-foreground">Empty</p>
              ) : (
                column.map((p) => {
                  const sum = summaries.get(p.id);
                  const late = (sum?.delay_days ?? 0) >= 1;
                  const overBudget =
                    p.budget_amount != null && Number(p.actual_cost) > Number(p.budget_amount);
                  return (
                    <Link
                      key={p.id}
                      href={`/projects/${p.id}`}
                      className="block rounded-md border border-border bg-card p-2.5 transition-colors hover:border-primary/40"
                    >
                      <p className="flex items-center gap-1.5 text-sm font-medium">
                        <span className="min-w-0 flex-1 truncate">{p.name}</span>
                        {p.is_private ? (
                          <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />
                        ) : null}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {p.code} · {typeLabel(p.type)}
                      </p>

                      {sum?.percent_complete != null ? (
                        <div className="mt-2 flex items-center gap-2">
                          <div
                            className="h-1.5 flex-1 overflow-hidden rounded-full"
                            style={{ background: "#e8eaed" }}
                          >
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.round(sum.percent_complete * 100)}%`,
                                background: SERIES[2],
                              }}
                            />
                          </div>
                          <span className="shrink-0 text-[11px] font-medium tabular-nums">
                            {percentLabel(sum.percent_complete)}
                          </span>
                        </div>
                      ) : null}

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="truncate text-[11px] text-muted-foreground">
                          {ownerName(users, p.owner_id) ?? "No owner"}
                        </span>
                        {p.budget_amount != null ? (
                          <span
                            className="shrink-0 text-[11px] tabular-nums"
                            style={{ color: overBudget ? STATUS.critical : undefined }}
                          >
                            {compact(Number(p.actual_cost), true)}
                          </span>
                        ) : null}
                      </div>

                      {late ? (
                        <p
                          className="mt-1 text-[11px] font-medium tabular-nums"
                          style={{ color: STATUS.critical }}
                        >
                          {delayLabel(sum!.delay_days)} lost · now {shortDate(sum!.revised_target_date)}
                        </p>
                      ) : p.target_date ? (
                        <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                          Target {shortDate(p.target_date)}
                        </p>
                      ) : null}
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Advisor
// ---------------------------------------------------------------------------

/**
 * The fourth view is a conversation, not an arrangement of the list.
 *
 * It replaced the idea funnel, whose two jobs are both still covered: the Board shows
 * Idea / Evaluating / Approved as columns, and advancing one is the status control on
 * its own page. What the funnel could not do is answer "should we take this on, and
 * what will bite us" — which is the question actually worth a tab.
 */
export function ProjectAdvisorView({
  projects,
  accessToken,
}: {
  projects: Project[];
  accessToken: string;
}) {
  // Ideas first: a job nobody has committed to is where a second opinion is worth
  // most, and it is what somebody opening this tab most likely came to ask about.
  const ordered = useMemo(() => {
    const rank = (p: Project) =>
      IDEA_STATUSES.includes(p.status as never) ? 0 : p.status === "active" ? 1 : 2;
    return [...projects].sort(
      (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)
    );
  }, [projects]);

  if (ordered.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Create a project first — the advisor answers about a specific job.
      </p>
    );
  }

  return <ProjectAdvisor projects={ordered} accessToken={accessToken} />;
}
