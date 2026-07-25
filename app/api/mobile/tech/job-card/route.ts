import { NextResponse } from "next/server";
import {
  emptyJobCardPayload,
  type JobCardPayload,
} from "@megs/shared";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAuthenticated } from "@/lib/supabase/server-auth";
import type { Json } from "@/lib/supabase/database.types";
import { makeId, migrationHint } from "@/lib/mobile/field-mappers";
import { jobCardFromRow, validateJobCardPayload } from "@/lib/mobile/job-card";

function isFieldTech(user: { role: string; department: string | null }) {
  return (
    user.department === "coordination" ||
    (user.department === "stock" && user.role === "staff")
  );
}

function techIdsFor(user: { id: string; authUserId?: string }) {
  const ids = [user.id];
  if (user.authUserId && user.authUserId !== user.id) {
    ids.push(user.authUserId);
  }
  return ids;
}

async function assertAssigned(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  jobId: string,
  techIds: string[]
) {
  const { data: assignment } = await supabase
    .from("job_assignments")
    .select("id")
    .eq("job_id", jobId)
    .in("technician_id", techIds)
    .limit(1)
    .maybeSingle();
  return !!assignment;
}

export async function GET(request: Request) {
  const user = await requireAuthenticated(request);
  if (!user || !isFieldTech(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const jobId = new URL(request.url).searchParams.get("jobId")?.trim() ?? "";
  if (!jobId) {
    return NextResponse.json({ error: "jobId required" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const techIds = techIdsFor(user);

  try {
    if (!(await assertAssigned(supabase, jobId, techIds))) {
      return NextResponse.json({ error: "Not assigned to this job" }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("job_card_submissions")
      .select("*")
      .eq("job_id", jobId)
      .in("technician_id", techIds)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(migrationHint(error.message, "030_job_card_submissions.sql"));

    if (!data) {
      const { data: job } = await supabase
        .from("jobs")
        .select("client_name")
        .eq("id", jobId)
        .maybeSingle();
      return NextResponse.json({
        submission: null,
        payload: emptyJobCardPayload({
          clientNameSurname: job?.client_name ?? "",
          technicians: user.name ?? "",
        }),
      });
    }

    const submission = jobCardFromRow(data);
    return NextResponse.json({ submission, payload: submission.payload });
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
  const action = String(body.action ?? "save");
  const jobId = String(body.jobId ?? "").trim();
  if (!jobId) {
    return NextResponse.json({ error: "jobId required" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const techIds = techIdsFor(user);
  const now = new Date().toISOString();

  try {
    if (!(await assertAssigned(supabase, jobId, techIds))) {
      return NextResponse.json({ error: "Not assigned to this job" }, { status: 403 });
    }

    const incoming =
      body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
        ? ({ ...emptyJobCardPayload(), ...(body.payload as Partial<JobCardPayload>) } as JobCardPayload)
        : emptyJobCardPayload();

    if (action === "submit") {
      const invalid = validateJobCardPayload(incoming);
      if (invalid) {
        return NextResponse.json({ error: invalid }, { status: 400 });
      }
    }

    const { data: existing } = await supabase
      .from("job_card_submissions")
      .select("id, status, technician_id")
      .eq("job_id", jobId)
      .in("technician_id", techIds)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.status === "submitted" && action !== "submit") {
      return NextResponse.json({ error: "Job card already submitted" }, { status: 400 });
    }

    const row = {
      job_id: jobId,
      technician_id: existing?.technician_id ?? user.id,
      status: action === "submit" ? "submitted" : "draft",
      payload: incoming as unknown as Json,
      submitted_at: action === "submit" ? now : null,
      updated_at: now,
    };

    let submissionId = existing?.id;
    if (existing?.id) {
      const { error } = await supabase
        .from("job_card_submissions")
        .update(row)
        .eq("id", existing.id);
      if (error) throw new Error(migrationHint(error.message, "030_job_card_submissions.sql"));
    } else {
      submissionId = makeId("jcs");
      const { error } = await supabase.from("job_card_submissions").insert({
        id: submissionId,
        ...row,
        created_at: now,
      });
      if (error) throw new Error(migrationHint(error.message, "030_job_card_submissions.sql"));
    }

    if (action === "submit") {
      const { data: current } = await supabase
        .from("jobs")
        .select("status")
        .eq("id", jobId)
        .maybeSingle();
      if (current?.status !== "completed" && current?.status !== "cancelled") {
        await supabase
          .from("jobs")
          .update({ status: "completed", updated_at: now })
          .eq("id", jobId);
        await supabase.from("job_status_events").insert({
          id: makeId("jse"),
          job_id: jobId,
          from_status: current?.status ?? null,
          to_status: "completed",
          changed_by: user.id,
          lat: typeof incoming.locationLat === "number" ? incoming.locationLat : null,
          lng: typeof incoming.locationLng === "number" ? incoming.locationLng : null,
          created_at: now,
        });
      }
    }

    const { data: saved, error: readErr } = await supabase
      .from("job_card_submissions")
      .select("*")
      .eq("id", submissionId!)
      .maybeSingle();
    if (readErr) throw new Error(migrationHint(readErr.message, "030_job_card_submissions.sql"));

    return NextResponse.json({
      ok: true,
      submission: saved ? jobCardFromRow(saved) : null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
