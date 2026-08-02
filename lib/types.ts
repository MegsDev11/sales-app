/**
 * Org structure — where a person sits in the company. Since migration 040 this is a
 * foreign key to the `departments` table, so new departments are rows, not a schema
 * change. It no longer decides what the software shows you; module grants do.
 */
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

/**
 * A feature area of the software. Granted per user, independently of department —
 * this is what the super admin ticks on/off in /admin.
 *
 * Note `crm` is the module behind the `sales` department (the only rename); every
 * other module key matches its department key.
 */
export type ModuleKey =
  | "crm"
  | "reception"
  | "accounts"
  | "support"
  | "coordination"
  | "scheduler"
  | "stock"
  | "procurement"
  | "wireless"
  | "fiber"
  | "projects"
  | "financial"
  | "general"
  | "staff"
  | "admin"
  | "ai";

/** Ordered. Each level includes everything below it. */
export type AccessLevel = "none" | "view" | "edit" | "manage";

/** Resolved grants for a user: module -> level. Absent key means "none". */
export type AccessMap = Partial<Record<ModuleKey, AccessLevel>>;

export interface ModuleGrant {
  moduleKey: ModuleKey;
  level: AccessLevel;
  expiresAt?: string | null;
}

export interface AccessTemplate {
  id: string;
  name: string;
  description: string;
  modules: ModuleGrant[];
}

export interface DepartmentRecord {
  key: string;
  label: string;
  managerId?: string | null;
  parentKey?: string | null;
  sortOrder: number;
  active: boolean;
}

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
  /**
   * A freshly generated password, returned ONCE at creation or reset time so the
   * owner can hand it over. Never persisted in plaintext or recoverable later —
   * see migration 044 and app/api/users/route.ts.
   */
  loginPassword?: string;
  /**
   * Resolved module grants (direct grants merged over the template).
   * Populated by userFromRow when grant rows are supplied; owners resolve to
   * "manage" everywhere via the access helpers regardless of what is stored here.
   */
  access?: AccessMap;
  /** Access template applied to this user, if any. */
  templateId?: string | null;
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
  clientPppoe?: string;
  wifiName?: string;
  wifiPassword?: string;
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
  /** Coverage area (public towers / towns). */
  towerId?: string | null;
  /** Physical tower site under the coverage area. */
  towerSiteId?: string | null;
}

export interface TowerEquipmentItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  notes: string;
}

/** Public coverage area (town) — shown on landing page status only. */
export interface Tower {
  id: string;
  name: string;
  serviceAreas: string[];
  status: TowerStatus;
  updatedAt: string;
  updatedById?: string | null;
}

/** Private physical tower site nested under a coverage area — dashboard only. */
export interface TowerSite {
  id: string;
  areaId: string;
  name: string;
  voltage: string;
  throughputMbps: number | null;
  equipment: TowerEquipmentItem[];
  maintenanceNotes: string;
  upgradePlan: string;
  status: TowerStatus;
  updatedAt: string;
  updatedById?: string | null;
  createdAt: string;
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
  returnNeededAt?: string | null;
  returnNeededJobId?: string | null;
  returnNeededNote?: string;
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
  /** Accounts client book reference — the list every department now picks from. */
  accountsClientId?: string | null;
  /** Denormalised so a request still names its client without a second lookup. */
  clientName?: string | null;
  status: StockRequestStatus;
  createdBy?: string | null;
  createdAt: string;
  notes: string;
  lines: StockRequestLine[];
}

export type AppNotificationType =
  | "stock_request_sent"
  | "stock_shortfall"
  | "stock_return_needed"
  | "client_support_request"
  | "tower_work_request"
  | "service_call_request"
  | "job_card_submitted";

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
  towerSites: TowerSite[];
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
