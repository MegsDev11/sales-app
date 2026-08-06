"use client";

import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MODULE_LIST } from "@/lib/modules";
import type { User } from "@/lib/types";
import { Check, Loader2, Trash2 } from "lucide-react";

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  kind: string;
  visibility: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  location: string;
  meeting_url: string;
  module_key: string | null;
  project_id: string | null;
  organizer_id: string | null;
  created_by: string | null;
  /** Derived from a project date — not a real row, so it cannot be edited here. */
  readonly?: boolean;
}

export interface EventAttendee {
  event_id: string;
  user_id: string;
  response: string;
  is_organizer: boolean;
}

const KINDS = [
  { value: "meeting", label: "Meeting" },
  { value: "project_milestone", label: "Project date" },
  { value: "deadline", label: "Deadline" },
  { value: "training", label: "Training" },
  { value: "maintenance", label: "Maintenance" },
  { value: "leave", label: "Leave" },
  { value: "other", label: "Other" },
];

/**
 * Visibility is spelled out in the UI rather than left as a checkbox, because
 * "who can see this" is the question people actually get wrong when booking.
 */
const VISIBILITY = [
  {
    value: "department",
    label: "Department",
    hint: "Anyone with access to the selected department",
  },
  { value: "managers", label: "Managers", hint: "Anyone who manages any department" },
  { value: "company", label: "Whole company", hint: "Every staff member" },
  { value: "attendees", label: "Invitees only", hint: "Only the people you invite" },
  { value: "private", label: "Private", hint: "Only you and anyone you invite" },
];

/** Format a Date for a datetime-local input in LOCAL time, not UTC. */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EventDialog({
  open,
  onClose,
  onSaved,
  event,
  defaultDate,
  users,
  currentUserId,
  accessToken,
  attendees,
  canManage,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  event: CalendarEvent | null;
  defaultDate: Date;
  users: User[];
  currentUserId: string;
  accessToken: string;
  attendees: EventAttendee[];
  canManage: boolean;
}) {
  const isEdit = Boolean(event);
  const isOrganizer =
    !event || event.organizer_id === currentUserId || event.created_by === currentUserId;
  const readOnly = isEdit && !isOrganizer && !canManage;

  const defaultStart = useMemo(() => {
    if (event) return new Date(event.starts_at);
    const d = new Date(defaultDate);
    d.setHours(9, 0, 0, 0);
    return d;
  }, [event, defaultDate]);

  const defaultEnd = useMemo(() => {
    if (event) return new Date(event.ends_at);
    const d = new Date(defaultDate);
    d.setHours(10, 0, 0, 0);
    return d;
  }, [event, defaultDate]);

  const [title, setTitle] = useState(event?.title ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [kind, setKind] = useState(event?.kind ?? "meeting");
  const [visibility, setVisibility] = useState(event?.visibility ?? "department");
  const [moduleKey, setModuleKey] = useState(event?.module_key ?? "");
  const [startsAt, setStartsAt] = useState(toLocalInput(defaultStart));
  const [endsAt, setEndsAt] = useState(toLocalInput(defaultEnd));
  const [allDay, setAllDay] = useState(event?.all_day ?? false);
  const [location, setLocation] = useState(event?.location ?? "");
  const [meetingUrl, setMeetingUrl] = useState(event?.meeting_url ?? "");
  const [invited, setInvited] = useState<string[]>(
    attendees.filter((a) => a.user_id !== currentUserId).map((a) => a.user_id)
  );
  const [search, setSearch] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectable = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = users.filter((u) => u.id !== currentUserId && u.active !== false);
    if (!q) return list;
    return list.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        (u.department ?? "").toLowerCase().includes(q)
    );
  }, [users, currentUserId, search]);

  const toggle = (id: string) =>
    setInvited((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const submit = async () => {
    setError(null);

    if (!title.trim()) return setError("Give the event a title.");
    if (new Date(endsAt) < new Date(startsAt))
      return setError("The end time is before the start time.");
    if (visibility === "department" && !moduleKey)
      return setError("Pick which department this belongs to, or change the visibility.");

    setIsSaving(true);
    try {
      const res = await fetch("/api/scheduler", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          action: isEdit ? "update" : "create",
          id: event?.id,
          title,
          description,
          kind,
          visibility,
          moduleKey: moduleKey || null,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
          allDay,
          location,
          meetingUrl,
          attendeeIds: invited,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to save");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  const cancelEvent = async () => {
    if (!event) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/scheduler", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ action: "cancel", id: event.id }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to cancel");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel");
    } finally {
      setIsSaving(false);
    }
  };

  const rsvp = async (response: string) => {
    if (!event) return;
    setIsSaving(true);
    try {
      await fetch("/api/scheduler", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ action: "rsvp", id: event.id, response }),
      });
      onSaved();
    } finally {
      setIsSaving(false);
    }
  };

  const myRsvp = attendees.find((a) => a.user_id === currentUserId)?.response;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>
            {readOnly ? title || "Event" : isEdit ? "Edit event" : "New event"}
          </DialogTitle>
        </DialogHeader>

        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {readOnly ? (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">{description || "No description."}</p>
            <p>
              <span className="text-muted-foreground">When: </span>
              {new Date(event!.starts_at).toLocaleString("en-ZA")} –{" "}
              {new Date(event!.ends_at).toLocaleTimeString("en-ZA", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            {event!.location ? (
              <p>
                <span className="text-muted-foreground">Where: </span>
                {event!.location}
              </p>
            ) : null}
            {myRsvp ? (
              <div>
                <p className="mb-1 text-xs text-muted-foreground">
                  Your response: <span className="font-medium">{myRsvp}</span>
                </p>
                <div className="flex gap-2">
                  {["accepted", "tentative", "declined"].map((r) => (
                    <Button
                      key={r}
                      variant={myRsvp === r ? undefined : "outline"}
                      onClick={() => void rsvp(r)}
                      disabled={isSaving}
                      className={myRsvp === r ? "bg-primary text-primary-foreground" : ""}
                    >
                      {r === "accepted" ? "Going" : r === "tentative" ? "Maybe" : "Can't go"}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Only the organiser can change this event.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Title
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Weekly ops meeting"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Type
                </label>
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                >
                  {KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Department
                </label>
                <select
                  value={moduleKey}
                  onChange={(e) => setModuleKey(e.target.value)}
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                >
                  <option value="">None</option>
                  {MODULE_LIST.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Starts
                </label>
                <Input
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Ends
                </label>
                <Input
                  type="datetime-local"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              All day
            </label>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Who can see this
              </label>
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
              >
                {VISIBILITY.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                {VISIBILITY.find((v) => v.value === visibility)?.hint}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Location
                </label>
                <Input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Boardroom"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Meeting link
                </label>
                <Input
                  value={meetingUrl}
                  onChange={(e) => setMeetingUrl(e.target.value)}
                  placeholder="https://…"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Notes
              </label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Agenda, what to bring…"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Invite people {invited.length > 0 ? `(${invited.length})` : ""}
              </label>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search staff…"
                className="mb-2"
              />
              <div className="max-h-40 space-y-0.5 overflow-auto rounded-md border border-border p-1">
                {selectable.length === 0 ? (
                  <p className="p-2 text-xs text-muted-foreground">No matching staff.</p>
                ) : (
                  selectable.map((u) => {
                    const on = invited.includes(u.id);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => toggle(u.id)}
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"
                      >
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                            on
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border"
                          }`}
                        >
                          {on ? <Check className="h-3 w-3" /> : null}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm">{u.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {u.department ?? ""}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-2">
          <div>
            {isEdit && (isOrganizer || canManage) ? (
              <Button
                variant="outline"
                onClick={() => void cancelEvent()}
                disabled={isSaving}
                className="text-destructive"
              >
                <Trash2 className="mr-1.5 h-4 w-4" /> Cancel event
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={isSaving}>
              Close
            </Button>
            {!readOnly ? (
              <Button
                onClick={() => void submit()}
                disabled={isSaving}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Saving…
                  </>
                ) : isEdit ? (
                  "Save changes"
                ) : (
                  "Create event"
                )}
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
