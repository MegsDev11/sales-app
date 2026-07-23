import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAuthenticated } from "@/lib/supabase/server-auth";
import { makeId, migrationHint, timeOffFromRow } from "@/lib/mobile/field-mappers";
import type { LeaveType } from "@megs/shared";

const LEAVE_TYPES: LeaveType[] = ["family", "time_off", "sick", "unpaid"];

function techIdsFor(user: { id: string; authUserId?: string }) {
  const ids = [user.id];
  if (user.authUserId && user.authUserId !== user.id) ids.push(user.authUserId);
  return ids;
}

function calcDays(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return null;
  }
  const ms = end.getTime() - start.getTime();
  return Math.round(ms / 86400000) + 1;
}

export async function GET(request: Request) {
  const user = await requireAuthenticated(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const supabase = createSupabaseAdminClient();
  try {
    const { data, error } = await supabase
      .from("time_off_requests")
      .select("*")
      .in("technician_id", techIdsFor(user))
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(migrationHint(error.message, "024_time_off_requests.sql"));
    return NextResponse.json({
      requests: (data ?? []).map((row) => timeOffFromRow(row)),
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
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = (await request.json()) as Record<string, unknown>;
  const leaveType = String(body.leaveType ?? "") as LeaveType;
  const startDate = String(body.startDate ?? "").slice(0, 10);
  const endDate = String(body.endDate ?? "").slice(0, 10);
  const reason = String(body.reason ?? "").trim();

  if (!LEAVE_TYPES.includes(leaveType)) {
    return NextResponse.json({ error: "Invalid leave type" }, { status: 400 });
  }
  const days = calcDays(startDate, endDate);
  if (days == null) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }
  if (days > 90) {
    return NextResponse.json({ error: "Request cannot exceed 90 days" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const id = makeId("tof");

  try {
    const { data, error } = await supabase
      .from("time_off_requests")
      .insert({
        id,
        technician_id: user.id,
        leave_type: leaveType,
        start_date: startDate,
        end_date: endDate,
        days,
        reason,
        status: "pending",
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();
    if (error) throw new Error(migrationHint(error.message, "024_time_off_requests.sql"));
    return NextResponse.json({ ok: true, request: timeOffFromRow(data) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
