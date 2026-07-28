import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAccess } from "@/lib/supabase/server-auth";

/**
 * Staff performance API.
 *
 * One server-aggregated snapshot per staff member, so the page needs a single
 * request and works for anyone holding the `staff` module — a viewer who does not
 * also hold Coordination would otherwise be refused by the jobs and timesheet
 * endpoints.
 *
 * GET ?days=30 -> company totals plus a per-person row
 *
 * Ranges apply to things that HAPPENED (deals closed, jobs completed, hours
 * logged). Point-in-time figures (open leads, jobs in flight) are deliberately not
 * range-filtered — "how much is on your plate right now" is not a windowed number.
 */

function admin(): SupabaseClient {
  return createSupabaseAdminClient() as unknown as SupabaseClient;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const m = (error as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return "Request failed";
}

const ACTIVE_JOB_STATUSES = new Set(["scheduled", "en_route", "on_site"]);
const CLOSED_LEAD_STAGES = new Set(["closed_won", "closed_lost"]);

export async function GET(request: Request) {
  const user = await requireAccess(request, "staff", "view");
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized — staff access required" },
      { status: 403 }
    );
  }

  try {
    const supabase = admin();
    const url = new URL(request.url);
    const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days")) || 30));
    const since = new Date(Date.now() - days * 86400000);
    const sinceIso = since.toISOString();
    const inRange = (value: unknown) =>
      typeof value === "string" && value >= sinceIso;

    const [members, leads, jobs, assignments, timeEntries, bookings, activities] =
      await Promise.all([
        supabase.from("team_members").select("*").order("name"),
        supabase.from("leads").select("*"),
        supabase.from("jobs").select("id, status, created_at, updated_at"),
        supabase.from("job_assignments").select("job_id, technician_id"),
        supabase.from("time_entries").select("technician_id, clock_in_at, clock_out_at"),
        supabase.from("stock_bookings").select("technician_id, booked_out_at"),
        supabase.from("activities").select("lead_id, created_at"),
      ]);

    if (members.error) throw members.error;

    // ---- indexes -----------------------------------------------------------
    const jobById = new Map<string, { status: string; at: string }>();
    for (const j of jobs.data ?? []) {
      jobById.set(j.id as string, {
        status: (j.status as string) ?? "",
        at: (j.updated_at as string) ?? (j.created_at as string) ?? "",
      });
    }

    const leadOwner = new Map<string, string>();
    for (const l of leads.data ?? []) {
      const owner = l.assigned_to_id as string | null;
      if (owner) leadOwner.set(l.id as string, owner);
    }

    // Activities carry no author column, so they are attributed to whoever owns
    // the lead. Reported as "activity on their leads", not "actions they took".
    const activityByUser = new Map<string, number>();
    for (const a of activities.data ?? []) {
      if (!inRange(a.created_at)) continue;
      const owner = leadOwner.get(a.lead_id as string);
      if (owner) activityByUser.set(owner, (activityByUser.get(owner) ?? 0) + 1);
    }

    const jobsCompleted = new Map<string, number>();
    const jobsActive = new Map<string, number>();
    for (const a of assignments.data ?? []) {
      const tech = a.technician_id as string;
      const job = jobById.get(a.job_id as string);
      if (!job) continue;
      if (job.status === "completed") {
        if (inRange(job.at)) jobsCompleted.set(tech, (jobsCompleted.get(tech) ?? 0) + 1);
      } else if (ACTIVE_JOB_STATUSES.has(job.status)) {
        jobsActive.set(tech, (jobsActive.get(tech) ?? 0) + 1);
      }
    }

    const hoursByTech = new Map<string, number>();
    for (const t of timeEntries.data ?? []) {
      const start = t.clock_in_at as string | null;
      const end = t.clock_out_at as string | null;
      if (!start || !end || !inRange(start)) continue;
      const ms = new Date(end).getTime() - new Date(start).getTime();
      if (ms <= 0) continue;
      const tech = t.technician_id as string;
      hoursByTech.set(tech, (hoursByTech.get(tech) ?? 0) + ms / 3600000);
    }

    const bookedByTech = new Map<string, number>();
    for (const b of bookings.data ?? []) {
      if (!inRange(b.booked_out_at)) continue;
      const tech = b.technician_id as string;
      bookedByTech.set(tech, (bookedByTech.get(tech) ?? 0) + 1);
    }

    // ---- per-person rows ---------------------------------------------------
    const visibleLeads = (leads.data ?? []).filter(
      (l) => !(l as { deleted?: boolean }).deleted
    );

    const rows = (members.data ?? [])
      .filter((m) => m.role !== "owner")
      .map((m) => {
        const id = m.id as string;
        const mine = visibleLeads.filter((l) => l.assigned_to_id === id);

        const won = mine.filter(
          (l) => l.stage === "closed_won" && inRange(l.closed_at)
        );
        const lost = mine.filter(
          (l) => l.stage === "closed_lost" && inRange(l.closed_at)
        );
        const open = mine.filter((l) => !CLOSED_LEAD_STAGES.has(l.stage as string));
        const closedCount = won.length + lost.length;

        return {
          id,
          name: m.name as string,
          title: (m.title as string) ?? "",
          department: (m.department as string) ?? null,
          role: m.role as string,
          color: (m.color as string) ?? "#64748b",
          avatarInitials: (m.avatar_initials as string) ?? "",
          active: m.active !== false,
          revenueTarget: Number(m.monthly_revenue_target ?? 0),
          dealsTarget: Number(m.monthly_deals_target ?? 0),

          dealsWon: won.length,
          dealsLost: lost.length,
          revenue: won.reduce((s, l) => s + Number(l.deal_value ?? 0), 0),
          openLeads: open.length,
          openValue: open.reduce((s, l) => s + Number(l.deal_value ?? 0), 0),
          winRate: closedCount > 0 ? (won.length / closedCount) * 100 : 0,

          jobsCompleted: jobsCompleted.get(id) ?? 0,
          jobsActive: jobsActive.get(id) ?? 0,
          hours: Math.round((hoursByTech.get(id) ?? 0) * 10) / 10,
          itemsBookedOut: bookedByTech.get(id) ?? 0,
          activities: activityByUser.get(id) ?? 0,
        };
      });

    const active = rows.filter((r) => r.active);
    const totals = {
      activeStaff: active.length,
      dealsWon: rows.reduce((s, r) => s + r.dealsWon, 0),
      revenue: rows.reduce((s, r) => s + r.revenue, 0),
      jobsCompleted: rows.reduce((s, r) => s + r.jobsCompleted, 0),
      hours: Math.round(rows.reduce((s, r) => s + r.hours, 0) * 10) / 10,
    };

    return NextResponse.json(
      { rangeDays: days, since: sinceIso, totals, rows },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
