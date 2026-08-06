"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader, PageShell, Panel, AlertBanner } from "@/components/layout/page-shell";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { Loader2 } from "lucide-react";

/**
 * Who changed whose access, and when.
 *
 * The trail has been recorded by database triggers since migration 044 and
 * has never had a reader — the answer existed but only in SQL. Read-only on
 * purpose: a log the app can edit is not evidence of anything.
 */

interface Change {
  field: string;
  before: string | null;
  after: string | null;
}

interface AuditEntry {
  id: number;
  at: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorName: string | null;
  subjectName: string | null;
  changes: Change[];
}

const ENTITY_LABELS: Record<string, string> = {
  team_members: "Staff",
  user_module_access: "Module access",
  department_module_access: "Department access",
  access_template_modules: "Template modules",
  access_templates: "Templates",
  modules: "Modules",
  departments: "Departments",
};

const ACTION_TONE: Record<string, string> = {
  INSERT: "bg-emerald-100 text-emerald-800",
  UPDATE: "bg-sky-100 text-sky-800",
  DELETE: "bg-red-100 text-red-800",
};

const ACTION_VERB: Record<string, string> = {
  INSERT: "granted",
  UPDATE: "changed",
  DELETE: "removed",
};

const when = (value: string) =>
  new Date(value).toLocaleString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function AdminAuditPage() {
  const { accessToken } = useAuth();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [entityTypes, setEntityTypes] = useState<string[]>([]);
  const [entityType, setEntityType] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (entityType !== "all") params.set("entityType", entityType);
      const res = await fetch(`/api/admin/audit?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load the audit trail");
      setEntries(json.entries ?? []);
      // Keep the full option list even after filtering down to one type.
      if (entityType === "all") setEntityTypes(json.entityTypes ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the audit trail");
    } finally {
      setLoading(false);
    }
  }, [accessToken, entityType]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PageShell>
      <PageHeader
        title="Audit trail"
        description="Every change to staff, access grants, templates and departments — recorded by the database itself, and not editable from here."
        actions={
          <div className="flex items-center gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
            <SelectField
              className="w-52"
              value={entityType}
              onValueChange={setEntityType}
              options={[
                { value: "all", label: "Everything" },
                ...entityTypes.map((t) => ({
                  value: t,
                  label: ENTITY_LABELS[t] ?? t,
                })),
              ]}
            />
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Refresh
            </Button>
          </div>
        }
      />

      <AdminTabs />

      {error ? <AlertBanner tone="danger">{error}</AlertBanner> : null}

      <Panel padded={false} title={`${entries.length} recent changes`}>
        {entries.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            {loading
              ? "Loading…"
              : "Nothing recorded yet. Changes to access appear here as they happen."}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {entries.map((e) => (
              <li key={e.id} className="px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                      ACTION_TONE[e.action] ?? "bg-muted text-muted-foreground"
                    }`}
                  >
                    {ENTITY_LABELS[e.entityType] ?? e.entityType}
                  </span>
                  <span>
                    <span className="font-medium">{e.actorName ?? "Someone"}</span>{" "}
                    {ACTION_VERB[e.action] ?? e.action.toLowerCase()}
                    {e.subjectName ? (
                      <>
                        {" "}
                        <span className="font-medium">{e.subjectName}</span>
                        {e.entityType !== "team_members" ? "’s access" : ""}
                      </>
                    ) : e.entityId ? (
                      <span className="text-muted-foreground"> {e.entityId}</span>
                    ) : null}
                  </span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {when(e.at)}
                  </span>
                </div>

                {e.changes.length > 0 ? (
                  <ul className="mt-1.5 space-y-0.5">
                    {e.changes.map((c) => (
                      <li key={c.field} className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{c.field}</span>
                        {": "}
                        <span className="line-through">{c.before ?? "—"}</span>
                        {" → "}
                        <span className="text-foreground">{c.after ?? "—"}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </PageShell>
  );
}
