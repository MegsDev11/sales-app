import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/supabase/server-auth";
import { adminClient, errorMessage, newId } from "@/lib/api/route-helpers";
import { can, isOwnerRole } from "@/lib/access";
import { isModuleKey } from "@/lib/modules";
import type { User } from "@/lib/types";

/**
 * The day's work, per department.
 *
 * GET  ?department=&day=  -> that department's list for that day (defaults to
 *                            the caller's own department and today), plus the
 *                            departments this person may switch to
 * POST                    -> complete / reopen an item, add a manual one,
 *                            delete a manual one, or manage the standing
 *                            duties behind the generated list
 *
 * Deliberately open at read: everyone signed in can look at any department's
 * list, because "who is doing what today" is the whole point. Writing is
 * limited to the item's assignee, someone with edit on that department's
 * module, or an administrator — mirroring the RLS in migration 071.
 */

export const runtime = "nodejs";

const MIGRATION_HINT = "run supabase/migrations/071_todos_supplier_prices_market.sql in Supabase.";

const withHint = (message: string) =>
  /does not exist|schema cache/i.test(message) ? `${message} — ${MIGRATION_HINT}` : message;

/** Departments map to modules by the same rule the notifications engine uses. */
const moduleForDepartment = (department: string) =>
  department === "sales" ? "crm" : department;

function mayEditDepartment(user: User, department: string): boolean {
  if (isOwnerRole(user) || can(user, "admin", "manage")) return true;
  const key = moduleForDepartment(department);
  return isModuleKey(key) ? can(user, key, "edit") : false;
}

const today = () => new Date().toISOString().slice(0, 10);

export async function GET(request: Request) {
  const user = await requireAuthenticated(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  try {
    const db = adminClient();
    const url = new URL(request.url);
    const day = url.searchParams.get("day") ?? today();
    const department = url.searchParams.get("department") ?? user.department ?? "";

    const { data: departments } = await db
      .from("departments")
      .select("key, label")
      .eq("active", true)
      .order("sort_order");

    if (!department) {
      return NextResponse.json(
        {
          items: [],
          departments: departments ?? [],
          department: "",
          day,
          canEdit: false,
          note: "You are not assigned to a department — pick one to see its list.",
        },
        { headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }

    const [itemsRes, templatesRes] = await Promise.all([
      db
        .from("todo_items")
        .select("*")
        .eq("department_key", department)
        .eq("due_on", day)
        .order("done_at", { nullsFirst: true })
        .order("created_at"),
      db
        .from("todo_templates")
        .select("*")
        .eq("department_key", department)
        .order("sort_order"),
    ]);
    if (itemsRes.error) throw new Error(withHint(itemsRes.error.message));

    const rows = (itemsRes.data ?? []) as Record<string, unknown>[];
    const memberIds = [
      ...new Set(
        rows.flatMap((r) =>
          [r.assignee_id, r.done_by].filter(Boolean).map((v) => String(v))
        )
      ),
    ];
    const { data: members } = memberIds.length
      ? await db.from("team_members").select("id, name").in("id", memberIds)
      : { data: [] as { id: string; name: string }[] };
    const nameById = new Map(
      ((members ?? []) as { id: string; name: string }[]).map((m) => [m.id, m.name])
    );

    return NextResponse.json(
      {
        day,
        department,
        departments: departments ?? [],
        canEdit: mayEditDepartment(user, department),
        items: rows.map((r) => ({
          id: String(r.id),
          title: String(r.title),
          detail: String(r.detail ?? ""),
          source: String(r.source ?? "manual"),
          link: String(r.link ?? ""),
          assigneeId: (r.assignee_id as string | null) ?? null,
          assigneeName: r.assignee_id ? nameById.get(String(r.assignee_id)) ?? null : null,
          doneAt: (r.done_at as string | null) ?? null,
          doneByName: r.done_by ? nameById.get(String(r.done_by)) ?? null : null,
        })),
        templates: (templatesRes.data ?? []).map((t) => ({
          id: String(t.id),
          title: String(t.title),
          detail: String(t.detail ?? ""),
          weekdays: (t.weekdays as number[]) ?? [],
          active: t.active !== false,
        })),
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

interface Body {
  action?: string;
  itemId?: string;
  templateId?: string;
  department?: string;
  day?: string;
  title?: string;
  detail?: string;
  assigneeId?: string | null;
  weekdays?: number[];
  active?: boolean;
}

export async function POST(request: Request) {
  const user = await requireAuthenticated(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  try {
    const db = adminClient();
    const body = (await request.json()) as Body;
    const action = body.action ?? "";

    // ---- completing work ---------------------------------------------------
    if (action === "complete" || action === "reopen") {
      if (!body.itemId) {
        return NextResponse.json({ error: "itemId required" }, { status: 400 });
      }
      const { data: item } = await db
        .from("todo_items")
        .select("id, department_key, assignee_id")
        .eq("id", body.itemId)
        .maybeSingle();
      if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

      // Anyone the item belongs to may tick it; otherwise you need the department.
      const mine = item.assignee_id === user.id;
      if (!mine && !mayEditDepartment(user, String(item.department_key))) {
        return NextResponse.json(
          { error: "You cannot change this department's list" },
          { status: 403 }
        );
      }

      const { error } = await db
        .from("todo_items")
        .update(
          action === "complete"
            ? { done_at: new Date().toISOString(), done_by: user.id }
            : { done_at: null, done_by: null }
        )
        .eq("id", body.itemId);
      if (error) throw new Error(withHint(error.message));
      return NextResponse.json({ ok: true });
    }

    // ---- ad-hoc items ------------------------------------------------------
    if (action === "addItem") {
      const department = body.department ?? user.department ?? "";
      if (!department || !body.title?.trim()) {
        return NextResponse.json({ error: "department and title required" }, { status: 400 });
      }
      if (!mayEditDepartment(user, department)) {
        return NextResponse.json(
          { error: "You cannot add to this department's list" },
          { status: 403 }
        );
      }
      const { error } = await db.from("todo_items").insert({
        id: newId("todo"),
        department_key: department,
        due_on: body.day ?? today(),
        title: body.title.trim(),
        detail: body.detail?.trim() ?? "",
        source: "manual",
        assignee_id: body.assigneeId || null,
      });
      if (error) throw new Error(withHint(error.message));
      return NextResponse.json({ ok: true });
    }

    if (action === "deleteItem") {
      if (!body.itemId) {
        return NextResponse.json({ error: "itemId required" }, { status: 400 });
      }
      const { data: item } = await db
        .from("todo_items")
        .select("id, department_key, source")
        .eq("id", body.itemId)
        .maybeSingle();
      if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
      if (!mayEditDepartment(user, String(item.department_key))) {
        return NextResponse.json({ error: "Not allowed" }, { status: 403 });
      }
      // Generated rows come back on the next run, so removing one is
      // meaningless — tick it instead.
      if (item.source !== "manual") {
        return NextResponse.json(
          { error: "This item comes from a booking, job or follow-up — complete it instead" },
          { status: 400 }
        );
      }
      const { error } = await db.from("todo_items").delete().eq("id", body.itemId);
      if (error) throw new Error(withHint(error.message));
      return NextResponse.json({ ok: true });
    }

    // ---- standing duties ---------------------------------------------------
    if (action === "addTemplate") {
      const department = body.department ?? user.department ?? "";
      if (!department || !body.title?.trim()) {
        return NextResponse.json({ error: "department and title required" }, { status: 400 });
      }
      if (!mayEditDepartment(user, department)) {
        return NextResponse.json({ error: "Not allowed" }, { status: 403 });
      }
      const weekdays = (body.weekdays ?? []).filter((d) => d >= 1 && d <= 7);
      const { error } = await db.from("todo_templates").insert({
        id: newId("todt"),
        department_key: department,
        title: body.title.trim(),
        detail: body.detail?.trim() ?? "",
        weekdays,
        created_by: user.id,
      });
      if (error) throw new Error(withHint(error.message));
      return NextResponse.json({ ok: true });
    }

    if (action === "removeTemplate") {
      if (!body.templateId) {
        return NextResponse.json({ error: "templateId required" }, { status: 400 });
      }
      const { data: tpl } = await db
        .from("todo_templates")
        .select("id, department_key")
        .eq("id", body.templateId)
        .maybeSingle();
      if (!tpl) return NextResponse.json({ error: "Template not found" }, { status: 404 });
      if (!mayEditDepartment(user, String(tpl.department_key))) {
        return NextResponse.json({ error: "Not allowed" }, { status: 403 });
      }
      const { error } = await db
        .from("todo_templates")
        .delete()
        .eq("id", body.templateId);
      if (error) throw new Error(withHint(error.message));
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
