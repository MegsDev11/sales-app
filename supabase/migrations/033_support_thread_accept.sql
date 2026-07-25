-- Support chat: client requests → support accepts → messaging unlocks.
-- Existing open/closed threads stay as-is; pending is the new pre-accept state.

alter table public.support_threads
  drop constraint if exists support_threads_status_check;

alter table public.support_threads
  add constraint support_threads_status_check
  check (status in ('pending', 'open', 'closed'));

alter table public.support_threads
  add column if not exists accepted_by text;

alter table public.support_threads
  add column if not exists accepted_at timestamptz;
