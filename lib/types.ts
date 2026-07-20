export type Department = "sales" | "stock" | "coordination" | "support";

export type TowerStatus = "online" | "offline" | "maintenance";

export type UserRole = "owner" | "manager" | "staff";

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
  email: string;
  role: UserRole;
  department: Department | null;
  color: string;
  avatarInitials: string;
  title: string;
  monthlyRevenueTarget: number;
  monthlyDealsTarget: number;
  authUserId?: string;
}

export type UserFormData = Omit<User, "id" | "authUserId">;

export interface CreateUserPayload extends UserFormData {
  password: string;
}

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
  /** Set when removed from Lead Inbox only — lead remains elsewhere in the CRM */
  inboxDismissedAt?: string | null;
  towerId?: string | null;
}

export interface Tower {
  id: string;
  name: string;
  serviceAreas: string[];
  status: TowerStatus;
  updatedAt: string;
  updatedById?: string | null;
}

export interface TowerOutage {
  id: string;
  towerId: string;
  title: string;
  message: string;
  affectedAreas: string[];
  startedAt: string;
  resolvedAt?: string | null;
  createdById?: string | null;
  isPublic: boolean;
}

export interface PublicNetworkOutage {
  id: string;
  towerId: string;
  towerName: string;
  title: string;
  message: string;
  affectedAreas: string[];
  startedAt: string;
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
  towers: Tower[];
  towerOutages: TowerOutage[];
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
