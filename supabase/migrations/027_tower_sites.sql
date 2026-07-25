-- Private physical tower sites nested under public coverage areas (towers table).
-- Landing page continues to use towers (areas) only; sites are dashboard-only.

create table if not exists public.tower_sites (
  id text primary key,
  area_id text not null references public.towers (id) on delete cascade,
  name text not null,
  voltage text not null default '',
  throughput_mbps numeric,
  equipment jsonb not null default '[]'::jsonb,
  maintenance_notes text not null default '',
  upgrade_plan text not null default '',
  status text not null default 'online'
    check (status in ('online', 'offline', 'maintenance')),
  updated_at timestamptz not null default now(),
  updated_by_id text references public.team_members (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists tower_sites_area_idx on public.tower_sites (area_id);

alter table public.tower_sites enable row level security;

drop policy if exists "Allow authenticated read tower_sites" on public.tower_sites;
drop policy if exists "Allow authenticated write tower_sites" on public.tower_sites;
create policy "Allow authenticated read tower_sites"
  on public.tower_sites for select to authenticated using (true);
create policy "Allow authenticated write tower_sites"
  on public.tower_sites for all to authenticated using (true) with check (true);

-- Migrate any ops data previously stored on area rows into a default site per area
insert into public.tower_sites (
  id,
  area_id,
  name,
  voltage,
  throughput_mbps,
  equipment,
  maintenance_notes,
  upgrade_plan,
  status,
  updated_at,
  updated_by_id,
  created_at
)
select
  'site-' || t.id,
  t.id,
  t.name || ' — Site 1',
  coalesce(t.voltage, ''),
  t.throughput_mbps,
  coalesce(t.equipment, '[]'::jsonb),
  coalesce(t.maintenance_notes, ''),
  coalesce(t.upgrade_plan, ''),
  'online',
  coalesce(t.updated_at, now()),
  t.updated_by_id,
  now()
from public.towers t
where
  coalesce(t.voltage, '') <> ''
  or t.throughput_mbps is not null
  or coalesce(t.maintenance_notes, '') <> ''
  or coalesce(t.upgrade_plan, '') <> ''
  or (t.equipment is not null and t.equipment <> '[]'::jsonb)
on conflict (id) do nothing;

-- Drop ops columns from public coverage areas
alter table public.towers drop column if exists voltage;
alter table public.towers drop column if exists throughput_mbps;
alter table public.towers drop column if exists equipment;
alter table public.towers drop column if exists maintenance_notes;
alter table public.towers drop column if exists upgrade_plan;

-- Jobs can reference a private site (area stays on tower_id)
alter table public.jobs
  add column if not exists tower_site_id text references public.tower_sites (id) on delete set null;

create index if not exists jobs_tower_site_idx on public.jobs (tower_site_id);
