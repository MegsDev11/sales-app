-- 067_project_integration.sql — projects get real edges to the rest of the platform.
--
-- Until now the only bridge between a project and its jobs, stock and invoices
-- was project_links: free-text (entity_type, entity_id) pairs with no FK, no
-- picker except leads, and no reader on the other side. Every "show me
-- everything about this project" wish dies on that. This migration adds typed
-- foreign keys where the work actually lives, plus the two tables the projects
-- module never had: a bill of materials and phase staffing.
--
--   1. jobs.project_id + jobs.project_block_id — a field job belongs to a
--      project, optionally to a specific block (phase row in the delivery grid).
--      Job cards then reach the project through their job; hours through
--      time_entries.job_id.
--   2. stock_requests.project_id / stock_bookings.project_id — pick lists are
--      raised FOR a project, and each booked-out unit inherits that link.
--   3. accounts_invoices.project_id — an invoice can say which build it bills.
--   4. project_stock_lines — what the build NEEDS (BOM), reconciled in the UI
--      against what was actually requested and booked out.
--   5. project_phase_staff — who works which block/stage. block_id and
--      stage_id are both optional: null/null = "on the project generally",
--      block only = "on Block 12 across all stages", stage only = "does the
--      splicing everywhere".
--
-- Backfills: existing project_links rows for jobs and stock requests are
-- promoted into the new FKs (the loose rows are kept for history), and
-- bookings inherit their request's project.
--
-- Everything is text ids — the entire projects family uses app-generated text
-- PKs (see 046), so all FKs here are text too. Apply manually in the Supabase
-- SQL editor (repo convention).

-- ---------------------------------------------------------------------------
-- 1. Typed edges
-- ---------------------------------------------------------------------------

alter table public.jobs
  add column if not exists project_id text
    references public.projects(id) on delete set null,
  add column if not exists project_block_id text
    references public.project_blocks(id) on delete set null;

create index if not exists jobs_project_idx on public.jobs (project_id);

alter table public.stock_requests
  add column if not exists project_id text
    references public.projects(id) on delete set null;

create index if not exists stock_requests_project_idx on public.stock_requests (project_id);

alter table public.stock_bookings
  add column if not exists project_id text
    references public.projects(id) on delete set null;

create index if not exists stock_bookings_project_idx on public.stock_bookings (project_id);

alter table public.accounts_invoices
  add column if not exists project_id text
    references public.projects(id) on delete set null;

create index if not exists accounts_invoices_project_idx on public.accounts_invoices (project_id);

-- ---------------------------------------------------------------------------
-- 2. Promote existing loose links into the new FKs
-- ---------------------------------------------------------------------------

update public.jobs j
set project_id = l.project_id
from public.project_links l
where l.entity_type = 'job'
  and l.entity_id = j.id
  and j.project_id is null;

update public.stock_requests r
set project_id = l.project_id
from public.project_links l
where l.entity_type = 'stock_request'
  and l.entity_id = r.id
  and r.project_id is null;

update public.stock_bookings b
set project_id = r.project_id
from public.stock_requests r
where b.request_id = r.id
  and r.project_id is not null
  and b.project_id is null;

-- ---------------------------------------------------------------------------
-- 3. Bill of materials — what the build needs
-- ---------------------------------------------------------------------------

create table if not exists public.project_stock_lines (
  id          text primary key,
  project_id  text not null references public.projects(id) on delete cascade,
  product_id  text references public.stock_products(id) on delete set null,
  sundry_id   text references public.stock_sundries(id) on delete set null,
  -- Free-text lines are allowed for material not carried in inventory yet.
  description text not null default '',
  qty_needed  numeric(12,2) not null default 1 check (qty_needed > 0),
  -- Estimate at planning time; actual spend comes from bookings/POs, not here.
  unit_cost   numeric(12,2),
  note        text not null default '',
  created_by  text references public.team_members(id) on delete set null,
  created_at  timestamptz not null default now(),
  check (product_id is not null or sundry_id is not null or description <> '')
);

create index if not exists project_stock_lines_project_idx
  on public.project_stock_lines (project_id);

-- ---------------------------------------------------------------------------
-- 4. Phase staffing — who works which block/stage
-- ---------------------------------------------------------------------------

create table if not exists public.project_phase_staff (
  id            text primary key,
  project_id    text not null references public.projects(id) on delete cascade,
  block_id      text references public.project_blocks(id) on delete cascade,
  stage_id      text references public.project_stages(id) on delete cascade,
  technician_id text not null references public.team_members(id) on delete cascade,
  role          text not null default '',
  note          text not null default '',
  added_by      text references public.team_members(id) on delete set null,
  added_at      timestamptz not null default now()
);

-- One assignment per person per scope; coalesce makes the two nullable
-- dimensions part of the key.
create unique index if not exists project_phase_staff_scope_key
  on public.project_phase_staff (
    project_id, technician_id, coalesce(block_id, ''), coalesce(stage_id, '')
  );

create index if not exists project_phase_staff_project_idx
  on public.project_phase_staff (project_id);
create index if not exists project_phase_staff_tech_idx
  on public.project_phase_staff (technician_id);

-- ---------------------------------------------------------------------------
-- 5. RLS — same shape as the 058 delivery tables
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['project_stock_lines', 'project_phase_staff'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    -- Dropped first so the whole file stays re-runnable: Postgres has no
    -- CREATE POLICY IF NOT EXISTS, and the API's error hints tell an operator
    -- to re-run this migration.
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (public.can_see_project(project_id))',
      t || '_select', t
    );
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (public.can_edit_project(project_id))
         with check (public.can_edit_project(project_id))',
      t || '_write', t
    );
  end loop;
end $$;
