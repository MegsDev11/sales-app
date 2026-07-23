-- Owner-recoverable staff login passwords (encrypted). Auth still uses Supabase hashed passwords.

alter table public.team_members
  add column if not exists login_password_ciphertext text;
