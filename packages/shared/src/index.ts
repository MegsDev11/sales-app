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
  mobileTechLayout: "/api/mobile/tech/layout",
  mobileTechTime: "/api/mobile/tech/time",
  mobileTechTimeOff: "/api/mobile/tech/time-off",
  mobileTechLocation: "/api/mobile/tech/location",
  mobileTechVehicles: "/api/mobile/tech/vehicles",
  mobileTechFuel: "/api/mobile/tech/fuel",
  mobileStockSummary: "/api/mobile/stock/summary",
  mobileStockRequests: "/api/mobile/stock/requests",
  mobileClientMe: "/api/mobile/client/me",
  mobileClientLayout: "/api/mobile/client/layout",
  mobileClientMessages: "/api/mobile/client/messages",
  mobileClientSupportRequests: "/api/mobile/client/support-requests",
  mobileClientSpeedTest: "/api/mobile/client/speed-test",
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
  /** Project this job belongs to (migration 067), and optionally the block/phase. */
  projectId?: string | null;
  projectBlockId?: string | null;
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

export interface JobCardStockLine {
  bookingId: string;
  itemId: string;
  productName: string;
  serialNumber: string;
  /** null = not answered yet */
  used: boolean | null;
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
  /** ISO timestamp when tech tapped Arrived — used to compute hours on Finished. */
  siteStartedAt: string;
  travelOneWay: string;
  workDone: string;
  stockUsed: string;
  stockChecklist: JobCardStockLine[];
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
  /** Human-searchable id e.g. JC-01001 (set on submit). */
  cardNumber: string | null;
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
    siteStartedAt: "",
    travelOneWay: "",
    workDone: "",
    stockUsed: "",
    stockChecklist: [],
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

/** Build stockUsed summary from checklist ticks (Used / Not used). */
export function summarizeStockChecklist(lines: JobCardStockLine[]): string {
  if (!lines.length) return "";
  const used = lines.filter((l) => l.used === true);
  const unused = lines.filter((l) => l.used === false);
  const parts: string[] = [];
  if (used.length) {
    parts.push(
      `Used: ${used
        .map((l) => [l.productName, l.serialNumber].filter(Boolean).join(" "))
        .join(", ")}`
    );
  }
  if (unused.length) {
    parts.push(
      `Not used (return): ${unused
        .map((l) => [l.productName, l.serialNumber].filter(Boolean).join(" "))
        .join(", ")}`
    );
  }
  return parts.join(" · ") || "None";
}

/** Missing * required fields for job card submit (same labels as the form). */
export function listMissingJobCardFields(payload: JobCardPayload): string[] {
  const missing: string[] = [];
  const needYesNo = (v: YesNo, label: string) => {
    if (v !== "yes" && v !== "no") missing.push(label);
  };

  needYesNo(
    payload.workingOnHeights,
    "Does this Job include working on heights?"
  );
  needYesNo(
    payload.weatherDanger,
    "Will the current weather conditions influence or endanger any person?"
  );
  needYesNo(
    payload.highVoltageNearby,
    "Is there any high voltage power line within 30m of workspace?"
  );
  needYesNo(
    payload.hasPpe,
    "Do you have the necessary Personal Protective Equipment to complete the current assignment?"
  );
  needYesNo(
    payload.needsMgmtApproval,
    "Is there any risks that need to be run by management for approval?"
  );
  if (!payload.seniorTechSignature?.name?.trim()) {
    missing.push("Signature of Senior Technician on site");
  }
  if (!payload.clientNameSurname.trim()) missing.push("Client Name and Surname");
  needYesNo(payload.requiresCableWork, "Does this Job require cable work");
  needYesNo(payload.riskAssessmentApproved, "Risk Assessment Done and Approved");
  if (!payload.jobDate.trim()) missing.push("Date of Job");
  if (!payload.jobTime.trim()) missing.push("Time of Job");
  if (!payload.hoursOnSite.trim()) missing.push("Time Spend on Site (Hours)");
  if (!payload.travelOneWay.trim()) missing.push("Travel (One Way)");
  if (!payload.workDone.trim()) missing.push("Work Done");

  const checklist = Array.isArray(payload.stockChecklist) ? payload.stockChecklist : [];
  if (checklist.length > 0) {
    if (!checklist.every((l) => l.used === true || l.used === false)) {
      missing.push("Stock used (mark Used or Not used)");
    }
  } else if (!payload.stockUsed.trim()) {
    missing.push("Stock used");
  }

  if (!payload.afterPhotos.length) missing.push("After Photos");
  if (!payload.serialPhotos.length) {
    missing.push("Serial Numbers of Stock");
  }
  if (payload.locationLat == null || payload.locationLng == null) {
    missing.push("Location");
  }
  if (!payload.technicians.trim()) missing.push("Technicians");
  if (!payload.clientSignature?.name?.trim()) missing.push("Client Signature");

  return missing;
}

export function validateJobCardPayload(payload: JobCardPayload): string | null {
  const missing = listMissingJobCardFields(payload);
  if (!missing.length) return null;
  if (missing.length === 1) return `${missing[0]} is required`;
  return `Complete required fields:\n• ${missing.join("\n• ")}`;
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
  status: "pending" | "open" | "closed";
  lastMessageAt: string | null;
  createdAt: string;
  acceptedBy?: string | null;
  acceptedAt?: string | null;
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

export type ClientSupportRequestCategoryDto =
  | "slow_internet"
  | "no_internet"
  | "quote"
  | "other";

export type ClientSupportRequestStatusDto =
  | "new"
  | "checked"
  | "site_survey_needed"
  | "resolved";

export interface ClientSupportRequestDto {
  id: string;
  itemId: string;
  category: ClientSupportRequestCategoryDto;
  description: string;
  status: ClientSupportRequestStatusDto;
  createdAt: string;
  productName?: string;
  deviceLabel?: string;
}

export interface ClientInstallationDto {
  itemId: string;
  productName: string;
  brand: string;
  deviceName: string;
  serialNumber: string;
  wifiName: string | null;
  wifiPassword: string | null;
  clientPppoe: string | null;
  clientName: string | null;
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
  /**
   * The open booking, when there is one (migration 069). The assigned driver
   * is who the vehicle belongs to; this is who has it right now.
   */
  heldBy?: {
    technicianName: string;
    since: string;
    odometerStart: number | null;
  } | null;
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
  /** Odometer at the pump (migration 069) — what turns litres into km/L. */
  odometerKm?: number | null;
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

export {
  SERVICE_PACKAGES,
  findServicePackage,
  formatZar,
  upgradesForPackage,
  toClientPackageInfo,
  toClientPackageUpgrade,
  type ServicePackage,
  type ServicePackageType,
  type ClientPackageInfo,
  type ClientPackageUpgrade,
} from "./service-packages";
