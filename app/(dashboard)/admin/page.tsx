"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, PageShell, Panel, AlertBanner } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ACCESS_LABELS, ACCESS_LEVELS } from "@/lib/access";
import { MODULE_LIST } from "@/lib/modules";
import type { AccessLevel, ModuleKey } from "@/lib/types";
import { Check, Loader2, Search, ShieldCheck } from "lucide-react";

interface AdminUser {
  id: string;
  name: string;
  email: string | null;
  role: string;
  department: string | null;
  title: string;
  active: boolean;
  template_id: string | null;
}

interface GrantRow {
  user_id: string;
  module_key: string;
  level: AccessLevel;
  expires_at: string | null;
}

interface TemplateRow {
  id: string;
  name: string;
  description: string;
}

interface TemplateModuleRow {
  template_id: string;
  module_key: string;
  level: AccessLevel;
}

type AccessDraft = Record<ModuleKey, AccessLevel>;

const EMPTY_DRAFT = (): AccessDraft =>
  MODULE_LIST.reduce((acc, m) => {
    acc[m.key] = "none";
    return acc;
  }, {} as AccessDraft);

const GROUP_ORDER: Array<{ key: "commercial" | "operations" | "admin"; label: string }> = [
  { key: "commercial", label: "Commercial" },
  { key: "operations", label: "Operations" },
  { key: "admin", label: "Administration" },
];

export default function AdminAccessPage() {
  const { accessToken, currentUser } = useAuth();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [grants, setGrants] = useState<GrantRow[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [templateModules, setTemplateModules] = useState<TemplateModuleRow[]>([]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AccessDraft>(EMPTY_DRAFT);
  const [search, setSearch] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/access", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load access data");
      setUsers(body.users ?? []);
      setGrants(body.grants ?? []);
      setTemplates(body.templates ?? []);
      setTemplateModules(body.templateModules ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load access data");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectableUsers = useMemo(
    () => users.filter((u) => u.role !== "owner"),
    [users]
  );

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return selectableUsers;
    return selectableUsers.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        (u.email ?? "").toLowerCase().includes(q) ||
        (u.department ?? "").toLowerCase().includes(q)
    );
  }, [selectableUsers, search]);

  const selected = useMemo(
    () => users.find((u) => u.id === selectedId) ?? null,
    [users, selectedId]
  );

  /** Grants that come from the user's template rather than a direct tick. */
  const inheritedLevels = useMemo(() => {
    if (!selected?.template_id) return {} as Partial<Record<ModuleKey, AccessLevel>>;
    const map: Partial<Record<ModuleKey, AccessLevel>> = {};
    for (const tm of templateModules) {
      if (tm.template_id === selected.template_id) {
        map[tm.module_key as ModuleKey] = tm.level;
      }
    }
    return map;
  }, [selected, templateModules]);

  const selectUser = useCallback(
    (user: AdminUser) => {
      setSelectedId(user.id);
      setSaved(false);
      const next = EMPTY_DRAFT();
      for (const g of grants) {
        if (g.user_id === user.id) next[g.module_key as ModuleKey] = g.level;
      }
      setDraft(next);
    },
    [grants]
  );

  const setLevel = (moduleKey: ModuleKey, level: AccessLevel) => {
    setDraft((prev) => ({ ...prev, [moduleKey]: level }));
    setSaved(false);
  };

  const toggleModule = (moduleKey: ModuleKey) => {
    setDraft((prev) => ({
      ...prev,
      [moduleKey]: prev[moduleKey] === "none" ? "edit" : "none",
    }));
    setSaved(false);
  };

  const save = async () => {
    if (!selectedId || !accessToken) return;
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/access", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          action: "setAccess",
          userId: selectedId,
          modules: MODULE_LIST.map((m) => ({
            moduleKey: m.key,
            level: draft[m.key],
          })),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to save");
      setSaved(true);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  const applyTemplate = async (templateId: string | null) => {
    if (!selectedId || !accessToken) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/admin/access", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ action: "applyTemplate", userId: selectedId, templateId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to apply template");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply template");
    } finally {
      setIsSaving(false);
    }
  };

  const grantedCount = (userId: string) =>
    grants.filter((g) => g.user_id === userId && g.level !== "none").length;

  return (
    <PageShell>
      <PageHeader
        title="Access Control"
        description="Grant any account access to any module. Changes take effect immediately — no redeploy."
      />

      {error ? <AlertBanner tone="warn">{error}</AlertBanner> : null}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Panel title="Staff" description={`${selectableUsers.length} accounts`} padded={false}>
          <div className="border-b border-border p-3">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, email, department"
                className="pl-8"
              />
            </div>
          </div>

          <div className="max-h-[70vh] divide-y divide-border overflow-auto">
            {isLoading ? (
              <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : filteredUsers.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No matching staff.</p>
            ) : (
              filteredUsers.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => selectUser(user)}
                  className={`flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/60 ${
                    selectedId === user.id ? "bg-muted" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {user.name}
                      {user.active === false ? (
                        <span className="ml-2 text-xs text-muted-foreground">(inactive)</span>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {user.title || user.department || "—"}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                    {grantedCount(user.id)}
                  </span>
                </button>
              ))
            )}
          </div>
        </Panel>

        {selected ? (
          <Panel
            title={`${selected.name} — module access`}
            description={
              selected.template_id
                ? "Ticked boxes are direct grants. Dimmed rows come from the applied template."
                : "Tick a module to grant it, then choose how much they can do."
            }
          >
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Template:</span>
              <select
                value={selected.template_id ?? ""}
                onChange={(e) => void applyTemplate(e.target.value || null)}
                className="h-8 rounded-md border border-border bg-background px-2 text-sm"
              >
                <option value="">No template</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <span className="text-xs text-muted-foreground">
                A template sets a baseline; direct ticks below override it.
              </span>
            </div>

            <div className="space-y-5">
              {GROUP_ORDER.map((group) => {
                const mods = MODULE_LIST.filter((m) => m.group === group.key);
                if (mods.length === 0) return null;
                return (
                  <div key={group.key}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {group.label}
                    </p>
                    <div className="divide-y divide-border rounded-md border border-border">
                      {mods.map((mod) => {
                        const Icon = mod.icon;
                        const level = draft[mod.key];
                        const inherited = inheritedLevels[mod.key];
                        const isOn = level !== "none";
                        const effective = isOn ? level : (inherited ?? "none");
                        return (
                          <div
                            key={mod.key}
                            className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5"
                          >
                            <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                              <span
                                onClick={(e) => {
                                  e.preventDefault();
                                  toggleModule(mod.key);
                                }}
                                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                                  isOn
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-border bg-background"
                                }`}
                                role="checkbox"
                                aria-checked={isOn}
                                tabIndex={0}
                              >
                                {isOn ? <Check className="h-3.5 w-3.5" /> : null}
                              </span>
                              <span className="min-w-0">
                                <span className="flex items-center gap-2 text-sm font-medium">
                                  <Icon className="h-4 w-4 text-primary" />
                                  {mod.label}
                                  {mod.placeholder ? (
                                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                                      coming soon
                                    </span>
                                  ) : null}
                                </span>
                                <span className="block truncate text-xs text-muted-foreground">
                                  {mod.description}
                                </span>
                              </span>
                            </label>

                            <div className="flex items-center gap-2">
                              {!isOn && inherited ? (
                                <span className="text-xs italic text-muted-foreground">
                                  from template: {ACCESS_LABELS[inherited]}
                                </span>
                              ) : null}
                              <select
                                value={level}
                                onChange={(e) =>
                                  setLevel(mod.key, e.target.value as AccessLevel)
                                }
                                className="h-8 rounded-md border border-border bg-background px-2 text-sm disabled:opacity-40"
                                disabled={!isOn}
                              >
                                {ACCESS_LEVELS.filter((l) => l !== "none").map((l) => (
                                  <option key={l} value={l}>
                                    {ACCESS_LABELS[l]}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 flex items-center gap-3">
              <Button
                onClick={() => void save()}
                disabled={isSaving}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
                  </>
                ) : (
                  "Save access"
                )}
              </Button>
              {saved ? (
                <span className="flex items-center gap-1 text-sm text-primary">
                  <Check className="h-4 w-4" /> Saved — active immediately
                </span>
              ) : null}
              {selectedId === currentUser?.id ? (
                <span className="text-xs text-muted-foreground">
                  You are editing your own account.
                </span>
              ) : null}
            </div>
          </Panel>
        ) : (
          <Panel title="Select a staff member">
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <ShieldCheck className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Choose someone on the left to grant or remove module access.
              </p>
              <p className="max-w-md text-xs text-muted-foreground">
                Example: tick <strong>Wireless</strong> on a Finance account and they will see
                the Wireless section the next time their session refreshes — no code change.
              </p>
            </div>
          </Panel>
        )}
      </div>
    </PageShell>
  );
}
