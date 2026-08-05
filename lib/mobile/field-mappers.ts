import type {
  FieldJob,
  JobStatus,
  LeaveType,
  OtMode,
  OtSettings,
  TimeEntry,
  TimeOffRequest,
  TimeOffStatus,
} from "@megs/shared";
import { DEFAULT_OT_SETTINGS } from "@megs/shared";

export function jobFromRow(
  row: {
    id: string;
    lead_id: string | null;
    title: string;
    address: string;
    client_name: string | null;
    scheduled_start: string | null;
    scheduled_end: string | null;
    status: string;
    notes: string;
    stock_request_id: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
    source?: string | null;
    tower_id?: string | null;
    tower_site_id?: string | null;
    job_type?: string | null;
    location_lat?: number | null;
    location_lng?: number | null;
    client_pppoe?: string | null;
    project_id?: string | null;
    project_block_id?: string | null;
  },
  technicianIds: string[] = []
): FieldJob {
  const source =
    row.source === "owner" || row.source === "support" || row.source === "coordination"
      ? row.source
      : "coordination";
  return {
    id: row.id,
    leadId: row.lead_id,
    title: row.title,
    address: row.address ?? "",
    locationLat:
      typeof row.location_lat === "number" && Number.isFinite(row.location_lat)
        ? row.location_lat
        : null,
    locationLng:
      typeof row.location_lng === "number" && Number.isFinite(row.location_lng)
        ? row.location_lng
        : null,
    clientName: row.client_name,
    scheduledStart: row.scheduled_start,
    scheduledEnd: row.scheduled_end,
    status: row.status as JobStatus,
    notes: row.notes ?? "",
    stockRequestId: row.stock_request_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    technicianIds,
    source,
    towerId: row.tower_id ?? null,
    towerSiteId: row.tower_site_id ?? null,
    jobType: row.job_type ?? "general",
    clientPppoe: row.client_pppoe ?? "",
    projectId: row.project_id ?? null,
    projectBlockId: row.project_block_id ?? null,
  };
}

export function timeEntryFromRow(row: {
  id: string;
  technician_id: string;
  job_id: string | null;
  clock_in_at: string;
  clock_out_at: string | null;
  clock_in_lat: number | null;
  clock_in_lng: number | null;
  clock_out_lat: number | null;
  clock_out_lng: number | null;
  source: string;
  edited_by: string | null;
  created_at: string;
}): TimeEntry {
  return {
    id: row.id,
    technicianId: row.technician_id,
    jobId: row.job_id,
    clockInAt: row.clock_in_at,
    clockOutAt: row.clock_out_at,
    clockInLat: row.clock_in_lat,
    clockInLng: row.clock_in_lng,
    clockOutLat: row.clock_out_lat,
    clockOutLng: row.clock_out_lng,
    source: row.source === "manual" ? "manual" : "mobile",
    editedBy: row.edited_by,
    createdAt: row.created_at,
  };
}

export function otSettingsFromRow(row: {
  id: string;
  mode: string;
  daily_threshold_minutes: number;
  weekly_threshold_minutes: number;
  weekend_as_ot: boolean;
  updated_at: string;
  updated_by: string | null;
} | null | undefined): OtSettings {
  if (!row) return { ...DEFAULT_OT_SETTINGS };
  const mode: OtMode =
    row.mode === "weekly" || row.mode === "both" || row.mode === "daily"
      ? row.mode
      : "daily";
  return {
    id: row.id,
    mode,
    dailyThresholdMinutes: row.daily_threshold_minutes,
    weeklyThresholdMinutes: row.weekly_threshold_minutes,
    weekendAsOt: row.weekend_as_ot,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

export function timeOffFromRow(
  row: {
    id: string;
    technician_id: string;
    leave_type: string;
    start_date: string;
    end_date: string;
    days: number | string;
    reason: string;
    status: string;
    reviewed_by: string | null;
    reviewed_at: string | null;
    review_note: string;
    created_at: string;
    updated_at: string;
  },
  technicianName?: string
): TimeOffRequest {
  return {
    id: row.id,
    technicianId: row.technician_id,
    leaveType: row.leave_type as LeaveType,
    startDate: row.start_date,
    endDate: row.end_date,
    days: Number(row.days) || 0,
    reason: row.reason ?? "",
    status: row.status as TimeOffStatus,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    technicianName,
  };
}

export function makeId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export function migrationHint(message: string, migration: string) {
  if (/does not exist|schema cache/i.test(message)) {
    return `${message}. Run supabase/migrations/${migration} in Supabase.`;
  }
  return message;
}
