import type { Activity, Lead, LeadStage, User } from "@/lib/types";
import { ACTIVE_STAGES, STAGE_LABELS, STAGES } from "@/lib/constants";
import { isActiveLead, isLeadVisible } from "@/lib/utils/leads";

/**
 * Pure metric helpers for the dashboards.
 *
 * Kept out of the page components on purpose: a page that both derives numbers and
 * renders them is where quiet reporting bugs live. Everything here is a pure
 * function of its inputs.
 */

export interface MonthBucket {
  key: string;
  label: string;
  start: Date;
  end: Date;
}

/** The last `count` months, oldest first, ending with the current month. */
export function monthBuckets(count = 6, now = new Date()): MonthBucket[] {
  return Array.from({ length: count }, (_, i) => {
    const start = new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    return {
      key: `${start.getFullYear()}-${start.getMonth() + 1}`,
      label: start.toLocaleDateString("en-ZA", { month: "short" }),
      start,
      end,
    };
  });
}

function inRange(iso: string | undefined | null, b: MonthBucket): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= b.start.getTime() && t < b.end.getTime();
}

/** Revenue actually closed per month (won deals only). */
export function revenueByMonth(leads: Lead[], months = 6): { labels: string[]; values: number[] } {
  const buckets = monthBuckets(months);
  const values = buckets.map((b) =>
    leads
      .filter((l) => isLeadVisible(l) && l.stage === "closed_won" && inRange(l.closedAt, b))
      .reduce((sum, l) => sum + (l.dealValue ?? 0), 0)
  );
  return { labels: buckets.map((b) => b.label), values };
}

/** New leads created per month — demand, as opposed to revenue. */
export function leadsByMonth(leads: Lead[], months = 6): { labels: string[]; values: number[] } {
  const buckets = monthBuckets(months);
  const values = buckets.map(
    (b) => leads.filter((l) => isLeadVisible(l) && inRange(l.createdAt, b)).length
  );
  return { labels: buckets.map((b) => b.label), values };
}

export function wonLostByMonth(
  leads: Lead[],
  months = 6
): { labels: string[]; won: number[]; lost: number[] } {
  const buckets = monthBuckets(months);
  return {
    labels: buckets.map((b) => b.label),
    won: buckets.map(
      (b) =>
        leads.filter((l) => isLeadVisible(l) && l.stage === "closed_won" && inRange(l.closedAt, b))
          .length
    ),
    lost: buckets.map(
      (b) =>
        leads.filter((l) => isLeadVisible(l) && l.stage === "closed_lost" && inRange(l.closedAt, b))
          .length
    ),
  };
}

/** Pipeline funnel — counts and value per active stage, in stage order. */
export function pipelineFunnel(leads: Lead[]) {
  const visible = leads.filter(isLeadVisible);
  return ACTIVE_STAGES.map((stage) => {
    const inStage = visible.filter((l) => l.stage === stage);
    return {
      label: STAGE_LABELS[stage],
      count: inStage.length,
      value: inStage.reduce((s, l) => s + (l.dealValue ?? 0), 0),
    };
  });
}

/** Open pipeline value — deals not yet won or lost. */
export function openPipelineValue(leads: Lead[]): number {
  return leads
    .filter((l) => isLeadVisible(l) && isActiveLead(l))
    .reduce((s, l) => s + (l.dealValue ?? 0), 0);
}

export function winRate(leads: Lead[]): number {
  const closed = leads.filter(
    (l) => isLeadVisible(l) && (l.stage === "closed_won" || l.stage === "closed_lost")
  );
  if (closed.length === 0) return 0;
  return (closed.filter((l) => l.stage === "closed_won").length / closed.length) * 100;
}

/** Average days from creation to close, won deals only. */
export function avgDaysToClose(leads: Lead[]): number {
  const won = leads.filter((l) => isLeadVisible(l) && l.stage === "closed_won" && l.closedAt);
  if (won.length === 0) return 0;
  const total = won.reduce(
    (s, l) =>
      s + (new Date(l.closedAt!).getTime() - new Date(l.createdAt).getTime()) / 86400000,
    0
  );
  return total / won.length;
}

/** Percentage change between the last two months of a series. */
export function momChange(values: number[]): number | undefined {
  if (values.length < 2) return undefined;
  const prev = values[values.length - 2];
  const curr = values[values.length - 1];
  if (prev === 0) return curr === 0 ? 0 : undefined;
  return ((curr - prev) / prev) * 100;
}

export interface RepStat {
  user: User;
  won: number;
  revenue: number;
  open: number;
  openValue: number;
  winRate: number;
}

export function repPerformance(leads: Lead[], users: User[]): RepStat[] {
  const reps = users.filter((u) => u.role === "staff" && u.department === "sales");
  return reps
    .map((user) => {
      const mine = leads.filter((l) => isLeadVisible(l) && l.assignedToId === user.id);
      const won = mine.filter((l) => l.stage === "closed_won");
      const lost = mine.filter((l) => l.stage === "closed_lost");
      const open = mine.filter(isActiveLead);
      const closedCount = won.length + lost.length;
      return {
        user,
        won: won.length,
        revenue: won.reduce((s, l) => s + (l.dealValue ?? 0), 0),
        open: open.length,
        openValue: open.reduce((s, l) => s + (l.dealValue ?? 0), 0),
        winRate: closedCount > 0 ? (won.length / closedCount) * 100 : 0,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

/** Lead counts by source — identity, so categorical colour is correct here. */
export function leadsBySource(leads: Lead[]): { label: string; value: number }[] {
  const counts = new Map<string, number>();
  for (const l of leads.filter(isLeadVisible)) {
    counts.set(l.leadSource, (counts.get(l.leadSource) ?? 0) + 1);
  }
  const labels: Record<string, string> = {
    website: "Website",
    referral: "Referral",
    "walk-in": "Walk-in",
    "cold-call": "Cold call",
  };
  return Array.from(counts.entries())
    .map(([k, v]) => ({ label: labels[k] ?? k, value: v }))
    .sort((a, b) => b.value - a.value);
}

export function leadsByServiceType(leads: Lead[]): { label: string; value: number }[] {
  const counts = new Map<string, number>();
  for (const l of leads.filter(isLeadVisible)) {
    counts.set(l.serviceType, (counts.get(l.serviceType) ?? 0) + 1);
  }
  const labels: Record<string, string> = {
    fiber: "Fiber",
    wireless: "Wireless",
    both: "Fiber + Wireless",
  };
  return Array.from(counts.entries()).map(([k, v]) => ({ label: labels[k] ?? k, value: v }));
}

export function leadsByZone(leads: Lead[]): { label: string; value: number }[] {
  const counts = new Map<string, number>();
  for (const l of leads.filter((x) => isLeadVisible(x) && isActiveLead(x))) {
    const zone = l.serviceZone || "Unassigned";
    counts.set(zone, (counts.get(zone) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([k, v]) => ({ label: k, value: v }))
    .sort((a, b) => b.value - a.value);
}

/** Activity volume per week — a rough proxy for how busy the team is. */
export function activityByWeek(
  activities: Activity[],
  weeks = 8
): { labels: string[]; values: number[] } {
  const now = new Date();
  const buckets = Array.from({ length: weeks }, (_, i) => {
    const end = new Date(now);
    end.setDate(now.getDate() - (weeks - 1 - i) * 7);
    const start = new Date(end);
    start.setDate(end.getDate() - 7);
    return { start, end, label: `${start.getDate()}/${start.getMonth() + 1}` };
  });
  return {
    labels: buckets.map((b) => b.label),
    values: buckets.map(
      (b) =>
        activities.filter((a) => {
          const t = new Date(a.createdAt).getTime();
          return t >= b.start.getTime() && t < b.end.getTime();
        }).length
    ),
  };
}

/** Stage colours from the existing constants, so board and charts agree. */
export function stageColor(stage: LeadStage): string {
  return STAGES.find((s) => s.id === stage)?.headerColor ?? "#94a3b8";
}
