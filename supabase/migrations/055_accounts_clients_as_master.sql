-- 055_accounts_clients_as_master.sql
--
-- Make the Accounts client book the list every department picks from.
--
-- WHY. Coordination, Stock and Wireless all let a user attach a "client" to a job,
-- a stock request or a booking, and all of them picked from `leads` — the sales
-- pipeline. That was the only client-shaped table that existed when those screens
-- were built. It is no longer: `leads` holds 8 rows of pipeline/demo data, while
-- `accounts_clients` holds the 5 434 real customers imported from Sage. Not one
-- accounts client matches a lead by name, so the dropdowns physically could not
-- offer the people technicians are actually sent to. Worse, two of those screens
-- capped the list at 200 entries, so even the pipeline was mostly unreachable.
--
-- WHAT THIS DOES NOT DO. It does not remove `lead_id` from anything. A lead and a
-- client are genuinely different records — a lead is someone being sold to, a client
-- is someone being billed — and a job may legitimately reference either: an
-- installation for a brand-new lead, a service call for an existing client. So
-- `accounts_client_id` is added ALONGSIDE, both nullable, and existing rows keep
-- working untouched. Only one row in the entire database currently carries a
-- `lead_id`, so there is nothing to migrate and nothing to lose.
--
-- ADDRESSES. The Sage customer export carries no street address, but a technician
-- being dispatched needs one, and the coordination form used to autofill it from the
-- lead. `accounts_clients.address` is therefore added so an address captured once on
-- a job can live on the client rather than being retyped every visit. It starts
-- empty for every client and is filled in by use, which is honest: the app should not
-- invent an address it was never given.

begin;

-- ---------------------------------------------------------------------------
-- The client master gains an address
-- ---------------------------------------------------------------------------

alter table public.accounts_clients
  add column if not exists address text not null default '';

-- ---------------------------------------------------------------------------
-- Departments can reference a client
-- ---------------------------------------------------------------------------
-- `on delete set null` throughout: deleting a client must never cascade away a job
-- that was done, a booking that was made, or stock that left the shelf. The work
-- happened; only the link is lost.

alter table public.jobs
  add column if not exists accounts_client_id text
  references public.accounts_clients(id) on delete set null;

alter table public.stock_requests
  add column if not exists accounts_client_id text
  references public.accounts_clients(id) on delete set null;

-- Denormalised alongside the link, exactly as `jobs.client_name` already is: a
-- request should still say who it was for after the client row is gone, and the
-- request lists should not need a join to render a name.
alter table public.stock_requests
  add column if not exists client_name text;

alter table public.stock_bookings
  add column if not exists accounts_client_id text
  references public.accounts_clients(id) on delete set null;

create index if not exists jobs_accounts_client_idx
  on public.jobs (accounts_client_id);
create index if not exists stock_requests_accounts_client_idx
  on public.stock_requests (accounts_client_id);
create index if not exists stock_bookings_accounts_client_idx
  on public.stock_bookings (accounts_client_id);

-- ---------------------------------------------------------------------------
-- Cross-department read access to the client directory
-- ---------------------------------------------------------------------------
-- Coordination and Stock users need to SEARCH clients without being given the
-- Accounts module, which carries balances and billing. Rather than widening the
-- table's own policy, a narrow view exposes only the directory fields — name,
-- contact details, address, PPPoE — and never balance, package price, payment
-- method or account status.

create or replace view public.client_directory as
select
  c.id,
  c.name,
  c.contact_name,
  c.email,
  c.tel,
  c.mobile,
  c.address,
  c.pppoe_username,
  c.billing_status,
  c.lead_id
from public.accounts_clients c;

-- security_invoker = off (the default for views) would run this as the view's owner
-- and bypass the base table's RLS. That is exactly what is wanted here — the view IS
-- the narrower permission — but it must then be granted deliberately.
grant select on public.client_directory to authenticated;

commit;
