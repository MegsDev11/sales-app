import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAuthUserFromRequest } from "@/lib/supabase/server-auth";
import { canAccessCoordination, isOwner } from "@/lib/permissions";
import { jobFromRow, makeId, migrationHint } from "@/lib/mobile/field-mappers";
import type { Database } from "@/lib/supabase/database.types";

type JobUpdate = Database["public"]["Tables"]["jobs"]["Update"];

async function requireCoord(request: Request) {
  const user = await getAuthUserFromRequest(request);
  if (!user || (!canAccessCoordination(user) && !isOwner(user))) return null;
  return user;
}

async function loadJobs(technicianId?: string) {
  const supabase = createSupabaseAdminClient();
  const { data: jobs, error } = await supabase
    .from("jobs")
    .select("*")
    .order("scheduled_start", { ascending: true, nullsFirst: false });
  if (error) throw new Error(migrationHint(error.message, "021_field_jobs_timesheets.sql"));

  const { data: assignments } = await supabase.from("job_assignments").select("*");
  const byJob = new Map<string, string[]>();
  for (const a of assignments ?? []) {
    const list = byJob.get(a.job_id) ?? [];
    list.push(a.technician_id);
    byJob.set(a.job_id, list);
  }

  let mapped = (jobs ?? []).map((row) => jobFromRow(row, byJob.get(row.id) ?? []));
  if (technicianId) {
    mapped = mapped.filter((j) => j.technicianIds?.includes(technicianId));
  }
  return mapped;
}

export async function GET(request: Request) {
  const user = await requireCoord(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  try {
    const jobs = await loadJobs();
    return NextResponse.json({ jobs });
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
  const now = new Date().toISOString();

  try {
    if (action === "create") {
      const id = makeId("job");
      const technicianIds = (Array.isArray(body.technicianIds) ? body.technicianIds : []) as string[];
      const { error } = await supabase.from("jobs").insert({
        id,
        lead_id: (body.leadId as string) || null,
        title: String(body.title ?? "Job"),
        address: String(body.address ?? ""),
        client_name: (body.clientName as string) || null,
        scheduled_start: (body.scheduledStart as string) || null,
        scheduled_end: (body.scheduledEnd as string) || null,
        status: "scheduled",
        notes: String(body.notes ?? ""),
        stock_request_id: (body.stockRequestId as string) || null,
        created_by: user.id,
        created_at: now,
        updated_at: now,
      });
      if (error) throw new Error(migrationHint(error.message, "021_field_jobs_timesheets.sql"));

      if (technicianIds.length) {
        await supabase.from("job_assignments").insert(
          technicianIds.map((tid, i) => ({
            id: makeId("ja"),
            job_id: id,
            technician_id: tid,
            is_primary: i === 0,
            created_at: now,
          }))
        );
      }

      const jobs = await loadJobs();
      return NextResponse.json({ ok: true, jobId: id, jobs });
    }

    if (action === "update") {
      const jobId = String(body.jobId ?? "");
      const updates: JobUpdate = { updated_at: now };
      if (body.title !== undefined) updates.title = String(body.title);
      if (body.address !== undefined) updates.address = String(body.address);
      if (body.notes !== undefined) updates.notes = String(body.notes);
      if (body.status !== undefined) updates.status = String(body.status);
      if (body.scheduledStart !== undefined) updates.scheduled_start = (body.scheduledStart as string) || null;
      if (body.scheduledEnd !== undefined) updates.scheduled_end = (body.scheduledEnd as string) || null;
      if ("leadId" in body) updates.lead_id = (body.leadId as string) || null;
      if ("clientName" in body) updates.client_name = (body.clientName as string) || null;

      const { error } = await supabase.from("jobs").update(updates).eq("id", jobId);
      if (error) throw new Error(migrationHint(error.message, "021_field_jobs_timesheets.sql"));

      if (Array.isArray(body.technicianIds)) {
        await supabase.from("job_assignments").delete().eq("job_id", jobId);
        const tids = body.technicianIds as string[];
        if (tids.length) {
          await supabase.from("job_assignments").insert(
            tids.map((tid, i) => ({
              id: makeId("ja"),
              job_id: jobId,
              technician_id: tid,
              is_primary: i === 0,
              created_at: now,
            }))
          );
        }
      }

      const jobs = await loadJobs();
      return NextResponse.json({ ok: true, jobs });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
