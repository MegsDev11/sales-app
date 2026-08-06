"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useStaffStore } from "@/lib/store/staff-store";
import { PageHeader, PageShell, Panel, AlertBanner } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select-field";
import { StatTile } from "@/components/charts/primitives";
import { SERIES, STATUS } from "@/components/charts/tokens";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import { isProjectOverdue } from "@/lib/overdue/rules";
import {
  PROJECT_VIEWS,
  ProjectBoardView,
  ProjectAdvisorView,
  ProjectListView,
  ProjectTableView,
  type ProjectView,
} from "@/components/projects/project-views";
import {
  IDEA_STATUSES,
  PROJECT_STATUSES,
  PROJECT_TYPES,
  type Project,
  type ProjectDeliverySummary,
  type ProjectDepartment,
  type ProjectMember,
  type ProjectTask,
} from "@/lib/projects/constants";
import {
  AlertTriangle,
  CalendarClock,
  FolderKanban,
  Gauge,
  Loader2,
  Plus,
  Search,
} from "lucide-react";

/**
 * Projects — one page, four views.
 *
 * The list, the portfolio table and the board were three routes that each fetched the
 * same rows and printed the same names, owners and dates. They are arrangements of one
 * dataset, not three features, so they share one load, one filter row and one set of
 * headline figures.
 *
 * The Advisor is the exception and the reason the tab strip is worth having: it is not
 * another arrangement of the list but a conversation about one project, argued from the
 * record the other three views display. It replaced the idea funnel, whose two jobs the
 * Board (Idea / Evaluating / Approved as columns) and each project's own status control
 * already covered between them.
 *
 * The view lives in the URL (`?view=board`) so a link to a particular arrangement
 * still works and the browser's back button behaves.
 */

function isView(value: string | null): value is ProjectView {
  return PROJECT_VIEWS.some((v) => v.value === value);
}

function ProjectsPageInner() {
  const { accessToken, currentUser, can } = useAuth();
  const { users } = useStaffStore();
  const searchParams = useSearchParams();

  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [departments, setDepartments] = useState<ProjectDepartment[]>([]);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [summaries, setSummaries] = useState<ProjectDeliverySummary[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [advancing, setAdvancing] = useState<string | null>(null);

  const [view, setView] = useState<ProjectView>("list");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [mineOnly, setMineOnly] = useState(false);

  const canEdit = can("projects", "edit");

  // A ?view= in the URL wins on arrival; after that the switcher drives, and it
  // writes the URL back so the address bar always describes what is on screen.
  const urlView = searchParams.get("view");
  useEffect(() => {
    if (isView(urlView)) setView(urlView);
  }, [urlView]);

  const chooseView = useCallback((next: ProjectView) => {
    setView(next);
    const url = new URL(window.location.href);
    if (next === "list") url.searchParams.delete("view");
    else url.searchParams.set("view", next);
    window.history.replaceState(null, "", url.toString());
  }, []);

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

  /**
   * Progress and delay come from a second call, on purpose.
   *
   * They are rolled up over every block, cell and issue in the business, so making
   * the list wait on them would trade a page that paints instantly for one that
   * paints slowly with two extra columns. A failure here is silent — the rows render
   * without the roll-up rather than showing an error over a list that is otherwise
   * fine.
   */
  const loadSummaries = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await fetch("/api/projects/delivery", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      if (!res.ok) return;
      const body = await res.json();
      setSummaries(body.summaries ?? []);
    } catch {
      // Leave the roll-up blank.
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
    void loadSummaries();
  }, [load, loadSummaries]);

  /** Move an idea one step along the pipeline, from the list row. */
  const advance = useCallback(
    async (id: string, status: string) => {
      setAdvancing(id);
      try {
        const res = await fetch("/api/projects", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ action: "update", projectId: id, status }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Failed to update");
        await load();
        await loadSummaries();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update");
      } finally {
        setAdvancing(null);
      }
    },
    [accessToken, load, loadSummaries]
  );

  const summaryFor = useMemo(
    () => new Map(summaries.map((s) => [s.project_id, s])),
    [summaries]
  );

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
    const today = new Date().toISOString().slice(0, 10);
    const live = projects.filter((p) => !["completed", "cancelled"].includes(p.status));
    const liveSummaries = summaries.filter((s) =>
      live.some((p) => p.id === s.project_id)
    );

    return {
      active: projects.filter((p) => p.status === "active").length,
      ideas: projects.filter((p) => IDEA_STATUSES.includes(p.status as never)).length,
      overdue: projects.filter((p) => isProjectOverdue(p.target_date, p.status, today))
        .length,
      overBudget: projects.filter(
        (p) => p.budget_amount != null && Number(p.actual_cost) > Number(p.budget_amount)
      ).length,
      slipped: liveSummaries.filter((s) => s.delay_days >= 1).length,
      delayDays: liveSummaries.reduce((sum, s) => sum + s.delay_days, 0),
      openIssues: liveSummaries.reduce((sum, s) => sum + s.open_issues, 0),
      totalBudget: projects.reduce((s, p) => s + Number(p.budget_amount ?? 0), 0),
    };
  }, [projects, summaries]);

  const activeView = PROJECT_VIEWS.find((v) => v.value === view) ?? PROJECT_VIEWS[0];

  return (
    <PageShell dense={view === "board"}>
      <PageHeader
        title="Projects"
        description="Cross-department work, from a business idea through to delivery"
        actions={
          // Not on the Advisor tab: that screen asks about a project that already
          // exists, so a create button there is the one action it cannot use.
          canEdit && view !== "advisor" ? (
            <Button
              onClick={() => setDialogOpen(true)}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="mr-1.5 h-4 w-4" /> New project
            </Button>
          ) : null
        }
      >
        {/* The four arrangements of the same list. */}
        <div className="flex flex-wrap items-center gap-1">
          {PROJECT_VIEWS.map((v) => (
            <button
              key={v.value}
              type="button"
              title={v.hint}
              onClick={() => chooseView(v.value)}
              className={`rounded-md px-2.5 py-1 text-sm font-medium transition-colors ${
                v.value === view
                  ? "bg-card text-foreground shadow-panel"
                  : "text-muted-foreground hover:bg-card/60 hover:text-foreground"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-muted-foreground">{activeView.hint}</span>
      </PageHeader>

      {error ? <AlertBanner tone="danger">{error}</AlertBanner> : null}

      {/* Delivery alarms belong to work in flight. On the funnel you are deciding
          whether to start something, and a build that slipped last month is not part
          of that decision — it is just noise on the way to the thing you came for. */}
      {m.overdue > 0 && view !== "advisor" ? (
        <AlertBanner tone="warn">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">
            {m.overdue} project{m.overdue === 1 ? " is" : "s are"} past their target date.
          </span>
        </AlertBanner>
      ) : null}

      {m.overBudget > 0 && view !== "advisor" ? (
        <AlertBanner tone="warn">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">
            {m.overBudget} project{m.overBudget === 1 ? " is" : "s are"} over budget.
          </span>
        </AlertBanner>
      ) : null}

      {/* Slippage the delay log has accounted for — a different and more actionable
          fact than "past its target date". Hidden on the table view, which shows the
          same thing per project with the cause beside it. */}
      {m.slipped > 0 && view !== "table" && view !== "advisor" ? (
        <AlertBanner tone="warn">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">
            {m.slipped} project{m.slipped === 1 ? " has" : "s have"} lost time to logged
            issues — {Math.round(m.delayDays)} days across the board.{" "}
            <button
              type="button"
              onClick={() => chooseView("table")}
              className="underline"
            >
              See what caused it
            </button>
            .
          </span>
        </AlertBanner>
      ) : null}

      {/* Headline figures, the same in every view — the tiles describe the portfolio,
          and the view below decides how to arrange it. */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Active projects"
          value={m.active}
          icon={FolderKanban}
          accent={SERIES[0]}
        />
        <StatTile
          label="Behind schedule"
          value={m.slipped}
          icon={CalendarClock}
          accent={m.slipped > 0 ? STATUS.critical : SERIES[2]}
          higherIsBetter={false}
        />
        <StatTile
          label="Days lost to issues"
          value={Math.round(m.delayDays)}
          icon={AlertTriangle}
          accent={m.delayDays > 0 ? STATUS.serious : SERIES[2]}
          higherIsBetter={false}
        />
        <StatTile
          label="Committed budget"
          value={m.totalBudget}
          currency
          icon={Gauge}
          accent={SERIES[6]}
        />
      </div>

      {/* One filter row above everything it scopes. The advisor picks its own project,
          so a second control there would be two things fighting over the same choice. */}
      {view !== "advisor" ? (
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
          <SelectField
            aria-label="Filter by status"
            value={statusFilter}
            onValueChange={setStatusFilter}
            options={[
              { value: "all", label: "Any status" },
              ...PROJECT_STATUSES.map((s) => ({ value: s.value, label: s.label })),
            ]}
          />
          <SelectField
            aria-label="Filter by type"
            value={typeFilter}
            onValueChange={setTypeFilter}
            options={[
              { value: "all", label: "Any type" },
              ...PROJECT_TYPES.map((t) => ({ value: t.value, label: t.label })),
            ]}
          />
          <Button
            variant={mineOnly ? "default" : "outline"}
            onClick={() => setMineOnly((v) => !v)}
            className={mineOnly ? "bg-primary text-primary-foreground" : ""}
          >
            My projects
          </Button>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
        </div>
      ) : null}

      {view === "list" ? (
        <Panel
          title={`${filtered.length} project${filtered.length === 1 ? "" : "s"}`}
          padded={false}
        >
          {projects.length === 0 && !isLoading ? (
            <div className="py-10 text-center">
              <FolderKanban className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No projects yet.</p>
              {canEdit ? (
                <Button variant="outline" className="mt-3" onClick={() => setDialogOpen(true)}>
                  Create the first one
                </Button>
              ) : null}
            </div>
          ) : (
            <ProjectListView
              projects={filtered}
              summaries={summaryFor}
              users={users}
              members={members}
              departments={departments}
              tasks={tasks}
              canEdit={canEdit}
              busyId={advancing}
              onAdvance={(id, status) => void advance(id, status)}
            />
          )}
        </Panel>
      ) : null}

      {view === "table" ? (
        <Panel
          title={`${filtered.length} project${filtered.length === 1 ? "" : "s"}`}
          description="Sorted by how far behind they are"
          padded={false}
        >
          <ProjectTableView
            projects={filtered}
            summaries={summaryFor}
            users={users}
            members={members}
          />
        </Panel>
      ) : null}

      {view === "board" ? (
        <ProjectBoardView projects={filtered} summaries={summaryFor} users={users} />
      ) : null}

      {view === "advisor" ? (
        <ProjectAdvisorView projects={projects} accessToken={accessToken ?? ""} />
      ) : null}

      {dialogOpen ? (
        <ProjectFormDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onSaved={() => {
            setDialogOpen(false);
            void load();
            void loadSummaries();
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

export default function ProjectsPage() {
  return (
    <Suspense
      fallback={
        <PageShell>
          <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading projects…
          </p>
        </PageShell>
      }
    >
      <ProjectsPageInner />
    </Suspense>
  );
}
