import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAuthenticated } from "@/lib/supabase/server-auth";
import { makeId, migrationHint, timeEntryFromRow } from "@/lib/mobile/field-mappers";

export async function GET(request: Request) {
  const user = await requireAuthenticated(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const supabase = createSupabaseAdminClient();
  try {
    // Prefer team_members.id; also match auth uuid if older rows used it
    const techIds = [user.id];
    if (user.authUserId && user.authUserId !== user.id) {
      techIds.push(user.authUserId);
    }

    // From start of current week (UTC-safe lower bound: 8 days ago)
    const since = new Date();
    since.setDate(since.getDate() - 8);
    since.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from("time_entries")
      .select("*")
      .in("technician_id", techIds)
      .gte("clock_in_at", since.toISOString())
      .order("clock_in_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(migrationHint(error.message, "021_field_jobs_timesheets.sql"));

    const open = (data ?? []).find((e) => !e.clock_out_at);
    return NextResponse.json({
      entries: (data ?? []).map(timeEntryFromRow),
      active: open ? timeEntryFromRow(open) : null,
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
