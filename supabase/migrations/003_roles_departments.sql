-- Role hierarchy: owner > manager > staff, scoped by department
alter table public.team_members
  add column if not exists department text check (department in ('sales', 'stock', 'coordination'));

alter table public.team_members drop constraint if exists team_members_role_check;

update public.team_members set role = 'manager', department = coalesce(department, 'sales') where role = 'admin';
update public.team_members set role = 'staff', department = coalesce(department, 'sales') where role = 'sales';

alter table public.team_members
  add constraint team_members_role_check check (role in ('owner', 'manager', 'staff'));
