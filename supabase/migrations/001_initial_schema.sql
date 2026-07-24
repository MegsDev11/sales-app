-- MEGS Sales CRM initial schema
-- Run this in Supabase Dashboard → SQL Editor

create table if not exists public.team_members (
  id text primary key,
  name text not null,
  role text not null check (role in ('admin', 'sales')),
  color text not null,
  avatar_initials text not null,
  title text not null,
  monthly_revenue_target numeric not null default 100000,
  monthly_deals_target integer not null default 5
);

create table if not exists public.leads (
  id text primary key,
  client_name text not null,
  company text,
  phone text not null default '',
  email text not null default '',
  service_type text not null default 'fiber',
  package_tier text not null default '',
  assigned_to_id text references public.team_members (id) on delete set null,
  stage text not null default 'new_lead',
  current_activity text not null default 'call',
  priority text not null default 'medium',
  created_at timestamptz not null default now(),
  stage_entered_at timestamptz not null default now(),
  closed_at timestamptz,
  deal_value numeric,
  discount numeric default 0,
  lead_source text not null default 'website',
  address text,
  notes text,
  deleted boolean not null default false,
  next_follow_up_at timestamptz,
  next_action text,
  coverage_status text not null default 'pending_survey',
  service_zone text not null default 'Pretoria North',
  site_survey_date timestamptz,
  site_survey_notes text,
  lost_reason text,
  installation_status text,
  installation_date timestamptz,
  temperature text not null default 'warm',
  stage_history jsonb not null default '[]'::jsonb
);

create table if not exists public.activities (
  id text primary key,
  lead_id text not null references public.leads (id) on delete cascade,
  type text not null,
  title text not null,
  created_at timestamptz not null default now()
);

create index if not exists leads_assigned_to_id_idx on public.leads (assigned_to_id);
create index if not exists leads_stage_idx on public.leads (stage);
create index if not exists leads_deleted_idx on public.leads (deleted);
create index if not exists activities_lead_id_idx on public.activities (lead_id);
create index if not exists activities_created_at_idx on public.activities (created_at desc);

alter table public.team_members enable row level security;
alter table public.leads enable row level security;
alter table public.activities enable row level security;

-- POC policies: open access for anon key (replace with real auth policies later)
drop policy if exists "Allow anon read team_members" on public.team_members;
drop policy if exists "Allow anon write team_members" on public.team_members;
drop policy if exists "Allow anon read leads" on public.leads;
drop policy if exists "Allow anon write leads" on public.leads;
drop policy if exists "Allow anon read activities" on public.activities;
drop policy if exists "Allow anon write activities" on public.activities;

create policy "Allow anon read team_members"
  on public.team_members for select to anon using (true);
create policy "Allow anon write team_members"
  on public.team_members for all to anon using (true) with check (true);

create policy "Allow anon read leads"
  on public.leads for select to anon using (true);
create policy "Allow anon write leads"
  on public.leads for all to anon using (true) with check (true);

create policy "Allow anon read activities"
  on public.activities for select to anon using (true);
create policy "Allow anon write activities"
  on public.activities for all to anon using (true) with check (true);

-- Also allow authenticated role (new publishable keys)
drop policy if exists "Allow authenticated read team_members" on public.team_members;
drop policy if exists "Allow authenticated write team_members" on public.team_members;
drop policy if exists "Allow authenticated read leads" on public.leads;
drop policy if exists "Allow authenticated write leads" on public.leads;
drop policy if exists "Allow authenticated read activities" on public.activities;
drop policy if exists "Allow authenticated write activities" on public.activities;

create policy "Allow authenticated read team_members"
  on public.team_members for select to authenticated using (true);
create policy "Allow authenticated write team_members"
  on public.team_members for all to authenticated using (true) with check (true);
create policy "Allow authenticated read leads"
  on public.leads for select to authenticated using (true);
create policy "Allow authenticated write leads"
  on public.leads for all to authenticated using (true) with check (true);
create policy "Allow authenticated read activities"
  on public.activities for select to authenticated using (true);
create policy "Allow authenticated write activities"
  on public.activities for all to authenticated using (true) with check (true);

-- Enable realtime (ignore if already added)
do $$
begin
  alter publication supabase_realtime add table public.team_members;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.leads;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.activities;
exception when duplicate_object then null;
end $$;
