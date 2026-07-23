import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAuthUserFromRequest } from "@/lib/supabase/server-auth";
import { canAccessCoordination, isOwner } from "@/lib/permissions";
import { makeId, migrationHint, timeEntryFromRow } from "@/lib/mobile/field-mappers";
import type { Database } from "@/lib/supabase/database.types";

type TimeUpdate = Database["public"]["Tables"]["time_entries"]["Update"];

async function requireCoord(request: Request) {
  const user = await getAuthUserFromRequest(request);
  if (!user || (!canAccessCoordination(user) && !isOwner(user))) return null;
  return user;
}

export async function GET(request: Request) {
  const user = await requireCoord(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const url = new URL(request.url);
  const technicianId = url.searchParams.get("technicianId");
  const supabase = createSupabaseAdminClient();

  try {
    let query = supabase
      .from("time_entries")
      .select("*")
      .order("clock_in_at", { ascending: false })
      .limit(200);
    if (technicianId) query = query.eq("technician_id", technicianId);
    const { data, error } = await query;
    if (error) throw new Error(migrationHint(error.message, "021_field_jobs_timesheets.sql"));
    return NextResponse.json({ entries: (data ?? []).map(timeEntryFromRow) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const user = await requireCoord(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = (await request.json()) as Record<string, unknown>;
  const action = String(body.action ?? "");
  const supabase = createSupabaseAdminClient();

  try {
    if (action === "adjust") {
      const entryId = String(body.entryId ?? "");
      const updates: TimeUpdate = { edited_by: user.id };
      if (body.clockInAt) updates.clock_in_at = String(body.clockInAt);
      if ("clockOutAt" in body) updates.clock_out_at = (body.clockOutAt as string) || null;
      const { error } = await supabase.from("time_entries").update(updates).eq("id", entryId);
      if (error) throw new Error(migrationHint(error.message, "021_field_jobs_timesheets.sql"));
      return NextResponse.json({ ok: true });
    }

    if (action === "manual_entry") {
      const id = makeId("te");
      const { error } = await supabase.from("time_entries").insert({
        id,
        technician_id: String(body.technicianId),
        job_id: (body.jobId as string) || null,
        clock_in_at: String(body.clockInAt),
        clock_out_at: (body.clockOutAt as string) || null,
        source: "manual",
        edited_by: user.id,
        created_at: new Date().toISOString(),
      });
      if (error) throw new Error(migrationHint(error.message, "021_field_jobs_timesheets.sql"));
      return NextResponse.json({ ok: true, entryId: id });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
