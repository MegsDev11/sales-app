-- 052_accounts_payment_method.sql
--
-- How a client pays, as its own fact.
--
-- 051 derived `debit_order_day` from the Sage `Staff` column, which answered "when is
-- this client debited" but not "how does this client pay at all". The department
-- needs the second question answered separately, because a live client may pay by
-- debit order, by EFT on invoice, or in cash at the office — and the monthly invoice
-- email is not the same letter in those three cases.
--
-- This is deliberately a SEPARATE AXIS from `billing_status`, not another status
-- value. A cash client is still Active; being asked to pay in cash says nothing about
-- whether the account is live, cancelled or a duplicate. Folding "cash" into the
-- status column would make it impossible to express "active, and pays cash", which is
-- exactly the population this exists to describe.
--
-- Why it matters for the monthly run: the standard covering letter asks the client to
-- "revert payment at your earliest convenience and provide me with a POP". That is
-- correct for `eft` and `cash`, and wrong for `debit_order` — those clients are
-- debited automatically and must not be asked to pay again. The run therefore reads
-- this column to choose the wording.
--
-- `unknown` is the honest default. The Sage export does not state a payment method,
-- so only clients carrying a debit-order instruction can be inferred; everyone else
-- is marked unknown rather than guessed into a bucket that changes what they are told.

begin;

alter table public.accounts_clients
  add column if not exists payment_method text not null default 'unknown';

-- A free-text note for the clerk: "pays quarterly", "collects invoice at office",
-- "quote declined 2026-03". Shown on the client, never parsed.
alter table public.accounts_clients
  add column if not exists billing_note text not null default '';

-- What the invoice LINE should say for this client, e.g.
-- "50M-HF - 50 MEG UNCAPPED FIBRE HOME USER".
--
-- Blank means "derive it from the package", which produces an honest but generic
-- line ("50 MEG UNCAPPED - MONTHLY SUBSCRIPTION"). The Sage `Packages` column records
-- a speed and a price but never says whether the service is fibre or wireless, and
-- printing the wrong one on a tax invoice is worse than printing neither — so the
-- derivation stays vague and this column exists to make it exact.
alter table public.accounts_clients
  add column if not exists service_description text not null default '';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'accounts_clients_payment_method_check'
  ) then
    alter table public.accounts_clients
      add constraint accounts_clients_payment_method_check
      check (payment_method in ('debit_order', 'eft', 'cash', 'unknown'));
  end if;
end $$;

create index if not exists accounts_clients_payment_method_idx
  on public.accounts_clients (payment_method);

-- Backfill the one case the import can prove: a debit-order day means debit order.
-- Everything else is left `unknown` on purpose — see the header.
update public.accounts_clients
   set payment_method = 'debit_order'
 where debit_order_day is not null
   and payment_method = 'unknown';

commit;
