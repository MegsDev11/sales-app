-- 069_client_qr_vehicles_ppe.sql — one QR per client, vehicle custody, PPE.
--
-- Three things the QR wishes need, and one piece of security debt that has to
-- be paid before any of them ship.
--
--   1. A CLIENT-level QR. Today the token lives on stock_items, so a client
--      with a router, a CPE and a mesh unit has three unrelated QR codes, each
--      with its own PIN, and none of them can name the client — stock_items
--      only carries free text. accounts_clients gains its own token and PIN,
--      and qr_portal_sessions learns to hold a session scoped to a CLIENT
--      rather than a device (stock_item_id becomes nullable, exactly one of
--      the two scopes must be set).
--
--   2. Vehicle custody. vehicles has a permanent assigned driver and nothing
--      else — there is no way to ask who has the bakkie right now.
--      vehicle_bookings answers that, and carries the odometer at both ends so
--      the fuel tracker can finally report km/L and cost per km.
--
--   3. PPE. stock_products has no category, so a hard hat is indistinguishable
--      from a router and can only be issued through a pick list to a senior
--      technician. A category column plus the issue path in the API fixes it.
--
--   0. FIRST: the rate limiter. Portal codes are currently guarded by an
--      in-memory Map (lib/portal-auth.ts) that resets on every deploy and is
--      not shared between serverless instances — so the real attempt ceiling
--      is "8 per instance per deploy", which is not a ceiling. That was thin
--      already; it is untenable now that a correct code reveals invoices and
--      a balance. portal_auth_attempts moves the counter into the database
--      where every instance sees the same number, and adds a lockout.
--
-- Apply manually in the Supabase SQL editor (repo convention).

-- ---------------------------------------------------------------------------
-- 0. Durable rate limiting for portal codes
-- ---------------------------------------------------------------------------

create table if not exists public.portal_auth_attempts (
  key               text primary key,
  attempts          int not null default 0,
  window_started_at timestamptz not null default now(),
  locked_until      timestamptz
);

create index if not exists portal_auth_attempts_locked_idx
  on public.portal_auth_attempts (locked_until)
  where locked_until is not null;

alter table public.portal_auth_attempts enable row level security;
revoke all on public.portal_auth_attempts from anon, authenticated;
-- No policies: only the service-role portal routes touch this.

/**
 * Count one authentication attempt and say whether it may proceed.
 * Returns {allowed: bool, retryAfterSeconds: int}. Call BEFORE checking the
 * code, and call portal_clear_attempts() after a correct one.
 */
create or replace function public.portal_note_attempt(
  p_key            text,
  p_max            int default 8,
  p_window_minutes int default 15,
  p_lock_minutes   int default 15
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.portal_auth_attempts%rowtype;
  v_now timestamptz := now();
begin
  insert into portal_auth_attempts (key, attempts, window_started_at)
  values (p_key, 0, v_now)
  on conflict (key) do nothing;

  select * into v_row from portal_auth_attempts where key = p_key for update;

  if v_row.locked_until is not null and v_row.locked_until > v_now then
    return jsonb_build_object(
      'allowed', false,
      'retryAfterSeconds', ceil(extract(epoch from (v_row.locked_until - v_now)))::int
    );
  end if;

  -- A fresh window (or one that has aged out) starts the count over.
  if v_row.locked_until is not null
     or v_row.window_started_at < v_now - make_interval(mins => p_window_minutes) then
    update portal_auth_attempts
    set attempts = 1, window_started_at = v_now, locked_until = null
    where key = p_key;
    return jsonb_build_object('allowed', true, 'retryAfterSeconds', 0);
  end if;

  if v_row.attempts + 1 >= p_max then
    update portal_auth_attempts
    set attempts = v_row.attempts + 1,
        locked_until = v_now + make_interval(mins => p_lock_minutes)
    where key = p_key;
    return jsonb_build_object(
      'allowed', false,
      'retryAfterSeconds', p_lock_minutes * 60
    );
  end if;

  update portal_auth_attempts set attempts = v_row.attempts + 1 where key = p_key;
  return jsonb_build_object('allowed', true, 'retryAfterSeconds', 0);
end;
$$;

create or replace function public.portal_clear_attempts(p_key text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.portal_auth_attempts where key = p_key;
$$;

revoke all on function public.portal_note_attempt(text, int, int, int)
  from public, anon, authenticated;
revoke all on function public.portal_clear_attempts(text)
  from public, anon, authenticated;
grant execute on function public.portal_note_attempt(text, int, int, int) to service_role;
grant execute on function public.portal_clear_attempts(text) to service_role;

-- ---------------------------------------------------------------------------
-- 1. The client-level QR
-- ---------------------------------------------------------------------------

alter table public.accounts_clients
  add column if not exists qr_token text,
  -- Six digits, not the four a device PIN uses: this code reveals invoices and
  -- a balance, and it is printed once on a card rather than typed from memory.
  add column if not exists portal_pin_hash text,
  add column if not exists portal_pin_ciphertext text,
  add column if not exists portal_pin_updated_at timestamptz;

create unique index if not exists accounts_clients_qr_token_key
  on public.accounts_clients (qr_token) where qr_token is not null;

-- The portal resolves a device to its client by PPPoE; 5,434 rows is a seq
-- scan every time without this.
create index if not exists accounts_clients_pppoe_idx
  on public.accounts_clients (lower(pppoe_username))
  where pppoe_username <> '';

-- Sessions may now be scoped to a client instead of a device.
alter table public.qr_portal_sessions
  add column if not exists client_id text
    references public.accounts_clients(id) on delete cascade;

alter table public.qr_portal_sessions
  alter column stock_item_id drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'qr_portal_sessions_scope_check'
  ) then
    alter table public.qr_portal_sessions
      add constraint qr_portal_sessions_scope_check
      check (
        (stock_item_id is not null and client_id is null)
        or (stock_item_id is null and client_id is not null)
      );
  end if;
end $$;

create index if not exists qr_portal_sessions_client_idx
  on public.qr_portal_sessions (client_id) where client_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Vehicle custody + odometer
-- ---------------------------------------------------------------------------

create table if not exists public.vehicle_bookings (
  id             text primary key,
  vehicle_id     text not null references public.vehicles(id) on delete cascade,
  technician_id  text not null references public.team_members(id) on delete restrict,
  booked_out_at  timestamptz not null default now(),
  booked_out_by  text references public.team_members(id) on delete set null,
  odometer_start int,
  returned_at    timestamptz,
  odometer_end   int,
  notes          text not null default '',
  created_at     timestamptz not null default now(),
  check (odometer_end is null or odometer_start is null or odometer_end >= odometer_start)
);

create index if not exists vehicle_bookings_vehicle_idx
  on public.vehicle_bookings (vehicle_id, booked_out_at desc);
create index if not exists vehicle_bookings_tech_idx
  on public.vehicle_bookings (technician_id, booked_out_at desc);
-- One open booking per vehicle: a bakkie cannot be in two people's hands.
create unique index if not exists vehicle_bookings_open_key
  on public.vehicle_bookings (vehicle_id) where returned_at is null;

alter table public.vehicle_bookings enable row level security;
revoke all on public.vehicle_bookings from anon;

drop policy if exists vehicle_bookings_select on public.vehicle_bookings;
create policy vehicle_bookings_select on public.vehicle_bookings
  for select to authenticated
  using (
    (select public.has_module_access('stock','view'))
    or (select public.has_module_access('coordination','view'))
    or (select public.has_module_access('financial','view'))
  );

drop policy if exists vehicle_bookings_write on public.vehicle_bookings;
create policy vehicle_bookings_write on public.vehicle_bookings
  for all to authenticated
  using (
    (select public.has_module_access('stock','edit'))
    or (select public.has_module_access('coordination','edit'))
  )
  with check (
    (select public.has_module_access('stock','edit'))
    or (select public.has_module_access('coordination','edit'))
  );

-- Odometer at the pump: the number that turns litres into km/L.
alter table public.fuel_entries
  add column if not exists odometer_km int;

-- ---------------------------------------------------------------------------
-- 3. PPE as a stock category
-- ---------------------------------------------------------------------------

alter table public.stock_products
  add column if not exists category text not null default 'equipment';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'stock_products_category_check'
  ) then
    alter table public.stock_products
      add constraint stock_products_category_check
      check (category in ('equipment', 'ppe', 'tool', 'consumable'));
  end if;
end $$;

create index if not exists stock_products_category_idx
  on public.stock_products (category);

-- PPE is issued to a person, not installed at a client, so a booking needs to
-- say which. Nullable: existing bookings are all client installs.
alter table public.stock_bookings
  add column if not exists purpose text not null default 'install';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'stock_bookings_purpose_check'
  ) then
    alter table public.stock_bookings
      add constraint stock_bookings_purpose_check
      check (purpose in ('install', 'ppe', 'tool'));
  end if;
end $$;
