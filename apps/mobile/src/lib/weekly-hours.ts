import type { TimeEntry } from "@megs/shared";

export type WeekDayHours = {
  label: string;
  minutes: number | null;
  /** Earliest clock-in that day (ISO), if any */
  firstClockInAt: string | null;
  /** Latest clock-out that day (ISO), or null if still open */
  lastClockOutAt: string | null;
  hasOpenShift: boolean;
};

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Monday 00:00:00.000 local time for the week containing `d`. */
export function startOfWeekLocal(d = new Date()) {
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - day);
  return date;
}

export function endOfWeekLocal(d = new Date()) {
  const start = startOfWeekLocal(d);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return end;
}

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

/** Split an entry across local calendar days (handles overnight shifts). */
function allocateEntryToDays(
  entry: TimeEntry,
  weekStart: Date,
  weekEnd: Date,
  now: Date,
  buckets: Map<number, { minutes: number; firstIn: string | null; lastOut: string | null; open: boolean }>
) {
  const startMs = new Date(entry.clockInAt).getTime();
  if (Number.isNaN(startMs)) return;
  const endMs = entry.clockOutAt ? new Date(entry.clockOutAt).getTime() : now.getTime();
  if (Number.isNaN(endMs) || endMs <= startMs) return;

  // Clip to this week window
  const from = Math.max(startMs, weekStart.getTime());
  const to = Math.min(endMs, weekEnd.getTime());
  if (to <= from) return;

  let cursor = from;
  while (cursor < to) {
    const cursorDate = new Date(cursor);
    const dayStart = startOfLocalDay(cursorDate);
    const nextDay = addLocalDays(dayStart, 1).getTime();
    const sliceEnd = Math.min(to, nextDay);
    const minutes = (sliceEnd - cursor) / 60000;
    const dayIndex = Math.floor((dayStart.getTime() - weekStart.getTime()) / 86400000);
    if (dayIndex >= 0 && dayIndex < 7 && minutes > 0) {
      const bucket = buckets.get(dayIndex) ?? {
        minutes: 0,
        firstIn: null,
        lastOut: null,
        open: false,
      };
      bucket.minutes += minutes;
      // Record clock-in on the day the shift started (or first slice day)
      if (!bucket.firstIn || entry.clockInAt < bucket.firstIn) {
        if (startMs >= dayStart.getTime() && startMs < nextDay) {
          bucket.firstIn = entry.clockInAt;
        } else if (!bucket.firstIn) {
          bucket.firstIn = new Date(cursor).toISOString();
        }
      }
      if (!entry.clockOutAt && sliceEnd >= to) {
        bucket.open = true;
        bucket.lastOut = null;
      } else if (entry.clockOutAt) {
        const outMs = new Date(entry.clockOutAt).getTime();
        if (outMs >= dayStart.getTime() && outMs < nextDay) {
          if (!bucket.lastOut || entry.clockOutAt > bucket.lastOut) {
            bucket.lastOut = entry.clockOutAt;
          }
        }
      }
      buckets.set(dayIndex, bucket);
    }
    cursor = sliceEnd;
  }
}

export function buildWeeklyHours(
  entries: TimeEntry[],
  now = new Date()
): {
  days: WeekDayHours[];
  totalMinutes: number;
  totalLabel: string;
  progress: number;
} {
  const weekStart = startOfWeekLocal(now);
  const weekEnd = endOfWeekLocal(now);
  const buckets = new Map<
    number,
    { minutes: number; firstIn: string | null; lastOut: string | null; open: boolean }
  >();

  for (const entry of entries) {
    allocateEntryToDays(entry, weekStart, weekEnd, now, buckets);
  }

  const days: WeekDayHours[] = DAY_LABELS.map((label, i) => {
    const b = buckets.get(i);
    if (!b || b.minutes <= 0) {
      return {
        label,
        minutes: null,
        firstClockInAt: null,
        lastClockOutAt: null,
        hasOpenShift: false,
      };
    }
    return {
      label,
      minutes: b.minutes,
      firstClockInAt: b.firstIn,
      lastClockOutAt: b.open ? null : b.lastOut,
      hasOpenShift: b.open,
    };
  });

  const totalMinutes = days.reduce((sum, d) => sum + (d.minutes ?? 0), 0);
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  return {
    days,
    totalMinutes,
    totalLabel: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
    progress: totalMinutes / (40 * 60),
  };
}
