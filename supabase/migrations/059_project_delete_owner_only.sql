-- 059_project_delete_owner_only.sql
--
-- Deleting a project is now the business owner's call alone.
--
-- Migration 046 let anyone holding Projects at `manage` delete one, and 046's own
-- grant block hands `manage` to every manager in the company. That was defensible
-- when a project was a name and a task list. It is not defensible now: 058 hung the
-- block grid, the delay log, the plant register and the cost ledger off the same row,
-- all `on delete cascade`, so one click destroys years of site history — the fibre
-- workbook's entire record of what was built and what held it up. There is no undo
-- and no soft delete, which makes the permission itself the safety mechanism.
--
-- "Owner" here is the ROLE (team_members.role = 'owner'), not projects.owner_id. A
-- project owner is whoever is running that job; letting them erase its history is
-- exactly the case being closed. Editing, archiving and cancelling stay where they
-- were — this changes who can destroy, not who can work.

begin;

/**
 * The break-glass role, on its own.
 *
 * effective_module_level() already knows about it, but only as a step inside a
 * per-module calculation. Deleting is not a module level — no amount of Projects
 * access should grant it — so the check needs to be able to ask the question
 * directly.
 */
create or replace function public.is_owner_role()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select tm.role = 'owner' and coalesce(tm.active, false)
    from public.team_members tm
    where tm.id = public.current_member_id()
  ), false);
$$;

grant execute on function public.is_owner_role() to authenticated;

drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects
  for delete to authenticated
  using (public.is_owner_role());

-- The child tables kept their own delete policies from 046 and 058, which allow a
-- project lead to remove a block or a stage. That stays: pruning one row of a plan is
-- ordinary work. What must not happen is a lead deleting every child row one by one
-- to empty a project they cannot delete outright — but that leaves the project, its
-- code and its audit trail standing, which is a recoverable mess rather than a
-- silent loss. Locking those down too would break the daily editing this module
-- exists for.

commit;
