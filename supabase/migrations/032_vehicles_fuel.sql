-- Fleet vehicles + fuel usage logs.
create table if not exists public.vehicles (
  id text primary key,
  brand text not null default '',
  number_plate text not null,
  technician_id text not null references public.team_members (id) on delete restrict,
  qr_token text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (number_plate),
  unique (qr_token)
);

create index if not exists vehicles_tech_idx on public.vehicles (technician_id);
create index if not exists vehicles_active_idx on public.vehicles (active);

create table if not exists public.fuel_entries (
  id text primary key,
  vehicle_id text not null references public.vehicles (id) on delete cascade,
  technician_id text not null references public.team_members (id) on delete restrict,
  litres numeric not null check (litres > 0),
  location text not null default '',
  price numeric not null check (price >= 0),
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists fuel_entries_vehicle_idx
  on public.fuel_entries (vehicle_id, recorded_at desc);
create index if not exists fuel_entries_tech_idx
  on public.fuel_entries (technician_id, recorded_at desc);
create index if not exists fuel_entries_recorded_idx
  on public.fuel_entries (recorded_at desc);

alter table public.vehicles enable row level security;
alter table public.fuel_entries enable row level security;

drop policy if exists "Allow authenticated read vehicles" on public.vehicles;
drop policy if exists "Allow authenticated write vehicles" on public.vehicles;
create policy "Allow authenticated read vehicles"
  on public.vehicles for select to authenticated using (true);
create policy "Allow authenticated write vehicles"
  on public.vehicles for all to authenticated using (true) with check (true);

drop policy if exists "Allow authenticated read fuel_entries" on public.fuel_entries;
drop policy if exists "Allow authenticated write fuel_entries" on public.fuel_entries;
create policy "Allow authenticated read fuel_entries"
  on public.fuel_entries for select to authenticated using (true);
create policy "Allow authenticated write fuel_entries"
  on public.fuel_entries for all to authenticated using (true) with check (true);
