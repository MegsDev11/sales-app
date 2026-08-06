import { NextResponse } from "next/server";
import { requireAccess } from "@/lib/supabase/server-auth";
import { adminClient, errorMessage } from "@/lib/api/route-helpers";

/**
 * The access trail, finally readable.
 *
 * Migration 044 put triggers on team_members, user_module_access,
 * access_template_modules, modules and departments, and has been recording
 * every change ever since — with nothing in the app to read it. So the answer
 * to "who gave them that, and when" existed all along and could only be got at
 * with SQL. This is the reader.
 *
 * It reports rather than interprets: each row says who, what, which record,
 * and which fields moved. Deliberately read-only — an audit trail nobody can
 * edit is the only kind worth having.
 */

export const runtime = "nodejs";

const MIGRATION_HINT = "run supabase/migrations/044_audit_log_and_password_cleanup.sql in Supabase.";

/** Fields that say nothing and would drown the real change. */
const NOISE = new Set(["updated_at", "granted_at", "at", "created_at"]);

/** Never echo a secret into the audit screen, even one already stored. */
const SECRET = /password|ciphertext|hash|token|pin|secret/i;

interface Change {
  field: string;
  before: string | null;
  after: string | null;
}

const show = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

/** What actually moved between two snapshots. */
function diff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null
): Change[] {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const changes: Change[] = [];
  for (const field of keys) {
    if (NOISE.has(field)) continue;
    const from = before?.[field];
    const to = after?.[field];
    if (JSON.stringify(from ?? null) === JSON.stringify(to ?? null)) continue;
    if (SECRET.test(field)) {
      changes.push({ field, before: from == null ? null : "•••", after: to == null ? null : "•••" });
      continue;
    }
    changes.push({ field, before: show(from), after: show(to) });
  }
  return changes.sort((a, b) => a.field.localeCompare(b.field));
}

export async function GET(request: Request) {
  const user = await requireAccess(request, "admin", "view");
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized — administration access required" },
      { status: 403 }
    );
  }

  try {
    const db = adminClient();
    const url = new URL(request.url);
    const entityType = url.searchParams.get("entityType")?.trim();
    const actorId = url.searchParams.get("actorId")?.trim();
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 100) || 100, 300);

    let query = db
      .from("audit_log")
      .select("*")
      .order("at", { ascending: false })
      .limit(limit);
    if (entityType && entityType !== "all") query = query.eq("entity_type", entityType);
    if (actorId && actorId !== "all") query = query.eq("actor_id", actorId);

    const { data, error } = await query;
    if (error) {
      throw new Error(
        /does not exist|schema cache/i.test(error.message)
          ? `${error.message} — ${MIGRATION_HINT}`
          : error.message
      );
    }

    const rows = (data ?? []) as Record<string, unknown>[];

    // Entity ids are opaque; resolve the ones that name a person so a row can
    // read "Herman changed Wesley's access" instead of two ids.
    const memberIds = new Set<string>();
    for (const r of rows) {
      if (r.actor_id) memberIds.add(String(r.actor_id));
      if (r.entity_type === "team_members" && r.entity_id) memberIds.add(String(r.entity_id));
      const after = (r.after ?? {}) as Record<string, unknown>;
      const before = (r.before ?? {}) as Record<string, unknown>;
      for (const snap of [after, before]) {
        if (snap.user_id) memberIds.add(String(snap.user_id));
      }
    }
    const { data: members } = memberIds.size
      ? await db.from("team_members").select("id, name").in("id", [...memberIds])
      : { data: [] as { id: string; name: string }[] };
    const nameById = new Map(
      ((members ?? []) as { id: string; name: string }[]).map((m) => [m.id, m.name])
    );

    const entries = rows.map((r) => {
      const before = (r.before ?? null) as Record<string, unknown> | null;
      const after = (r.after ?? null) as Record<string, unknown> | null;
      const subjectId =
        r.entity_type === "team_members"
          ? String(r.entity_id ?? "")
          : String((after?.user_id ?? before?.user_id ?? "") as string);
      return {
        id: Number(r.id),
        at: String(r.at),
        action: String(r.action),
        entityType: String(r.entity_type),
        entityId: r.entity_id == null ? null : String(r.entity_id),
        actorName:
          (r.actor_name as string | null) ??
          (r.actor_id ? nameById.get(String(r.actor_id)) ?? null : null),
        // Who the change was ABOUT, when that is a person.
        subjectName: subjectId ? nameById.get(subjectId) ?? null : null,
        changes: diff(before, after),
      };
    });

    // The filter options come from what is actually in the log.
    const entityTypes = [...new Set(rows.map((r) => String(r.entity_type)))].sort();

    return NextResponse.json(
      { entries, entityTypes },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
