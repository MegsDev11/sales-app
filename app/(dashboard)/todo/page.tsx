"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useStaffStore } from "@/lib/store/staff-store";
import { PageHeader, PageShell, Panel, AlertBanner } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select-field";
import { CheckCircle2, Circle, Loader2, Plus, RefreshCw, Repeat, Trash2 } from "lucide-react";

/**
 * Today — the day's work for a department.
 *
 * The list is built each morning from what the rest of the platform already
 * knows: meetings on the calendar, jobs on the board, follow-ups falling due,
 * plus whatever standing duties the department has set. Nobody has to assemble
 * it from four screens, and ticking something off is recorded, so "did anyone
 * actually do it" has an answer.
 */

interface TodoItem {
  id: string;
  title: string;
  detail: string;
  source: string;
  link: string;
  assigneeId: string | null;
  assigneeName: string | null;
  doneAt: string | null;
  doneByName: string | null;
}

interface Template {
  id: string;
  title: string;
  detail: string;
  weekdays: number[];
  active: boolean;
}

interface Department {
  key: string;
  label: string;
}

const SOURCE_LABEL: Record<string, string> = {
  template: "Daily duty",
  booking: "Meeting",
  job: "Job",
  follow_up: "Follow-up",
  manual: "Added",
};

const SOURCE_TONE: Record<string, string> = {
  template: "bg-muted text-muted-foreground",
  booking: "bg-sky-100 text-sky-800",
  job: "bg-indigo-100 text-indigo-800",
  follow_up: "bg-amber-100 text-amber-800",
  manual: "bg-emerald-100 text-emerald-800",
};

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function TodoPage() {
  const { accessToken, currentUser } = useAuth();
  const { users } = useStaffStore();

  const [day, setDay] = useState(todayIso);
  const [department, setDepartment] = useState("");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [items, setItems] = useState<TodoItem[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [newTitle, setNewTitle] = useState("");
  const [newAssignee, setNewAssignee] = useState("");
  const [showDuties, setShowDuties] = useState(false);
  const [dutyTitle, setDutyTitle] = useState("");

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ day });
      if (department) params.set("department", department);
      const res = await fetch(`/api/todos?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load today's list");
      setItems(json.items ?? []);
      setTemplates(json.templates ?? []);
      setDepartments(json.departments ?? []);
      setCanEdit(Boolean(json.canEdit));
      setNote(json.note ?? null);
      if (!department && json.department) setDepartment(json.department);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load today's list");
    } finally {
      setLoading(false);
    }
  }, [accessToken, day, department]);

  useEffect(() => {
    void load();
  }, [load]);

  const post = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!accessToken) return false;
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/todos", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ department, day, ...payload }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Request failed");
        await load();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Request failed");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [accessToken, day, department, load]
  );

  const done = items.filter((i) => i.doneAt).length;
  const mine = useMemo(
    () => items.filter((i) => i.assigneeId === currentUser?.id && !i.doneAt),
    [items, currentUser]
  );

  const staffOptions = useMemo(
    () => [
      { value: "", label: "Anyone in the department" },
      ...users
        .filter((u) => u.active !== false)
        .map((u) => ({ value: u.id, label: u.name })),
    ],
    [users]
  );

  return (
    <PageShell>
      <PageHeader
        title="Today"
        description="Built each morning from the calendar, the job board, follow-ups falling due, and your department's standing duties."
        actions={
          <div className="flex items-center gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
            <Input
              type="date"
              value={day}
              onChange={(e) => setDay(e.target.value)}
              className="w-40"
            />
            <SelectField
              className="w-44"
              value={department}
              onValueChange={setDepartment}
              options={departments.map((d) => ({ value: d.key, label: d.label }))}
            />
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="mr-1.5 h-4 w-4" /> Refresh
            </Button>
          </div>
        }
      />

      {error ? <AlertBanner tone="danger">{error}</AlertBanner> : null}
      {note ? <AlertBanner tone="info">{note}</AlertBanner> : null}

      {mine.length > 0 ? (
        <AlertBanner tone="info">
          {mine.length} of {items.length - done} open {mine.length === 1 ? "item is" : "items are"}{" "}
          assigned to you.
        </AlertBanner>
      ) : null}

      <Panel
        title={`${done} of ${items.length} done`}
        padded={false}
        actions={
          canEdit ? (
            <Button size="xs" variant="ghost" onClick={() => setShowDuties((v) => !v)}>
              <Repeat className="mr-1 h-3.5 w-3.5" />
              {showDuties ? "Hide" : "Standing duties"}
            </Button>
          ) : null
        }
      >
        {items.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            {loading
              ? "Loading…"
              : day === todayIso()
                ? "Nothing on the list yet. It builds automatically each morning — meetings, jobs and follow-ups appear here as they are booked."
                : "Nothing was on the list for this day."}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <li
                key={item.id}
                className={`flex items-start gap-3 px-4 py-2.5 ${item.doneAt ? "opacity-60" : ""}`}
              >
                <button
                  className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary disabled:opacity-40"
                  disabled={busy}
                  aria-label={item.doneAt ? "Reopen" : "Mark done"}
                  onClick={() =>
                    void post({
                      action: item.doneAt ? "reopen" : "complete",
                      itemId: item.id,
                    })
                  }
                >
                  {item.doneAt ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  ) : (
                    <Circle className="h-5 w-5" />
                  )}
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                        SOURCE_TONE[item.source] ?? "bg-muted text-muted-foreground"
                      }`}
                    >
                      {SOURCE_LABEL[item.source] ?? item.source}
                    </span>
                    {item.link ? (
                      <Link
                        href={item.link}
                        className={`font-medium text-primary hover:underline ${
                          item.doneAt ? "line-through" : ""
                        }`}
                      >
                        {item.title}
                      </Link>
                    ) : (
                      <span className={`font-medium ${item.doneAt ? "line-through" : ""}`}>
                        {item.title}
                      </span>
                    )}
                  </div>
                  {item.detail ? (
                    <p className="text-xs text-muted-foreground">{item.detail}</p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {item.assigneeName ? `For ${item.assigneeName}` : "Unassigned"}
                    {item.doneAt
                      ? ` · done by ${item.doneByName ?? "someone"} at ${new Date(
                          item.doneAt
                        ).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}`
                      : ""}
                  </p>
                </div>

                {canEdit && item.source === "manual" && !item.doneAt ? (
                  <button
                    className="mt-0.5 shrink-0 text-muted-foreground hover:text-destructive"
                    disabled={busy}
                    aria-label="Remove"
                    onClick={() => void post({ action: "deleteItem", itemId: item.id })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {canEdit ? (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-border p-3">
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newTitle.trim()) {
                  void post({ action: "addItem", title: newTitle, assigneeId: newAssignee }).then(
                    (ok) => {
                      if (ok) {
                        setNewTitle("");
                        setNewAssignee("");
                      }
                    }
                  );
                }
              }}
              placeholder="Add something to today…"
              className="min-w-52 flex-1"
            />
            <SelectField
              className="w-52"
              value={newAssignee}
              onValueChange={setNewAssignee}
              options={staffOptions}
            />
            <Button
              variant="outline"
              disabled={busy || !newTitle.trim()}
              onClick={() =>
                void post({ action: "addItem", title: newTitle, assigneeId: newAssignee }).then(
                  (ok) => {
                    if (ok) {
                      setNewTitle("");
                      setNewAssignee("");
                    }
                  }
                )
              }
            >
              <Plus className="mr-1 h-4 w-4" /> Add
            </Button>
          </div>
        ) : null}
      </Panel>

      {showDuties && canEdit ? (
        <Panel
          title="Standing duties"
          description="These are added to this department's list automatically, every day they apply."
          padded={false}
        >
          {templates.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No standing duties yet — things like &ldquo;check the support inbox&rdquo; or &ldquo;bank the
              day&rsquo;s receipts&rdquo;.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {templates.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-2">
                  <span className="min-w-0">
                    <span className="font-medium">{t.title}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {t.weekdays.length === 0
                        ? "every day"
                        : t.weekdays
                            .slice()
                            .sort((a, b) => a - b)
                            .map((d) => DAY_NAMES[d - 1])
                            .join(", ")}
                    </span>
                  </span>
                  <button
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    disabled={busy}
                    aria-label="Remove duty"
                    onClick={() => void post({ action: "removeTemplate", templateId: t.id })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-border p-3">
            <Input
              value={dutyTitle}
              onChange={(e) => setDutyTitle(e.target.value)}
              placeholder="A duty this department does every day…"
              className="min-w-60 flex-1"
            />
            <Button
              variant="outline"
              disabled={busy || !dutyTitle.trim()}
              onClick={() =>
                void post({ action: "addTemplate", title: dutyTitle }).then((ok) => {
                  if (ok) setDutyTitle("");
                })
              }
            >
              <Plus className="mr-1 h-4 w-4" /> Add duty
            </Button>
            <p className="w-full text-xs text-muted-foreground">
              New duties appear on tomorrow&rsquo;s list, or on today&rsquo;s the next time it
              is regenerated.
            </p>
          </div>
        </Panel>
      ) : null}
    </PageShell>
  );
}
