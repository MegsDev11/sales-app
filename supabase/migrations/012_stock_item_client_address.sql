-- Client address on stock units, alongside client name + WiFi details

alter table public.stock_items
  add column if not exists client_address text not null default '';
