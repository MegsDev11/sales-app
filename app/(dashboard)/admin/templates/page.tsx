"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, PageShell, Panel, AlertBanner } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ACCESS_LABELS, ACCESS_LEVELS } from "@/lib/access";
import { MODULE_LIST } from "@/lib/modules";
import type { AccessLevel, ModuleKey } from "@/lib/types";
import { Check, Loader2, Plus, Trash2, Users } from "lucide-react";

interface TemplateRow {
  id: string;
  name: string;
  description: string;
  userCount: number;
}
interface TemplateModuleRow {
  template_id: string;
  module_key: string;
  level: AccessLevel;
}

type Draft = Record<ModuleKey, AccessLevel>;
const EMPTY_DRAFT = (): Draft =>
  MODULE_LIST.reduce((acc, m) => {
    acc[m.key] = "none";
    return acc;
  }, {} as Draft);

const GROUP_ORDER: Array<{ key: "commercial" | "operations" | "admin"; label: string }> = [
  { key: "commercial", label: "Commercial" },
  { key: "operations", label: "Operations" },
  { key: "admin", label: "Administration" },
];

export default function AdminTemplatesPage() {
  const { accessToken } = useAuth();
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [templateModules, setTemplateModules] = useState<TemplateModuleRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/templates", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load templates");
      setTemplates(body.templates ?? []);
      setTemplateModules(body.templateModules ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load templates");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectTemplate = useCallback(
    (t: TemplateRow) => {
      setSelectedId(t.id);
      setName(t.name);
      setDescription(t.description);
      setSaved(false);
      const next = EMPTY_DRAFT();
      for (const tm of templateModules) {
        if (tm.template_id === t.id) next[tm.module_key as ModuleKey] = tm.level;
      }
      setDraft(next);
    },
    [templateModules]
  );

  const selected = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? null,
    [templates, selectedId]
  );

  const moduleCount = useCallback(
    (id: string) => templateModules.filter((tm) => tm.template_id === id).length,
    [templateModules]
  );

  async function post(payload: Record<string, unknown>) {
    if (!accessToken) throw new Error("Not signed in");
    const res = await fetch("/api/admin/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? "Request failed");
    return body as { ok: boolean; id?: string };
  }

  async function createTemplate() {
    setIsSaving(true);
    setError(null);
    try {
      const res = await post({ action: "create", name: "New template", description: "" });
      await load();
      if (res.id) {
        setSelectedId(res.id);
        setName("New template");
        setDescription("");
        setDraft(EMPTY_DRAFT());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create template");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveTemplate() {
    if (!selectedId) return;
    if (!name.trim()) return setError("Give the template a name");
    setIsSaving(true);
    setError(null);
    try {
      await post({ action: "update", id: selectedId, name, description });
      await post({
        action: "setModules",
        id: selectedId,
        modules: MODULE_LIST.map((m) => ({ moduleKey: m.key, level: draft[m.key] })),
      });
      setSaved(true);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save template");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteTemplate() {
    if (!selectedId) return;
    if (!window.confirm("Delete this template? Users on it will keep their current access but lose the template link.")) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await post({ action: "delete", id: selectedId });
      setSelectedId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete template");
    } finally {
      setIsSaving(false);
    }
  }

  const toggleModule = (key: ModuleKey) => {
    setDraft((prev) => ({ ...prev, [key]: prev[key] === "none" ? "edit" : "none" }));
    setSaved(false);
  };
  const setLevel = (key: ModuleKey, level: AccessLevel) => {
    setDraft((prev) => ({ ...prev, [key]: level }));
    setSaved(false);
  };

  return (
    <PageShell>
      <PageHeader
        title="Role Templates"
        description="Reusable bundles of module access. Apply a template to a staff account in one click from Access Control."
        actions={
          <Button
            onClick={() => void createTemplate()}
            disabled={isSaving}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="mr-1.5 h-4 w-4" /> New template
          </Button>
        }
      />

      {error ? <AlertBanner tone="danger">{error}</AlertBanner> : null}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Panel title="Templates" description={`${templates.length} defined`} padded={false}>
          <div className="max-h-[70vh] divide-y divide-border overflow-auto">
            {isLoading ? (
              <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : templates.length === 0 ? (
              <div className="p-6 text-center">
                <Users className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No templates yet.</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => void createTemplate()}>
                  Create the first one
                </Button>
              </div>
            ) : (
              templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => selectTemplate(t)}
                  className={`flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/60 ${
                    selectedId === t.id ? "bg-muted" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{t.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {moduleCount(t.id)} module{moduleCount(t.id) === 1 ? "" : "s"} ·{" "}
                      {t.userCount} user{t.userCount === 1 ? "" : "s"}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </Panel>

        {selected ? (
          <Panel title="Edit template">
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Name</label>
                  <Input value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Description
                  </label>
                  <Input
                    value={description}
                    onChange={(e) => { setDescription(e.target.value); setSaved(false); }}
                    placeholder="Who is this for?"
                  />
                </div>
              </div>

              <div className="space-y-5 pt-1">
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
                                  </span>
                                  <span className="block truncate text-xs text-muted-foreground">
                                    {mod.description}
                                  </span>
                                </span>
                              </label>
                              <select
                                value={level}
                                onChange={(e) => setLevel(mod.key, e.target.value as AccessLevel)}
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
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Button
                  onClick={() => void saveTemplate()}
                  disabled={isSaving}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save template
                </Button>
                {saved ? (
                  <span className="flex items-center gap-1 text-sm text-emerald-600">
                    <Check className="h-4 w-4" /> Saved
                  </span>
                ) : null}
                <Button
                  variant="ghost"
                  onClick={() => void deleteTemplate()}
                  disabled={isSaving}
                  className="ml-auto text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="mr-1 h-4 w-4" /> Delete
                </Button>
              </div>
              {selected.userCount > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Applied to {selected.userCount} account{selected.userCount === 1 ? "" : "s"}. Saving
                  updates the baseline for all of them.
                </p>
              ) : null}
            </div>
          </Panel>
        ) : (
          <Panel title="Select a template">
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Users className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Choose a template to edit, or create a new one.
              </p>
              <p className="max-w-md text-xs text-muted-foreground">
                Templates set a baseline of module access — e.g. a &ldquo;Field Technician&rdquo;
                template that grants Coordination and Stock. Direct grants on Access Control still
                override a template per user.
              </p>
            </div>
          </Panel>
        )}
      </div>
    </PageShell>
  );
}
