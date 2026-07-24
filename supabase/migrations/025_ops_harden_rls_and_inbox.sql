-- Ops platform harden: close migration gap + remove anon write on business tables.
-- Authenticated role keeps open policies for now (API/service-role preferred for new writes).
-- Public marketing network status uses /api/network-status (service role), not anon DB writes.

-- 004 gap: inbox dismiss column used by CRM
alter table public.leads
  add column if not exists inbox_dismissed_at timestamptz;

-- Drop POC anon write policies (and broad FOR ALL that includes writes)
drop policy if exists "Allow anon write team_members" on public.team_members;
drop policy if exists "Allow anon write leads" on public.leads;
drop policy if exists "Allow anon write activities" on public.activities;
drop policy if exists "Allow anon write towers" on public.towers;
drop policy if exists "Allow anon write tower_outages" on public.tower_outages;
drop policy if exists "Allow anon write stock_products" on public.stock_products;
drop policy if exists "Allow anon write stock_items" on public.stock_items;
drop policy if exists "Allow anon write stock_bookings" on public.stock_bookings;
drop policy if exists "Allow anon write stock_requests" on public.stock_requests;
drop policy if exists "Allow anon write stock_request_lines" on public.stock_request_lines;
drop policy if exists "Allow anon write stock_qr_labels" on public.stock_qr_labels;
drop policy if exists "Allow anon write app_notifications" on public.app_notifications;

-- Ensure authenticated write policies exist where anon write was the only path
drop policy if exists "Allow authenticated write team_members" on public.team_members;
drop policy if exists "Allow authenticated write leads" on public.leads;
drop policy if exists "Allow authenticated write activities" on public.activities;
drop policy if exists "Allow authenticated write towers" on public.towers;
drop policy if exists "Allow authenticated write tower_outages" on public.tower_outages;
drop policy if exists "Allow authenticated write stock_products" on public.stock_products;
drop policy if exists "Allow authenticated write stock_items" on public.stock_items;
drop policy if exists "Allow authenticated write stock_bookings" on public.stock_bookings;
drop policy if exists "Allow authenticated write stock_requests" on public.stock_requests;
drop policy if exists "Allow authenticated write stock_request_lines" on public.stock_request_lines;
drop policy if exists "Allow authenticated write stock_qr_labels" on public.stock_qr_labels;
drop policy if exists "Allow authenticated write app_notifications" on public.app_notifications;

create policy "Allow authenticated write team_members"
  on public.team_members for all to authenticated using (true) with check (true);
create policy "Allow authenticated write leads"
  on public.leads for all to authenticated using (true) with check (true);
create policy "Allow authenticated write activities"
  on public.activities for all to authenticated using (true) with check (true);
create policy "Allow authenticated write towers"
  on public.towers for all to authenticated using (true) with check (true);
create policy "Allow authenticated write tower_outages"
  on public.tower_outages for all to authenticated using (true) with check (true);
create policy "Allow authenticated write stock_products"
  on public.stock_products for all to authenticated using (true) with check (true);
create policy "Allow authenticated write stock_items"
  on public.stock_items for all to authenticated using (true) with check (true);
create policy "Allow authenticated write stock_bookings"
  on public.stock_bookings for all to authenticated using (true) with check (true);
create policy "Allow authenticated write stock_requests"
  on public.stock_requests for all to authenticated using (true) with check (true);
create policy "Allow authenticated write stock_request_lines"
  on public.stock_request_lines for all to authenticated using (true) with check (true);
create policy "Allow authenticated write stock_qr_labels"
  on public.stock_qr_labels for all to authenticated using (true) with check (true);
create policy "Allow authenticated write app_notifications"
  on public.app_notifications for all to authenticated using (true) with check (true);

-- time_off_requests (024) enabled RLS without policies — allow authenticated staff
drop policy if exists "Allow authenticated read time_off_requests" on public.time_off_requests;
drop policy if exists "Allow authenticated write time_off_requests" on public.time_off_requests;
create policy "Allow authenticated read time_off_requests"
  on public.time_off_requests for select to authenticated using (true);
create policy "Allow authenticated write time_off_requests"
  on public.time_off_requests for all to authenticated using (true) with check (true);
