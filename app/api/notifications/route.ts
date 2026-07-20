import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAuthenticated } from "@/lib/supabase/server-auth";
import { appNotificationFromRow } from "@/lib/supabase/mappers";
import { canAccessCoordination, canAccessStock, isOwner } from "@/lib/permissions";

export async function GET(request: Request) {
  const user = await requireAuthenticated(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const departments: string[] = [];
    if (isOwner(user) || canAccessStock(user)) departments.push("stock");
    if (isOwner(user) || canAccessCoordination(user)) departments.push("coordination");

    let query = supabase
      .from("app_notifications")
      .select("*")
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(40);

    if (departments.length > 0) {
      query = query.or(
        [`user_id.eq.${user.id}`, ...departments.map((d) => `department.eq.${d}`)].join(",")
      );
    } else {
      query = query.eq("user_id", user.id);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json(
      { notifications: (data ?? []).map(appNotificationFromRow) },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load notifications";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await requireAuthenticated(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = (await request.json()) as { id?: string; markAllRead?: boolean };
    const supabase = createSupabaseAdminClient();
    const now = new Date().toISOString();

    if (body.markAllRead) {
      const departments: string[] = [];
      if (isOwner(user) || canAccessStock(user)) departments.push("stock");
      if (isOwner(user) || canAccessCoordination(user)) departments.push("coordination");

      let query = supabase.from("app_notifications").update({ read_at: now }).is("read_at", null);
      if (departments.length > 0) {
        query = query.or(
          [`user_id.eq.${user.id}`, ...departments.map((d) => `department.eq.${d}`)].join(",")
        );
      } else {
        query = query.eq("user_id", user.id);
      }
      const { error } = await query;
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (!body.id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("app_notifications")
      .update({ read_at: now })
      .eq("id", body.id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update notification";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
