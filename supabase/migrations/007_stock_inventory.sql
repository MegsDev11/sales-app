-- Stock inventory: products, units with QR tokens, bookings, coordination requests

create table if not exists public.stock_products (
  id text primary key,
  name text not null,
  sku text not null default '',
  brand_default text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.stock_items (
  id text primary key,
  product_id text not null references public.stock_products(id) on delete cascade,
  qr_token text not null unique,
  brand text not null default '',
  device_name text not null default '',
  serial_number text not null default '',
  status text not null default 'available'
    check (status in ('available', 'booked_out', 'retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_stock_items_product on public.stock_items (product_id);
create index if not exists idx_stock_items_status on public.stock_items (status);
create index if not exists idx_stock_items_qr on public.stock_items (qr_token);

create table if not exists public.stock_requests (
  id text primary key,
  title text not null,
  technician_id text not null references public.team_members(id) on delete restrict,
  lead_id text references public.leads(id) on delete set null,
  status text not null default 'open'
    check (status in ('open', 'partial', 'fulfilled', 'cancelled')),
  created_by text references public.team_members(id) on delete set null,
  created_at timestamptz not null default now(),
  notes text not null default ''
);

create table if not exists public.stock_request_lines (
  id text primary key,
  request_id text not null references public.stock_requests(id) on delete cascade,
  product_id text not null references public.stock_products(id) on delete restrict,
  qty_needed integer not null default 1 check (qty_needed > 0),
  qty_fulfilled integer not null default 0 check (qty_fulfilled >= 0)
);

create index if not exists idx_stock_request_lines_request on public.stock_request_lines (request_id);

create table if not exists public.stock_bookings (
  id text primary key,
  item_id text not null references public.stock_items(id) on delete cascade,
  technician_id text not null references public.team_members(id) on delete restrict,
  lead_id text references public.leads(id) on delete set null,
  request_id text references public.stock_requests(id) on delete set null,
  booked_out_at timestamptz not null default now(),
  booked_out_by text references public.team_members(id) on delete set null,
  returned_at timestamptz,
  notes text not null default ''
);

create index if not exists idx_stock_bookings_item on public.stock_bookings (item_id);
create index if not exists idx_stock_bookings_open on public.stock_bookings (item_id) where returned_at is null;

-- Seed starter products
insert into public.stock_products (id, name, sku, brand_default, notes) values
  ('prod-lhg', 'LHG', 'LHG', 'MikroTik', 'Wireless CPE antenna'),
  ('prod-router', 'Router', 'RTR', 'MikroTik', 'Customer premise router')
on conflict (id) do nothing;

-- RLS (service role bypasses; policies for authenticated/anon like other CRM tables)
alter table public.stock_products enable row level security;
alter table public.stock_items enable row level security;
alter table public.stock_bookings enable row level security;
alter table public.stock_requests enable row level security;
alter table public.stock_request_lines enable row level security;

drop policy if exists "Allow anon read stock_products" on public.stock_products;
drop policy if exists "Allow anon write stock_products" on public.stock_products;
drop policy if exists "Allow authenticated read stock_products" on public.stock_products;
drop policy if exists "Allow authenticated write stock_products" on public.stock_products;

create policy "Allow anon read stock_products" on public.stock_products for select using (true);
create policy "Allow anon write stock_products" on public.stock_products for all using (true) with check (true);
create policy "Allow authenticated read stock_products" on public.stock_products for select to authenticated using (true);
create policy "Allow authenticated write stock_products" on public.stock_products for all to authenticated using (true) with check (true);

drop policy if exists "Allow anon read stock_items" on public.stock_items;
drop policy if exists "Allow anon write stock_items" on public.stock_items;
drop policy if exists "Allow authenticated read stock_items" on public.stock_items;
drop policy if exists "Allow authenticated write stock_items" on public.stock_items;

create policy "Allow anon read stock_items" on public.stock_items for select using (true);
create policy "Allow anon write stock_items" on public.stock_items for all using (true) with check (true);
create policy "Allow authenticated read stock_items" on public.stock_items for select to authenticated using (true);
create policy "Allow authenticated write stock_items" on public.stock_items for all to authenticated using (true) with check (true);

drop policy if exists "Allow anon read stock_bookings" on public.stock_bookings;
drop policy if exists "Allow anon write stock_bookings" on public.stock_bookings;
drop policy if exists "Allow authenticated read stock_bookings" on public.stock_bookings;
drop policy if exists "Allow authenticated write stock_bookings" on public.stock_bookings;

create policy "Allow anon read stock_bookings" on public.stock_bookings for select using (true);
create policy "Allow anon write stock_bookings" on public.stock_bookings for all using (true) with check (true);
create policy "Allow authenticated read stock_bookings" on public.stock_bookings for select to authenticated using (true);
create policy "Allow authenticated write stock_bookings" on public.stock_bookings for all to authenticated using (true) with check (true);

drop policy if exists "Allow anon read stock_requests" on public.stock_requests;
drop policy if exists "Allow anon write stock_requests" on public.stock_requests;
drop policy if exists "Allow authenticated read stock_requests" on public.stock_requests;
drop policy if exists "Allow authenticated write stock_requests" on public.stock_requests;

create policy "Allow anon read stock_requests" on public.stock_requests for select using (true);
create policy "Allow anon write stock_requests" on public.stock_requests for all using (true) with check (true);
create policy "Allow authenticated read stock_requests" on public.stock_requests for select to authenticated using (true);
create policy "Allow authenticated write stock_requests" on public.stock_requests for all to authenticated using (true) with check (true);

drop policy if exists "Allow anon read stock_request_lines" on public.stock_request_lines;
drop policy if exists "Allow anon write stock_request_lines" on public.stock_request_lines;
drop policy if exists "Allow authenticated read stock_request_lines" on public.stock_request_lines;
drop policy if exists "Allow authenticated write stock_request_lines" on public.stock_request_lines;

create policy "Allow anon read stock_request_lines" on public.stock_request_lines for select using (true);
create policy "Allow anon write stock_request_lines" on public.stock_request_lines for all using (true) with check (true);
create policy "Allow authenticated read stock_request_lines" on public.stock_request_lines for select to authenticated using (true);
create policy "Allow authenticated write stock_request_lines" on public.stock_request_lines for all to authenticated using (true) with check (true);
