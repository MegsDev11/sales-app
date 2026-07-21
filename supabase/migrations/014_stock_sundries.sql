-- Quantity-based consumable stock without serial numbers or QR codes

create table if not exists public.stock_sundries (
  id text primary key,
  name text not null,
  unit_label text not null default 'each',
  quantity integer not null default 0 check (quantity >= 0),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stock_sundries_name_idx
  on public.stock_sundries (lower(name));

alter table public.stock_sundries enable row level security;

drop policy if exists "Allow authenticated read stock_sundries" on public.stock_sundries;
drop policy if exists "Allow authenticated write stock_sundries" on public.stock_sundries;

create policy "Allow authenticated read stock_sundries"
  on public.stock_sundries for select to authenticated using (true);

create policy "Allow authenticated write stock_sundries"
  on public.stock_sundries for all to authenticated using (true) with check (true);
