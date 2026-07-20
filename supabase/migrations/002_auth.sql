-- Link team_members to Supabase Auth users
alter table public.team_members
  add column if not exists email text,
  add column if not exists auth_user_id uuid unique;

create unique index if not exists team_members_email_idx on public.team_members (email)
  where email is not null;
