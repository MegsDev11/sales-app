-- Support messaging threads between clients and support staff.

create table if not exists public.support_threads (
  id text primary key,
  lead_id text not null references public.leads (id) on delete cascade,
  client_account_id text not null references public.client_accounts (id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'closed')),
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.support_messages (
  id text primary key,
  thread_id text not null references public.support_threads (id) on delete cascade,
  sender_type text not null check (sender_type in ('client', 'staff')),
  sender_id text,
  body text not null,
  attachment_path text,
  created_at timestamptz not null default now()
);

create index if not exists support_threads_lead_idx on public.support_threads (lead_id);
create index if not exists support_threads_client_idx on public.support_threads (client_account_id);
create index if not exists support_messages_thread_idx on public.support_messages (thread_id, created_at);

alter table public.support_threads enable row level security;
alter table public.support_messages enable row level security;

drop policy if exists "Allow authenticated read support_threads" on public.support_threads;
drop policy if exists "Allow authenticated write support_threads" on public.support_threads;
create policy "Allow authenticated read support_threads"
  on public.support_threads for select to authenticated using (true);
create policy "Allow authenticated write support_threads"
  on public.support_threads for all to authenticated using (true) with check (true);

drop policy if exists "Allow authenticated read support_messages" on public.support_messages;
drop policy if exists "Allow authenticated write support_messages" on public.support_messages;
create policy "Allow authenticated read support_messages"
  on public.support_messages for select to authenticated using (true);
create policy "Allow authenticated write support_messages"
  on public.support_messages for all to authenticated using (true) with check (true);
