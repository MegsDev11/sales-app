import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAccess } from "@/lib/supabase/server-auth";
import { can } from "@/lib/access";
import { isModuleKey } from "@/lib/modules";
import { canSeeProject, type ProjectAuthRow } from "@/lib/projects/visibility";
import type { User } from "@/lib/types";

/**
 * Scheduler API.
 *
 * GET  ?from=ISO&to=ISO   -> events the caller may see in a window, with attendees
 * POST                    -> create / update / cancel an event, or RSVP
 *
 * Visibility is enforced twice: once here (so the response is right) and once by RLS
 * via can_see_event() (so it is right even if this route is bypassed). The filtering
 * below deliberately mirrors migration 045 — if you change one, change both.
 */

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const m = (error as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return "Request failed";
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Mirror of can_see_event() in SQL. */
function visibleTo(
  user: User,
  event: {
    visibility: string;
    module_key: string | null;
    organizer_id: string | null;
    created_by: string | null;
  },
  attendeeIds: Set<string>
): boolean {
  if (event.organizer_id === user.id || event.created_by === user.id) return true;
  if (attendeeIds.has(user.id)) return true;
  if (event.visibility === "company") return true;
  if (event.visibility === "managers") {
    if (user.role === "owner") return true;
    return Object.values(user.access ?? {}).some((level) => level === "manage");
  }
  if (event.visibility === "department") {
    if (!event.module_key) return true;
    return isModuleKey(event.module_key) && can(user, event.module_key, "view");
  }
  return false;
}

export async function GET(request: Request) {
  const user = await requireAccess(request, "scheduler", "view");
  if (!user) {
    return NextResponse.json({ error: "Unauthorized — scheduler access required" }, { status: 403 });
  }

  try {
    const url = new URL(request.url);
    const from = url.searchParams.get("from") ?? new Date(Date.now() - 31536000000 / 12).toISOString();
    const to = url.searchParams.get("to") ?? new Date(Date.now() + 31536000000 / 4).toISOString();

    const supabase = createSupabaseAdminClient() as unknown as SupabaseClient;

    const { data: events, error } = await supabase
      .from("calendar_events")
      .select("*")
      .gte("starts_at", from)
      .lte("starts_at", to)
      .is("cancelled_at", null)
      .order("starts_at");
    if (error) throw error;

    const ids = (events ?? []).map((e) => e.id as string);
    const { data: attendees } = ids.length
      ? await supabase
          .from("calendar_event_attendees")
          .select("event_id, user_id, response, is_organizer")
          .in("event_id", ids)
      : { data: [] as Record<string, unknown>[] };

    const byEvent = new Map<string, Set<string>>();
    for (const a of attendees ?? []) {
      const key = a.event_id as string;
      if (!byEvent.has(key)) byEvent.set(key, new Set());
      byEvent.get(key)!.add(a.user_id as string);
    }

    const visible = (events ?? []).filter((e) =>
      visibleTo(
        user,
        e as unknown as {
          visibility: string;
          module_key: string | null;
          organizer_id: string | null;
          created_by: string | null;
        },
        byEvent.get(e.id as string) ?? new Set()
      )
    );

    const visibleIds = new Set(visible.map((e) => e.id as string));

    // Project dates appear on the calendar as read-only entries derived from the
    // project itself, rather than duplicated event rows. A copied date drifts the
    // moment someone reschedules the project; a derived one cannot.
    const projectEvents = await buildProjectDateEvents(supabase, user, from, to);

    return NextResponse.json(
      {
        events: [...visible, ...projectEvents],
        attendees: (attendees ?? []).filter((a) => visibleIds.has(a.event_id as string)),
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

/**
 * Derive read-only calendar entries from project target dates and milestones.
 *
 * Respects project visibility: a project you cannot open must not leak its deadlines
 * onto your calendar, so this reuses the same rule as /api/projects rather than a
 * second copy of it.
 *
 * The ids are prefixed `project:` / `milestone:` so the UI can tell them apart from
 * real events and refuse to open them in the edit dialog.
 */
async function buildProjectDateEvents(
  supabase: SupabaseClient,
  user: User,
  from: string,
  to: string
) {
  try {
    const [projects, members, milestones] = await Promise.all([
      supabase.from("projects").select("id, code, name, owner_id, is_private, target_date, status"),
      supabase.from("project_members").select("project_id, user_id"),
      supabase.from("project_milestones").select("id, project_id, title, due_date, completed_at"),
    ]);
    // Projects module not installed yet — nothing to add.
    if (projects.error) return [];

    const byProject = new Map<string, Set<string>>();
    for (const m of members.data ?? []) {
      const key = m.project_id as string;
      if (!byProject.has(key)) byProject.set(key, new Set());
      byProject.get(key)!.add(m.user_id as string);
    }

    const visibleProjects = (projects.data ?? []).filter((p) =>
      canSeeProject(
        user,
        p as unknown as ProjectAuthRow,
        byProject.get(p.id as string) ?? new Set()
      )
    );
    const visibleProjectIds = new Set(visibleProjects.map((p) => p.id as string));

    const inWindow = (d: string) => d >= from.slice(0, 10) && d <= to.slice(0, 10);

    const synthetic: Record<string, unknown>[] = [];

    for (const p of visibleProjects) {
      const target = p.target_date as string | null;
      if (!target || !inWindow(target)) continue;
      if (p.status === "cancelled") continue;
      synthetic.push({
        id: `project:${p.id}`,
        title: `${p.name} — target date`,
        description: `Target completion for ${p.code}.`,
        kind: "project_milestone",
        visibility: "department",
        starts_at: `${target}T00:00:00.000Z`,
        ends_at: `${target}T23:59:59.000Z`,
        all_day: true,
        location: "",
        meeting_url: "",
        module_key: "projects",
        project_id: p.id,
        organizer_id: p.owner_id,
        created_by: p.owner_id,
        readonly: true,
      });
    }

    for (const ms of milestones.data ?? []) {
      const due = ms.due_date as string | null;
      if (!due || !inWindow(due)) continue;
      if (!visibleProjectIds.has(ms.project_id as string)) continue;
      const parent = visibleProjects.find((p) => p.id === ms.project_id);
      synthetic.push({
        id: `milestone:${ms.id}`,
        title: `${ms.title}${parent ? ` (${parent.code})` : ""}`,
        description: "Project milestone.",
        kind: "project_milestone",
        visibility: "department",
        starts_at: `${due}T00:00:00.000Z`,
        ends_at: `${due}T23:59:59.000Z`,
        all_day: true,
        location: "",
        meeting_url: "",
        module_key: "projects",
        project_id: ms.project_id,
        organizer_id: null,
        created_by: null,
        readonly: true,
        completed: Boolean(ms.completed_at),
      });
    }

    return synthetic;
  } catch {
    return [];
  }
}

interface EventBody {
  action?: "create" | "update" | "cancel" | "rsvp";
  id?: string;
  title?: string;
  description?: string;
  kind?: string;
  visibility?: string;
  startsAt?: string;
  endsAt?: string;
  allDay?: boolean;
  location?: string;
  meetingUrl?: string;
  moduleKey?: string | null;
  projectId?: string | null;
  leadId?: string | null;
  jobId?: string | null;
  attendeeIds?: string[];
  response?: string;
}

const VALID_KINDS = new Set([
  "meeting", "project_milestone", "deadline", "leave", "maintenance", "training", "other",
]);
const VALID_VISIBILITY = new Set(["private", "attendees", "department", "managers", "company"]);
const VALID_RESPONSES = new Set(["invited", "accepted", "declined", "tentative"]);

export async function POST(request: Request) {
  const user = await requireAccess(request, "scheduler", "view");
  if (!user) {
    return NextResponse.json({ error: "Unauthorized — scheduler access required" }, { status: 403 });
  }

  try {
    const body = (await request.json()) as EventBody;
    const action = body.action ?? "create";
    const supabase = createSupabaseAdminClient() as unknown as SupabaseClient;

    // RSVP only needs view access — you can always answer your own invitation.
    if (action === "rsvp") {
      if (!body.id || !body.response || !VALID_RESPONSES.has(body.response)) {
        return NextResponse.json({ error: "id and a valid response are required" }, { status: 400 });
      }
      const { error } = await supabase
        .from("calendar_event_attendees")
        .update({ response: body.response, responded_at: new Date().toISOString() })
        .eq("event_id", body.id)
        .eq("user_id", user.id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (!can(user, "scheduler", "edit")) {
      return NextResponse.json(
        { error: "You have view-only access to the scheduler" },
        { status: 403 }
      );
    }

    if (action === "cancel") {
      if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });

      const { data: existing } = await supabase
        .from("calendar_events")
        .select("organizer_id, created_by")
        .eq("id", body.id)
        .maybeSingle();
      if (!existing) return NextResponse.json({ error: "Event not found" }, { status: 404 });

      const isOwnerOfEvent =
        existing.organizer_id === user.id || existing.created_by === user.id;
      if (!isOwnerOfEvent && !can(user, "scheduler", "manage")) {
        return NextResponse.json(
          { error: "Only the organiser can cancel this meeting" },
          { status: 403 }
        );
      }

      const { error } = await supabase
        .from("calendar_events")
        .update({ cancelled_at: new Date().toISOString() })
        .eq("id", body.id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    // Shared validation for create + update
    if (!body.title?.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    if (!body.startsAt || !body.endsAt) {
      return NextResponse.json({ error: "Start and end times are required" }, { status: 400 });
    }
    if (new Date(body.endsAt) < new Date(body.startsAt)) {
      return NextResponse.json({ error: "The end time is before the start time" }, { status: 400 });
    }
    if (body.kind && !VALID_KINDS.has(body.kind)) {
      return NextResponse.json({ error: `Unknown event type: ${body.kind}` }, { status: 400 });
    }
    if (body.visibility && !VALID_VISIBILITY.has(body.visibility)) {
      return NextResponse.json({ error: `Unknown visibility: ${body.visibility}` }, { status: 400 });
    }
    if (body.moduleKey && !isModuleKey(body.moduleKey)) {
      return NextResponse.json({ error: `Unknown module: ${body.moduleKey}` }, { status: 400 });
    }

    const row = {
      title: body.title.trim(),
      description: body.description ?? "",
      kind: body.kind ?? "meeting",
      visibility: body.visibility ?? "department",
      starts_at: body.startsAt,
      ends_at: body.endsAt,
      all_day: body.allDay ?? false,
      location: body.location ?? "",
      meeting_url: body.meetingUrl ?? "",
      module_key: body.moduleKey ?? null,
      project_id: body.projectId ?? null,
      lead_id: body.leadId ?? null,
      job_id: body.jobId ?? null,
      updated_at: new Date().toISOString(),
    };

    if (action === "update") {
      if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });

      const { data: existing } = await supabase
        .from("calendar_events")
        .select("organizer_id, created_by")
        .eq("id", body.id)
        .maybeSingle();
      if (!existing) return NextResponse.json({ error: "Event not found" }, { status: 404 });

      const isOwnerOfEvent =
        existing.organizer_id === user.id || existing.created_by === user.id;
      if (!isOwnerOfEvent && !can(user, "scheduler", "manage")) {
        return NextResponse.json(
          { error: "Only the organiser can change this meeting" },
          { status: 403 }
        );
      }

      const { error } = await supabase.from("calendar_events").update(row).eq("id", body.id);
      if (error) throw error;

      if (body.attendeeIds) {
        await supabase.from("calendar_event_attendees").delete().eq("event_id", body.id);
        const rows = Array.from(new Set([...body.attendeeIds, user.id])).map((id) => ({
          event_id: body.id!,
          user_id: id,
          is_organizer: id === user.id,
          response: id === user.id ? "accepted" : "invited",
        }));
        if (rows.length) await supabase.from("calendar_event_attendees").insert(rows);
      }

      return NextResponse.json({ ok: true, id: body.id });
    }

    // create
    const id = newId("ev");
    const { error } = await supabase.from("calendar_events").insert({
      ...row,
      id,
      organizer_id: user.id,
      created_by: user.id,
    });
    if (error) throw error;

    const attendeeIds = Array.from(new Set([...(body.attendeeIds ?? []), user.id]));
    const rows = attendeeIds.map((uid) => ({
      event_id: id,
      user_id: uid,
      is_organizer: uid === user.id,
      response: uid === user.id ? "accepted" : "invited",
    }));
    if (rows.length) await supabase.from("calendar_event_attendees").insert(rows);

    // Tell invitees, minus the organiser, using the existing notification table.
    const others = attendeeIds.filter((uid) => uid !== user.id);
    if (others.length) {
      await supabase.from("app_notifications").insert(
        others.map((uid) => ({
          id: newId("ntf"),
          user_id: uid,
          type: "calendar_invite",
          title: `${user.name} invited you: ${row.title}`,
          body: new Date(row.starts_at).toLocaleString("en-ZA"),
          link: "/scheduler",
        }))
      );
    }

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
