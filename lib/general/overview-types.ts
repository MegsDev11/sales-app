import type { ModuleKey } from "@/lib/types";

/**
 * Shape of /api/general/overview.
 *
 * The General Manager's dashboard needs one number out of every department, not
 * every row from every department. Sending the raw tables would mean shipping the
 * whole lead list, every stock item and every job to the browser purely to count
 * them — and would force the GM to hold a grant on all eight modules just to avoid
 * a wall of 403s. So the aggregation happens on the server and this is what comes
 * back: pre-bucketed series and scalar counts, nothing row-level.
 *
 * Every block carries its own `state`. A department whose migration has not been
 * applied yet reports `unavailable` with a note instead of failing the request —
 * one missing table must not blank the whole dashboard.
 */

/**
 * "restricted" is not "unavailable": the data is there and healthy, the
 * viewer simply is not entitled to it (migration 070's finance carve-out).
 * Saying so beats rendering zeros, which would read as a company that took
 * no money this month.
 */
export type SectionState = "ok" | "unavailable" | "restricted";

export interface Section {
  state: SectionState;
  /** Why the block is empty — surfaced verbatim in the section's placeholder. */
  note?: string;
}

/** A time series ready to hand straight to LineChart / ColumnChart. */
export interface Series {
  labels: string[];
  values: number[];
}

/**
 * A named magnitude, ready for BarChart / DonutChart / StackedBar.
 *
 * Most slices arrive display-ready. The three status breakdowns that the app
 * already has a vocabulary for — job, purchase-order and project status — instead
 * carry the RAW enum value, and the blocks run them through `statusMeta` /
 * `poStatusMeta` / the job label map. That keeps one definition of what
 * "partially_received" is called and what colour it is, rather than a second one
 * here that drifts.
 */
export interface Slice {
  label: string;
  value: number;
}

export interface SalesBlock extends Section {
  revenue: Series;
  newLeads: Series;
  thisMonthRevenue: number;
  revenueChange?: number;
  /** Sum of every active staff member's monthly revenue target. */
  revenueTarget: number;
  openPipeline: number;
  activeLeads: number;
  winRate: number;
  avgDaysToClose: number;
  unassigned: number;
  overdueFollowUps: number;
  serviceMix: Slice[];
  stageMix: Slice[];
}

export interface SupportBlock extends Section {
  towers: number;
  offlineTowers: number;
  activeOutages: number;
  linkedClients: number;
  towerStatus: Slice[];
  outagesByMonth: Series;
}

export interface CoordinationBlock extends Section {
  activeJobs: number;
  scheduledToday: number;
  overdue: number;
  unassigned: number;
  technicians: number;
  completedJobs: number;
  /** Raw job_status values. */
  byStatus: Slice[];
  byType: Slice[];
  completedByWeek: Series;
}

export interface StockBlock extends Section {
  available: number;
  bookedOut: number;
  retired: number;
  productsTracked: number;
  outOfStock: number;
  openPickLists: number;
  returnsOverdue: number;
  unitsByProduct: Slice[];
  bookOutsByWeek: Series;
}

export interface ProcurementBlock extends Section {
  activeSuppliers: number;
  openOrders: number;
  awaitingDelivery: number;
  committedSpend: number;
  /** Raw purchase_order status values. */
  byStatus: Slice[];
  spendBySupplier: Slice[];
}

export interface WirelessBlock extends Section {
  openSubmissions: number;
  draftLayouts: number;
  publishedLayouts: number;
  routersOnline: number;
  routersOffline: number;
  routersUnknown: number;
  layoutStatus: Slice[];
}

export interface FinancialBlock extends Section {
  spend: Series;
  litres: Series;
  thisMonthSpend: number;
  spendChange?: number;
  totalSpend: number;
  totalLitres: number;
  avgPerLitre: number;
  fillCount: number;
  spendByVehicle: Slice[];
}

export interface ProjectsBlock extends Section {
  /** Projects in the `live` status group — active or on hold, not the idea funnel. */
  active: number;
  atRisk: number;
  completed: number;
  budget: number;
  actualCost: number;
  /** Raw project_status values. */
  byStatus: Slice[];
  /** Raw priority values, live projects only. */
  byPriority: Slice[];
}

export interface PeopleBlock extends Section {
  activeStaff: number;
  headcountByDepartment: Slice[];
  /** Manager name and headcount per module, for the department directory. */
  departments: {
    key: ModuleKey;
    manager: string | null;
    staff: number;
  }[];
}

export interface CompanyOverview {
  /** When the server built this snapshot, ISO. */
  generatedAt: string;
  sales: SalesBlock;
  support: SupportBlock;
  coordination: CoordinationBlock;
  stock: StockBlock;
  procurement: ProcurementBlock;
  wireless: WirelessBlock;
  financial: FinancialBlock;
  projects: ProjectsBlock;
  people: PeopleBlock;
}

/**
 * Which blocks the dashboard renders, in the order they appear.
 *
 * Keyed by module so the section header can borrow the module's icon, label and
 * root route rather than restating them.
 */
export const OVERVIEW_SECTIONS = [
  { id: "sales", module: "crm" },
  { id: "support", module: "support" },
  { id: "coordination", module: "coordination" },
  { id: "stock", module: "stock" },
  { id: "procurement", module: "procurement" },
  { id: "wireless", module: "wireless" },
  { id: "financial", module: "financial" },
  { id: "projects", module: "projects" },
] as const satisfies readonly { id: keyof CompanyOverview; module: ModuleKey }[];

export type OverviewSectionId = (typeof OVERVIEW_SECTIONS)[number]["id"];
