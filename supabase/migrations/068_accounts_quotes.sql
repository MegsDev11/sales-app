-- 068_accounts_quotes.sql — quotes become records, and invoices learn about projects.
--
-- Until now a "quote" was two free-typed fields on the project form plus an
-- uploaded PDF in project_documents (060 argued "a quote IS a document"). That
-- holds for a BOQ folder and fails for a managed platform: no numbering, no
-- accept event, no conversion to an invoice, nothing to show a client next to
-- their invoices. This migration gives quotes the same machinery invoices got
-- in 053 — mirrored shapes on purpose, so the PDF renderer, the mailer and the
-- UI patterns carry straight over.
--
-- It also makes room for PROJECT invoices in accounts_invoices. 053 modelled
-- the monthly subscription run: billing_period NOT NULL and a unique
-- (client_id, billing_period) index that makes a re-run idempotent. A
-- once-off project invoice must not collide with the client's monthly invoice,
-- so billing_period becomes nullable and a `kind` column separates the two:
--   kind='subscription' -> billing_period required (trigger-enforced), unique
--                          per client per month exactly as before;
--   kind='project'      -> billing_period null. Postgres treats nulls as
--                          distinct in the unique index, so a client can carry
--                          any number of project invoices.
--
-- Apply manually in the Supabase SQL editor (repo convention).

-- ---------------------------------------------------------------------------
-- 1. Numbering — same pattern as invoices, own prefix + sequence
-- ---------------------------------------------------------------------------

alter table public.accounts_settings
  add column if not exists quote_prefix text not null default 'QTE';

create sequence if not exists public.accounts_quote_number_seq start 1000;

create or replace function public.next_accounts_quote_number()
returns text
language sql
as $$
  select (select quote_prefix from public.accounts_settings where id = 'default')
      || lpad(nextval('public.accounts_quote_number_seq')::text, 6, '0');
$$;

grant execute on function public.next_accounts_quote_number() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Quotes
-- ---------------------------------------------------------------------------

create table if not exists public.accounts_quotes (
  id            text primary key,
  quote_number  text not null,

  -- Nullable on purpose: a quote can go to a prospect who is not on the client
  -- book yet. Converting to an invoice requires the client link first, because
  -- accounts_invoices.client_id is NOT NULL (053) — the API enforces that.
  client_id     text references public.accounts_clients(id) on delete set null,
  client_name   text not null,
  client_email  text not null default '',

  project_id    text references public.projects(id) on delete set null,
  lead_id       text references public.leads(id) on delete set null,

  quote_date    date not null default current_date,
  valid_until   date,

  total_excl    numeric(14,2) not null default 0,
  total_vat     numeric(14,2) not null default 0,
  total_incl    numeric(14,2) not null default 0,

  status        text not null default 'draft'
    check (status in ('draft', 'sent', 'accepted', 'declined', 'expired')),
  accounts_owner text not null default '',
  sent_at       timestamptz,
  sent_to       text not null default '',
  send_error    text not null default '',
  accepted_at   timestamptz,
  declined_at   timestamptz,

  -- Set when the accepted quote is converted; the invoice is the billing truth
  -- from then on.
  invoice_id    text references public.accounts_invoices(id) on delete set null,

  notes         text not null default '',
  created_by    text references public.team_members(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists accounts_quotes_number_key
  on public.accounts_quotes (quote_number);
create index if not exists accounts_quotes_client_idx
  on public.accounts_quotes (client_id);
create index if not exists accounts_quotes_project_idx
  on public.accounts_quotes (project_id);
create index if not exists accounts_quotes_status_idx
  on public.accounts_quotes (status, quote_date desc);

-- Same generic touch trigger 053 reuses.
drop trigger if exists accounts_quotes_touch on public.accounts_quotes;
create trigger accounts_quotes_touch
  before update on public.accounts_quotes
  for each row execute function public.touch_accounts_clients();

-- Line shape mirrors accounts_invoice_lines exactly, so conversion is a copy.
create table if not exists public.accounts_quote_lines (
  id              text primary key,
  quote_id        text not null references public.accounts_quotes(id) on delete cascade,
  line_index      int not null default 0,
  code            text not null default '',
  description     text not null default '',
  qty             numeric(12,2) not null default 1,
  unit_price_incl numeric(14,2) not null default 0,
  discount_pct    numeric(6,2) not null default 0,
  vat_pct         numeric(6,2) not null default 15,
  total_excl      numeric(14,2) not null default 0,
  total_incl      numeric(14,2) not null default 0
);

create index if not exists accounts_quote_lines_quote_idx
  on public.accounts_quote_lines (quote_id, line_index);

-- ---------------------------------------------------------------------------
-- 3. Invoices: room for project invoices
-- ---------------------------------------------------------------------------

alter table public.accounts_invoices
  add column if not exists kind text not null default 'subscription'
    check (kind in ('subscription', 'project')),
  add column if not exists quote_id text
    references public.accounts_quotes(id) on delete set null,
  alter column billing_period drop not null;

-- billing_period stays required for the monthly run — the idempotency guard
-- (unique client_id + billing_period) only means something when the value is
-- there. Enforced by trigger since a CHECK can't be added as NOT VALID cheaply
-- across kinds.
create or replace function public.enforce_invoice_period()
returns trigger
language plpgsql
as $$
begin
  if new.kind = 'subscription' and new.billing_period is null then
    raise exception 'subscription invoices require billing_period';
  end if;
  return new;
end;
$$;

drop trigger if exists accounts_invoices_period_guard on public.accounts_invoices;
create trigger accounts_invoices_period_guard
  before insert or update on public.accounts_invoices
  for each row execute function public.enforce_invoice_period();

-- ---------------------------------------------------------------------------
-- 4. RLS — 053 pattern verbatim: read at view, write at edit
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['accounts_quotes', 'accounts_quote_lines'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using ((select public.has_module_access(''accounts'', ''view'')))',
      t || '_select', t
    );
    execute format(
      'create policy %I on public.%I for all to authenticated
         using ((select public.has_module_access(''accounts'', ''edit'')))
         with check ((select public.has_module_access(''accounts'', ''edit'')))',
      t || '_write', t
    );
  end loop;
end $$;
