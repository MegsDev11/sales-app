-- 062_advisor_settings.sql
--
-- The project advisor gets the same three knobs the website assistant has: a kill
-- switch, an effort dial, and a place to say what it should pay attention to.
--
-- Same row, not a new table. `ai_agent_settings` is the settings for the AI agents in
-- this app — it was written when there was one, and the fix for there now being two is
-- a column prefix, not a second single-row table with its own loader, its own route and
-- its own way of falling back to the environment.
--
-- Every column falls back to the environment variable it replaces, exactly as 057 did,
-- so an unapplied migration or a blank value leaves the advisor behaving as it does
-- today rather than going dark.

begin;

-- Kill switch. False makes /api/projects/advisor refuse politely and the tab say so,
-- which is the difference between "switched off" and "broken" when somebody asks.
alter table public.ai_agent_settings
  add column if not exists advisor_enabled boolean not null default true;

-- low | medium | high | xhigh | max. Blank falls back to PROJECT_ADVISOR_EFFORT,
-- which itself defaults to `high` — the advisor reasons over a corpus and has to cite
-- it correctly, so it starts higher than the assistant's `medium`.
alter table public.ai_agent_settings
  add column if not exists advisor_effort text not null default '';

/**
 * House rules — the knob that actually earns its place.
 *
 * The advisor's system prompt is fixed in code and should stay that way; what changes
 * with the season and the crew is the standing context. "We don't trench in Limpopo in
 * December." "Always check the cherry picker is booked before quoting overhead work."
 * "Marchand's team is on Die Oog until March." None of that belongs in a deploy, and
 * without somewhere to put it the same sentence gets retyped into every question.
 *
 * Appended to the system prompt as OPERATOR context, clearly separated from the
 * evidence brief so the model can tell a standing instruction from a fact about the
 * record.
 */
alter table public.ai_agent_settings
  add column if not exists advisor_house_rules text not null default '';

do $$ begin
  alter table public.ai_agent_settings
    add constraint ai_agent_settings_advisor_effort_check
    check (advisor_effort in ('', 'low', 'medium', 'high', 'xhigh', 'max'));
exception when duplicate_object then null; end $$;

commit;
