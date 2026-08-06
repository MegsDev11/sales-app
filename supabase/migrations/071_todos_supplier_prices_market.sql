-- 071_todos_supplier_prices_market.sql — the day's work, what things cost, and
-- what the market is doing.
--
-- Three additions, all of which exist to be READ BY A SCHEDULE rather than by a
-- person opening a page:
--
--   1. DAILY TO-DO LISTS. The platform has bookings (calendar_events), client
--      visits (jobs) and follow-ups (leads.next_follow_up_at) — each in its own
--      module, on its own screen, with nothing that says "here is today's work
--      for Accounts". todo_items is that list, generated fresh each morning by
--      the sweep and deduped by (department, date, source) so re-running it is
--      harmless. todo_templates carries the standing duties a department does
--      every day regardless of what the other modules contain.
--
--   2. SUPPLIER PRICES. suppliers (047) stores lead time and payment terms but
--      no prices, so "who is cheapest for this item" could only ever be
--      answered backwards, from purchase orders already raised. supplier_products
--      is the negotiated price list docs/OPS_PLATFORM_PLAN.md:600 specified and
--      never got; supplier_price_history records every change so the weekly
--      digest can report movement rather than a snapshot.
--
--   3. MARKET WATCH. The owner asked for weekly stock-price updates in both
--      senses of the phrase. Material prices come from (2); this table holds the
--      share tickers for the market half of the same digest.
--
-- Apply manually in the Supabase SQL editor (repo convention).

-- ---------------------------------------------------------------------------
-- 1. Daily to-do lists
-- ---------------------------------------------------------------------------

create table if not exists public.todo_templates (
  id             text primary key,
  department_key text not null references public.departments(key) on delete cascade,
  title          text not null,
  detail         text not null default '',
  -- Which days it applies to: 1=Monday … 7=Sunday. Empty means every day.
  weekdays       int[] not null default '{}',
  sort_order     int not null default 100,
  active         boolean not null default true,
  created_by     text references public.team_members(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists todo_templates_dept_idx
  on public.todo_templates (department_key) where active;

create table if not exists public.todo_items (
  id             text primary key,
  department_key text not null references public.departments(key) on delete cascade,
  -- The day this belongs to. Everything is generated per calendar day so the
  -- list is answerable ("what was outstanding on Tuesday?") after the fact.
  due_on         date not null,
  title          text not null,
  detail         text not null default '',
  -- Where it came from: template | booking | job | follow_up | manual.
  source         text not null default 'manual',
  -- The record behind it, so a row can deep-link back to its module.
  source_ref     text,
  link           text not null default '',
  -- Optional owner. Null means "the department", not "nobody".
  assignee_id    text references public.team_members(id) on delete set null,
  done_at        timestamptz,
  done_by        text references public.team_members(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists todo_items_dept_day_idx
  on public.todo_items (department_key, due_on desc);
create index if not exists todo_items_open_idx
  on public.todo_items (due_on) where done_at is null;
create index if not exists todo_items_assignee_idx
  on public.todo_items (assignee_id, due_on desc) where assignee_id is not null;

-- The idempotency guard: one row per source record per department per day, so
-- the generator can run twice (or ten times) without duplicating the list.
-- Manual entries are exempt — they have no source_ref and are never regenerated.
create unique index if not exists todo_items_generated_key
  on public.todo_items (department_key, due_on, source, source_ref)
  where source_ref is not null;

-- The module row behind the sidebar entry. Granted to every active person at
-- view: a daily list only works if the people doing the work can open it.
insert into public.modules
  (key, label, description, icon, group_name, root_path, sort_order, is_core, active)
values
  ('todo', 'Today', 'The day''s work for your department',
   'ListChecks', 'operations', '/todo', 15, false, true)
on conflict (key) do nothing;

insert into public.department_module_access (department_key, module_key, level)
select d.key, 'todo', 'edit'::public.access_level
from public.departments d
where d.active
on conflict (department_key, module_key) do nothing;

alter table public.todo_templates enable row level security;
alter table public.todo_items enable row level security;
revoke all on public.todo_templates from anon;
revoke all on public.todo_items from anon;

-- Everyone signed in sees the lists — a to-do list nobody can read is not a
-- to-do list. Editing is per-department or admin.
drop policy if exists todo_items_select on public.todo_items;
create policy todo_items_select on public.todo_items
  for select to authenticated using (true);

drop policy if exists todo_items_write on public.todo_items;
create policy todo_items_write on public.todo_items
  for all to authenticated
  using (
    assignee_id = public.current_member_id()
    or (select public.has_module_access(
          case department_key when 'sales' then 'crm' else department_key end, 'edit'))
    or (select public.has_module_access('admin', 'manage'))
  )
  with check (
    assignee_id = public.current_member_id()
    or (select public.has_module_access(
          case department_key when 'sales' then 'crm' else department_key end, 'edit'))
    or (select public.has_module_access('admin', 'manage'))
  );

drop policy if exists todo_templates_select on public.todo_templates;
create policy todo_templates_select on public.todo_templates
  for select to authenticated using (true);

drop policy if exists todo_templates_write on public.todo_templates;
create policy todo_templates_write on public.todo_templates
  for all to authenticated
  using (
    (select public.has_module_access(
       case department_key when 'sales' then 'crm' else department_key end, 'manage'))
    or (select public.has_module_access('admin', 'manage'))
  )
  with check (
    (select public.has_module_access(
       case department_key when 'sales' then 'crm' else department_key end, 'manage'))
    or (select public.has_module_access('admin', 'manage'))
  );

-- ---------------------------------------------------------------------------
-- 2. Supplier price list
-- ---------------------------------------------------------------------------

create table if not exists public.supplier_products (
  id            text primary key,
  supplier_id   text not null references public.suppliers(id) on delete cascade,
  product_id    text references public.stock_products(id) on delete cascade,
  sundry_id     text references public.stock_sundries(id) on delete cascade,
  supplier_sku  text not null default '',
  unit_price    numeric(12,2),
  currency      text not null default 'ZAR',
  min_order_qty int not null default 1,
  url           text not null default '',
  notes         text not null default '',
  -- When the price was last confirmed — the weekly sweep flags stale entries
  -- rather than pretending an old number is current.
  last_price_at timestamptz,
  updated_by    text references public.team_members(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (product_id is not null or sundry_id is not null)
);

-- One price per supplier per item.
create unique index if not exists supplier_products_product_key
  on public.supplier_products (supplier_id, product_id) where product_id is not null;
create unique index if not exists supplier_products_sundry_key
  on public.supplier_products (supplier_id, sundry_id) where sundry_id is not null;
create index if not exists supplier_products_supplier_idx
  on public.supplier_products (supplier_id);
create index if not exists supplier_products_stale_idx
  on public.supplier_products (last_price_at);

create table if not exists public.supplier_price_history (
  id                  text primary key,
  supplier_product_id text not null references public.supplier_products(id) on delete cascade,
  unit_price          numeric(12,2) not null,
  previous_price      numeric(12,2),
  changed_by          text references public.team_members(id) on delete set null,
  changed_at          timestamptz not null default now()
);

create index if not exists supplier_price_history_item_idx
  on public.supplier_price_history (supplier_product_id, changed_at desc);
create index if not exists supplier_price_history_when_idx
  on public.supplier_price_history (changed_at desc);

-- Every price change writes itself to history — the digest reads this, so it
-- must not depend on the API remembering.
create or replace function public.log_supplier_price_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.unit_price is not null then
    insert into supplier_price_history (id, supplier_product_id, unit_price, previous_price, changed_by)
    values ('sph-' || replace(gen_random_uuid()::text, '-', ''), new.id, new.unit_price, null, new.updated_by);
  elsif tg_op = 'UPDATE'
        and new.unit_price is not null
        and new.unit_price is distinct from old.unit_price then
    insert into supplier_price_history (id, supplier_product_id, unit_price, previous_price, changed_by)
    values ('sph-' || replace(gen_random_uuid()::text, '-', ''), new.id, new.unit_price, old.unit_price, new.updated_by);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_supplier_price_history on public.supplier_products;
create trigger trg_supplier_price_history
  after insert or update on public.supplier_products
  for each row execute function public.log_supplier_price_change();

alter table public.supplier_products enable row level security;
alter table public.supplier_price_history enable row level security;
revoke all on public.supplier_products from anon;
revoke all on public.supplier_price_history from anon;

drop policy if exists supplier_products_select on public.supplier_products;
create policy supplier_products_select on public.supplier_products
  for select to authenticated
  using (
    (select public.has_module_access('procurement','view'))
    or (select public.has_module_access('stock','view'))
  );

drop policy if exists supplier_products_write on public.supplier_products;
create policy supplier_products_write on public.supplier_products
  for all to authenticated
  using ((select public.has_module_access('procurement','edit')))
  with check ((select public.has_module_access('procurement','edit')));

drop policy if exists supplier_price_history_select on public.supplier_price_history;
create policy supplier_price_history_select on public.supplier_price_history
  for select to authenticated
  using ((select public.has_module_access('procurement','view')));

-- ---------------------------------------------------------------------------
-- 3. Market watch — the share-price half of the weekly digest
-- ---------------------------------------------------------------------------

create table if not exists public.market_watch (
  id           text primary key,
  symbol       text not null,
  label        text not null default '',
  -- Free text: 'JSE', 'NASDAQ', … Only ever shown, never parsed.
  exchange     text not null default '',
  note         text not null default '',
  active       boolean not null default true,
  -- Last figure the digest recorded, so the next one can report movement.
  last_price   numeric(14,4),
  last_currency text not null default '',
  last_checked_at timestamptz,
  sort_order   int not null default 100,
  created_by   text references public.team_members(id) on delete set null,
  created_at   timestamptz not null default now()
);

create unique index if not exists market_watch_symbol_key
  on public.market_watch (upper(symbol));

alter table public.market_watch enable row level security;
revoke all on public.market_watch from anon;

drop policy if exists market_watch_select on public.market_watch;
create policy market_watch_select on public.market_watch
  for select to authenticated
  using (
    (select public.has_module_access('financial','view'))
    or (select public.has_module_access('general','view'))
  );

drop policy if exists market_watch_write on public.market_watch;
create policy market_watch_write on public.market_watch
  for all to authenticated
  using ((select public.has_module_access('financial','manage')))
  with check ((select public.has_module_access('financial','manage')));

-- ---------------------------------------------------------------------------
-- 4. Building the day's list
-- ---------------------------------------------------------------------------
-- Written in SQL, like run_overdue_sweep() in 064, so pg_cron can call it
-- directly without needing pg_net, a base URL, or a stored secret. The HTTP
-- endpoint calls the same function.
--
-- Four sources, each inserted with a stable source_ref so the unique index
-- makes a re-run a no-op:
--   template  — the department's standing duties for this weekday
--   booking   — calendar events starting today, routed by the organiser
--   job       — field jobs scheduled today (coordination)
--   follow_up — leads whose follow-up is due today or overdue (sales)

create or replace function public.generate_daily_todos(p_day date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day  date := coalesce(p_day, current_date);
  -- Postgres dow: 0=Sunday..6=Saturday. Templates use 1=Monday..7=Sunday.
  v_dow  int  := case extract(dow from v_day)::int when 0 then 7
                 else extract(dow from v_day)::int end;
  n_tpl  int := 0;
  n_book int := 0;
  n_job  int := 0;
  n_lead int := 0;
begin
  -- Standing duties
  with ins as (
    insert into todo_items (id, department_key, due_on, title, detail, source, source_ref)
    select 'todo-' || replace(gen_random_uuid()::text, '-', ''),
           t.department_key, v_day, t.title, t.detail, 'template', t.id
    from todo_templates t
    where t.active
      and (cardinality(t.weekdays) = 0 or v_dow = any(t.weekdays))
    on conflict (department_key, due_on, source, source_ref)
      where source_ref is not null do nothing
    returning 1
  ) select count(*) into n_tpl from ins;

  -- Today's bookings, routed to the organiser's department
  with ins as (
    insert into todo_items (id, department_key, due_on, title, detail, source, source_ref, link, assignee_id)
    select 'todo-' || replace(gen_random_uuid()::text, '-', ''),
           tm.department, v_day,
           'Meeting: ' || e.title,
           coalesce(nullif(e.location, ''), 'No location set'),
           'booking', e.id, '/scheduler', e.organizer_id
    from calendar_events e
    join team_members tm on tm.id = e.organizer_id
    where e.cancelled_at is null
      and tm.department is not null
      and e.starts_at >= v_day::timestamptz
      and e.starts_at <  (v_day + 1)::timestamptz
    on conflict (department_key, due_on, source, source_ref)
      where source_ref is not null do nothing
    returning 1
  ) select count(*) into n_book from ins;

  -- Today's field jobs
  with ins as (
    insert into todo_items (id, department_key, due_on, title, detail, source, source_ref, link)
    select 'todo-' || replace(gen_random_uuid()::text, '-', ''),
           'coordination', v_day,
           'Job: ' || coalesce(nullif(j.client_name, ''), j.title),
           coalesce(nullif(j.address, ''), 'No address'),
           'job', j.id, '/coordination/jobs'
    from jobs j
    where j.status not in ('completed', 'cancelled')
      and j.scheduled_start >= v_day::timestamptz
      and j.scheduled_start <  (v_day + 1)::timestamptz
    on conflict (department_key, due_on, source, source_ref)
      where source_ref is not null do nothing
    returning 1
  ) select count(*) into n_job from ins;

  -- Follow-ups due or overdue. Overdue ones reappear on today's list rather
  -- than staying behind on the day they were missed.
  with ins as (
    insert into todo_items (id, department_key, due_on, title, detail, source, source_ref, link, assignee_id)
    select 'todo-' || replace(gen_random_uuid()::text, '-', ''),
           'sales', v_day,
           'Follow up: ' || l.client_name,
           coalesce(nullif(l.next_action, ''), 'Follow-up due'),
           'follow_up', l.id, '/leads/' || l.id, l.assigned_to_id
    from leads l
    where l.deleted = false
      and l.next_follow_up_at is not null
      and l.next_follow_up_at < (v_day + 1)::timestamptz
      and l.stage not in ('won', 'lost')
    on conflict (department_key, due_on, source, source_ref)
      where source_ref is not null do nothing
    returning 1
  ) select count(*) into n_lead from ins;

  return jsonb_build_object(
    'day', v_day, 'templates', n_tpl, 'bookings', n_book,
    'jobs', n_job, 'followUps', n_lead
  );
end;
$$;

revoke all on function public.generate_daily_todos(date) from public, anon, authenticated;
grant execute on function public.generate_daily_todos(date) to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'cron') then
    -- 04:30 UTC ≈ 06:30 SAST — the list is waiting before anyone starts.
    perform cron.schedule('todo-generate-daily', '30 4 * * *',
                          'select public.generate_daily_todos()');
    raise notice 'todo-generate-daily scheduled via pg_cron (04:30 UTC daily).';
  else
    raise notice 'pg_cron is not enabled. Call POST /api/cron/daily-todos and '
      '/api/cron/weekly-digest from an external scheduler with the CRON_SECRET header.';
  end if;
end $$;
