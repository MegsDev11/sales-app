/** Extract a stock QR token from a pasted URL or raw token string. */
export function extractStockQrToken(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    const i = parts.indexOf("i");
    if (i >= 0 && parts[i + 1]) return parts[i + 1];
  } catch {
    /* not a URL */
  }
  const match = value.match(/\/i\/([A-Za-z0-9_-]+)/);
  if (match) return match[1];
  return value;
}

/** Extract a vehicle QR token from a pasted URL or raw token string (`/v/{token}`). */
export function extractVehicleQrToken(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    const i = parts.indexOf("v");
    if (i >= 0 && parts[i + 1]) return parts[i + 1];
  } catch {
    /* not a URL */
  }
  const match = value.match(/\/v\/([A-Za-z0-9_-]+)/);
  if (match) return match[1];
  return value;
}

/** Prefer vehicle token if path has /v/, else stock /i/, else raw. */
export function extractAnyQrToken(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (/\/v\//i.test(value) || value.startsWith("v_")) {
    return extractVehicleQrToken(value);
  }
  if (/\/i\//i.test(value)) {
    return extractStockQrToken(value);
  }
  return extractVehicleQrToken(value) || extractStockQrToken(value);
}

export const API_PATHS = {
  mobileMe: "/api/mobile/me",
  mobileTechJobs: "/api/mobile/tech/jobs",
  mobileTechJobCard: "/api/mobile/tech/job-card",
  mobileTechTime: "/api/mobile/tech/time",
  mobileTechTimeOff: "/api/mobile/tech/time-off",
  mobileTechLocation: "/api/mobile/tech/location",
  mobileTechVehicles: "/api/mobile/tech/vehicles",
  mobileTechFuel: "/api/mobile/tech/fuel",
  mobileStockSummary: "/api/mobile/stock/summary",
  mobileClientMe: "/api/mobile/client/me",
  mobileClientLayout: "/api/mobile/client/layout",
  mobileClientMessages: "/api/mobile/client/messages",
  stock: "/api/stock",
  stockVehicles: "/api/stock/vehicles",
  coordinationJobs: "/api/coordination/jobs",
  coordinationJobCards: "/api/coordination/job-cards",
  coordinationTimesheets: "/api/coordination/timesheets",
  coordinationTimeOff: "/api/coordination/time-off",
  financialFuel: "/api/financial/fuel",
  supportMessages: "/api/support/messages",
} as const;

export type MobileRole = "tech" | "stock" | "client" | "unsupported";

export type OtMode = "daily" | "weekly" | "both";

export interface OtSettings {
  id: string;
  mode: OtMode;
  dailyThresholdMinutes: number;
  weeklyThresholdMinutes: number;
  weekendAsOt: boolean;
  updatedAt: string;
  updatedBy: string | null;
}

export const DEFAULT_OT_SETTINGS: OtSettings = {
  id: "default",
  mode: "daily",
  dailyThresholdMinutes: 480,
  weeklyThresholdMinutes: 2400,
  weekendAsOt: false,
  updatedAt: new Date(0).toISOString(),
  updatedBy: null,
};
export type LeaveType = "family" | "time_off" | "sick" | "unpaid";
export type TimeOffStatus = "pending" | "approved" | "declined";

export interface TimeOffRequest {
  id: string;
  technicianId: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: TimeOffStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string;
  createdAt: string;
  updatedAt: string;
  technicianName?: string;
}

export type JobStatus =
  | "scheduled"
  | "en_route"
  | "on_site"
  | "completed"
  | "cancelled";

export type JobSource = "coordination" | "owner" | "support";

export interface FieldJob {
  id: string;
  leadId: string | null;
  title: string;
  address: string;
  /** Client site GPS (set by Coordination for nav). */
  locationLat: number | null;
  locationLng: number | null;
  clientName: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  status: JobStatus;
  notes: string;
  stockRequestId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  technicianIds?: string[];
  /** Who originated the job card (owner requests are tagged for coordination). */
  source?: JobSource;
  towerId?: string | null;
  towerSiteId?: string | null;
  jobType?: string;
  /** Client PPPoE username for the site. */
  clientPppoe?: string;
}

export type JobKind =
  | "service_call"
  | "custom_install"
  | "install"
  | "site_maintenance"
  | "project"
  | "tower_work"
  | "general";

export const JOB_KIND_OPTIONS: { value: JobKind; label: string }[] = [
  { value: "service_call", label: "Service call" },
  { value: "custom_install", label: "Custom install" },
  { value: "install", label: "Install" },
  { value: "site_maintenance", label: "Site maintenance" },
  { value: "project", label: "Project" },
];

export function jobKindLabel(jobType?: string | null): string {
  const found = JOB_KIND_OPTIONS.find((o) => o.value === jobType);
  if (found) return found.label;
  if (jobType === "tower_work") return "Tower work";
  if (jobType === "general" || !jobType) return "General";
  return jobType;
}

export type YesNo = "yes" | "no" | null;

export interface JobCardSignature {
  name: string;
  signedAt: string;
}

export interface JobCardMediaItem {
  id: string;
  kind: "image" | "video";
  mimeType: string;
  /** data URL for images; empty for video metadata-only */
  dataUrl: string;
  fileName?: string;
}

export interface JobCardPayload {
  workingOnHeights: YesNo;
  weatherDanger: YesNo;
  highVoltageNearby: YesNo;
  hasPpe: YesNo;
  needsMgmtApproval: YesNo;
  seniorTechSignature: JobCardSignature | null;
  clientNameSurname: string;
  requiresCableWork: YesNo;
  riskAssessmentApproved: YesNo;
  jobDate: string;
  jobTime: string;
  hoursOnSite: string;
  travelOneWay: string;
  workDone: string;
  stockUsed: string;
  beforePhotos: JobCardMediaItem[];
  afterPhotos: JobCardMediaItem[];
  serialPhotos: JobCardMediaItem[];
  locationLat: number | null;
  locationLng: number | null;
  locationLabel: string;
  technicians: string;
  clientSignature: JobCardSignature | null;
  notes: string;
  video: JobCardMediaItem | null;
}

export type JobCardStatus = "draft" | "submitted";

export interface JobCardSubmission {
  id: string;
  jobId: string;
  technicianId: string;
  status: JobCardStatus;
  payload: JobCardPayload;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Coordination list row for submitted technician job cards. */
export interface CoordinationJobCardRow extends JobCardSubmission {
  jobTitle: string;
  jobClientName: string | null;
  jobAddress: string;
  jobType: string | null;
  technicianName: string;
}

export function emptyJobCardPayload(
  defaults?: Partial<Pick<JobCardPayload, "clientNameSurname" | "technicians">>
): JobCardPayload {
  return {
    workingOnHeights: null,
    weatherDanger: null,
    highVoltageNearby: null,
    hasPpe: null,
    needsMgmtApproval: null,
    seniorTechSignature: null,
    clientNameSurname: defaults?.clientNameSurname ?? "",
    requiresCableWork: null,
    riskAssessmentApproved: null,
    jobDate: "",
    jobTime: "",
    hoursOnSite: "",
    travelOneWay: "",
    workDone: "",
    stockUsed: "",
    beforePhotos: [],
    afterPhotos: [],
    serialPhotos: [],
    locationLat: null,
    locationLng: null,
    locationLabel: "",
    technicians: defaults?.technicians ?? "",
    clientSignature: null,
    notes: "",
    video: null,
  };
}

export interface TimeEntry {
  id: string;
  technicianId: string;
  jobId: string | null;
  clockInAt: string;
  clockOutAt: string | null;
  clockInLat: number | null;
  clockInLng: number | null;
  clockOutLat: number | null;
  clockOutLng: number | null;
  source: "mobile" | "manual";
  editedBy: string | null;
  createdAt: string;
}

export interface SupportThread {
  id: string;
  leadId: string;
  clientAccountId: string;
  status: "open" | "closed";
  lastMessageAt: string | null;
  createdAt: string;
  clientName?: string;
  clientAddress?: string;
  unreadCount?: number;
}

export interface SupportMessage {
  id: string;
  threadId: string;
  senderType: "client" | "staff";
  senderId: string | null;
  body: string;
  createdAt: string;
}

export interface ClientInstallationDto {
  itemId: string;
  productName: string;
  serialNumber: string;
  wifiName: string | null;
  wifiPassword: string | null;
  clientPppoe: string | null;
  clientAddress: string | null;
}

export interface Vehicle {
  id: string;
  brand: string;
  numberPlate: string;
  technicianId: string;
  qrToken: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  technicianName?: string;
}

export interface FuelEntry {
  id: string;
  vehicleId: string;
  technicianId: string;
  litres: number;
  location: string;
  price: number;
  recordedAt: string;
  createdAt: string;
  vehicleBrand?: string;
  vehicleNumberPlate?: string;
  technicianName?: string;
}

export interface MobileMeResponse {
  mobileRole: MobileRole;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    department: string | null;
    technicianLevel?: string | null;
    phone?: string | null;
  } | null;
  client: {
    id: string;
    leadId: string;
    email: string | null;
    phone: string | null;
    clientName: string;
  } | null;
  message?: string;
}

export {
  buildPeriodHours,
  entryDurationMinutes,
  formatDurationLabel,
  formatMonthRangePill,
  monthRangeLocal,
  splitMinutesForSettings,
  startOfWeekMonday,
  type DayHoursSplit,
  type PeriodHoursSummary,
  type WeekHoursGroup,
} from "./timesheet-ot";
