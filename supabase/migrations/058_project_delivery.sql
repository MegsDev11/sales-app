-- 058_project_delivery.sql
--
-- How a project is actually delivered, modelled on the fibre project sheet that has
-- been running the work until now.
--
-- Migration 046 gave projects a task list. A task list is the wrong shape for this
-- business: a fibre project is not N loose to-dos, it is a GRID. The estate is cut
-- into blocks or phases, every block goes through the same run of stages — plan,
-- trench, string, splice, test, patch, CAC — and the question asked every morning is
-- "which stage is block 12 on?", not "what tasks are open?". Progress is then read
-- off the grid rather than typed in by anyone.
--
--   project_stages        the columns: the run of work every block goes through
--   project_blocks        the rows: Block 1..31, or Phase 1..7
--   project_block_stages  the cells: one status per block per stage
--
-- Two more things the sheet tracked that a task list cannot express:
--
--   project_resources  the plant register — bakkie, cherry picker, trencher, fuel.
--                      Tracked twice over, because "we have it" and "it works" are
--                      different questions and it was almost always the second one
--                      that stopped a job.
--   project_issues     the delay log. Each issue is stamped when it opens and when
--                      it closes, and the days it stayed open are what push the
--                      completion date out. The revised end date is the estimate
--                      plus the sum of those days, which is how the sheet got from
--                      "due 25 Aug" to the day it actually landed.
--
-- Progress and delay are NOT stored. They are derived in lib/projects/progress.ts so
-- one definition serves the project page, the portfolio table and any later report —
-- exactly as the sheet derived them from COUNTIFS rather than keeping a typed-in %.

begin;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

-- The sheet's Data-sheet dropdown: Complete / in progress / Not Started. `na` is
-- added for the "N/A" rows that were typed in by hand, and it is excluded from
-- progress denominators rather than counted as incomplete — a block with no trees to
-- cut must not hold the tree-cutting column below 100%.
do $$ begin
  create type public.project_work_status as enum
    ('not_started','in_progress','complete','na');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Header facts the sheet kept above the grid
-- ---------------------------------------------------------------------------

alter table public.projects add column if not exists quote_number text;
alter table public.projects add column if not exists quote_amount numeric(14,2);

-- Which template seeded the stages, so the UI can offer the right vocabulary later
-- and so a maintenance project is distinguishable from a build at a glance.
alter table public.projects add column if not exists delivery_template text;

-- ---------------------------------------------------------------------------
-- The grid
-- ---------------------------------------------------------------------------

create table if not exists public.project_stages (
  id          text primary key,
  project_id  text not null references public.projects(id) on delete cascade,
  name        text not null,
  order_index int  not null default 0,

  -- CAC and tree-cutting are tracked but sit outside the completion figure in the
  -- sheet. Rather than hard-code which those are, each stage says whether it counts.
  counts_to_progress boolean not null default true,

  created_at  timestamptz not null default now(),
  unique (project_id, name)
);
create index if not exists project_stages_project_idx
  on public.project_stages (project_id, order_index);

create table if not exists public.project_blocks (
  id              text primary key,
  project_id      text not null references public.projects(id) on delete cascade,
  name            text not null,                    -- 'Block 12' | 'Phase 3'
  units           int,                              -- homes passed in that block
  start_date      date,
  end_date        date,
  actual_end_date date,
  planner_id      text references public.team_members(id) on delete set null,
  notes           text not null default '',
  order_index     int  not null default 0,
  created_at      timestamptz not null default now(),
  unique (project_id, name)
);
create index if not exists project_blocks_project_idx
  on public.project_blocks (project_id, order_index);

-- One cell of the grid.
--
-- project_id is denormalised off the block on purpose: every RLS policy in the
-- projects family is `can_see_project(project_id)`, and carrying the column keeps
-- this table in that same one-line pattern instead of joining back through blocks on
-- every row read. The trigger below keeps it honest.
create table if not exists public.project_block_stages (
  block_id   text not null references public.project_blocks(id) on delete cascade,
  stage_id   text not null references public.project_stages(id) on delete cascade,
  project_id text not null references public.projects(id) on delete cascade,
  status     public.project_work_status not null default 'not_started',
  note       text not null default '',
  updated_by text references public.team_members(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (block_id, stage_id)
);
create index if not exists project_block_stages_project_idx
  on public.project_block_stages (project_id);
create index if not exists project_block_stages_stage_idx
  on public.project_block_stages (stage_id);

create or replace function public.sync_block_stage_project()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select b.project_id into new.project_id
    from public.project_blocks b where b.id = new.block_id;
  return new;
end;
$$;

drop trigger if exists trg_sync_block_stage_project on public.project_block_stages;
create trigger trg_sync_block_stage_project
  before insert or update of block_id on public.project_block_stages
  for each row execute function public.sync_block_stage_project();

-- ---------------------------------------------------------------------------
-- Milestones: the headline run across the top of the sheet
-- ---------------------------------------------------------------------------
-- 046 already had project_milestones as a dated checklist. The sheet treats them as
-- a status strip instead — Quote accepted / Stock ordered / Main uplinks / Feeder /
-- Distribution / Unit installs / Megs config — so it gains a status and a note. The
-- date columns stay and remain optional.

alter table public.project_milestones
  add column if not exists status public.project_work_status not null default 'not_started';
alter table public.project_milestones
  add column if not exists note text not null default '';

-- ---------------------------------------------------------------------------
-- Plant and equipment
-- ---------------------------------------------------------------------------

create table if not exists public.project_resources (
  id            text primary key,
  project_id    text not null references public.projects(id) on delete cascade,
  name          text not null,                -- 'Cherry picker', 'Allocated bakkie'
  priority      int,
  start_date    date,
  end_date      date,

  -- Two independent questions, because the answers routinely differ: the trencher was
  -- allocated to Hide Away and simultaneously not in working condition, and only the
  -- second fact explains why the team was digging by hand.
  acquired      public.project_work_status not null default 'not_started',
  working_order public.project_work_status not null default 'not_started',

  -- Optional tie to the vehicle register, so "which project has the bakkie" is
  -- answerable from either end.
  vehicle_id    text,
  notes         text not null default '',
  order_index   int  not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists project_resources_project_idx
  on public.project_resources (project_id, order_index);

-- Only link to vehicles if that module's table is present.
do $$ begin
  alter table public.project_resources
    add constraint project_resources_vehicle_fkey
    foreign key (vehicle_id) references public.vehicles(id) on delete set null;
exception when duplicate_object then null;
        when undefined_table then null;
        when undefined_column then null;
end $$;

-- ---------------------------------------------------------------------------
-- The delay log
-- ---------------------------------------------------------------------------
-- The one table that makes a slipped date explicable. Every issue carries the hours
-- it was open; those hours are what the revised completion date is built from, and
-- counting them by type is what turns "we are always late" into "the cherry picker
-- cost us five weeks this year".

create table if not exists public.project_issues (
  id          text primary key,
  project_id  text not null references public.projects(id) on delete cascade,
  -- Which block was held up, when it was only one.
  block_id    text references public.project_blocks(id) on delete set null,
  issue_type  text not null default 'Other',
  description text not null default '',

  logged_at   timestamptz not null default now(),
  resolved_at timestamptz,

  logged_by   text references public.team_members(id) on delete set null,
  resolved_by text references public.team_members(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists project_issues_project_idx
  on public.project_issues (project_id, logged_at desc);
-- "Everything still open", the portfolio's first question.
create index if not exists project_issues_open_idx
  on public.project_issues (project_id) where resolved_at is null;

-- ---------------------------------------------------------------------------
-- Documents
-- ---------------------------------------------------------------------------
-- project_links (046) points at records inside this app. The BOQ, the KMZ, the photo
-- folder and the live Google Earth view live outside it, and losing them is how a
-- project becomes unauditable a year later.

create table if not exists public.project_documents (
  id          text primary key,
  project_id  text not null references public.projects(id) on delete cascade,
  label       text not null,                  -- 'BOQ', 'Live KMZ', 'Photo folder'
  url         text not null,
  order_index int  not null default 0,
  added_by    text references public.team_members(id) on delete set null,
  added_at    timestamptz not null default now()
);
create index if not exists project_documents_project_idx
  on public.project_documents (project_id, order_index);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Same shape as 046: readable if the project is readable, writable if the project is
-- editable. The two exceptions are below.

do $$
declare t text;
begin
  foreach t in array array[
    'project_stages','project_blocks','project_block_stages',
    'project_resources','project_issues','project_documents'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);

    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (public.can_see_project(project_id))', t || '_select', t);

    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (public.can_edit_project(project_id))
         with check (public.can_edit_project(project_id))', t || '_write', t);
  end loop;
end $$;

-- Exception 1: grid cells.
--
-- The person who closes off a block is the team lead standing in it, not a project
-- manager at a desk. Requiring edit rights on the whole project to tick one cell is
-- how a live grid becomes a Friday-afternoon retyping job, so any project MEMBER may
-- move a cell. Adding or removing blocks and stages still needs edit rights, which
-- keeps the shape of the grid under control while its contents stay current.
drop policy if exists project_block_stages_write on public.project_block_stages;

drop policy if exists project_block_stages_upsert on public.project_block_stages;
create policy project_block_stages_upsert on public.project_block_stages
  for insert to authenticated
  with check (
    public.can_edit_project(project_id)
    or exists (
      select 1 from public.project_members pm
      where pm.project_id = project_block_stages.project_id
        and pm.user_id = public.current_member_id()
    )
  );

drop policy if exists project_block_stages_update on public.project_block_stages;
create policy project_block_stages_update on public.project_block_stages
  for update to authenticated
  using (
    public.can_edit_project(project_id)
    or exists (
      select 1 from public.project_members pm
      where pm.project_id = project_block_stages.project_id
        and pm.user_id = public.current_member_id()
    )
  )
  with check (
    public.can_edit_project(project_id)
    or exists (
      select 1 from public.project_members pm
      where pm.project_id = project_block_stages.project_id
        and pm.user_id = public.current_member_id()
    )
  );

drop policy if exists project_block_stages_delete on public.project_block_stages;
create policy project_block_stages_delete on public.project_block_stages
  for delete to authenticated using (public.can_edit_project(project_id));

-- Exception 2: issues.
--
-- Same reasoning, and it matters more. An issue logged three days late has already
-- lost the three days it was meant to account for, so anyone on the project may log
-- one and mark it resolved. Editing someone else's wording or deleting the record
-- stays with the leads — the delay history is the audit trail.
drop policy if exists project_issues_write on public.project_issues;

drop policy if exists project_issues_insert on public.project_issues;
create policy project_issues_insert on public.project_issues
  for insert to authenticated
  with check (
    public.can_edit_project(project_id)
    or exists (
      select 1 from public.project_members pm
      where pm.project_id = project_issues.project_id
        and pm.user_id = public.current_member_id()
    )
  );

drop policy if exists project_issues_update on public.project_issues;
create policy project_issues_update on public.project_issues
  for update to authenticated
  using (
    public.can_edit_project(project_id)
    or logged_by = public.current_member_id()
    or exists (
      select 1 from public.project_members pm
      where pm.project_id = project_issues.project_id
        and pm.user_id = public.current_member_id()
    )
  )
  with check (
    public.can_edit_project(project_id)
    or logged_by = public.current_member_id()
    or exists (
      select 1 from public.project_members pm
      where pm.project_id = project_issues.project_id
        and pm.user_id = public.current_member_id()
    )
  );

drop policy if exists project_issues_delete on public.project_issues;
create policy project_issues_delete on public.project_issues
  for delete to authenticated using (public.can_edit_project(project_id));

commit;
