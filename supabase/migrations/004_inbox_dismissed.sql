-- Allow leads to be dismissed from Lead Inbox without deleting them from the CRM
alter table public.leads
  add column if not exists inbox_dismissed_at timestamptz;
