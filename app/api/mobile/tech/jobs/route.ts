import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAuthenticated } from "@/lib/supabase/server-auth";
import { jobFromRow, makeId, migrationHint } from "@/lib/mobile/field-mappers";

function isFieldTech(user: { role: string; department: string | null }) {
  return (
    user.department === "coordination" ||
    (user.department === "stock" && user.role === "staff")
  );
}

export async function GET(request: Request) {
  const user = await requireAuthenticated(request);
  if (!user || !isFieldTech(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const supabase = createSupabaseAdminClient();
  try {
    const { data: assignments, error: aErr } = await supabase
      .from("job_assignments")
      .select("job_id")
      .eq("technician_id", user.id);
    if (aErr) throw new Error(migrationHint(aErr.message, "021_field_jobs_timesheets.sql"));

    const jobIds = (assignments ?? []).map((a) => a.job_id);
    if (!jobIds.length) return NextResponse.json({ jobs: [] });

    const { data: jobs, error } = await supabase
      .from("jobs")
      .select("*")
      .in("id", jobIds)
      .neq("status", "cancelled")
      .order("scheduled_start", { ascending: true });
    if (error) throw new Error(migrationHint(error.message, "021_field_jobs_timesheets.sql"));

    return NextResponse.json({
      jobs: (jobs ?? []).map((row) => jobFromRow(row, [user.id])),
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
  if (!user || !isFieldTech(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = (await request.json()) as Record<string, unknown>;
  const action = String(body.action ?? "");
  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();

  try {
    if (action === "update_status") {
      const jobId = String(body.jobId ?? "");
      const toStatus = String(body.status ?? "");
      const { data: assignment } = await supabase
        .from("job_assignments")
        .select("id")
        .eq("job_id", jobId)
        .eq("technician_id", user.id)
        .maybeSingle();
      if (!assignment) {
        return NextResponse.json({ error: "Not assigned to this job" }, { status: 403 });
      }

      const { data: current } = await supabase
        .from("jobs")
        .select("status")
        .eq("id", jobId)
        .maybeSingle();

      const { error } = await supabase
        .from("jobs")
        .update({ status: toStatus, updated_at: now })
        .eq("id", jobId);
      if (error) throw new Error(migrationHint(error.message, "021_field_jobs_timesheets.sql"));

      await supabase.from("job_status_events").insert({
        id: makeId("jse"),
        job_id: jobId,
        from_status: current?.status ?? null,
        to_status: toStatus,
        changed_by: user.id,
        lat: typeof body.lat === "number" ? body.lat : null,
        lng: typeof body.lng === "number" ? body.lng : null,
        created_at: now,
      });

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
