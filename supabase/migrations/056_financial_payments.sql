-- 056_financial_payments.sql
--
-- Money in: bank statements, receipts, and allocation against client invoices.
--
-- Depends on 051 (accounts_clients), 053 (accounts_invoices) and 054
-- (accounts_transactions). Apply those first.
--
-- WHY THIS LIVES UNDER `financial` AND NOT `accounts`. The department split is that
-- Accounts owns the client relationship and raises the invoice; Finance owns the
-- money. So a receipt is a Finance record — but the moment it is captured it must
-- also appear on the client's statement, which is an Accounts document. It therefore
-- POSTS INTO the AR sub-ledger (`accounts_transactions`) rather than being duplicated
-- there. One receipt, one ledger entry, two departments reading it through their own
-- module's permissions.
--
-- WHY THE BANK LINE AND THE RECEIPT ARE SEPARATE TABLES. Most lines on a bank
-- statement are not client receipts — they are supplier payments, salaries, bank
-- charges, transfers. Collapsing the two would mean either inventing a client for
-- every bank charge or filtering statements down to what we can already explain.
-- `financial_bank_transactions` is the bank's version of events, imported verbatim
-- and never edited; `financial_receipts` is our interpretation of the ones that were
-- client money. Phases 2 and 3 hang supplier payments and the general ledger off the
-- same bank lines.
--
-- SIGN CONVENTION: `amount` is positive for money INTO the account and negative for
-- money out, regardless of how the bank's export labelled its columns. A statement
-- with separate Debit/Credit columns is normalised to this on import, so downstream
-- code never has to ask which bank produced the file.
--
-- DEDUPLICATION IS THE WHOLE BALL GAME. Bank exports overlap: pull "last 60 days"
-- twice a month and most rows arrive again. Importing a receipt twice tells a client
-- they have paid when they have not, and shows the business cash it does not have.
-- Every line therefore carries a deterministic `fingerprint`, unique per bank account.
-- Critically, the fingerprint includes an occurrence index: two clients paying R299
-- on the same day with the identical narration "DEBIT ORDER" are two real payments,
-- not a duplicate, so the second is fingerprinted as occurrence 2 rather than
-- discarded. See lib/financial/parse-statement.ts.

begin;

-- ---------------------------------------------------------------------------
-- Bank accounts
-- ---------------------------------------------------------------------------

create table if not exists public.financial_bank_accounts (
  id             text primary key,
  name           text not null,
  bank_name      text not null default '',
  account_number text not null default '',
  branch_code    text not null default '',
  -- The balance this account started at, and the date it applied. Everything after
  -- is derived from imported lines, so a reconciliation always has an anchor.
  opening_balance numeric(14,2) not null default 0,
  opening_balance_date date,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);

-- Seeded from the bank details already printed on every MEGS invoice.
insert into public.financial_bank_accounts
  (id, name, bank_name, account_number, branch_code)
values
  ('fba-main', 'MEGS WATERBERG', 'STANDARDBANK', '300063431', '051001')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Statement imports
-- ---------------------------------------------------------------------------

create table if not exists public.financial_bank_imports (
  id              text primary key,
  bank_account_id text not null references public.financial_bank_accounts(id) on delete cascade,
  source_filename text not null default '',
  statement_from  date,
  statement_to    date,
  rows_read       int not null default 0,
  rows_imported   int not null default 0,
  -- Not a failure: overlapping exports are normal and expected.
  duplicates_skipped int not null default 0,
  summary         jsonb not null default '{}'::jsonb,
  imported_by     text references public.team_members(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists financial_bank_imports_account_idx
  on public.financial_bank_imports (bank_account_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Bank lines — the bank's version of events, never edited
-- ---------------------------------------------------------------------------

create table if not exists public.financial_bank_transactions (
  id              text primary key,
  bank_account_id text not null references public.financial_bank_accounts(id) on delete cascade,
  import_id       text references public.financial_bank_imports(id) on delete set null,

  txn_date        date not null,
  -- Exactly as the bank wrote it. This is the evidence; our reading of it lives on
  -- the receipt.
  description     text not null default '',
  reference       text not null default '',
  -- Positive = into the account. See the header.
  amount          numeric(14,2) not null,
  -- The running balance the statement printed, when it gave one. Used to verify an
  -- import is complete rather than silently missing rows.
  statement_balance numeric(14,2),

  fingerprint     text not null,

  -- unmatched -> matched (a receipt exists) | ignored (not client money)
  status          text not null default 'unmatched',
  -- Why it was ignored: "supplier payment", "bank charges", "transfer".
  ignored_reason  text not null default '',

  created_at      timestamptz not null default now()
);

-- The guard that makes re-importing an overlapping period safe.
create unique index if not exists financial_bank_txn_fingerprint_key
  on public.financial_bank_transactions (bank_account_id, fingerprint);

create index if not exists financial_bank_txn_date_idx
  on public.financial_bank_transactions (bank_account_id, txn_date desc);
create index if not exists financial_bank_txn_status_idx
  on public.financial_bank_transactions (status) where status = 'unmatched';

-- ---------------------------------------------------------------------------
-- Receipts — client money, as Finance understands it
-- ---------------------------------------------------------------------------

create sequence if not exists public.financial_receipt_number_seq start 1;

create or replace function public.next_financial_receipt_number()
returns text
language sql
as $$
  select 'RCT' || lpad(nextval('public.financial_receipt_number_seq')::text, 7, '0');
$$;

grant execute on function public.next_financial_receipt_number() to authenticated;

create table if not exists public.financial_receipts (
  id             text primary key,
  receipt_number text not null,
  client_id      text not null references public.accounts_clients(id) on delete restrict,
  receipt_date   date not null,
  amount         numeric(14,2) not null check (amount > 0),
  method         text not null default 'eft',
  reference      text not null default '',
  notes          text not null default '',

  -- Set when the receipt came off a statement rather than being captured by hand.
  -- One receipt per bank line: a single deposit is a single receipt, even when it
  -- settles several invoices (that is what the allocation table is for).
  bank_transaction_id text unique
    references public.financial_bank_transactions(id) on delete set null,

  -- The AR ledger entry this receipt created, so the two can never drift.
  transaction_id text references public.accounts_transactions(id) on delete set null,

  captured_by    text references public.team_members(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create unique index if not exists financial_receipts_number_key
  on public.financial_receipts (receipt_number);
create index if not exists financial_receipts_client_idx
  on public.financial_receipts (client_id, receipt_date desc);
create index if not exists financial_receipts_date_idx
  on public.financial_receipts (receipt_date desc);

-- ---------------------------------------------------------------------------
-- Allocation — which invoices a receipt settles
-- ---------------------------------------------------------------------------
-- A receipt does not have to be allocated. A client who pays a round R1 000 against
-- a R943.50 invoice has R56.50 sitting as a credit on their account, and that is a
-- real state the books must be able to express — not something to force onto an
-- invoice so the screen looks tidy.

create table if not exists public.financial_receipt_allocations (
  id          text primary key,
  receipt_id  text not null references public.financial_receipts(id) on delete cascade,
  invoice_id  text not null references public.accounts_invoices(id) on delete restrict,
  amount      numeric(14,2) not null check (amount > 0),
  created_at  timestamptz not null default now(),
  unique (receipt_id, invoice_id)
);

create index if not exists financial_receipt_alloc_invoice_idx
  on public.financial_receipt_allocations (invoice_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'financial_receipts_method_check'
  ) then
    alter table public.financial_receipts
      add constraint financial_receipts_method_check
      check (method in ('eft', 'cash', 'debit_order', 'card', 'journal'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'financial_bank_txn_status_check'
  ) then
    alter table public.financial_bank_transactions
      add constraint financial_bank_txn_status_check
      check (status in ('unmatched', 'matched', 'ignored'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Guard: allocations may not exceed the receipt
-- ---------------------------------------------------------------------------
-- Enforced in the database, not only in the API. Over-allocating a receipt would
-- show invoices as settled with money that was never received — the kind of error
-- that is invisible on screen and obvious to an auditor.

create or replace function public.check_receipt_allocation()
returns trigger
language plpgsql
as $$
declare
  receipt_total numeric(14,2);
  allocated     numeric(14,2);
begin
  select amount into receipt_total
    from public.financial_receipts where id = new.receipt_id;

  select coalesce(sum(amount), 0) into allocated
    from public.financial_receipt_allocations
   where receipt_id = new.receipt_id
     and id <> new.id;

  if allocated + new.amount > receipt_total + 0.005 then
    raise exception
      'Allocating % would exceed receipt % (amount %, already allocated %)',
      new.amount, new.receipt_id, receipt_total, allocated;
  end if;

  return new;
end;
$$;

drop trigger if exists financial_receipt_alloc_guard on public.financial_receipt_allocations;
create trigger financial_receipt_alloc_guard
  before insert or update on public.financial_receipt_allocations
  for each row execute function public.check_receipt_allocation();

drop trigger if exists financial_receipts_touch on public.financial_receipts;
create trigger financial_receipts_touch
  before update on public.financial_receipts
  for each row execute function public.touch_accounts_clients();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Finance writes; Accounts reads. Accounts staff need to see that a client has paid
-- when they chase them, but must not be able to record a payment — that separation
-- is the point of the department split, and it is also basic segregation of duties.

do $$
declare t text;
begin
  foreach t in array array[
    'financial_bank_accounts',
    'financial_bank_imports',
    'financial_bank_transactions',
    'financial_receipts',
    'financial_receipt_allocations'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);

    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using ((select public.has_module_access(''financial'',''view''))
             or (select public.has_module_access(''accounts'',''view'')))',
      t || '_select', t);

    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using ((select public.has_module_access(''financial'',''edit'')))
         with check ((select public.has_module_access(''financial'',''edit'')))',
      t || '_write', t);
  end loop;
end $$;

commit;
