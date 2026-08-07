"use client";

import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { STATUS } from "@/components/charts/tokens";
import type { Project, ProjectDeliverySummary } from "@/lib/projects/constants";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";

/**
 * Delete a project, for real.
 *
 * Everything hanging off the project cascades — the block grid and every ticked cell,
 * the delay log, the plant register, the cost ledger, the document links, the tasks
 * and the update history. On an imported job that is two years of site record, and
 * there is no undo and no soft delete anywhere in this schema.
 *
 * So the dialog does two things a plain "are you sure?" cannot: it says exactly what
 * is about to be destroyed, counted from the project in front of you, and where there
 * is genuinely something to lose it asks for the project's name. An empty scratch
 * project deletes on one click — the friction is proportional to the loss, not
 * uniform, because uniform friction is the kind people learn to click through.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
  project: Project;
  delivery: ProjectDeliverySummary | null;
  counts: {
    tasks: number;
    costs: number;
    updates: number;
    members: number;
    links: number;
  };
  accessToken: string;
}

export function DeleteProjectDialog({
  open,
  onClose,
  onDeleted,
  project,
  delivery,
  counts,
  accessToken,
}: Props) {
  const [typed, setTyped] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Only the things that actually exist, so the list never pads itself. */
  const losses = useMemo(() => {
    const rows: string[] = [];
    if (delivery && delivery.blocks_total > 0) {
      rows.push(
        `${delivery.blocks_total} block${delivery.blocks_total === 1 ? "" : "s"} and every stage ticked against them`
      );
    }
    if (delivery && delivery.total_issues > 0) {
      rows.push(
        `${delivery.total_issues} logged issue${delivery.total_issues === 1 ? "" : "s"}` +
          (delivery.delay_days >= 1
            ? ` accounting for ${Math.round(delivery.delay_days)} days of delay`
            : "")
      );
    }
    if (counts.costs > 0) {
      rows.push(`${counts.costs} cost entr${counts.costs === 1 ? "y" : "ies"}`);
    }
    if (counts.tasks > 0) rows.push(`${counts.tasks} task${counts.tasks === 1 ? "" : "s"}`);
    if (counts.updates > 0) {
      rows.push(`${counts.updates} posted update${counts.updates === 1 ? "" : "s"}`);
    }
    if (counts.links > 0) {
      rows.push(`${counts.links} linked record${counts.links === 1 ? "" : "s"}`);
    }
    if (counts.members > 0) {
      rows.push(`${counts.members} ${counts.members === 1 ? "person" : "people"} lose access`);
    }
    return rows;
  }, [delivery, counts]);

  // Nothing of substance attached? Then a name to type is ceremony, not safety.
  const needsTypedName = losses.length > 0;
  const confirmed = !needsTypedName || typed.trim() === project.name;

  const submit = async () => {
    setError(null);
    setIsDeleting(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          action: "deleteProject",
          projectId: project.id,
          name: project.name,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to delete the project");
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete the project");
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !isDeleting && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: STATUS.critical }} />
            Delete {project.name}?
          </DialogTitle>
        </DialogHeader>

        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            <span className="font-mono text-xs">{project.code}</span> will be removed
            permanently. This cannot be undone.
          </p>

          {losses.length > 0 ? (
            <div
              className="rounded-md border px-3 py-2.5"
              style={{ borderColor: "rgb(208 59 59 / 0.3)", background: "rgb(208 59 59 / 0.04)" }}
            >
              <p className="mb-1.5 text-xs font-medium">This also destroys:</p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {losses.map((l) => (
                  <li key={l} className="flex gap-2">
                    <span aria-hidden style={{ color: STATUS.critical }}>
                      •
                    </span>
                    <span>{l}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nothing else is attached to it.
            </p>
          )}

          {needsTypedName ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Type <span className="font-semibold text-foreground">{project.name}</span> to
                confirm
              </label>
              <Input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={project.name}
                autoFocus
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => void submit()}
            disabled={isDeleting || !confirmed}
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Deleting…
              </>
            ) : (
              <>
                <Trash2 className="mr-1.5 h-4 w-4" /> Delete project
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
