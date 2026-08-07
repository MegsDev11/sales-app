"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select-field";
import { Panel } from "@/components/layout/page-shell";
import { BarChart } from "@/components/charts/bar-chart";
import { STATUS } from "@/components/charts/tokens";
import {
  ISSUE_TYPES,
  type ProjectBlock,
  type ProjectIssue,
} from "@/lib/projects/constants";
import { delayLabel, issueOpenDays, totalDelayDays } from "@/lib/projects/progress";
import { AlertTriangle, Check, Plus, RotateCcw, Trash2 } from "lucide-react";

/**
 * The delay log.
 *
 * This is the part of the sheet that turned a missed date into an explanation. Every
 * issue is stamped when it opens and when it closes; the days between are what push
 * the completion date out, and counting them by cause is what makes the argument for
 * buying a second cherry picker rather than repeating it every year.
 *
 * An open issue's clock runs against `now`, so the cost of not fixing something is
 * visible while it is still not fixed — which is the only time the number can change
 * anyone's mind.
 */

interface Props {
  issues: ProjectIssue[];
  blocks: ProjectBlock[];
  canLog: boolean;
  canEdit: boolean;
  busy: boolean;
  userName: (id: string | null) => string;
  onLog: (payload: {
    issueType: string;
    description: string;
    blockId: string | null;
    loggedAt: string;
  }) => void;
  onResolve: (id: string) => void;
  onReopen: (id: string) => void;
  onRemove: (id: string) => void;
}

/** `datetime-local` wants local wall-clock, not the Z-suffixed ISO string. */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export function ProjectIssueLog({
  issues,
  blocks,
  canLog,
  canEdit,
  busy,
  userName,
  onLog,
  onResolve,
  onReopen,
  onRemove,
}: Props) {
  const [open, setOpen] = useState(false);
  const [issueType, setIssueType] = useState<string>(ISSUE_TYPES[0]);
  const [customType, setCustomType] = useState("");
  const [description, setDescription] = useState("");
  const [blockId, setBlockId] = useState("");
  const [startedAt, setStartedAt] = useState(() => toLocalInput(new Date()));

  /**
   * One instant for the whole render, so every row's clock agrees — and a live one.
   *
   * An open issue's cost is "how long it has been open", which keeps growing while
   * the page sits on a screen in the office. Re-reading the clock each minute means
   * that number is never quietly stale.
   */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(tick);
  }, []);

  const stats = useMemo(() => {
    const openIssues = issues.filter((i) => !i.resolved_at);
    const byType = new Map<string, number>();
    for (const i of issues) {
      byType.set(i.issue_type, (byType.get(i.issue_type) ?? 0) + issueOpenDays(i, now));
    }
    return {
      openIssues,
      totalDays: totalDelayDays(issues, now),
      openDays: totalDelayDays(openIssues, now),
      byType: Array.from(byType.entries())
        .map(([label, value]) => ({ label, value: Math.round(value) }))
        .filter((d) => d.value > 0)
        .sort((a, b) => b.value - a.value),
    };
  }, [issues, now]);

  const sorted = useMemo(
    () =>
      [...issues].sort((a, b) => {
        // Still open first — those are the ones anyone can still do something about.
        if (!a.resolved_at !== !b.resolved_at) return a.resolved_at ? 1 : -1;
        return Date.parse(b.logged_at) - Date.parse(a.logged_at);
      }),
    [issues]
  );

  return (
    <div className="space-y-4">
      <Panel
        title="Delay log"
        description={
          issues.length === 0
            ? "Nothing logged yet"
            : `${stats.openIssues.length} open · ${delayLabel(stats.totalDays)} lost in total`
        }
        padded={false}
        actions={
          canLog ? (
            <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Log an issue
            </Button>
          ) : null
        }
      >
        {open && canLog ? (
          <div className="space-y-2 border-b border-border p-3">
            <div className="flex flex-wrap gap-2">
              <Field label="What held it up" htmlFor="issue-type" className="flex-1">
                <SelectField
                  id="issue-type"
                  className="w-full"
                  value={issueType}
                  onValueChange={setIssueType}
                  options={[
                    ...ISSUE_TYPES.map((t) => ({ value: t, label: t })),
                    { value: "__custom", label: "Something else…" },
                  ]}
                />
              </Field>

              {issueType === "__custom" ? (
                <Field label="Name it" htmlFor="issue-custom-type" className="flex-1">
                  <Input
                    id="issue-custom-type"
                    value={customType}
                    onChange={(e) => setCustomType(e.target.value)}
                    placeholder="e.g. Municipality"
                    className="h-8 text-xs"
                  />
                </Field>
              ) : null}

              <Field
                label="Which block (optional)"
                htmlFor="issue-block"
                className="flex-1"
              >
                <SelectField
                  id="issue-block"
                  className="w-full"
                  value={blockId}
                  onValueChange={setBlockId}
                  options={[
                    { value: "", label: "Whole project" },
                    ...blocks.map((b) => ({ value: b.id, label: b.name })),
                  ]}
                />
              </Field>

              <label className="flex-1">
                <span className="mb-0.5 block text-[11px] text-muted-foreground">
                  Started
                </span>
                <Input
                  type="datetime-local"
                  value={startedAt}
                  onChange={(e) => setStartedAt(e.target.value)}
                  className="h-8 text-xs"
                />
              </label>
            </div>

            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What happened, in the words you'd use to explain it to the client…"
            />

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                disabled={
                  busy ||
                  !description.trim() ||
                  (issueType === "__custom" && !customType.trim())
                }
                onClick={() => {
                  onLog({
                    issueType: issueType === "__custom" ? customType.trim() : issueType,
                    description,
                    blockId: blockId || null,
                    // The picker gives local time; the API stores an instant.
                    loggedAt: new Date(startedAt).toISOString(),
                  });
                  setDescription("");
                  setBlockId("");
                  setStartedAt(toLocalInput(new Date()));
                  setOpen(false);
                }}
              >
                Log it
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <span className="text-[11px] text-muted-foreground">
                Backdate the start if it began earlier — that is where the days come from.
              </span>
            </div>
          </div>
        ) : null}

        {sorted.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            Nothing has held this project up yet. When something does, log it here — the
            days it stays open are what move the completion date.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {sorted.map((i) => {
              const days = issueOpenDays(i, now);
              const isOpen = !i.resolved_at;
              const block = blocks.find((b) => b.id === i.block_id);
              return (
                <li key={i.id} className="flex flex-wrap items-start gap-3 px-4 py-2.5">
                  <span
                    aria-hidden
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                    style={{ background: isOpen ? STATUS.critical : STATUS.good }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 text-sm">
                      <span className="font-medium">{i.issue_type}</span>
                      {block ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                          {block.name}
                        </span>
                      ) : null}
                      {isOpen ? (
                        <span
                          className="flex items-center gap-1 text-[11px] font-medium"
                          style={{ color: STATUS.critical }}
                        >
                          <AlertTriangle className="h-3 w-3" /> still open
                        </span>
                      ) : null}
                    </p>
                    <p className="text-sm text-muted-foreground">{i.description}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {new Date(i.logged_at).toLocaleDateString("en-ZA", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                      {i.resolved_at
                        ? ` → ${new Date(i.resolved_at).toLocaleDateString("en-ZA", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}`
                        : ""}
                      {i.logged_by ? ` · logged by ${userName(i.logged_by)}` : ""}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p
                      className="text-sm font-semibold tabular-nums"
                      style={{ color: isOpen ? STATUS.critical : undefined }}
                    >
                      {delayLabel(days)}
                    </p>
                    <div className="mt-1 flex justify-end gap-1">
                      {isOpen ? (
                        <button
                          type="button"
                          onClick={() => onResolve(i.id)}
                          disabled={busy || !canLog}
                          className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[11px] hover:bg-muted disabled:opacity-50"
                        >
                          <Check className="h-3 w-3" /> Resolved
                        </button>
                      ) : canLog ? (
                        <button
                          type="button"
                          onClick={() => onReopen(i.id)}
                          disabled={busy}
                          className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
                        >
                          <RotateCcw className="h-3 w-3" /> Reopen
                        </button>
                      ) : null}
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => onRemove(i.id)}
                          disabled={busy}
                          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                          aria-label="Delete issue"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {stats.byType.length > 0 ? (
        <BarChart
          title="Where the days went"
          subtitle="Days lost by cause, across the life of this project"
          data={stats.byType}
        />
      ) : null}
    </div>
  );
}
