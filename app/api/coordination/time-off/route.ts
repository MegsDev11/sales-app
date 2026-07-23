import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAuthUserFromRequest } from "@/lib/supabase/server-auth";
import { canAccessCoordination, isOwner } from "@/lib/permissions";
import { migrationHint, timeOffFromRow } from "@/lib/mobile/field-mappers";

async function requireCoord(request: Request) {
  const user = await getAuthUserFromRequest(request);
  if (!user || (!canAccessCoordination(user) && !isOwner(user))) return null;
  return user;
}

export async function GET(request: Request) {
  const user = await requireCoord(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const supabase = createSupabaseAdminClient();

  try {
    let query = supabase
      .from("time_off_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (status && ["pending", "approved", "declined"].includes(status)) {
      query = query.eq("status", status);
    }
    const { data, error } = await query;
    if (error) throw new Error(migrationHint(error.message, "024_time_off_requests.sql"));

    const techIds = [...new Set((data ?? []).map((r) => r.technician_id))];
    const names = new Map<string, string>();
    if (techIds.length) {
      const { data: techs } = await supabase
        .from("team_members")
        .select("id, name")
        .in("id", techIds);
      for (const t of techs ?? []) names.set(t.id, t.name);
    }

    return NextResponse.json({
      requests: (data ?? []).map((row) =>
        timeOffFromRow(row, names.get(row.technician_id))
      ),
    });
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
  const requestId = String(body.requestId ?? "");
  const reviewNote = String(body.reviewNote ?? "").trim();

  if (!requestId) {
    return NextResponse.json({ error: "requestId required" }, { status: 400 });
  }
  if (action !== "approve" && action !== "decline") {
    return NextResponse.json({ error: "action must be approve or decline" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();

  try {
    const { data: existing, error: findError } = await supabase
      .from("time_off_requests")
      .select("*")
      .eq("id", requestId)
      .maybeSingle();
    if (findError) throw new Error(migrationHint(findError.message, "024_time_off_requests.sql"));
    if (!existing) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }
    if (existing.status !== "pending") {
      return NextResponse.json(
        { error: `Request already ${existing.status}` },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("time_off_requests")
      .update({
        status: action === "approve" ? "approved" : "declined",
        reviewed_by: user.id,
        reviewed_at: now,
        review_note: reviewNote,
        updated_at: now,
      })
      .eq("id", requestId)
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
