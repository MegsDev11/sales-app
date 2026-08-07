import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAccess } from "@/lib/supabase/server-auth";
import {
  canEditProject,
  canSeeProject,
  indexMembers,
  type ProjectAuthRow,
} from "@/lib/projects/visibility";
import { summarise } from "@/lib/projects/progress";
import { templateByKey } from "@/lib/projects/templates";
import { WORK_STATUSES } from "@/lib/projects/constants";
import { errorMessage, newId } from "@/lib/api/route-helpers";
import type {
  ProjectBlock,
  ProjectBlockStage,
  ProjectIssue,
  ProjectMilestone,
  ProjectResource,
  ProjectStage,
} from "@/lib/projects/constants";

/**
 * The delivery plane: the block × stage grid, the plant register and the delay log.
 *
 * Documents are NOT here. They became uploads in migration 060, which means multipart
 * bodies and per-request signed URLs — see /api/projects/documents.
 *
 * Separate from /api/projects because it answers a different question. That route is
 * "what projects exist and who is on them"; this one is "how far through is the work
 * and what is holding it up". Keeping them apart means the project list does not drag
 * a few thousand grid cells across the wire to render a name and a status dot.
 *
 * GET ?id=<project>  -> the full delivery plane for one project
 * GET                -> one rolled-up summary per visible project (the portfolio)
 * POST               -> template seeding, grid edits, issues, resources
 *
 * Two things are open to any project MEMBER rather than to leads only: moving a grid
 * cell, and logging or resolving an issue. Both are done by the person standing in
 * the block, and both lose their value the moment they become someone else's
 * end-of-week data-entry job. Structural changes — which stages exist, which blocks
 * exist, deleting history — stay with leads and managers.
 */

const MIGRATION_HINT = "run supabase/migrations/058_project_delivery.sql in Supabase.";

const VALID_WORK_STATUS = new Set(WORK_STATUSES.map((w) => w.value as string));

/** Guard against a runaway "add 5000 blocks" — a real estate tops out well below this. */
const MAX_BULK_BLOCKS = 200;

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const user = await requireAccess(request, "projects", "view");
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized — projects access required" },
      { status: 403 }
    );
  }

  try {
    const supabase = createSupabaseAdminClient() as unknown as SupabaseClient;
    const id = new URL(request.url).searchParams.get("id");

    // ---- one project's full delivery plane --------------------------------
    if (id) {
      const { data: project } = await supabase
        .from("projects")
        .select("id, owner_id, is_private, target_date, delivery_template")
        .eq("id", id)
        .maybeSingle();
      if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

      const { data: memberRows } = await supabase
        .from("project_members")
        .select("project_id, user_id, role")
        .eq("project_id", id);

      const memberIds = new Set((memberRows ?? []).map((m) => m.user_id as string));
      if (!canSeeProject(user, project as unknown as ProjectAuthRow, memberIds)) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
      }

      const [stages, blocks, cells, milestones, resources, issues] =
        await Promise.all([
          supabase.from("project_stages").select("*").eq("project_id", id).order("order_index"),
          supabase.from("project_blocks").select("*").eq("project_id", id).order("order_index"),
          supabase.from("project_block_stages").select("*").eq("project_id", id),
          supabase
            .from("project_milestones")
            .select("*")
            .eq("project_id", id)
            .order("order_index"),
          supabase.from("project_resources").select("*").eq("project_id", id).order("order_index"),
          supabase
            .from("project_issues")
            .select("*")
            .eq("project_id", id)
            .order("logged_at", { ascending: false }),
        ]);

      if (stages.error) {
        throw new Error(`${stages.error.message} — ${MIGRATION_HINT}`);
      }

      const delivery = {
        stages: (stages.data ?? []) as ProjectStage[],
        blocks: (blocks.data ?? []) as ProjectBlock[],
        cells: (cells.data ?? []) as ProjectBlockStage[],
        milestones: (milestones.data ?? []) as ProjectMilestone[],
        resources: (resources.data ?? []) as ProjectResource[],
        issues: (issues.data ?? []) as ProjectIssue[],
      };

      const leadIds = new Set(
        (memberRows ?? []).filter((m) => m.role === "lead").map((m) => m.user_id as string)
      );

      return NextResponse.json(
        {
          ...delivery,
          template: (project.delivery_template as string | null) ?? null,
          summary: summarise(
            id,
            (project.target_date as string | null) ?? null,
            delivery,
            Date.now()
          ),
          canEdit: canEditProject(user, project as unknown as ProjectAuthRow, leadIds),
          isMember: memberIds.has(user.id),
        },
        { headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }

    // ---- the portfolio roll-up --------------------------------------------
    //
    // Rolled up here rather than in the browser: the alternative is shipping every
    // grid cell of every project just to draw one percentage per row.
    const [projects, memberRows] = await Promise.all([
      supabase.from("projects").select("id, owner_id, is_private, target_date"),
      supabase.from("project_members").select("project_id, user_id, role"),
    ]);
    if (projects.error) throw projects.error;

    const { members } = indexMembers(
      (memberRows.data ?? []) as { project_id: string; user_id: string; role?: string }[]
    );

    const visible = (projects.data ?? []).filter((p) =>
      canSeeProject(
        user,
        p as unknown as ProjectAuthRow,
        members.get(p.id as string) ?? new Set()
      )
    );
    const visibleIds = new Set(visible.map((p) => p.id as string));

    const [stages, blocks, cells, milestones, resources, issues] = await Promise.all([
      supabase.from("project_stages").select("*"),
      supabase.from("project_blocks").select("*"),
      supabase.from("project_block_stages").select("block_id, stage_id, project_id, status"),
      supabase.from("project_milestones").select("id, project_id, status"),
      supabase.from("project_resources").select("id, project_id, acquired, working_order"),
      supabase.from("project_issues").select("id, project_id, issue_type, logged_at, resolved_at"),
    ]);
    if (stages.error) {
      throw new Error(`${stages.error.message} — ${MIGRATION_HINT}`);
    }

    /** Bucket a flat result set by project_id, dropping anything not visible. */
    function group<T extends { project_id?: string }>(rows: T[] | null): Map<string, T[]> {
      const map = new Map<string, T[]>();
      for (const row of rows ?? []) {
        const key = row.project_id;
        if (!key || !visibleIds.has(key)) continue;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(row);
      }
      return map;
    }

    const byStage = group(stages.data as ProjectStage[] | null);
    const byBlock = group(blocks.data as ProjectBlock[] | null);
    const byCell = group(cells.data as ProjectBlockStage[] | null);
    const byMilestone = group(milestones.data as ProjectMilestone[] | null);
    const byResource = group(resources.data as ProjectResource[] | null);
    const byIssue = group(issues.data as ProjectIssue[] | null);

    const now = Date.now();
    const summaries = visible.map((p) => {
      const pid = p.id as string;
      return summarise(
        pid,
        (p.target_date as string | null) ?? null,
        {
          stages: byStage.get(pid) ?? [],
          blocks: byBlock.get(pid) ?? [],
          cells: byCell.get(pid) ?? [],
          milestones: byMilestone.get(pid) ?? [],
          resources: byResource.get(pid) ?? [],
          issues: byIssue.get(pid) ?? [],
        },
        now
      );
    });

    return NextResponse.json(
      { summaries },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

interface Body {
  action?: string;
  projectId?: string;
  id?: string;

  // template
  template?: string;
  replace?: boolean;

  // stage / block / resource / milestone
  name?: string;
  title?: string;
  countsToProgress?: boolean;
  order?: string[];

  // block fields
  blockId?: string;
  units?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  actualEndDate?: string | null;
  plannerId?: string | null;
  notes?: string;
  count?: number;
  prefix?: string;

  // grid cell
  stageId?: string;
  status?: string;
  note?: string;

  // resource
  priority?: number | null;
  acquired?: string;
  workingOrder?: string;
  vehicleId?: string | null;

  // issue
  issueId?: string;
  issueType?: string;
  description?: string;
  loggedAt?: string;
  resolvedAt?: string | null;
}

export async function POST(request: Request) {
  const user = await requireAccess(request, "projects", "view");
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized — projects access required" },
      { status: 403 }
    );
  }

  try {
    const body = (await request.json()) as Body;
    const projectId = body.projectId;
    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient() as unknown as SupabaseClient;

    const { data: project } = await supabase
      .from("projects")
      .select("id, owner_id, is_private, delivery_template")
      .eq("id", projectId)
      .maybeSingle();
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const { data: memberRows } = await supabase
      .from("project_members")
      .select("user_id, role")
      .eq("project_id", projectId);

    const memberIds = new Set((memberRows ?? []).map((m) => m.user_id as string));
    const leadIds = new Set(
      (memberRows ?? []).filter((m) => m.role === "lead").map((m) => m.user_id as string)
    );

    const auth = project as unknown as ProjectAuthRow;
    if (!canSeeProject(user, auth, memberIds)) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const mayEdit = canEditProject(user, auth, leadIds);
    const onTheProject = mayEdit || memberIds.has(user.id);
    const action = body.action ?? "";

    // ---- open to anyone on the project ------------------------------------

    if (action === "setCell") {
      if (!body.blockId || !body.stageId) {
        return NextResponse.json(
          { error: "blockId and stageId are required" },
          { status: 400 }
        );
      }
      if (!body.status || !VALID_WORK_STATUS.has(body.status)) {
        return NextResponse.json({ error: `Unknown status: ${body.status}` }, { status: 400 });
      }
      if (!onTheProject) {
        return NextResponse.json(
          { error: "Only people on this project can update the grid" },
          { status: 403 }
        );
      }

      // project_id is filled by the trigger, but sending it keeps the insert valid
      // under RLS on the first write for a block.
      const { error } = await supabase.from("project_block_stages").upsert(
        {
          block_id: body.blockId,
          stage_id: body.stageId,
          project_id: projectId,
          status: body.status,
          note: body.note ?? "",
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "block_id,stage_id" }
      );
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === "logIssue") {
      if (!body.description?.trim()) {
        return NextResponse.json({ error: "Say what the problem is" }, { status: 400 });
      }
      if (!onTheProject) {
        return NextResponse.json(
          { error: "Only people on this project can log issues" },
          { status: 403 }
        );
      }
      const { error } = await supabase.from("project_issues").insert({
        id: newId("iss"),
        project_id: projectId,
        block_id: body.blockId || null,
        issue_type: body.issueType?.trim() || "Other",
        description: body.description.trim(),
        // Backdating matters: an issue entered on Friday that started on Tuesday
        // owes the project three days, and defaulting to now would lose them.
        logged_at: body.loggedAt || new Date().toISOString(),
        logged_by: user.id,
      });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === "resolveIssue" || action === "reopenIssue") {
      if (!body.issueId) {
        return NextResponse.json({ error: "issueId is required" }, { status: 400 });
      }
      if (!onTheProject) {
        return NextResponse.json(
          { error: "Only people on this project can close issues" },
          { status: 403 }
        );
      }
      const resolving = action === "resolveIssue";
      const { error } = await supabase
        .from("project_issues")
        .update({
          resolved_at: resolving ? body.resolvedAt || new Date().toISOString() : null,
          resolved_by: resolving ? user.id : null,
        })
        .eq("id", body.issueId)
        .eq("project_id", projectId);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === "setMilestoneStatus") {
      if (!body.id || !body.status || !VALID_WORK_STATUS.has(body.status)) {
        return NextResponse.json(
          { error: "A milestone id and a valid status are required" },
          { status: 400 }
        );
      }
      if (!onTheProject) {
        return NextResponse.json(
          { error: "Only people on this project can update milestones" },
          { status: 403 }
        );
      }
      const { error } = await supabase
        .from("project_milestones")
        .update({
          status: body.status,
          completed_at: body.status === "complete" ? new Date().toISOString() : null,
          ...(body.note !== undefined ? { note: body.note } : {}),
        })
        .eq("id", body.id)
        .eq("project_id", projectId);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === "setResourceStatus") {
      if (!body.id) {
        return NextResponse.json({ error: "A resource id is required" }, { status: 400 });
      }
      if (!onTheProject) {
        return NextResponse.json(
          { error: "Only people on this project can update plant" },
          { status: 403 }
        );
      }
      const patch: Record<string, unknown> = {};
      if (body.acquired !== undefined) {
        if (!VALID_WORK_STATUS.has(body.acquired)) {
          return NextResponse.json({ error: `Unknown status: ${body.acquired}` }, { status: 400 });
        }
        patch.acquired = body.acquired;
      }
      if (body.workingOrder !== undefined) {
        if (!VALID_WORK_STATUS.has(body.workingOrder)) {
          return NextResponse.json(
            { error: `Unknown status: ${body.workingOrder}` },
            { status: 400 }
          );
        }
        patch.working_order = body.workingOrder;
      }
      if (body.notes !== undefined) patch.notes = body.notes;
      if (Object.keys(patch).length === 0) {
        return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
      }
      const { error } = await supabase
        .from("project_resources")
        .update(patch)
        .eq("id", body.id)
        .eq("project_id", projectId);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    // ---- everything below reshapes the plan, and needs edit rights ---------

    if (!mayEdit) {
      return NextResponse.json(
        { error: "Only the project owner, a project lead, or a projects manager can do that" },
        { status: 403 }
      );
    }

    switch (action) {
      /**
       * Seed a plan from a template.
       *
       * Refuses to run over an existing plan unless `replace` is set, because the
       * blocks carry the grid and wiping them silently would take the site history
       * with them.
       */
      case "applyTemplate": {
        const template = templateByKey(body.template);
        if (!template) {
          return NextResponse.json({ error: "Unknown template" }, { status: 400 });
        }

        const { data: existing } = await supabase
          .from("project_stages")
          .select("id")
          .eq("project_id", projectId)
          .limit(1);

        if ((existing?.length ?? 0) > 0 && !body.replace) {
          return NextResponse.json(
            { error: "This project already has a plan. Tick replace to start over." },
            { status: 409 }
          );
        }

        if (body.replace) {
          // Cells cascade from the blocks and stages.
          await supabase.from("project_stages").delete().eq("project_id", projectId);
          await supabase.from("project_blocks").delete().eq("project_id", projectId);
          await supabase.from("project_milestones").delete().eq("project_id", projectId);
          await supabase.from("project_resources").delete().eq("project_id", projectId);
        }

        const stageRows = template.stages.map((s, i) => ({
          id: newId("stg"),
          project_id: projectId,
          name: s.name,
          order_index: i,
          counts_to_progress: s.countsToProgress ?? true,
        }));
        const milestoneRows = template.milestones.map((title, i) => ({
          id: newId("mls"),
          project_id: projectId,
          title,
          status: "not_started",
          order_index: i,
        }));
        const resourceRows = template.resources.map((name, i) => ({
          id: newId("res"),
          project_id: projectId,
          name,
          priority: i + 1,
          order_index: i,
        }));

        const results = await Promise.all([
          supabase.from("project_stages").insert(stageRows),
          supabase.from("project_milestones").insert(milestoneRows),
          supabase.from("project_resources").insert(resourceRows),
        ]);
        for (const r of results) {
          if (r.error) throw new Error(`${r.error.message} — ${MIGRATION_HINT}`);
        }

        await supabase
          .from("projects")
          .update({ delivery_template: template.key, updated_at: new Date().toISOString() })
          .eq("id", projectId);

        return NextResponse.json({ ok: true, stages: stageRows.length });
      }

      case "addStage": {
        if (!body.name?.trim()) {
          return NextResponse.json({ error: "Give the stage a name" }, { status: 400 });
        }
        const { data: last } = await supabase
          .from("project_stages")
          .select("order_index")
          .eq("project_id", projectId)
          .order("order_index", { ascending: false })
          .limit(1)
          .maybeSingle();

        const { error } = await supabase.from("project_stages").insert({
          id: newId("stg"),
          project_id: projectId,
          name: body.name.trim(),
          order_index: ((last?.order_index as number) ?? -1) + 1,
          counts_to_progress: body.countsToProgress ?? true,
        });
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      case "updateStage": {
        if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
        const patch: Record<string, unknown> = {};
        if (body.name !== undefined) patch.name = body.name.trim();
        if (body.countsToProgress !== undefined) patch.counts_to_progress = body.countsToProgress;
        const { error } = await supabase
          .from("project_stages")
          .update(patch)
          .eq("id", body.id)
          .eq("project_id", projectId);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      case "removeStage": {
        if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
        const { error } = await supabase
          .from("project_stages")
          .delete()
          .eq("id", body.id)
          .eq("project_id", projectId);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      /** Add one block, or a run of them — "Block 1" through "Block 31" in one go. */
      case "addBlocks": {
        const count = Math.max(1, Math.min(body.count ?? 1, MAX_BULK_BLOCKS));
        const prefix = body.prefix?.trim() || body.name?.trim() || "Block";

        const { data: existing } = await supabase
          .from("project_blocks")
          .select("name, order_index")
          .eq("project_id", projectId);

        const taken = new Set((existing ?? []).map((b) => b.name as string));
        const nextOrder =
          Math.max(-1, ...(existing ?? []).map((b) => (b.order_index as number) ?? 0)) + 1;

        const rows: Record<string, unknown>[] = [];
        // A single unnumbered block when the caller asked for one and named it; a
        // numbered run otherwise. Numbering skips names already in use so adding
        // "5 more blocks" to an existing 31 does not collide.
        if (count === 1 && body.name?.trim()) {
          if (taken.has(prefix)) {
            return NextResponse.json(
              { error: `"${prefix}" already exists on this project` },
              { status: 409 }
            );
          }
          rows.push({
            id: newId("blk"),
            project_id: projectId,
            name: prefix,
            units: body.units ?? null,
            start_date: body.startDate || null,
            end_date: body.endDate || null,
            order_index: nextOrder,
          });
        } else {
          let n = 1;
          while (rows.length < count) {
            const name = `${prefix} ${n}`;
            n += 1;
            if (taken.has(name)) continue;
            rows.push({
              id: newId("blk"),
              project_id: projectId,
              name,
              order_index: nextOrder + rows.length,
            });
            if (n > MAX_BULK_BLOCKS * 2) break; // paranoia against a pathological prefix
          }
        }

        if (rows.length === 0) {
          return NextResponse.json({ error: "Nothing to add" }, { status: 400 });
        }
        const { error } = await supabase.from("project_blocks").insert(rows);
        if (error) throw new Error(`${error.message} — ${MIGRATION_HINT}`);
        return NextResponse.json({ ok: true, added: rows.length });
      }

      case "updateBlock": {
        if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
        const patch: Record<string, unknown> = {};
        if (body.name !== undefined) patch.name = body.name.trim();
        if (body.units !== undefined) patch.units = body.units;
        if (body.startDate !== undefined) patch.start_date = body.startDate || null;
        if (body.endDate !== undefined) patch.end_date = body.endDate || null;
        if (body.actualEndDate !== undefined) patch.actual_end_date = body.actualEndDate || null;
        if (body.plannerId !== undefined) patch.planner_id = body.plannerId || null;
        if (body.notes !== undefined) patch.notes = body.notes;
        if (Object.keys(patch).length === 0) {
          return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
        }
        const { error } = await supabase
          .from("project_blocks")
          .update(patch)
          .eq("id", body.id)
          .eq("project_id", projectId);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      case "removeBlock": {
        if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
        const { error } = await supabase
          .from("project_blocks")
          .delete()
          .eq("id", body.id)
          .eq("project_id", projectId);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      case "addMilestone": {
        if (!body.title?.trim()) {
          return NextResponse.json({ error: "Give the milestone a name" }, { status: 400 });
        }
        const { data: last } = await supabase
          .from("project_milestones")
          .select("order_index")
          .eq("project_id", projectId)
          .order("order_index", { ascending: false })
          .limit(1)
          .maybeSingle();
        const { error } = await supabase.from("project_milestones").insert({
          id: newId("mls"),
          project_id: projectId,
          title: body.title.trim(),
          status: "not_started",
          due_date: body.endDate || null,
          order_index: ((last?.order_index as number) ?? -1) + 1,
        });
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      case "removeMilestone": {
        if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
        const { error } = await supabase
          .from("project_milestones")
          .delete()
          .eq("id", body.id)
          .eq("project_id", projectId);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      case "addResource": {
        if (!body.name?.trim()) {
          return NextResponse.json({ error: "Name the equipment" }, { status: 400 });
        }
        const { data: last } = await supabase
          .from("project_resources")
          .select("order_index")
          .eq("project_id", projectId)
          .order("order_index", { ascending: false })
          .limit(1)
          .maybeSingle();
        const next = ((last?.order_index as number) ?? -1) + 1;
        const { error } = await supabase.from("project_resources").insert({
          id: newId("res"),
          project_id: projectId,
          name: body.name.trim(),
          priority: body.priority ?? next + 1,
          start_date: body.startDate || null,
          end_date: body.endDate || null,
          vehicle_id: body.vehicleId || null,
          notes: body.notes ?? "",
          order_index: next,
        });
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      case "updateResource": {
        if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
        const patch: Record<string, unknown> = {};
        if (body.name !== undefined) patch.name = body.name.trim();
        if (body.priority !== undefined) patch.priority = body.priority;
        if (body.startDate !== undefined) patch.start_date = body.startDate || null;
        if (body.endDate !== undefined) patch.end_date = body.endDate || null;
        if (body.vehicleId !== undefined) patch.vehicle_id = body.vehicleId || null;
        if (body.notes !== undefined) patch.notes = body.notes;
        if (Object.keys(patch).length === 0) {
          return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
        }
        const { error } = await supabase
          .from("project_resources")
          .update(patch)
          .eq("id", body.id)
          .eq("project_id", projectId);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      case "removeResource": {
        if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
        const { error } = await supabase
          .from("project_resources")
          .delete()
          .eq("id", body.id)
          .eq("project_id", projectId);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      case "updateIssue": {
        if (!body.issueId) {
          return NextResponse.json({ error: "issueId required" }, { status: 400 });
        }
        const patch: Record<string, unknown> = {};
        if (body.description !== undefined) patch.description = body.description.trim();
        if (body.issueType !== undefined) patch.issue_type = body.issueType.trim() || "Other";
        if (body.blockId !== undefined) patch.block_id = body.blockId || null;
        if (body.loggedAt !== undefined) patch.logged_at = body.loggedAt;
        if (body.resolvedAt !== undefined) patch.resolved_at = body.resolvedAt || null;
        if (Object.keys(patch).length === 0) {
          return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
        }
        const { error } = await supabase
          .from("project_issues")
          .update(patch)
          .eq("id", body.issueId)
          .eq("project_id", projectId);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      case "removeIssue": {
        if (!body.issueId) {
          return NextResponse.json({ error: "issueId required" }, { status: 400 });
        }
        const { error } = await supabase
          .from("project_issues")
          .delete()
          .eq("id", body.issueId)
          .eq("project_id", projectId);
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
