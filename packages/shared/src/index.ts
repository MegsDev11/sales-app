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

export const API_PATHS = {
  mobileMe: "/api/mobile/me",
  mobileTechJobs: "/api/mobile/tech/jobs",
  mobileTechTime: "/api/mobile/tech/time",
  mobileTechTimeOff: "/api/mobile/tech/time-off",
  mobileTechLocation: "/api/mobile/tech/location",
  mobileStockSummary: "/api/mobile/stock/summary",
  mobileClientMe: "/api/mobile/client/me",
  mobileClientLayout: "/api/mobile/client/layout",
  mobileClientMessages: "/api/mobile/client/messages",
  stock: "/api/stock",
  coordinationJobs: "/api/coordination/jobs",
  coordinationTimesheets: "/api/coordination/timesheets",
  coordinationTimeOff: "/api/coordination/time-off",
  supportMessages: "/api/support/messages",
} as const;

export type MobileRole = "tech" | "stock" | "client" | "unsupported";

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

export interface FieldJob {
  id: string;
  leadId: string | null;
  title: string;
  address: string;
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
