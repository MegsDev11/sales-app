import type { JobCardPayload, JobCardStatus, JobCardSubmission } from "@megs/shared";
import { emptyJobCardPayload } from "@megs/shared";

export function jobCardFromRow(row: {
  id: string;
  job_id: string;
  technician_id: string;
  status: string;
  payload: unknown;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}): JobCardSubmission {
  const base = emptyJobCardPayload();
  const raw =
    row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
      ? (row.payload as Partial<JobCardPayload>)
      : {};
  return {
    id: row.id,
    jobId: row.job_id,
    technicianId: row.technician_id,
    status: row.status === "submitted" ? "submitted" : ("draft" as JobCardStatus),
    payload: { ...base, ...raw },
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function validateJobCardPayload(payload: JobCardPayload): string | null {
  const yesNo = (
    value: JobCardPayload[keyof JobCardPayload],
    label: string
  ): string | null => {
    if (value !== "yes" && value !== "no") return `${label} is required`;
    return null;
  };

  const checks: Array<string | null> = [
    yesNo(payload.workingOnHeights, "Working on heights"),
    yesNo(payload.weatherDanger, "Weather conditions"),
    yesNo(payload.highVoltageNearby, "High voltage nearby"),
    yesNo(payload.hasPpe, "PPE"),
    yesNo(payload.needsMgmtApproval, "Management approval risk"),
    payload.seniorTechSignature?.name?.trim()
      ? null
      : "Senior technician signature is required",
    payload.clientNameSurname.trim() ? null : "Client name is required",
    yesNo(payload.requiresCableWork, "Cable work"),
    yesNo(payload.riskAssessmentApproved, "Risk assessment approved"),
    payload.jobDate.trim() ? null : "Date of job is required",
    payload.jobTime.trim() ? null : "Time of job is required",
    payload.hoursOnSite.trim() ? null : "Time spent on site is required",
    payload.travelOneWay.trim() ? null : "Travel is required",
    payload.workDone.trim() ? null : "Work done is required",
    payload.stockUsed.trim() ? null : "Stock used is required",
    payload.afterPhotos.length ? null : "After photos are required",
    payload.serialPhotos.length ? null : "Serial number photos are required",
    payload.locationLat != null && payload.locationLng != null
      ? null
      : "Location is required",
    payload.technicians.trim() ? null : "Technicians is required",
    payload.clientSignature?.name?.trim()
      ? null
      : "Client signature is required",
  ];

  return checks.find((c) => c != null) ?? null;
}
