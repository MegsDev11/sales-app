-- Flag bookings that tech reported unused on a job card (needs book-back-in).
alter table public.stock_bookings
  add column if not exists return_needed_at timestamptz,
  add column if not exists return_needed_job_id text,
  add column if not exists return_needed_note text not null default '';

create index if not exists stock_bookings_return_needed_idx
  on public.stock_bookings (return_needed_at)
  where return_needed_at is not null and returned_at is null;
