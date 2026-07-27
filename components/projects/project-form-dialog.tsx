"use client";

import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MODULE_LIST } from "@/lib/modules";
import {
  MEMBER_ROLES,
  PRIORITIES,
  PROJECT_STATUSES,
  PROJECT_TYPES,
  type Project,
  type ProjectMember,
} from "@/lib/projects/constants";
import type { User } from "@/lib/types";
import { Check, Loader2, Lock } from "lucide-react";

/**
 * Create / edit a project, including who is involved.
 *
 * The member picker is the same checkbox pattern as the admin access console
 * deliberately — "decide who is involved" is the same mental action in both places,
 * so it should not look like a different feature.
 */
export function ProjectFormDialog({
  open,
  onClose,
  onSaved,
  project,
  members,
  departments,
  users,
  currentUserId,
  accessToken,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (id?: string) => void;
  project: Project | null;
  members: ProjectMember[];
  departments: string[];
  users: User[];
  currentUserId: string;
  accessToken: string;
}) {
  const isEdit = Boolean(project);

  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [type, setType] = useState(project?.type ?? "internal");
  const [status, setStatus] = useState(project?.status ?? "idea");
  const [priority, setPriority] = useState(project?.priority ?? "medium");
  const [ownerId, setOwnerId] = useState(project?.owner_id ?? currentUserId);
  const [startDate, setStartDate] = useState(project?.start_date ?? "");
  const [targetDate, setTargetDate] = useState(project?.target_date ?? "");
  const [budget, setBudget] = useState(
    project?.budget_amount != null ? String(project.budget_amount) : ""
  );
  const [isPrivate, setIsPrivate] = useState(project?.is_private ?? false);
  const [depts, setDepts] = useState<string[]>(departments);

  const [memberRoles, setMemberRoles] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const m of members) map[m.user_id] = m.role;
    if (!isEdit) map[currentUserId] = "lead";
    return map;
  });

  const [search, setSearch] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectable = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = users.filter((u) => u.active !== false);
    if (!q) return list;
    return list.filter(
      (u) =>
        u.name.toLowerCase().includes(q) || (u.department ?? "").toLowerCase().includes(q)
    );
  }, [users, search]);

  const selectedCount = Object.keys(memberRoles).length;

  const toggleMember = (id: string) =>
    setMemberRoles((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = "contributor";
      return next;
    });

  const submit = async () => {
    setError(null);
    if (!name.trim()) return setError("Give the project a name.");
    if (startDate && targetDate && targetDate < startDate) {
      return setError("The target date is before the start date.");
    }
    if (!Object.values(memberRoles).includes("lead")) {
      return setError("Pick at least one lead — someone has to be able to edit this.");
    }

    setIsSaving(true);
    try {
      const payload = {
        action: isEdit ? "update" : "create",
        projectId: project?.id,
        name,
        description,
        type,
        status,
        priority,
        ownerId,
        startDate: startDate || null,
        targetDate: targetDate || null,
        budgetAmount: budget ? Number(budget) : null,
        isPrivate,
        departments: depts,
        members: Object.entries(memberRoles).map(([userId, role]) => ({ userId, role })),
      };

      const res = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });
      const bodyJson = await res.json();
      if (!res.ok) throw new Error(bodyJson.error ?? "Failed to save");

      // On edit the member list is a separate action, so send it after the patch.
      if (isEdit) {
        const memberRes = await fetch("/api/projects", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            action: "setMembers",
            projectId: project!.id,
            members: Object.entries(memberRoles).map(([userId, role]) => ({ userId, role })),
          }),
        });
        const memberJson = await memberRes.json();
        if (!memberRes.ok) throw new Error(memberJson.error ?? "Failed to save members");
      }

      onSaved(bodyJson.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-auto sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit project" : "New project"}</DialogTitle>
        </DialogHeader>

        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Modimolle tower upgrade"
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              What is this?
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Goal, scope, why it matters…"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
              >
                {PROJECT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
              >
                {PROJECT_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
              >
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Starts</label>
              <Input
                type="date"
                value={startDate ?? ""}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Target date
              </label>
              <Input
                type="date"
                value={targetDate ?? ""}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Budget (R)
              </label>
              <Input
                type="number"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Owner
            </label>
            <select
              value={ownerId ?? ""}
              onChange={(e) => setOwnerId(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            >
              {users
                .filter((u) => u.active !== false)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Departments involved
            </label>
            <div className="flex flex-wrap gap-1.5">
              {MODULE_LIST.filter((mod) => mod.group !== "admin").map((mod) => {
                const on = depts.includes(mod.key);
                return (
                  <button
                    key={mod.key}
                    type="button"
                    onClick={() =>
                      setDepts((prev) =>
                        on ? prev.filter((d) => d !== mod.key) : [...prev, mod.key]
                      )
                    }
                    className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      on
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {mod.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Who is involved {selectedCount > 0 ? `(${selectedCount})` : ""}
            </label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search staff…"
              className="mb-2"
            />
            <div className="max-h-52 space-y-0.5 overflow-auto rounded-md border border-border p-1">
              {selectable.length === 0 ? (
                <p className="p-2 text-xs text-muted-foreground">No matching staff.</p>
              ) : (
                selectable.map((u) => {
                  const role = memberRoles[u.id];
                  const on = Boolean(role);
                  return (
                    <div
                      key={u.id}
                      className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted"
                    >
                      <button
                        type="button"
                        onClick={() => toggleMember(u.id)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                            on
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border"
                          }`}
                        >
                          {on ? <Check className="h-3 w-3" /> : null}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm">{u.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {u.department ?? ""}
                        </span>
                      </button>
                      <select
                        value={role ?? "contributor"}
                        onChange={(e) =>
                          setMemberRoles((prev) => ({ ...prev, [u.id]: e.target.value }))
                        }
                        disabled={!on}
                        className="h-7 shrink-0 rounded border border-border bg-background px-1 text-xs disabled:opacity-40"
                      >
                        {MEMBER_ROLES.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Leads can edit the project and change who is involved.
            </p>
          </div>

          <label className="flex items-start gap-2 rounded-md border border-border p-2.5 text-sm">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border"
            />
            <span>
              <span className="flex items-center gap-1.5 font-medium">
                <Lock className="h-3.5 w-3.5" /> Private project
              </span>
              <span className="block text-xs text-muted-foreground">
                Only the people listed above can see it. Everyone else with Projects access
                sees non-private projects.
              </span>
            </span>
          </label>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={isSaving}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Saving…
              </>
            ) : isEdit ? (
              "Save changes"
            ) : (
              "Create project"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
