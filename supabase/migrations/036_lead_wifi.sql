-- Wi-Fi credentials captured by sales on the lead (autofill for Client QRs / installs).
alter table public.leads
  add column if not exists wifi_name text not null default '',
  add column if not exists wifi_password text not null default '';
