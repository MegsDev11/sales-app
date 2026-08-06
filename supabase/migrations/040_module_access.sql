-- 040_module_access.sql
--
-- Phase 1 foundation: replace the single `team_members.department` column with a
-- module-grant model, so a super admin can hand any account access to any module
-- (and at what level) by ticking boxes — no code change, no migration.
--
-- Concepts, deliberately separated:
--   department = org structure. Where a person sits. Drives org charts + notification defaults.
--   module     = a feature area of the software. Granted independently, at a level.
--
-- Effective access on a module = highest of:
--   1. role 'owner'          -> manage on everything (break-glass)
--   2. the user's template   -> access_template_modules
--   3. a direct user grant   -> user_module_access   (wins over the template, incl. an explicit 'none')
--
-- NOTE ON TYPES: every existing table in this schema uses `id text primary key`,
-- including team_members (which stores the Auth UUID as a string). All foreign keys
-- to existing tables are therefore `text`, and every comparison against auth.uid()
-- (a uuid) must cast. Getting this wrong makes every policy throw
-- "operator does not exist: text = uuid".

begin;

-- ---------------------------------------------------------------------------
-- Registries (data, not enums — adding a module or department is an INSERT)
-- ---------------------------------------------------------------------------

create table if not exists public.modules (
  key         text primary key,
  label       text not null,
  description text not null default '',
  icon        text not null default 'Boxes',
  group_name  text not null default 'operations',
  root_path   text not null default '/',
  sort_order  int  not null default 100,
  is_core     boolean not null default false,   -- cannot be switched off company-wide
  active      boolean not null default true
);

create table if not exists public.departments (
  key         text primary key,
  label       text not null,
  manager_id  text references public.team_members(id) on delete set null,
  parent_key  text references public.departments(key) on delete set null,
  sort_order  int not null default 100,
  active      boolean not null default true
);

do $$ begin
  create type public.access_level as enum ('none','view','edit','manage');
exception when duplicate_object then null;
end $$;

create table if not exists public.access_templates (
  id          text primary key,
  name        text not null unique,
  description text not null default '',
  created_at  timestamptz not null default now()
);

create table if not exists public.access_template_modules (
  template_id text not null references public.access_templates(id) on delete cascade,
  module_key  text not null references public.modules(key)          on delete cascade,
  level       public.access_level not null default 'view',
  primary key (template_id, module_key)
);

create table if not exists public.user_module_access (
  user_id     text not null references public.team_members(id) on delete cascade,
  module_key  text not null references public.modules(key)     on delete cascade,
  level       public.access_level not null default 'view',
  granted_by  text references public.team_members(id) on delete set null,
  granted_at  timestamptz not null default now(),
  expires_at  timestamptz,
  primary key (user_id, module_key)
);

create index if not exists user_module_access_user_idx
  on public.user_module_access (user_id, module_key);

alter table public.team_members
  add column if not exists template_id text references public.access_templates(id) on delete set null;

-- The existing `department` column is KEPT, but its meaning narrows to org structure
-- only (it no longer decides what the software shows you — grants do). The hardcoded
-- CHECK constraint is replaced by a foreign key to the departments table below, so
-- adding "HR" or "Legal" becomes an INSERT instead of a schema migration.
alter table public.team_members    drop constraint if exists team_members_department_check;
alter table public.app_notifications drop constraint if exists app_notifications_department_check;

-- ---------------------------------------------------------------------------
-- Seed: modules
-- ---------------------------------------------------------------------------

insert into public.modules (key, label, description, icon, group_name, root_path, sort_order, is_core) values
  ('crm',          'Sales / CRM',   'Leads, pipeline, site surveys, sales analytics', 'Kanban',        'commercial',  '/dashboard',    10,  true),
  ('reception',    'Reception',     'Walk-in clients and front desk',                'ConciergeBell', 'commercial',  '/reception',    20,  false),
  ('accounts',     'Accounts',      'Client accounts and packages',                  'BookUser',      'commercial',  '/accounts',     30,  false),
  ('support',      'Support',       'Tickets, towers, outages, client messaging',    'Headphones',    'operations',  '/support',      40,  true),
  ('coordination', 'Coordination',  'Jobs, job cards, technicians, timesheets',      'Network',       'operations',  '/coordination', 50,  true),
  ('stock',        'Stock',         'Inventory, QR tracking, pick lists, vehicles',  'Package',       'operations',  '/stock',        60,  true),
  ('procurement',  'Procurement',   'Suppliers, purchase orders, reorder alerts',    'ShoppingCart',  'operations',  '/procurement',  70,  false),
  ('wireless',     'Wireless',      'Network layouts, devices, Ruijie sync',         'Wifi',          'operations',  '/wireless',     80,  false),
  ('fiber',        'Fiber',         'Fiber operations',                              'Cable',         'operations',  '/fiber',        90,  false),
  ('projects',     'Projects',      'Cross-department projects and business ideas',  'FolderKanban',  'operations',  '/projects',     100, false),
  ('financial',    'Financial',     'Fuel, expenses, invoicing, budgets',            'Wallet',        'commercial',  '/financial',    110, false),
  ('general',      'General',       'General management',                            'Briefcase',     'operations',  '/general',      120, false),
  ('staff',        'Staff',         'Staff directory and profiles',                  'Users',         'admin',       '/staff',        130, true),
  ('admin',        'Administration','Module access, templates, departments, audit',  'ShieldCheck',   'admin',       '/admin',        140, true)
on conflict (key) do update set
  label       = excluded.label,
  description = excluded.description,
  icon        = excluded.icon,
  group_name  = excluded.group_name,
  root_path   = excluded.root_path,
  sort_order  = excluded.sort_order,
  is_core     = excluded.is_core;

-- ---------------------------------------------------------------------------
-- Seed: departments (mirrors the old CHECK constraint values, now as rows)
-- ---------------------------------------------------------------------------

insert into public.departments (key, label, sort_order) values
  ('sales',        'Sales',        10),
  ('reception',    'Reception',    20),
  ('accounts',     'Accounts',     30),
  ('support',      'Support',      40),
  ('coordination', 'Coordination', 50),
  ('stock',        'Stock',        60),
  ('wireless',     'Wireless',     70),
  ('fiber',        'Fiber',        80),
  ('financial',    'Financial',    90),
  ('general',      'General',      100)
on conflict (key) do update set label = excluded.label, sort_order = excluded.sort_order;

-- Now that every legacy department value exists as a row, constrain the column by
-- foreign key instead of by CHECK. Any row holding an unknown value is nulled first
-- so the constraint can be added without failing.
update public.team_members
   set department = null
 where department is not null
   and department not in (select key from public.departments);

alter table public.team_members drop constraint if exists team_members_department_fkey;
alter table public.team_members
  add constraint team_members_department_fkey
  foreign key (department) references public.departments(key) on delete set null;

-- ---------------------------------------------------------------------------
-- Seed: access templates (so you tick one box for a new hire, not twelve)
-- ---------------------------------------------------------------------------

insert into public.access_templates (id, name, description) values
  ('tpl_sales_rep',    'Sales Representative', 'Pipeline board and own stats'),
  ('tpl_sales_mgr',    'Sales Manager',        'Full CRM including team and analytics'),
  ('tpl_field_tech',   'Field Technician',     'Jobs, job cards, stock pick lists'),
  ('tpl_coord_mgr',    'Coordination Manager', 'Full coordination plus stock visibility'),
  ('tpl_stock_ctrl',   'Stock Controller',     'Full stock and vehicle management'),
  ('tpl_support_agent','Support Agent',        'Support desk plus client visibility'),
  ('tpl_finance_mgr',  'Finance Manager',      'Financial module plus read-only ops context')
on conflict (id) do nothing;

insert into public.access_template_modules (template_id, module_key, level) values
  ('tpl_sales_rep',     'crm',          'edit'),
  ('tpl_sales_mgr',     'crm',          'manage'),
  ('tpl_sales_mgr',     'staff',        'view'),
  ('tpl_field_tech',    'coordination', 'edit'),
  ('tpl_field_tech',    'stock',        'view'),
  ('tpl_coord_mgr',     'coordination', 'manage'),
  ('tpl_coord_mgr',     'stock',        'edit'),
  ('tpl_coord_mgr',     'crm',          'view'),
  ('tpl_stock_ctrl',    'stock',        'manage'),
  ('tpl_stock_ctrl',    'crm',          'view'),
  ('tpl_support_agent', 'support',      'edit'),
  ('tpl_support_agent', 'crm',          'view'),
  ('tpl_finance_mgr',   'financial',    'manage'),
  ('tpl_finance_mgr',   'stock',        'view'),
  ('tpl_finance_mgr',   'coordination', 'view')
on conflict (template_id, module_key) do update set level = excluded.level;

-- ---------------------------------------------------------------------------
-- Access functions
-- ---------------------------------------------------------------------------
-- All SECURITY DEFINER. This matters for more than convenience: the policy on
-- team_members itself calls has_module_access(), which reads team_members. Running
-- as the table owner bypasses RLS inside the function and breaks that recursion.

create or replace function public.access_rank(l public.access_level)
returns int language sql immutable parallel safe as $$
  select case l
    when 'manage' then 3
    when 'edit'   then 2
    when 'view'   then 1
    else 0
  end;
$$;

-- Resolve the signed-in Auth user to a team_members.id.
-- Handles both linkage styles present in this schema (see 002_auth.sql).
create or replace function public.current_member_id()
returns text
language sql stable security definer set search_path = public as $$
  select id from public.team_members
  where id = auth.uid()::text or auth_user_id = auth.uid()
  limit 1;
$$;

create or replace function public.effective_module_level(p_module text, p_user text default null)
returns public.access_level
language sql stable security definer set search_path = public as $$
  with me as (
    select tm.id, tm.role, tm.active, tm.template_id
    from public.team_members tm
    where tm.id = coalesce(p_user, public.current_member_id())
  ),
  direct as (
    select uma.level
    from public.user_module_access uma
    join me on me.id = uma.user_id
    where uma.module_key = p_module
      and (uma.expires_at is null or uma.expires_at > now())
  ),
  templated as (
    select atm.level
    from public.access_template_modules atm
    join me on me.template_id = atm.template_id
    where atm.module_key = p_module
  )
  select case
    when not coalesce((select active from me), false) then 'none'::public.access_level
    when (select role from me) = 'owner'              then 'manage'::public.access_level
    else coalesce(
      (select level from direct),
      (select level from templated),
      'none'::public.access_level
    )
  end;
$$;

create or replace function public.has_module_access(
  p_module text,
  p_min    public.access_level default 'view'
) returns boolean
language sql stable security definer set search_path = public as $$
  select public.access_rank(public.effective_module_level(p_module))
       >= public.access_rank(p_min);
$$;

-- Convenience for tables that legitimately serve more than one module
-- (e.g. stock pick lists are used by both Stock and Coordination).
create or replace function public.has_any_module_access(
  p_modules text[],
  p_min     public.access_level default 'view'
) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from unnest(p_modules) m
    where public.has_module_access(m, p_min)
  );
$$;

grant execute on function public.access_rank(public.access_level)                    to authenticated, anon;
grant execute on function public.current_member_id()                                 to authenticated;
grant execute on function public.effective_module_level(text, text)                  to authenticated;
grant execute on function public.has_module_access(text, public.access_level)        to authenticated;
grant execute on function public.has_any_module_access(text[], public.access_level)  to authenticated;

-- ---------------------------------------------------------------------------
-- RLS on the new tables
-- ---------------------------------------------------------------------------

alter table public.modules                enable row level security;
alter table public.departments            enable row level security;
alter table public.access_templates       enable row level security;
alter table public.access_template_modules enable row level security;
alter table public.user_module_access     enable row level security;

-- Every signed-in user may READ the registries (the nav is built from them).
drop policy if exists "modules readable" on public.modules;
create policy "modules readable" on public.modules            for select to authenticated using (true);
drop policy if exists "departments readable" on public.departments;
create policy "departments readable" on public.departments        for select to authenticated using (true);
drop policy if exists "templates readable" on public.access_templates;
create policy "templates readable" on public.access_templates   for select to authenticated using (true);
drop policy if exists "template modules readable" on public.access_template_modules;
create policy "template modules readable" on public.access_template_modules for select to authenticated using (true);

-- A user may read their OWN grants; admins read everyone's.
drop policy if exists "own grants readable" on public.user_module_access;
create policy "own grants readable" on public.user_module_access for select to authenticated
  using (user_id = public.current_member_id() or public.has_module_access('admin','view'));

-- Only the admin module at 'manage' may change any of it.
drop policy if exists "modules admin" on public.modules;
create policy "modules admin" on public.modules            for all to authenticated
  using (public.has_module_access('admin','manage')) with check (public.has_module_access('admin','manage'));
drop policy if exists "departments admin" on public.departments;
create policy "departments admin" on public.departments        for all to authenticated
  using (public.has_module_access('admin','manage')) with check (public.has_module_access('admin','manage'));
drop policy if exists "templates admin" on public.access_templates;
create policy "templates admin" on public.access_templates   for all to authenticated
  using (public.has_module_access('admin','manage')) with check (public.has_module_access('admin','manage'));
drop policy if exists "template modules admin" on public.access_template_modules;
create policy "template modules admin" on public.access_template_modules for all to authenticated
  using (public.has_module_access('admin','manage')) with check (public.has_module_access('admin','manage'));
drop policy if exists "grants admin" on public.user_module_access;
create policy "grants admin" on public.user_module_access for all to authenticated
  using (public.has_module_access('admin','manage')) with check (public.has_module_access('admin','manage'));

commit;
