import { NextResponse } from "next/server";
import type { CoordinationJobCardRow } from "@megs/shared";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAuthUserFromRequest } from "@/lib/supabase/server-auth";
import { canAccessCoordination, isOwner } from "@/lib/permissions";
import { migrationHint } from "@/lib/mobile/field-mappers";
import { jobCardFromRow } from "@/lib/mobile/job-card";

async function requireCoord(request: Request) {
  const user = await getAuthUserFromRequest(request);
  if (!user || (!canAccessCoordination(user) && !isOwner(user))) return null;
  return user;
}

export async function GET(request: Request) {
  const user = await requireCoord(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const supabase = createSupabaseAdminClient();
  const statusFilter =
    new URL(request.url).searchParams.get("status")?.trim() || "submitted";

  try {
    let query = supabase
      .from("job_card_submissions")
      .select("*")
      .order("submitted_at", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false });

    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    const { data: rows, error } = await query;
    if (error) {
      throw new Error(migrationHint(error.message, "030_job_card_submissions.sql"));
    }

    const list = rows ?? [];
    if (!list.length) {
      return NextResponse.json({ cards: [] as CoordinationJobCardRow[] });
    }

    const jobIds = [...new Set(list.map((r) => r.job_id))];
    const techIds = [...new Set(list.map((r) => r.technician_id))];

    const [{ data: jobs }, { data: techs }] = await Promise.all([
      supabase
        .from("jobs")
        .select("id, title, client_name, address, job_type")
        .in("id", jobIds),
      supabase.from("team_members").select("id, name").in("id", techIds),
    ]);

    const jobById = new Map((jobs ?? []).map((j) => [j.id, j]));
    const techById = new Map((techs ?? []).map((t) => [t.id, t]));

    const cards: CoordinationJobCardRow[] = list.map((row) => {
      const submission = jobCardFromRow(row);
      const job = jobById.get(row.job_id);
      const tech = techById.get(row.technician_id);
      return {
        ...submission,
        jobTitle: job?.title ?? "Job",
        jobClientName: job?.client_name ?? null,
        jobAddress: job?.address ?? "",
        jobType: job?.job_type ?? null,
        technicianName: tech?.name ?? row.technician_id,
      };
    });

    return NextResponse.json({ cards });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
