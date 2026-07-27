-- 047_procurement.sql
--
-- Procurement: suppliers, purchase orders, and reorder points.
--
-- This is Phase 4 of docs/OPS_PLATFORM_PLAN.md, trimmed to the parts that stand on
-- their own without the stock-movement ledger or the AI layer:
--
--   * suppliers            — who we buy from, with lead times used by reorder logic
--   * purchase_orders      — draft -> ordered -> (partially) received -> done, + cancel
--   * purchase_order_lines — what is on each PO, optionally tied to a product/sundry
--   * reorder points       — added to stock_products AND stock_sundries so the overview
--                            can flag "on hand at or below the point" for both the
--                            serialized items (counted from stock_items) and the
--                            quantity-tracked sundries.
--
-- Follows the projects module (046) conventions exactly: text primary keys with
-- application-generated ids, RLS via has_module_access('procurement', …), a code
-- sequence for human-facing numbers, and a trigger that keeps the PO money columns
-- correct no matter who writes the lines.

begin;

-- ---------------------------------------------------------------------------
-- Module registration (idempotent — 040 already inserted this row)
-- ---------------------------------------------------------------------------

insert into public.modules (key, label, description, icon, group_name, root_path, sort_order, is_core)
values ('procurement', 'Procurement', 'Suppliers, purchase orders, reorder alerts',
        'ShoppingCart', 'operations', '/procurement', 70, false)
on conflict (key) do update set
  label = excluded.label, description = excluded.description, icon = excluded.icon,
  group_name = excluded.group_name, root_path = excluded.root_path;

-- ---------------------------------------------------------------------------
-- Suppliers
-- ---------------------------------------------------------------------------

create table if not exists public.suppliers (
  id            text primary key,
  name          text not null,
  contact_name  text not null default '',
  email         text not null default '',
  phone         text not null default '',
  website       text not null default '',
  address       text not null default '',
  lead_time_days int  not null default 7,
  payment_terms text not null default '',
  category      text not null default '',   -- e.g. hardware | cabling | fibre | services
  active        boolean not null default true,
  notes         text not null default '',
  created_by    text references public.team_members(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists suppliers_active_idx on public.suppliers (active);
create index if not exists suppliers_name_idx   on public.suppliers (lower(name));

-- ---------------------------------------------------------------------------
-- Reorder points on the things we actually stock
-- ---------------------------------------------------------------------------
-- Products are serialized (on-hand = count of available stock_items); sundries carry
-- their own quantity column. Both get the same four planning columns so the reorder
-- view can treat them uniformly.

alter table public.stock_products
  add column if not exists reorder_point int not null default 0,
  add column if not exists reorder_qty   int not null default 0,
  add column if not exists unit_cost     numeric(12,2),
  add column if not exists preferred_supplier_id text references public.suppliers(id) on delete set null;

alter table public.stock_sundries
  add column if not exists reorder_point int not null default 0,
  add column if not exists reorder_qty   int not null default 0,
  add column if not exists unit_cost     numeric(12,2),
  add column if not exists preferred_supplier_id text references public.suppliers(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Purchase orders
-- ---------------------------------------------------------------------------

create table if not exists public.purchase_orders (
  id           text primary key,
  po_number    text unique not null,            -- PO-0042
  supplier_id  text not null references public.suppliers(id) on delete restrict,
  status       text not null default 'draft'
                 check (status in ('draft','ordered','partially_received','received','cancelled')),
  currency     text not null default 'ZAR',
  vat_rate     numeric(5,4) not null default 0.15,  -- SA standard rate
  subtotal     numeric(14,2) not null default 0,
  vat          numeric(14,2) not null default 0,
  total        numeric(14,2) not null default 0,
  expected_at  date,
  ordered_at   timestamptz,
  received_at  timestamptz,
  notes        text not null default '',
  created_by   text references public.team_members(id) on delete set null,
  approved_by  text references public.team_members(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists purchase_orders_supplier_idx on public.purchase_orders (supplier_id);
create index if not exists purchase_orders_status_idx   on public.purchase_orders (status);

create table if not exists public.purchase_order_lines (
  id           text primary key,
  po_id        text not null references public.purchase_orders(id) on delete cascade,
  product_id   text references public.stock_products(id) on delete set null,
  sundry_id    text references public.stock_sundries(id) on delete set null,
  description  text not null default '',
  qty_ordered  int not null default 1 check (qty_ordered > 0),
  qty_received int not null default 0 check (qty_received >= 0),
  unit_price   numeric(12,2) not null default 0,
  order_index  int not null default 0
);
create index if not exists purchase_order_lines_po_idx on public.purchase_order_lines (po_id, order_index);

-- ---------------------------------------------------------------------------
-- PO number sequence (PO-0001, PO-0002, …)
-- ---------------------------------------------------------------------------

create sequence if not exists public.po_number_seq start 1;

create or replace function public.next_po_number()
returns text language sql volatile security definer set search_path = public as $$
  select 'PO-' || lpad(nextval('public.po_number_seq')::text, 4, '0');
$$;
grant execute on function public.next_po_number() to authenticated;

-- ---------------------------------------------------------------------------
-- Keep PO money columns in step with the lines
-- ---------------------------------------------------------------------------
-- A trigger rather than application code: the totals are then correct no matter which
-- route, script or manual fix touched the lines.

create or replace function public.sync_purchase_order_totals()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  target text := coalesce(new.po_id, old.po_id);
  s numeric(14,2);
  r numeric(5,4);
begin
  select coalesce(sum(qty_ordered * unit_price), 0) into s
    from public.purchase_order_lines where po_id = target;
  select vat_rate into r from public.purchase_orders where id = target;
  r := coalesce(r, 0.15);
  update public.purchase_orders
     set subtotal = s,
         vat      = round(s * r, 2),
         total    = round(s * (1 + r), 2),
         updated_at = now()
   where id = target;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_po_totals on public.purchase_order_lines;
create trigger trg_sync_po_totals
  after insert or update or delete on public.purchase_order_lines
  for each row execute function public.sync_purchase_order_totals();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['suppliers','purchase_orders','purchase_order_lines'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Suppliers: read at view, write at edit, delete at manage.
drop policy if exists suppliers_select on public.suppliers;
create policy suppliers_select on public.suppliers
  for select to authenticated using ((select public.has_module_access('procurement','view')));

drop policy if exists suppliers_write on public.suppliers;
create policy suppliers_write on public.suppliers
  for all to authenticated
  using ((select public.has_module_access('procurement','edit')))
  with check ((select public.has_module_access('procurement','edit')));

-- Purchase orders + lines: same shape.
drop policy if exists purchase_orders_select on public.purchase_orders;
create policy purchase_orders_select on public.purchase_orders
  for select to authenticated using ((select public.has_module_access('procurement','view')));

drop policy if exists purchase_orders_write on public.purchase_orders;
create policy purchase_orders_write on public.purchase_orders
  for all to authenticated
  using ((select public.has_module_access('procurement','edit')))
  with check ((select public.has_module_access('procurement','edit')));

drop policy if exists purchase_order_lines_select on public.purchase_order_lines;
create policy purchase_order_lines_select on public.purchase_order_lines
  for select to authenticated using ((select public.has_module_access('procurement','view')));

drop policy if exists purchase_order_lines_write on public.purchase_order_lines;
create policy purchase_order_lines_write on public.purchase_order_lines
  for all to authenticated
  using ((select public.has_module_access('procurement','edit')))
  with check ((select public.has_module_access('procurement','edit')));

-- ---------------------------------------------------------------------------
-- Grants: everyone who can already touch stock gets procurement at the same level
-- ---------------------------------------------------------------------------
-- Procurement is the buying side of stock; the people who manage inventory are the
-- ones who reorder it. Owners keep implicit full access via their role.

insert into public.user_module_access (user_id, module_key, level, granted_at)
select uma.user_id, 'procurement', uma.level, now()
from public.user_module_access uma
where uma.module_key = 'stock'
on conflict (user_id, module_key) do nothing;

commit;
