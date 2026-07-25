import { NextResponse } from "next/server";
import { DEFAULT_OT_SETTINGS } from "@megs/shared";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAuthenticated } from "@/lib/supabase/server-auth";
import {
  makeId,
  migrationHint,
  otSettingsFromRow,
  timeEntryFromRow,
} from "@/lib/mobile/field-mappers";

async function loadOtSettings(
  supabase: ReturnType<typeof createSupabaseAdminClient>
) {
  const { data, error } = await supabase
    .from("ot_settings")
    .select("*")
    .eq("id", "default")
    .maybeSingle();
  if (error) {
    // Table may not be migrated yet — fall back to defaults
    if (/does not exist|schema cache/i.test(error.message)) {
      return { ...DEFAULT_OT_SETTINGS };
    }
    throw new Error(migrationHint(error.message, "028_overtime_settings.sql"));
  }
  return otSettingsFromRow(data);
}

export async function GET(request: Request) {
  const user = await requireAuthenticated(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const url = new URL(request.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");

  const supabase = createSupabaseAdminClient();
  try {
    const techIds = [user.id];
    if (user.authUserId && user.authUserId !== user.id) {
      techIds.push(user.authUserId);
    }

    let since: Date;
    let until: Date | null = null;
    if (fromParam) {
      since = new Date(fromParam);
      if (Number.isNaN(since.getTime())) {
        return NextResponse.json({ error: "Invalid from" }, { status: 400 });
      }
    } else {
      since = new Date();
      since.setDate(1);
      since.setHours(0, 0, 0, 0);
    }
    if (toParam) {
      until = new Date(toParam);
      if (Number.isNaN(until.getTime())) {
        return NextResponse.json({ error: "Invalid to" }, { status: 400 });
      }
    }

    let query = supabase
      .from("time_entries")
      .select("*")
      .in("technician_id", techIds)
      .gte("clock_in_at", since.toISOString())
      .order("clock_in_at", { ascending: false })
      .limit(500);
    if (until) {
      query = query.lt("clock_in_at", until.toISOString());
    }

    const [{ data, error }, otSettings] = await Promise.all([
      query,
      loadOtSettings(supabase),
    ]);
    if (error) throw new Error(migrationHint(error.message, "021_field_jobs_timesheets.sql"));

    // Active open shift may start before `from` — fetch separately
    const { data: openRows } = await supabase
      .from("time_entries")
      .select("*")
      .in("technician_id", techIds)
      .is("clock_out_at", null)
      .order("clock_in_at", { ascending: false })
      .limit(1);

    const entries = (data ?? []).map(timeEntryFromRow);
    const open = openRows?.[0] ? timeEntryFromRow(openRows[0]) : null;
    if (open && !entries.some((e) => e.id === open.id)) {
      entries.unshift(open);
    }

    return NextResponse.json({
      entries,
      active: open,
      otSettings,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const user = await requireAuthenticated(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = (await request.json()) as Record<string, unknown>;
  const action = String(body.action ?? "");
  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();

  try {
    if (action === "clock_in") {
      const { data: open } = await supabase
        .from("time_entries")
        .select("id")
        .eq("technician_id", user.id)
        .is("clock_out_at", null)
        .maybeSingle();
      if (open) {
        return NextResponse.json({ error: "Already clocked in", code: "ALREADY_IN" }, { status: 400 });
      }

      const id = makeId("te");
      const { error } = await supabase.from("time_entries").insert({
        id,
        technician_id: user.id,
        job_id: (body.jobId as string) || null,
        clock_in_at: now,
        clock_in_lat: typeof body.lat === "number" ? body.lat : null,
        clock_in_lng: typeof body.lng === "number" ? body.lng : null,
        source: "mobile",
        created_at: now,
      });
      if (error) throw new Error(migrationHint(error.message, "021_field_jobs_timesheets.sql"));
      return NextResponse.json({ ok: true, entryId: id });
    }

    if (action === "clock_out") {
      const { data: open } = await supabase
        .from("time_entries")
        .select("*")
        .eq("technician_id", user.id)
        .is("clock_out_at", null)
        .maybeSingle();
      if (!open) {
        return NextResponse.json({ error: "Not clocked in", code: "NOT_IN" }, { status: 400 });
      }

      const { error } = await supabase
        .from("time_entries")
        .update({
          clock_out_at: now,
          clock_out_lat: typeof body.lat === "number" ? body.lat : null,
          clock_out_lng: typeof body.lng === "number" ? body.lng : null,
        })
        .eq("id", open.id);
      if (error) throw new Error(migrationHint(error.message, "021_field_jobs_timesheets.sql"));
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
