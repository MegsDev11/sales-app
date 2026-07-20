import type { Lead, Temperature, User } from "@/lib/types";
import { daysInStage, isOverdue } from "@/lib/utils/time";

export function isLeadVisible(lead: Lead): boolean {
  return !lead.deleted;
}

export function isFollowUpOverdue(lead: Lead): boolean {
  if (!lead.nextFollowUpAt) return false;
  return new Date(lead.nextFollowUpAt) < new Date();
}

export function isFollowUpDueToday(lead: Lead): boolean {
  if (!lead.nextFollowUpAt) return false;
  const today = new Date();
  const followUp = new Date(lead.nextFollowUpAt);
  return (
    followUp.getFullYear() === today.getFullYear() &&
    followUp.getMonth() === today.getMonth() &&
    followUp.getDate() === today.getDate()
  );
}

export function isActiveLead(lead: Lead): boolean {
  return lead.stage !== "closed_won" && lead.stage !== "closed_lost";
}

export function computeTemperature(lead: Lead, activities: { leadId: string; createdAt: string }[]): Temperature {
  if (lead.priority === "high" && isActiveLead(lead)) return "hot";
  const leadActivities = activities.filter((a) => a.leadId === lead.id);
  if (leadActivities.length === 0) return "cold";
  const latest = leadActivities.reduce((max, a) =>
    new Date(a.createdAt) > new Date(max.createdAt) ? a : max
  );
  const daysSinceActivity = Math.floor(
    (Date.now() - new Date(latest.createdAt).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysSinceActivity <= 2) return "hot";
  if (daysSinceActivity <= 7) return "warm";
  return "cold";
}

export function filterLeadsForUser(
  leads: Lead[],
  userId: string | undefined,
  isAdmin: boolean
): Lead[] {
  return leads.filter((lead) => {
    if (!isLeadVisible(lead)) return false;
    if (!isAdmin && lead.assignedToId !== userId) return false;
    return true;
  });
}

export function searchLeads(leads: Lead[], query: string): Lead[] {
  if (!query.trim()) return leads;
  const q = query.toLowerCase();
  return leads.filter(
    (l) =>
      l.clientName.toLowerCase().includes(q) ||
      l.company?.toLowerCase().includes(q) ||
      l.phone.includes(q) ||
      l.email.toLowerCase().includes(q) ||
      l.address?.toLowerCase().includes(q)
  );
}

export function sortLeads(leads: Lead[], field: import("@/lib/types").SortField): Lead[] {
  const sorted = [...leads];
  const priorityOrder = { high: 0, medium: 1, low: 2 };

  sorted.sort((a, b) => {
    switch (field) {
      case "priority":
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      case "daysInStage":
        return daysInStage(b) - daysInStage(a);
      case "dealValue":
        return (b.dealValue ?? 0) - (a.dealValue ?? 0);
      case "followUp": {
        if (!a.nextFollowUpAt && !b.nextFollowUpAt) return 0;
        if (!a.nextFollowUpAt) return 1;
        if (!b.nextFollowUpAt) return -1;
        return new Date(a.nextFollowUpAt).getTime() - new Date(b.nextFollowUpAt).getTime();
      }
      case "clientName":
        return a.clientName.localeCompare(b.clientName);
      default:
        return 0;
    }
  });
  return sorted;
}

export function getRepMonthlyStats(
  leads: Lead[],
  repId: string,
  month: Date = new Date()
) {
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59);

  const wonThisMonth = leads.filter((l) => {
    if (l.assignedToId !== repId || l.stage !== "closed_won" || !l.closedAt) return false;
    const closed = new Date(l.closedAt);
    return closed >= monthStart && closed <= monthEnd;
  });

  return {
    dealsClosed: wonThisMonth.length,
    revenueClosed: wonThisMonth.reduce((s, l) => s + (l.dealValue ?? 0), 0),
  };
}

export function getNotifications(
  leads: Lead[],
  users: User[],
  currentUserId: string,
  isAdmin: boolean
) {
  const visible = filterLeadsForUser(leads, currentUserId, isAdmin);
  const active = visible.filter(isActiveLead);

  const overdueFollowUps = active.filter(isFollowUpOverdue);
  const dueToday = active.filter(isFollowUpDueToday);
  const stuckLeads = active.filter((l) => isOverdue(l));
  const unassigned = isAdmin ? leads.filter((l) => !l.deleted && !l.assignedToId && isActiveLead(l)) : [];
  const coldLeads = active.filter((l) => l.temperature === "cold");

  return { overdueFollowUps, dueToday, stuckLeads, unassigned, coldLeads };
}

export function addDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

export function formatFollowUpDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-ZA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
