"use client";

import { BarChart, ColumnChart, StackedBar } from "@/components/charts/bar-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { LineChart } from "@/components/charts/line-chart";
import { SERIES, STATUS } from "@/components/charts/tokens";
import { DepartmentSection, type Metric } from "@/components/general/department-section";
import { poStatusMeta } from "@/lib/procurement/constants";
import { PRIORITIES, statusMeta as projectStatusMeta } from "@/lib/projects/constants";
import { MODULES } from "@/lib/modules";
import type {
  CompanyOverview,
  OverviewSectionId,
  Slice,
} from "@/lib/general/overview-types";
import type { ModuleKey } from "@/lib/types";

/**
 * Every department's contribution to the GM dashboard.
 *
 * Each block renders in two densities. In the "all departments" view it shows the
 * one chart that answers "is this department healthy?" — because eight departments
 * times four charts is a scroll, not a screen. Selecting a department's tab sets
 * `focused` and the rest of its charts appear.
 */

/** Charts sit two-up when a single department has the page to itself. */
function ChartRow({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 lg:grid-cols-2">{children}</div>;
}

/**
 * Colour a status breakdown by MEANING where the state is genuinely good or bad,
 * and by identity everywhere else. "Offline" must not land on whichever categorical
 * slot its alphabetical position happens to give it.
 */
const HEALTH_TONE: Record<string, string> = {
  online: STATUS.good,
  published: STATUS.good,
  available: SERIES[2],
  offline: STATUS.critical,
  retired: "#94a3b8",
  unknown: "#cbd5e1",
  maintenance: STATUS.warning,
};

interface Segment {
  label: string;
  value: number;
  color?: string;
  colorIndex: number;
}

function toned(slices: Slice[]): Segment[] {
  return slices.map((s, i) => ({
    ...s,
    label: titleCase(s.label),
    color: HEALTH_TONE[s.label.toLowerCase()],
    colorIndex: i,
  }));
}

/**
 * Status slices that arrive as raw enum values, resolved through the vocabulary
 * their own module already owns — same label and same colour the department page
 * uses, so the GM and the team are looking at the same chart.
 */
function viaMeta(
  slices: Slice[],
  meta: (value: string) => { label: string; color: string }
): Segment[] {
  return slices.map((s, i) => {
    const m = meta(s.label);
    return { label: m.label, value: s.value, color: m.color, colorIndex: i };
  });
}

/** Job status has no shared constant; this mirrors the coordination overview. */
const JOB_STATUS_META: Record<string, { label: string; color: string }> = {
  scheduled: { label: "Scheduled", color: SERIES[0] },
  en_route: { label: "En route", color: SERIES[3] },
  on_site: { label: "On site", color: SERIES[1] },
  completed: { label: "Completed", color: SERIES[2] },
  cancelled: { label: "Cancelled", color: "#94a3b8" },
};

function jobStatusMeta(value: string) {
  return JOB_STATUS_META[value] ?? { label: titleCase(value), color: "#cbd5e1" };
}

function priorityMeta(value: string) {
  return PRIORITIES.find((p) => p.value === value) ?? { label: titleCase(value), color: "#94a3b8" };
}

function titleCase(value: string): string {
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Zero reads as "nothing wrong"; anything above it is worth the eye. */
function alarm(count: number): string | undefined {
  return count > 0 ? STATUS.critical : undefined;
}

function warn(count: number): string | undefined {
  return count > 0 ? STATUS.warning : undefined;
}

export interface BlockProps {
  data: CompanyOverview;
  focused: boolean;
  /** Modules the viewer may open, so a section can hide a link it cannot follow. */
  canOpen: (key: ModuleKey) => boolean;
}

function sectionProps(data: CompanyOverview, module: ModuleKey, canOpen: (k: ModuleKey) => boolean) {
  const mod = MODULES[module];
  const dept = data.people.departments.find((d) => d.key === module);
  return {
    icon: mod.icon,
    label: mod.label,
    href: mod.root,
    manager: dept?.manager ?? null,
    staff: dept?.staff,
    canOpen: canOpen(module),
  };
}

// ---------------------------------------------------------------------------

function SalesBlockView({ data, focused, canOpen }: BlockProps) {
  const s = data.sales;
  const metrics: Metric[] = [
    { label: "Open pipeline", value: s.openPipeline, currency: true, href: "/board" },
    { label: "Active leads", value: s.activeLeads, href: "/board" },
    { label: "Win rate", value: `${Math.round(s.winRate)}%` },
    {
      label: "Unassigned",
      value: s.unassigned,
      tone: warn(s.unassigned),
      href: "/inbox",
    },
  ];

  return (
    <DepartmentSection {...sectionProps(data, "crm", canOpen)} block={s} metrics={metrics}>
      <LineChart
        title="Revenue closed"
        subtitle="Won deals per month, last 6 months"
        labels={s.revenue.labels}
        series={[{ label: "Revenue", points: s.revenue.values }]}
        currency
        area
      />
      {focused ? (
        <>
          <ChartRow>
            <ColumnChart
              title="New leads"
              subtitle="Created per month"
              data={s.newLeads.labels.map((label, i) => ({
                label,
                value: s.newLeads.values[i],
              }))}
            />
            <DonutChart
              title="Service mix"
              subtitle="All leads by service type"
              segments={s.serviceMix.map((x, i) => ({ ...x, colorIndex: i }))}
              centerLabel="leads"
            />
          </ChartRow>
          <ChartRow>
            <BarChart
              title="Pipeline by stage"
              subtitle="Open leads sitting in each stage"
              data={s.stageMix}
              ordinal
            />
            <StackedBar
              title="Follow-up health"
              subtitle="Active leads needing attention"
              segments={[
                {
                  label: "On track",
                  value: Math.max(s.activeLeads - s.overdueFollowUps - s.unassigned, 0),
                  color: STATUS.good,
                },
                { label: "Overdue follow-up", value: s.overdueFollowUps, color: STATUS.warning },
                { label: "Unassigned", value: s.unassigned, color: STATUS.critical },
              ]}
            />
          </ChartRow>
        </>
      ) : null}
    </DepartmentSection>
  );
}

function SupportBlockView({ data, focused, canOpen }: BlockProps) {
  const s = data.support;
  const metrics: Metric[] = [
    { label: "Towers", value: s.towers, href: "/support/towers" },
    { label: "Offline", value: s.offlineTowers, tone: alarm(s.offlineTowers) },
    { label: "Active outages", value: s.activeOutages, tone: alarm(s.activeOutages) },
    { label: "Linked clients", value: s.linkedClients, href: "/support/clients" },
  ];

  return (
    <DepartmentSection {...sectionProps(data, "support", canOpen)} block={s} metrics={metrics}>
      <StackedBar
        title="Tower status"
        subtitle="Every tower by current state"
        segments={toned(s.towerStatus)}
      />
      {/* One extra chart, full width. A second panel here would only restate a
          number the strip above already carries. */}
      {focused ? (
        <ColumnChart
          title="Outages reported"
          subtitle="Per month, last 6 months"
          data={s.outagesByMonth.labels.map((label, i) => ({
            label,
            value: s.outagesByMonth.values[i],
          }))}
        />
      ) : null}
    </DepartmentSection>
  );
}

function CoordinationBlockView({ data, focused, canOpen }: BlockProps) {
  const c = data.coordination;
  const metrics: Metric[] = [
    { label: "Active jobs", value: c.activeJobs, href: "/coordination/jobs" },
    { label: "Today", value: c.scheduledToday, href: "/coordination/jobs" },
    { label: "Overdue", value: c.overdue, tone: alarm(c.overdue), href: "/coordination/jobs" },
    { label: "Technicians", value: c.technicians, href: "/coordination/technicians" },
  ];

  return (
    <DepartmentSection
      {...sectionProps(data, "coordination", canOpen)}
      block={c}
      metrics={metrics}
    >
      <ColumnChart
        title="Completed jobs"
        subtitle="Per week, last 8 weeks"
        data={c.completedByWeek.labels.map((label, i) => ({
          label,
          value: c.completedByWeek.values[i],
        }))}
      />
      {focused ? (
        <ChartRow>
          <StackedBar
            title="Jobs by status"
            subtitle="Every job in the system"
            segments={viaMeta(c.byStatus, jobStatusMeta)}
          />
          <DonutChart
            title="Job types"
            subtitle="All jobs by type"
            segments={c.byType.map((x, i) => ({ ...x, colorIndex: i }))}
            centerLabel="jobs"
          />
        </ChartRow>
      ) : null}
    </DepartmentSection>
  );
}

function StockBlockView({ data, focused, canOpen }: BlockProps) {
  const s = data.stock;
  const metrics: Metric[] = [
    { label: "Available", value: s.available, href: "/stock/inventory" },
    { label: "Booked out", value: s.bookedOut, href: "/stock/booked-out" },
    { label: "Out of stock", value: s.outOfStock, tone: alarm(s.outOfStock) },
    { label: "Open pick lists", value: s.openPickLists, tone: warn(s.openPickLists), href: "/stock/requests" },
  ];

  return (
    <DepartmentSection {...sectionProps(data, "stock", canOpen)} block={s} metrics={metrics}>
      <StackedBar
        title="Where the stock is"
        subtitle="Every tracked unit by current status"
        segments={[
          { label: "Available", value: s.available, color: SERIES[2] },
          { label: "Booked out", value: s.bookedOut, color: SERIES[1] },
          { label: "Retired", value: s.retired, color: "#94a3b8" },
        ]}
      />
      {focused ? (
        <ChartRow>
          <ColumnChart
            title="Book-out activity"
            subtitle="Units booked out per week"
            data={s.bookOutsByWeek.labels.map((label, i) => ({
              label,
              value: s.bookOutsByWeek.values[i],
            }))}
          />
          <BarChart
            title="Units by product"
            subtitle="Total tracked units, largest first"
            data={s.unitsByProduct}
          />
        </ChartRow>
      ) : null}
    </DepartmentSection>
  );
}

function ProcurementBlockView({ data, focused, canOpen }: BlockProps) {
  const p = data.procurement;
  const metrics: Metric[] = [
    { label: "Suppliers", value: p.activeSuppliers, href: "/procurement/suppliers" },
    { label: "Open POs", value: p.openOrders, href: "/procurement/orders" },
    { label: "Awaiting delivery", value: p.awaitingDelivery },
    { label: "Committed", value: p.committedSpend, currency: true },
  ];

  return (
    <DepartmentSection
      {...sectionProps(data, "procurement", canOpen)}
      block={p}
      metrics={metrics}
    >
      <StackedBar
        title="Purchase orders"
        subtitle="Every PO by stage of the buying flow"
        segments={viaMeta(p.byStatus, poStatusMeta)}
      />
      {focused ? (
        <BarChart
          title="Committed spend by supplier"
          subtitle="Ordered and part-received, not yet delivered"
          data={p.spendBySupplier}
          currency
        />
      ) : null}
    </DepartmentSection>
  );
}

function WirelessBlockView({ data, focused, canOpen }: BlockProps) {
  const w = data.wireless;
  const metrics: Metric[] = [
    {
      label: "Open submissions",
      value: w.openSubmissions,
      tone: warn(w.openSubmissions),
      href: "/wireless/submissions",
    },
    { label: "Draft layouts", value: w.draftLayouts, href: "/wireless/layouts" },
    { label: "Published", value: w.publishedLayouts, href: "/wireless/layouts" },
    {
      label: "Routers offline",
      value: w.routersOffline,
      tone: alarm(w.routersOffline),
    },
  ];

  return (
    <DepartmentSection {...sectionProps(data, "wireless", canOpen)} block={w} metrics={metrics}>
      <StackedBar
        title="Router status"
        subtitle="Devices across every published layout"
        segments={[
          { label: "Online", value: w.routersOnline, color: STATUS.good },
          { label: "Offline", value: w.routersOffline, color: STATUS.critical },
          { label: "Unknown", value: w.routersUnknown, color: "#cbd5e1" },
        ]}
      />
      {focused ? (
        <BarChart title="Layouts by status" subtitle="Every network layout" data={w.layoutStatus} />
      ) : null}
    </DepartmentSection>
  );
}

function FinancialBlockView({ data, focused, canOpen }: BlockProps) {
  const f = data.financial;
  const metrics: Metric[] = [
    { label: "Fuel this month", value: f.thisMonthSpend, currency: true, href: "/financial/fuel" },
    { label: "Total fuel spend", value: f.totalSpend, currency: true },
    { label: "Avg per litre", value: `R${f.avgPerLitre.toFixed(2)}` },
    { label: "Fill-ups", value: f.fillCount, href: "/financial/fuel" },
  ];

  return (
    <DepartmentSection {...sectionProps(data, "financial", canOpen)} block={f} metrics={metrics}>
      <LineChart
        title="Fuel spend"
        subtitle="Total per month, last 6 months"
        labels={f.spend.labels}
        series={[{ label: "Spend", points: f.spend.values }]}
        currency
        area
      />
      {focused ? (
        <ChartRow>
          <ColumnChart
            title="Litres purchased"
            subtitle="Volume per month"
            data={f.litres.labels.map((label, i) => ({ label, value: f.litres.values[i] }))}
          />
          <BarChart
            title="Spend by vehicle"
            subtitle="Total fuel cost per vehicle, all time"
            data={f.spendByVehicle}
            currency
          />
        </ChartRow>
      ) : null}
    </DepartmentSection>
  );
}

function ProjectsBlockView({ data, focused, canOpen }: BlockProps) {
  const p = data.projects;
  const metrics: Metric[] = [
    { label: "Live projects", value: p.active, href: "/projects" },
    { label: "Past target date", value: p.atRisk, tone: alarm(p.atRisk), href: "/projects?view=table" },
    { label: "Budget", value: p.budget, currency: true },
    {
      label: "Spent",
      value: p.actualCost,
      currency: true,
      tone: p.budget > 0 && p.actualCost > p.budget ? STATUS.critical : undefined,
    },
  ];

  return (
    <DepartmentSection {...sectionProps(data, "projects", canOpen)} block={p} metrics={metrics}>
      <StackedBar
        title="Projects by status"
        subtitle="Every project on the books"
        segments={viaMeta(p.byStatus, projectStatusMeta)}
      />
      {focused ? (
        <ChartRow>
          <DonutChart
            title="Live projects by priority"
            subtitle="Active and on-hold work"
            segments={viaMeta(p.byPriority, priorityMeta)}
            centerLabel="projects"
          />
          <StackedBar
            title="Budget against spend"
            subtitle="Open projects only"
            segments={[
              { label: "Spent", value: Math.round(p.actualCost), color: SERIES[1] },
              {
                label: "Remaining",
                value: Math.max(Math.round(p.budget - p.actualCost), 0),
                color: SERIES[2],
              },
            ]}
            currency
          />
        </ChartRow>
      ) : null}
    </DepartmentSection>
  );
}

const VIEWS: Record<OverviewSectionId, (props: BlockProps) => React.ReactElement | null> = {
  sales: SalesBlockView,
  support: SupportBlockView,
  coordination: CoordinationBlockView,
  stock: StockBlockView,
  procurement: ProcurementBlockView,
  wireless: WirelessBlockView,
  financial: FinancialBlockView,
  projects: ProjectsBlockView,
};

export function DepartmentBlock({ id, ...props }: BlockProps & { id: OverviewSectionId }) {
  const View = VIEWS[id];
  return <View {...props} />;
}
