"use client";

import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ACCESS_LABELS, ACCESS_LEVELS } from "@/lib/access";
import { MODULE_LIST } from "@/lib/modules";
import { getDefaultTitle } from "@/lib/permissions";
import type { AccessLevel, Department, ModuleKey, UserRole } from "@/lib/types";
import { Check, Loader2, ShieldCheck, UserPlus } from "lucide-react";

const REP_COLORS = [
  "#3B82F6", "#22C55E", "#F97316", "#A855F7",
  "#14B8A6", "#EC4899", "#EAB308", "#6366F1",
];

const DEPARTMENTS: Department[] = [
  "sales", "support", "stock", "coordination", "wireless",
  "fiber", "financial", "general", "accounts", "reception",
];

const GROUP_ORDER: Array<{ key: "commercial" | "operations" | "admin"; label: string }> = [
  { key: "commercial", label: "Commercial" },
  { key: "operations", label: "Operations" },
  { key: "admin", label: "Administration" },
];

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

type Draft = Record<ModuleKey, AccessLevel>;
const EMPTY_DRAFT = (): Draft =>
  MODULE_LIST.reduce((acc, m) => {
    acc[m.key] = "none";
    return acc;
  }, {} as Draft);

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

/**
 * Create a staff account AND grant its module access in one step.
 *
 * Previously this took two screens: create the login on Staff Accounts, then find
 * the person again on Access Control to tick modules. /api/users already accepted
 * `templateId` and `modules` on create — it was just never surfaced — so the whole
 * thing is a single request.
 */
export function StaffAccountDialog({
  open,
  onOpenChange,
  onCreated,
  accessToken,
  templates,
  templateModules,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (name: string) => void;
  accessToken: string;
  templates: TemplateRow[];
  templateModules: TemplateModuleRow[];
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("staff");
  const [department, setDepartment] = useState<Department>("sales");
  const [title, setTitle] = useState("");
  const [color, setColor] = useState(REP_COLORS[0]);
  const [templateId, setTemplateId] = useState("");
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Levels the chosen template would grant — shown as the baseline. */
  const inherited = useMemo(() => {
    const map: Partial<Record<ModuleKey, AccessLevel>> = {};
    if (!templateId) return map;
    for (const tm of templateModules) {
      if (tm.template_id === templateId) map[tm.module_key as ModuleKey] = tm.level;
    }
    return map;
  }, [templateId, templateModules]);

  const grantedCount = MODULE_LIST.filter(
    (m) => draft[m.key] !== "none" || inherited[m.key]
  ).length;

  function reset() {
    setName("");
    setEmail("");
    setPassword("");
    setRole("staff");
    setDepartment("sales");
    setTitle("");
    setColor(REP_COLORS[0]);
    setTemplateId("");
    setDraft(EMPTY_DRAFT());
    setError(null);
  }

  const toggleModule = (key: ModuleKey) =>
    setDraft((prev) => ({ ...prev, [key]: prev[key] === "none" ? "edit" : "none" }));

  async function submit() {
    if (!name.trim()) return setError("Enter the staff member's name");
    if (!email.trim()) return setError("Email is required — it is their login");
    if (password.length < 8) return setError("Password must be at least 8 characters");

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          role,
          department,
          color,
          avatarInitials: initialsFromName(name),
          title: title.trim() || getDefaultTitle(role, department),
          monthlyRevenueTarget: department === "sales" ? 100000 : 0,
          monthlyDealsTarget: department === "sales" ? 6 : 0,
          templateId: templateId || null,
          // Only direct ticks are sent; the template supplies the rest server-side.
          modules: MODULE_LIST.filter((m) => draft[m.key] !== "none").map((m) => ({
            moduleKey: m.key,
            level: draft[m.key],
          })),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to create account");
      const created = name.trim();
      reset();
      onOpenChange(false);
      onCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create account");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto bg-white sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" /> New staff account
          </DialogTitle>
        </DialogHeader>
        <p className="-mt-1 text-xs text-muted-foreground">
          Account, login and module access in one step — they can sign in and use their
          sections immediately.
        </p>

        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {/* 1. Person */}
        <section className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            1 · Person
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Full name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Wine Petzer" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Job title</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={getDefaultTitle(role, department)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Department</label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value as Department)}
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm capitalize"
                aria-label="Department"
              >
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d} className="capitalize">
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                aria-label="Role"
              >
                <option value="staff">Staff member</option>
                <option value="manager">Department manager</option>
              </select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Colour</label>
              <div className="flex flex-wrap gap-2">
                {REP_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    style={{ backgroundColor: c }}
                    aria-label={`Colour ${c}`}
                    className={cn(
                      "h-7 w-7 rounded-full ring-2 ring-offset-2 transition-transform hover:scale-110",
                      color === c ? "ring-foreground" : "ring-transparent"
                    )}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 2. Login */}
        <section className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            2 · Login
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="staff@megswb.co.za"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Initial password
              </label>
              <Input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 8 characters"
                autoComplete="new-password"
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Passwords are not stored in readable form — note this one now and share it securely.
          </p>
        </section>

        {/* 3. Access */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              3 · Access
            </p>
            <span className="text-xs text-muted-foreground">
              {grantedCount} module{grantedCount === 1 ? "" : "s"} granted
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-medium text-muted-foreground">Start from template</label>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
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
          </div>

          <div className="space-y-4">
            {GROUP_ORDER.map((group) => {
              const mods = MODULE_LIST.filter((m) => m.group === group.key);
              if (mods.length === 0) return null;
              return (
                <div key={group.key}>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.label}
                  </p>
                  <div className="divide-y divide-border rounded-md border border-border">
                    {mods.map((mod) => {
                      const Icon = mod.icon;
                      const level = draft[mod.key];
                      const isOn = level !== "none";
                      const fromTemplate = inherited[mod.key];
                      return (
                        <div
                          key={mod.key}
                          className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                        >
                          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
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
                              role="checkbox"
                              aria-checked={isOn}
                              tabIndex={0}
                              className={cn(
                                "flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors",
                                isOn
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border bg-background"
                              )}
                            >
                              {isOn ? <Check className="h-3.5 w-3.5" /> : null}
                            </span>
                            <span className="flex min-w-0 items-center gap-2 text-sm">
                              <Icon className="h-4 w-4 shrink-0 text-primary" />
                              <span className="truncate font-medium">{mod.label}</span>
                            </span>
                          </label>
                          <div className="flex items-center gap-2">
                            {!isOn && fromTemplate ? (
                              <span className="text-[11px] italic text-muted-foreground">
                                template: {ACCESS_LABELS[fromTemplate]}
                              </span>
                            ) : null}
                            <select
                              value={level}
                              onChange={(e) =>
                                setDraft((p) => ({
                                  ...p,
                                  [mod.key]: e.target.value as AccessLevel,
                                }))
                              }
                              disabled={!isOn}
                              aria-label={`${mod.label} access level`}
                              className="h-8 rounded-md border border-border bg-background px-2 text-sm disabled:opacity-40"
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

          {grantedCount === 0 ? (
            <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              No modules granted yet — they will be able to sign in but will not see any
              sections. Tick at least one, or pick a template.
            </p>
          ) : null}
        </section>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => void submit()}
            disabled={busy}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Create account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
