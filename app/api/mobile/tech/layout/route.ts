import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAuthenticated } from "@/lib/supabase/server-auth";
import { migrationHint } from "@/lib/mobile/field-mappers";
import {
  createNetworkLayoutSubmission,
  parseSubmissionFilesFromForm,
  wirelessMigrationHint,
} from "@/lib/wireless/create-submission";
import { networkDeviceFromRow, networkLayoutFromRow } from "@/lib/wireless/mappers";

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

    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select("id, lead_id, title, client_name")
      .eq("id", jobId)
      .maybeSingle();
    if (jobErr) throw new Error(migrationHint(jobErr.message, "001_initial_schema.sql"));
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    const leadId = job.lead_id as string | null;
    if (!leadId) {
      return NextResponse.json({
        leadId: null,
        layout: null,
        devices: [],
        openSubmissions: 0,
      });
    }

    const { data: layout, error: layoutErr } = await supabase
      .from("network_layouts")
      .select("*")
      .eq("lead_id", leadId)
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (layoutErr) {
      throw new Error(wirelessMigrationHint(layoutErr.message));
    }

    const { count } = await supabase
      .from("network_layout_submissions")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", leadId)
      .in("status", ["new", "in_progress"]);

    if (!layout) {
      return NextResponse.json({
        leadId,
        layout: null,
        devices: [],
        openSubmissions: count ?? 0,
      });
    }

    const { data: devices } = await supabase
      .from("network_devices")
      .select("*")
      .eq("layout_id", layout.id);

    const mapped = networkLayoutFromRow(
      {
        ...layout,
        canvas_json: layout.canvas_json as never,
      },
      (devices ?? []).map(networkDeviceFromRow),
      []
    );

    return NextResponse.json({
      leadId,
      layout: mapped,
      devices: mapped.devices ?? [],
      openSubmissions: count ?? 0,
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

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: "multipart/form-data required" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const techIds = techIdsFor(user);

  try {
    const form = await request.formData();
    const jobId = String(form.get("jobId") ?? "").trim();
    if (!jobId) {
      return NextResponse.json({ error: "jobId required" }, { status: 400 });
    }

    if (!(await assertAssigned(supabase, jobId, techIds))) {
      return NextResponse.json({ error: "Not assigned to this job" }, { status: 403 });
    }

    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select("id, lead_id, title, client_name")
      .eq("id", jobId)
      .maybeSingle();
    if (jobErr) throw new Error(migrationHint(jobErr.message, "001_initial_schema.sql"));
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    const leadId = (job.lead_id as string | null) || null;
    const techNote = String(form.get("notes") ?? "").trim();
    const clientLabel = (job.client_name as string | null)?.trim() || "Client";
    const jobTitle = (job.title as string | null)?.trim() || "Job";
    const notes = [
      `Tech layout from job ${jobId}`,
      `${clientLabel} — ${jobTitle}`,
      `Submitted by ${user.name ?? "technician"}`,
      techNote || null,
    ]
      .filter(Boolean)
      .join("\n");

    const files = parseSubmissionFilesFromForm(form);
    if (!files.length) {
      return NextResponse.json(
        { error: "Add at least one sketch or photo" },
        { status: 400 }
      );
    }

    const { submissionId } = await createNetworkLayoutSubmission({
      supabase,
      leadId,
      notes,
      createdBy: user.id,
      files,
    });

    return NextResponse.json({ ok: true, submissionId, leadId });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
