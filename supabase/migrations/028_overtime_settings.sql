-- Overtime policy for field timesheets (single active company row).
create table if not exists public.ot_settings (
  id text primary key default 'default',
  mode text not null default 'daily'
    check (mode in ('daily', 'weekly', 'both')),
  daily_threshold_minutes integer not null default 480
    check (daily_threshold_minutes >= 0),
  weekly_threshold_minutes integer not null default 2400
    check (weekly_threshold_minutes >= 0),
  weekend_as_ot boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by text references public.team_members (id) on delete set null
);

insert into public.ot_settings (id, mode, daily_threshold_minutes, weekly_threshold_minutes, weekend_as_ot)
values ('default', 'daily', 480, 2400, false)
on conflict (id) do nothing;

alter table public.ot_settings enable row level security;

drop policy if exists "Allow authenticated read ot_settings" on public.ot_settings;
drop policy if exists "Allow authenticated write ot_settings" on public.ot_settings;
create policy "Allow authenticated read ot_settings"
  on public.ot_settings for select to authenticated using (true);
create policy "Allow authenticated write ot_settings"
  on public.ot_settings for all to authenticated using (true) with check (true);
