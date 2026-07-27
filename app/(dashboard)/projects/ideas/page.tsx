"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useStaffStore } from "@/lib/store/staff-store";
import { PageHeader, PageShell, Panel, AlertBanner } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { FunnelChart } from "@/components/charts/funnel-chart";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import { IDEA_STATUSES, statusMeta, type Project } from "@/lib/projects/constants";
import { Lightbulb, Loader2, Plus } from "lucide-react";

/**
 * Idea funnel.
 *
 * Business ideas are the same entity as projects, on a lighter pipeline:
 * idea -> evaluating -> approved. An approved idea simply becomes an active project,
 * so nothing is retyped and the history stays attached.
 */
export default function IdeasPage() {
  const { accessToken, currentUser, can } = useAuth();
  const { users } = useStaffStore();

  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const canEdit = can("projects", "edit");

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/projects", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load ideas");
      setProjects(body.projects ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ideas");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const advance = async (id: string, status: string) => {
    setBusy(id);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setBusy(null);
    }
  };

  const inFunnel = useMemo(
    () => projects.filter((p) => IDEA_STATUSES.includes(p.status as never)),
    [projects]
  );

  const stages = useMemo(
    () =>
      IDEA_STATUSES.map((s) => ({
        label: statusMeta(s).label,
        count: inFunnel.filter((p) => p.status === s).length,
      })),
    [inFunnel]
  );

  const nextStatus: Record<string, string> = {
    idea: "evaluating",
    evaluating: "approved",
    approved: "active",
  };
  const nextLabel: Record<string, string> = {
    idea: "Start evaluating",
    evaluating: "Approve",
    approved: "Make it active",
  };

  return (
    <PageShell>
      <PageHeader
        title="Idea funnel"
        description="Business ideas on their way to becoming real projects"
        actions={
          <div className="flex gap-2">
            <Link href="/projects">
              <Button variant="outline">All projects</Button>
            </Link>
            {canEdit ? (
              <Button
                onClick={() => setDialogOpen(true)}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="mr-1.5 h-4 w-4" /> New idea
              </Button>
            ) : null}
          </div>
        }
      />

      {error ? <AlertBanner tone="danger">{error}</AlertBanner> : null}
      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </p>
      ) : null}

      {inFunnel.length > 0 ? (
        <FunnelChart
          title="Idea pipeline"
          subtitle="How many ideas sit at each stage"
          stages={stages}
          currency={false}
        />
      ) : null}

      {IDEA_STATUSES.map((status) => {
        const meta = statusMeta(status);
        const list = inFunnel.filter((p) => p.status === status);
        return (
          <Panel
            key={status}
            title={meta.label}
            description={`${list.length} ${list.length === 1 ? "idea" : "ideas"}`}
            padded={false}
          >
            {list.length === 0 ? (
              <div className="py-6 text-center">
                <Lightbulb className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Nothing at this stage.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {list.map((p) => {
                  const owner = users.find((u) => u.id === p.owner_id);
                  return (
                    <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/projects/${p.id}`}
                          className="truncate font-medium hover:underline"
                        >
                          {p.name}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">
                          {p.description || "No description"}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {p.code} · {owner?.name ?? "No owner"}
                        </p>
                      </div>
                      {canEdit && nextStatus[status] ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy === p.id}
                          onClick={() => void advance(p.id, nextStatus[status])}
                        >
                          {busy === p.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            nextLabel[status]
                          )}
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        );
      })}

      {dialogOpen ? (
        <ProjectFormDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onSaved={() => {
            setDialogOpen(false);
            void load();
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
