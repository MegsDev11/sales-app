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
