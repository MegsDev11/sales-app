import { NextResponse } from "next/server";
import {
  DEFAULT_OT_SETTINGS,
  type OtMode,
  entryDurationMinutes,
  splitMinutesForSettings,
} from "@megs/shared";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAuthUserFromRequest } from "@/lib/supabase/server-auth";
import { canAccessCoordination, isOwner } from "@/lib/permissions";
import {
  makeId,
  migrationHint,
  otSettingsFromRow,
  timeEntryFromRow,
} from "@/lib/mobile/field-mappers";
import type { Database } from "@/lib/supabase/database.types";

type TimeUpdate = Database["public"]["Tables"]["time_entries"]["Update"];

async function requireCoord(request: Request) {
  const user = await getAuthUserFromRequest(request);
  if (!user || (!canAccessCoordination(user) && !isOwner(user))) return null;
  return user;
}

async function loadOtSettings(
  supabase: ReturnType<typeof createSupabaseAdminClient>
) {
  const { data, error } = await supabase
    .from("ot_settings")
    .select("*")
    .eq("id", "default")
    .maybeSingle();
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) {
      return { ...DEFAULT_OT_SETTINGS };
    }
    throw new Error(migrationHint(error.message, "028_overtime_settings.sql"));
  }
  return otSettingsFromRow(data);
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

    const [{ data, error }, otSettings] = await Promise.all([
      query,
      loadOtSettings(supabase),
    ]);
    if (error) throw new Error(migrationHint(error.message, "021_field_jobs_timesheets.sql"));

    const now = new Date();
    const entries = (data ?? []).map((row) => {
      const entry = timeEntryFromRow(row);
      const total = entryDurationMinutes(entry, now);
      const weekday = new Date(entry.clockInAt).getDay();
      const split = splitMinutesForSettings(total, otSettings, weekday);
      return {
        ...entry,
        durationMinutes: total,
        regularMinutes: split.regularMinutes,
        otMinutes: split.otMinutes,
      };
    });

    return NextResponse.json({ entries, otSettings });
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

    if (action === "update_ot_settings") {
      const modeRaw = String(body.mode ?? "daily");
      const mode: OtMode =
        modeRaw === "weekly" || modeRaw === "both" || modeRaw === "daily"
          ? modeRaw
          : "daily";
      const dailyHours = Number(body.dailyThresholdHours ?? body.dailyHours ?? 8);
      const weeklyHours = Number(body.weeklyThresholdHours ?? body.weeklyHours ?? 40);
      const weekendAsOt = Boolean(body.weekendAsOt);
      if (!Number.isFinite(dailyHours) || dailyHours < 0 || dailyHours > 24) {
        return NextResponse.json({ error: "Invalid daily threshold" }, { status: 400 });
      }
      if (!Number.isFinite(weeklyHours) || weeklyHours < 0 || weeklyHours > 168) {
        return NextResponse.json({ error: "Invalid weekly threshold" }, { status: 400 });
      }

      const payload = {
        id: "default",
        mode,
        daily_threshold_minutes: Math.round(dailyHours * 60),
        weekly_threshold_minutes: Math.round(weeklyHours * 60),
        weekend_as_ot: weekendAsOt,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      };

      const { data, error } = await supabase
        .from("ot_settings")
        .upsert(payload, { onConflict: "id" })
        .select("*")
        .single();
      if (error) throw new Error(migrationHint(error.message, "028_overtime_settings.sql"));
      return NextResponse.json({ ok: true, otSettings: otSettingsFromRow(data) });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
