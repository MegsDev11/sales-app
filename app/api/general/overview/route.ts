import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAuthUserFromRequest } from "@/lib/supabase/server-auth";
import { can } from "@/lib/access";
import { isOwner } from "@/lib/permissions";
import { MODULE_LIST } from "@/lib/modules";
import { SERVICE_LABELS, STAGE_LABELS } from "@/lib/constants";
import { isJobOverdue, isReturnOverdue } from "@/lib/overdue/rules";
import type { Department, LeadStage, ModuleKey } from "@/lib/types";
import { errorMessage } from "@/lib/api/route-helpers";
import type {
  CompanyOverview,
  CoordinationBlock,
  FinancialBlock,
  PeopleBlock,
  ProcurementBlock,
  ProjectsBlock,
  SalesBlock,
  Series,
  Slice,
  StockBlock,
  SupportBlock,
  WirelessBlock,
} from "@/lib/general/overview-types";

/**
 * The General Manager's company-wide snapshot.
 *
 * ONE request, aggregated server-side, covering every department. That shape is
 * deliberate on three counts:
 *
 *   1. Access. The department pages each guard their own module, so a GM assembling
 *      the same picture client-side would need a grant on all eight — and would see
 *      a mosaic of 403s until they had them. Holding `general` is itself the
 *      management-overview permission, and this route is where that is enforced.
 *   2. Payload. The GM needs counts, not rows. The client stores exist to back
 *      tables and boards; pulling every lead, item and job into the browser purely
 *      to length-check them is waste the department pages accept because they also
 *      render the rows. This page does not.
 *   3. Blast radius. Each block is loaded and caught independently, so a department
 *      whose migration has not run reports `unavailable` instead of 500-ing the
 *      whole dashboard.
 *
 * Reads use the service-role client, matching /api/procurement and /api/projects:
 * the guard above decides, RLS still enforces independently on any direct query.
 */

/**
 * The procurement and projects tables (migrations 046/047) are not in the
 * generated Database types yet, so the typed client resolves them to `never`.
 * Those two blocks talk to an untyped view of the same client.
 */
function untyped(): SupabaseClient {
  return createSupabaseAdminClient() as unknown as SupabaseClient;
}

/** Turn a caught failure into an `unavailable` block without losing the reason. */
function unavailable<T extends object>(error: unknown, empty: T) {
  return { ...empty, state: "unavailable" as const, note: errorMessage(error) };
}

// ---------------------------------------------------------------------------
// Time bucketing
// ---------------------------------------------------------------------------

interface Bucket {
  start: number;
  end: number;
  label: string;
}

/**
 * Month and week boundaries in the CALLER's local time, not the server's.
 *
 * The client sends `new Date().getTimezoneOffset()`. Without it a report opened at
 * 01:00 SAST on the 1st would file that morning's sales under the previous month,
 * because the server clock is UTC. The offset is minutes of UTC-minus-local, so
 * local = utc - offset*60000.
 */
function shiftFor(tzOffsetMinutes: number): number {
  return -tzOffsetMinutes * 60_000;
}

function monthBuckets(count: number, tzOffsetMinutes: number): Bucket[] {
  const shift = shiftFor(tzOffsetMinutes);
  const nowLocal = new Date(Date.now() + shift);
  const year = nowLocal.getUTCFullYear();
  const month = nowLocal.getUTCMonth();

  return Array.from({ length: count }, (_, i) => {
    const offset = month - (count - 1 - i);
    const startLocal = Date.UTC(year, offset, 1);
    const endLocal = Date.UTC(year, offset + 1, 1);
    return {
      start: startLocal - shift,
      end: endLocal - shift,
      label: new Date(startLocal).toLocaleDateString("en-ZA", {
        month: "short",
        timeZone: "UTC",
      }),
    };
  });
}

function weekBuckets(count: number, tzOffsetMinutes: number): Bucket[] {
  const shift = shiftFor(tzOffsetMinutes);
  const nowLocal = new Date(Date.now() + shift);
  const endOfTodayLocal = Date.UTC(
    nowLocal.getUTCFullYear(),
    nowLocal.getUTCMonth(),
    nowLocal.getUTCDate() + 1
  );
  const week = 7 * 86_400_000;

  return Array.from({ length: count }, (_, i) => {
    const endLocal = endOfTodayLocal - (count - 1 - i) * week;
    const startLocal = endLocal - week;
    const start = new Date(startLocal);
    return {
      start: startLocal - shift,
      end: endLocal - shift,
      label: `${start.getUTCDate()}/${start.getUTCMonth() + 1}`,
    };
  });
}

/** Start of the caller's today, as a UTC millisecond boundary. */
function todayRange(tzOffsetMinutes: number): { start: number; end: number } {
  const shift = shiftFor(tzOffsetMinutes);
  const nowLocal = new Date(Date.now() + shift);
  const startLocal = Date.UTC(
    nowLocal.getUTCFullYear(),
    nowLocal.getUTCMonth(),
    nowLocal.getUTCDate()
  );
  return { start: startLocal - shift, end: startLocal - shift + 86_400_000 };
}

function inBucket(iso: string | null | undefined, b: Bucket): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= b.start && t < b.end;
}

function seriesOf(buckets: Bucket[], value: (b: Bucket) => number): Series {
  return { labels: buckets.map((b) => b.label), values: buckets.map(value) };
}

/** Percentage change between the last two points. Mirrors momChange in metrics.ts. */
function momChange(values: number[]): number | undefined {
  if (values.length < 2) return undefined;
  const prev = values[values.length - 2];
  const curr = values[values.length - 1];
  if (prev === 0) return curr === 0 ? 0 : undefined;
  return ((curr - prev) / prev) * 100;
}

/** Count occurrences of a key, largest first. */
function tally(rows: string[]): Slice[] {
  const counts = new Map<string, number>();
  for (const key of rows) counts.set(key, (counts.get(key) ?? 0) + 1);
  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function titleCase(value: string): string {
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ---------------------------------------------------------------------------
// Department blocks
// ---------------------------------------------------------------------------

const EMPTY_SERIES: Series = { labels: [], values: [] };

async function loadSales(tz: number): Promise<SalesBlock> {
  const empty: SalesBlock = {
    state: "ok",
    revenue: EMPTY_SERIES,
    newLeads: EMPTY_SERIES,
    thisMonthRevenue: 0,
    revenueTarget: 0,
    openPipeline: 0,
    activeLeads: 0,
    winRate: 0,
    avgDaysToClose: 0,
    unassigned: 0,
    overdueFollowUps: 0,
    serviceMix: [],
    stageMix: [],
  };

  try {
    const supabase = createSupabaseAdminClient();
    const [leadsResult, staffResult] = await Promise.all([
      supabase
        .from("leads")
        .select(
          "stage, deal_value, service_type, created_at, closed_at, deleted, assigned_to_id, next_follow_up_at, inbox_dismissed_at"
        )
        .eq("deleted", false),
      supabase
        .from("team_members")
        .select("monthly_revenue_target, role, active")
        .eq("active", true),
    ]);

    if (leadsResult.error) throw new Error(leadsResult.error.message);

    const leads = leadsResult.data ?? [];
    const months = monthBuckets(6, tz);
    const now = Date.now();

    const isActive = (stage: string) => stage !== "closed_won" && stage !== "closed_lost";
    const active = leads.filter((l) => isActive(l.stage));
    const closed = leads.filter((l) => !isActive(l.stage));
    const won = leads.filter((l) => l.stage === "closed_won");

    const revenue = seriesOf(months, (b) =>
      won
        .filter((l) => inBucket(l.closed_at, b))
        .reduce((sum, l) => sum + (l.deal_value ?? 0), 0)
    );

    const wonWithDates = won.filter((l) => l.closed_at);
    const avgDaysToClose = wonWithDates.length
      ? wonWithDates.reduce(
          (s, l) =>
            s +
            (new Date(l.closed_at as string).getTime() - new Date(l.created_at).getTime()) /
              86_400_000,
          0
        ) / wonWithDates.length
      : 0;

    // Owner targets are personal, not team quota — same exclusion the company page makes.
    const revenueTarget = (staffResult.data ?? [])
      .filter((u) => u.role !== "owner")
      .reduce((s, u) => s + (u.monthly_revenue_target ?? 0), 0);

    return {
      ...empty,
      revenue,
      newLeads: seriesOf(months, (b) => leads.filter((l) => inBucket(l.created_at, b)).length),
      thisMonthRevenue: revenue.values[revenue.values.length - 1] ?? 0,
      revenueChange: momChange(revenue.values),
      revenueTarget,
      openPipeline: active.reduce((s, l) => s + (l.deal_value ?? 0), 0),
      activeLeads: active.length,
      winRate: closed.length ? (won.length / closed.length) * 100 : 0,
      avgDaysToClose,
      unassigned: active.filter((l) => !l.assigned_to_id && !l.inbox_dismissed_at).length,
      overdueFollowUps: active.filter(
        (l) => l.next_follow_up_at && new Date(l.next_follow_up_at).getTime() < now
      ).length,
      serviceMix: tally(leads.map((l) => l.service_type)).map((s) => ({
        ...s,
        label: SERVICE_LABELS[s.label as keyof typeof SERVICE_LABELS] ?? titleCase(s.label),
      })),
      stageMix: tally(active.map((l) => l.stage)).map((s) => ({
        ...s,
        label: STAGE_LABELS[s.label as LeadStage] ?? titleCase(s.label),
      })),
    };
  } catch (error) {
    return unavailable(error, empty);
  }
}

async function loadSupport(tz: number): Promise<SupportBlock> {
  const empty: SupportBlock = {
    state: "ok",
    towers: 0,
    offlineTowers: 0,
    activeOutages: 0,
    linkedClients: 0,
    towerStatus: [],
    outagesByMonth: EMPTY_SERIES,
  };

  try {
    const supabase = createSupabaseAdminClient();
    const [towersResult, outagesResult, linkedResult] = await Promise.all([
      supabase.from("towers").select("status"),
      supabase.from("tower_outages").select("started_at, resolved_at"),
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("deleted", false)
        .not("tower_id", "is", null),
    ]);

    if (towersResult.error) throw new Error(towersResult.error.message);

    const towers = towersResult.data ?? [];
    const outages = outagesResult.error ? [] : (outagesResult.data ?? []);
    const months = monthBuckets(6, tz);

    return {
      ...empty,
      towers: towers.length,
      offlineTowers: towers.filter((t) => t.status === "offline").length,
      activeOutages: outages.filter((o) => !o.resolved_at).length,
      linkedClients: linkedResult.count ?? 0,
      towerStatus: tally(towers.map((t) => t.status)).map((s) => ({
        ...s,
        label: titleCase(s.label),
      })),
      outagesByMonth: seriesOf(
        months,
        (b) => outages.filter((o) => inBucket(o.started_at, b)).length
      ),
    };
  } catch (error) {
    return unavailable(error, empty);
  }
}

async function loadCoordination(tz: number): Promise<CoordinationBlock> {
  const empty: CoordinationBlock = {
    state: "ok",
    activeJobs: 0,
    scheduledToday: 0,
    overdue: 0,
    unassigned: 0,
    technicians: 0,
    completedJobs: 0,
    byStatus: [],
    byType: [],
    completedByWeek: EMPTY_SERIES,
  };

  try {
    const supabase = createSupabaseAdminClient();
    const [jobsResult, assignmentsResult, techsResult] = await Promise.all([
      supabase
        .from("jobs")
        .select("id, status, job_type, scheduled_start, scheduled_end, updated_at"),
      supabase.from("job_assignments").select("job_id"),
      supabase
        .from("team_members")
        .select("id", { count: "exact", head: true })
        .eq("active", true)
        .not("technician_level", "is", null),
    ]);

    if (jobsResult.error) throw new Error(jobsResult.error.message);

    const jobs = jobsResult.data ?? [];
    const assigned = new Set((assignmentsResult.data ?? []).map((a) => a.job_id));
    const now = Date.now();
    const today = todayRange(tz);

    const active = jobs.filter((j) => j.status !== "completed" && j.status !== "cancelled");

    return {
      ...empty,
      activeJobs: active.length,
      scheduledToday: jobs.filter((j) => {
        if (!j.scheduled_start) return false;
        const t = new Date(j.scheduled_start).getTime();
        return t >= today.start && t < today.end;
      }).length,
      overdue: active.filter((j) => isJobOverdue(j.scheduled_end, j.status, now)).length,
      unassigned: active.filter((j) => !assigned.has(j.id)).length,
      technicians: techsResult.count ?? 0,
      completedJobs: jobs.filter((j) => j.status === "completed").length,
      byStatus: tally(jobs.map((j) => j.status)),
      byType: tally(jobs.map((j) => j.job_type || "unspecified")).map((s) => ({
        ...s,
        label: titleCase(s.label),
      })),
      completedByWeek: seriesOf(
        weekBuckets(8, tz),
        (b) =>
          jobs.filter((j) => j.status === "completed" && inBucket(j.updated_at, b)).length
      ),
    };
  } catch (error) {
    return unavailable(error, empty);
  }
}

async function loadStock(tz: number): Promise<StockBlock> {
  const empty: StockBlock = {
    state: "ok",
    available: 0,
    bookedOut: 0,
    retired: 0,
    productsTracked: 0,
    outOfStock: 0,
    openPickLists: 0,
    returnsOverdue: 0,
    unitsByProduct: [],
    bookOutsByWeek: EMPTY_SERIES,
  };

  try {
    const supabase = createSupabaseAdminClient();
    const [productsResult, itemsResult, bookingsResult, requestsResult] = await Promise.all([
      supabase.from("stock_products").select("id, name"),
      supabase.from("stock_items").select("product_id, status"),
      supabase.from("stock_bookings").select("booked_out_at, returned_at, return_needed_at"),
      supabase.from("stock_requests").select("status"),
    ]);

    if (itemsResult.error) throw new Error(itemsResult.error.message);

    const products = productsResult.data ?? [];
    const items = itemsResult.data ?? [];
    const bookings = bookingsResult.data ?? [];
    const requests = requestsResult.data ?? [];
    const now = Date.now();

    const byProduct = products
      .map((p) => {
        const units = items.filter((i) => i.product_id === p.id);
        return {
          label: p.name,
          value: units.length,
          available: units.filter((i) => i.status === "available").length,
        };
      })
      .sort((a, b) => b.value - a.value);

    return {
      ...empty,
      available: items.filter((i) => i.status === "available").length,
      bookedOut: items.filter((i) => i.status === "booked_out").length,
      retired: items.filter((i) => i.status === "retired").length,
      productsTracked: products.length,
      // Same deterministic rule the stock page uses: tracked, but nothing free.
      outOfStock: byProduct.filter((p) => p.value > 0 && p.available === 0).length,
      openPickLists: requests.filter((r) => r.status === "open" || r.status === "partial").length,
      returnsOverdue: bookings.filter((b) =>
        isReturnOverdue(b.return_needed_at, b.returned_at, now)
      ).length,
      unitsByProduct: byProduct.map(({ label, value }) => ({ label, value })),
      bookOutsByWeek: seriesOf(
        weekBuckets(8, tz),
        (b) => bookings.filter((x) => inBucket(x.booked_out_at, b)).length
      ),
    };
  } catch (error) {
    return unavailable(error, empty);
  }
}

async function loadProcurement(): Promise<ProcurementBlock> {
  const empty: ProcurementBlock = {
    state: "ok",
    activeSuppliers: 0,
    openOrders: 0,
    awaitingDelivery: 0,
    committedSpend: 0,
    byStatus: [],
    spendBySupplier: [],
  };

  try {
    const supabase = untyped();
    const [suppliersResult, ordersResult] = await Promise.all([
      supabase.from("suppliers").select("id, name, active"),
      supabase.from("purchase_orders").select("supplier_id, status, total"),
    ]);

    if (suppliersResult.error) throw new Error(suppliersResult.error.message);
    if (ordersResult.error) throw new Error(ordersResult.error.message);

    const suppliers = (suppliersResult.data ?? []) as { id: string; name: string; active: boolean }[];
    const orders = (ordersResult.data ?? []) as {
      supplier_id: string;
      status: string;
      total: number | string | null;
    }[];

    const nameById = new Map(suppliers.map((s) => [s.id, s.name]));
    const awaiting = orders.filter((p) => ["ordered", "partially_received"].includes(p.status));

    const spend = new Map<string, number>();
    for (const po of awaiting) {
      const key = nameById.get(po.supplier_id) ?? "Unknown supplier";
      spend.set(key, (spend.get(key) ?? 0) + Number(po.total ?? 0));
    }

    return {
      ...empty,
      activeSuppliers: suppliers.filter((s) => s.active).length,
      openOrders: orders.filter((p) =>
        ["draft", "ordered", "partially_received"].includes(p.status)
      ).length,
      awaitingDelivery: awaiting.length,
      committedSpend: awaiting.reduce((n, p) => n + Number(p.total ?? 0), 0),
      byStatus: tally(orders.map((p) => p.status)),
      spendBySupplier: Array.from(spend.entries())
        .map(([label, value]) => ({ label, value: Math.round(value) }))
        .sort((a, b) => b.value - a.value),
    };
  } catch (error) {
    return unavailable(error, empty);
  }
}

async function loadWireless(): Promise<WirelessBlock> {
  const empty: WirelessBlock = {
    state: "ok",
    openSubmissions: 0,
    draftLayouts: 0,
    publishedLayouts: 0,
    routersOnline: 0,
    routersOffline: 0,
    routersUnknown: 0,
    layoutStatus: [],
  };

  try {
    const supabase = createSupabaseAdminClient();
    const [submissionsResult, layoutsResult, devicesResult] = await Promise.all([
      supabase.from("network_layout_submissions").select("status"),
      supabase.from("network_layouts").select("status"),
      supabase.from("network_devices").select("status"),
    ]);

    if (layoutsResult.error) throw new Error(layoutsResult.error.message);

    const submissions = submissionsResult.error ? [] : (submissionsResult.data ?? []);
    const layouts = layoutsResult.data ?? [];
    const devices = devicesResult.error ? [] : (devicesResult.data ?? []);

    return {
      ...empty,
      openSubmissions: submissions.filter(
        (s) => s.status === "new" || s.status === "in_progress"
      ).length,
      draftLayouts: layouts.filter((l) => l.status === "draft").length,
      publishedLayouts: layouts.filter((l) => l.status === "published").length,
      routersOnline: devices.filter((d) => d.status === "online").length,
      routersOffline: devices.filter((d) => d.status === "offline").length,
      routersUnknown: devices.filter((d) => d.status !== "online" && d.status !== "offline")
        .length,
      layoutStatus: tally(layouts.map((l) => l.status)).map((s) => ({
        ...s,
        label: titleCase(s.label),
      })),
    };
  } catch (error) {
    return unavailable(error, empty);
  }
}

async function loadFinancial(tz: number): Promise<FinancialBlock> {
  const empty: FinancialBlock = {
    state: "ok",
    spend: EMPTY_SERIES,
    litres: EMPTY_SERIES,
    thisMonthSpend: 0,
    totalSpend: 0,
    totalLitres: 0,
    avgPerLitre: 0,
    fillCount: 0,
    spendByVehicle: [],
  };

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("fuel_entries")
      .select("vehicle_id, litres, price, recorded_at");
    if (error) throw new Error(error.message);

    const entries = data ?? [];
    const months = monthBuckets(6, tz);

    const vehicleIds = [...new Set(entries.map((e) => e.vehicle_id))];
    const { data: vehicles } = vehicleIds.length
      ? await supabase.from("vehicles").select("id, brand, number_plate").in("id", vehicleIds)
      : { data: [] };
    const vehicleLabel = new Map(
      (vehicles ?? []).map((v) => [v.id, v.number_plate || v.brand || "Unknown vehicle"])
    );

    const spend = seriesOf(months, (b) =>
      entries.filter((e) => inBucket(e.recorded_at, b)).reduce((s, e) => s + (e.price ?? 0), 0)
    );

    const byVehicle = new Map<string, number>();
    for (const e of entries) {
      const label = vehicleLabel.get(e.vehicle_id) ?? "Unknown vehicle";
      byVehicle.set(label, (byVehicle.get(label) ?? 0) + (e.price ?? 0));
    }

    const totalSpend = entries.reduce((s, e) => s + (e.price ?? 0), 0);
    const totalLitres = entries.reduce((s, e) => s + (e.litres ?? 0), 0);

    return {
      ...empty,
      spend,
      litres: seriesOf(months, (b) =>
        Math.round(
          entries.filter((e) => inBucket(e.recorded_at, b)).reduce((s, e) => s + (e.litres ?? 0), 0)
        )
      ),
      thisMonthSpend: spend.values[spend.values.length - 1] ?? 0,
      spendChange: momChange(spend.values),
      totalSpend,
      totalLitres,
      avgPerLitre: totalLitres > 0 ? totalSpend / totalLitres : 0,
      fillCount: entries.length,
      spendByVehicle: Array.from(byVehicle.entries())
        .map(([label, value]) => ({ label, value: Math.round(value) }))
        .sort((a, b) => b.value - a.value),
    };
  } catch (error) {
    return unavailable(error, empty);
  }
}

async function loadProjects(): Promise<ProjectsBlock> {
  const empty: ProjectsBlock = {
    state: "ok",
    active: 0,
    atRisk: 0,
    completed: 0,
    budget: 0,
    actualCost: 0,
    byStatus: [],
    byPriority: [],
  };

  try {
    const supabase = untyped();
    const { data, error } = await supabase
      .from("projects")
      .select("status, priority, target_date, budget_amount, actual_cost");
    if (error) throw new Error(error.message);

    const projects = (data ?? []) as {
      status: string;
      priority: string;
      target_date: string | null;
      budget_amount: number | string | null;
      actual_cost: number | string | null;
    }[];
    const now = Date.now();

    // "Live" is the project_status `live` group — work actually running. The idea
    // funnel (idea / evaluating / approved) is a queue, not a commitment, so
    // counting it as active would overstate the load and drag unspent budget in
    // with it.
    const live = projects.filter((p) => p.status === "active" || p.status === "on_hold");

    return {
      ...empty,
      active: live.length,
      // Past its target date and still running. The only risk signal the schema supports.
      atRisk: live.filter((p) => p.target_date && new Date(p.target_date).getTime() < now)
        .length,
      completed: projects.filter((p) => p.status === "completed").length,
      budget: live.reduce((s, p) => s + Number(p.budget_amount ?? 0), 0),
      actualCost: live.reduce((s, p) => s + Number(p.actual_cost ?? 0), 0),
      byStatus: tally(projects.map((p) => p.status)),
      byPriority: tally(live.map((p) => p.priority)),
    };
  } catch (error) {
    return unavailable(error, empty);
  }
}

async function loadPeople(): Promise<PeopleBlock> {
  const empty: PeopleBlock = {
    state: "ok",
    activeStaff: 0,
    headcountByDepartment: [],
    departments: [],
  };

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("team_members")
      .select("name, role, department, active")
      .eq("active", true);
    if (error) throw new Error(error.message);

    const staff = (data ?? []).filter((u) => u.role !== "owner");

    // Only `sales` differs from its module key; moduleForDepartment does the same map.
    const departmentFor = (key: ModuleKey): Department =>
      (key === "crm" ? "sales" : key) as Department;

    return {
      ...empty,
      activeStaff: staff.length,
      headcountByDepartment: MODULE_LIST.filter((m) => m.group !== "admin")
        .map((m) => ({
          label: m.label,
          value: staff.filter((u) => u.department === departmentFor(m.key)).length,
        }))
        .filter((d) => d.value > 0)
        .sort((a, b) => b.value - a.value),
      departments: MODULE_LIST.filter((m) => m.group !== "admin").map((m) => {
        const dept = departmentFor(m.key);
        const inDept = staff.filter((u) => u.department === dept);
        return {
          key: m.key,
          manager: inDept.find((u) => u.role === "manager")?.name ?? null,
          staff: inDept.length,
        };
      }),
    };
  } catch (error) {
    return unavailable(error, empty);
  }
}

// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const user = await getAuthUserFromRequest(request);
  // The general module IS the cross-company management view — holding it is what
  // earns the whole-business picture, exactly as owning the company earns /company.
  if (!user || (!can(user, "general") && !isOwner(user))) {
    return NextResponse.json(
      { error: "Unauthorized — general management access required" },
      { status: 403 }
    );
  }

  const raw = Number(new URL(request.url).searchParams.get("tzOffset"));
  const tz = Number.isFinite(raw) ? raw : 0;

  const [sales, support, coordination, stock, procurement, wireless, financial, projects, people] =
    await Promise.all([
      loadSales(tz),
      loadSupport(tz),
      loadCoordination(tz),
      loadStock(tz),
      loadProcurement(),
      loadWireless(),
      loadFinancial(tz),
      loadProjects(),
      loadPeople(),
    ]);

  const payload: CompanyOverview = {
    generatedAt: new Date().toISOString(),
    sales,
    support,
    coordination,
    stock,
    procurement,
    wireless,
    financial,
    projects,
    people,
  };

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
