-- 061_project_advisor.sql
--
-- Advice on a project, argued from this company's own track record.
--
-- WHAT THIS IS NOT. It is not a chatbot bolted onto the idea funnel, and the model does
-- not "learn" in any technical sense — nothing here fine-tunes anything. What grows is
-- the EVIDENCE the model is handed: every project that finishes adds its delay causes,
-- its quote-versus-cost shape and its purchase prices to the record, and the next
-- answer is argued from a bigger book. Advice on the tenth project is better than advice
-- on the second because there is more to reason from, not because a model changed.
--
-- That distinction is the whole design. Generic advice about running fibre projects is
-- worth nothing — it is a search away and it does not know this business. Advice that
-- says "the cherry picker cost you 22 days across three issues on Fibre Network Cleanup,
-- and this estate is the same overhead-line work" is worth something, and can only come
-- from data that already lives in these tables:
--
--   project_issues        what actually held jobs up, and for how long
--   project_blocks/stages where the work stalled inside a build
--   projects + costs      quoted versus stock versus teams, per finished job
--   purchase_order_lines  what was really paid per item, per supplier
--   project_resources     which plant was repeatedly not in working order
--
-- Each run is stored rather than streamed and forgotten, because the interesting
-- question a year from now is "what did we predict, and were we right?" — and because
-- an answer given when the book held three projects should be readable as such. That is
-- what `evidence` records: the size and shape of the corpus at the time of asking.

begin;

create table if not exists public.project_advice (
  id           text primary key,
  project_id   text not null references public.projects(id) on delete cascade,

  -- What was asked. Blank for the default "look at this project" run; set when
  -- somebody asked something specific.
  question     text not null default '',

  -- The advice itself. One-line read for lists, full structured payload for the page.
  --
  -- jsonb rather than a column per section: the shape of the advice is a prompt-level
  -- decision that will be tuned, and a migration per tweak would be absurd. The API
  -- validates it against the schema it asked the model for, so the column holds
  -- whatever that contract currently is.
  headline     text not null default '',
  advice       jsonb not null default '{}'::jsonb,

  /**
   * How big the book was at the time of asking.
   *
   * Advice from three projects and advice from thirty read identically on the page and
   * are not remotely equally trustworthy. Recording the corpus makes an old answer
   * interpretable instead of merely old, and makes "is this getting better?" a question
   * with an answer.
   */
  evidence     jsonb not null default '{}'::jsonb,

  -- Cost and provenance, same shape as ai_interactions in 056.
  model        text not null default '',
  effort       text not null default '',
  input_tokens  int not null default 0,
  output_tokens int not null default 0,
  cost_usd     numeric(12,6) not null default 0,

  requested_by text references public.team_members(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists project_advice_project_idx
  on public.project_advice (project_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Readable with the project. Writing goes through the API — the route holds the API
-- key and is the only thing that should ever be able to bill a model call, so there is
-- no client-side insert policy at all.

alter table public.project_advice enable row level security;
revoke all on public.project_advice from anon;

drop policy if exists project_advice_select on public.project_advice;
create policy project_advice_select on public.project_advice
  for select to authenticated
  using (public.can_see_project(project_id));

-- Deleting is tidying up a bad run; same bar as editing the project.
drop policy if exists project_advice_delete on public.project_advice;
create policy project_advice_delete on public.project_advice
  for delete to authenticated
  using (public.can_edit_project(project_id));

commit;
