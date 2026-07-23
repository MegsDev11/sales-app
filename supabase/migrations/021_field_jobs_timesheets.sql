-- Field jobs, assignments, status events, time entries, location pings.

create table if not exists public.jobs (
  id text primary key,
  lead_id text references public.leads (id) on delete set null,
  title text not null default 'Job',
  address text not null default '',
  client_name text,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'en_route', 'on_site', 'completed', 'cancelled')),
  notes text not null default '',
  stock_request_id text,
  created_by text references public.team_members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.job_assignments (
  id text primary key,
  job_id text not null references public.jobs (id) on delete cascade,
  technician_id text not null references public.team_members (id) on delete cascade,
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  unique (job_id, technician_id)
);

create table if not exists public.job_status_events (
  id text primary key,
  job_id text not null references public.jobs (id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by text references public.team_members (id) on delete set null,
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now()
);

create table if not exists public.time_entries (
  id text primary key,
  technician_id text not null references public.team_members (id) on delete cascade,
  job_id text references public.jobs (id) on delete set null,
  clock_in_at timestamptz not null,
  clock_out_at timestamptz,
  clock_in_lat double precision,
  clock_in_lng double precision,
  clock_out_lat double precision,
  clock_out_lng double precision,
  source text not null default 'mobile' check (source in ('mobile', 'manual')),
  edited_by text references public.team_members (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.location_pings (
  id text primary key,
  technician_id text not null references public.team_members (id) on delete cascade,
  time_entry_id text references public.time_entries (id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  recorded_at timestamptz not null default now()
);

create index if not exists jobs_status_idx on public.jobs (status);
create index if not exists jobs_lead_idx on public.jobs (lead_id);
create index if not exists job_assignments_tech_idx on public.job_assignments (technician_id);
create index if not exists time_entries_tech_idx on public.time_entries (technician_id, clock_in_at desc);
create index if not exists location_pings_tech_idx on public.location_pings (technician_id, recorded_at desc);

alter table public.jobs enable row level security;
alter table public.job_assignments enable row level security;
alter table public.job_status_events enable row level security;
alter table public.time_entries enable row level security;
alter table public.location_pings enable row level security;

drop policy if exists "Allow authenticated read jobs" on public.jobs;
drop policy if exists "Allow authenticated write jobs" on public.jobs;
create policy "Allow authenticated read jobs" on public.jobs for select to authenticated using (true);
create policy "Allow authenticated write jobs" on public.jobs for all to authenticated using (true) with check (true);

drop policy if exists "Allow authenticated read job_assignments" on public.job_assignments;
drop policy if exists "Allow authenticated write job_assignments" on public.job_assignments;
create policy "Allow authenticated read job_assignments" on public.job_assignments for select to authenticated using (true);
create policy "Allow authenticated write job_assignments" on public.job_assignments for all to authenticated using (true) with check (true);

drop policy if exists "Allow authenticated read job_status_events" on public.job_status_events;
drop policy if exists "Allow authenticated write job_status_events" on public.job_status_events;
create policy "Allow authenticated read job_status_events" on public.job_status_events for select to authenticated using (true);
create policy "Allow authenticated write job_status_events" on public.job_status_events for all to authenticated using (true) with check (true);

drop policy if exists "Allow authenticated read time_entries" on public.time_entries;
drop policy if exists "Allow authenticated write time_entries" on public.time_entries;
create policy "Allow authenticated read time_entries" on public.time_entries for select to authenticated using (true);
create policy "Allow authenticated write time_entries" on public.time_entries for all to authenticated using (true) with check (true);

drop policy if exists "Allow authenticated read location_pings" on public.location_pings;
drop policy if exists "Allow authenticated write location_pings" on public.location_pings;
create policy "Allow authenticated read location_pings" on public.location_pings for select to authenticated using (true);
create policy "Allow authenticated write location_pings" on public.location_pings for all to authenticated using (true) with check (true);
