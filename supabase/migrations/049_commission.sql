-- 049_commission.sql
--
-- Commission calculator for the sales manager dashboard.
--
-- Replaces a hand-maintained workbook in which the markup for every invoice line was
-- typed in by hand from a Sage item listing. The rule it encoded was:
--
--     markup per line = the item listing's `GP Amount` column × quantity
--     commission      = 10% × Σ markup, excluding LABOUR / TRAVEL / SUNDRIES / INSTALL
--
-- `GP Amount` is `Excl. Price − Avg. Cost`, i.e. profit on the CATALOGUE price rather
-- than on what the item actually sold for, so a discounted sale still paid full
-- commission. Both bases are therefore stored on every invoice and the calculator
-- shows the difference.
--
-- This module lives inside the existing `crm` module rather than registering its own,
-- and every policy requires the `manage` level: this is pay data, not pipeline data.
--
-- Conventions follow 046_projects.sql / 047_procurement.sql: text primary keys with
-- application-generated ids, RLS via has_module_access(), and a sequence for the
-- human-facing reference.

begin;

-- ---------------------------------------------------------------------------
-- Catalogue snapshots
-- ---------------------------------------------------------------------------
-- Each upload of the Item Listing Report is kept as its own immutable snapshot, and
-- an invoice records which snapshot priced it. Without this, re-importing next
-- month's price list would silently restate last month's approved commission.

create table if not exists public.commission_catalogue_imports (
  id             text primary key,
  source_filename text not null default '',
  sheet_name     text not null default '',
  -- Prices apply to invoices dated on or after this. Defaults to the upload date.
  effective_from date not null default current_date,
  item_count     int  not null default 0,
  zero_price_count      int not null default 0,
  non_positive_gp_count int not null default 0,
  notes          text not null default '',
  imported_by    text references public.team_members(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists commission_catalogue_imports_effective_idx
  on public.commission_catalogue_imports (effective_from desc);

create table if not exists public.commission_catalogue_items (
  id          text primary key,
  import_id   text not null references public.commission_catalogue_imports(id) on delete cascade,
  code        text not null,
  description text not null default '',
  category    text not null default '',
  avg_cost    numeric(14,2) not null default 0,
  excl_price  numeric(14,2) not null default 0,
  -- Straight off the report; not recomputed, so it always agrees with the paper.
  gp_amount   numeric(14,2) not null default 0
);
create unique index if not exists commission_catalogue_items_import_code_idx
  on public.commission_catalogue_items (import_id, upper(code));
create index if not exists commission_catalogue_items_code_idx
  on public.commission_catalogue_items (upper(code));

-- ---------------------------------------------------------------------------
-- Code aliases and exclusions
-- ---------------------------------------------------------------------------
-- Invoices and the item listing are keyed by hand in two different systems and do
-- not always agree on a product's code. Aliases are learned one click at a time from
-- the review strip, so matching improves with use instead of needing a big cleanup.

create table if not exists public.commission_code_aliases (
  id            text primary key,
  invoice_code  text not null,
  catalogue_code text not null,
  note          text not null default '',
  created_by    text references public.team_members(id) on delete set null,
  created_at    timestamptz not null default now()
);
create unique index if not exists commission_code_aliases_from_idx
  on public.commission_code_aliases (upper(invoice_code));

create table if not exists public.commission_excluded_codes (
  code       text primary key,
  reason     text not null default '',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Rates and targets
-- ---------------------------------------------------------------------------
-- A null rep_id is the company default; a row naming a rep overrides it. Effective
-- dating means changing a target next month cannot restate an approved month.
--
-- `monthly_threshold` and `fixed_addition` belong to the recurring half of the
-- payout (Phase 2) and are unused by the invoice calculator. They are seeded here so
-- the schema does not have to change when that half lands.

create table if not exists public.commission_rules (
  id                text primary key,
  rep_id            text references public.team_members(id) on delete cascade,
  install_rate      numeric(6,4)  not null default 0.10,
  monthly_threshold numeric(14,2) not null default 0,
  fixed_addition    numeric(14,2) not null default 0,
  markup_basis      text not null default 'as_invoiced'
                      check (markup_basis in ('as_invoiced','catalogue')),
  effective_from    date not null default current_date,
  note              text not null default '',
  created_at        timestamptz not null default now()
);
-- One rule per rep per effective date; coalesce so the company default is covered too.
create unique index if not exists commission_rules_scope_idx
  on public.commission_rules (coalesce(rep_id, '~default'), effective_from);

-- ---------------------------------------------------------------------------
-- Priced invoices
-- ---------------------------------------------------------------------------

create sequence if not exists public.commission_ref_seq start 1;

create or replace function public.next_commission_ref()
returns text language sql volatile security definer set search_path = public as $$
  select 'CMM-' || lpad(nextval('public.commission_ref_seq')::text, 4, '0');
$$;
grant execute on function public.next_commission_ref() to authenticated;

create table if not exists public.commission_invoices (
  id             text primary key,
  ref            text unique not null,
  invoice_number text not null,
  invoice_date   date,
  reference      text not null default '',
  client_name    text not null default '',
  -- The `SALES REP:` printed on the invoice. That is who did the INSTALL, not who
  -- earns the commission, so it is stored for context and never used to attribute.
  installer_name text not null default '',
  -- Who actually earns it. Resolved from the client's lead owner, always confirmed
  -- by a human before saving.
  rep_id         text references public.team_members(id) on delete set null,

  basis        text not null check (basis in ('as_invoiced','catalogue')),
  install_rate numeric(6,4) not null default 0.10,

  revenue_excl           numeric(14,2) not null default 0,
  catalogue_markup       numeric(14,2) not null default 0,
  as_invoiced_markup     numeric(14,2) not null default 0,
  catalogue_commission   numeric(14,2) not null default 0,
  as_invoiced_commission numeric(14,2) not null default 0,
  -- Payable under `basis`.
  commission             numeric(14,2) not null default 0,

  -- Parse integrity: lines added up to the invoice's own printed total.
  reconciled        boolean not null default false,
  stated_excl_total numeric(14,2),
  review_count      int not null default 0,

  status text not null default 'draft' check (status in ('draft','approved')),
  source_filename text not null default '',
  catalogue_import_id text references public.commission_catalogue_imports(id) on delete set null,
  notes  text not null default '',

  created_by  text references public.team_members(id) on delete set null,
  approved_by text references public.team_members(id) on delete set null,
  approved_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- Guards against the same invoice being imported — and paid — twice.
create unique index if not exists commission_invoices_number_idx
  on public.commission_invoices (upper(invoice_number));
create index if not exists commission_invoices_rep_idx
  on public.commission_invoices (rep_id, invoice_date desc);
create index if not exists commission_invoices_status_idx
  on public.commission_invoices (status);

-- Every figure is frozen at calculation time. An approved payout must never move
-- because a price list was re-imported afterwards.
create table if not exists public.commission_invoice_lines (
  id           text primary key,
  invoice_id   text not null references public.commission_invoices(id) on delete cascade,
  line_index   int not null default 0,
  code         text not null,
  matched_code text,
  description  text not null default '',

  qty            numeric(14,3) not null default 0,
  unit_price     numeric(14,2) not null default 0,
  discount_pct   numeric(7,4)  not null default 0,
  net_unit_price numeric(14,2) not null default 0,
  excl_total     numeric(14,2) not null default 0,

  avg_cost              numeric(14,2),
  catalogue_gp_unit     numeric(14,2),
  catalogue_markup      numeric(14,2),
  as_invoiced_markup    numeric(14,2),
  commissionable_markup numeric(14,2),
  commission            numeric(14,2) not null default 0,

  -- Not "excluded": that word collides with the ON CONFLICT pseudo-table.
  is_excluded boolean not null default false,
  flags       text[]  not null default '{}'
);
create index if not exists commission_invoice_lines_invoice_idx
  on public.commission_invoice_lines (invoice_id, line_index);

-- ---------------------------------------------------------------------------
-- Seeds
-- ---------------------------------------------------------------------------

-- Left blank in the workbook's markup column by hand, on every invoice, every month.
insert into public.commission_excluded_codes (code, reason) values
  ('LABOUR',   'Time, not product margin'),
  ('TRAVEL',   'Recovered cost, not product margin'),
  ('INSTALL',  'Service fee, not product margin'),
  ('SUNDRIES', 'Consumables pool, not attributable margin')
on conflict (code) do nothing;

-- Invoices bill Cat5e as TC-305; the item listing calls it CABLE CAT5. Same product,
-- same R12.61 list price. Verified against INV0181025.
insert into public.commission_code_aliases (id, invoice_code, catalogue_code, note)
values ('cma-seed-tc305', 'TC-305', 'CABLE CAT5',
        'Same Cat5e cable under two codes; confirmed on INV0181025')
on conflict (upper(invoice_code)) do nothing;

-- Company default: 10% of achieved margin.
insert into public.commission_rules (id, rep_id, install_rate, markup_basis, note)
values ('cmr-default', null, 0.10, 'as_invoiced',
        'Company default. 10% of margin actually achieved.')
on conflict do nothing;

-- Per-rep monthly targets. Herman's R15,000 appeared as "Basic Salary" in the
-- workbook; Marlyna is a new rep on R10,000. Matched by name so this is a no-op
-- until the team_members rows exist.
--
-- Herman's fixed_addition is the R1,842.90 "Die Oog" line carried every month.
-- Marlyna's is left at 0 deliberately — whether she shares that line is unconfirmed.
insert into public.commission_rules (id, rep_id, install_rate, monthly_threshold, fixed_addition, markup_basis, note)
select 'cmr-herman', tm.id, 0.10, 15000, 1842.90, 'as_invoiced',
       'Threshold was "Basic Salary" in the 2026 commission workbook'
from public.team_members tm
where tm.name ilike 'herman%'
order by tm.name
limit 1
on conflict do nothing;

insert into public.commission_rules (id, rep_id, install_rate, monthly_threshold, fixed_addition, markup_basis, note)
select 'cmr-marlyna', tm.id, 0.10, 10000, 0, 'as_invoiced',
       'New rep, R10 000 monthly target. Die Oog share unconfirmed.'
from public.team_members tm
where tm.name ilike 'marlyna%'
order by tm.name
limit 1
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- RLS — every table requires crm/manage
-- ---------------------------------------------------------------------------
-- Deliberately stricter than the rest of the CRM. A sales agent with `edit` on their
-- own pipeline must not be able to read what colleagues are paid.

do $$
declare t text;
begin
  foreach t in array array[
    'commission_catalogue_imports',
    'commission_catalogue_items',
    'commission_code_aliases',
    'commission_excluded_codes',
    'commission_rules',
    'commission_invoices',
    'commission_invoice_lines'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using ((select public.has_module_access(''crm'',''manage'')))',
      t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using ((select public.has_module_access(''crm'',''manage'')))
         with check ((select public.has_module_access(''crm'',''manage'')))',
      t || '_write', t);
  end loop;
end $$;

commit;
