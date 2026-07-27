import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAccess } from "@/lib/supabase/server-auth";
import { can } from "@/lib/access";
import { isModuleKey } from "@/lib/modules";
import {
  canEditProject,
  canSeeProject,
  type ProjectAuthRow,
} from "@/lib/projects/visibility";

/**
 * Projects API.
 *
 * GET  ?id=<project>  -> one project with members, tasks, links, updates, costs
 * GET                 -> every project the caller may see, with member/task counts
 * POST                -> create / update / member changes / tasks / updates / costs / links
 *
 * Visibility mirrors can_see_project() in migration 046. RLS enforces it
 * independently; this layer exists so the response is right and a rejection is a
 * clean 403 rather than a silently empty list.
 */

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const m = (error as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return "Request failed";
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function GET(request: Request) {
  const user = await requireAccess(request, "projects", "view");
  if (!user) {
    return NextResponse.json({ error: "Unauthorized — projects access required" }, { status: 403 });
  }

  try {
    const supabase = createSupabaseAdminClient() as unknown as SupabaseClient;
    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (id) {
      const { data: project, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

      const [members, departments, tasks, links, updates, costs, milestones] =
        await Promise.all([
          supabase.from("project_members").select("*").eq("project_id", id),
          supabase.from("project_departments").select("*").eq("project_id", id),
          supabase.from("project_tasks").select("*").eq("project_id", id).order("order_index"),
          supabase.from("project_links").select("*").eq("project_id", id),
          supabase
            .from("project_updates")
            .select("*")
            .eq("project_id", id)
            .order("created_at", { ascending: false }),
          supabase.from("project_costs").select("*").eq("project_id", id).order("incurred_on"),
          supabase.from("project_milestones").select("*").eq("project_id", id).order("order_index"),
        ]);

      const memberIds = new Set((members.data ?? []).map((m) => m.user_id as string));
      const leadIds = new Set(
        (members.data ?? []).filter((m) => m.role === "lead").map((m) => m.user_id as string)
      );

      if (!canSeeProject(user, project as unknown as ProjectAuthRow, memberIds)) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
      }

      return NextResponse.json(
        {
          project,
          members: members.data ?? [],
          departments: departments.data ?? [],
          tasks: tasks.data ?? [],
          links: links.data ?? [],
          updates: updates.data ?? [],
          costs: costs.data ?? [],
          milestones: milestones.data ?? [],
          canEdit: canEditProject(user, project as unknown as ProjectAuthRow, leadIds),
        },
        { headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }

    const [projects, members, departments, tasks] = await Promise.all([
      supabase.from("projects").select("*").order("created_at", { ascending: false }),
      supabase.from("project_members").select("project_id, user_id, role"),
      supabase.from("project_departments").select("project_id, module_key"),
      supabase.from("project_tasks").select("project_id, status"),
    ]);
    if (projects.error) {
      throw new Error(
        `${projects.error.message} — run supabase/migrations/046_projects.sql in Supabase.`
      );
    }

    const byProject = new Map<string, Set<string>>();
    for (const m of members.data ?? []) {
      const key = m.project_id as string;
      if (!byProject.has(key)) byProject.set(key, new Set());
      byProject.get(key)!.add(m.user_id as string);
    }

    const visible = (projects.data ?? []).filter((p) =>
      canSeeProject(user, p as unknown as ProjectAuthRow, byProject.get(p.id as string) ?? new Set())
    );
    const visibleIds = new Set(visible.map((p) => p.id as string));

    return NextResponse.json(
      {
        projects: visible,
        members: (members.data ?? []).filter((m) => visibleIds.has(m.project_id as string)),
        departments: (departments.data ?? []).filter((d) =>
          visibleIds.has(d.project_id as string)
        ),
        tasks: (tasks.data ?? []).filter((t) => visibleIds.has(t.project_id as string)),
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

const VALID_STATUS = new Set([
  "idea", "evaluating", "approved", "active", "on_hold", "completed", "cancelled",
]);
const VALID_TYPE = new Set([
  "business_idea", "client_install", "infrastructure", "maintenance", "internal", "rd",
]);
const VALID_MEMBER_ROLE = new Set(["lead", "contributor", "reviewer", "viewer"]);
const VALID_TASK_STATUS = new Set(["todo", "in_progress", "blocked", "review", "done"]);

interface Body {
  action?: string;
  id?: string;
  projectId?: string;
  // project fields
  name?: string;
  description?: string;
  type?: string;
  status?: string;
  priority?: string;
  ownerId?: string | null;
  clientLeadId?: string | null;
  startDate?: string | null;
  targetDate?: string | null;
  budgetAmount?: number | null;
  isPrivate?: boolean;
  departments?: string[];
  // members
  members?: { userId: string; role: string }[];
  // task
  taskId?: string;
  title?: string;
  assigneeId?: string | null;
  moduleKey?: string | null;
  dueDate?: string | null;
  taskStatus?: string;
  // update / cost / link
  body?: string;
  kind?: string;
  amount?: number;
  category?: string;
  incurredOn?: string;
  entityType?: string;
  entityId?: string;
  label?: string;
}

/** Load a project plus the member sets needed for an authorisation decision. */
async function loadForAuth(
  supabase: SupabaseClient,
  projectId: string
) {
  const { data: project } = await supabase
    .from("projects")
    .select("id, owner_id, is_private")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return null;

  const { data: members } = await supabase
    .from("project_members")
    .select("user_id, role")
    .eq("project_id", projectId);

  return {
    project: project as unknown as ProjectAuthRow,
    memberIds: new Set((members ?? []).map((m) => m.user_id as string)),
    leadIds: new Set(
      (members ?? []).filter((m) => m.role === "lead").map((m) => m.user_id as string)
    ),
  };
}

export async function POST(request: Request) {
  const user = await requireAccess(request, "projects", "view");
  if (!user) {
    return NextResponse.json({ error: "Unauthorized — projects access required" }, { status: 403 });
  }

  try {
    const body = (await request.json()) as Body;
    const action = body.action ?? "create";
    const supabase = createSupabaseAdminClient() as unknown as SupabaseClient;

    // ---- create -----------------------------------------------------------
    if (action === "create") {
      if (!can(user, "projects", "edit")) {
        return NextResponse.json(
          { error: "You have view-only access to projects" },
          { status: 403 }
        );
      }
      if (!body.name?.trim()) {
        return NextResponse.json({ error: "Give the project a name" }, { status: 400 });
      }
      if (body.type && !VALID_TYPE.has(body.type)) {
        return NextResponse.json({ error: `Unknown project type: ${body.type}` }, { status: 400 });
      }
      if (body.status && !VALID_STATUS.has(body.status)) {
        return NextResponse.json({ error: `Unknown status: ${body.status}` }, { status: 400 });
      }

      const { data: codeRow } = await supabase.rpc("next_project_code");
      const id = newId("prj");

      const { error } = await supabase.from("projects").insert({
        id,
        code: (codeRow as string) ?? id.toUpperCase(),
        name: body.name.trim(),
        description: body.description ?? "",
        type: body.type ?? "internal",
        status: body.status ?? "idea",
        priority: body.priority ?? "medium",
        owner_id: body.ownerId ?? user.id,
        client_lead_id: body.clientLeadId ?? null,
        start_date: body.startDate || null,
        target_date: body.targetDate || null,
        budget_amount: body.budgetAmount ?? null,
        is_private: body.isPrivate ?? false,
        created_by: user.id,
      });
      if (error) throw error;

      // The creator is always a lead, otherwise they could create a project they
      // cannot then edit.
      const memberRows = [
        { project_id: id, user_id: user.id, role: "lead", added_by: user.id },
        ...(body.members ?? [])
          .filter((m) => m.userId !== user.id && VALID_MEMBER_ROLE.has(m.role))
          .map((m) => ({
            project_id: id,
            user_id: m.userId,
            role: m.role,
            added_by: user.id,
          })),
      ];
      await supabase.from("project_members").insert(memberRows);

      if (body.departments?.length) {
        await supabase.from("project_departments").insert(
          body.departments
            .filter(isModuleKey)
            .map((module_key) => ({ project_id: id, module_key }))
        );
      }

      // Notify everyone added, using the existing notification table.
      const others = memberRows.filter((m) => m.user_id !== user.id);
      if (others.length) {
        await supabase.from("app_notifications").insert(
          others.map((m) => ({
            id: newId("ntf"),
            user_id: m.user_id,
            type: "project_added",
            title: `${user.name} added you to ${body.name!.trim()}`,
            body: "You have been added to a project.",
            link: `/projects/${id}`,
          }))
        );
      }

      return NextResponse.json({ ok: true, id });
    }

    // Everything below needs a project and edit rights on it.
    const projectId = body.projectId ?? body.id;
    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    const auth = await loadForAuth(supabase, projectId);
    if (!auth) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    if (!canSeeProject(user, auth.project, auth.memberIds)) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const mayEdit = canEditProject(user, auth.project, auth.leadIds);

    // ---- task status: an assignee may progress their own work --------------
    if (action === "setTaskStatus") {
      if (!body.taskId || !body.taskStatus || !VALID_TASK_STATUS.has(body.taskStatus)) {
        return NextResponse.json({ error: "taskId and a valid status are required" }, { status: 400 });
      }
      const { data: task } = await supabase
        .from("project_tasks")
        .select("assignee_id")
        .eq("id", body.taskId)
        .maybeSingle();
      if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

      if (task.assignee_id !== user.id && !mayEdit) {
        return NextResponse.json(
          { error: "Only the assignee or a project lead can change this task" },
          { status: 403 }
        );
      }

      const { error } = await supabase
        .from("project_tasks")
        .update({
          status: body.taskStatus,
          completed_at: body.taskStatus === "done" ? new Date().toISOString() : null,
        })
        .eq("id", body.taskId);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    // ---- posting an update is open to any member ---------------------------
    if (action === "addUpdate") {
      if (!body.body?.trim()) {
        return NextResponse.json({ error: "Write something first" }, { status: 400 });
      }
      if (!auth.memberIds.has(user.id) && !mayEdit) {
        return NextResponse.json(
          { error: "Only project members can post updates" },
          { status: 403 }
        );
      }
      const { error } = await supabase.from("project_updates").insert({
        id: newId("upd"),
        project_id: projectId,
        author_id: user.id,
        body: body.body.trim(),
        kind: body.kind ?? "note",
      });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (!mayEdit) {
      return NextResponse.json(
        { error: "Only the project owner, a project lead, or a projects manager can do that" },
        { status: 403 }
      );
    }

    switch (action) {
      case "update": {
        if (body.status && !VALID_STATUS.has(body.status)) {
          return NextResponse.json({ error: `Unknown status: ${body.status}` }, { status: 400 });
        }
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (body.name !== undefined) patch.name = body.name.trim();
        if (body.description !== undefined) patch.description = body.description;
        if (body.type !== undefined) patch.type = body.type;
        if (body.status !== undefined) {
          patch.status = body.status;
          patch.completed_at = body.status === "completed" ? new Date().toISOString() : null;
        }
        if (body.priority !== undefined) patch.priority = body.priority;
        if (body.ownerId !== undefined) patch.owner_id = body.ownerId;
        if (body.clientLeadId !== undefined) patch.client_lead_id = body.clientLeadId;
        if (body.startDate !== undefined) patch.start_date = body.startDate || null;
        if (body.targetDate !== undefined) patch.target_date = body.targetDate || null;
        if (body.budgetAmount !== undefined) patch.budget_amount = body.budgetAmount;
        if (body.isPrivate !== undefined) patch.is_private = body.isPrivate;

        const { error } = await supabase.from("projects").update(patch).eq("id", projectId);
        if (error) throw error;

        if (body.departments) {
          await supabase.from("project_departments").delete().eq("project_id", projectId);
          if (body.departments.length) {
            await supabase.from("project_departments").insert(
              body.departments
                .filter(isModuleKey)
                .map((module_key) => ({ project_id: projectId, module_key }))
            );
          }
        }
        return NextResponse.json({ ok: true });
      }

      case "setMembers": {
        const incoming = (body.members ?? []).filter((m) => VALID_MEMBER_ROLE.has(m.role));

        // Someone has to be able to edit the project afterwards.
        const keepsALead =
          incoming.some((m) => m.role === "lead") || auth.project.owner_id !== null;
        if (!keepsALead) {
          return NextResponse.json(
            { error: "Give the project at least one lead before removing the last one." },
            { status: 400 }
          );
        }

        const existing = auth.memberIds;
        await supabase.from("project_members").delete().eq("project_id", projectId);
        if (incoming.length) {
          const { error } = await supabase.from("project_members").insert(
            incoming.map((m) => ({
              project_id: projectId,
              user_id: m.userId,
              role: m.role,
              added_by: user.id,
            }))
          );
          if (error) throw error;
        }

        const added = incoming.filter((m) => !existing.has(m.userId) && m.userId !== user.id);
        if (added.length) {
          const { data: proj } = await supabase
            .from("projects")
            .select("name")
            .eq("id", projectId)
            .maybeSingle();
          await supabase.from("app_notifications").insert(
            added.map((m) => ({
              id: newId("ntf"),
              user_id: m.userId,
              type: "project_added",
              title: `${user.name} added you to ${proj?.name ?? "a project"}`,
              body: "You have been added to a project.",
              link: `/projects/${projectId}`,
            }))
          );
        }
        return NextResponse.json({ ok: true, members: incoming.length });
      }

      case "addTask": {
        if (!body.title?.trim()) {
          return NextResponse.json({ error: "Task needs a title" }, { status: 400 });
        }
        const { data: last } = await supabase
          .from("project_tasks")
          .select("order_index")
          .eq("project_id", projectId)
          .order("order_index", { ascending: false })
          .limit(1)
          .maybeSingle();

        const { error } = await supabase.from("project_tasks").insert({
          id: newId("tsk"),
          project_id: projectId,
          title: body.title.trim(),
          description: body.description ?? "",
          assignee_id: body.assigneeId ?? null,
          module_key: body.moduleKey && isModuleKey(body.moduleKey) ? body.moduleKey : null,
          due_date: body.dueDate || null,
          order_index: ((last?.order_index as number) ?? 0) + 1,
          created_by: user.id,
        });
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      case "deleteTask": {
        if (!body.taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 });
        const { error } = await supabase.from("project_tasks").delete().eq("id", body.taskId);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      case "addCost": {
        if (!body.amount || !body.description?.trim()) {
          return NextResponse.json(
            { error: "A cost needs a description and an amount" },
            { status: 400 }
          );
        }
        // projects.actual_cost is recalculated by a trigger, not here.
        const { error } = await supabase.from("project_costs").insert({
          id: newId("cst"),
          project_id: projectId,
          description: body.description.trim(),
          amount: body.amount,
          category: body.category ?? "other",
          incurred_on: body.incurredOn || new Date().toISOString().slice(0, 10),
          created_by: user.id,
        });
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      case "addLink": {
        if (!body.entityType || !body.entityId) {
          return NextResponse.json(
            { error: "entityType and entityId are required" },
            { status: 400 }
          );
        }
        const { error } = await supabase.from("project_links").insert({
          id: newId("lnk"),
          project_id: projectId,
          entity_type: body.entityType,
          entity_id: body.entityId,
          label: body.label ?? "",
          linked_by: user.id,
        });
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      case "removeLink": {
        if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
        const { error } = await supabase.from("project_links").delete().eq("id", body.id);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
