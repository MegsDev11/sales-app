"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, PageShell, Panel, AlertBanner } from "@/components/layout/page-shell";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { StaffAccountDialog } from "@/components/admin/staff-account-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ACCESS_LABELS, ACCESS_LEVELS } from "@/lib/access";
import { MODULE_LIST } from "@/lib/modules";
import type { AccessLevel, ModuleKey } from "@/lib/types";
import {
  Check,
  Copy,
  KeyRound,
  Loader2,
  Search,
  ShieldCheck,
  UserPlus,
} from "lucide-react";

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
  const { accessToken, currentUser, canCreateAccounts } = useAuth();

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
  const [notice, setNotice] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [pwUser, setPwUser] = useState<AdminUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwIssued, setPwIssued] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

  async function postAccess(payload: Record<string, unknown>) {
    if (!accessToken) throw new Error("Not signed in");
    const res = await fetch("/api/admin/access", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? "Request failed");
    return body;
  }

  const save = async () => {
    if (!selectedId) return;
    setIsSaving(true);
    setError(null);
    try {
      await postAccess({
        action: "setAccess",
        userId: selectedId,
        modules: MODULE_LIST.map((m) => ({ moduleKey: m.key, level: draft[m.key] })),
      });
      setSaved(true);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  const applyTemplate = async (templateId: string | null) => {
    if (!selectedId) return;
    setIsSaving(true);
    try {
      await postAccess({ action: "applyTemplate", userId: selectedId, templateId });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply template");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleActive = async (user: AdminUser) => {
    setIsSaving(true);
    try {
      await postAccess({ action: "setActive", userId: user.id, active: !user.active });
      setNotice(
        user.active
          ? `${user.name} deactivated — they can no longer sign in.`
          : `${user.name} reactivated.`
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update account");
    } finally {
      setIsSaving(false);
    }
  };

  async function setPassword() {
    if (!pwUser || !accessToken) return;
    if (newPassword.length < 8) {
      setPwError("Password must be at least 8 characters");
      return;
    }
    setIsSaving(true);
    setPwError("");
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          action: "setPassword",
          userId: pwUser.id,
          password: newPassword,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not update password");
      setPwIssued(newPassword);
      setNewPassword("");
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "Could not update password");
    } finally {
      setIsSaving(false);
    }
  }

  const grantedCount = (userId: string) =>
    grants.filter((g) => g.user_id === userId && g.level !== "none").length;

  return (
    <PageShell>
      <PageHeader
        title="Administration"
        description="Staff accounts and what each of them can reach. Changes take effect immediately — no redeploy."
        actions={
          canCreateAccounts ? (
            <Button
              onClick={() => setCreateOpen(true)}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <UserPlus className="mr-1.5 h-4 w-4" /> New staff account
            </Button>
          ) : undefined
        }
      />

      <AdminTabs />

      {error ? <AlertBanner tone="danger">{error}</AlertBanner> : null}
      {notice ? (
        <div className="flex items-start justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="shrink-0 text-emerald-500 hover:text-emerald-700"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      ) : null}

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
              <div className="p-6 text-center">
                <UserPlus className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {selectableUsers.length === 0
                    ? "No staff accounts yet."
                    : "No staff match that search."}
                </p>
                {canCreateAccounts && selectableUsers.length === 0 ? (
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => setCreateOpen(true)}>
                    Create the first account
                  </Button>
                ) : null}
              </div>
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
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPwUser(selected);
                    setNewPassword("");
                    setPwError("");
                    setPwIssued(null);
                  }}
                >
                  <KeyRound className="mr-1 h-3.5 w-3.5" /> Set password
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isSaving}
                  onClick={() => void toggleActive(selected)}
                >
                  {selected.active ? "Deactivate" : "Reactivate"}
                </Button>
              </div>
            }
          >
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Template:</span>
              <select
                value={selected.template_id ?? ""}
                onChange={(e) => void applyTemplate(e.target.value || null)}
                className="h-8 rounded-md border border-border bg-background px-2 text-sm"
                aria-label="Role template"
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
                                onKeyDown={(e) => {
                                  if (e.key === " " || e.key === "Enter") {
                                    e.preventDefault();
                                    toggleModule(mod.key);
                                  }
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
                                aria-label={`${mod.label} access level`}
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

            <div className="mt-5 flex flex-wrap items-center gap-3">
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
                <span className="flex items-center gap-1 text-sm text-emerald-600">
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
                Creating an account here sets their login <em>and</em> their access in one
                step — no need to visit a second page.
              </p>
              {canCreateAccounts ? (
                <Button variant="outline" size="sm" className="mt-2" onClick={() => setCreateOpen(true)}>
                  <UserPlus className="mr-1.5 h-4 w-4" /> New staff account
                </Button>
              ) : null}
            </div>
          </Panel>
        )}
      </div>

      <StaffAccountDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        accessToken={accessToken ?? ""}
        templates={templates}
        templateModules={templateModules}
        onCreated={(name) => {
          setNotice(`${name} created — the account and its access are active now.`);
          void load();
        }}
      />

      {/* Set password */}
      <Dialog
        open={!!pwUser}
        onOpenChange={(open) => {
          if (!open) {
            setPwUser(null);
            setPwIssued(null);
            setNewPassword("");
            setPwError("");
          }
        }}
      >
        <DialogContent className="bg-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Set password{pwUser ? ` — ${pwUser.name}` : ""}</DialogTitle>
          </DialogHeader>
          {pwIssued ? (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                Password updated. It is shown once and never stored — copy it now.
              </p>
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
                <code className="flex-1 break-all font-mono text-sm">{pwIssued}</code>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Copy password"
                  onClick={() => {
                    void navigator.clipboard.writeText(pwIssued);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <p className="text-xs text-muted-foreground">
                This updates their login immediately and is shown once — it is not stored in
                readable form.
              </p>
              <div className="space-y-1">
                <label className="font-medium">New password</label>
                <Input
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  autoComplete="new-password"
                />
              </div>
              {pwError ? <p className="text-sm text-destructive">{pwError}</p> : null}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwUser(null)}>
              {pwIssued ? "Done" : "Cancel"}
            </Button>
            {!pwIssued ? (
              <Button
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={isSaving}
                onClick={() => void setPassword()}
              >
                Save password
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
