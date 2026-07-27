"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useStaffStore } from "@/lib/store/staff-store";
import { PageHeader, PageShell, Panel, AlertBanner } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { SERIES, STATUS } from "@/components/charts/tokens";
import type { CalendarEvent, EventAttendee } from "@/components/scheduler/event-dialog";
import { CalendarClock, Loader2, MapPin, Users, Video } from "lucide-react";

const KIND_COLOR: Record<string, string> = {
  meeting: SERIES[0],
  project_milestone: SERIES[6],
  deadline: STATUS.critical,
  leave: SERIES[4],
  maintenance: SERIES[1],
  training: SERIES[2],
  other: "#94a3b8",
};

/** My agenda — only what I'm actually invited to, grouped by day. */
export default function AgendaPage() {
  const { accessToken, currentUser } = useAuth();
  const { users } = useStaffStore();

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [attendees, setAttendees] = useState<EventAttendee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const from = new Date().toISOString();
      const to = new Date(Date.now() + 1000 * 60 * 60 * 24 * 90).toISOString();
      const res = await fetch(`/api/scheduler?from=${from}&to=${to}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load agenda");
      setEvents(body.events ?? []);
      setAttendees(body.attendees ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agenda");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const mine = useMemo(() => {
    const myEventIds = new Set(
      attendees.filter((a) => a.user_id === currentUser?.id).map((a) => a.event_id)
    );
    return events
      .filter((e) => myEventIds.has(e.id) || e.organizer_id === currentUser?.id)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }, [events, attendees, currentUser]);

  const grouped = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of mine) {
      const key = new Date(e.starts_at).toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return Array.from(map.entries());
  }, [mine]);

  const rsvp = async (eventId: string, response: string) => {
    setBusy(eventId);
    try {
      await fetch("/api/scheduler", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ action: "rsvp", id: eventId, response }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const myResponse = (eventId: string) =>
    attendees.find((a) => a.event_id === eventId && a.user_id === currentUser?.id)?.response;

  const pending = mine.filter((e) => myResponse(e.id) === "invited").length;

  return (
    <PageShell>
      <PageHeader
        title="My agenda"
        description="Everything you're invited to over the next 90 days"
      />

      {error ? <AlertBanner tone="warn">{error}</AlertBanner> : null}

      {pending > 0 ? (
        <AlertBanner tone="info">
          You have {pending} invitation{pending === 1 ? "" : "s"} waiting for a response.
        </AlertBanner>
      ) : null}

      {isLoading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your agenda…
        </div>
      ) : grouped.length === 0 ? (
        <Panel title="Nothing scheduled">
          <div className="py-6 text-center">
            <CalendarClock className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              You have no upcoming events. Anything you&apos;re invited to will appear here.
            </p>
          </div>
        </Panel>
      ) : (
        <div className="space-y-4">
          {grouped.map(([day, list]) => (
            <Panel key={day} title={day} padded={false}>
              <ul className="divide-y divide-border">
                {list.map((e) => {
                  const response = myResponse(e.id);
                  const names = attendees
                    .filter((a) => a.event_id === e.id)
                    .map((a) => users.find((u) => u.id === a.user_id)?.name ?? "Unknown");

                  return (
                    <li key={e.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                      <span
                        aria-hidden
                        className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                        style={{ background: KIND_COLOR[e.kind] ?? KIND_COLOR.other }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{e.title}</p>
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
                        </p>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          {e.location ? (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" /> {e.location}
                            </span>
                          ) : null}
                          {e.meeting_url ? (
                            <a
                              href={e.meeting_url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1 text-primary hover:underline"
                            >
                              <Video className="h-3 w-3" /> Join
                            </a>
                          ) : null}
                          {names.length > 0 ? (
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3" /> {names.length}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {response ? (
                        <div className="flex shrink-0 gap-1">
                          {[
                            { key: "accepted", label: "Going" },
                            { key: "tentative", label: "Maybe" },
                            { key: "declined", label: "No" },
                          ].map((opt) => (
                            <Button
                              key={opt.key}
                              size="sm"
                              variant={response === opt.key ? "default" : "outline"}
                              disabled={busy === e.id}
                              onClick={() => void rsvp(e.id, opt.key)}
                            >
                              {opt.label}
                            </Button>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </Panel>
          ))}
        </div>
      )}
    </PageShell>
  );
}
