-- 066_client_identity.sql — one client identity across billing, CRM and stock.
--
-- The platform carries three disconnected client identities:
--   accounts_clients — 5,434 Sage customers: invoices, balances, free-text sales_rep
--   leads            — the CRM pipeline: lead_source, assigned_to_id
--   stock_items      — free-text client_name/address/pppoe on installed devices
--
-- 051 deliberately deferred joining them ("matching 5 000 names is a separate
-- job with its own review step"). This migration adds the columns the join
-- lives in, auto-links only what is unambiguous, and leaves everything else to
-- the review screen at /accounts/linking. Nearly every Phase-2+ feature —
-- invoices per project, client QR billing info, commission auto-attribution —
-- joins through these columns.
--
-- Apply manually in the Supabase SQL editor (repo convention).

-- 1. A device points at the billing client it is installed for.
alter table public.stock_items
  add column if not exists client_id text
    references public.accounts_clients(id) on delete set null;

create index if not exists idx_stock_items_client
  on public.stock_items (client_id);

-- 2. The free-text Sage sales_rep resolves to a real staff member.
alter table public.accounts_clients
  add column if not exists sales_rep_member_id text
    references public.team_members(id) on delete set null;

create index if not exists idx_accounts_clients_rep_member
  on public.accounts_clients (sales_rep_member_id);

-- 3. Auto-link devices by exact PPPoE username — the only identifier strong
--    enough to trust without human review, and only when it matches exactly
--    one client. Name matches go to the review screen instead.
update public.stock_items si
set client_id = ac.id
from public.accounts_clients ac
where si.client_id is null
  and nullif(btrim(si.client_pppoe), '') is not null
  and lower(btrim(si.client_pppoe)) = lower(btrim(ac.pppoe_username))
  and (
    select count(*) from public.accounts_clients a2
    where lower(btrim(a2.pppoe_username)) = lower(btrim(si.client_pppoe))
  ) = 1;

-- 4. Auto-resolve sales reps where the Sage text equals exactly one staff name.
update public.accounts_clients ac
set sales_rep_member_id = tm.id
from public.team_members tm
where ac.sales_rep_member_id is null
  and nullif(btrim(ac.sales_rep), '') is not null
  and lower(btrim(ac.sales_rep)) = lower(btrim(tm.name))
  and (
    select count(*) from public.team_members t2
    where lower(btrim(t2.name)) = lower(btrim(ac.sales_rep))
  ) = 1;
