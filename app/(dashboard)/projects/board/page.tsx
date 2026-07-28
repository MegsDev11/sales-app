"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useStaffStore } from "@/lib/store/staff-store";
import { PageHeader, PageShell, AlertBanner } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { STATUS, compact } from "@/components/charts/tokens";
import {
  BOARD_STATUSES,
  statusMeta,
  typeLabel,
  type Project,
  type ProjectMember,
} from "@/lib/projects/constants";
import { Loader2, Lock } from "lucide-react";

/**
 * Status board. Deliberately not drag-and-drop: status changes here are meaningful
 * (an idea being approved, a project going live), so they happen through the
 * project's own status control where the permission check lives, rather than a
 * drag that silently fails for anyone without edit rights.
 */
export default function ProjectBoardPage() {
  const { accessToken, currentUser } = useAuth();
  const { users } = useStaffStore();

  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mineOnly, setMineOnly] = useState(false);

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

  const myIds = useMemo(
    () => new Set(members.filter((m) => m.user_id === currentUser?.id).map((m) => m.project_id)),
    [members, currentUser]
  );

  const visible = mineOnly
    ? projects.filter((p) => myIds.has(p.id) || p.owner_id === currentUser?.id)
    : projects;

  return (
    <PageShell dense>
      <PageHeader
        title="Project board"
        description="Everything by stage"
        actions={
          <div className="flex gap-2">
            <Button
              variant={mineOnly ? "default" : "outline"}
              onClick={() => setMineOnly((v) => !v)}
              className={mineOnly ? "bg-primary text-primary-foreground" : ""}
            >
              My projects
            </Button>
            <Link href="/projects">
              <Button variant="outline">List view</Button>
            </Link>
          </div>
        }
      />

      {error ? <AlertBanner tone="danger">{error}</AlertBanner> : null}
      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </p>
      ) : null}

      <div className="flex gap-3 overflow-x-auto pb-4">
        {BOARD_STATUSES.map((status) => {
          const meta = statusMeta(status);
          const column = visible.filter((p) => p.status === status);
          return (
            <div key={status} className="flex w-[264px] shrink-0 flex-col">
              <div className="mb-2 flex items-center gap-2 px-1">
                <span
                  aria-hidden
                  className="h-2 w-2 rounded-full"
                  style={{ background: meta.color }}
                />
                <h2 className="text-sm font-medium">{meta.label}</h2>
                <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                  {column.length}
                </span>
              </div>

              <div className="flex-1 space-y-2 rounded-lg bg-muted/40 p-2">
                {column.length === 0 ? (
                  <p className="px-1 py-4 text-center text-xs text-muted-foreground">Empty</p>
                ) : (
                  column.map((p) => {
                    const owner = users.find((u) => u.id === p.owner_id);
                    const overBudget =
                      p.budget_amount != null &&
                      Number(p.actual_cost) > Number(p.budget_amount);
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
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="truncate text-[11px] text-muted-foreground">
                            {owner?.name ?? "No owner"}
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
                        {p.target_date ? (
                          <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                            Target{" "}
                            {new Date(p.target_date).toLocaleDateString("en-ZA", {
                              day: "numeric",
                              month: "short",
                            })}
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
    </PageShell>
  );
}
