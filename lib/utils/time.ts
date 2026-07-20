import { STAGES } from "@/lib/constants";
import type { Lead, LeadStage } from "@/lib/types";

export function daysBetween(start: string, end: string = new Date().toISOString()): number {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diff = endDate.getTime() - startDate.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

export function daysInStage(lead: Lead): number {
  return daysBetween(lead.stageEnteredAt);
}

export function totalPipelineDays(lead: Lead): number {
  const end = lead.closedAt ?? new Date().toISOString();
  return daysBetween(lead.createdAt, end);
}

export function daysToClose(lead: Lead): number | null {
  if (lead.stage !== "closed_won" || !lead.closedAt) return null;
  return daysBetween(lead.createdAt, lead.closedAt);
}

export function getStageOverdueDays(stage: LeadStage): number {
  return STAGES.find((s) => s.id === stage)?.overdueDays ?? 7;
}

export function isOverdue(lead: Lead): boolean {
  if (lead.stage === "closed_won" || lead.stage === "closed_lost") return false;
  return daysInStage(lead) > getStageOverdueDays(lead.stage);
}

export function formatRelativeDate(date: string): string {
  const days = daysBetween(date);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(date).toLocaleDateString("en-ZA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
