-- Wireless network layouts: submissions, assets, layouts, devices.

create table if not exists public.network_layout_submissions (
  id text primary key,
  lead_id text references public.leads (id) on delete set null,
  notes text not null default '',
  status text not null default 'new'
    check (status in ('new', 'in_progress', 'used', 'archived')),
  created_by text references public.team_members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.network_layouts (
  id text primary key,
  lead_id text references public.leads (id) on delete set null,
  title text not null default 'Network layout',
  status text not null default 'draft'
    check (status in ('draft', 'published')),
  canvas_json jsonb not null default '{"nodes":[],"edges":[],"viewport":{"x":0,"y":0,"zoom":1}}'::jsonb,
  submission_id text references public.network_layout_submissions (id) on delete set null,
  created_by text references public.team_members (id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.network_layout_assets (
  id text primary key,
  submission_id text references public.network_layout_submissions (id) on delete cascade,
  layout_id text references public.network_layouts (id) on delete cascade,
  kind text not null default 'photo'
    check (kind in ('sketch', 'photo', 'reference')),
  storage_path text not null,
  public_url text,
  caption text not null default '',
  created_at timestamptz not null default now(),
  check (submission_id is not null or layout_id is not null)
);

create table if not exists public.network_devices (
  id text primary key,
  layout_id text not null references public.network_layouts (id) on delete cascade,
  node_id text not null,
  vendor text not null default 'ruijie',
  external_id text,
  serial_number text,
  mac_address text,
  label text not null default '',
  status text not null default 'unknown'
    check (status in ('online', 'offline', 'unknown')),
  last_seen_at timestamptz,
  manual_override boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists network_layout_submissions_lead_idx
  on public.network_layout_submissions (lead_id);
create index if not exists network_layouts_lead_idx
  on public.network_layouts (lead_id);
create index if not exists network_layouts_status_idx
  on public.network_layouts (status);
create index if not exists network_devices_layout_idx
  on public.network_devices (layout_id);
create index if not exists network_devices_external_idx
  on public.network_devices (external_id);

alter table public.network_layout_submissions enable row level security;
alter table public.network_layouts enable row level security;
alter table public.network_layout_assets enable row level security;
alter table public.network_devices enable row level security;

drop policy if exists "Allow authenticated read network_layout_submissions" on public.network_layout_submissions;
drop policy if exists "Allow authenticated write network_layout_submissions" on public.network_layout_submissions;
create policy "Allow authenticated read network_layout_submissions"
  on public.network_layout_submissions for select to authenticated using (true);
create policy "Allow authenticated write network_layout_submissions"
  on public.network_layout_submissions for all to authenticated using (true) with check (true);

drop policy if exists "Allow authenticated read network_layouts" on public.network_layouts;
drop policy if exists "Allow authenticated write network_layouts" on public.network_layouts;
create policy "Allow authenticated read network_layouts"
  on public.network_layouts for select to authenticated using (true);
create policy "Allow authenticated write network_layouts"
  on public.network_layouts for all to authenticated using (true) with check (true);

drop policy if exists "Allow authenticated read network_layout_assets" on public.network_layout_assets;
drop policy if exists "Allow authenticated write network_layout_assets" on public.network_layout_assets;
create policy "Allow authenticated read network_layout_assets"
  on public.network_layout_assets for select to authenticated using (true);
create policy "Allow authenticated write network_layout_assets"
  on public.network_layout_assets for all to authenticated using (true) with check (true);

drop policy if exists "Allow authenticated read network_devices" on public.network_devices;
drop policy if exists "Allow authenticated write network_devices" on public.network_devices;
create policy "Allow authenticated read network_devices"
  on public.network_devices for select to authenticated using (true);
create policy "Allow authenticated write network_devices"
  on public.network_devices for all to authenticated using (true) with check (true);

-- Storage bucket for sketches/photos (run via dashboard if insert fails without storage schema privileges)
insert into storage.buckets (id, name, public)
values ('wireless-assets', 'wireless-assets', true)
on conflict (id) do nothing;
