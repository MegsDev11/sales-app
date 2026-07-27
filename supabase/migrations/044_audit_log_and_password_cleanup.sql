-- 044_audit_log_and_password_cleanup.sql
--
-- 1. Drop the reversibly-encrypted staff password column.
-- 2. Add a trigger-driven audit log over the sensitive tables.

begin;

-- ---------------------------------------------------------------------------
-- 1. Staff passwords are no longer recoverable
-- ---------------------------------------------------------------------------
-- login_password_ciphertext (migration 019) stored staff passwords with symmetric
-- encryption so the owner could read them back. Supabase Auth already holds a proper
-- hash for authentication, so this column bought convenience at the cost of every
-- staff password being one key-leak away from disclosure.
--
-- Replaced by: admin sets a new password, it is shown once, never stored.
-- See app/api/users/route.ts.

alter table public.team_members drop column if exists login_password_ciphertext;

-- ---------------------------------------------------------------------------
-- 2. Audit log
-- ---------------------------------------------------------------------------
-- Trigger-driven rather than written from application code, so it cannot be
-- forgotten at a new call site. Matters more now that one person can act across
-- several modules.

create table if not exists public.audit_log (
  id          bigserial primary key,
  actor_id    text,
  actor_name  text,
  action      text not null,             -- INSERT | UPDATE | DELETE
  entity_type text not null,
  entity_id   text,
  before      jsonb,
  after       jsonb,
  at          timestamptz not null default now()
);

create index if not exists audit_log_entity_idx on public.audit_log (entity_type, entity_id, at desc);
create index if not exists audit_log_actor_idx  on public.audit_log (actor_id, at desc);
create index if not exists audit_log_at_idx     on public.audit_log (at desc);

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer set search_path = public as $$
declare
  v_actor   text;
  v_name    text;
  v_id      text;
begin
  begin
    v_actor := public.current_member_id();
  exception when others then
    v_actor := null;
  end;

  if v_actor is not null then
    select name into v_name from public.team_members where id = v_actor;
  end if;

  -- Most tables have a single `id`. The grant tables are keyed on a composite
  -- (user_id, module_key) / (template_id, module_key), so fall back to those —
  -- otherwise every access change logs with a blank entity_id and the trail is
  -- useless for exactly the rows we most want to audit.
  declare
    v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  begin
    v_id := coalesce(
      v_row ->> 'id',
      nullif(concat_ws(':', v_row ->> 'user_id',     v_row ->> 'module_key'), ':'),
      nullif(concat_ws(':', v_row ->> 'template_id', v_row ->> 'module_key'), ':'),
      v_row ->> 'key'
    );
  end;

  insert into public.audit_log (actor_id, actor_name, action, entity_type, entity_id, before, after)
  values (
    v_actor,
    coalesce(v_name, 'system/service-role'),
    tg_op,
    tg_table_name,
    v_id,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$
declare
  t text;
  audited text[] := array[
    'team_members',
    'user_module_access',
    'access_template_modules',
    'modules',
    'departments'
  ];
begin
  foreach t in array audited loop
    if exists (select 1 from pg_tables where schemaname='public' and tablename=t) then
      execute format('drop trigger if exists trg_audit_%1$s on public.%1$I', t);
      execute format(
        'create trigger trg_audit_%1$s after insert or update or delete on public.%1$I
           for each row execute function public.write_audit_log()', t);
    end if;
  end loop;
end $$;

alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;

drop policy if exists audit_log_read on public.audit_log;
create policy audit_log_read on public.audit_log
  for select to authenticated
  using ((select public.has_module_access('admin','view')));

-- No insert/update/delete policy: only the SECURITY DEFINER trigger writes here,
-- and nobody edits history.

commit;
