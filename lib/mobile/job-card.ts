import type {
  JobCardStatus,
  JobCardStockLine,
  JobCardSubmission,
} from "@megs/shared";
import {
  emptyJobCardPayload,
  summarizeStockChecklist,
  validateJobCardPayload,
  type JobCardPayload,
} from "@megs/shared";

export { summarizeStockChecklist, validateJobCardPayload };

export function jobCardFromRow(row: {
  id: string;
  job_id: string;
  technician_id: string;
  status: string;
  payload: unknown;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
  card_number?: string | null;
}): JobCardSubmission {
  const base = emptyJobCardPayload();
  const raw =
    row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
      ? (row.payload as Partial<JobCardPayload>)
      : {};
  const checklist = Array.isArray(raw.stockChecklist)
    ? (raw.stockChecklist as JobCardStockLine[])
    : [];
  return {
    id: row.id,
    jobId: row.job_id,
    technicianId: row.technician_id,
    cardNumber: row.card_number?.trim() || null,
    status: row.status === "submitted" ? "submitted" : ("draft" as JobCardStatus),
    payload: { ...base, ...raw, stockChecklist: checklist },
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mergeStockChecklist(
  existing: JobCardStockLine[],
  fromBookings: JobCardStockLine[]
): JobCardStockLine[] {
  const byBooking = new Map(existing.map((l) => [l.bookingId, l]));
  return fromBookings.map((line) => {
    const prev = byBooking.get(line.bookingId);
    return {
      ...line,
      used: prev?.used ?? null,
    };
  });
}

/** Allocate JC-##### via DB sequence; fallback if migration not applied yet. */
export async function allocateJobCardNumber(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: { rpc: (fn: "next_job_card_number", ...args: any[]) => any }
): Promise<string> {
  const { data, error } = await supabase.rpc("next_job_card_number");
  if (!error && data != null && String(data).trim()) {
    return String(data).trim();
  }
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `JC-${stamp}-${rand}`;
}
