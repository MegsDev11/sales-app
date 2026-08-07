"use client";

import { Fragment, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select-field";
import {
  WORK_CYCLE,
  WORK_STATUSES,
  workMeta,
  type ProjectBlock,
  type ProjectBlockStage,
  type ProjectStage,
  type WorkStatus,
} from "@/lib/projects/constants";
import { blockIsComplete, indexCells, percentLabel, stageProgress } from "@/lib/projects/progress";
import { CHROME, STATUS } from "@/components/charts/tokens";
import { Check, ChevronDown, Plus, Trash2, X } from "lucide-react";

/**
 * The block × stage grid — the screen this whole module exists to replace.
 *
 * It is a table on purpose, not a card list or a kanban. The value of the original
 * sheet was that thirty blocks and eight stages fitted on one screen and the shape of
 * the colour told you where the job was stuck before you read a single word. Break
 * that into cards and you get a prettier page that answers a worse question.
 *
 * Clicking a cell advances it; shift-clicking steps back. No dropdown per cell —
 * 240 selects on a page is unusable, and the whole point is that closing off a
 * morning's work should take a row of clicks.
 */

interface Props {
  stages: ProjectStage[];
  blocks: ProjectBlock[];
  cells: ProjectBlockStage[];
  blockNoun: { one: string; many: string };
  canEdit: boolean;
  /** Members can move cells without being able to reshape the grid. */
  canUpdate: boolean;
  busy: boolean;
  userName: (id: string | null) => string;
  users: { id: string; name: string; active?: boolean }[];
  onSetCell: (blockId: string, stageId: string, status: WorkStatus) => void;
  onAddBlocks: (prefix: string, count: number) => void;
  onUpdateBlock: (id: string, patch: Record<string, unknown>) => void;
  onRemoveBlock: (id: string) => void;
  onAddStage: (name: string) => void;
  onRemoveStage: (id: string) => void;
}

function nextStatus(current: WorkStatus, back: boolean): WorkStatus {
  const i = WORK_CYCLE.indexOf(current);
  const step = back ? -1 : 1;
  return WORK_CYCLE[(i + step + WORK_CYCLE.length) % WORK_CYCLE.length];
}

export function DeliveryGrid({
  stages,
  blocks,
  cells,
  blockNoun,
  canEdit,
  canUpdate,
  busy,
  userName,
  users,
  onSetCell,
  onAddBlocks,
  onUpdateBlock,
  onRemoveBlock,
  onAddStage,
  onRemoveStage,
}: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addPrefix, setAddPrefix] = useState(blockNoun.one);
  const [addCount, setAddCount] = useState("1");
  const [newStage, setNewStage] = useState("");
  const [stageOpen, setStageOpen] = useState(false);

  const index = useMemo(() => indexCells(cells), [cells]);
  const columns = useMemo(
    () => stageProgress(stages, blocks, cells),
    [stages, blocks, cells]
  );

  if (stages.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="sticky left-0 z-10 min-w-[150px] bg-surface-elevated px-3 py-2 text-left text-xs font-semibold">
                {blockNoun.one}
              </th>
              <th className="px-2 py-2 text-right text-xs font-semibold text-muted-foreground">
                Units
              </th>
              {stages.map((s) => (
                <th key={s.id} className="px-1 py-2 align-bottom">
                  {/* Vertical headers: eight readable stage names across a laptop
                      screen is not otherwise possible, and truncating them turns
                      "Stringing / installing" into "Strin…" on every project. */}
                  <div className="mx-auto flex h-28 w-8 items-end justify-center">
                    <span
                      className="whitespace-nowrap text-[11px] font-medium"
                      style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
                      title={s.counts_to_progress ? s.name : `${s.name} — not counted in %`}
                    >
                      {s.name}
                      {s.counts_to_progress ? "" : " *"}
                    </span>
                  </div>
                </th>
              ))}
              <th className="px-2 py-2 text-left text-xs font-semibold text-muted-foreground">
                Notes
              </th>
              {canEdit ? <th className="w-8" /> : null}
            </tr>
          </thead>

          <tbody>
            {blocks.length === 0 ? (
              <tr>
                <td
                  colSpan={stages.length + 4}
                  className="px-3 py-8 text-center text-sm text-muted-foreground"
                >
                  No {blockNoun.many.toLowerCase()} yet. Add the run of{" "}
                  {blockNoun.many.toLowerCase()} this project is cut into.
                </td>
              </tr>
            ) : (
              blocks.map((b) => {
                const done = blockIsComplete(index, b, stages);
                const isOpen = expanded === b.id;
                return (
                  <Fragment key={b.id}>
                    <tr className="border-b border-hairline transition-colors hover:bg-muted/30">
                      <td className="sticky left-0 z-10 bg-surface-elevated px-3 py-1.5">
                        <button
                          type="button"
                          onClick={() => setExpanded(isOpen ? null : b.id)}
                          className="flex w-full items-center gap-1.5 text-left"
                        >
                          <ChevronDown
                            className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform ${
                              isOpen ? "" : "-rotate-90"
                            }`}
                          />
                          <span className="truncate font-medium">{b.name}</span>
                          {done ? (
                            <Check
                              className="h-3.5 w-3.5 shrink-0"
                              style={{ color: STATUS.good }}
                              aria-label="Complete"
                            />
                          ) : null}
                        </button>
                        {b.start_date || b.end_date ? (
                          <p className="pl-[18px] text-[10px] text-muted-foreground">
                            {b.start_date?.slice(5) ?? "—"} → {b.end_date?.slice(5) ?? "—"}
                            {b.actual_end_date
                              ? ` (actual ${b.actual_end_date.slice(5)})`
                              : ""}
                          </p>
                        ) : null}
                      </td>

                      <td className="px-2 py-1.5 text-right text-xs tabular-nums text-muted-foreground">
                        {b.units ?? "—"}
                      </td>

                      {stages.map((s) => {
                        const status =
                          index.get(`${b.id}:${s.id}`)?.status ?? "not_started";
                        const meta = workMeta(status);
                        return (
                          <td key={s.id} className="px-1 py-1.5 text-center">
                            <button
                              type="button"
                              disabled={!canUpdate || busy}
                              title={`${s.name}: ${meta.label}${
                                canUpdate ? " — click to advance, shift-click to go back" : ""
                              }`}
                              onClick={(e) =>
                                onSetCell(b.id, s.id, nextStatus(status, e.shiftKey))
                              }
                              className="mx-auto flex h-6 w-6 items-center justify-center rounded text-[10px] font-semibold text-white transition-transform enabled:hover:scale-110 disabled:cursor-default"
                              style={{
                                background: meta.color,
                                color:
                                  status === "not_started" || status === "na"
                                    ? CHROME.textMuted
                                    : "#fff",
                              }}
                            >
                              <span aria-hidden>{meta.short}</span>
                              <span className="sr-only">
                                {b.name} — {s.name}: {meta.label}
                              </span>
                            </button>
                          </td>
                        );
                      })}

                      <td className="max-w-[220px] px-2 py-1.5">
                        <p
                          className="truncate text-xs text-muted-foreground"
                          title={b.notes || undefined}
                        >
                          {b.notes || "—"}
                        </p>
                      </td>

                      {canEdit ? (
                        <td className="px-1 py-1.5">
                          <button
                            type="button"
                            onClick={() => onRemoveBlock(b.id)}
                            disabled={busy}
                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                            aria-label={`Delete ${b.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      ) : null}
                    </tr>

                    {isOpen ? (
                      <tr className="border-b border-hairline bg-muted/20">
                        <td colSpan={stages.length + (canEdit ? 4 : 3)} className="px-3 py-3">
                          <BlockDetail
                            block={b}
                            canEdit={canEdit}
                            busy={busy}
                            users={users}
                            userName={userName}
                            onSave={(patch) => onUpdateBlock(b.id, patch)}
                            onClose={() => setExpanded(null)}
                          />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </tbody>

          {blocks.length > 0 ? (
            <tfoot>
              <tr className="border-t-2 border-border">
                <td className="sticky left-0 z-10 bg-surface-elevated px-3 py-2 text-xs font-semibold">
                  Stage complete
                </td>
                <td className="px-2 py-2 text-right text-xs tabular-nums text-muted-foreground">
                  {blocks.reduce((sum, b) => sum + (b.units ?? 0), 0) || "—"}
                </td>
                {columns.map(({ stage, percent }) => (
                  <td key={stage.id} className="px-1 py-2 text-center">
                    <span
                      className="text-[11px] font-semibold tabular-nums"
                      style={{
                        color:
                          percent === 1
                            ? STATUS.good
                            : percent === null || percent === 0
                              ? CHROME.textMuted
                              : CHROME.textPrimary,
                      }}
                    >
                      {percentLabel(percent)}
                    </span>
                  </td>
                ))}
                <td colSpan={canEdit ? 2 : 1} />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      {/* Legend, and the two structural controls. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        {WORK_STATUSES.map((w) => (
          <span key={w.value} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-3 w-3 rounded-sm"
              style={{ background: w.color }}
            />
            {w.label}
          </span>
        ))}
        {stages.some((s) => !s.counts_to_progress) ? (
          <span>* tracked, but outside the completion figure</span>
        ) : null}
      </div>

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          {addOpen ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={addPrefix}
                onChange={(e) => setAddPrefix(e.target.value)}
                placeholder={blockNoun.one}
                className="h-8 w-32 text-xs"
              />
              <Input
                type="number"
                min={1}
                max={200}
                value={addCount}
                onChange={(e) => setAddCount(e.target.value)}
                className="h-8 w-20 text-xs"
              />
              <Button
                size="sm"
                disabled={busy || !addPrefix.trim()}
                onClick={() => {
                  onAddBlocks(addPrefix.trim(), Math.max(1, Number(addCount) || 1));
                  setAddOpen(false);
                  setAddCount("1");
                }}
              >
                Add
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setAddOpen(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs text-muted-foreground">
                Numbers them {addPrefix.trim() || blockNoun.one} 1…{addCount || 1}, skipping
                any that already exist.
              </span>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add {blockNoun.many.toLowerCase()}
            </Button>
          )}

          {stageOpen ? (
            <div className="flex items-center gap-2">
              <Input
                value={newStage}
                onChange={(e) => setNewStage(e.target.value)}
                placeholder="Stage name"
                className="h-8 w-48 text-xs"
              />
              <Button
                size="sm"
                disabled={busy || !newStage.trim()}
                onClick={() => {
                  onAddStage(newStage.trim());
                  setNewStage("");
                  setStageOpen(false);
                }}
              >
                Add
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setStageOpen(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setStageOpen(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add stage
            </Button>
          )}
        </div>
      ) : null}

      {canEdit && stages.length > 0 ? (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">Remove a stage</summary>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {stages.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={busy}
                onClick={() => onRemoveStage(s.id)}
                className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 hover:border-destructive hover:text-destructive"
              >
                {s.name} <X className="h-3 w-3" />
              </button>
            ))}
          </div>
          <p className="mt-1.5">
            Removing a stage deletes its column of progress across every{" "}
            {blockNoun.one.toLowerCase()}.
          </p>
        </details>
      ) : null}
    </div>
  );
}

/** The per-block facts that do not fit in a row: dates, units, planner, notes. */
function BlockDetail({
  block,
  canEdit,
  busy,
  users,
  userName,
  onSave,
  onClose,
}: {
  block: ProjectBlock;
  canEdit: boolean;
  busy: boolean;
  users: { id: string; name: string; active?: boolean }[];
  userName: (id: string | null) => string;
  onSave: (patch: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const [units, setUnits] = useState(block.units?.toString() ?? "");
  const [start, setStart] = useState(block.start_date ?? "");
  const [end, setEnd] = useState(block.end_date ?? "");
  const [actual, setActual] = useState(block.actual_end_date ?? "");
  const [planner, setPlanner] = useState(block.planner_id ?? "");
  const [notes, setNotes] = useState(block.notes ?? "");

  if (!canEdit) {
    return (
      <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-3 lg:grid-cols-5">
        <Fact label="Units" value={block.units?.toString() ?? "—"} />
        <Fact label="Planned start" value={block.start_date ?? "—"} />
        <Fact label="Planned end" value={block.end_date ?? "—"} />
        <Fact label="Actual end" value={block.actual_end_date ?? "—"} />
        <Fact label="Planner" value={userName(block.planner_id)} />
        <div className="sm:col-span-3 lg:col-span-5">
          <dt className="text-muted-foreground">Notes</dt>
          <dd className="whitespace-pre-wrap">{block.notes || "—"}</dd>
        </div>
      </dl>
    );
  }

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Field label="Units">
          <Input
            type="number"
            value={units}
            onChange={(e) => setUnits(e.target.value)}
            className="h-8 text-xs"
          />
        </Field>
        <Field label="Planned start">
          <Input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="h-8 text-xs"
          />
        </Field>
        <Field label="Planned end">
          <Input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="h-8 text-xs"
          />
        </Field>
        <Field label="Actual end">
          <Input
            type="date"
            value={actual}
            onChange={(e) => setActual(e.target.value)}
            className="h-8 text-xs"
          />
        </Field>
        <Field label="Planner" htmlFor="block-planner">
          <SelectField
            id="block-planner"
            className="w-full"
            placeholder="Unassigned"
            value={planner}
            onValueChange={setPlanner}
            options={[
              { value: "", label: "Unassigned" },
              ...users
                .filter((u) => u.active !== false)
                .map((u) => ({ value: u.id, label: u.name })),
            ]}
          />
        </Field>
      </div>

      <Field label="Notes">
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What happened here?"
          className="h-8 text-xs"
        />
      </Field>

      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={busy}
          onClick={() => {
            onSave({
              units: units === "" ? null : Number(units),
              startDate: start || null,
              endDate: end || null,
              actualEndDate: actual || null,
              plannerId: planner || null,
              notes,
            });
            onClose();
          }}
        >
          Save
        </Button>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
