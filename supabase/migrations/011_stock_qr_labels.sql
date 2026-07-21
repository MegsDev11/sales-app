-- Pending preprinted QR labels (not yet booked into inventory)
-- and transactional claim / return-by-QR helpers.

create table if not exists public.stock_qr_labels (
  id text primary key,
  batch_id text not null,
  product_id text not null references public.stock_products(id) on delete restrict,
  qr_token text not null unique,
  brand text not null default '',
  device_name text not null default '',
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  claimed_item_id text references public.stock_items(id) on delete set null
);

create index if not exists idx_stock_qr_labels_batch on public.stock_qr_labels (batch_id);
create index if not exists idx_stock_qr_labels_pending
  on public.stock_qr_labels (product_id)
  where claimed_at is null;

alter table public.stock_qr_labels enable row level security;

drop policy if exists "Allow anon read stock_qr_labels" on public.stock_qr_labels;
drop policy if exists "Allow anon write stock_qr_labels" on public.stock_qr_labels;
drop policy if exists "Allow authenticated read stock_qr_labels" on public.stock_qr_labels;
drop policy if exists "Allow authenticated write stock_qr_labels" on public.stock_qr_labels;

create policy "Allow anon read stock_qr_labels" on public.stock_qr_labels for select using (true);
create policy "Allow anon write stock_qr_labels" on public.stock_qr_labels for all using (true) with check (true);
create policy "Allow authenticated read stock_qr_labels" on public.stock_qr_labels for select to authenticated using (true);
create policy "Allow authenticated write stock_qr_labels" on public.stock_qr_labels for all to authenticated using (true) with check (true);

-- Claim a pending label into stock_items exactly once.
create or replace function public.claim_stock_qr_label(
  p_qr_token text,
  p_serial_number text default '',
  p_item_id text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_label public.stock_qr_labels%rowtype;
  v_item_id text;
  v_now timestamptz := now();
begin
  if p_qr_token is null or btrim(p_qr_token) = '' then
    return jsonb_build_object('ok', false, 'error', 'QR token required');
  end if;

  select * into v_label
  from public.stock_qr_labels
  where qr_token = btrim(p_qr_token)
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'QR label not found');
  end if;

  if v_label.claimed_at is not null then
    return jsonb_build_object('ok', false, 'error', 'This label is already booked into inventory');
  end if;

  if exists (
    select 1 from public.stock_items where qr_token = v_label.qr_token
  ) then
    return jsonb_build_object('ok', false, 'error', 'A stock unit already uses this QR token');
  end if;

  v_item_id := coalesce(nullif(btrim(p_item_id), ''), 'sitem-' || extract(epoch from v_now)::bigint || '-' || substr(md5(random()::text), 1, 6));

  insert into public.stock_items (
    id, product_id, qr_token, brand, device_name, serial_number,
    client_name, client_pppoe, wifi_name, wifi_password,
    status, created_at, updated_at
  ) values (
    v_item_id,
    v_label.product_id,
    v_label.qr_token,
    v_label.brand,
    v_label.device_name,
    coalesce(nullif(btrim(p_serial_number), ''), ''),
    '', '', '', '',
    'available',
    v_now,
    v_now
  );

  update public.stock_qr_labels
  set claimed_at = v_now,
      claimed_item_id = v_item_id
  where id = v_label.id;

  return jsonb_build_object('ok', true, 'item_id', v_item_id, 'label_id', v_label.id);
end;
$$;

-- Return a booked-out unit by QR: close open booking and mark available.
create or replace function public.return_stock_item_by_qr(p_qr_token text)
returns jsonb
language plpgsql
as $$
declare
  v_item public.stock_items%rowtype;
  v_booking_id text;
  v_now timestamptz := now();
begin
  if p_qr_token is null or btrim(p_qr_token) = '' then
    return jsonb_build_object('ok', false, 'error', 'QR token required');
  end if;

  select * into v_item
  from public.stock_items
  where qr_token = btrim(p_qr_token)
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Unit not found');
  end if;

  if v_item.status = 'available' then
    return jsonb_build_object('ok', false, 'error', 'Unit is already in inventory');
  end if;

  if v_item.status = 'retired' then
    return jsonb_build_object('ok', false, 'error', 'Retired units cannot be booked back in');
  end if;

  if v_item.status <> 'booked_out' then
    return jsonb_build_object('ok', false, 'error', 'Unit is not booked out');
  end if;

  select id into v_booking_id
  from public.stock_bookings
  where item_id = v_item.id
    and returned_at is null
  order by booked_out_at desc
  limit 1
  for update;

  if v_booking_id is not null then
    update public.stock_bookings
    set returned_at = v_now
    where id = v_booking_id;
  end if;

  update public.stock_items
  set status = 'available',
      updated_at = v_now
  where id = v_item.id;

  return jsonb_build_object(
    'ok', true,
    'item_id', v_item.id,
    'booking_id', v_booking_id
  );
end;
$$;
