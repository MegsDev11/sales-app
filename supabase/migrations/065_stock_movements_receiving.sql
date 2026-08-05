-- 065_stock_movements_receiving.sql — the stock movement ledger, and receiving
-- that actually moves stock.
--
-- Two problems this fixes:
--
--   1. Receiving a purchase order only bumped qty_received — inventory never
--      rose, so every delivery had to be re-keyed by hand on /stock/inventory
--      and the reorder alerts kept firing on stock that was already on the
--      shelf. Now receive_po_line() updates the line, moves the stock and
--      writes the ledger in one transaction: sundry lines increment
--      stock_sundries.quantity; product (serialised) lines increment a new
--      stock_products.awaiting_intake counter, because a serialised unit only
--      becomes a stock_items row when its QR label is claimed at intake —
--      claim_stock_qr_label() now consumes that counter.
--
--   2. Nothing recorded stock history, so consumption rate, days-of-cover,
--      dead stock and cost creep (docs/OPS_PLATFORM_PLAN.md §5.2) had no data
--      to stand on. stock_movements is that ledger: signed quantities, one row
--      per event, backfilled from the existing stock_bookings history, kept
--      current by a trigger on stock_bookings so every book-out path (web,
--      mobile, return-by-QR) records itself automatically.
--
-- Apply manually in the Supabase SQL editor (repo convention).

-- ---------------------------------------------------------------------------
-- 1. The ledger
-- ---------------------------------------------------------------------------

create table if not exists public.stock_movements (
  id         uuid primary key default gen_random_uuid(),
  product_id text references public.stock_products(id) on delete set null,
  sundry_id  text references public.stock_sundries(id) on delete set null,
  item_id    text references public.stock_items(id)    on delete set null,
  movement   text not null check (movement in
               ('received','booked_out','returned','consumed',
                'written_off','adjusted','transferred')),
  qty        int not null,            -- signed: +into stock, -out of stock
  ref_type   text,                    -- 'purchase_order_line' | 'stock_booking' | 'qr_claim' | 'manual_adjust'
  ref_id     text,
  actor_id   text references public.team_members(id) on delete set null,
  note       text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_stock_movements_product
  on public.stock_movements (product_id, created_at desc);
create index if not exists idx_stock_movements_sundry
  on public.stock_movements (sundry_id, created_at desc);
create index if not exists idx_stock_movements_ref
  on public.stock_movements (ref_type, ref_id);

alter table public.stock_movements enable row level security;

-- Read for stock and procurement; writes happen server-side (service role,
-- security-definer functions and the booking trigger) so no insert policy.
drop policy if exists stock_movements_select on public.stock_movements;
create policy stock_movements_select on public.stock_movements
  for select to authenticated
  using (
    (select public.has_module_access('stock','view'))
    or (select public.has_module_access('procurement','view'))
  );

-- ---------------------------------------------------------------------------
-- 2. Received-but-not-yet-QR-claimed counter for serialised products
-- ---------------------------------------------------------------------------

alter table public.stock_products
  add column if not exists awaiting_intake int not null default 0;

-- ---------------------------------------------------------------------------
-- 3. Atomic receiving
-- ---------------------------------------------------------------------------

create or replace function public.receive_po_line(
  p_line_id text,
  p_qty     int,
  p_actor   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line    public.purchase_order_lines%rowtype;
  v_new_qty int;
  v_delta   int;
begin
  select * into v_line
  from purchase_order_lines
  where id = p_line_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Line not found');
  end if;

  v_new_qty := greatest(0, least(coalesce(p_qty, 0), v_line.qty_ordered));
  v_delta   := v_new_qty - v_line.qty_received;

  if v_delta = 0 then
    return jsonb_build_object('ok', true, 'delta', 0);
  end if;

  update purchase_order_lines
  set qty_received = v_new_qty
  where id = p_line_id;

  -- Move the stock. A negative delta is a corrected over-receipt and unwinds it.
  if v_line.sundry_id is not null then
    update stock_sundries
    set quantity = greatest(0, quantity + v_delta),
        updated_at = now()
    where id = v_line.sundry_id;
  elsif v_line.product_id is not null then
    update stock_products
    set awaiting_intake = greatest(0, awaiting_intake + v_delta)
    where id = v_line.product_id;
  end if;

  if v_line.product_id is not null or v_line.sundry_id is not null then
    insert into stock_movements
      (product_id, sundry_id, movement, qty, ref_type, ref_id, actor_id, note)
    values
      (v_line.product_id, v_line.sundry_id, 'received', v_delta,
       'purchase_order_line', p_line_id, p_actor,
       case when v_delta < 0 then 'receipt corrected' else '' end);
  end if;

  return jsonb_build_object('ok', true, 'delta', v_delta);
end;
$$;

revoke all on function public.receive_po_line(text, int, text) from public, anon, authenticated;
grant execute on function public.receive_po_line(text, int, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. QR intake consumes the awaiting counter (re-creates the 011 function)
-- ---------------------------------------------------------------------------

create or replace function public.claim_stock_qr_label(
  p_qr_token text,
  p_serial_number text default '',
  p_item_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
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

  -- If this unit was already received on a purchase order it sits in
  -- awaiting_intake and the receipt is already in the ledger; consume the
  -- counter. Otherwise this claim IS the receipt — record it.
  update public.stock_products
  set awaiting_intake = awaiting_intake - 1
  where id = v_label.product_id and awaiting_intake > 0;

  if not found then
    insert into public.stock_movements
      (product_id, item_id, movement, qty, ref_type, ref_id, note)
    values
      (v_label.product_id, v_item_id, 'received', 1, 'qr_claim', v_label.id,
       'booked into inventory without a purchase order');
  end if;

  return jsonb_build_object('ok', true, 'item_id', v_item_id, 'label_id', v_label.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Book-out / return history writes itself
-- ---------------------------------------------------------------------------

create or replace function public.log_booking_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product text;
begin
  select product_id into v_product from stock_items where id = new.item_id;

  if tg_op = 'INSERT' then
    insert into stock_movements
      (product_id, item_id, movement, qty, ref_type, ref_id, actor_id, created_at)
    values
      (v_product, new.item_id, 'booked_out', -1, 'stock_booking', new.id,
       coalesce(new.booked_out_by, new.technician_id), coalesce(new.booked_out_at, now()));
  elsif tg_op = 'UPDATE' and new.returned_at is not null and old.returned_at is null then
    insert into stock_movements
      (product_id, item_id, movement, qty, ref_type, ref_id, actor_id, created_at)
    values
      (v_product, new.item_id, 'returned', 1, 'stock_booking', new.id,
       new.technician_id, new.returned_at);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_stock_bookings_movement on public.stock_bookings;
create trigger trg_stock_bookings_movement
  after insert or update on public.stock_bookings
  for each row execute function public.log_booking_movement();

-- ---------------------------------------------------------------------------
-- 6. Backfill the ledger from booking history (idempotent)
-- ---------------------------------------------------------------------------

insert into public.stock_movements
  (product_id, item_id, movement, qty, ref_type, ref_id, actor_id, created_at)
select si.product_id, b.item_id, 'booked_out', -1, 'stock_booking', b.id,
       coalesce(b.booked_out_by, b.technician_id), b.booked_out_at
from public.stock_bookings b
join public.stock_items si on si.id = b.item_id
where not exists (
  select 1 from public.stock_movements m
  where m.ref_type = 'stock_booking' and m.ref_id = b.id and m.movement = 'booked_out'
);

insert into public.stock_movements
  (product_id, item_id, movement, qty, ref_type, ref_id, actor_id, created_at)
select si.product_id, b.item_id, 'returned', 1, 'stock_booking', b.id,
       b.technician_id, b.returned_at
from public.stock_bookings b
join public.stock_items si on si.id = b.item_id
where b.returned_at is not null
  and not exists (
    select 1 from public.stock_movements m
    where m.ref_type = 'stock_booking' and m.ref_id = b.id and m.movement = 'returned'
  );
