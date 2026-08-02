-- 051_accounts_clients.sql
--
-- The Accounts department's client book.
--
-- Until now the master client list lived only in Sage, exported as "Megs Kliente lys"
-- — 5 434 rows keyed by customer name. This migration gives that list a home so the
-- department can work from it directly, and so the monthly invoice run has something
-- to bill.
--
-- THE `Staff` COLUMN. The Sage export carries one free-text column called `Staff`
-- which encodes three unrelated facts at once:
--
--     "1ST DEBIT ORDER"   a billing arrangement  -> debit_order_day = 1
--     "Leane"             the owning clerk       -> accounts_owner  = 'Leané van Deventer'
--     "Cancelled"         an account status      -> billing_status  = 'cancelled'
--
-- Nothing can be automated while those are one string: you cannot bill "everyone
-- active" when `active` is only knowable by reading English. The importer therefore
-- splits it into three real columns and keeps the original verbatim in `staff_raw`.
-- The split is a derivation, never a replacement — `staff_raw` is what Sage said, and
-- it is never overwritten by a human edit.
--
-- BILLING IS OPT-IN, NOT OPT-OUT. `billing_status` starts at 'unclassified' and only
-- a positively recognised value moves it elsewhere. Of the 39 distinct `Staff` values
-- in the real export, 35 are recognised; the remaining 47 rows stay unclassified and
-- are never invoiced until a person says otherwise. Billing a cancelled client is a
-- refund and an apology; missing one is a phone call.
--
-- SAGE REMAINS THE LEDGER, FOR NOW. `balance` is a snapshot taken at import, not a
-- running account — it is there so the department can see who owes what on the day
-- the file was pulled. Nothing in this schema posts transactions.
--
-- Conventions follow 047_procurement.sql / 049_commission.sql: text primary keys with
-- application-generated ids, RLS via has_module_access(), and each import kept as its
-- own immutable snapshot.

begin;

-- ---------------------------------------------------------------------------
-- Import snapshots
-- ---------------------------------------------------------------------------
-- Every upload is recorded, so "why did this client's package change?" is always
-- answerable, and so a bad export can be identified and re-run rather than guessed at.

create table if not exists public.accounts_client_imports (
  id              text primary key,
  source_filename text not null default '',
  rows_read       int  not null default 0,
  clients_created int  not null default 0,
  clients_updated int  not null default 0,
  -- Counts straight off the parse, kept so the import screen can be re-read later.
  billable_count  int  not null default 0,
  needs_review_count int not null default 0,
  total_owing     numeric(14,2) not null default 0,
  total_credit    numeric(14,2) not null default 0,
  summary         jsonb not null default '{}'::jsonb,
  notes           text not null default '',
  imported_by     text references public.team_members(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists accounts_client_imports_created_idx
  on public.accounts_client_imports (created_at desc);

-- ---------------------------------------------------------------------------
-- Clients
-- ---------------------------------------------------------------------------

create table if not exists public.accounts_clients (
  id            text primary key,

  -- Sage keys customers by name and the export contains no duplicates, so name is
  -- the natural key that re-imports match on. Enforced case-insensitively below.
  name          text not null,

  -- --- derived from `Staff`, with the original always kept ---
  staff_raw     text not null default '',
  billing_status text not null default 'unclassified',
  -- Day of month the debit order runs. Null when the client is not on one.
  debit_order_day int,
  -- The accounts clerk who owns this client. Signs their invoice emails.
  accounts_owner  text,
  -- Billed only part of the year (Sage writes these as "…-SEASONAL USER").
  seasonal        boolean not null default false,

  -- --- contact ---
  contact_name  text not null default '',
  tel           text not null default '',
  mobile        text not null default '',
  -- First deliverable address; `emails` holds every address found, because some
  -- clients are billed to an owner and a bookkeeper at once.
  email         text not null default '',
  emails        text[] not null default '{}',
  -- The Email cell verbatim when it held something that was not an address — five
  -- rows in the real export contain a phone number here.
  email_raw     text not null default '',

  -- --- service ---
  sales_rep     text not null default '',
  pppoe_username text not null default '',
  package_raw   text not null default '',
  package_speed_mbps numeric(10,2),
  -- Monthly price as quoted to the client, VAT inclusive. NULL means "we do not know
  -- what this client pays" — which must block an invoice rather than default to zero.
  package_price_incl numeric(14,2),

  -- --- money ---
  -- Sage's balance at the moment of export. Positive = the client owes MEGS.
  balance       numeric(14,2) not null default 0,
  balance_as_at timestamptz,

  -- --- links and housekeeping ---
  -- Optional link to the CRM lead this client came from. Left null by the importer;
  -- matching 5 000 names is a separate job with its own review step.
  lead_id       text references public.leads(id) on delete set null,
  needs_review  boolean not null default false,
  -- Per-row parse problems: [{kind, detail}]. Cleared when a person fixes the row.
  issues        jsonb not null default '[]'::jsonb,

  import_id     text references public.accounts_client_imports(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Case-insensitive uniqueness: "ABC Farms" and "abc farms" are one customer, and a
-- re-import must update rather than duplicate.
create unique index if not exists accounts_clients_name_key
  on public.accounts_clients (lower(name));

create index if not exists accounts_clients_status_idx
  on public.accounts_clients (billing_status);
create index if not exists accounts_clients_owner_idx
  on public.accounts_clients (accounts_owner);
create index if not exists accounts_clients_debit_day_idx
  on public.accounts_clients (debit_order_day);
create index if not exists accounts_clients_lead_idx
  on public.accounts_clients (lead_id);
create index if not exists accounts_clients_review_idx
  on public.accounts_clients (needs_review) where needs_review;
-- The client list is searched by name far more than anything else.
create index if not exists accounts_clients_name_trgm_idx
  on public.accounts_clients (lower(name) text_pattern_ops);

-- Statuses are a closed vocabulary, mirrored in lib/accounts/constants.ts. A typo in
-- application code must fail here rather than quietly create an unbillable status.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'accounts_clients_billing_status_check'
  ) then
    alter table public.accounts_clients
      add constraint accounts_clients_billing_status_check
      check (billing_status in (
        'active', 'cancelled', 'temp_cancelled', 'quote_only', 'red_client',
        'one_time', 'sponsored', 'duplicate', 'deceased', 'internal', 'unclassified'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'accounts_clients_debit_day_check'
  ) then
    alter table public.accounts_clients
      add constraint accounts_clients_debit_day_check
      check (debit_order_day is null or (debit_order_day between 1 and 31));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

create or replace function public.touch_accounts_clients()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists accounts_clients_touch on public.accounts_clients;
create trigger accounts_clients_touch
  before update on public.accounts_clients
  for each row execute function public.touch_accounts_clients();

-- ---------------------------------------------------------------------------
-- Module registration
-- ---------------------------------------------------------------------------
-- `accounts` already exists as a placeholder module; this makes sure the row is
-- present and active for installs where it was never seeded.

insert into public.modules (key, label, description, icon, group_name, root_path, sort_order, is_core)
values ('accounts', 'Accounts', 'Client book, billing and monthly invoicing', 'BookUser', 'commercial', '/accounts', 30, false)
on conflict (key) do update
  set label       = excluded.label,
      description = excluded.description,
      root_path   = excluded.root_path,
      active      = true;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Client contact details and balances are commercially sensitive but are ordinary
-- departmental data, so `view` reads and `edit` writes — unlike commission, which is
-- pay data and requires `manage`.

do $$
declare t text;
begin
  foreach t in array array['accounts_clients', 'accounts_client_imports'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);

    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using ((select public.has_module_access(''accounts'',''view'')))',
      t || '_select', t);

    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using ((select public.has_module_access(''accounts'',''edit'')))
         with check ((select public.has_module_access(''accounts'',''edit'')))',
      t || '_write', t);
  end loop;
end $$;

commit;
