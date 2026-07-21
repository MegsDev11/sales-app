-- Client QR portal: PINs, technician codes, visits, support requests, sessions

alter table public.stock_items
  add column if not exists client_pin_hash text,
  add column if not exists client_pin_updated_at timestamptz;

alter table public.team_members
  add column if not exists access_code_hash text,
  add column if not exists access_code_updated_at timestamptz;

create table if not exists public.stock_item_visits (
  id text primary key,
  item_id text not null references public.stock_items(id) on delete cascade,
  technician_id text not null references public.team_members(id),
  work_notes text not null default '',
  submitted_at timestamptz not null default now()
);

create index if not exists stock_item_visits_item_id_idx on public.stock_item_visits(item_id);
create index if not exists stock_item_visits_submitted_at_idx on public.stock_item_visits(submitted_at desc);

create table if not exists public.client_support_requests (
  id text primary key,
  item_id text not null references public.stock_items(id) on delete cascade,
  category text not null default 'other',
  description text not null default '',
  status text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  updated_by_id text references public.team_members(id)
);

create index if not exists client_support_requests_item_id_idx on public.client_support_requests(item_id);
create index if not exists client_support_requests_status_idx on public.client_support_requests(status);
create index if not exists client_support_requests_created_at_idx on public.client_support_requests(created_at desc);

create table if not exists public.qr_portal_sessions (
  id text primary key,
  stock_item_id text not null references public.stock_items(id) on delete cascade,
  qr_token text not null,
  role text not null check (role in ('client', 'technician')),
  technician_id text references public.team_members(id),
  session_token_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists qr_portal_sessions_token_hash_idx on public.qr_portal_sessions(session_token_hash);
create index if not exists qr_portal_sessions_expires_at_idx on public.qr_portal_sessions(expires_at);
