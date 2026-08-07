import { SERIES, STATUS } from "@/components/charts/tokens";

/**
 * Shared project vocabulary.
 *
 * Status colour is by IDENTITY (which stage), not severity — a project being an
 * "idea" is not a warning. The two status-palette colours below are the exceptions
 * where the state genuinely means good/bad: completed and cancelled.
 */

export const PROJECT_STATUSES = [
  { value: "idea", label: "Idea", color: "#94a3b8", group: "funnel" },
  { value: "evaluating", label: "Evaluating", color: SERIES[3], group: "funnel" },
  { value: "approved", label: "Approved", color: SERIES[6], group: "funnel" },
  { value: "active", label: "Active", color: SERIES[0], group: "live" },
  { value: "on_hold", label: "On hold", color: SERIES[1], group: "live" },
  { value: "completed", label: "Completed", color: STATUS.good, group: "closed" },
  { value: "cancelled", label: "Cancelled", color: "#cbd5e1", group: "closed" },
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number]["value"];

/** Stages shown on the board, in workflow order. */
export const BOARD_STATUSES: ProjectStatus[] = [
  "idea",
  "evaluating",
  "approved",
  "active",
  "on_hold",
  "completed",
];

/** The lighter pipeline an idea moves through before it becomes real work. */
export const IDEA_STATUSES: ProjectStatus[] = ["idea", "evaluating", "approved"];

export const PROJECT_TYPES = [
  { value: "business_idea", label: "Business idea" },
  { value: "client_install", label: "Client install" },
  { value: "infrastructure", label: "Infrastructure" },
  { value: "maintenance", label: "Maintenance" },
  { value: "internal", label: "Internal" },
  { value: "rd", label: "R&D" },
] as const;

export const MEMBER_ROLES = [
  { value: "lead", label: "Lead", hint: "Can edit the project and manage members" },
  { value: "contributor", label: "Contributor", hint: "Works on tasks" },
  { value: "reviewer", label: "Reviewer", hint: "Reviews and comments" },
  { value: "viewer", label: "Viewer", hint: "Read-only" },
] as const;

export const TASK_STATUSES = [
  { value: "todo", label: "To do", color: "#94a3b8" },
  { value: "in_progress", label: "In progress", color: SERIES[0] },
  { value: "blocked", label: "Blocked", color: STATUS.critical },
  { value: "review", label: "In review", color: SERIES[3] },
  { value: "done", label: "Done", color: STATUS.good },
] as const;

export const PRIORITIES = [
  { value: "low", label: "Low", color: "#94a3b8" },
  { value: "medium", label: "Medium", color: SERIES[3] },
  { value: "high", label: "High", color: STATUS.critical },
] as const;

export const COST_CATEGORIES = [
  "labour",
  "stock",
  "fuel",
  "subcontract",
  "other",
] as const;

/**
 * Delivery vocabulary — the grid, the plant register and the delay log.
 *
 * Colour is by SEVERITY here, unlike PROJECT_STATUSES above, because these states
 * genuinely mean good/bad: a block sitting at "not started" three weeks after its
 * date is a problem, whereas a project sitting at "idea" is not.
 */
export const WORK_STATUSES = [
  { value: "not_started", label: "Not started", short: "—", color: "#cbd5e1" },
  { value: "in_progress", label: "In progress", short: "WIP", color: SERIES[3] },
  { value: "complete", label: "Complete", short: "✓", color: STATUS.good },
  // Excluded from progress denominators — see ratio() in progress.ts.
  { value: "na", label: "N/A", short: "n/a", color: "#eef0f3" },
] as const;

export type WorkStatus = (typeof WORK_STATUSES)[number]["value"];

/** Cycling a cell by clicking it, in the order a job actually moves. */
export const WORK_CYCLE: WorkStatus[] = ["not_started", "in_progress", "complete", "na"];

/**
 * What held the job up.
 *
 * These are the categories the sheet counted per project, and the counting is the
 * point — one cherry-picker row is an anecdote, fourteen of them across the year is
 * a purchasing decision. Free text is allowed but the presets are what roll up.
 */
export const ISSUE_TYPES = [
  "Cherry Picker",
  "Bakkie",
  "Trencher",
  "Chainsaw",
  "Act of God",
  "Staff",
  "Clients",
  "Stock",
  "Other",
] as const;

export function workMeta(value: string) {
  return WORK_STATUSES.find((w) => w.value === value) ?? WORK_STATUSES[0];
}

/**
 * Fold a free-text issue type onto a preset when it is one in all but spelling.
 *
 * The source spreadsheet holds "Act Of God" while the preset reads "Act of God", and
 * Excel's COUNTIF never noticed because it ignores case. A case-sensitive match here
 * would file two years of weather delays under "Other" and quietly break the one
 * report that justifies buying equipment. Returns null when nothing matches, which
 * the caller should treat as Other.
 */
export function canonicalIssueType(value: string): string | null {
  const want = value.trim().toLowerCase();
  return ISSUE_TYPES.find((t) => t.toLowerCase() === want) ?? null;
}

export function statusMeta(value: string) {
  return PROJECT_STATUSES.find((s) => s.value === value) ?? PROJECT_STATUSES[0];
}
export function typeLabel(value: string) {
  return PROJECT_TYPES.find((t) => t.value === value)?.label ?? value;
}
export function taskMeta(value: string) {
  return TASK_STATUSES.find((t) => t.value === value) ?? TASK_STATUSES[0];
}
export function priorityMeta(value: string) {
  return PRIORITIES.find((p) => p.value === value) ?? PRIORITIES[1];
}

/** Shapes returned by /api/projects. */
export interface Project {
  id: string;
  code: string;
  name: string;
  description: string;
  type: string;
  status: string;
  priority: string;
  owner_id: string | null;
  client_lead_id: string | null;
  start_date: string | null;
  target_date: string | null;
  completed_at: string | null;
  budget_amount: number | null;
  actual_cost: number;
  /** The client's quote this project is being delivered against. */
  quote_number: string | null;
  quote_amount: number | null;
  /** Which delivery template seeded the plan — see lib/projects/templates.ts. */
  delivery_template: string | null;
  is_private: boolean;
  created_at: string;
}

export interface ProjectMember {
  project_id: string;
  user_id: string;
  role: string;
}

export interface ProjectTask {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: string;
  assignee_id: string | null;
  module_key: string | null;
  due_date: string | null;
  order_index: number;
}

export interface ProjectLink {
  id: string;
  project_id: string;
  entity_type: string;
  entity_id: string;
  label: string;
}

export interface ProjectUpdate {
  id: string;
  project_id: string;
  author_id: string | null;
  body: string;
  kind: string;
  created_at: string;
}

export interface ProjectCost {
  id: string;
  project_id: string;
  description: string;
  amount: number;
  category: string;
  incurred_on: string;
}

export interface ProjectDepartment {
  project_id: string;
  module_key: string;
}

/** Shapes returned by /api/projects/delivery. */

export interface ProjectStage {
  id: string;
  project_id: string;
  name: string;
  order_index: number;
  counts_to_progress: boolean;
}

export interface ProjectBlock {
  id: string;
  project_id: string;
  name: string;
  units: number | null;
  start_date: string | null;
  end_date: string | null;
  actual_end_date: string | null;
  planner_id: string | null;
  notes: string;
  order_index: number;
}

export interface ProjectBlockStage {
  block_id: string;
  stage_id: string;
  project_id: string;
  status: WorkStatus;
  note: string;
  updated_at: string;
}

export interface ProjectResource {
  id: string;
  project_id: string;
  name: string;
  priority: number | null;
  start_date: string | null;
  end_date: string | null;
  acquired: WorkStatus;
  working_order: WorkStatus;
  vehicle_id: string | null;
  notes: string;
  order_index: number;
}

export interface ProjectIssue {
  id: string;
  project_id: string;
  block_id: string | null;
  issue_type: string;
  description: string;
  logged_at: string;
  resolved_at: string | null;
  logged_by: string | null;
  resolved_by: string | null;
}

/**
 * What a filed document is.
 *
 * Quotes sit in this list rather than in a table of their own: a quote IS a document
 * — a number, a value and a PDF — and splitting it out would mean two panels and two
 * places to look for the same piece of paper. `reference` and `amount` below are
 * filled for quotes and invoices, null for everything else.
 */
export const DOCUMENT_KINDS = [
  { value: "quote", label: "Quote", money: true },
  { value: "invoice", label: "Invoice", money: true },
  { value: "boq", label: "BOQ", money: false },
  { value: "kmz", label: "KMZ / Google Earth", money: false },
  { value: "plan", label: "Plan / layout", money: false },
  { value: "proposal", label: "Proposal", money: false },
  { value: "photo", label: "Photos", money: false },
  { value: "report", label: "Report", money: false },
  { value: "other", label: "Other", money: false },
] as const;

export type DocumentKind = (typeof DOCUMENT_KINDS)[number]["value"];

export function documentKindMeta(value: string) {
  return DOCUMENT_KINDS.find((k) => k.value === value) ?? DOCUMENT_KINDS[DOCUMENT_KINDS.length - 1];
}

export interface ProjectDocument {
  id: string;
  project_id: string;
  label: string;
  kind: string;
  /** A pointer to a file elsewhere. Null when the file itself was uploaded. */
  url: string | null;
  /** Set when the file lives in our own private bucket. */
  storage_path: string | null;
  file_name: string;
  file_size: number | null;
  content_type: string | null;
  /** Quote or invoice number. */
  reference: string;
  amount: number | null;
  order_index: number;
  /** Short-lived signed URL, minted per request for uploads. Never persisted. */
  fileUrl?: string | null;
}

export interface ProjectMilestone {
  id: string;
  project_id: string;
  title: string;
  status: WorkStatus;
  note: string;
  due_date: string | null;
  completed_at: string | null;
  order_index: number;
}

/**
 * Everything the project page needs below the header.
 *
 * Documents are not part of this: since 060 they can be uploaded files, which means
 * per-request signed URLs that must not be cached alongside the grid. They load from
 * /api/projects/documents instead.
 */
export interface ProjectDelivery {
  stages: ProjectStage[];
  blocks: ProjectBlock[];
  cells: ProjectBlockStage[];
  milestones: ProjectMilestone[];
  resources: ProjectResource[];
  issues: ProjectIssue[];
}

/** The per-project roll-up the portfolio table is built from. */
export interface ProjectDeliverySummary {
  project_id: string;
  /** 0–1. Null when the project has no delivery plan yet. */
  percent_complete: number | null;
  delay_days: number;
  open_issues: number;
  total_issues: number;
  /** target_date pushed out by delay_days, as YYYY-MM-DD. */
  revised_target_date: string | null;
  blocks_total: number;
  blocks_done: number;
  units_total: number;
  /** Issue count by type, for the "major issues was" columns. */
  issue_counts: Record<string, number>;
}
