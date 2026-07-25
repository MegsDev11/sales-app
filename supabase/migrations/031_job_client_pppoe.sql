-- Client PPPoE on dispatched jobs.
alter table public.jobs
  add column if not exists client_pppoe text not null default '';
