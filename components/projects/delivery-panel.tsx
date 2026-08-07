"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select-field";
import { Panel, AlertBanner } from "@/components/layout/page-shell";
import { SERIES, STATUS } from "@/components/charts/tokens";
import { DeliveryGrid } from "@/components/projects/delivery-grid";
import { ProjectIssueLog } from "@/components/projects/project-issue-log";
import { ProjectDocuments } from "@/components/projects/project-documents";
import {
  WORK_STATUSES,
  workMeta,
  type ProjectBlock,
  type ProjectBlockStage,
  type ProjectDelivery,
  type ProjectDeliverySummary,
  type ProjectIssue,
  type ProjectMilestone,
  type ProjectResource,
  type ProjectStage,
  type WorkStatus,
} from "@/lib/projects/constants";
import {
  distributionProgress,
  milestoneProgress,
  percentLabel,
  resourceProgress,
  stageProgress,
} from "@/lib/projects/progress";
import { DELIVERY_TEMPLATES, blockNoun } from "@/lib/projects/templates";
import { Loader2, Plus, Trash2, Wrench } from "lucide-react";

/**
 * Everything below the project header: the plan, the grid, the plant and the delays.
 *
 * Fetches its own slice rather than being fed by the page, because the delivery plane
 * is large and the project header should not wait on it — and because the grid is
 * written to far more often than anything else on the page, so a refresh here should
 * not re-pull members, costs and the update feed with it.
 *
 * `onSummary` hands the rolled-up figures back up so the page header can show the
 * completion percentage and the revised date without computing them twice.
 */

interface Props {
  projectId: string;
  accessToken: string;
  targetDate: string | null;
  users: { id: string; name: string; active?: boolean }[];
  onSummary?: (summary: ProjectDeliverySummary | null) => void;
}

interface DeliveryResponse extends ProjectDelivery {
  template: string | null;
  summary: ProjectDeliverySummary;
  canEdit: boolean;
  isMember: boolean;
}

export function DeliveryPanel({
  projectId,
  accessToken,
  targetDate,
  users,
  onSummary,
}: Props) {
  const [stages, setStages] = useState<ProjectStage[]>([]);
  const [blocks, setBlocks] = useState<ProjectBlock[]>([]);
  const [cells, setCells] = useState<ProjectBlockStage[]>([]);
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([]);
  const [resources, setResources] = useState<ProjectResource[]>([]);
  const [issues, setIssues] = useState<ProjectIssue[]>([]);
  const [template, setTemplate] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [isMember, setIsMember] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [chosenTemplate, setChosenTemplate] = useState(DELIVERY_TEMPLATES[0].key);
  const [newMilestone, setNewMilestone] = useState("");
  const [newResource, setNewResource] = useState("");

  // Held in a ref so an inline `onSummary` from the page does not change `load`'s
  // identity on every render and re-fetch the whole plane in a loop. Written in an
  // effect rather than during render; this one is declared first, so it has already
  // run by the time the load effect below fires.
  const summaryRef = useRef(onSummary);
  useEffect(() => {
    summaryRef.current = onSummary;
  }, [onSummary]);

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await fetch(`/api/projects/delivery?id=${encodeURIComponent(projectId)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const body = (await res.json()) as DeliveryResponse & { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Failed to load the delivery plan");

      setStages(body.stages ?? []);
      setBlocks(body.blocks ?? []);
      setCells(body.cells ?? []);
      setMilestones(body.milestones ?? []);
      setResources(body.resources ?? []);
      setIssues(body.issues ?? []);
      setTemplate(body.template ?? null);
      setCanEdit(Boolean(body.canEdit));
      setIsMember(Boolean(body.isMember));
      summaryRef.current?.(body.summary ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the delivery plan");
      summaryRef.current?.(null);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const post = useCallback(
    async (payload: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/projects/delivery", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ projectId, ...payload }),
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
    [accessToken, projectId, load]
  );

  /**
   * A grid click repaints immediately and reconciles on the reload.
   *
   * Without this, ticking off a morning's work is a sequence of half-second waits and
   * the page feels broken even though nothing is wrong. If the write fails, `load()`
   * in `post` puts the real value back and the error banner explains why.
   */
  const setCell = useCallback(
    (blockId: string, stageId: string, status: WorkStatus) => {
      setCells((prev) => {
        const i = prev.findIndex((c) => c.block_id === blockId && c.stage_id === stageId);
        const row: ProjectBlockStage = {
          block_id: blockId,
          stage_id: stageId,
          project_id: projectId,
          status,
          note: i >= 0 ? prev[i].note : "",
          updated_at: new Date().toISOString(),
        };
        if (i < 0) return [...prev, row];
        const next = [...prev];
        next[i] = row;
        return next;
      });
      void post({ action: "setCell", blockId, stageId, status });
    },
    [post, projectId]
  );

  const canUpdate = canEdit || isMember;
  const noun = useMemo(() => blockNoun(template, blocks), [template, blocks]);
  const userName = useCallback(
    (id: string | null) => users.find((u) => u.id === id)?.name ?? "Unassigned",
    [users]
  );

  const workstreams = useMemo(() => {
    const rows: { label: string; percent: number | null }[] = [];
    const mp = milestoneProgress(milestones);
    if (mp !== null) rows.push({ label: "Milestones", percent: mp });
    const rp = resourceProgress(resources);
    if (rp !== null) rows.push({ label: "Plant ready", percent: rp });
    for (const { stage, percent } of stageProgress(stages, blocks, cells)) {
      rows.push({ label: stage.name, percent });
    }
    return rows;
  }, [milestones, resources, stages, blocks, cells]);

  const buildPercent = useMemo(
    () => distributionProgress(stages, blocks, cells),
    [stages, blocks, cells]
  );

  if (isLoading) {
    return (
      <Panel title="Delivery">
        <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading the delivery plan…
        </p>
      </Panel>
    );
  }

  // ---- no plan yet: offer the templates -----------------------------------
  if (stages.length === 0) {
    return (
      <Panel
        title="Delivery plan"
        description="Set up the stages this project runs through"
      >
        {error ? <AlertBanner tone="danger">{error}</AlertBanner> : null}
        {canEdit ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Pick the kind of job this is. It seeds the stages, the milestone strip and
              the plant register; you can change any of them afterwards.
            </p>
            <div className="grid gap-2 md:grid-cols-3">
              {DELIVERY_TEMPLATES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setChosenTemplate(t.key)}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    chosenTemplate === t.key
                      ? "border-primary bg-muted/50"
                      : "border-border hover:bg-muted/30"
                  }`}
                >
                  <p className="text-sm font-medium">{t.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    {t.stages.length} stages · {t.milestones.length} milestones ·{" "}
                    {t.resources.length} items of plant
                  </p>
                </button>
              ))}
            </div>
            <Button
              disabled={busy}
              onClick={() => void post({ action: "applyTemplate", template: chosenTemplate })}
            >
              {busy ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-1.5 h-4 w-4" />
              )}
              Set up the plan
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No delivery plan has been set up for this project yet.
          </p>
        )}
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      {error ? <AlertBanner tone="danger">{error}</AlertBanner> : null}

      {/* Progress by workstream — the sheet's B7:C16 block. */}
      <Panel
        title="Progress"
        description="Every workstream counts equally toward the completion figure"
        actions={
          buildPercent !== null ? (
            <span className="text-xs text-muted-foreground">
              Physical build {percentLabel(buildPercent)}
            </span>
          ) : null
        }
      >
        <div className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {workstreams.map((w) => (
            <WorkstreamBar key={w.label} label={w.label} percent={w.percent} />
          ))}
        </div>
      </Panel>

      {/* Milestone strip — the sheet's "Main Objective" row. */}
      <Panel
        title="Milestones"
        description="The headline steps, from quote accepted to signed off"
        padded={false}
      >
        <ul className="divide-y divide-border">
          {milestones.map((m) => {
            const meta = workMeta(m.status);
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-2">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: meta.color }}
                />
                <span className="min-w-0 flex-1 truncate text-sm">{m.title}</span>
                {canUpdate ? (
                  <SelectField
                    size="sm"
                    className="shrink-0"
                    aria-label={`Status of "${m.title}"`}
                    value={m.status}
                    disabled={busy}
                    onValueChange={(v) =>
                      void post({
                        action: "setMilestoneStatus",
                        id: m.id,
                        status: v,
                      })
                    }
                    options={WORK_STATUSES.map((w) => ({
                      value: w.value,
                      label: w.label,
                    }))}
                  />
                ) : (
                  <span className="shrink-0 text-xs text-muted-foreground">{meta.label}</span>
                )}
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => void post({ action: "removeMilestone", id: m.id })}
                    disabled={busy}
                    className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                    aria-label={`Remove ${m.title}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
        {canEdit ? (
          <div className="flex gap-2 border-t border-border p-3">
            <Input
              value={newMilestone}
              onChange={(e) => setNewMilestone(e.target.value)}
              placeholder="Add a milestone…"
              className="h-8 flex-1 text-xs"
            />
            <Button
              size="sm"
              disabled={busy || !newMilestone.trim()}
              onClick={async () => {
                const ok = await post({ action: "addMilestone", title: newMilestone.trim() });
                if (ok) setNewMilestone("");
              }}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : null}
      </Panel>

      {/* The grid. */}
      <Panel
        title={`${noun.many} × stages`}
        description={`${blocks.length} ${noun.many.toLowerCase()}, ${stages.length} stages${
          canUpdate ? " — click a cell to advance it" : ""
        }`}
      >
        <DeliveryGrid
          stages={stages}
          blocks={blocks}
          cells={cells}
          blockNoun={noun}
          canEdit={canEdit}
          canUpdate={canUpdate}
          busy={busy}
          users={users}
          userName={userName}
          onSetCell={setCell}
          onAddBlocks={(prefix, count) =>
            void post({
              action: "addBlocks",
              prefix,
              count,
              ...(count === 1 ? { name: prefix } : {}),
            })
          }
          onUpdateBlock={(id, patch) => void post({ action: "updateBlock", id, ...patch })}
          onRemoveBlock={(id) => void post({ action: "removeBlock", id })}
          onAddStage={(name) => void post({ action: "addStage", name })}
          onRemoveStage={(id) => void post({ action: "removeStage", id })}
        />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <ProjectIssueLog
          issues={issues}
          blocks={blocks}
          canLog={canUpdate}
          canEdit={canEdit}
          busy={busy}
          userName={userName}
          onLog={(payload) => void post({ action: "logIssue", ...payload })}
          onResolve={(id) => void post({ action: "resolveIssue", issueId: id })}
          onReopen={(id) => void post({ action: "reopenIssue", issueId: id })}
          onRemove={(id) => void post({ action: "removeIssue", issueId: id })}
        />

        <div className="space-y-4">
          {/* Plant register. */}
          <Panel
            title="Plant and equipment"
            description="Allocated, and actually working"
            padded={false}
          >
            {resources.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">
                Nothing listed. The bakkie, the trencher and the cherry picker belong here —
                it is almost always one of them that stops the job.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {resources.map((r) => (
                  <li key={r.id} className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Wrench className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-sm">{r.name}</span>
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => void post({ action: "removeResource", id: r.id })}
                          disabled={busy}
                          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                          aria-label={`Remove ${r.name}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      ) : null}
                    </div>
                    <div className="mt-1 grid grid-cols-2 gap-2 pl-[22px]">
                      <ResourceStatus
                        label="Have it"
                        value={r.acquired}
                        disabled={!canUpdate || busy}
                        onChange={(v) =>
                          void post({ action: "setResourceStatus", id: r.id, acquired: v })
                        }
                      />
                      <ResourceStatus
                        label="Works"
                        value={r.working_order}
                        disabled={!canUpdate || busy}
                        onChange={(v) =>
                          void post({ action: "setResourceStatus", id: r.id, workingOrder: v })
                        }
                      />
                    </div>
                    {r.notes ? (
                      <p className="mt-1 pl-[22px] text-[11px] text-muted-foreground">
                        {r.notes}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {canEdit ? (
              <div className="flex gap-2 border-t border-border p-3">
                <Input
                  value={newResource}
                  onChange={(e) => setNewResource(e.target.value)}
                  placeholder="Add equipment…"
                  className="h-8 flex-1 text-xs"
                />
                <Button
                  size="sm"
                  disabled={busy || !newResource.trim()}
                  onClick={async () => {
                    const ok = await post({ action: "addResource", name: newResource.trim() });
                    if (ok) setNewResource("");
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : null}
          </Panel>

          {/* Documents and quotes own their own fetch: uploads are served through
              signed URLs that expire, so they cannot ride the delivery payload. */}
          <ProjectDocuments projectId={projectId} accessToken={accessToken} />
        </div>
      </div>

      {targetDate ? null : (
        <p className="text-xs text-muted-foreground">
          Set a target date on this project to see the revised completion date the delay log
          works out.
        </p>
      )}
    </div>
  );
}

/**
 * One workstream's completion.
 *
 * Not the shared `Meter`: that renders "14 % / 100", and a percentage already carries
 * its own denominator. Here the number IS the whole fact, so it leads.
 */
function WorkstreamBar({ label, percent }: { label: string; percent: number | null }) {
  const pct = Math.round((percent ?? 0) * 100);
  const fill =
    percent === null
      ? "#e8eaed"
      : pct === 100
        ? STATUS.good
        : pct === 0
          ? "#cbd5e1"
          : SERIES[0];

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="truncate text-xs text-muted-foreground" title={label}>
          {label}
        </span>
        <span className="shrink-0 text-xs font-semibold tabular-nums">
          {percentLabel(percent)}
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full"
        style={{ background: "#e8eaed" }}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pct}%`, background: fill }}
          role="meter"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={label}
        />
      </div>
    </div>
  );
}

/** One of the plant register's two questions, as a compact three-way toggle. */
function ResourceStatus({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: WorkStatus;
  disabled: boolean;
  onChange: (value: WorkStatus) => void;
}) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <SelectField
        size="sm"
        className="w-full"
        aria-label={label}
        value={value}
        disabled={disabled}
        onValueChange={(v) => onChange(v as WorkStatus)}
        options={WORK_STATUSES.map((w) => ({ value: w.value, label: w.label }))}
      />
    </label>
  );
}
