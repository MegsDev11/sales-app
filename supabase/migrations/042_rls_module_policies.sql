-- 042_rls_module_policies.sql
--
-- Replace every `using (true)` policy with a real module check.
--
-- Before this migration the app's security lived entirely in the API routes
-- (requireStockAccess and friends). That is only half the story, because the browser
-- talks to Postgres directly via the Supabase client — lib/store/crm-store.tsx does
-- exactly that — so the guards were bypassable from dev tools. After this migration
-- the database enforces the same rules the UI does, and the API guards become a
-- second layer rather than the only one.
--
-- Levels used:
--   select -> view    insert/update -> edit    delete -> manage
--
-- PERFORMANCE: has_module_access() is wrapped in a scalar subquery — `(select ...)`
-- — so Postgres evaluates it once per statement instead of once per row. This is the
-- standard Supabase RLS pattern and the difference is large on wide tables.

begin;

-- ---------------------------------------------------------------------------
-- 0. Clear out every legacy policy on the tables we are about to govern.
--    Anything missed ends up with RLS enabled and no policy = deny, which is the
--    safe direction to fail.
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
  managed text[] := array[
    'team_members','leads','activities',
    'towers','tower_sites','tower_outages',
    'support_threads','support_messages','client_support_requests',
    'stock_products','stock_items','stock_bookings','stock_requests',
    'stock_request_lines','stock_qr_labels','stock_sundries','stock_item_visits',
    'jobs','job_assignments','job_status_events','job_card_submissions',
    'time_entries','time_off_requests','ot_settings','location_pings',
    'vehicles','fuel_entries',
    'network_layouts','network_devices','network_layout_assets','network_layout_submissions',
    'client_accounts','client_account_installations','qr_portal_sessions',
    'app_notifications'
  ];
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public' and tablename = any(managed)
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;

  -- Make sure RLS is actually on for all of them.
  for r in select unnest(managed) as t loop
    if exists (select 1 from pg_tables where schemaname='public' and tablename=r.t) then
      execute format('alter table public.%I enable row level security', r.t);
      -- Revoke the blanket anon grant as well (belt and braces alongside 039).
      execute format('revoke all on public.%I from anon', r.t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Single-module tables — generated from a mapping
-- ---------------------------------------------------------------------------

do $$
declare
  m record;
begin
  for m in select * from (values
      -- CRM
      ('leads',                        'crm'),
      ('activities',                   'crm'),
      -- Support
      ('towers',                       'support'),
      ('tower_sites',                  'support'),
      ('tower_outages',                'support'),
      ('support_threads',              'support'),
      ('support_messages',             'support'),
      ('client_support_requests',      'support'),
      ('client_accounts',              'support'),
      ('client_account_installations', 'support'),
      -- Stock
      ('stock_products',               'stock'),
      ('stock_items',                  'stock'),
      ('stock_bookings',               'stock'),
      ('stock_qr_labels',              'stock'),
      ('stock_sundries',               'stock'),
      ('stock_item_visits',            'stock'),
      -- Coordination
      ('jobs',                         'coordination'),
      ('job_assignments',              'coordination'),
      ('job_status_events',            'coordination'),
      ('job_card_submissions',         'coordination'),
      ('ot_settings',                  'coordination'),
      ('location_pings',               'coordination'),
      -- Wireless
      ('network_layouts',              'wireless'),
      ('network_devices',              'wireless'),
      ('network_layout_assets',        'wireless'),
      ('network_layout_submissions',   'wireless')
    ) as x(tbl, module)
  loop
    if not exists (select 1 from pg_tables where schemaname='public' and tablename=m.tbl) then
      continue;
    end if;

    execute format(
      $fmt$create policy %I on public.%I for select to authenticated
             using ((select public.has_module_access(%L, 'view')))$fmt$,
      m.tbl || '_select', m.tbl, m.module);

    execute format(
      $fmt$create policy %I on public.%I for insert to authenticated
             with check ((select public.has_module_access(%L, 'edit')))$fmt$,
      m.tbl || '_insert', m.tbl, m.module);

    execute format(
      $fmt$create policy %I on public.%I for update to authenticated
             using      ((select public.has_module_access(%L, 'edit')))
             with check ((select public.has_module_access(%L, 'edit')))$fmt$,
      m.tbl || '_update', m.tbl, m.module, m.module);

    execute format(
      $fmt$create policy %I on public.%I for delete to authenticated
             using ((select public.has_module_access(%L, 'manage')))$fmt$,
      m.tbl || '_delete', m.tbl, m.module);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Multi-module tables
-- ---------------------------------------------------------------------------

do $$
declare
  m record;
begin
  for m in select * from (values
      -- Pick lists: raised by Coordination, fulfilled by Stock (old canAccessStockRequests)
      ('stock_requests',      array['stock','coordination']),
      ('stock_request_lines', array['stock','coordination']),
      -- Vehicles: Stock owns the QRs, Coordination assigns them, Finance reports on them
      ('vehicles',            array['stock','coordination','financial']),
      -- Fuel: logged by technicians, reported on by Finance
      ('fuel_entries',        array['financial','coordination','stock'])
    ) as x(tbl, modules)
  loop
    if not exists (select 1 from pg_tables where schemaname='public' and tablename=m.tbl) then
      continue;
    end if;

    execute format(
      $fmt$create policy %I on public.%I for select to authenticated
             using ((select public.has_any_module_access(%L::text[], 'view')))$fmt$,
      m.tbl || '_select', m.tbl, m.modules);

    execute format(
      $fmt$create policy %I on public.%I for insert to authenticated
             with check ((select public.has_any_module_access(%L::text[], 'edit')))$fmt$,
      m.tbl || '_insert', m.tbl, m.modules);

    execute format(
      $fmt$create policy %I on public.%I for update to authenticated
             using      ((select public.has_any_module_access(%L::text[], 'edit')))
             with check ((select public.has_any_module_access(%L::text[], 'edit')))$fmt$,
      m.tbl || '_update', m.tbl, m.modules, m.modules);

    execute format(
      $fmt$create policy %I on public.%I for delete to authenticated
             using ((select public.has_any_module_access(%L::text[], 'manage')))$fmt$,
      m.tbl || '_delete', m.tbl, m.modules);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. team_members — the privilege-escalation surface, handled explicitly
-- ---------------------------------------------------------------------------
-- Anyone signed in may read the directory (names/avatars are needed all over the UI);
-- writes require the admin module. Sensitive columns are additionally protected by the
-- trigger from 039 and by 043 below.

create policy team_members_select on public.team_members
  for select to authenticated
  using (
    id = auth.uid()::text
    or auth_user_id = auth.uid()
    or (select public.has_module_access('staff','view'))
  );

-- A user may edit their OWN profile. The 039 trigger still blocks them changing
-- role / department / active on that row.
create policy team_members_self_update on public.team_members
  for update to authenticated
  using (id = auth.uid()::text or auth_user_id = auth.uid())
  with check (id = auth.uid()::text or auth_user_id = auth.uid());

create policy team_members_admin_all on public.team_members
  for all to authenticated
  using ((select public.has_module_access('admin','manage')))
  with check ((select public.has_module_access('admin','manage')));

-- Note: there is deliberately NO blanket `for all to authenticated using (true)`
-- policy here any more. Account creation goes through /api/users, which uses the
-- service-role client and bypasses RLS.

-- ---------------------------------------------------------------------------
-- 4. Timesheets and leave — coordination sees all, staff see their own
-- ---------------------------------------------------------------------------

create policy time_entries_select on public.time_entries
  for select to authenticated
  using (
    technician_id = public.current_member_id()
    or (select public.has_module_access('coordination','view'))
  );

create policy time_entries_write on public.time_entries
  for all to authenticated
  using (
    technician_id = public.current_member_id()
    or (select public.has_module_access('coordination','edit'))
  )
  with check (
    technician_id = public.current_member_id()
    or (select public.has_module_access('coordination','edit'))
  );

create policy time_off_select on public.time_off_requests
  for select to authenticated
  using (
    technician_id = public.current_member_id()
    or (select public.has_module_access('coordination','view'))
  );

create policy time_off_insert on public.time_off_requests
  for insert to authenticated
  with check (
    technician_id = public.current_member_id()
    or (select public.has_module_access('coordination','edit'))
  );

-- Only coordination may approve/deny — a technician cannot approve their own leave.
create policy time_off_manage on public.time_off_requests
  for update to authenticated
  using ((select public.has_module_access('coordination','edit')))
  with check ((select public.has_module_access('coordination','edit')));

-- ---------------------------------------------------------------------------
-- 5. Notifications — you see your own, or your module's
-- ---------------------------------------------------------------------------

create policy app_notifications_select on public.app_notifications
  for select to authenticated
  using (
    user_id = public.current_member_id()
    or (department is not null and (select public.has_module_access(
          case department when 'sales' then 'crm' else department end, 'view')))
  );

create policy app_notifications_update on public.app_notifications
  for update to authenticated
  using (user_id = public.current_member_id())
  with check (user_id = public.current_member_id());

-- Notifications are raised server-side by the service-role client, so no
-- authenticated INSERT policy is needed.

-- ---------------------------------------------------------------------------
-- 6. qr_portal_sessions — service role only
-- ---------------------------------------------------------------------------
-- These rows are portal login sessions for clients and technicians scanning a QR.
-- They are created and validated exclusively by /api/stock/item/[token]/portal using
-- the service-role client. No authenticated user has any business reading them, so
-- RLS stays on with zero policies (deny all).

commit;

-- ---------------------------------------------------------------------------
-- Verify after applying
-- ---------------------------------------------------------------------------
-- 1) No policy should still be wide open:
--      select tablename, policyname, qual
--      from pg_policies
--      where schemaname='public' and qual = 'true';
--
-- 2) No policy should be reachable by anon:
--      select tablename, policyname, roles from pg_policies
--      where schemaname='public' and ('anon' = any(roles) or 'public' = any(roles));
--
-- 3) Signed in as a Finance user with no stock grant, this must return 0 rows:
--      select * from stock_items;
--    then tick Stock=view in /admin and it must return rows — with no redeploy.
