-- Client PPPoE on sales leads (shared with support / client app).
alter table public.leads
  add column if not exists client_pppoe text not null default '';
