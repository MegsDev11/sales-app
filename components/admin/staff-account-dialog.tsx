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
import { Field } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select-field";
import { cn } from "@/lib/utils";
import { ACCESS_LABELS, ACCESS_LEVEL_OPTIONS } from "@/lib/access";
import { useDepartments } from "@/lib/hooks/use-departments";
import { MODULE_LIST } from "@/lib/modules";
import { getDefaultTitle } from "@/lib/permissions";
import type { AccessLevel, Department, ModuleKey, UserRole } from "@/lib/types";
import { Check, Loader2, ShieldCheck, UserPlus } from "lucide-react";

const REP_COLORS = [
  "#3B82F6", "#22C55E", "#F97316", "#A855F7",
  "#14B8A6", "#EC4899", "#EAB308", "#6366F1",
];

/**
 * Owner is not offered. There is one owner account and it is not created from this
 * screen — promoting somebody to it is a deliberate act elsewhere, not a dropdown.
 *
 * The two company-wide positions (migration 070) are offered, because the screen
 * is owner-only anyway. A general manager runs the company's operations; the
 * financial manager owns the books and is, deliberately, the one person a
 * general manager cannot administer.
 */
const ROLE_OPTIONS = [
  { value: "staff", label: "Staff member" },
  { value: "manager", label: "Department manager" },
  { value: "general_manager", label: "General manager (company-wide)" },
  { value: "financial_manager", label: "Financial manager (the books)" },
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
  // Only fetched while the dialog is open — /admin already lists departments on its
  // own tab, and this is a second reader of the same table.
  const { departments: departmentOptions } = useDepartments(accessToken, open);

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
            <Field label="Full name" htmlFor="staff-name">
              <Input
                id="staff-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Wine Petzer"
              />
            </Field>
            <Field label="Job title" htmlFor="staff-title">
              <Input
                id="staff-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={getDefaultTitle(role, department)}
              />
            </Field>
            <Field label="Department" htmlFor="staff-department">
              <SelectField
                id="staff-department"
                className="w-full"
                aria-label="Department"
                value={department}
                onValueChange={(v) => setDepartment(v as Department)}
                options={departmentOptions.map((d) => ({ value: d.key, label: d.label }))}
              />
            </Field>
            <Field label="Role" htmlFor="staff-role">
              <SelectField
                id="staff-role"
                className="w-full"
                aria-label="Role"
                value={role}
                onValueChange={(v) => setRole(v as UserRole)}
                options={ROLE_OPTIONS}
              />
            </Field>
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
            <Field label="Email" htmlFor="staff-email">
              <Input
                id="staff-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="staff@megswb.co.za"
                autoComplete="off"
              />
            </Field>
            <Field label="Initial password" htmlFor="staff-password">
              <Input
                id="staff-password"
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 8 characters"
                autoComplete="new-password"
              />
            </Field>
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
            <SelectField
              aria-label="Role template"
              value={templateId}
              onValueChange={setTemplateId}
              options={[
                { value: "", label: "No template" },
                ...templates.map((t) => ({ value: t.id, label: t.name })),
              ]}
            />
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
                            <SelectField
                              value={level}
                              onValueChange={(v) =>
                                setDraft((p) => ({ ...p, [mod.key]: v as AccessLevel }))
                              }
                              disabled={!isOn}
                              aria-label={`${mod.label} access level`}
                              options={ACCESS_LEVEL_OPTIONS}
                            />
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
