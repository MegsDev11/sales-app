-- Support department + tower/outage management

-- Extend department enum
alter table public.team_members drop constraint if exists team_members_department_check;
alter table public.team_members
  add constraint team_members_department_check
  check (department in ('sales', 'stock', 'coordination', 'support'));

-- Towers
create table if not exists public.towers (
  id text primary key,
  name text not null,
  service_areas text[] not null default '{}',
  status text not null default 'online' check (status in ('online', 'offline', 'maintenance')),
  updated_at timestamptz not null default now(),
  updated_by_id text references public.team_members(id) on delete set null
);

-- Tower outages (public-facing when is_public and resolved_at is null)
create table if not exists public.tower_outages (
  id text primary key,
  tower_id text not null references public.towers(id) on delete cascade,
  title text not null,
  message text not null default '',
  affected_areas text[] not null default '{}',
  started_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_by_id text references public.team_members(id) on delete set null,
  is_public boolean not null default true
);

create index if not exists idx_tower_outages_active
  on public.tower_outages (tower_id)
  where resolved_at is null;

-- Link leads/clients to towers
alter table public.leads
  add column if not exists tower_id text references public.towers(id) on delete set null;

create index if not exists idx_leads_tower_id on public.leads (tower_id);

-- Seed starter towers (Waterberg coverage areas)
insert into public.towers (id, name, service_areas, status) values
  ('tower-modimolle', 'Modimolle', array['Modimolle', 'Naboom', 'Settlers'], 'online'),
  ('tower-bela-bela', 'Bela-Bela', array['Bela-Bela', 'Alma'], 'online'),
  ('tower-pienaars', 'Pienaars Rivier', array['Pienaars Rivier', 'Rust de Winter'], 'online'),
  ('tower-melkrivier', 'Melkrivier', array['Melkrivier', 'Overyssel', 'Marken'], 'online'),
  ('tower-vaalwater', 'Vaalwater', array['Vaalwater', 'Ellisras'], 'online'),
  ('tower-modimolle-fibre', 'Modimolle Fibre', array['Modimolle', 'Kokanje', 'Bosveldsig', 'Die Oog'], 'online')
on conflict (id) do nothing;
