-- 041_backfill_module_access.sql
--
-- Convert every existing user's single `department` into equivalent module grants.
--
-- The goal is that on the day this ships, NOBODY's access changes. The old rules were:
--   canAccessX(user)          = isOwner(user) || user.department === 'x'
--   canAccessSalesAdmin(user) = isOwner(user) || (manager && department === 'sales')
--   canAccessStockRequests    = stock || coordination
-- and load-gates.ts additionally loaded the CRM bundle for support, stock and
-- coordination users (client QRs, pick lists and jobs all reference leads).
--
-- Those implicit cross-department reads are made explicit here as 'view' grants.
-- Owners are intentionally NOT given rows: role='owner' short-circuits to 'manage'
-- inside effective_module_level(), which stays the break-glass path.

begin;

-- ---------------------------------------------------------------------------
-- 1. Primary grant: the user's own department, at a level matching their role
-- ---------------------------------------------------------------------------
-- 'sales' is the one rename — the module is called 'crm'.

insert into public.user_module_access (user_id, module_key, level, granted_at)
select
  tm.id,
  case tm.department when 'sales' then 'crm' else tm.department end,
  case tm.role when 'manager' then 'manage'::public.access_level
               else 'edit'::public.access_level end,
  now()
from public.team_members tm
where tm.role <> 'owner'
  and tm.department is not null
  and (case tm.department when 'sales' then 'crm' else tm.department end)
      in (select key from public.modules)
on conflict (user_id, module_key) do update set level = excluded.level;

-- ---------------------------------------------------------------------------
-- 2. Everyone can see the staff directory (the old app always loaded it)
-- ---------------------------------------------------------------------------

insert into public.user_module_access (user_id, module_key, level, granted_at)
select tm.id, 'staff', 'view'::public.access_level, now()
from public.team_members tm
where tm.role <> 'owner'
on conflict (user_id, module_key) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Preserve the implicit cross-department reads from lib/store/load-gates.ts
-- ---------------------------------------------------------------------------
-- Support / Stock / Coordination all read sales leads today.

insert into public.user_module_access (user_id, module_key, level, granted_at)
select tm.id, 'crm', 'view'::public.access_level, now()
from public.team_members tm
where tm.role <> 'owner'
  and tm.department in ('support', 'stock', 'coordination')
on conflict (user_id, module_key) do nothing;

-- Coordination creates and reads stock pick lists (canAccessStockRequests).
insert into public.user_module_access (user_id, module_key, level, granted_at)
select tm.id, 'stock', 'edit'::public.access_level, now()
from public.team_members tm
where tm.role <> 'owner'
  and tm.department = 'coordination'
on conflict (user_id, module_key) do nothing;

-- Stock fulfils pick lists raised by coordination, so it reads the jobs they hang off.
insert into public.user_module_access (user_id, module_key, level, granted_at)
select tm.id, 'coordination', 'view'::public.access_level, now()
from public.team_members tm
where tm.role <> 'owner'
  and tm.department = 'stock'
on conflict (user_id, module_key) do nothing;

-- Sales managers previously had the team-management screens.
insert into public.user_module_access (user_id, module_key, level, granted_at)
select tm.id, 'staff', 'edit'::public.access_level, now()
from public.team_members tm
where tm.role = 'manager' and tm.department = 'sales'
on conflict (user_id, module_key) do update set level = excluded.level;

-- ---------------------------------------------------------------------------
-- 4. Report what was created (visible in the SQL editor / CLI output)
-- ---------------------------------------------------------------------------

do $$
declare
  n_users int;
  n_grants int;
  n_owners int;
begin
  select count(*) into n_owners from public.team_members where role = 'owner';
  select count(distinct user_id) into n_users  from public.user_module_access;
  select count(*)                into n_grants from public.user_module_access;
  raise notice 'Backfill complete: % grants across % users (+ % owner(s) with implicit full access)',
    n_grants, n_users, n_owners;
end $$;

commit;
