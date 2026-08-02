-- 053_accounts_invoicing.sql
--
-- Monthly invoicing for the Accounts department.
--
-- This is the migration that turns the client book into a billing system: MEGS stops
-- exporting invoices out of Sage by hand and the app raises them itself.
--
-- INVOICE NUMBERS MUST NEVER COLLIDE WITH SAGE. Sage is currently around INV0192812.
-- If this app also started at INV0000001 it would eventually mint a number Sage has
-- already used, and two different documents would share one reference — which is a
-- SARS problem, not a cosmetic one. The sequence therefore starts at 1 000 000: the
-- same INV####### shape the client already recognises, but numerically out of Sage's
-- reach for the foreseeable life of the business. Prefix and start are both settings,
-- so the department can move them if Sage's numbering ever approaches.
--
-- WHAT THE LETTER SAYS DEPENDS ON HOW THEY PAY. The standard covering letter asks the
-- client to revert payment and send a POP. That is right for EFT and cash clients and
-- wrong for debit-order clients, who are debited automatically. `payment_method`
-- (migration 052) selects the wording, and both variants live in the template.
--
-- CREDENTIALS ARE NOT STORED HERE. `accounts_staff` holds a clerk's identity — the
-- name that signs the letter and the address replies go to — and nothing secret. SMTP
-- credentials come from environment variables; a mailbox password in a database row
-- is a password in every backup, every export and every screen-share.
--
-- Conventions follow 049_commission.sql / 051_accounts_clients.sql.

begin;

-- ---------------------------------------------------------------------------
-- Company details and numbering
-- ---------------------------------------------------------------------------
-- Single-row settings table. These print on every invoice, so they belong somewhere
-- the department can correct without a deploy. Seeded from the real Sage invoice.

create table if not exists public.accounts_settings (
  id                 text primary key default 'default',
  company_name       text not null default 'MEGS WATERBERG (PTY) LTD',
  vat_number         text not null default '4730281922',
  postal_address     text not null default E'P O Box 57\nPostnet Modimolle\nModimolle',
  physical_address   text not null default E'20 Dirk Van Den Berg Straat\nModimolle\nLimpopo\n0510',
  office_phone       text not null default '087 820 5290',

  bank_account_name  text not null default 'MEGS WATERBERG',
  bank_name          text not null default 'STANDARDBANK',
  bank_account_number text not null default '300063431',
  bank_branch_code   text not null default '051001',
  pop_email          text not null default 'marily@megswb.co.za',

  -- The two standing notices Sage prints under the line items.
  invoice_notice     text not null default 'PLEASE NOTE THAT THIS INVOICE IS DUE FOR PAYMENT IMMEDIATELY',
  sms_notice         text not null default '** IF YOU WOULD LIKE TO RECEIVE AN SMS, STATING OF ANY SIGNAL LOSS OR TOWER PROBLEMS, PLEASE SEND YOUR NAME, SURNAME AND LOCATION TO 060 418 6311 - PLEASE SAVE THIS NUMBER IN ORDER TO RECEIVE ANY MESSAGES **',

  invoice_prefix     text not null default 'INV',
  -- Days from invoice date to due date. Sage's example was 23/07 -> 30/07.
  payment_terms_days int not null default 7,
  vat_rate           numeric(6,4) not null default 0.15,

  updated_at         timestamptz not null default now()
);

insert into public.accounts_settings (id) values ('default') on conflict (id) do nothing;

-- Starts far above Sage's live numbering — see the header.
create sequence if not exists public.accounts_invoice_number_seq start 1000000;

create or replace function public.next_accounts_invoice_number()
returns text
language sql
as $$
  select (select invoice_prefix from public.accounts_settings where id = 'default')
      || lpad(nextval('public.accounts_invoice_number_seq')::text, 7, '0');
$$;

grant execute on function public.next_accounts_invoice_number() to authenticated;

-- ---------------------------------------------------------------------------
-- Accounts clerks
-- ---------------------------------------------------------------------------
-- Who signs the letter and where replies go. `display_name` is what appears above
-- "MEGS Waterberg" at the foot of the email.

create table if not exists public.accounts_staff (
  id           text primary key,
  -- Matches accounts_clients.accounts_owner, which is how a client finds its clerk.
  owner_key    text not null,
  display_name text not null,
  email        text not null default '',
  -- Set when this clerk's mailbox may be authenticated directly. Otherwise the shared
  -- sender is used and this address goes in Reply-To.
  can_send_as  boolean not null default false,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create unique index if not exists accounts_staff_owner_key
  on public.accounts_staff (lower(owner_key));

-- Seeded from the names the importer derives. Addresses are left blank on purpose —
-- guessing a person's mailbox would put client mail somewhere nobody reads.
insert into public.accounts_staff (id, owner_key, display_name) values
  ('acs-leane',   'Leané van Deventer', 'Leané van Deventer'),
  ('acs-meg',     'Meg van der Walt',   'Meg van der Walt'),
  ('acs-santi',   'Santi Bessinger',    'Santi Bessinger'),
  ('acs-marily',  'Marily Barnard',     'Marily Barnard'),
  ('acs-marlyna', 'Marlyna de Villiers','Marlyna de Villiers')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Email templates
-- ---------------------------------------------------------------------------
-- The covering letter. Editable, with {{merge_fields}} filled at send time.
-- `body_debit_order` is the variant for clients who are debited automatically and
-- must not be asked to pay again; when blank the main body is used for everyone.

create table if not exists public.accounts_email_templates (
  id               text primary key,
  name             text not null,
  subject          text not null default 'Customer Transactions Report',
  body             text not null default '',
  body_debit_order text not null default '',
  is_default       boolean not null default false,
  updated_by       text references public.team_members(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- The department's standing letter, exactly as supplied.
insert into public.accounts_email_templates (id, name, subject, body, body_debit_order, is_default)
values (
  'aet-default',
  'Monthly statement and invoice',
  'Customer Transactions Report',
  E'Dear Valued Megs Client,\n\n'
  'We as a company would like to thank you for your loyal support and payments, we appreciate your business.\n\n'
  'Kindly find attached your monthly Transaction Report and Invoices for your account.\n\n'
  'Would you please be so kind as to revert payment at your earliest convenience and provide me with a POP.\n\n'
  'Your assistance would be greatly appreciated.\n\n'
  'Feel free to contact me should you have queries.\n\n'
  'Warm Regards\n'
  '{{accounts_owner}}\n'
  'MEGS Waterberg',
  E'Dear Valued Megs Client,\n\n'
  'We as a company would like to thank you for your loyal support and payments, we appreciate your business.\n\n'
  'Kindly find attached your monthly Transaction Report and Invoices for your account.\n\n'
  'Your account is paid by debit order and will be deducted on the {{debit_order_day}} of the month, so no action is needed from your side.\n\n'
  'Feel free to contact me should you have queries.\n\n'
  'Warm Regards\n'
  '{{accounts_owner}}\n'
  'MEGS Waterberg',
  true
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Invoices
-- ---------------------------------------------------------------------------

create table if not exists public.accounts_invoices (
  id            text primary key,
  invoice_number text not null,
  client_id     text not null references public.accounts_clients(id) on delete restrict,
  -- Denormalised on purpose: an invoice is a legal document and must keep saying what
  -- it said when it was issued, even if the client is later renamed or re-emailed.
  client_name   text not null,
  client_email  text not null default '',

  -- The month being billed, always stored as its first day.
  billing_period date not null,
  invoice_date  date not null default current_date,
  due_date      date not null default current_date,

  total_excl    numeric(14,2) not null default 0,
  total_vat     numeric(14,2) not null default 0,
  total_incl    numeric(14,2) not null default 0,

  -- draft -> issued -> sent, or failed. Nothing is emailed from `draft`.
  status        text not null default 'draft',
  accounts_owner text not null default '',
  sent_at       timestamptz,
  sent_to       text not null default '',
  send_error    text not null default '',

  created_by    text references public.team_members(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists accounts_invoices_number_key
  on public.accounts_invoices (invoice_number);
-- One invoice per client per month. This is the guard that makes a re-run of the
-- monthly job safe: a second attempt updates the draft rather than billing twice.
create unique index if not exists accounts_invoices_client_period_key
  on public.accounts_invoices (client_id, billing_period);
create index if not exists accounts_invoices_period_idx
  on public.accounts_invoices (billing_period desc, status);
create index if not exists accounts_invoices_client_idx
  on public.accounts_invoices (client_id);

create table if not exists public.accounts_invoice_lines (
  id           text primary key,
  invoice_id   text not null references public.accounts_invoices(id) on delete cascade,
  line_index   int not null default 0,
  code         text not null default '',
  description  text not null default '',
  qty          numeric(12,2) not null default 1,
  -- Prices are quoted to clients inclusive of VAT, which is how the package column
  -- reads and how the printed invoice leads.
  unit_price_incl numeric(14,2) not null default 0,
  discount_pct numeric(6,2) not null default 0,
  vat_pct      numeric(6,2) not null default 15,
  total_excl   numeric(14,2) not null default 0,
  total_incl   numeric(14,2) not null default 0
);

create index if not exists accounts_invoice_lines_invoice_idx
  on public.accounts_invoice_lines (invoice_id, line_index);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'accounts_invoices_status_check'
  ) then
    alter table public.accounts_invoices
      add constraint accounts_invoices_status_check
      check (status in ('draft', 'issued', 'sent', 'failed', 'cancelled'));
  end if;
end $$;

drop trigger if exists accounts_invoices_touch on public.accounts_invoices;
create trigger accounts_invoices_touch
  before update on public.accounts_invoices
  for each row execute function public.touch_accounts_clients();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Reads at accounts/view. Writes at accounts/edit, EXCEPT settings and staff, which
-- carry the company's banking details and the identities client mail is sent under —
-- those require `manage`.

do $$
declare t text;
begin
  foreach t in array array[
    'accounts_invoices', 'accounts_invoice_lines', 'accounts_email_templates'
  ] loop
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

  foreach t in array array['accounts_settings', 'accounts_staff'] loop
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
         using ((select public.has_module_access(''accounts'',''manage'')))
         with check ((select public.has_module_access(''accounts'',''manage'')))',
      t || '_write', t);
  end loop;
end $$;

commit;
