-- 045_scheduler.sql
--
-- Company scheduler: meetings, project dates, and department events on one calendar.
--
-- Adding this module is deliberately small — one row in `modules`, one registry entry
-- in lib/modules.ts, and the tables below. That is the payoff from migration 040:
-- before it, a new department meant edits in six files plus a CHECK constraint.

begin;

-- ---------------------------------------------------------------------------
-- Register the module
-- ---------------------------------------------------------------------------

insert into public.modules (key, label, description, icon, group_name, root_path, sort_order, is_core)
values ('scheduler', 'Scheduler', 'Meetings, project dates and department calendars',
        'CalendarDays', 'operations', '/scheduler', 35, false)
on conflict (key) do update set
  label = excluded.label, description = excluded.description, icon = excluded.icon,
  group_name = excluded.group_name, root_path = excluded.root_path,
  sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.event_kind as enum
    ('meeting','project_milestone','deadline','leave','maintenance','training','other');
exception when duplicate_object then null; end $$;

do $$ begin
  -- Who can see the event. Deliberately explicit rather than a boolean, because
  -- "managers can see it" and "my department can see it" are different questions.
  create type public.event_visibility as enum
    ('private','attendees','department','managers','company');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.attendee_response as enum ('invited','accepted','declined','tentative');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.calendar_events (
  id           text primary key,
  title        text not null,
  description  text not null default '',
  kind         public.event_kind not null default 'meeting',
  visibility   public.event_visibility not null default 'department',

  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  all_day      boolean not null default false,

  location     text not null default '',
  meeting_url  text not null default '',

  -- Which module's calendar this belongs to (drives the department filter).
  module_key   text references public.modules(key) on delete set null,
  -- Optional links out to the rest of the system.
  project_id   text,
  lead_id      text references public.leads(id) on delete set null,
  job_id       text references public.jobs(id)  on delete set null,

  organizer_id text references public.team_members(id) on delete set null,
  created_by   text references public.team_members(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  cancelled_at timestamptz,

  constraint calendar_events_time_order check (ends_at >= starts_at)
);

create index if not exists calendar_events_starts_idx on public.calendar_events (starts_at);
create index if not exists calendar_events_module_idx on public.calendar_events (module_key, starts_at);
create index if not exists calendar_events_project_idx on public.calendar_events (project_id);

create table if not exists public.calendar_event_attendees (
  event_id  text not null references public.calendar_events(id) on delete cascade,
  user_id   text not null references public.team_members(id) on delete cascade,
  response  public.attendee_response not null default 'invited',
  is_organizer boolean not null default false,
  responded_at timestamptz,
  primary key (event_id, user_id)
);

create index if not exists calendar_attendees_user_idx on public.calendar_event_attendees (user_id);

-- ---------------------------------------------------------------------------
-- Visibility helpers
-- ---------------------------------------------------------------------------

-- "Managers" means anyone holding `manage` on any module — which under the grant
-- model is the honest definition. It is not the legacy `role = 'manager'` column,
-- because a Finance user granted Wireless at manage is a wireless manager too.
create or replace function public.is_any_module_manager()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.team_members tm
    where tm.id = public.current_member_id()
      and tm.active
      and (
        tm.role = 'owner'
        or exists (
          select 1 from public.user_module_access uma
          where uma.user_id = tm.id
            and uma.level = 'manage'
            and (uma.expires_at is null or uma.expires_at > now())
        )
        or exists (
          select 1 from public.access_template_modules atm
          where atm.template_id = tm.template_id and atm.level = 'manage'
        )
      )
  );
$$;

create or replace function public.can_see_event(p_event text)
returns boolean
language sql stable security definer set search_path = public as $$
  with e as (select * from public.calendar_events where id = p_event),
       me as (select public.current_member_id() as id)
  select coalesce((
    select
      -- Your own event
      e.organizer_id = (select id from me)
      or e.created_by = (select id from me)
      -- You were invited
      or exists (
        select 1 from public.calendar_event_attendees a
        where a.event_id = e.id and a.user_id = (select id from me)
      )
      -- Everyone
      or e.visibility = 'company'
      -- Any module manager
      or (e.visibility = 'managers' and public.is_any_module_manager())
      -- Anyone who can open that module
      or (
        e.visibility = 'department'
        and e.module_key is not null
        and public.has_module_access(e.module_key, 'view')
      )
      -- A department event with no module set falls back to company-wide
      or (e.visibility = 'department' and e.module_key is null)
    from e
  ), false);
$$;

grant execute on function public.is_any_module_manager() to authenticated;
grant execute on function public.can_see_event(text)      to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.calendar_events          enable row level security;
alter table public.calendar_event_attendees enable row level security;
revoke all on public.calendar_events          from anon;
revoke all on public.calendar_event_attendees from anon;

drop policy if exists calendar_events_select on public.calendar_events;
create policy calendar_events_select on public.calendar_events
  for select to authenticated
  using (public.can_see_event(id));

-- Anyone who can use the scheduler may book something.
drop policy if exists calendar_events_insert on public.calendar_events;
create policy calendar_events_insert on public.calendar_events
  for insert to authenticated
  with check ((select public.has_module_access('scheduler','edit')));

-- Only the organiser, the creator, or a scheduler manager may change or cancel it —
-- so a colleague cannot quietly move someone else's meeting.
drop policy if exists calendar_events_update on public.calendar_events;
create policy calendar_events_update on public.calendar_events
  for update to authenticated
  using (
    organizer_id = public.current_member_id()
    or created_by = public.current_member_id()
    or (select public.has_module_access('scheduler','manage'))
  )
  with check (
    organizer_id = public.current_member_id()
    or created_by = public.current_member_id()
    or (select public.has_module_access('scheduler','manage'))
  );

drop policy if exists calendar_events_delete on public.calendar_events;
create policy calendar_events_delete on public.calendar_events
  for delete to authenticated
  using (
    organizer_id = public.current_member_id()
    or (select public.has_module_access('scheduler','manage'))
  );

drop policy if exists calendar_attendees_select on public.calendar_event_attendees;
create policy calendar_attendees_select on public.calendar_event_attendees
  for select to authenticated
  using (public.can_see_event(event_id));

drop policy if exists calendar_attendees_write on public.calendar_event_attendees;
create policy calendar_attendees_write on public.calendar_event_attendees
  for all to authenticated
  using (
    -- You may always change your own RSVP.
    user_id = public.current_member_id()
    or exists (
      select 1 from public.calendar_events e
      where e.id = event_id
        and (e.organizer_id = public.current_member_id()
             or e.created_by = public.current_member_id())
    )
    or (select public.has_module_access('scheduler','manage'))
  )
  with check (
    user_id = public.current_member_id()
    or exists (
      select 1 from public.calendar_events e
      where e.id = event_id
        and (e.organizer_id = public.current_member_id()
             or e.created_by = public.current_member_id())
    )
    or (select public.has_module_access('scheduler','manage'))
  );

-- ---------------------------------------------------------------------------
-- Give existing staff the scheduler, so it is usable the moment it ships
-- ---------------------------------------------------------------------------
-- Everyone gets `edit` (book and manage their own meetings). Module managers get
-- `manage` so they can curate their department's calendar.

insert into public.user_module_access (user_id, module_key, level, granted_at)
select tm.id, 'scheduler',
       case when tm.role = 'manager' then 'manage'::public.access_level
            else 'edit'::public.access_level end,
       now()
from public.team_members tm
where tm.role <> 'owner'
on conflict (user_id, module_key) do nothing;

commit;
