-- Coordination field techs (soft-active) + in-app notifications for pick lists / shortfalls

alter table public.team_members
  add column if not exists active boolean not null default true;

create index if not exists idx_team_members_active on public.team_members (active);

create table if not exists public.app_notifications (
  id text primary key,
  user_id text references public.team_members(id) on delete cascade,
  department text check (department is null or department in ('stock', 'coordination', 'sales', 'support')),
  type text not null,
  title text not null,
  body text not null default '',
  link text not null default '',
  request_id text references public.stock_requests(id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_app_notifications_dept on public.app_notifications (department, created_at desc);
create index if not exists idx_app_notifications_user on public.app_notifications (user_id, created_at desc);
create index if not exists idx_app_notifications_unread on public.app_notifications (created_at desc) where read_at is null;

alter table public.app_notifications enable row level security;

drop policy if exists "Allow anon read app_notifications" on public.app_notifications;
drop policy if exists "Allow anon write app_notifications" on public.app_notifications;
drop policy if exists "Allow authenticated read app_notifications" on public.app_notifications;
drop policy if exists "Allow authenticated write app_notifications" on public.app_notifications;

create policy "Allow anon read app_notifications" on public.app_notifications for select using (true);
create policy "Allow anon write app_notifications" on public.app_notifications for all using (true) with check (true);
create policy "Allow authenticated read app_notifications" on public.app_notifications for select to authenticated using (true);
create policy "Allow authenticated write app_notifications" on public.app_notifications for all to authenticated using (true) with check (true);
