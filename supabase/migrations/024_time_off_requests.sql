-- Technician time-off requests (mobile) reviewed by Coordination.

create table if not exists public.time_off_requests (
  id text primary key,
  technician_id text not null references public.team_members (id) on delete cascade,
  leave_type text not null
    check (leave_type in ('family', 'time_off', 'sick', 'unpaid')),
  start_date date not null,
  end_date date not null,
  days numeric(6, 2) not null default 1,
  reason text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'declined')),
  reviewed_by text references public.team_members (id) on delete set null,
  reviewed_at timestamptz,
  review_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint time_off_requests_dates check (end_date >= start_date)
);

create index if not exists time_off_requests_technician_idx
  on public.time_off_requests (technician_id, created_at desc);

create index if not exists time_off_requests_status_idx
  on public.time_off_requests (status, created_at desc);

alter table public.time_off_requests enable row level security;
