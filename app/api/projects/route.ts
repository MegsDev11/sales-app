import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAccess, requireAnyAccess } from "@/lib/supabase/server-auth";
import { can, isOwnerRole } from "@/lib/access";
import { isModuleKey } from "@/lib/modules";
import { errorMessage, newId } from "@/lib/api/route-helpers";
import {
  canEditProject,
  canSeeProject,
  type ProjectAuthRow,
} from "@/lib/projects/visibility";

/**
 * Projects API.
 *
 * GET  ?id=<project>  -> one project with members, tasks, links, updates, costs,
 *                        plus the Phase-2 integration slice: the winning lead,
 *                        field jobs + job cards + logged hours, the bill of
 *                        materials vs booked stock, invoices, quotes and phase
 *                        staffing (migrations 066/067/068 — each part simply
 *                        comes back empty until its migration is applied)
 * GET  ?options=1     -> lightweight {id, code, name, status} list for project
 *                        pickers in OTHER modules (jobs, pick lists, quotes) —
 *                        reachable with coordination/stock/accounts access, not
 *                        just projects
 * POST                -> create / update / member changes / tasks / updates /
 *                        costs / links / BOM lines / phase staffing
 *
 * Visibility mirrors can_see_project() in migration 046. RLS enforces it
 * independently; this layer exists so the response is right and a rejection is a
 * clean 403 rather than a silently empty list.
 */

/** Sum closed time_entries into minutes; open entries don't count yet. */
function closedMinutes(row: { clock_in_at: string | null; clock_out_at: string | null }): number {
  if (!row.clock_in_at || !row.clock_out_at) return 0;
  const ms = new Date(row.clock_out_at).getTime() - new Date(row.clock_in_at).getTime();
  return ms > 0 ? Math.round(ms / 60000) : 0;
}

/**
 * The reverse joins that make a project show everything about itself.
 * Every query is tolerant: a missing table or column (migration not applied
 * yet) contributes an empty slice instead of failing the page.
 */
async function loadIntegration(
  supabase: SupabaseClient,
  project: { id: string; client_lead_id: string | null }
) {
  const id = project.id;

  const [leadRes, jobsRes, stockLinesRes, phaseStaffRes, requestsRes, bookingsRes, invoicesRes, quotesRes, blocksRes, stagesRes] =
    await Promise.all([
      project.client_lead_id
        ? supabase
            .from("leads")
            .select("id, client_name, lead_source, deal_value, assigned_to_id")
            .eq("id", project.client_lead_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from("jobs")
        .select("id, title, client_name, status, job_type, scheduled_start, scheduled_end, project_block_id")
        .eq("project_id", id)
        .order("scheduled_start", { ascending: false }),
      supabase
        .from("project_stock_lines")
        .select("*")
        .eq("project_id", id)
        .order("created_at"),
      supabase
        .from("project_phase_staff")
        .select("*")
        .eq("project_id", id)
        .order("added_at"),
      supabase
        .from("stock_requests")
        .select("id, title, status, technician_id, created_at")
        .eq("project_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("stock_bookings")
        .select("id, item_id, technician_id, booked_out_at, returned_at")
        .eq("project_id", id)
        .order("booked_out_at", { ascending: false }),
      supabase
        .from("accounts_invoices")
        .select("id, invoice_number, invoice_date, total_incl, status, kind")
        .eq("project_id", id)
        .order("invoice_date", { ascending: false }),
      supabase
        .from("accounts_quotes")
        .select("id, quote_number, quote_date, total_incl, status, invoice_id")
        .eq("project_id", id)
        .order("quote_date", { ascending: false }),
      supabase.from("project_blocks").select("id, name").eq("project_id", id).order("order_index"),
      supabase.from("project_stages").select("id, name").eq("project_id", id).order("order_index"),
    ]);

  const jobs = jobsRes.error ? [] : jobsRes.data ?? [];
  const jobIds = jobs.map((j) => j.id as string);

  const [cardsRes, timeRes] = await Promise.all([
    jobIds.length
      ? supabase
          .from("job_card_submissions")
          .select("id, job_id, card_number, technician_id, submitted_at, status")
          .in("job_id", jobIds)
          .order("submitted_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    jobIds.length
      ? supabase
          .from("time_entries")
          .select("technician_id, job_id, clock_in_at, clock_out_at")
          .in("job_id", jobIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const cards = cardsRes.error ? [] : cardsRes.data ?? [];
  const timeRows = timeRes.error ? [] : timeRes.data ?? [];
  const stockLines = stockLinesRes.error ? [] : stockLinesRes.data ?? [];
  const phaseStaff = phaseStaffRes.error ? [] : phaseStaffRes.data ?? [];
  const requests = requestsRes.error ? [] : requestsRes.data ?? [];
  const bookings = bookingsRes.error ? [] : bookingsRes.data ?? [];

  // Resolve display names in one batch per table.
  const techIds = new Set<string>();
  for (const c of cards) techIds.add(c.technician_id as string);
  for (const t of timeRows) techIds.add(t.technician_id as string);
  for (const r of requests) techIds.add(r.technician_id as string);
  for (const b of bookings) techIds.add(b.technician_id as string);
  for (const p of phaseStaff) techIds.add(p.technician_id as string);
  const lead = leadRes && !leadRes.error ? leadRes.data : null;
  if (lead?.assigned_to_id) techIds.add(lead.assigned_to_id as string);

  const productIds = new Set<string>();
  const sundryIds = new Set<string>();
  for (const l of stockLines) {
    if (l.product_id) productIds.add(l.product_id as string);
    if (l.sundry_id) sundryIds.add(l.sundry_id as string);
  }
  const itemIds = [...new Set(bookings.map((b) => b.item_id as string))];

  const [techsRes, productsRes, sundriesRes, itemsRes] = await Promise.all([
    techIds.size
      ? supabase.from("team_members").select("id, name").in("id", [...techIds])
      : Promise.resolve({ data: [], error: null }),
    productIds.size
      ? supabase.from("stock_products").select("id, name").in("id", [...productIds])
      : Promise.resolve({ data: [], error: null }),
    sundryIds.size
      ? supabase.from("stock_sundries").select("id, name, unit_label").in("id", [...sundryIds])
      : Promise.resolve({ data: [], error: null }),
    itemIds.length
      ? supabase
          .from("stock_items")
          .select("id, product_id, serial_number")
          .in("id", itemIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const techName = new Map(
    ((techsRes.data ?? []) as { id: string; name: string }[]).map((t) => [t.id, t.name])
  );
  const productName = new Map(
    ((productsRes.data ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name])
  );
  const sundryName = new Map(
    ((sundriesRes.data ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name])
  );
  const itemById = new Map(
    ((itemsRes.data ?? []) as { id: string; product_id: string; serial_number: string }[]).map(
      (i) => [i.id, i]
    )
  );
  const blockName = new Map(
    ((blocksRes.error ? [] : blocksRes.data ?? []) as { id: string; name: string }[]).map((b) => [
      b.id,
      b.name,
    ])
  );
  const stageName = new Map(
    ((stagesRes.error ? [] : stagesRes.data ?? []) as { id: string; name: string }[]).map((s) => [
      s.id,
      s.name,
    ])
  );

  // Logged hours per technician across this project's jobs.
  const minutesByTech = new Map<string, number>();
  for (const t of timeRows) {
    const m = closedMinutes(t as { clock_in_at: string | null; clock_out_at: string | null });
    if (m <= 0) continue;
    const tid = t.technician_id as string;
    minutesByTech.set(tid, (minutesByTech.get(tid) ?? 0) + m);
  }

  return {
    lead: lead
      ? {
          id: lead.id as string,
          clientName: (lead.client_name as string) ?? "",
          leadSource: (lead.lead_source as string) ?? "",
          dealValue: lead.deal_value != null ? Number(lead.deal_value) : null,
          repId: (lead.assigned_to_id as string | null) ?? null,
          repName: lead.assigned_to_id
            ? techName.get(lead.assigned_to_id as string) ?? null
            : null,
        }
      : null,
    jobs: jobs.map((j) => ({
      id: j.id as string,
      title: (j.title as string) ?? "Job",
      clientName: (j.client_name as string | null) ?? null,
      status: (j.status as string) ?? "scheduled",
      jobType: (j.job_type as string | null) ?? null,
      scheduledStart: (j.scheduled_start as string | null) ?? null,
      scheduledEnd: (j.scheduled_end as string | null) ?? null,
      blockId: (j.project_block_id as string | null) ?? null,
      blockName: j.project_block_id
        ? blockName.get(j.project_block_id as string) ?? null
        : null,
    })),
    jobCards: cards.map((c) => ({
      id: c.id as string,
      jobId: c.job_id as string,
      cardNumber: (c.card_number as string | null) ?? null,
      technicianName: techName.get(c.technician_id as string) ?? c.technician_id,
      submittedAt: (c.submitted_at as string | null) ?? null,
      status: (c.status as string) ?? "",
    })),
    labour: {
      totalMinutes: [...minutesByTech.values()].reduce((a, b) => a + b, 0),
      byTech: [...minutesByTech.entries()]
        .map(([technicianId, minutes]) => ({
          technicianId,
          name: techName.get(technicianId) ?? technicianId,
          minutes,
        }))
        .sort((a, b) => b.minutes - a.minutes),
    },
    stockLines: stockLines.map((l) => ({
      id: l.id as string,
      productId: (l.product_id as string | null) ?? null,
      sundryId: (l.sundry_id as string | null) ?? null,
      name:
        (l.product_id ? productName.get(l.product_id as string) : null) ??
        (l.sundry_id ? sundryName.get(l.sundry_id as string) : null) ??
        ((l.description as string) || "Line"),
      qtyNeeded: Number(l.qty_needed ?? 0),
      unitCost: l.unit_cost != null ? Number(l.unit_cost) : null,
      note: (l.note as string) ?? "",
    })),
    stockRequests: requests.map((r) => ({
      id: r.id as string,
      title: (r.title as string) ?? "",
      status: (r.status as string) ?? "open",
      technicianName: techName.get(r.technician_id as string) ?? r.technician_id,
    })),
    stockBookings: bookings.map((b) => {
      const item = itemById.get(b.item_id as string);
      return {
        id: b.id as string,
        productName: item ? productName.get(item.product_id) ?? null : null,
        serialNumber: item?.serial_number ?? "",
        technicianName: techName.get(b.technician_id as string) ?? b.technician_id,
        bookedOutAt: (b.booked_out_at as string) ?? null,
        returnedAt: (b.returned_at as string | null) ?? null,
      };
    }),
    invoices: (invoicesRes.error ? [] : invoicesRes.data ?? []).map((i) => ({
      id: i.id as string,
      invoiceNumber: i.invoice_number as string,
      invoiceDate: (i.invoice_date as string) ?? null,
      totalIncl: Number(i.total_incl ?? 0),
      status: (i.status as string) ?? "",
      kind: (i.kind as string) ?? "subscription",
    })),
    quotes: (quotesRes.error ? [] : quotesRes.data ?? []).map((q) => ({
      id: q.id as string,
      quoteNumber: q.quote_number as string,
      quoteDate: (q.quote_date as string) ?? null,
      totalIncl: Number(q.total_incl ?? 0),
      status: (q.status as string) ?? "",
      invoiceId: (q.invoice_id as string | null) ?? null,
    })),
    phaseStaff: phaseStaff.map((p) => ({
      id: p.id as string,
      technicianId: p.technician_id as string,
      technicianName: techName.get(p.technician_id as string) ?? p.technician_id,
      blockId: (p.block_id as string | null) ?? null,
      blockName: p.block_id ? blockName.get(p.block_id as string) ?? null : null,
      stageId: (p.stage_id as string | null) ?? null,
      stageName: p.stage_id ? stageName.get(p.stage_id as string) ?? null : null,
      role: (p.role as string) ?? "",
    })),
    blocks: (blocksRes.error ? [] : blocksRes.data ?? []) as { id: string; name: string }[],
    stages: (stagesRes.error ? [] : stagesRes.data ?? []) as { id: string; name: string }[],
  };
}

/**
 * Lightweight project options for pickers in other modules. Coordination raises
 * jobs for projects, stock raises pick lists, accounts raises quotes — none of
 * them necessarily hold the projects module, so this is guarded on any of the
 * four. Private projects only appear for their members.
 */
async function projectOptions(request: Request) {
  const user = await requireAnyAccess(request, ["projects", "coordination", "stock", "accounts"]);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const supabase = createSupabaseAdminClient() as unknown as SupabaseClient;
  const [projectsRes, membersRes] = await Promise.all([
    supabase
      .from("projects")
      .select("id, code, name, status, is_private")
      .not("status", "in", "(completed,cancelled)")
      .order("created_at", { ascending: false })
      .limit(300),
    supabase.from("project_members").select("project_id, user_id").eq("user_id", user.id),
  ]);
  if (projectsRes.error) {
    return NextResponse.json({ error: errorMessage(projectsRes.error) }, { status: 500 });
  }
  const mine = new Set((membersRes.data ?? []).map((m) => m.project_id as string));
  const manage = can(user, "projects", "manage");
  const options = (projectsRes.data ?? [])
    .filter((p) => manage || !p.is_private || mine.has(p.id as string))
    .map((p) => ({ id: p.id as string, code: p.code as string, name: p.name as string, status: p.status as string }));
  return NextResponse.json(
    { options },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

export async function GET(request: Request) {
  // The options picker has its own, wider guard — check before the module gate.
  if (new URL(request.url).searchParams.get("options")) {
    return projectOptions(request);
  }

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

      const integration = await loadIntegration(
        supabase,
        project as { id: string; client_lead_id: string | null }
      );

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
          ...integration,
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
  quoteNumber?: string | null;
  quoteAmount?: number | null;
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
  // BOM lines
  lineId?: string;
  productId?: string | null;
  sundryId?: string | null;
  qtyNeeded?: number;
  unitCost?: number | null;
  note?: string;
  // phase staffing
  staffId?: string;
  technicianId?: string;
  blockId?: string | null;
  stageId?: string | null;
  role?: string;
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
        quote_number: body.quoteNumber || null,
        quote_amount: body.quoteAmount ?? null,
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

    /**
     * Deleting a project is the owner's alone — checked before the edit gate below,
     * because "can edit" is deliberately not the question here.
     *
     * Everything hanging off this row cascades: the block grid, every ticked cell,
     * the delay log, the plant register, the cost ledger and the document links. That
     * is the site history for a job that may have run for two years, and there is no
     * undo. Mirrors projects_delete in migration 059; the database enforces it
     * independently, and this layer exists so a rejection is a clean 403 rather than
     * a silent no-op.
     */
    if (action === "deleteProject") {
      if (!isOwnerRole(user)) {
        return NextResponse.json(
          { error: "Only the business owner can delete a project." },
          { status: 403 }
        );
      }

      // The name must match what the caller was shown. Guards against a stale tab
      // deleting a project that was renamed — or replaced — since it loaded.
      const { data: row } = await supabase
        .from("projects")
        .select("name, code")
        .eq("id", projectId)
        .maybeSingle();
      if (!row) return NextResponse.json({ error: "Project not found" }, { status: 404 });

      if (typeof body.name === "string" && body.name.trim() !== (row.name as string)) {
        return NextResponse.json(
          { error: "That name does not match this project. Reload and try again." },
          { status: 409 }
        );
      }

      const { error } = await supabase.from("projects").delete().eq("id", projectId);
      if (error) throw error;

      return NextResponse.json({ ok: true, deleted: row.code });
    }

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
        if (body.quoteNumber !== undefined) patch.quote_number = body.quoteNumber || null;
        if (body.quoteAmount !== undefined) patch.quote_amount = body.quoteAmount;
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

      // ---- bill of materials (migration 067) --------------------------------
      case "addStockLine": {
        const qty = Number(body.qtyNeeded ?? 0);
        if (!Number.isFinite(qty) || qty <= 0) {
          return NextResponse.json({ error: "A quantity above zero is required" }, { status: 400 });
        }
        if (!body.productId && !body.sundryId && !body.description?.trim()) {
          return NextResponse.json(
            { error: "Pick a product or sundry, or describe the material" },
            { status: 400 }
          );
        }
        const { error } = await supabase.from("project_stock_lines").insert({
          id: newId("psl"),
          project_id: projectId,
          product_id: body.productId ?? null,
          sundry_id: body.productId ? null : body.sundryId ?? null,
          description: body.description?.trim() ?? "",
          qty_needed: qty,
          unit_cost: body.unitCost ?? null,
          note: body.note?.trim() ?? "",
          created_by: user.id,
        });
        if (error) throw new Error(`${errorMessage(error)} — run supabase/migrations/067_project_integration.sql in Supabase.`);
        return NextResponse.json({ ok: true });
      }

      case "updateStockLine": {
        if (!body.lineId) return NextResponse.json({ error: "lineId required" }, { status: 400 });
        const patch: Record<string, unknown> = {};
        if (body.qtyNeeded !== undefined) {
          const qty = Number(body.qtyNeeded);
          if (!Number.isFinite(qty) || qty <= 0) {
            return NextResponse.json({ error: "A quantity above zero is required" }, { status: 400 });
          }
          patch.qty_needed = qty;
        }
        if (body.unitCost !== undefined) patch.unit_cost = body.unitCost;
        if (body.note !== undefined) patch.note = body.note.trim();
        const { error } = await supabase
          .from("project_stock_lines")
          .update(patch)
          .eq("id", body.lineId)
          .eq("project_id", projectId);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      case "removeStockLine": {
        if (!body.lineId) return NextResponse.json({ error: "lineId required" }, { status: 400 });
        const { error } = await supabase
          .from("project_stock_lines")
          .delete()
          .eq("id", body.lineId)
          .eq("project_id", projectId);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      // ---- phase staffing (migration 067) -----------------------------------
      case "addPhaseStaff": {
        if (!body.technicianId) {
          return NextResponse.json({ error: "technicianId required" }, { status: 400 });
        }
        // A block or stage id from another project would attach this person to
        // a phase that isn't on this project's grid.
        for (const [table, value] of [
          ["project_blocks", body.blockId],
          ["project_stages", body.stageId],
        ] as const) {
          if (!value) continue;
          const { data: row } = await supabase
            .from(table)
            .select("id")
            .eq("id", value)
            .eq("project_id", projectId)
            .maybeSingle();
          if (!row) {
            return NextResponse.json(
              { error: "That block or stage is not on this project" },
              { status: 400 }
            );
          }
        }
        const { error } = await supabase.from("project_phase_staff").insert({
          id: newId("pps"),
          project_id: projectId,
          block_id: body.blockId || null,
          stage_id: body.stageId || null,
          technician_id: body.technicianId,
          role: body.role?.trim() ?? "",
          note: body.note?.trim() ?? "",
          added_by: user.id,
        });
        if (error) {
          if (/project_phase_staff_scope_key|duplicate/i.test(error.message)) {
            return NextResponse.json(
              { error: "That person is already assigned to this phase" },
              { status: 409 }
            );
          }
          throw new Error(`${errorMessage(error)} — run supabase/migrations/067_project_integration.sql in Supabase.`);
        }
        return NextResponse.json({ ok: true });
      }

      case "removePhaseStaff": {
        if (!body.staffId) return NextResponse.json({ error: "staffId required" }, { status: 400 });
        const { error } = await supabase
          .from("project_phase_staff")
          .delete()
          .eq("id", body.staffId)
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
