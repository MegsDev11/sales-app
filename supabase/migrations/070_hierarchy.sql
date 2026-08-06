-- 070_hierarchy.sql — a shape for the company, not just a list of people.
--
-- The access model built in 040 is deliberately FLAT: modules are granted to
-- one person at a time, and above "has admin at manage" there is no rank. That
-- was the right first move — it replaced ten hard-coded department checks — but
-- it cannot express the three things the owner actually asked for:
--
--   1. A GENERAL MANAGER who manages the other managers. Today a GM and a
--      delegated admin are indistinguishable to the system.
--   2. A FINANCIAL MANAGER who is NOT one of the people the GM manages, and
--      who still sees the company. Today anyone with admin/manage can rewrite
--      anyone else's access, finance included.
--   3. Departments that get access as a GROUP — "these departments see every
--      project" — instead of ticking boxes person by person and re-ticking
--      them for every new hire.
--
-- Each is added as a new source of truth rather than a rewrite:
--   role       gains two values, so the two positions have an identity;
--   can_administer() answers who may edit whom, and is the ONLY place that
--              rule lives;
--   department_module_access adds a second subject for grants, folded into
--              effective_module_level() underneath the existing two.
--
-- Nothing here revokes anything. Migration 046 handed the projects module to
-- every non-owner, and narrowing that is a decision with consequences, so the
-- statement to do it is written out at the bottom, commented, for the owner to
-- run deliberately.
--
-- Apply manually in the Supabase SQL editor (repo convention).

-- ---------------------------------------------------------------------------
-- 1. Two more positions
-- ---------------------------------------------------------------------------

alter table public.team_members drop constraint if exists team_members_role_check;
alter table public.team_members
  add constraint team_members_role_check
  check (role in ('owner', 'general_manager', 'financial_manager', 'manager', 'staff'));

-- ---------------------------------------------------------------------------
-- 2. Department-level grants
-- ---------------------------------------------------------------------------
-- Precedence, most specific first: a direct grant to the person, then their
-- template, then whatever their department gets. So a department grant is a
-- FLOOR — it hands a capability to everyone who sits there, including next
-- month's new hire, without stopping an individual being given more.

create table if not exists public.department_module_access (
  department_key text not null references public.departments(key) on delete cascade,
  module_key     text not null references public.modules(key) on delete cascade,
  level          public.access_level not null default 'view',
  granted_by     text references public.team_members(id) on delete set null,
  granted_at     timestamptz not null default now(),
  primary key (department_key, module_key)
);

create index if not exists department_module_access_module_idx
  on public.department_module_access (module_key);

alter table public.department_module_access enable row level security;
revoke all on public.department_module_access from anon;

drop policy if exists department_module_access_select on public.department_module_access;
create policy department_module_access_select on public.department_module_access
  for select to authenticated
  using (true);

drop policy if exists department_module_access_write on public.department_module_access;
create policy department_module_access_write on public.department_module_access
  for all to authenticated
  using ((select public.has_module_access('admin', 'manage')))
  with check ((select public.has_module_access('admin', 'manage')));

-- The audit trail from 044 should cover this table too.
drop trigger if exists department_module_access_audit on public.department_module_access;
create trigger department_module_access_audit
  after insert or update or delete on public.department_module_access
  for each row execute function public.write_audit_log();

-- ---------------------------------------------------------------------------
-- 3. effective_module_level() learns the third source
-- ---------------------------------------------------------------------------

create or replace function public.effective_module_level(p_module text, p_user text default null)
returns public.access_level
language sql stable security definer set search_path = public as $$
  with me as (
    select tm.id, tm.role, tm.active, tm.template_id, tm.department
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
  ),
  departmental as (
    select dma.level
    from public.department_module_access dma
    join me on me.department = dma.department_key
    where dma.module_key = p_module
  )
  select case
    when not coalesce((select active from me), false) then 'none'::public.access_level
    when (select role from me) = 'owner'              then 'manage'::public.access_level
    else coalesce(
      (select level from direct),
      (select level from templated),
      (select level from departmental),
      'none'::public.access_level
    )
  end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Who may administer whom
-- ---------------------------------------------------------------------------
-- The single place this rule lives. Read it as four sentences:
--   Nobody administers an owner through the console — an owner is changed by
--     another owner, at the database, deliberately.
--   Only an owner administers the financial manager. This is the carve-out:
--     a general manager runs the company's operations, not its books.
--   A general manager administers everyone else.
--   Anyone else needs admin/manage, and still cannot touch the two above.

create or replace function public.can_administer(p_actor text, p_target text)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_actor_role  text;
  v_actor_active boolean;
  v_target_role text;
begin
  if p_actor is null or p_target is null then
    return false;
  end if;

  select role, active into v_actor_role, v_actor_active
  from team_members where id = p_actor;
  if not coalesce(v_actor_active, false) then
    return false;
  end if;

  select role into v_target_role from team_members where id = p_target;
  if v_target_role is null then
    return false;
  end if;

  -- An owner is never edited from the access console.
  if v_target_role = 'owner' then
    return false;
  end if;

  if v_actor_role = 'owner' then
    return true;
  end if;

  -- The carve-out: the books are the owner's business and the FM's alone.
  if v_target_role = 'financial_manager' then
    return false;
  end if;

  if v_actor_role = 'general_manager' then
    return true;
  end if;

  -- Everyone else falls back to the module grant, unchanged from 040.
  return public.effective_module_level('admin', p_actor) = 'manage';
end;
$$;

grant execute on function public.can_administer(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Templates for the two positions
-- ---------------------------------------------------------------------------
-- Starting points, not laws — the owner can retick any of it in the console.
-- The GM deliberately gets NO financial or accounts grant: that is what makes
-- the carve-out mean something in practice rather than only on paper.

insert into public.access_templates (id, name, description)
values
  ('tpl_general_mgr', 'General Manager',
   'Runs the company''s operations. Everything except the books.'),
  ('tpl_financial_mgr', 'Financial Manager',
   'Owns the books, and sees the company well enough to read them in context.')
on conflict (id) do nothing;

-- GM: manage across operations, nothing on finance.
insert into public.access_template_modules (template_id, module_key, level)
select 'tpl_general_mgr', m.key, 'manage'::public.access_level
from public.modules m
where m.key in (
  'crm','stock','coordination','support','wireless','fiber',
  'projects','procurement','staff','reception','general','scheduler'
)
on conflict (template_id, module_key) do nothing;

-- FM: the books at manage, plus enough of the company to read them in context.
insert into public.access_template_modules (template_id, module_key, level)
select 'tpl_financial_mgr', m.key, 'manage'::public.access_level
from public.modules m
where m.key in ('financial', 'accounts')
on conflict (template_id, module_key) do nothing;

insert into public.access_template_modules (template_id, module_key, level)
select 'tpl_financial_mgr', m.key, 'view'::public.access_level
from public.modules m
where m.key in ('general', 'projects', 'procurement', 'stock', 'crm', 'staff', 'scheduler')
on conflict (template_id, module_key) do nothing;

-- ---------------------------------------------------------------------------
-- 6. Optional: hand the projects module to departments instead of people
-- ---------------------------------------------------------------------------
-- The wish was "only selected departments are part of projects". Migration 046
-- did the opposite by backfilling a direct grant to every non-owner, and a
-- direct grant beats a department one, so granting departments here changes
-- nothing until those direct rows go.
--
-- That is a real revocation, so it is left for the owner to run knowingly.
-- Adjust the department list, then run both statements together:
--
--   insert into public.department_module_access (department_key, module_key, level)
--   values ('fiber', 'projects', 'edit'),
--          ('wireless', 'projects', 'edit'),
--          ('coordination', 'projects', 'view')
--   on conflict (department_key, module_key) do update set level = excluded.level;
--
--   delete from public.user_module_access uma
--   using public.team_members tm
--   where uma.user_id = tm.id
--     and uma.module_key = 'projects'
--     and tm.role not in ('owner', 'general_manager');
--
-- Check the result before and after with:
--   select tm.name, tm.department, public.effective_module_level('projects', tm.id)
--   from public.team_members tm where tm.active order by tm.department, tm.name;
