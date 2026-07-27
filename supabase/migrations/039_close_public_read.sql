-- 039_close_public_read.sql
--
-- SECURITY HOTFIX. Apply before anything else in the ops-platform plan.
--
-- Two problems this closes:
--
-- 1. Migration 025 dropped the "Allow anon write ..." policies but left the
--    matching "Allow anon read ..." policies in place. NEXT_PUBLIC_SUPABASE_ANON_KEY
--    ships inside the browser bundle, so those policies made the following readable
--    by anyone on the internet with no login:
--      - leads              (client names, phones, emails, addresses, deal values)
--      - team_members       (staff names, emails, login_password_ciphertext)
--      - stock_items        (client_name, client_address, client_pppoe, wifi_password)
--      - stock_* , towers, tower_outages, activities
--
--    Policies created in 006/007/011 additionally omit the TO clause, which in
--    Postgres means TO PUBLIC — every role, not just anon.
--
-- 2. "Allow authenticated write team_members" is `for all ... using (true)`,
--    which lets any signed-in staff member run
--        update team_members set role = 'owner' where id = <self>
--    and escalate to owner.
--
-- Verified safe to apply: nothing in the app reads via the anon role.
--   - Public network status  -> /api/network-status (service role)
--   - Public QR client portal -> /api/stock/item/[token]/portal (service role)
--   - Browser data access     -> lib/supabase/client.ts returns the *auth* client,
--                                so all reads already run as `authenticated`.

begin;

-- ---------------------------------------------------------------------------
-- 1. Remove every remaining anonymous / PUBLIC read policy
-- ---------------------------------------------------------------------------

drop policy if exists "Allow anon read team_members"        on public.team_members;
drop policy if exists "Allow anon read leads"               on public.leads;
drop policy if exists "Allow anon read activities"          on public.activities;
drop policy if exists "Allow anon read towers"              on public.towers;
drop policy if exists "Allow anon read tower_outages"       on public.tower_outages;
drop policy if exists "Allow anon read stock_products"      on public.stock_products;
drop policy if exists "Allow anon read stock_items"         on public.stock_items;
drop policy if exists "Allow anon read stock_bookings"      on public.stock_bookings;
drop policy if exists "Allow anon read stock_requests"      on public.stock_requests;
drop policy if exists "Allow anon read stock_request_lines" on public.stock_request_lines;
drop policy if exists "Allow anon read stock_qr_labels"     on public.stock_qr_labels;

-- Safety net: revoke the underlying table grant from anon as well, so a future
-- accidentally-permissive policy still cannot expose these tables.
revoke all on public.team_members        from anon;
revoke all on public.leads               from anon;
revoke all on public.activities          from anon;
revoke all on public.towers              from anon;
revoke all on public.tower_outages       from anon;
revoke all on public.stock_products      from anon;
revoke all on public.stock_items         from anon;
revoke all on public.stock_bookings      from anon;
revoke all on public.stock_requests      from anon;
revoke all on public.stock_request_lines from anon;
revoke all on public.stock_qr_labels     from anon;

-- ---------------------------------------------------------------------------
-- 2. Block privilege escalation on team_members
-- ---------------------------------------------------------------------------
-- A trigger rather than a policy, because RLS WITH CHECK cannot compare NEW to OLD.
-- Non-breaking: normal profile edits still work; only role/department/active
-- changes are restricted, and those already go through /api/users (service role,
-- which bypasses RLS and triggers marked this way).

create or replace function public.guard_team_member_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text;
begin
  -- Bypass ONLY when there is no end user in context — i.e. the service-role client
  -- used by our own API routes, where auth.uid() is null.
  --
  -- Do NOT also test request.jwt.claims here: that GUC is absent in several legitimate
  -- contexts, so `claims is null OR uid is null` hands a free pass to exactly the
  -- authenticated users this trigger exists to stop. (Caught by the RLS test suite:
  -- a sales rep successfully ran `update team_members set role='owner'`.)
  if auth.uid() is null then
    return new;
  end if;

  select role into actor_role
  from public.team_members
  where id = auth.uid()::text or auth_user_id = auth.uid()
  limit 1;

  -- Owners, and anyone holding the admin module at 'manage', may reassign people.
  if coalesce(actor_role, '') = 'owner' then
    return new;
  end if;

  if to_regprocedure('public.has_module_access(text,public.access_level)') is not null
     and public.has_module_access('admin', 'manage') then
    return new;
  end if;

  if new.role       is distinct from old.role
     or new.department is distinct from old.department
     or new.active     is distinct from old.active then
    raise exception
      'Only an owner may change role, department or active status (attempted by %)',
      coalesce(auth.uid()::text, 'unknown')
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_team_member_privileges on public.team_members;
create trigger trg_guard_team_member_privileges
  before update on public.team_members
  for each row
  execute function public.guard_team_member_privileges();

commit;

-- ---------------------------------------------------------------------------
-- Verify after applying
-- ---------------------------------------------------------------------------
-- Expect ZERO rows:
--   select tablename, policyname, roles
--   from pg_policies
--   where schemaname = 'public'
--     and ('anon' = any(roles) or 'public' = any(roles));
--
-- Then, from a logged-out browser on the marketing site, confirm this fails:
--   await supabase.from('leads').select('*')
--
-- And from a logged-in non-owner staff session, confirm this fails:
--   await supabase.from('team_members').update({role:'owner'}).eq('id', myId)
--
-- Finally re-check that the landing page network status banner and the /i/[token]
-- client QR portal both still load (both use service-role API routes, so they should).
