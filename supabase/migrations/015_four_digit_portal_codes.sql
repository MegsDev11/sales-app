-- Encrypted recoverable copies let authorized office staff remind clients and technicians.
-- Hashes remain the source of truth for code validation.

alter table public.stock_items
  add column if not exists client_pin_ciphertext text;

alter table public.team_members
  add column if not exists access_code_ciphertext text;

create unique index if not exists team_members_access_code_hash_unique
  on public.team_members (access_code_hash)
  where access_code_hash is not null;
