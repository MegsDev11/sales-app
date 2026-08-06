-- 064_notifications_engine.sql — module-wide notifications + the overdue sweep.
--
-- Why: app_notifications could only address four departments, and nothing in the
-- platform ever detected overdue work on a schedule — overdue counts were
-- recomputed per page view, so if nobody opened the page nobody ever learned a
-- project or job had slipped. This migration:
--
--   1. lets a notification address ANY module (the department column now holds
--      a module key; legacy 'sales' rows keep mapping to crm in the policy),
--   2. adds min_level so a row can be addressed to a module's managers only,
--   3. adds dedupe_key so a repeated sweep is idempotent (no morning re-spam),
--   4. adds run_overdue_sweep(): overdue projects, field jobs and stock returns
--      each write one manager-addressed notification per entity per ISO week —
--      still-overdue work re-nags weekly, read rows stay read in between,
--   5. schedules the sweep daily at 05:00 via pg_cron IF that extension is
--      enabled (Supabase: Database → Extensions → "pg_cron"), and
--   6. has an HTTP fallback for app-host crons: POST /api/cron/overdue-sweep
--      with the CRON_SECRET env var calls the same function.
--
-- The sweep's predicates mirror lib/overdue/rules.ts — keep the two in sync.

-- 1. Any module key may be a notification audience now.
alter table public.app_notifications
  drop constraint if exists app_notifications_department_check;

-- 2. Manager-only addressing + idempotency for scheduled sweeps.
alter table public.app_notifications
  add column if not exists min_level public.access_level not null default 'view',
  add column if not exists dedupe_key text;

create unique index if not exists idx_app_notifications_dedupe
  on public.app_notifications (dedupe_key)
  where dedupe_key is not null;

-- SQL-side inserts (the sweep) need ids without the app's makeId() helper.
alter table public.app_notifications
  alter column id set default 'ntf_' || replace(gen_random_uuid()::text, '-', '');

-- 3. Read policy honours min_level (replaces the 042 select policy).
drop policy if exists app_notifications_select on public.app_notifications;

create policy app_notifications_select on public.app_notifications
  for select to authenticated
  using (
    user_id = public.current_member_id()
    or (
      department is not null
      and (select public.has_module_access(
             case department when 'sales' then 'crm' else department end,
             min_level))
    )
  );

-- 4. The sweep. security definer: runs from pg_cron / the service-role RPC.
create or replace function public.run_overdue_sweep()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  bucket     text := to_char(now(), 'IYYY"-W"IW');  -- weekly re-nag while overdue
  n_projects int := 0;
  n_jobs     int := 0;
  n_returns  int := 0;
begin
  -- Projects past their target date and not closed out.
  with ins as (
    insert into app_notifications (department, min_level, type, title, body, link, dedupe_key)
    select 'projects', 'manage', 'overdue_project',
           'Project overdue: ' || p.name,
           'Target date ' || to_char(p.target_date, 'YYYY-MM-DD')
             || ' has passed (status: ' || p.status || ').',
           '/projects/' || p.id,
           'overdue:project:' || p.id || ':' || bucket
    from projects p
    where p.target_date is not null
      and p.target_date < current_date
      and p.status not in ('completed', 'cancelled')
    on conflict (dedupe_key) where dedupe_key is not null do nothing
    returning 1
  ) select count(*) into n_projects from ins;

  -- Field jobs past their scheduled end and still open.
  with ins as (
    insert into app_notifications (department, min_level, type, title, body, link, dedupe_key)
    select 'coordination', 'manage', 'overdue_job',
           'Job overdue: ' || coalesce(nullif(j.client_name, ''), j.title),
           'Scheduled to finish ' || to_char(j.scheduled_end, 'YYYY-MM-DD HH24:MI')
             || ' (status: ' || j.status || ').',
           '/coordination/jobs',
           'overdue:job:' || j.id || ':' || bucket
    from jobs j
    where j.scheduled_end is not null
      and j.scheduled_end < now()
      and j.status not in ('completed', 'cancelled')
    on conflict (dedupe_key) where dedupe_key is not null do nothing
    returning 1
  ) select count(*) into n_jobs from ins;

  -- Stock bookings past their return-needed date and not returned.
  with ins as (
    insert into app_notifications (department, min_level, type, title, body, link, dedupe_key)
    select 'stock', 'manage', 'overdue_return',
           'Stock return overdue: ' || coalesce(sp.name, 'unit'),
           'Booked out to ' || coalesce(tm.name, 'unknown')
             || ', return was needed by ' || to_char(b.return_needed_at, 'YYYY-MM-DD') || '.',
           '/stock/booked-out',
           'overdue:return:' || b.id || ':' || bucket
    from stock_bookings b
    left join stock_items si on si.id = b.item_id
    left join stock_products sp on sp.id = si.product_id
    left join team_members tm on tm.id = b.technician_id
    where b.returned_at is null
      and b.return_needed_at is not null
      and b.return_needed_at <= now()
    on conflict (dedupe_key) where dedupe_key is not null do nothing
    returning 1
  ) select count(*) into n_returns from ins;

  return jsonb_build_object(
    'projects', n_projects,
    'jobs', n_jobs,
    'returns', n_returns,
    'bucket', bucket
  );
end;
$$;

-- Only the service role (and pg_cron, as table owner) may run it.
revoke all on function public.run_overdue_sweep() from public, anon, authenticated;
grant execute on function public.run_overdue_sweep() to service_role;

-- 5. Daily schedule, if pg_cron is enabled on this database.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'cron') then
    perform cron.schedule('overdue-sweep-daily', '0 5 * * *',
                          'select public.run_overdue_sweep()');
    raise notice 'overdue-sweep-daily scheduled via pg_cron (05:00 UTC daily).';
  else
    raise notice 'pg_cron is not enabled. Enable it under Database → Extensions '
      'and re-run this DO block, or call POST /api/cron/overdue-sweep (with the '
      'CRON_SECRET header) from an external scheduler.';
  end if;
end $$;
