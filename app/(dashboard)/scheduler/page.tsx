"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useStaffStore } from "@/lib/store/staff-store";
import { PageHeader, PageShell, Panel, AlertBanner } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { MODULE_LIST } from "@/lib/modules";
import { SERIES, STATUS } from "@/components/charts/tokens";
import { EventDialog, type CalendarEvent, type EventAttendee } from "@/components/scheduler/event-dialog";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MapPin,
  Plus,
  Users,
  Video,
} from "lucide-react";

/** Event colour is by KIND (identity), never by rank or urgency. */
const KIND_COLOR: Record<string, string> = {
  meeting: SERIES[0],
  project_milestone: SERIES[6],
  deadline: STATUS.critical,
  leave: SERIES[4],
  maintenance: SERIES[1],
  training: SERIES[2],
  other: "#94a3b8",
};

const KIND_LABEL: Record<string, string> = {
  meeting: "Meeting",
  project_milestone: "Project date",
  deadline: "Deadline",
  leave: "Leave",
  maintenance: "Maintenance",
  training: "Training",
  other: "Other",
};

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Monday-first grid covering the whole month. */
function monthGrid(month: Date): Date[] {
  const first = startOfMonth(month);
  const offset = (first.getDay() + 6) % 7; // Monday = 0
  const start = new Date(first);
  start.setDate(first.getDate() - offset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export default function SchedulerPage() {
  const { accessToken, currentUser, can } = useAuth();
  const { users } = useStaffStore();

  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [attendees, setAttendees] = useState<EventAttendee[]>([]);
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());
  const [moduleFilter, setModuleFilter] = useState<string>("all");

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);

  const canEdit = can("scheduler", "edit");

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const from = new Date(month.getFullYear(), month.getMonth() - 1, 1).toISOString();
      const to = new Date(month.getFullYear(), month.getMonth() + 2, 0).toISOString();
      const res = await fetch(`/api/scheduler?from=${from}&to=${to}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load calendar");
      setEvents(body.events ?? []);
      setAttendees(body.attendees ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load calendar");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, month]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () =>
      moduleFilter === "all"
        ? events
        : events.filter((e) => e.module_key === moduleFilter),
    [events, moduleFilter]
  );

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of filtered) {
      const key = isoDate(new Date(e.starts_at));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    }
    return map;
  }, [filtered]);

  const grid = useMemo(() => monthGrid(month), [month]);
  const today = new Date();

  const dayEvents = byDay.get(isoDate(selectedDay)) ?? [];

  const attendeesFor = (eventId: string) =>
    attendees
      .filter((a) => a.event_id === eventId)
      .map((a) => users.find((u) => u.id === a.user_id)?.name ?? "Unknown");

  const upcoming = useMemo(
    () =>
      filtered
        .filter((e) => new Date(e.starts_at) >= new Date())
        .slice(0, 6),
    [filtered]
  );

  const openNew = (day?: Date) => {
    setEditing(null);
    if (day) setSelectedDay(day);
    setDialogOpen(true);
  };

  return (
    <PageShell>
      <PageHeader
        title="Scheduler"
        description="Meetings, project dates and department calendars in one place"
        actions={
          canEdit ? (
            <Button
              onClick={() => openNew()}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="mr-1.5 h-4 w-4" /> New event
            </Button>
          ) : null
        }
      />

      {error ? <AlertBanner tone="warn">{error}</AlertBanner> : null}

      {/* One filter row above everything it scopes — never per-card filters. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-md border border-border bg-card p-1">
          <button
            type="button"
            onClick={() => setMonth(addMonths(month, -1))}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[130px] px-2 text-center text-sm font-medium">
            {month.toLocaleDateString("en-ZA", { month: "long", year: "numeric" })}
          </span>
          <button
            type="button"
            onClick={() => setMonth(addMonths(month, 1))}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <Button
          variant="outline"
          onClick={() => {
            setMonth(startOfMonth(new Date()));
            setSelectedDay(new Date());
          }}
        >
          Today
        </Button>

        <select
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
          className="h-9 rounded-md border border-border bg-card px-2 text-sm"
        >
          <option value="all">All departments</option>
          {MODULE_LIST.filter((m) => can(m.key, "view")).map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>

        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* Month grid */}
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="mb-1 grid grid-cols-7 gap-1">
            {DAY_NAMES.map((d) => (
              <div
                key={d}
                className="px-1 py-1 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
              >
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {grid.map((day) => {
              const inMonth = day.getMonth() === month.getMonth();
              const isToday = sameDay(day, today);
              const isSelected = sameDay(day, selectedDay);
              const dayList = byDay.get(isoDate(day)) ?? [];

              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => setSelectedDay(day)}
                  onDoubleClick={() => canEdit && openNew(day)}
                  className={`min-h-[86px] rounded-md border p-1.5 text-left transition-colors ${
                    isSelected
                      ? "border-primary bg-accent"
                      : "border-transparent hover:border-border hover:bg-muted/50"
                  } ${inMonth ? "" : "opacity-40"}`}
                >
                  <span
                    className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] tabular-nums ${
                      isToday
                        ? "bg-primary font-semibold text-primary-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {day.getDate()}
                  </span>

                  <ul className="mt-1 space-y-0.5">
                    {dayList.slice(0, 3).map((e) => (
                      <li key={e.id} className="flex items-center gap-1">
                        <span
                          aria-hidden
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: KIND_COLOR[e.kind] ?? KIND_COLOR.other }}
                        />
                        <span className="truncate text-[10px] text-foreground">
                          {e.all_day
                            ? e.title
                            : `${new Date(e.starts_at).toLocaleTimeString("en-ZA", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })} ${e.title}`}
                        </span>
                      </li>
                    ))}
                    {dayList.length > 3 ? (
                      <li className="pl-2.5 text-[10px] text-muted-foreground">
                        +{dayList.length - 3} more
                      </li>
                    ) : null}
                  </ul>
                </button>
              );
            })}
          </div>

          {/* Legend: identity is never colour-alone. */}
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3">
            {Object.entries(KIND_LABEL).map(([kind, label]) => (
              <li key={kind} className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="h-2 w-2 rounded-full"
                  style={{ background: KIND_COLOR[kind] }}
                />
                <span className="text-[11px] text-muted-foreground">{label}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Selected day + upcoming */}
        <div className="space-y-4">
          <Panel
            title={selectedDay.toLocaleDateString("en-ZA", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
            description={`${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"}`}
            padded={false}
          >
            {dayEvents.length === 0 ? (
              <div className="p-4 text-center">
                <CalendarDays className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Nothing scheduled.</p>
                {canEdit ? (
                  <Button
                    variant="outline"
                    className="mt-2"
                    onClick={() => openNew(selectedDay)}
                  >
                    Book something
                  </Button>
                ) : null}
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {dayEvents.map((e) => {
                  const names = attendeesFor(e.id);
                  // Project dates are derived, not real events. Send people to the
                  // project so they change the date at its source.
                  const isDerived = Boolean(e.readonly);
                  const Wrapper = isDerived ? "a" : "button";
                  const wrapperProps = isDerived
                    ? { href: e.project_id ? `/projects/${e.project_id}` : "/projects" }
                    : {
                        type: "button" as const,
                        onClick: () => {
                          setEditing(e);
                          setDialogOpen(true);
                        },
                      };
                  return (
                    <li key={e.id}>
                      <Wrapper
                        {...wrapperProps}
                        className="block w-full px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
                      >
                        <div className="flex items-start gap-2">
                          <span
                            aria-hidden
                            className="mt-1 h-2 w-2 shrink-0 rounded-full"
                            style={{ background: KIND_COLOR[e.kind] ?? KIND_COLOR.other }}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{e.title}</p>
                            <p className="text-xs tabular-nums text-muted-foreground">
                              {e.all_day
                                ? "All day"
                                : `${new Date(e.starts_at).toLocaleTimeString("en-ZA", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })} – ${new Date(e.ends_at).toLocaleTimeString("en-ZA", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}`}
                              {" · "}
                              {KIND_LABEL[e.kind] ?? "Event"}
                            </p>
                            {e.location ? (
                              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                                <MapPin className="h-3 w-3" /> {e.location}
                              </p>
                            ) : null}
                            {e.meeting_url ? (
                              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                                <Video className="h-3 w-3" /> Online
                              </p>
                            ) : null}
                            {names.length > 0 ? (
                              <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                                <Users className="h-3 w-3 shrink-0" />
                                {names.slice(0, 3).join(", ")}
                                {names.length > 3 ? ` +${names.length - 3}` : ""}
                              </p>
                            ) : null}
                            {isDerived ? (
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                From a project — open the project to change this date
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </Wrapper>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel title="Coming up" padded={false}>
            {upcoming.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">Nothing upcoming.</p>
            ) : (
              <ul className="divide-y divide-border">
                {upcoming.map((e) => (
                  <li key={e.id} className="flex items-center gap-2 px-3 py-2">
                    <span
                      aria-hidden
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: KIND_COLOR[e.kind] ?? KIND_COLOR.other }}
                    />
                    <span className="min-w-0 flex-1 truncate text-xs">{e.title}</span>
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      {new Date(e.starts_at).toLocaleDateString("en-ZA", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      {dialogOpen ? (
        <EventDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onSaved={() => {
            setDialogOpen(false);
            void load();
          }}
          event={editing}
          defaultDate={selectedDay}
          users={users}
          currentUserId={currentUser?.id ?? ""}
          accessToken={accessToken ?? ""}
          attendees={editing ? attendees.filter((a) => a.event_id === editing.id) : []}
          canManage={can("scheduler", "manage")}
        />
      ) : null}
    </PageShell>
  );
}
