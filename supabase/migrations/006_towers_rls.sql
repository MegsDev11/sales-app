-- Allow CRM users to manage towers/outages (and public read for status)

alter table public.towers enable row level security;
alter table public.tower_outages enable row level security;

drop policy if exists "Allow anon read towers" on public.towers;
drop policy if exists "Allow anon write towers" on public.towers;
drop policy if exists "Allow authenticated read towers" on public.towers;
drop policy if exists "Allow authenticated write towers" on public.towers;

drop policy if exists "Allow anon read tower_outages" on public.tower_outages;
drop policy if exists "Allow anon write tower_outages" on public.tower_outages;
drop policy if exists "Allow authenticated read tower_outages" on public.tower_outages;
drop policy if exists "Allow authenticated write tower_outages" on public.tower_outages;

create policy "Allow anon read towers"
  on public.towers for select using (true);
create policy "Allow anon write towers"
  on public.towers for all using (true) with check (true);

create policy "Allow authenticated read towers"
  on public.towers for select to authenticated using (true);
create policy "Allow authenticated write towers"
  on public.towers for all to authenticated using (true) with check (true);

create policy "Allow anon read tower_outages"
  on public.tower_outages for select using (true);
create policy "Allow anon write tower_outages"
  on public.tower_outages for all using (true) with check (true);

create policy "Allow authenticated read tower_outages"
  on public.tower_outages for select to authenticated using (true);
create policy "Allow authenticated write tower_outages"
  on public.tower_outages for all to authenticated using (true) with check (true);
