import { NextResponse } from "next/server";
import { requireAccess } from "@/lib/supabase/server-auth";
import { can } from "@/lib/access";
import { isModuleKey, MODULES } from "@/lib/modules";
import type { ModuleKey } from "@/lib/types";
import { adminClient, errorMessage } from "@/lib/api/route-helpers";

/**
 * Projects for one department.
 *
 * Backs the Projects tab that each department gets. The visibility rule here is
 * deliberately DIFFERENT from /api/projects:
 *
 *   /api/projects        — holding the `projects` module is the prerequisite.
 *   /api/projects/dept   — holding THAT DEPARTMENT is the prerequisite, and you
 *                          see only the projects the department is formally
 *                          assigned to via project_departments.
 *
 * Without that difference the tab would be permanently empty for ordinary staff,
 * since most people are never granted the projects module. Being pulled into a
 * project is what earns the visibility, which is the point of the feature.
 *
 * Three deliberate limits keep the widening narrow:
 *   1. Only projects explicitly linked to the department are returned.
 *   2. Private projects stay hidden unless the caller is a member or the owner.
 *   3. Money (budget, actual cost) is withheld unless the caller also holds the
 *      projects module — a department needs to see the work, not the commercials.
 *
 * NOTE: this route uses the service-role client and enforces the rule itself, as
 * the other routes here do. RLS still applies the stricter `can_see_project()`
 * rule to any direct client query.
 */

const MIGRATION_HINT = "run supabase/migrations/046_projects.sql in Supabase.";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const moduleParam = url.searchParams.get("module") ?? "";
  if (!isModuleKey(moduleParam)) {
    return NextResponse.json({ error: `Unknown department: ${moduleParam}` }, { status: 400 });
  }
  const moduleKey = moduleParam as ModuleKey;

  // Holding the department is what grants access to its project list.
  const user = await requireAccess(request, moduleKey, "view");
  if (!user) {
    return NextResponse.json(
      { error: `Unauthorized — ${MODULES[moduleKey].label} access required` },
      { status: 403 }
    );
  }

  try {
    const supabase = adminClient();

    const { data: links, error: linkError } = await supabase
      .from("project_departments")
      .select("project_id, module_key");
    if (linkError) throw new Error(`${linkError.message} — ${MIGRATION_HINT}`);

    const mine = new Set(
      (links ?? [])
        .filter((l) => l.module_key === moduleKey)
        .map((l) => l.project_id as string)
    );
    if (mine.size === 0) {
      return NextResponse.json(
        { module: moduleKey, projects: [], canOpenDetail: can(user, "projects", "view") },
        { headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }

    const ids = Array.from(mine);
    const [projects, members, tasks] = await Promise.all([
      supabase.from("projects").select("*").in("id", ids),
      supabase.from("project_members").select("project_id, user_id, role").in("project_id", ids),
      supabase
        .from("project_tasks")
        .select("project_id, status, assignee_id, title, due_date")
        .in("project_id", ids),
    ]);
    if (projects.error) throw new Error(`${projects.error.message} — ${MIGRATION_HINT}`);

    const memberIds = new Map<string, Set<string>>();
    for (const m of members.data ?? []) {
      const pid = m.project_id as string;
      if (!memberIds.has(pid)) memberIds.set(pid, new Set());
      memberIds.get(pid)!.add(m.user_id as string);
    }

    // Other departments on the same project, so staff can see who else is involved.
    const deptsByProject = new Map<string, string[]>();
    for (const l of links ?? []) {
      const pid = l.project_id as string;
      if (!mine.has(pid)) continue;
      if (!deptsByProject.has(pid)) deptsByProject.set(pid, []);
      deptsByProject.get(pid)!.push(l.module_key as string);
    }

    const showMoney = can(user, "projects", "view");

    const rows = (projects.data ?? [])
      .filter((p) => {
        // A private project stays private even from an assigned department.
        if (!p.is_private) return true;
        const set = memberIds.get(p.id as string);
        return p.owner_id === user.id || Boolean(set?.has(user.id));
      })
      .map((p) => {
        const pid = p.id as string;
        const projectTasks = (tasks.data ?? []).filter((t) => t.project_id === pid);
        const myTasks = projectTasks.filter(
          (t) => t.assignee_id === user.id && t.status !== "done"
        );
        return {
          id: pid,
          code: p.code as string,
          name: p.name as string,
          description: (p.description as string) ?? "",
          type: p.type as string,
          status: p.status as string,
          priority: (p.priority as string) ?? "medium",
          owner_id: (p.owner_id as string) ?? null,
          start_date: (p.start_date as string) ?? null,
          target_date: (p.target_date as string) ?? null,
          is_private: Boolean(p.is_private),
          memberCount: memberIds.get(pid)?.size ?? 0,
          isMember: Boolean(memberIds.get(pid)?.has(user.id)),
          taskTotal: projectTasks.length,
          taskDone: projectTasks.filter((t) => t.status === "done").length,
          myOpenTasks: myTasks.map((t) => ({
            title: t.title as string,
            status: t.status as string,
            due_date: (t.due_date as string) ?? null,
          })),
          departments: deptsByProject.get(pid) ?? [],
          budget_amount: showMoney ? (p.budget_amount as number | null) : null,
          actual_cost: showMoney ? Number(p.actual_cost ?? 0) : null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json(
      {
        module: moduleKey,
        projects: rows,
        // Only link through to the full project workspace if they can open it.
        canOpenDetail: can(user, "projects", "view"),
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
