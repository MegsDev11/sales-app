-- Client GPS pin on field job cards (for tech navigation).
alter table public.jobs
  add column if not exists location_lat double precision,
  add column if not exists location_lng double precision;
