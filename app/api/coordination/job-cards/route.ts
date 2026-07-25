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
  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status")?.trim() || "submitted";
  const q = url.searchParams.get("q")?.trim().toLowerCase() || "";

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
      throw new Error(
        migrationHint(
          error.message,
          /card_number/i.test(error.message)
            ? "038_job_card_number.sql"
            : "030_job_card_submissions.sql"
        )
      );
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

    let cards: CoordinationJobCardRow[] = list.map((row) => {
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

    if (q) {
      cards = cards.filter((card) => {
        const hay = [
          card.cardNumber,
          card.jobTitle,
          card.jobClientName,
          card.jobAddress,
          card.technicianName,
          card.payload.clientNameSurname,
          card.payload.technicians,
          card.payload.workDone,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

    return NextResponse.json({ cards });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
