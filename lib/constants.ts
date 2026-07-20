import type { LeadStage, StageConfig } from "./types";

export const AUTH_STORAGE_KEY = "megs-crm-user";

export const STAGES: StageConfig[] = [
  { id: "new_lead", label: "New Lead", headerColor: "#1e3a5f", overdueDays: 2 },
  { id: "contacted", label: "Contacted", headerColor: "#2563eb", overdueDays: 3 },
  { id: "site_survey", label: "Site Survey", headerColor: "#3b82f6", overdueDays: 5 },
  { id: "proposal", label: "Proposal", headerColor: "#60a5fa", overdueDays: 4 },
  { id: "negotiation", label: "Negotiation", headerColor: "#93c5fd", overdueDays: 7 },
  { id: "closed_won", label: "Closed Won", headerColor: "#16a34a", overdueDays: 999 },
  { id: "closed_lost", label: "Closed Lost", headerColor: "#6b7280", overdueDays: 999 },
];

export const ACTIVE_STAGES: LeadStage[] = [
  "new_lead",
  "contacted",
  "site_survey",
  "proposal",
  "negotiation",
];

export const STAGE_LABELS: Record<LeadStage, string> = Object.fromEntries(
  STAGES.map((s) => [s.id, s.label])
) as Record<LeadStage, string>;

export const ACTIVITY_LABELS = {
  call: "Call",
  email: "Email",
  task: "Task",
  site_visit: "Site Visit",
} as const;

export const SERVICE_LABELS = {
  fiber: "Fiber",
  wireless: "Wireless",
  both: "Fiber + Wireless",
} as const;

export const LEAD_SOURCE_LABELS = {
  website: "Website",
  referral: "Referral",
  "walk-in": "Walk-in",
  "cold-call": "Cold Call",
} as const;

export const COVERAGE_LABELS = {
  confirmed: "Confirmed",
  pending_survey: "Survey Needed",
  not_available: "No Coverage",
} as const;

export const LOST_REASON_LABELS = {
  price: "Price",
  competitor: "Competitor",
  no_coverage: "No Coverage",
  no_response: "No Response",
  timing: "Bad Timing",
  other: "Other",
} as const;

export const INSTALLATION_LABELS = {
  scheduled: "Scheduled",
  in_progress: "In Progress",
  completed: "Completed",
} as const;

export const TEMPERATURE_LABELS = {
  hot: "Hot",
  warm: "Warm",
  cold: "Cold",
} as const;

export const SORT_LABELS = {
  priority: "Priority",
  daysInStage: "Days in Stage",
  dealValue: "Deal Value",
  followUp: "Follow-up Date",
  clientName: "Client Name",
} as const;
