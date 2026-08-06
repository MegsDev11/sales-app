"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { isOwnerRole } from "@/lib/access";
import { useStaffStore } from "@/lib/store/staff-store";
import { useCrmStore } from "@/lib/store/crm-store";
import { PageHeader, PageShell, Panel, AlertBanner } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SelectField } from "@/components/ui/select-field";
import { Meter, StatTile } from "@/components/charts/primitives";
import { StackedBar } from "@/components/charts/bar-chart";
import { SERIES, STATUS, compact } from "@/components/charts/tokens";
import { MODULES } from "@/lib/modules";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import { DeleteProjectDialog } from "@/components/projects/delete-project-dialog";
import { DeliveryPanel } from "@/components/projects/delivery-panel";
import { ProjectAdvisor } from "@/components/projects/project-advisor";
import {
  EMPTY_INTEGRATION,
  ProjectIntegrationPanels,
  ProjectLeadStrip,
  type ProjectIntegration,
} from "@/components/projects/integration-panels";
import {
  COST_CATEGORIES,
  PROJECT_STATUSES,
  TASK_STATUSES,
  priorityMeta,
  statusMeta,
  taskMeta,
  typeLabel,
  type Project,
  type ProjectCost,
  type ProjectDeliverySummary,
  type ProjectDepartment,
  type ProjectLink,
  type ProjectMember,
  type ProjectTask,
  type ProjectUpdate,
} from "@/lib/projects/constants";
import { delayLabel, percentLabel } from "@/lib/projects/progress";
import type { ModuleKey } from "@/lib/types";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  Gauge,
  Link2,
  Loader2,
  Lock,
  Plus,
  Send,
  Trash2,
  Users,
  Wallet,
} from "lucide-react";

/** Where a linked record lives, so the chip can deep-link to it. */
const ENTITY_ROUTES: Record<string, (id: string) => string> = {
  lead: (id) => `/leads/${id}`,
  job: () => `/coordination/jobs`,
  stock_request: () => `/stock/requests`,
  tower_site: () => `/support/towers`,
  network_layout: (id) => `/wireless/layouts/${id}`,
  calendar_event: () => `/scheduler`,
};

const ENTITY_LABELS: Record<string, string> = {
  lead: "Client / lead",
  job: "Job",
  stock_request: "Pick list",
  tower_site: "Tower site",
  network_layout: "Network layout",
  calendar_event: "Calendar event",
};

function shortDate(value: string | null | undefined): string {
  if (!value) return "Not set";
  return new Date(value).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { accessToken, currentUser } = useAuth();
  const router = useRouter();
  // Deleting is the business owner's alone — not the project's owner, and not a
  // Projects `manage` grant. Mirrors migration 059 and the API's own check; this copy
  // only decides whether the button is drawn.
  const isOwner = isOwnerRole(currentUser);
  const { users } = useStaffStore();
  const { leads } = useCrmStore();

  const [project, setProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [departments, setDepartments] = useState<ProjectDepartment[]>([]);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [links, setLinks] = useState<ProjectLink[]>([]);
  const [updates, setUpdates] = useState<ProjectUpdate[]>([]);
  const [costs, setCosts] = useState<ProjectCost[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  // Lifted out of the delivery panel so the header can show the same figures without
  // recomputing them over a grid the header never loads.
  const [delivery, setDelivery] = useState<ProjectDeliverySummary | null>(null);
  // The Phase-2 slice: lead, field work, stock, commercial, staffing.
  const [integration, setIntegration] = useState<ProjectIntegration>(EMPTY_INTEGRATION);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [newTask, setNewTask] = useState("");
  const [newTaskAssignee, setNewTaskAssignee] = useState("");
  const [newTaskModule, setNewTaskModule] = useState("");
  const [newUpdate, setNewUpdate] = useState("");
  const [costDesc, setCostDesc] = useState("");
  const [costAmount, setCostAmount] = useState("");
  const [costCategory, setCostCategory] = useState<string>("other");
  const [linkType, setLinkType] = useState("lead");
  const [linkId, setLinkId] = useState("");

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/projects?id=${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load project");
      setProject(body.project);
      setMembers(body.members ?? []);
      setDepartments(body.departments ?? []);
      setTasks(body.tasks ?? []);
      setLinks(body.links ?? []);
      setUpdates(body.updates ?? []);
      setCosts(body.costs ?? []);
      setCanEdit(Boolean(body.canEdit));
      setIntegration({
        ...EMPTY_INTEGRATION,
        lead: body.lead ?? null,
        jobs: body.jobs ?? [],
        jobCards: body.jobCards ?? [],
        labour: body.labour ?? EMPTY_INTEGRATION.labour,
        stockLines: body.stockLines ?? [],
        stockRequests: body.stockRequests ?? [],
        stockBookings: body.stockBookings ?? [],
        invoices: body.invoices ?? [],
        quotes: body.quotes ?? [],
        phaseStaff: body.phaseStaff ?? [],
        blocks: body.blocks ?? [],
        stages: body.stages ?? [],
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load project");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, id]);

  useEffect(() => {
    void load();
  }, [load]);

  const post = useCallback(
    async (payload: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/projects", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ projectId: id, ...payload }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Request failed");
        await load();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Request failed");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [accessToken, id, load]
  );

  const isMember = members.some((m) => m.user_id === currentUser?.id);

  const taskStats = useMemo(
    () =>
      TASK_STATUSES.map((s) => ({
        label: s.label,
        value: tasks.filter((t) => t.status === s.value).length,
        color: s.color,
      })).filter((s) => s.value > 0),
    [tasks]
  );

  const userName = (uid: string | null) =>
    users.find((u) => u.id === uid)?.name ?? "Unassigned";

  const linkLabel = (link: ProjectLink) => {
    if (link.label) return link.label;
    if (link.entity_type === "lead") {
      return leads.find((l) => l.id === link.entity_id)?.clientName ?? link.entity_id;
    }
    return link.entity_id;
  };

  if (isLoading && !project) {
    return (
      <PageShell>
        <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading project…
        </p>
      </PageShell>
    );
  }

  if (!project) {
    return (
      <PageShell>
        <PageHeader title="Project" />
        <Panel title="Not found">
          <p className="text-sm text-muted-foreground">
            {error ?? "This project doesn't exist, or you don't have access to it."}
          </p>
          <Link href="/projects">
            <Button variant="outline" className="mt-3">
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to projects
            </Button>
          </Link>
        </Panel>
      </PageShell>
    );
  }

  const s = statusMeta(project.status);
  const pr = priorityMeta(project.priority);
  const overBudget =
    project.budget_amount != null && Number(project.actual_cost) > Number(project.budget_amount);
  const done = tasks.filter((t) => t.status === "done").length;

  // "Slipped" means the delay log has actually moved the date, which needs both a
  // target to move and days to move it by. Without a target there is nothing to
  // revise, and the tile falls back to showing the delay on its own.
  const slipped = Boolean(
    delivery && delivery.delay_days >= 1 && delivery.revised_target_date && project.target_date
  );

  return (
    <PageShell>
      <PageHeader
        title={project.name}
        description={project.description || "No description yet."}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/projects">
              <Button variant="outline">
                <ArrowLeft className="mr-1.5 h-4 w-4" /> All projects
              </Button>
            </Link>
            {canEdit ? (
              <>
                <SelectField
                  aria-label="Project status"
                  value={project.status}
                  onValueChange={(v) => void post({ action: "update", status: v })}
                  disabled={busy}
                  options={PROJECT_STATUSES.map((st) => ({ value: st.value, label: st.label }))}
                />
                <Button
                  onClick={() => setEditOpen(true)}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  Edit
                </Button>
              </>
            ) : null}
            {/* Owner only, and an icon rather than a labelled button: it sits beside
                Edit, and a red "Delete" the same size as its neighbour is a misclick
                waiting to happen. It opens a dialog, so the click itself is safe. */}
            {isOwner ? (
              <Button
                variant="destructive"
                size="icon"
                onClick={() => setDeleteOpen(true)}
                title="Delete this project"
                aria-label="Delete this project"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        }
      />

      {error ? <AlertBanner tone="danger">{error}</AlertBanner> : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-2 w-2 rounded-full"
            style={{ background: s.color }}
          />
          {s.label}
        </span>
        <span className="font-mono text-xs text-muted-foreground">{project.code}</span>
        <span className="text-muted-foreground">{typeLabel(project.type)}</span>
        <span style={{ color: pr.color }}>{pr.label} priority</span>
        {project.is_private ? (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Lock className="h-3.5 w-3.5" /> Private
          </span>
        ) : null}
        {departments.map((d) => (
          <span
            key={d.module_key}
            className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
          >
            {MODULES[d.module_key as ModuleKey]?.label ?? d.module_key}
          </span>
        ))}
      </div>

      {/* The delay log has pushed the completion date out — say so before anything else. */}
      {slipped ? (
        <AlertBanner tone="warn">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">
            {delayLabel(delivery!.delay_days)} lost to{" "}
            {delivery!.total_issues} logged issue
            {delivery!.total_issues === 1 ? "" : "s"} — this project is now tracking to{" "}
            {new Date(delivery!.revised_target_date!).toLocaleDateString("en-ZA", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            , not {shortDate(project.target_date)}.
          </span>
        </AlertBanner>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Complete"
          value={percentLabel(delivery?.percent_complete ?? null)}
          icon={Gauge}
          accent={SERIES[0]}
        />
        <StatTile
          label={slipped ? "Revised completion" : "Target date"}
          value={
            slipped
              ? shortDate(delivery!.revised_target_date)
              : shortDate(project.target_date)
          }
          raw={slipped ? `Was ${shortDate(project.target_date)}` : undefined}
          icon={CalendarClock}
          accent={slipped ? STATUS.critical : SERIES[3]}
        />
        <StatTile
          label="Days lost to issues"
          value={delivery ? Math.round(delivery.delay_days) : 0}
          icon={AlertTriangle}
          accent={delivery && delivery.delay_days > 0 ? STATUS.serious : SERIES[2]}
          higherIsBetter={false}
        />
        <StatTile
          label="Spent"
          value={Number(project.actual_cost)}
          currency
          icon={Wallet}
          accent={overBudget ? STATUS.critical : SERIES[0]}
          higherIsBetter={false}
        />
      </div>

      {/* The quote the project is being delivered against. */}
      {project.quote_number || project.quote_amount != null ? (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted-foreground">
          {project.quote_number ? (
            <span>
              Quote <span className="font-mono text-foreground">{project.quote_number}</span>
            </span>
          ) : null}
          {project.quote_amount != null ? (
            <span>
              Quoted{" "}
              <span className="font-medium text-foreground">
                {compact(Number(project.quote_amount), true)}
              </span>
            </span>
          ) : null}
          {delivery && delivery.units_total > 0 ? (
            <span>
              {delivery.units_total} units across {delivery.blocks_total} blocks (
              {delivery.blocks_done} finished)
            </span>
          ) : null}
        </div>
      ) : null}

      {/* How this work was won — lead, source, salesperson. */}
      <ProjectLeadStrip lead={integration.lead} />

      {project.budget_amount != null ? (
        <Panel title="Budget">
          <Meter
            label={overBudget ? "Over budget" : "Spend against budget"}
            value={Number(project.actual_cost)}
            max={Number(project.budget_amount)}
            compactValue
          />
        </Panel>
      ) : null}

      {/* A second opinion on this job, argued from every other job on record. */}
      <ProjectAdvisor
        projectId={id}
        projectName={project.name}
        accessToken={accessToken ?? ""}
        compact
      />

      {/* How the work is actually being delivered: the grid, the plant, the delays. */}
      <DeliveryPanel
        projectId={id}
        accessToken={accessToken ?? ""}
        targetDate={project.target_date}
        users={users}
        onSummary={setDelivery}
      />

      {/* Everything else this project touches: jobs, stock, money, people. */}
      <ProjectIntegrationPanels
        data={integration}
        users={users}
        canEdit={canEdit}
        busy={busy}
        post={post}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {/* Tasks */}
          <Panel
            title="Tasks"
            description={
              tasks.length > 0
                ? `${done} of ${tasks.length} done — one-off work that sits outside the grid`
                : "One-off work that sits outside the delivery grid"
            }
            padded={false}
          >
            {canEdit ? (
              <div className="flex flex-wrap gap-2 border-b border-border p-3">
                <Input
                  value={newTask}
                  onChange={(e) => setNewTask(e.target.value)}
                  placeholder="What needs doing?"
                  className="min-w-[180px] flex-1"
                />
                <SelectField
                  aria-label="Assign the new task to"
                  value={newTaskAssignee}
                  onValueChange={setNewTaskAssignee}
                  options={[
                    { value: "", label: "Unassigned" },
                    ...users
                      .filter((u) => u.active !== false)
                      .map((u) => ({ value: u.id, label: u.name })),
                  ]}
                />
                <SelectField
                  aria-label="Department for the new task"
                  value={newTaskModule}
                  onValueChange={setNewTaskModule}
                  options={[
                    { value: "", label: "No department" },
                    ...Object.values(MODULES)
                      .filter((mod) => mod.group !== "admin")
                      .map((mod) => ({ value: mod.key, label: mod.label })),
                  ]}
                />
                <Button
                  disabled={busy || !newTask.trim()}
                  onClick={async () => {
                    const ok = await post({
                      action: "addTask",
                      title: newTask,
                      assigneeId: newTaskAssignee || null,
                      moduleKey: newTaskModule || null,
                    });
                    if (ok) {
                      setNewTask("");
                      setNewTaskAssignee("");
                      setNewTaskModule("");
                    }
                  }}
                >
                  <Plus className="mr-1 h-4 w-4" /> Add
                </Button>
              </div>
            ) : null}

            {tasks.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No tasks yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {tasks.map((t) => {
                  const tm = taskMeta(t.status);
                  const mine = t.assignee_id === currentUser?.id;
                  return (
                    <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                      <span
                        aria-hidden
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: tm.color }}
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className={`truncate text-sm ${
                            t.status === "done" ? "text-muted-foreground line-through" : ""
                          }`}
                        >
                          {t.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {userName(t.assignee_id)}
                          {t.module_key
                            ? ` · ${MODULES[t.module_key as ModuleKey]?.label ?? t.module_key}`
                            : ""}
                          {t.due_date
                            ? ` · due ${new Date(t.due_date).toLocaleDateString("en-ZA", {
                                day: "numeric",
                                month: "short",
                              })}`
                            : ""}
                        </p>
                      </div>

                      {/* An assignee can progress their own task even without edit rights —
                          that is what makes cross-department assignment work. */}
                      {mine || canEdit ? (
                        <SelectField
                          size="sm"
                          className="shrink-0"
                          aria-label={`Status of "${t.title}"`}
                          value={t.status}
                          onValueChange={(v) =>
                            void post({
                              action: "setTaskStatus",
                              taskId: t.id,
                              taskStatus: v,
                            })
                          }
                          disabled={busy}
                          options={TASK_STATUSES.map((ts) => ({
                            value: ts.value,
                            label: ts.label,
                          }))}
                        />
                      ) : (
                        <span className="shrink-0 text-xs text-muted-foreground">{tm.label}</span>
                      )}

                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => void post({ action: "deleteTask", taskId: t.id })}
                          disabled={busy}
                          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                          aria-label="Delete task"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          {taskStats.length > 0 ? (
            <StackedBar
              title="Task progress"
              subtitle="Every task on this project by state"
              segments={taskStats}
            />
          ) : null}

          {/* Updates */}
          <Panel title="Updates" description="Decisions, risks and progress notes" padded={false}>
            {isMember || canEdit ? (
              <div className="flex gap-2 border-b border-border p-3">
                <Textarea
                  value={newUpdate}
                  onChange={(e) => setNewUpdate(e.target.value)}
                  rows={2}
                  placeholder="Post an update for everyone involved…"
                  className="flex-1"
                />
                <Button
                  disabled={busy || !newUpdate.trim()}
                  onClick={async () => {
                    const ok = await post({ action: "addUpdate", body: newUpdate });
                    if (ok) setNewUpdate("");
                  }}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            ) : null}

            {updates.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Nothing posted yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {updates.map((u) => (
                  <li key={u.id} className="px-4 py-3">
                    <p className="text-sm">{u.body}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {userName(u.author_id)} ·{" "}
                      {new Date(u.created_at).toLocaleString("en-ZA", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          {/* Members */}
          <Panel
            title="Who is involved"
            description={`${members.length} ${members.length === 1 ? "person" : "people"}`}
            padded={false}
            actions={
              canEdit ? (
                <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                  <Users className="mr-1 h-3.5 w-3.5" /> Manage
                </Button>
              ) : null
            }
          >
            {members.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">Nobody assigned yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {members.map((mem) => {
                  const u = users.find((x) => x.id === mem.user_id);
                  return (
                    <li key={mem.user_id} className="flex items-center gap-2 px-3 py-2">
                      <span
                        aria-hidden
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-medium text-white"
                        style={{ background: u?.color || SERIES[0] }}
                      >
                        {u?.avatarInitials ?? "?"}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {u?.name ?? "Unknown"}
                      </span>
                      <span className="shrink-0 text-xs capitalize text-muted-foreground">
                        {mem.role}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          {/* Cross-module links — the reason this is not just a task board */}
          <Panel
            title="Linked records"
            description="Pull in the actual work from other departments"
            padded={false}
          >
            {canEdit ? (
              <div className="space-y-2 border-b border-border p-3">
                <SelectField
                  className="w-full"
                  aria-label="What kind of record to link"
                  value={linkType}
                  onValueChange={setLinkType}
                  options={Object.entries(ENTITY_LABELS).map(([value, label]) => ({
                    value,
                    label,
                  }))}
                />
                {linkType === "lead" ? (
                  <SelectField
                    className="w-full"
                    aria-label="Client to link"
                    placeholder="Choose a client…"
                    value={linkId}
                    onValueChange={setLinkId}
                    options={leads.slice(0, 200).map((l) => ({
                      value: l.id,
                      label: l.clientName,
                    }))}
                  />
                ) : (
                  <Input
                    value={linkId}
                    onChange={(e) => setLinkId(e.target.value)}
                    placeholder="Record ID"
                    className="h-8 text-xs"
                  />
                )}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy || !linkId}
                  className="w-full"
                  onClick={async () => {
                    const label =
                      linkType === "lead"
                        ? (leads.find((l) => l.id === linkId)?.clientName ?? "")
                        : "";
                    const ok = await post({
                      action: "addLink",
                      entityType: linkType,
                      entityId: linkId,
                      label,
                    });
                    if (ok) setLinkId("");
                  }}
                >
                  <Link2 className="mr-1.5 h-3.5 w-3.5" /> Link record
                </Button>
              </div>
            ) : null}

            {links.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">
                Nothing linked yet. Link a client, a job or a pick list so everyone can see
                what this project actually touches.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {links.map((l) => {
                  const href = ENTITY_ROUTES[l.entity_type]?.(l.entity_id);
                  return (
                    <li key={l.id} className="flex items-center gap-2 px-3 py-2">
                      <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        {href ? (
                          <Link href={href} className="truncate text-sm hover:underline">
                            {linkLabel(l)}
                          </Link>
                        ) : (
                          <span className="truncate text-sm">{linkLabel(l)}</span>
                        )}
                        <p className="text-[11px] text-muted-foreground">
                          {ENTITY_LABELS[l.entity_type] ?? l.entity_type}
                        </p>
                      </div>
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => void post({ action: "removeLink", id: l.id })}
                          disabled={busy}
                          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                          aria-label="Remove link"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          {/* Costs */}
          <Panel title="Costs" description="Rolls up into the project total" padded={false}>
            {canEdit ? (
              <div className="space-y-2 border-b border-border p-3">
                <Input
                  value={costDesc}
                  onChange={(e) => setCostDesc(e.target.value)}
                  placeholder="What was it for?"
                  className="h-8 text-xs"
                />
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={costAmount}
                    onChange={(e) => setCostAmount(e.target.value)}
                    placeholder="Amount"
                    className="h-8 flex-1 text-xs"
                  />
                  <SelectField
                    aria-label="Cost category"
                    value={costCategory}
                    onValueChange={setCostCategory}
                    options={COST_CATEGORIES.map((c) => ({
                      value: c,
                      label: c[0].toUpperCase() + c.slice(1),
                    }))}
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={busy || !costDesc.trim() || !costAmount}
                  onClick={async () => {
                    const ok = await post({
                      action: "addCost",
                      description: costDesc,
                      amount: Number(costAmount),
                      category: costCategory,
                    });
                    if (ok) {
                      setCostDesc("");
                      setCostAmount("");
                    }
                  }}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Add cost
                </Button>
              </div>
            ) : null}

            {costs.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">No costs recorded.</p>
            ) : (
              <ul className="divide-y divide-border">
                {costs.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm">{c.description}</p>
                      <p className="text-[11px] capitalize text-muted-foreground">
                        {c.category} ·{" "}
                        {new Date(c.incurred_on).toLocaleDateString("en-ZA", {
                          day: "numeric",
                          month: "short",
                        })}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-medium tabular-nums">
                      {compact(Number(c.amount), true)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      {deleteOpen ? (
        <DeleteProjectDialog
          open={deleteOpen}
          onClose={() => setDeleteOpen(false)}
          onDeleted={() => {
            // The project no longer exists, so there is nothing to reload — go back
            // to the list rather than re-fetching a 404.
            router.push("/projects");
          }}
          project={project}
          delivery={delivery}
          counts={{
            tasks: tasks.length,
            costs: costs.length,
            updates: updates.length,
            members: members.length,
            links: links.length,
          }}
          accessToken={accessToken ?? ""}
        />
      ) : null}

      {editOpen ? (
        <ProjectFormDialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            void load();
          }}
          project={project}
          members={members}
          departments={departments.map((d) => d.module_key)}
          users={users}
          currentUserId={currentUser?.id ?? ""}
          accessToken={accessToken ?? ""}
        />
      ) : null}
    </PageShell>
  );
}
