-- Tower ops details (voltage, throughput, equipment) + job source/tower for owner work requests.

alter table public.towers
  add column if not exists voltage text not null default '',
  add column if not exists throughput_mbps numeric,
  add column if not exists equipment jsonb not null default '[]'::jsonb,
  add column if not exists maintenance_notes text not null default '',
  add column if not exists upgrade_plan text not null default '';

alter table public.jobs
  add column if not exists source text not null default 'coordination'
    check (source in ('coordination', 'owner', 'support')),
  add column if not exists tower_id text references public.towers (id) on delete set null,
  add column if not exists job_type text not null default 'general';

create index if not exists jobs_tower_idx on public.jobs (tower_id);
create index if not exists jobs_source_idx on public.jobs (source);
