"use client";

import { useCallback, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, PageShell, Panel, AlertBanner } from "@/components/layout/page-shell";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MODULE_LIST, MODULES } from "@/lib/modules";
import { useSections } from "@/lib/nav/sections-context";
import { isDefaultSection, sectionsByOwner, type SectionDef } from "@/lib/nav/sections";
import type { ModuleKey } from "@/lib/types";
import { Check, Loader2, RotateCcw } from "lucide-react";

/**
 * Administration → Sections.
 *
 * Same shape as Staff & Access next door — pick something on the left, tick what
 * it gets on the right — because "decide what this department sees" is the same
 * mental action as "decide what this person can open", and it should not look
 * like a different feature.
 *
 * What a tick means depends on where the section came from. A department's OWN
 * pages are on by default and unticking one only hides it from the sidebar; the
 * URL still works, so a link somebody was already sent does not dead-end. A page
 * BORROWED from another department is off by default, and ticking it also grants
 * that department's staff the owning module at view — otherwise the link would
 * appear and then refuse everyone who clicked it, since the route guard, the API
 * routes and RLS all key on the module that owns the URL, not on where the link
 * happens to sit.
 */

/**
 * Administration and AI Agents are left out: both are one sidebar entry whose
 * sections are in-page tabs, so there is no sidebar list to arrange. Everything
 * else is fair game, including the single-page departments — borrowing INTO them
 * is exactly the case this screen exists for.
 */
const ARRANGEABLE = MODULE_LIST.filter((m) => m.key !== "admin" && m.key !== "ai");

export default function AdminSectionsPage() {
  const { accessToken } = useAuth();
  const { overrides, reload, isLoaded } = useSections();

  const [selectedKey, setSelectedKey] = useState<ModuleKey>("coordination");
  const [busyHref, setBusyHref] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selected = MODULES[selectedKey];

  const post = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!accessToken) throw new Error("Not signed in");
      const res = await fetch("/api/admin/sections", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Request failed");
      return body as { granted: string[] };
    },
    [accessToken]
  );

  /** What this department shows right now, resolved the same way the sidebar does. */
  const shown = useMemo(() => {
    const mine = overrides.filter((o) => o.moduleKey === selectedKey);
    const state = new Map<string, boolean>();
    for (const o of mine) state.set(o.href, o.enabled);
    return (href: string) => state.get(href) ?? isDefaultSection(selectedKey, href);
  }, [overrides, selectedKey]);

  const groups = useMemo(() => sectionsByOwner(), []);

  const shownCount = useMemo(
    () =>
      groups.reduce(
        (n, g) => n + g.sections.filter((s) => shown(s.href)).length,
        0
      ),
    [groups, shown]
  );

  const borrowedCount = useMemo(
    () =>
      groups.reduce(
        (n, g) =>
          n +
          g.sections.filter((s) => s.ownerKey !== selectedKey && shown(s.href)).length,
        0
      ),
    [groups, shown, selectedKey]
  );

  const customised = overrides.some((o) => o.moduleKey === selectedKey);

  async function toggle(section: SectionDef) {
    const on = shown(section.href);
    setBusyHref(section.href);
    setError(null);
    setNotice(null);
    try {
      const body = await post({
        action: on ? "remove" : "add",
        moduleKey: selectedKey,
        href: section.href,
      });
      await reload();
      if (!on && body.granted?.length) {
        setNotice(
          `${section.label} added to ${selected.label}. ` +
            `${body.granted.length} ${body.granted.length === 1 ? "person was" : "people were"} ` +
            `given ${section.ownerLabel} · View only so the page opens for them: ${body.granted.join(", ")}.`
        );
      } else if (!on) {
        setNotice(`${section.label} added to ${selected.label}.`);
      } else {
        setNotice(
          `${section.label} hidden from ${selected.label}'s sidebar. The page itself still opens for anyone who has the grant.`
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusyHref(null);
    }
  }

  async function resetDepartment() {
    setBusyHref("__reset__");
    setError(null);
    setNotice(null);
    try {
      await post({ action: "reset", moduleKey: selectedKey });
      await reload();
      setNotice(`${selected.label} is back to its built-in sections.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reset");
    } finally {
      setBusyHref(null);
    }
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="System"
        title="Sections"
        description="What each department sees in its sidebar. Borrowing a page from another department also gives that department's staff the access to open it."
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

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Panel title="Departments" padded={false} className="overflow-hidden">
          <div className="max-h-[70vh] divide-y divide-border overflow-auto">
            {ARRANGEABLE.map((mod) => {
              const Icon = mod.icon;
              const active = mod.key === selectedKey;
              const edited = overrides.some((o) => o.moduleKey === mod.key);
              return (
                <button
                  key={mod.key}
                  type="button"
                  onClick={() => setSelectedKey(mod.key)}
                  className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-colors ${
                    active ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate font-medium">{mod.label}</span>
                  {edited ? (
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      edited
                    </Badge>
                  ) : null}
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel
          title={`${selected.label} sidebar`}
          description={`${shownCount} section${shownCount === 1 ? "" : "s"}${
            borrowedCount ? ` · ${borrowedCount} borrowed` : ""
          }`}
          actions={
            customised ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void resetDepartment()}
                disabled={busyHref !== null}
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Reset to defaults
              </Button>
            ) : null
          }
          padded={false}
        >
          {!isLoaded ? (
            <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (
            <div className="space-y-4 p-4">
              {groups.map((group) => {
                const own = group.module.key === selectedKey;
                return (
                  <div key={group.module.key}>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {own ? `${group.module.label} — its own pages` : group.module.label}
                    </p>
                    <div className="divide-y divide-border rounded-md border border-border">
                      {group.sections.map((section) => {
                        const on = shown(section.href);
                        const Icon = section.icon;
                        const busy = busyHref === section.href;
                        return (
                          <div
                            key={section.href}
                            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                          >
                            <button
                              type="button"
                              onClick={() => void toggle(section)}
                              disabled={busyHref !== null}
                              aria-pressed={on}
                              className="flex min-w-0 flex-1 items-center gap-2.5 text-left disabled:opacity-60"
                            >
                              <span
                                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                                  on
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-border bg-background"
                                }`}
                              >
                                {busy ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : on ? (
                                  <Check className="h-3.5 w-3.5" />
                                ) : null}
                              </span>
                              <Icon className="h-4 w-4 shrink-0 text-primary" />
                              <span className="min-w-0 truncate text-sm font-medium">
                                {section.label}
                              </span>
                              <span className="hidden shrink-0 font-mono text-[11px] text-muted-foreground sm:inline">
                                {section.href}
                              </span>
                            </button>

                            {!own && on ? (
                              <Badge variant="outline" className="shrink-0 text-[10px]">
                                grants {section.ownerLabel} · View only
                              </Badge>
                            ) : null}
                            {own && !on ? (
                              <span className="shrink-0 text-[11px] italic text-muted-foreground">
                                hidden — URL still works
                              </span>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>
    </PageShell>
  );
}
