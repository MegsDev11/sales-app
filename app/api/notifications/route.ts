import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAuthenticated } from "@/lib/supabase/server-auth";
import { appNotificationFromRow } from "@/lib/supabase/mappers";
import { ACCESS_RANK, accessLevel, isAccessLevel } from "@/lib/access";
import { MODULE_KEYS, isModuleKey } from "@/lib/modules";
import type { User } from "@/lib/types";

/**
 * A notification reaches a user two ways: addressed to them (user_id), or
 * addressed to a module (the department column holds a module key; min_level
 * says how much of that module you need — the overdue sweep addresses
 * managers). Legacy rows wrote department='sales' for crm.
 *
 * The admin client bypasses RLS, so this route re-applies the same visibility
 * rule the 064 select policy enforces for direct Supabase reads.
 */

// The generated row type predates migration 064, so the two sweep columns
// (min_level, dedupe_key) ride alongside it as optionals.
type NotificationRow = Parameters<typeof appNotificationFromRow>[0] & {
  min_level?: string | null;
  dedupe_key?: string | null;
};

function visibleRow(user: User, row: NotificationRow): boolean {
  if (row.user_id === user.id) return true;
  if (!row.department) return false;
  const moduleKey = row.department === "sales" ? "crm" : row.department;
  if (!isModuleKey(moduleKey)) return false;
  const needed = isAccessLevel(row.min_level) ? row.min_level : "view";
  return ACCESS_RANK[accessLevel(user, moduleKey)] >= ACCESS_RANK[needed];
}

async function visibleUnread(user: User): Promise<NotificationRow[]> {
  const supabase = createSupabaseAdminClient();
  const orParts = [
    `user_id.eq.${user.id}`,
    ...MODULE_KEYS.filter((key) => accessLevel(user, key) !== "none").flatMap((key) =>
      key === "crm" ? ["department.eq.crm", "department.eq.sales"] : [`department.eq.${key}`]
    ),
  ];
  const { data, error } = await supabase
    .from("app_notifications")
    .select("*")
    .is("read_at", null)
    .or(orParts.join(","))
    .order("created_at", { ascending: false })
    .limit(120);
  if (error) throw error;
  return ((data ?? []) as NotificationRow[]).filter((row) => visibleRow(user, row));
}

export async function GET(request: Request) {
  const user = await requireAuthenticated(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const rows = (await visibleUnread(user)).slice(0, 40);
    return NextResponse.json(
      { notifications: rows.map(appNotificationFromRow) },
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
      const ids = (await visibleUnread(user)).map((row) => row.id);
      if (ids.length > 0) {
        const { error } = await supabase
          .from("app_notifications")
          .update({ read_at: now })
          .in("id", ids);
        if (error) throw error;
      }
      return NextResponse.json({ ok: true });
    }

    if (!body.id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const { data: row, error: readError } = await supabase
      .from("app_notifications")
      .select("*")
      .eq("id", body.id)
      .maybeSingle();
    if (readError) throw readError;
    if (!row || !visibleRow(user, row as NotificationRow)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
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
