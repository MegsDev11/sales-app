-- 054_accounts_transactions.sql
--
-- The customer ledger behind the Customer Transactions Report.
--
-- The report the department emails every month is a STATEMENT: opening balance, every
-- debit and credit in a date range, closing balance. Producing one needs a ledger, and
-- until now the app had no such thing — migration 051 stored a single `balance` per
-- client, which is a photograph of what Sage thought on the day of the import, not a
-- history that can be replayed over a date range.
--
-- WHY THE RUNNING BALANCE IS NOT STORED. Each row carries only its own debit or
-- credit; the balance column on the printed report is computed as the rows are laid
-- out. Storing it would mean every backdated payment — and payments are frequently
-- captured days late — silently invalidates the balance on every row after it. A
-- stored running balance is a cache of an ordering, and the ordering changes.
--
-- WHERE HISTORY BEGINS. MEGS has years of transactions inside Sage that were never
-- exported. What the import CAN establish is each client's balance on the day of the
-- import, so that is seeded as a single `opening` transaction. Any statement whose
-- range starts before that date cannot be complete, and the renderer says so on the
-- face of the document rather than printing a confident wrong number. Once the app
-- raises its own invoices and captures payments, the ledger becomes authoritative
-- going forward.
--
-- SIGN CONVENTION. `debit` increases what the client owes (an invoice); `credit`
-- decreases it (a payment). A row carries one or the other, never both. This matches
-- the Debit / Credit columns Sage prints, so the two documents can be read together.

begin;

create table if not exists public.accounts_transactions (
  id          text primary key,
  client_id   text not null references public.accounts_clients(id) on delete cascade,

  txn_date    date not null,
  -- The document number: INV0192812, a payment reference, a journal number.
  reference   text not null default '',
  txn_type    text not null default 'invoice',
  description text not null default '',

  -- Exactly one of these is non-zero. Enforced below.
  debit       numeric(14,2) not null default 0,
  credit      numeric(14,2) not null default 0,

  -- Set when this row was raised by the app's own invoice run, so an invoice and its
  -- ledger entry can never drift apart.
  invoice_id  text references public.accounts_invoices(id) on delete cascade,

  -- 'sage_import' rows are history the app did not create and must not renumber.
  source      text not null default 'app',

  created_by  text references public.team_members(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists accounts_transactions_client_date_idx
  on public.accounts_transactions (client_id, txn_date, created_at);
create index if not exists accounts_transactions_date_idx
  on public.accounts_transactions (txn_date);
create index if not exists accounts_transactions_invoice_idx
  on public.accounts_transactions (invoice_id);

-- One ledger row per invoice. Re-running the monthly job must not post twice.
create unique index if not exists accounts_transactions_invoice_key
  on public.accounts_transactions (invoice_id) where invoice_id is not null;

-- One seeded opening balance per client, however many times the CSV is re-imported.
create unique index if not exists accounts_transactions_opening_key
  on public.accounts_transactions (client_id) where txn_type = 'opening';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'accounts_transactions_type_check'
  ) then
    alter table public.accounts_transactions
      add constraint accounts_transactions_type_check
      check (txn_type in ('opening', 'invoice', 'payment', 'credit_note', 'journal'));
  end if;

  -- A row that is both a debit and a credit is a data-entry error, not a transaction.
  if not exists (
    select 1 from pg_constraint where conname = 'accounts_transactions_side_check'
  ) then
    alter table public.accounts_transactions
      add constraint accounts_transactions_side_check
      check (debit = 0 or credit = 0);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Seed opening balances from the Sage import
-- ---------------------------------------------------------------------------
-- One row per client that carried a non-zero balance, dated the day the balance was
-- read. `balance_as_at` is set by the importer; clients imported before that column
-- existed fall back to their row's creation date.

insert into public.accounts_transactions
  (id, client_id, txn_date, reference, txn_type, description, debit, credit, source)
select
  'atx-open-' || c.id,
  c.id,
  coalesce(c.balance_as_at, c.created_at)::date,
  'OPENING',
  'opening',
  'Balance carried over from Sage',
  case when c.balance > 0 then c.balance else 0 end,
  case when c.balance < 0 then -c.balance else 0 end,
  'sage_import'
from public.accounts_clients c
where c.balance <> 0
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.accounts_transactions enable row level security;
revoke all on public.accounts_transactions from anon;

drop policy if exists accounts_transactions_select on public.accounts_transactions;
create policy accounts_transactions_select on public.accounts_transactions
  for select to authenticated
  using ((select public.has_module_access('accounts','view')));

drop policy if exists accounts_transactions_write on public.accounts_transactions;
create policy accounts_transactions_write on public.accounts_transactions
  for all to authenticated
  using ((select public.has_module_access('accounts','edit')))
  with check ((select public.has_module_access('accounts','edit')));

commit;
