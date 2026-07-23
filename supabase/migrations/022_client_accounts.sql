-- Client accounts for mobile app login (MEGS-issued credentials).

create table if not exists public.client_accounts (
  id text primary key,
  auth_user_id uuid unique,
  lead_id text not null references public.leads (id) on delete cascade,
  email text,
  phone text,
  active boolean not null default true,
  issued_by text references public.team_members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_account_installations (
  id text primary key,
  client_account_id text not null references public.client_accounts (id) on delete cascade,
  stock_item_id text not null references public.stock_items (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (client_account_id, stock_item_id)
);

create index if not exists client_accounts_lead_idx on public.client_accounts (lead_id);
create index if not exists client_accounts_auth_idx on public.client_accounts (auth_user_id);

alter table public.client_accounts enable row level security;
alter table public.client_account_installations enable row level security;

drop policy if exists "Allow authenticated read client_accounts" on public.client_accounts;
drop policy if exists "Allow authenticated write client_accounts" on public.client_accounts;
create policy "Allow authenticated read client_accounts" on public.client_accounts for select to authenticated using (true);
create policy "Allow authenticated write client_accounts" on public.client_accounts for all to authenticated using (true) with check (true);

drop policy if exists "Allow authenticated read client_account_installations" on public.client_account_installations;
drop policy if exists "Allow authenticated write client_account_installations" on public.client_account_installations;
create policy "Allow authenticated read client_account_installations"
  on public.client_account_installations for select to authenticated using (true);
create policy "Allow authenticated write client_account_installations"
  on public.client_account_installations for all to authenticated using (true) with check (true);
