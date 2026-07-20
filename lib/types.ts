export type UserRole = "admin" | "sales";

export type ServiceType = "fiber" | "wireless" | "both";

export type LeadSource = "website" | "referral" | "walk-in" | "cold-call";

export type LeadStage =
  | "new_lead"
  | "contacted"
  | "site_survey"
  | "proposal"
  | "negotiation"
  | "closed_won"
  | "closed_lost";

export type ActivityType = "call" | "email" | "task" | "site_visit";

export type Priority = "low" | "medium" | "high";

export type CoverageStatus = "confirmed" | "pending_survey" | "not_available";

export type LostReason =
  | "price"
  | "competitor"
  | "no_coverage"
  | "no_response"
  | "timing"
  | "other";

export type InstallationStatus = "scheduled" | "in_progress" | "completed";

export type Temperature = "hot" | "warm" | "cold";

export type SortField =
  | "priority"
  | "daysInStage"
  | "dealValue"
  | "followUp"
  | "clientName";

export interface StageHistoryEntry {
  stage: LeadStage;
  enteredAt: string;
}

export interface User {
  id: string;
  name: string;
  role: UserRole;
  color: string;
  avatarInitials: string;
  title: string;
  monthlyRevenueTarget: number;
  monthlyDealsTarget: number;
}

export type UserFormData = Omit<User, "id">;

export interface Lead {
  id: string;
  clientName: string;
  company?: string;
  phone: string;
  email: string;
  serviceType: ServiceType;
  packageTier: string;
  assignedToId: string | null;
  stage: LeadStage;
  currentActivity: ActivityType;
  priority: Priority;
  createdAt: string;
  stageEnteredAt: string;
  closedAt?: string;
  dealValue?: number;
  discount?: number;
  leadSource: LeadSource;
  address?: string;
  notes?: string;
  deleted?: boolean;
  nextFollowUpAt?: string;
  nextAction?: string;
  coverageStatus: CoverageStatus;
  serviceZone: string;
  siteSurveyDate?: string;
  siteSurveyNotes?: string;
  lostReason?: LostReason;
  installationStatus?: InstallationStatus;
  installationDate?: string;
  temperature: Temperature;
  stageHistory: StageHistoryEntry[];
}

export interface Activity {
  id: string;
  leadId: string;
  type: ActivityType;
  title: string;
  createdAt: string;
}

export interface CrmData {
  users: User[];
  leads: Lead[];
  activities: Activity[];
}

export interface StageConfig {
  id: LeadStage;
  label: string;
  headerColor: string;
  overdueDays: number;
}

export interface PackageOption {
  id: string;
  name: string;
  serviceType: ServiceType;
  price: number;
  speed: string;
}

export type LeadFormData = Omit<
  Lead,
  "id" | "createdAt" | "stageEnteredAt" | "stageHistory" | "deleted"
>;
