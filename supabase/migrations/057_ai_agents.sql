-- 057_ai_agents.sql
--
-- The AI Agents module, and the settings behind the website assistant.
--
-- WHY A MODULE. 056 shipped the assistant but gave nobody a place to look at it. Its
-- escalations landed in a table only the service role wrote to, its cost accumulated in
-- ai_interactions with no screen, and the only way to change how it behaved was to edit
-- an environment variable and redeploy. This adds the owner-facing home for all three,
-- and — the part that actually matters day to day — routes each escalation to the desk
-- that can act on it rather than leaving them in one undifferentiated pile.
--
-- OWNER ONLY, BY OMISSION. `ai` is inserted into `modules` so the admin console can see
-- it and `user_module_access` can reference it, but it is deliberately NOT added to any
-- row in `access_template_modules`. Nobody inherits it from a template. The owner
-- reaches it because `accessLevel()` short-circuits to 'manage' for the owner role
-- (lib/access.ts); anyone else has to be granted it by hand in /admin. That is the
-- cheapest possible "owner only" — no new role, no special case in the guards.
--
-- Note the module row is what the escalation SCREENS hang off. The per-department
-- chatbot tabs are guarded by their own modules (support, financial, crm), so a support
-- agent sees connectivity escalations without being given anything AI-related.

begin;

-- ---------------------------------------------------------------------------
-- The module
-- ---------------------------------------------------------------------------
-- sort_order 150 puts it after Administration (140), at the end of the admin group.

insert into public.modules
  (key, label, description, icon, group_name, root_path, sort_order, is_core, active)
values
  ('ai', 'AI Agents',
   'Website assistant settings, conversations and cost',
   'Bot', 'admin', '/ai', 150, false, true)
on conflict (key) do update set
  label       = excluded.label,
  description = excluded.description,
  icon        = excluded.icon,
  group_name  = excluded.group_name,
  root_path   = excluded.root_path,
  sort_order  = excluded.sort_order,
  is_core     = excluded.is_core,
  active      = excluded.active;

-- ---------------------------------------------------------------------------
-- Assistant settings
-- ---------------------------------------------------------------------------
-- A single row, same shape as accounts_settings. These are the knobs a person should
-- be able to turn without a deploy.
--
-- `enabled` is the one that earns its keep: it is a kill switch. If the assistant ever
-- starts saying something wrong at 22:00, somebody with the owner login can switch it
-- off from a phone, and the widget disappears from the website on the next page load.
-- Deleting the API key would also work but takes a deploy and breaks every other AI
-- feature that later shares the key.
--
-- The environment variables from 056 remain the fallback, so an unapplied migration or
-- an empty row degrades to exactly the previous behaviour rather than to a dead chat.

create table if not exists public.ai_agent_settings (
  id            text primary key default 'default',

  -- Kill switch. False hides the widget and makes /api/chat refuse politely.
  enabled       boolean not null default true,

  -- First thing a visitor reads. Blank falls back to the built-in greeting.
  greeting      text not null default '',

  -- low | medium | high | xhigh | max. Blank falls back to SUPPORT_CHAT_EFFORT.
  effort        text not null default '',

  -- Where escalations are emailed. Blank falls back to SUPPORT_ONCALL_EMAIL.
  oncall_email  text not null default '',

  -- Office hours in SAST, used to decide whether an escalation is "after hours" and
  -- what the assistant tells the client about when somebody will call back.
  office_opens_hour  int not null default 8,
  office_closes_hour int not null default 17,

  updated_by    text references public.team_members(id) on delete set null,
  updated_at    timestamptz not null default now()
);

insert into public.ai_agent_settings (id) values ('default') on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ai_agent_settings_effort_check'
  ) then
    alter table public.ai_agent_settings
      add constraint ai_agent_settings_effort_check
      check (effort in ('', 'low', 'medium', 'high', 'xhigh', 'max'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'ai_agent_settings_hours_check'
  ) then
    alter table public.ai_agent_settings
      add constraint ai_agent_settings_hours_check
      check (
        office_opens_hour between 0 and 23
        and office_closes_hour between 1 and 24
        and office_closes_hour > office_opens_hour
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- Settings are read by the server with the service role, which bypasses RLS. The
-- policies here are for the settings screen: read at ai/view, write at ai/manage.

alter table public.ai_agent_settings enable row level security;

drop policy if exists ai_agent_settings_select on public.ai_agent_settings;
create policy ai_agent_settings_select
  on public.ai_agent_settings for select to authenticated
  using ((select public.has_module_access('ai','view')));

drop policy if exists ai_agent_settings_write on public.ai_agent_settings;
create policy ai_agent_settings_write
  on public.ai_agent_settings for all to authenticated
  using ((select public.has_module_access('ai','manage')))
  with check ((select public.has_module_access('ai','manage')));

-- ---------------------------------------------------------------------------
-- Escalations become department-readable
-- ---------------------------------------------------------------------------
-- 056 gave support/view read of every escalation, which was right when Support was the
-- only desk with a screen. Now that billing goes to Financial and sales goes to CRM,
-- each desk needs its own slice — and the AI module needs all of them.
--
-- The category filter is IN THE POLICY, not only in the API, so a financial clerk
-- cannot read a connectivity transcript by calling the endpoint with a different
-- filter. Transcripts are the sensitive part: 056 already noted they can contain a
-- client's balance.

do $$
declare
  t text;
begin
  foreach t in array array[
    'support_chat_sessions',
    'support_chat_messages',
    'support_chat_escalations'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
  end loop;
end $$;

-- Escalations: each desk sees its own categories; `ai` sees everything.
create policy support_chat_escalations_select
  on public.support_chat_escalations for select to authenticated
  using (
    (select public.has_module_access('ai','view'))
    or (category in ('connectivity','general') and (select public.has_module_access('support','view')))
    or (category = 'billing' and (select public.has_module_access('financial','view')))
    or (category = 'sales'   and (select public.has_module_access('crm','view')))
  );

create policy support_chat_escalations_update
  on public.support_chat_escalations for update to authenticated
  using (
    (select public.has_module_access('ai','manage'))
    or (category in ('connectivity','general') and (select public.has_module_access('support','edit')))
    or (category = 'billing' and (select public.has_module_access('financial','edit')))
    or (category = 'sales'   and (select public.has_module_access('crm','edit')))
  )
  with check (
    (select public.has_module_access('ai','manage'))
    or (category in ('connectivity','general') and (select public.has_module_access('support','edit')))
    or (category = 'billing' and (select public.has_module_access('financial','edit')))
    or (category = 'sales'   and (select public.has_module_access('crm','edit')))
  );

-- Sessions and transcripts follow whichever escalation they produced. A conversation
-- that never escalated is readable only with the `ai` module: nobody else has a reason
-- to read a stranger's chat, and most of those conversations were resolved without a
-- human ever needing to be involved.
create policy support_chat_sessions_select
  on public.support_chat_sessions for select to authenticated
  using (
    (select public.has_module_access('ai','view'))
    or exists (
      select 1 from public.support_chat_escalations e
      where e.session_id = support_chat_sessions.id
        and (
          (e.category in ('connectivity','general') and (select public.has_module_access('support','view')))
          or (e.category = 'billing' and (select public.has_module_access('financial','view')))
          or (e.category = 'sales'   and (select public.has_module_access('crm','view')))
        )
    )
  );

create policy support_chat_messages_select
  on public.support_chat_messages for select to authenticated
  using (
    (select public.has_module_access('ai','view'))
    or exists (
      select 1 from public.support_chat_escalations e
      where e.session_id = support_chat_messages.session_id
        and (
          (e.category in ('connectivity','general') and (select public.has_module_access('support','view')))
          or (e.category = 'billing' and (select public.has_module_access('financial','view')))
          or (e.category = 'sales'   and (select public.has_module_access('crm','view')))
        )
    )
  );

-- ai_interactions holds prompts and cost across every future AI feature, not just this
-- one. 056 put it at admin/view; the AI module is its natural home too.
drop policy if exists ai_interactions_select on public.ai_interactions;
create policy ai_interactions_select
  on public.ai_interactions for select to authenticated
  using (
    (select public.has_module_access('ai','view'))
    or (select public.has_module_access('admin','view'))
  );

commit;
