import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAuthUserFromRequest } from "@/lib/supabase/server-auth";
import { canAccessCoordination, canAccessSupport, isOwner } from "@/lib/permissions";
import { jobFromRow, makeId, migrationHint } from "@/lib/mobile/field-mappers";
import { appNotificationToRow } from "@/lib/supabase/mappers";
import type { AppNotification } from "@/lib/types";
import type { Database } from "@/lib/supabase/database.types";
import type { JobSource } from "@megs/shared";

type JobUpdate = Database["public"]["Tables"]["jobs"]["Update"];

async function requireJobsAccess(
  request: Request,
  opts?: { allowSupportJobCreate?: boolean }
) {
  const user = await getAuthUserFromRequest(request);
  if (!user) return null;
  if (canAccessCoordination(user) || isOwner(user)) return user;
  if (opts?.allowSupportJobCreate && canAccessSupport(user)) return user;
  return null;
}

function isSupportDispatchJob(body: Record<string, unknown>, action: string) {
  if (action !== "create") return false;
  const jobType = String(body.jobType ?? "");
  if (jobType === "tower_work" && (Boolean(body.towerId) || Boolean(body.towerSiteId))) {
    return true;
  }
  if (jobType === "service_call") return true;
  return false;
}

function resolveSource(
  bodySource: unknown,
  user: { role: string; department?: string | null }
): JobSource {
  if (bodySource === "owner" || bodySource === "support" || bodySource === "coordination") {
    return bodySource;
  }
  if (user.role === "owner") return "owner";
  if (user.department === "support") return "support";
  return "coordination";
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
  const user = await requireJobsAccess(request);
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
  const body = (await request.json()) as Record<string, unknown>;
  const action = String(body.action ?? "");
  const supportDispatch = isSupportDispatchJob(body, action);

  const user = await requireJobsAccess(request, {
    allowSupportJobCreate: supportDispatch,
  });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();

  try {
    if (action === "create") {
      // Support may create unassigned tower / service-call cards for coordination
      if (
        !canAccessCoordination(user) &&
        !isOwner(user) &&
        !(supportDispatch && canAccessSupport(user))
      ) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
      const source = resolveSource(body.source, user);
      const towerId = (body.towerId as string) || null;
      const towerSiteId = (body.towerSiteId as string) || null;
      const jobType = String(
        body.jobType ?? (towerSiteId || towerId ? "tower_work" : "general")
      );
      const title = String(body.title ?? "Job");
      const notes = String(body.notes ?? "");
      let technicianIds = (Array.isArray(body.technicianIds) ? body.technicianIds : []) as string[];

      // Support-only users submit unassigned tower cards for coordination to dispatch
      if (!canAccessCoordination(user) && !isOwner(user)) {
        technicianIds = [];
      }

      const id = makeId("job");
      const locationLat =
        typeof body.locationLat === "number" && Number.isFinite(body.locationLat)
          ? body.locationLat
          : null;
      const locationLng =
        typeof body.locationLng === "number" && Number.isFinite(body.locationLng)
          ? body.locationLng
          : null;

      const { error } = await supabase.from("jobs").insert({
        id,
        lead_id: (body.leadId as string) || null,
        title,
        address: String(body.address ?? ""),
        client_name: (body.clientName as string) || null,
        scheduled_start: (body.scheduledStart as string) || null,
        scheduled_end: (body.scheduledEnd as string) || null,
        status: "scheduled",
        notes,
        stock_request_id: (body.stockRequestId as string) || null,
        created_by: user.id,
        created_at: now,
        updated_at: now,
        source,
        tower_id: towerId,
        tower_site_id: towerSiteId,
        job_type: jobType,
        location_lat: locationLat,
        location_lng: locationLng,
        client_pppoe: String(body.clientPppoe ?? "").trim(),
      });
      if (error) {
        throw new Error(
          migrationHint(error.message, "031_job_client_pppoe.sql")
        );
      }

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

      if (source === "owner" || source === "support") {
        const isServiceCall = jobType === "service_call";
        const notif: AppNotification = {
          id: makeId("notif"),
          department: "coordination",
          type: isServiceCall ? "service_call_request" : "tower_work_request",
          title:
            source === "owner"
              ? `Owner job request: ${title}`
              : isServiceCall
                ? `Service call request: ${title}`
                : `Support job request: ${title}`,
          body:
            notes.slice(0, 240) ||
            (isServiceCall
              ? "New service call awaiting tech assignment"
              : "New tower work request awaiting tech assignment"),
          link: "/coordination/jobs",
          createdAt: now,
        };
        try {
          await supabase.from("app_notifications").insert(appNotificationToRow(notif));
        } catch {
          /* notifications table optional */
        }
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
      if ("towerId" in body) updates.tower_id = (body.towerId as string) || null;
      if ("towerSiteId" in body) updates.tower_site_id = (body.towerSiteId as string) || null;
      if (body.jobType !== undefined) updates.job_type = String(body.jobType);
      if (body.source !== undefined) updates.source = String(body.source);
      if (body.clientPppoe !== undefined) {
        updates.client_pppoe = String(body.clientPppoe ?? "").trim();
      }
      if ("locationLat" in body) {
        updates.location_lat =
          typeof body.locationLat === "number" && Number.isFinite(body.locationLat)
            ? body.locationLat
            : null;
      }
      if ("locationLng" in body) {
        updates.location_lng =
          typeof body.locationLng === "number" && Number.isFinite(body.locationLng)
            ? body.locationLng
            : null;
      }

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
