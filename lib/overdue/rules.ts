/**
 * The overdue predicates, in one place.
 *
 * Three surfaces used to re-derive these independently (projects list,
 * coordination overview, general overview), and the daily sweep in
 * supabase/migrations/064_notifications_engine.sql mirrors them in SQL.
 * Change a rule here and in run_overdue_sweep() together.
 */

export const CLOSED_PROJECT_STATUSES = ["completed", "cancelled"] as const;
export const CLOSED_JOB_STATUSES = ["completed", "cancelled"] as const;

/** A project is overdue when its target date has passed and it is not closed out. */
export function isProjectOverdue(
  targetDate: string | null | undefined,
  status: string,
  today: string = new Date().toISOString().slice(0, 10)
): boolean {
  return Boolean(
    targetDate &&
      targetDate < today &&
      !CLOSED_PROJECT_STATUSES.includes(status as (typeof CLOSED_PROJECT_STATUSES)[number])
  );
}

/** A field job is overdue when its scheduled end has passed and it is still open. */
export function isJobOverdue(
  scheduledEnd: string | null | undefined,
  status: string,
  now: number = Date.now()
): boolean {
  return Boolean(
    scheduledEnd &&
      new Date(scheduledEnd).getTime() < now &&
      !CLOSED_JOB_STATUSES.includes(status as (typeof CLOSED_JOB_STATUSES)[number])
  );
}

/** A stock booking's return is overdue when return-needed has passed unreturned. */
export function isReturnOverdue(
  returnNeededAt: string | null | undefined,
  returnedAt: string | null | undefined,
  now: number = Date.now()
): boolean {
  return Boolean(
    !returnedAt && returnNeededAt && new Date(returnNeededAt).getTime() <= now
  );
}
