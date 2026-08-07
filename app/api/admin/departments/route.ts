import { NextResponse } from "next/server";
import { requireAccess } from "@/lib/supabase/server-auth";
import { adminClient, errorMessage } from "@/lib/api/route-helpers";

/**
 * Administration → Departments.
 *
 * Departments are org structure (where a person sits, who manages them), kept as
 * data rather than a hardcoded SQL CHECK so adding "HR" or "Legal" is an insert,
 * not a migration. Module access is separate — that lives in Access Control.
 *
 * GET  -> departments, staff counts, and the staff list for manager selection
 * POST -> create / update / delete / reorder a department
 *
 * Guarded by the admin module at `manage`.
 */

const MIGRATION_HINT = "run supabase/migrations/040_module_access.sql in Supabase.";

/** Lowercase slug for the primary key: "Human Resources" -> "human_resources". */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export async function GET(request: Request) {
  const actor = await requireAccess(request, "admin", "manage");
  if (!actor) {
    return NextResponse.json(
      { error: "Unauthorized — administration access required" },
      { status: 403 }
    );
  }

  try {
    const supabase = adminClient();
    const [departments, members] = await Promise.all([
      supabase.from("departments").select("*").order("sort_order"),
      supabase.from("team_members").select("id, name, department, role, active").order("name"),
    ]);
    if (departments.error) throw new Error(`${departments.error.message} — ${MIGRATION_HINT}`);

    const counts = new Map<string, number>();
    for (const m of members.data ?? []) {
      const d = m.department as string | null;
      if (d && m.active !== false) counts.set(d, (counts.get(d) ?? 0) + 1);
    }

    return NextResponse.json(
      {
        departments: (departments.data ?? []).map((d) => ({
          ...d,
          staffCount: counts.get(d.key as string) ?? 0,
        })),
        staff: (members.data ?? [])
          .filter((m) => m.active !== false)
          .map((m) => ({ id: m.id, name: m.name })),
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

interface Body {
  action?: "create" | "update" | "delete";
  key?: string;
  label?: string;
  managerId?: string | null;
  sortOrder?: number;
  active?: boolean;
}

export async function POST(request: Request) {
  const actor = await requireAccess(request, "admin", "manage");
  if (!actor) {
    return NextResponse.json(
      { error: "Unauthorized — administration access required" },
      { status: 403 }
    );
  }

  try {
    const body = (await request.json()) as Body;
    const supabase = adminClient();

    switch (body.action) {
      case "create": {
        if (!body.label?.trim()) {
          return NextResponse.json({ error: "Give the department a name" }, { status: 400 });
        }
        const key = (body.key?.trim() ? slugify(body.key) : slugify(body.label)) || "dept";
        const { data: existing } = await supabase
          .from("departments")
          .select("key")
          .eq("key", key)
          .maybeSingle();
        if (existing) {
          return NextResponse.json(
            { error: `A department with key "${key}" already exists` },
            { status: 400 }
          );
        }
        const { error } = await supabase.from("departments").insert({
          key,
          label: body.label.trim(),
          manager_id: body.managerId ?? null,
          sort_order: body.sortOrder ?? 100,
          active: true,
        });
        if (error) throw new Error(`${error.message} — ${MIGRATION_HINT}`);
        return NextResponse.json({ ok: true, key });
      }

      case "update": {
        if (!body.key) return NextResponse.json({ error: "key required" }, { status: 400 });
        const patch: Record<string, unknown> = {};
        if (body.label !== undefined) patch.label = body.label.trim();
        if (body.managerId !== undefined) patch.manager_id = body.managerId || null;
        if (body.sortOrder !== undefined) patch.sort_order = body.sortOrder;
        if (body.active !== undefined) patch.active = body.active;
        const { error } = await supabase
          .from("departments")
          .update(patch)
          .eq("key", body.key);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      case "delete": {
        if (!body.key) return NextResponse.json({ error: "key required" }, { status: 400 });
        // team_members.department is ON DELETE SET NULL, so staff are simply unassigned.
        const { error } = await supabase.from("departments").delete().eq("key", body.key);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
