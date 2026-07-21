-- Per-unit client credentials (PPPoE + WiFi) for stock items

alter table public.stock_items
  add column if not exists client_pppoe text not null default '',
  add column if not exists wifi_name text not null default '',
  add column if not exists wifi_password text not null default '';
