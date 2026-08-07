-- ---------------------------------------------------------------------------
-- 063 — Arrange sidebar sections per department
-- ---------------------------------------------------------------------------
-- Until now every department's sidebar was a hardcoded array in
-- lib/nav/department-nav.ts, so a page could only ever appear under the module
-- that owns its URL. Coordination could not hand "Technicians" to General
-- Management, Financial could not keep an eye on "Inventory", and a section
-- nobody used could not be taken off a department's list without a code change.
--
-- This table stores OVERRIDES ONLY, never the whole arrangement. Two reasons:
-- a department that has never been customised keeps following the defaults in
-- code, so a section added in a later release shows up for it automatically; and
-- the table stays a handful of rows rather than a copy of the entire navigation
-- that immediately starts drifting from it.
--
--   enabled = true   -> show this section here (a borrowed one, or a default
--                       that was switched off and has been put back)
--   enabled = false  -> hide this default section from this department
--
-- Hiding is navigation only. The URL still works for anyone who holds the grant,
-- so links and bookmarks already in circulation do not dead-end. Access itself
-- stays where it was: module grants in user_module_access, enforced by RLS and
-- the API guards.
-- ---------------------------------------------------------------------------

create table if not exists public.module_sections (
  -- The department whose sidebar this row arranges — a modules.key, because the
  -- sidebar is built per module. Not departments.key: that table is org
  -- structure (who reports to whom) and is a different, shorter list.
  module_key   text not null references public.modules(key) on delete cascade,
  -- The section's route, e.g. '/stock/inventory'. Deliberately NOT a foreign key:
  -- routes live in the app, and a route that disappears in a later release should
  -- leave a harmless orphan row rather than block the deploy. The catalogue in
  -- lib/nav/sections.ts is what resolves an href to a label and an icon, and it
  -- ignores anything it does not recognise.
  section_href text not null,
  enabled      boolean not null default true,
  -- Where it sits in the list. Nulls sort last, after the defaults.
  sort_order   integer,
  added_by     text references public.team_members(id) on delete set null,
  added_at     timestamptz not null default now(),
  primary key (module_key, section_href)
);

create index if not exists module_sections_module_idx
  on public.module_sections (module_key);

alter table public.module_sections enable row level security;

-- Every signed-in user reads the whole arrangement: the sidebar is rendered on
-- the client and needs it before it knows which departments the user can see.
-- Nothing sensitive is in here — it is a list of route strings, and knowing that
-- /stock/inventory exists grants no access to it.
drop policy if exists "module sections readable" on public.module_sections;
create policy "module sections readable" on public.module_sections
  for select to authenticated using (true);

-- Only Administration at 'manage' may rearrange it, same as every other table in
-- migration 040.
drop policy if exists "module sections admin" on public.module_sections;
create policy "module sections admin" on public.module_sections
  for all to authenticated
  using (public.has_module_access('admin','manage'))
  with check (public.has_module_access('admin','manage'));
