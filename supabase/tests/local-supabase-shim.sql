-- Minimal Supabase-compatible environment so the real migrations can be executed
-- and verified locally: the auth schema, auth.uid(), the anon/authenticated/service_role
-- roles, and the supabase_realtime publication that 001 adds tables to.
create schema if not exists auth;

do $$ begin create role anon           nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated  nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role   nologin bypassrls; exception when duplicate_object then null; end $$;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;

-- auth.uid() reads a session GUC so tests can impersonate a user.
create or replace function auth.uid() returns uuid
language sql stable as $fn$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$fn$;

create or replace function auth.role() returns text
language sql stable as $fn$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon');
$fn$;

do $$ begin
  create publication supabase_realtime;
exception when duplicate_object then null; end $$;

-- Supabase's auth.users, referenced conceptually by team_members.auth_user_id
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key, name text, public boolean default false
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid
);
