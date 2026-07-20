import type { Lead, LeadStage, StageHistoryEntry } from "@/lib/types";

export function createStageHistory(stage: LeadStage, enteredAt: string): StageHistoryEntry[] {
  return [{ stage, enteredAt }];
}

export function migrateLead(lead: Partial<Lead> & { id: string }): Lead {
  const now = lead.createdAt ?? new Date().toISOString();
  const stage = lead.stage ?? "new_lead";
  return {
    id: lead.id,
    clientName: lead.clientName ?? "Unknown",
    company: lead.company,
    phone: lead.phone ?? "",
    email: lead.email ?? "",
    serviceType: lead.serviceType ?? "fiber",
    packageTier: lead.packageTier ?? "",
    assignedToId: lead.assignedToId ?? null,
    stage,
    currentActivity: lead.currentActivity ?? "call",
    priority: lead.priority ?? "medium",
    createdAt: now,
    stageEnteredAt: lead.stageEnteredAt ?? now,
    closedAt: lead.closedAt,
    dealValue: lead.dealValue,
    discount: lead.discount ?? 0,
    leadSource: lead.leadSource ?? "website",
    address: lead.address,
    notes: lead.notes,
    deleted: lead.deleted ?? false,
    nextFollowUpAt: lead.nextFollowUpAt,
    nextAction: lead.nextAction,
    coverageStatus: lead.coverageStatus ?? "pending_survey",
    serviceZone: lead.serviceZone ?? "Pretoria North",
    siteSurveyDate: lead.siteSurveyDate,
    siteSurveyNotes: lead.siteSurveyNotes,
    lostReason: lead.lostReason,
    installationStatus: lead.installationStatus,
    installationDate: lead.installationDate,
    temperature: lead.temperature ?? "warm",
    stageHistory: lead.stageHistory ?? createStageHistory(stage, lead.stageEnteredAt ?? now),
    inboxDismissedAt: lead.inboxDismissedAt ?? null,
  };
}
