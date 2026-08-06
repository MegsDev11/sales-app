-- 048_technician_documents.sql
--
-- Qualifications & documentation for field technicians.
--
-- Coordination creates the technician profile; this lets them attach the paperwork
-- that goes with a field worker — trade qualifications, safety certificates, driver's
-- licences, ID copies, contracts — each with a reference number and, importantly,
-- issue/expiry dates so expiring certificates can be surfaced before they lapse.
--
-- Files live in a PRIVATE storage bucket ("technician-docs"); the API hands out
-- short-lived signed URLs. ID copies and certificates are personal information, so
-- unlike the public wireless-assets bucket this one is never world-readable.

begin;

create table if not exists public.technician_documents (
  id            text primary key,
  technician_id text not null references public.team_members(id) on delete cascade,
  category      text not null default 'other',   -- qualification | certification | license
                                                 -- | id_document | contract | safety | medical | other
  title         text not null,
  reference     text not null default '',        -- certificate / licence number
  issued_on     date,
  expires_on    date,
  notes         text not null default '',
  file_name     text not null default '',
  storage_path  text,                            -- private bucket path; null = record only
  created_by    text references public.team_members(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists technician_documents_tech_idx
  on public.technician_documents (technician_id);
create index if not exists technician_documents_expiry_idx
  on public.technician_documents (expires_on);

-- ---------------------------------------------------------------------------
-- RLS — coordination owns technician records
-- ---------------------------------------------------------------------------

alter table public.technician_documents enable row level security;
revoke all on public.technician_documents from anon;

drop policy if exists technician_documents_select on public.technician_documents;
create policy technician_documents_select on public.technician_documents
  for select to authenticated
  using ((select public.has_module_access('coordination','view')));

drop policy if exists technician_documents_write on public.technician_documents;
create policy technician_documents_write on public.technician_documents
  for all to authenticated
  using ((select public.has_module_access('coordination','edit')))
  with check ((select public.has_module_access('coordination','edit')));

commit;
