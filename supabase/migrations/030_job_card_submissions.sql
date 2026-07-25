-- Technician job card submissions (risk assessment + technical form).
create table if not exists public.job_card_submissions (
  id text primary key,
  job_id text not null references public.jobs (id) on delete cascade,
  technician_id text not null references public.team_members (id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  payload jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, technician_id)
);

create index if not exists job_card_submissions_job_idx
  on public.job_card_submissions (job_id);
create index if not exists job_card_submissions_tech_idx
  on public.job_card_submissions (technician_id, updated_at desc);

alter table public.job_card_submissions enable row level security;

drop policy if exists "Allow authenticated read job_card_submissions" on public.job_card_submissions;
drop policy if exists "Allow authenticated write job_card_submissions" on public.job_card_submissions;
create policy "Allow authenticated read job_card_submissions"
  on public.job_card_submissions for select to authenticated using (true);
create policy "Allow authenticated write job_card_submissions"
  on public.job_card_submissions for all to authenticated using (true) with check (true);
