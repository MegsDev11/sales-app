-- 060_project_document_uploads.sql
--
-- Project documents become real files, and quotes become one of the things you can
-- file against a project.
--
-- 058 modelled a document as a label and a URL, which matched the source workbook —
-- every entry there was a Google Drive link. That works right up until the folder is
-- reorganised, the share expires, or the person who owned the drive leaves; then the
-- BOQ for a finished build is a dead link and the only copy of what was quoted lives
-- in somebody's inbox. A row that points at a file elsewhere is not a record of the
-- file.
--
-- So a document is now EITHER an upload or a link, never neither:
--
--   storage_path  set -> the file itself, in a private bucket, served by signed URL
--   url           set -> a pointer, as before (the Live KMZ genuinely is a live link
--                        and should stay one)
--
-- Quotes ride the same table rather than getting their own. A quote IS a document —
-- it has a number, a value, and a PDF — and splitting it out would mean two panels,
-- two upload paths and two places to look for the same piece of paper. The two
-- columns it needs (reference, amount) are null for everything else.
--
-- projects.quote_number / quote_amount stay where they are: those are the ACCEPTED
-- commercial terms the job is being delivered against. This table holds the paper,
-- including the revisions that were not accepted.

begin;

-- ---------------------------------------------------------------------------
-- What kind of document this is
-- ---------------------------------------------------------------------------
-- Free text with a check rather than an enum: the list below covers the workbook's
-- own vocabulary (BOQ, KMZ, proposal, quote, photos, plans), and adding a category
-- later should not need a migration and an enum rewrite.

alter table public.project_documents
  add column if not exists kind text not null default 'other';

do $$ begin
  alter table public.project_documents
    add constraint project_documents_kind_check
    check (kind in ('quote','boq','kmz','plan','proposal','photo','invoice','report','other'));
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- The file
-- ---------------------------------------------------------------------------

alter table public.project_documents add column if not exists storage_path  text;
alter table public.project_documents add column if not exists file_name     text not null default '';
alter table public.project_documents add column if not exists file_size     bigint;
alter table public.project_documents add column if not exists content_type  text;

-- Quote number and value. Null on everything that is not a quote.
alter table public.project_documents add column if not exists reference text not null default '';
alter table public.project_documents add column if not exists amount    numeric(14,2);

-- ---------------------------------------------------------------------------
-- url stops being mandatory, but a row must still point at something
-- ---------------------------------------------------------------------------
-- Without the check, a failed upload leaves a labelled row with no file and no link —
-- a document that looks present in the list and opens nothing. That is worse than a
-- rejected insert, because nobody goes looking for the missing one.

alter table public.project_documents alter column url drop not null;

do $$ begin
  alter table public.project_documents
    add constraint project_documents_has_target
    check (storage_path is not null or (url is not null and url <> ''));
exception when duplicate_object then null; end $$;

create index if not exists project_documents_kind_idx
  on public.project_documents (project_id, kind);

commit;
