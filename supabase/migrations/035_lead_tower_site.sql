-- Link sales leads to a specific tower site under a coverage area.
alter table public.leads
  add column if not exists tower_site_id text references public.tower_sites (id) on delete set null;

create index if not exists leads_tower_site_idx on public.leads (tower_site_id);
