import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAuthenticated } from "@/lib/supabase/server-auth";
import { makeId, migrationHint } from "@/lib/mobile/field-mappers";

export async function POST(request: Request) {
  const user = await requireAuthenticated(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = (await request.json()) as {
    pings?: { lat: number; lng: number; recordedAt?: string }[];
    timeEntryId?: string;
  };

  const pings = body.pings ?? [];
  if (!pings.length) return NextResponse.json({ ok: true, inserted: 0 });

  const supabase = createSupabaseAdminClient();
  try {
    const rows = pings.slice(0, 50).map((p) => ({
      id: makeId("lp"),
      technician_id: user.id,
      time_entry_id: body.timeEntryId || null,
      lat: p.lat,
      lng: p.lng,
      recorded_at: p.recordedAt || new Date().toISOString(),
    }));
    const { error } = await supabase.from("location_pings").insert(rows);
    if (error) throw new Error(migrationHint(error.message, "021_field_jobs_timesheets.sql"));
    return NextResponse.json({ ok: true, inserted: rows.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
