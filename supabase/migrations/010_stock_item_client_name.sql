-- Client name on stock units, alongside PPPoE + WiFi credentials

alter table public.stock_items
  add column if not exists client_name text not null default '';
