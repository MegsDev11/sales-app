import type { FieldJob, JobStatus, LeaveType, TimeEntry, TimeOffRequest, TimeOffStatus } from "@megs/shared";

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
  },
  technicianIds: string[] = []
): FieldJob {
  return {
    id: row.id,
    leadId: row.lead_id,
    title: row.title,
    address: row.address ?? "",
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
