import type { OtSettings, TimeEntry } from "./index";

const FALLBACK_OT: OtSettings = {
  id: "default",
  mode: "daily",
  dailyThresholdMinutes: 480,
  weeklyThresholdMinutes: 2400,
  weekendAsOt: false,
  updatedAt: new Date(0).toISOString(),
  updatedBy: null,
};
export type DayHoursSplit = {
  /** YYYY-MM-DD local */
  dateKey: string;
  dayOfMonth: number;
  weekdayShort: string;
  /** 0 = Sunday … 6 = Saturday (Date.getDay) */
  weekday: number;
  totalMinutes: number;
  regularMinutes: number;
  otMinutes: number;
  hasOpenShift: boolean;
  firstClockInAt: string | null;
  lastClockOutAt: string | null;
};

export type WeekHoursGroup = {
  weekStartKey: string;
  label: string;
  totalMinutes: number;
  regularMinutes: number;
  otMinutes: number;
  days: DayHoursSplit[];
};

export type PeriodHoursSummary = {
  regularMinutes: number;
  otMinutes: number;
  totalMinutes: number;
  /** Days in range with zero work minutes (placeholder for leave later) */
  absenceDays: number;
  weeks: WeekHoursGroup[];
  days: DayHoursSplit[];
};

function startOfLocalDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addLocalDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function dateKeyLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Monday 00:00 local for the week containing `d`. */
export function startOfWeekMonday(d: Date) {
  const date = startOfLocalDay(d);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  return date;
}

export function formatDurationLabel(totalMinutes: number) {
  if (totalMinutes <= 0) return "--";
  const mins = Math.round(totalMinutes);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

export function monthRangeLocal(anchor: Date) {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
  end.setHours(0, 0, 0, 0);
  return { start, end };
}

export function formatMonthRangePill(start: Date, endExclusive: Date) {
  const last = addLocalDays(endExclusive, -1);
  const a = `${String(start.getDate()).padStart(2, "0")}/${String(start.getMonth() + 1).padStart(2, "0")}`;
  const b = `${String(last.getDate()).padStart(2, "0")}/${String(last.getMonth() + 1).padStart(2, "0")}`;
  return `${a} - ${b}`;
}

/** Allocate entry minutes across local calendar days between rangeStart and rangeEnd (exclusive). */
function allocateEntryMinutes(
  entry: TimeEntry,
  rangeStart: Date,
  rangeEnd: Date,
  now: Date,
  buckets: Map<
    string,
    {
      minutes: number;
      firstIn: string | null;
      lastOut: string | null;
      open: boolean;
    }
  >
) {
  const startMs = new Date(entry.clockInAt).getTime();
  if (Number.isNaN(startMs)) return;
  const endMs = entry.clockOutAt ? new Date(entry.clockOutAt).getTime() : now.getTime();
  if (Number.isNaN(endMs) || endMs <= startMs) return;

  const from = Math.max(startMs, rangeStart.getTime());
  const to = Math.min(endMs, rangeEnd.getTime());
  if (to <= from) return;

  let cursor = from;
  while (cursor < to) {
    const cursorDate = new Date(cursor);
    const dayStart = startOfLocalDay(cursorDate);
    const nextDay = addLocalDays(dayStart, 1).getTime();
    const sliceEnd = Math.min(to, nextDay);
    const minutes = (sliceEnd - cursor) / 60000;
    const key = dateKeyLocal(dayStart);
    if (minutes > 0 && dayStart.getTime() >= rangeStart.getTime() && dayStart.getTime() < rangeEnd.getTime()) {
      const bucket = buckets.get(key) ?? {
        minutes: 0,
        firstIn: null,
        lastOut: null,
        open: false,
      };
      bucket.minutes += minutes;
      if (startMs >= dayStart.getTime() && startMs < nextDay) {
        if (!bucket.firstIn || entry.clockInAt < bucket.firstIn) {
          bucket.firstIn = entry.clockInAt;
        }
      }
      if (entry.clockOutAt) {
        const outMs = new Date(entry.clockOutAt).getTime();
        if (outMs > dayStart.getTime() && outMs <= nextDay) {
          if (!bucket.lastOut || entry.clockOutAt > bucket.lastOut) {
            bucket.lastOut = entry.clockOutAt;
          }
        }
      } else {
        bucket.open = true;
        bucket.lastOut = null;
      }
      buckets.set(key, bucket);
    }
    cursor = sliceEnd;
  }
}

function isWeekend(weekday: number) {
  return weekday === 0 || weekday === 6;
}

/**
 * Split day totals into regular/OT using company settings.
 * Daily / weekend applied per day; weekly OT applied chronologically across the period weeks.
 */
export function buildPeriodHours(
  entries: TimeEntry[],
  rangeStart: Date,
  rangeEnd: Date,
  settings: OtSettings = FALLBACK_OT,
  now = new Date()
): PeriodHoursSummary {
  const buckets = new Map<
    string,
    { minutes: number; firstIn: string | null; lastOut: string | null; open: boolean }
  >();

  for (const entry of entries) {
    allocateEntryMinutes(entry, rangeStart, rangeEnd, now, buckets);
  }

  const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
  const rawDays: DayHoursSplit[] = [];
  for (let d = new Date(rangeStart); d < rangeEnd; d = addLocalDays(d, 1)) {
    const key = dateKeyLocal(d);
    const b = buckets.get(key);
    const total = b?.minutes ?? 0;
    const weekday = d.getDay();
    let regular = 0;
    let ot = 0;

    if (total > 0) {
      if (settings.weekendAsOt && isWeekend(weekday)) {
        ot = total;
        regular = 0;
      } else if (settings.mode === "daily" || settings.mode === "both") {
        regular = Math.min(total, settings.dailyThresholdMinutes);
        ot = Math.max(0, total - settings.dailyThresholdMinutes);
      } else {
        // weekly-only: assign all as regular first; weekly pass adjusts below
        regular = total;
        ot = 0;
      }
    }

    rawDays.push({
      dateKey: key,
      dayOfMonth: d.getDate(),
      weekdayShort: WEEKDAY[weekday],
      weekday,
      totalMinutes: total,
      regularMinutes: regular,
      otMinutes: ot,
      hasOpenShift: b?.open ?? false,
      firstClockInAt: b?.firstIn ?? null,
      lastClockOutAt: b?.open ? null : (b?.lastOut ?? null),
    });
  }

  // Weekly OT pass: for weekly / both, excess over weekly threshold becomes OT
  if (settings.mode === "weekly" || settings.mode === "both") {
    const byWeek = new Map<string, DayHoursSplit[]>();
    for (const day of rawDays) {
      const weekStart = startOfWeekMonday(new Date(day.dateKey + "T12:00:00"));
      const wk = dateKeyLocal(weekStart);
      const list = byWeek.get(wk) ?? [];
      list.push(day);
      byWeek.set(wk, list);
    }
    for (const days of byWeek.values()) {
      let remainingRegularCap = settings.weeklyThresholdMinutes;
      for (const day of days) {
        if (day.totalMinutes <= 0) continue;
        if (settings.weekendAsOt && isWeekend(day.weekday)) {
          // already all OT
          continue;
        }
        if (settings.mode === "weekly") {
          const asRegular = Math.min(day.totalMinutes, remainingRegularCap);
          day.regularMinutes = asRegular;
          day.otMinutes = day.totalMinutes - asRegular;
          remainingRegularCap = Math.max(0, remainingRegularCap - asRegular);
        } else {
          // both: daily OT already applied; further weekly OT on remaining regular
          const dailyRegular = day.regularMinutes;
          const asRegular = Math.min(dailyRegular, remainingRegularCap);
          const extraOt = dailyRegular - asRegular;
          day.regularMinutes = asRegular;
          day.otMinutes += extraOt;
          remainingRegularCap = Math.max(0, remainingRegularCap - asRegular);
        }
      }
    }
  }

  const weeks: WeekHoursGroup[] = [];
  let current: WeekHoursGroup | null = null;
  for (const day of rawDays) {
    const weekStart = startOfWeekMonday(new Date(day.dateKey + "T12:00:00"));
    const wk = dateKeyLocal(weekStart);
    if (!current || current.weekStartKey !== wk) {
      current = {
        weekStartKey: wk,
        label: "Week total",
        totalMinutes: 0,
        regularMinutes: 0,
        otMinutes: 0,
        days: [],
      };
      weeks.push(current);
    }
    current.days.push(day);
    current.totalMinutes += day.totalMinutes;
    current.regularMinutes += day.regularMinutes;
    current.otMinutes += day.otMinutes;
  }

  const regularMinutes = rawDays.reduce((s, d) => s + d.regularMinutes, 0);
  const otMinutes = rawDays.reduce((s, d) => s + d.otMinutes, 0);
  const totalMinutes = regularMinutes + otMinutes;
  const absenceDays = rawDays.filter((d) => d.totalMinutes <= 0).length;

  return {
    regularMinutes,
    otMinutes,
    totalMinutes,
    absenceDays,
    weeks,
    days: rawDays,
  };
}

/** Duration minutes for a single entry (open shifts use `now`). */
export function entryDurationMinutes(entry: TimeEntry, now = new Date()) {
  const start = new Date(entry.clockInAt).getTime();
  const end = entry.clockOutAt ? new Date(entry.clockOutAt).getTime() : now.getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 0;
  return (end - start) / 60000;
}

export function splitMinutesForSettings(
  totalMinutes: number,
  settings: OtSettings,
  weekday: number
): { regularMinutes: number; otMinutes: number } {
  if (totalMinutes <= 0) return { regularMinutes: 0, otMinutes: 0 };
  if (settings.weekendAsOt && isWeekend(weekday)) {
    return { regularMinutes: 0, otMinutes: totalMinutes };
  }
  if (settings.mode === "weekly") {
    // Without week context, treat as all regular (caller should use buildPeriodHours)
    return { regularMinutes: totalMinutes, otMinutes: 0 };
  }
  const regular = Math.min(totalMinutes, settings.dailyThresholdMinutes);
  return {
    regularMinutes: regular,
    otMinutes: Math.max(0, totalMinutes - settings.dailyThresholdMinutes),
  };
}
