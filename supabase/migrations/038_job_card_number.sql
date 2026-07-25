-- Human-searchable job card numbers for coordination (JC-01001, …).
alter table public.job_card_submissions
  add column if not exists card_number text;

create unique index if not exists job_card_submissions_card_number_uidx
  on public.job_card_submissions (card_number)
  where card_number is not null;

create sequence if not exists public.job_card_number_seq start 1001;

create or replace function public.next_job_card_number()
returns text
language sql
as $$
  select 'JC-' || lpad(nextval('public.job_card_number_seq')::text, 5, '0');
$$;

grant execute on function public.next_job_card_number() to authenticated, service_role;

-- Backfill any already-submitted cards missing a number.
do $$
declare
  r record;
begin
  for r in
    select id
    from public.job_card_submissions
    where card_number is null
      and status = 'submitted'
    order by submitted_at nulls last, created_at
  loop
    update public.job_card_submissions
    set card_number = public.next_job_card_number()
    where id = r.id;
  end loop;
end $$;
