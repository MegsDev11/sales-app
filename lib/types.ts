export type Department =
  | "sales"
  | "stock"
  | "coordination"
  | "support"
  | "wireless"
  | "fiber"
  | "financial"
  | "general"
  | "accounts"
  | "reception";

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
  /** Soft-active; inactive techs stay for booking history but leave pickers */
  active?: boolean;
  /** Whether a QR portal access code is configured (hash never exposed) */
  hasAccessCode?: boolean;
  accessCodeUpdatedAt?: string | null;
  /** Decrypted only by authorized coordination APIs. */
  accessCode?: string;
  /** Field technician profile details. */
  technicianLevel?: "junior" | "senior";
  phone?: string;
  idNumber?: string;
  /** Decrypted only for owner via /api/users credentials. */
  loginPassword?: string;
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

export type StockItemStatus = "available" | "booked_out" | "retired";
export type StockRequestStatus = "open" | "partial" | "fulfilled" | "cancelled";

export interface StockProduct {
  id: string;
  name: string;
  sku: string;
  brandDefault: string;
  notes: string;
  createdAt: string;
}

export interface StockItem {
  id: string;
  productId: string;
  qrToken: string;
  brand: string;
  deviceName: string;
  serialNumber: string;
  clientName: string;
  clientAddress: string;
  clientPppoe: string;
  wifiName: string;
  wifiPassword: string;
  status: StockItemStatus;
  createdAt: string;
  updatedAt: string;
  /** Whether a client portal PIN is configured (hash never exposed) */
  hasClientPin?: boolean;
  clientPinUpdatedAt?: string | null;
  /** Decrypted only for authenticated stock users. */
  clientPin?: string;
}

export interface StockSundry {
  id: string;
  name: string;
  unitLabel: string;
  quantity: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type QrPortalRole = "client" | "technician";

export type ClientSupportRequestStatus =
  | "new"
  | "checked"
  | "site_survey_needed"
  | "resolved";

export type ClientSupportRequestCategory =
  | "slow_internet"
  | "no_internet"
  | "quote"
  | "other";

export interface StockItemVisit {
  id: string;
  itemId: string;
  technicianId: string;
  technicianName?: string;
  workNotes: string;
  submittedAt: string;
}

export interface ClientSupportRequest {
  id: string;
  itemId: string;
  category: ClientSupportRequestCategory;
  description: string;
  status: ClientSupportRequestStatus;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
  updatedById?: string | null;
  /** Populated on support inbox list */
  clientName?: string;
  clientAddress?: string;
  productName?: string;
  deviceLabel?: string;
  qrToken?: string;
}

/** Preprinted QR sticker that has not yet been claimed into inventory. */
export interface StockQrLabel {
  id: string;
  batchId: string;
  productId: string;
  qrToken: string;
  brand: string;
  deviceName: string;
  createdAt: string;
  claimedAt?: string | null;
  claimedItemId?: string | null;
}

export interface StockBooking {
  id: string;
  itemId: string;
  technicianId: string;
  leadId?: string | null;
  requestId?: string | null;
  bookedOutAt: string;
  bookedOutBy?: string | null;
  returnedAt?: string | null;
  notes: string;
}

export interface StockRequestLine {
  id: string;
  requestId: string;
  /** Empty string when the line targets a sundry instead of a serialized product. */
  productId: string;
  /** Set when the line targets a quantity-based sundry. */
  sundryId?: string | null;
  qtyNeeded: number;
  qtyFulfilled: number;
}

export interface StockRequest {
  id: string;
  title: string;
  technicianId: string;
  leadId?: string | null;
  status: StockRequestStatus;
  createdBy?: string | null;
  createdAt: string;
  notes: string;
  lines: StockRequestLine[];
}

export type AppNotificationType =
  | "stock_request_sent"
  | "stock_shortfall"
  | "client_support_request";

export interface AppNotification {
  id: string;
  userId?: string | null;
  department?: Department | null;
  type: AppNotificationType | string;
  title: string;
  body: string;
  link: string;
  requestId?: string | null;
  readAt?: string | null;
  createdAt: string;
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
