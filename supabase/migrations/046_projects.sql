-- 046_projects.sql
--
-- Projects: the layer where departments meet.
--
-- The important table here is `project_links`. Without it this is just another task
-- board; with it a project can pull in the actual leads, jobs, pick lists, tower sites
-- and calendar events that live in other modules, so "get the departments working
-- together" means something concrete rather than everyone filing into the same folder.
--
-- Business ideas are a project TYPE with a lighter status pipeline
-- (idea -> evaluating -> approved -> active), not a separate entity. One pipeline,
-- one set of screens, and an idea that gets approved becomes the project itself
-- rather than being retyped.

begin;

-- ---------------------------------------------------------------------------
-- Module registration
-- ---------------------------------------------------------------------------

insert into public.modules (key, label, description, icon, group_name, root_path, sort_order, is_core)
values ('projects', 'Projects', 'Cross-department projects and business ideas',
        'FolderKanban', 'operations', '/projects', 100, false)
on conflict (key) do update set
  label = excluded.label, description = excluded.description, icon = excluded.icon,
  group_name = excluded.group_name, root_path = excluded.root_path;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.project_status as enum
    ('idea','evaluating','approved','active','on_hold','completed','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.project_type as enum
    ('business_idea','client_install','infrastructure','maintenance','internal','rd');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.project_member_role as enum ('lead','contributor','reviewer','viewer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.task_status as enum ('todo','in_progress','blocked','review','done');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.projects (
  id             text primary key,
  code           text unique not null,             -- PRJ-0042
  name           text not null,
  description    text not null default '',
  type           public.project_type   not null default 'internal',
  status         public.project_status not null default 'idea',
  priority       text not null default 'medium',   -- low | medium | high

  owner_id       text references public.team_members(id) on delete set null,
  client_lead_id text references public.leads(id)        on delete set null,

  start_date     date,
  target_date    date,
  completed_at   timestamptz,

  budget_amount  numeric(14,2),
  actual_cost    numeric(14,2) not null default 0,

  -- Private projects are members-only even for people who can otherwise see the
  -- module. Restructures and acquisitions need this; most projects do not.
  is_private     boolean not null default false,

  created_by     text references public.team_members(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists projects_status_idx on public.projects (status);
create index if not exists projects_type_idx   on public.projects (type);

create table if not exists public.project_members (
  project_id text not null references public.projects(id) on delete cascade,
  user_id    text not null references public.team_members(id) on delete cascade,
  role       public.project_member_role not null default 'contributor',
  added_by   text references public.team_members(id) on delete set null,
  added_at   timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index if not exists project_members_user_idx on public.project_members (user_id);

-- Which departments are formally involved. Drives per-department project lists
-- without having to enumerate members.
create table if not exists public.project_departments (
  project_id text not null references public.projects(id) on delete cascade,
  module_key text not null references public.modules(key) on delete cascade,
  primary key (project_id, module_key)
);

create table if not exists public.project_tasks (
  id             text primary key,
  project_id     text not null references public.projects(id) on delete cascade,
  parent_task_id text references public.project_tasks(id) on delete cascade,
  title          text not null,
  description    text not null default '',
  status         public.task_status not null default 'todo',
  assignee_id    text references public.team_members(id) on delete set null,
  module_key     text references public.modules(key) on delete set null,
  due_date       date,
  estimate_hours numeric(6,2),
  actual_hours   numeric(6,2),
  order_index    int not null default 0,
  created_by     text references public.team_members(id) on delete set null,
  created_at     timestamptz not null default now(),
  completed_at   timestamptz
);
create index if not exists project_tasks_project_idx  on public.project_tasks (project_id, order_index);
create index if not exists project_tasks_assignee_idx on public.project_tasks (assignee_id);

create table if not exists public.project_milestones (
  id           text primary key,
  project_id   text not null references public.projects(id) on delete cascade,
  title        text not null,
  due_date     date,
  completed_at timestamptz,
  order_index  int not null default 0
);

-- ★ The cross-module glue.
create table if not exists public.project_links (
  id          text primary key,
  project_id  text not null references public.projects(id) on delete cascade,
  entity_type text not null,   -- lead | job | stock_request | tower_site
                               -- | network_layout | calendar_event | document
  entity_id   text not null,
  label       text not null default '',
  linked_by   text references public.team_members(id) on delete set null,
  linked_at   timestamptz not null default now(),
  unique (project_id, entity_type, entity_id)
);
-- Reverse lookup: "which projects touch this lead?" on the lead page.
create index if not exists project_links_entity_idx on public.project_links (entity_type, entity_id);

create table if not exists public.project_updates (
  id         text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  author_id  text references public.team_members(id) on delete set null,
  body       text not null,
  kind       text not null default 'note',   -- note | status_change | risk | decision
  created_at timestamptz not null default now()
);
create index if not exists project_updates_project_idx on public.project_updates (project_id, created_at desc);

create table if not exists public.project_costs (
  id          text primary key,
  project_id  text not null references public.projects(id) on delete cascade,
  description text not null,
  amount      numeric(14,2) not null,
  category    text not null default 'other',   -- labour | stock | fuel | subcontract | other
  incurred_on date not null default current_date,
  ref_type    text,
  ref_id      text,
  created_by  text references public.team_members(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists project_costs_project_idx on public.project_costs (project_id);

-- Now that projects exist, tie the scheduler's project_id to them properly.
do $$ begin
  alter table public.calendar_events
    add constraint calendar_events_project_fkey
    foreign key (project_id) references public.projects(id) on delete set null;
exception when duplicate_object then null;
        when undefined_table then null;
end $$;

-- ---------------------------------------------------------------------------
-- Visibility
-- ---------------------------------------------------------------------------

-- Holding the Projects module is a PREREQUISITE, not one option among several.
--
-- The first version treated membership and ownership as independent grounds for
-- access, which meant revoking someone's Projects module still left them able to read
-- projects they owned or belonged to. The navigation and route guard hid the module
-- while the database kept serving rows — precisely the sort of disagreement that
-- turns into a surprise later. Membership now decides WHICH projects you see inside
-- the module; the module grant decides whether you get in at all.
create or replace function public.can_see_project(p_project text)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select
      public.has_module_access('projects','view')
      and (
        -- Project managers see everything, including private projects.
        public.has_module_access('projects','manage')
        -- Members and owners see their own, even when private.
        or exists (
          select 1 from public.project_members pm
          where pm.project_id = p.id and pm.user_id = public.current_member_id()
        )
        or p.owner_id = public.current_member_id()
        -- Everyone else sees the non-private ones.
        or not p.is_private
      )
    from public.projects p
    where p.id = p_project
  ), false);
$$;

-- May this user change the project? Owner, project lead, or a module manager —
-- and in every case they must still hold the module at `edit`.
create or replace function public.can_edit_project(p_project text)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select
      public.has_module_access('projects','edit')
      and (
        public.has_module_access('projects','manage')
        or p.owner_id = public.current_member_id()
        or exists (
          select 1 from public.project_members pm
          where pm.project_id = p.id
            and pm.user_id = public.current_member_id()
            and pm.role = 'lead'
        )
      )
    from public.projects p
    where p.id = p_project
  ), false);
$$;

grant execute on function public.can_see_project(text)  to authenticated;
grant execute on function public.can_edit_project(text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'projects','project_members','project_departments','project_tasks',
    'project_milestones','project_links','project_updates','project_costs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
  for select to authenticated using (public.can_see_project(id));

drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects
  for insert to authenticated
  with check ((select public.has_module_access('projects','edit')));

drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects
  for update to authenticated
  using (public.can_edit_project(id)) with check (public.can_edit_project(id));

drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects
  for delete to authenticated
  using ((select public.has_module_access('projects','manage')));

-- Child tables: readable if the project is, writable if the project is editable.
-- Tasks are the exception — an assignee may progress their own task without being
-- a project lead, which is the whole point of assigning work across departments.
do $$
declare t text;
begin
  foreach t in array array[
    'project_members','project_departments','project_milestones',
    'project_links','project_updates','project_costs'
  ] loop
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

drop policy if exists project_tasks_select on public.project_tasks;
create policy project_tasks_select on public.project_tasks
  for select to authenticated using (public.can_see_project(project_id));

drop policy if exists project_tasks_insert on public.project_tasks;
create policy project_tasks_insert on public.project_tasks
  for insert to authenticated with check (public.can_edit_project(project_id));

-- An assignee may update their own task; leads and managers may update any.
drop policy if exists project_tasks_update on public.project_tasks;
create policy project_tasks_update on public.project_tasks
  for update to authenticated
  using (
    assignee_id = public.current_member_id()
    or public.can_edit_project(project_id)
  )
  with check (
    assignee_id = public.current_member_id()
    or public.can_edit_project(project_id)
  );

drop policy if exists project_tasks_delete on public.project_tasks;
create policy project_tasks_delete on public.project_tasks
  for delete to authenticated using (public.can_edit_project(project_id));

-- ---------------------------------------------------------------------------
-- Project code sequence (PRJ-0001, PRJ-0002, …)
-- ---------------------------------------------------------------------------

create sequence if not exists public.project_code_seq start 1;

create or replace function public.next_project_code()
returns text language sql volatile security definer set search_path = public as $$
  select 'PRJ-' || lpad(nextval('public.project_code_seq')::text, 4, '0');
$$;

grant execute on function public.next_project_code() to authenticated;

-- ---------------------------------------------------------------------------
-- Keep actual_cost in step with project_costs
-- ---------------------------------------------------------------------------
-- A trigger rather than application code: the total is then correct no matter which
-- route, script or manual fix inserted the cost row.

create or replace function public.sync_project_actual_cost()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  target text := coalesce(new.project_id, old.project_id);
begin
  update public.projects
     set actual_cost = coalesce((
           select sum(amount) from public.project_costs where project_id = target
         ), 0),
         updated_at = now()
   where id = target;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_project_cost on public.project_costs;
create trigger trg_sync_project_cost
  after insert or update or delete on public.project_costs
  for each row execute function public.sync_project_actual_cost();

-- ---------------------------------------------------------------------------
-- Grants: everyone who has the scheduler gets projects at the same level
-- ---------------------------------------------------------------------------
-- Projects are a company-wide coordination surface; locking them to one department
-- would defeat the point. Owners keep implicit full access.

insert into public.user_module_access (user_id, module_key, level, granted_at)
select tm.id, 'projects',
       case when tm.role = 'manager' then 'manage'::public.access_level
            else 'edit'::public.access_level end,
       now()
from public.team_members tm
where tm.role <> 'owner'
on conflict (user_id, module_key) do nothing;

commit;
