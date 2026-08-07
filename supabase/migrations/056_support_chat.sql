-- 056_support_chat.sql
--
-- The client-facing support assistant on the landing page.
--
-- WHY. Three groups of calls reach staff who cannot do anything useful with them.
-- Support gets "is the internet down?" during an area outage the tower dashboard
-- already knows about. Accounts gets "what are your banking details" and "what is my
-- reference", which are the same two answers every time and are already stored in
-- accounts_settings. And both get calls after 17:00, when nobody is at a desk, so the
-- client waits until morning to be told something a database row could have told them
-- immediately. This module answers those from live data and escalates the rest.
--
-- THE MODEL NEVER SEES THE DATABASE. It is given a fixed registry of tools in
-- lib/ai/tools.ts; each tool runs a specific query and returns a specific shape. Every
-- figure a client is shown therefore comes out of a query, never out of the model's
-- own head — the difference between "your balance is R1 240.50" being a fact and it
-- being a plausible-looking guess. Tools that read one client's data re-check this
-- session's verification themselves rather than trusting the caller.
--
-- VERIFICATION. The chat is public and anonymous by default: coverage, outages,
-- banking details and troubleshooting need no identity. The moment a question is about
-- one specific account, the assistant sends a code to the address already stored on
-- that client and can read nothing until the code comes back. Codes are hashed with
-- the same peppered SHA-256 as the QR portal (lib/portal-auth.ts), so a leaked
-- database dump does not hand over working codes.
--
-- Conventions follow 046_projects.sql / 049_commission.sql: text primary keys with
-- application-generated ids, RLS via has_module_access(). Every table here is written
-- exclusively by the service-role client in app/api/chat, which bypasses RLS; the
-- policies below exist so staff can READ what the assistant did, and so that an
-- anon-key request that somehow reaches these tables gets nothing.

begin;

-- ---------------------------------------------------------------------------
-- AI call audit
-- ---------------------------------------------------------------------------
-- Called for by docs/OPS_PLATFORM_PLAN.md §5.3: "Log every AI call in ai_interactions
-- — you will want the audit trail and the cost visibility."
--
-- Deliberately not scoped to the chatbot. This is the ledger for every model call the
-- platform makes, so the reorder assistant and the ops queries land here too when they
-- ship. `surface` says which feature spent the money.
--
-- Cost is stored per row rather than derived later because per-token prices change and
-- a historical row must keep costing what it actually cost.

create table if not exists public.ai_interactions (
  id            text primary key,
  surface       text not null default 'support_chat',
  -- Set for staff-facing surfaces. Null for the public chat, where there is no user.
  team_member_id text references public.team_members(id) on delete set null,
  -- Free-form link to whatever the surface considers a conversation.
  session_id    text,

  model         text not null default '',
  effort        text not null default '',
  -- The turn that triggered the call, and what came back. Truncated by the caller.
  prompt        text not null default '',
  response      text not null default '',
  -- [{name, ok, ms}] — which tools ran, so a wrong answer can be traced to the query
  -- that produced it rather than guessed at.
  tools_used    jsonb not null default '[]'::jsonb,

  input_tokens        int not null default 0,
  output_tokens       int not null default 0,
  cache_read_tokens   int not null default 0,
  cache_write_tokens  int not null default 0,
  cost_usd      numeric(12,6) not null default 0,

  -- end_turn / tool_use / max_tokens / refusal. Worth keeping: a run of `refusal`
  -- or `max_tokens` is a prompt problem, not a user problem.
  stop_reason   text not null default '',
  error         text not null default '',
  created_at    timestamptz not null default now()
);

create index if not exists ai_interactions_created_idx
  on public.ai_interactions (created_at desc);
create index if not exists ai_interactions_surface_idx
  on public.ai_interactions (surface, created_at desc);
create index if not exists ai_interactions_session_idx
  on public.ai_interactions (session_id);

-- ---------------------------------------------------------------------------
-- Conversations
-- ---------------------------------------------------------------------------

create table if not exists public.support_chat_sessions (
  id            text primary key,

  -- An opaque token minted per browser and held in a cookie, stored hashed. It is not
  -- an identity — it only stops one visitor from resuming another's conversation.
  visitor_hash  text not null,
  -- Hashed client IP, for rate limiting a single abuser without keeping addresses.
  ip_hash       text not null default '',

  status        text not null default 'active',

  -- --- verification ---
  -- Null until a code has been sent AND returned. Every account-scoped tool reads
  -- these two columns and refuses when verified_at is null.
  verified_client_id text references public.accounts_clients(id) on delete set null,
  verified_at        timestamptz,
  verified_channel   text not null default '',

  message_count int not null default 0,
  last_message_at timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists support_chat_sessions_visitor_idx
  on public.support_chat_sessions (visitor_hash);
create index if not exists support_chat_sessions_created_idx
  on public.support_chat_sessions (created_at desc);
create index if not exists support_chat_sessions_client_idx
  on public.support_chat_sessions (verified_client_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'support_chat_sessions_status_check'
  ) then
    alter table public.support_chat_sessions
      add constraint support_chat_sessions_status_check
      check (status in ('active', 'escalated', 'closed'));
  end if;
end $$;

-- The transcript. Kept because it is the handover: a technician picking up an
-- escalation at 07:00 needs to see what was already tried at 23:00, and because an
-- assistant that gave a wrong answer can only be corrected if the answer was recorded.
create table if not exists public.support_chat_messages (
  id          text primary key,
  session_id  text not null references public.support_chat_sessions(id) on delete cascade,
  role        text not null,
  body        text not null default '',
  -- Names of the tools that produced this turn, mirroring ai_interactions.tools_used.
  tools_used  jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists support_chat_messages_session_idx
  on public.support_chat_messages (session_id, created_at);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'support_chat_messages_role_check'
  ) then
    alter table public.support_chat_messages
      add constraint support_chat_messages_role_check
      check (role in ('user', 'assistant'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Identity checks
-- ---------------------------------------------------------------------------
-- One row per code sent. Rows are kept after use so that repeated failed attempts
-- against one client are visible rather than silently discarded.
--
-- `destination_masked` is what the client is shown ("j••••@gmail.com"). The full
-- address is never returned to the browser: telling an unverified visitor the exact
-- address on file would leak it to anyone who can guess a customer name.

create table if not exists public.support_chat_verifications (
  id          text primary key,
  session_id  text not null references public.support_chat_sessions(id) on delete cascade,
  client_id   text not null references public.accounts_clients(id) on delete cascade,

  channel     text not null default 'email',
  destination_masked text not null default '',
  -- Peppered SHA-256, per lib/portal-auth.ts. The code itself is never stored.
  code_hash   text not null,

  attempts    int not null default 0,
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists support_chat_verifications_session_idx
  on public.support_chat_verifications (session_id, created_at desc);
create index if not exists support_chat_verifications_client_idx
  on public.support_chat_verifications (client_id, created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'support_chat_verifications_channel_check'
  ) then
    alter table public.support_chat_verifications
      add constraint support_chat_verifications_channel_check
      check (channel in ('email', 'sms'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Escalations
-- ---------------------------------------------------------------------------
-- A new intake queue rather than a reuse of an existing one, because neither existing
-- queue fits: client_support_requests is keyed to a physical stock item (it is raised
-- by scanning the QR sticker on a router), and support_threads requires both a lead
-- and an issued client_account. A visitor on the landing page has none of those. What
-- they do have is a conversation, which is what this table hangs onto.

create table if not exists public.support_chat_escalations (
  id          text primary key,
  session_id  text not null references public.support_chat_sessions(id) on delete cascade,

  -- Short code the client is given in the chat and quotes when they phone. Drawn from
  -- an alphabet with no O/0 or I/1, because it gets read aloud.
  reference   text not null default '',

  category    text not null default 'general',
  urgency     text not null default 'normal',
  -- The assistant's own summary of the problem plus what it already ruled out.
  summary     text not null default '',

  contact_name  text not null default '',
  contact_phone text not null default '',
  contact_email text not null default '',
  -- Set only when the session verified. An escalation from an anonymous visitor is
  -- still worth having; it just arrives without an account attached.
  accounts_client_id text references public.accounts_clients(id) on delete set null,

  -- Computed when the row is written, so the morning triage can tell "came in
  -- overnight" from "came in while we were open and nobody picked it up".
  after_hours boolean not null default false,

  status      text not null default 'new',
  -- Outcome of the on-call email. A blank error with a set timestamp means delivered.
  notified_at timestamptz,
  notify_error text not null default '',

  assigned_to text references public.team_members(id) on delete set null,
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);

create unique index if not exists support_chat_escalations_reference_key
  on public.support_chat_escalations (reference) where reference <> '';
create index if not exists support_chat_escalations_status_idx
  on public.support_chat_escalations (status, created_at desc);
create index if not exists support_chat_escalations_created_idx
  on public.support_chat_escalations (created_at desc);
create index if not exists support_chat_escalations_client_idx
  on public.support_chat_escalations (accounts_client_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'support_chat_escalations_category_check'
  ) then
    alter table public.support_chat_escalations
      add constraint support_chat_escalations_category_check
      check (category in ('connectivity', 'billing', 'sales', 'general'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'support_chat_escalations_urgency_check'
  ) then
    alter table public.support_chat_escalations
      add constraint support_chat_escalations_urgency_check
      check (urgency in ('normal', 'urgent'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'support_chat_escalations_status_check'
  ) then
    alter table public.support_chat_escalations
      add constraint support_chat_escalations_status_check
      check (status in ('new', 'acknowledged', 'resolved'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- Writes all come from the service-role client, which bypasses RLS. These policies
-- govern reads by signed-in staff, and — just as importantly — deny everything to the
-- anon key. Nothing here is publicly readable: a transcript can contain a client's
-- balance, and 039_close_public_read.sql closed the last of the open reads for
-- exactly that reason.
--
-- Escalations and transcripts are readable at support/view because that is the queue
-- support works. Verifications are manage-only — the row proves who was asked to
-- confirm what, and that is an audit record, not a working list. ai_interactions is
-- admin-only: it holds prompts and costs across every module.

alter table public.ai_interactions             enable row level security;
alter table public.support_chat_sessions       enable row level security;
alter table public.support_chat_messages       enable row level security;
alter table public.support_chat_verifications  enable row level security;
alter table public.support_chat_escalations    enable row level security;

do $$
declare
  t text;
begin
  -- Support reads the queue and the conversations behind it.
  foreach t in array array[
    'support_chat_sessions',
    'support_chat_messages',
    'support_chat_escalations'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using ((select public.has_module_access(''support'',''view'')))',
      t || '_select', t);

    -- Staff update status and assignment from the queue screen; inserts stay with the
    -- service role, which is the only thing that should be creating conversations.
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using ((select public.has_module_access(''support'',''edit'')))
         with check ((select public.has_module_access(''support'',''edit'')))',
      t || '_update', t);
  end loop;

  execute 'drop policy if exists support_chat_verifications_select
             on public.support_chat_verifications';
  execute 'create policy support_chat_verifications_select
             on public.support_chat_verifications for select to authenticated
             using ((select public.has_module_access(''support'',''manage'')))';

  execute 'drop policy if exists ai_interactions_select on public.ai_interactions';
  execute 'create policy ai_interactions_select
             on public.ai_interactions for select to authenticated
             using ((select public.has_module_access(''admin'',''view'')))';
end $$;

commit;
