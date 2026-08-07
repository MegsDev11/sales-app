-- 057_accounts_dunning.sql
--
-- Chasing overdue accounts: escalating reminders and a suspension list.
--
-- Depends on 051–054 (client book, invoicing, AR ledger) and reads the age analysis.
--
-- WHY THE LEVELS ARE DATA, NOT CODE. How hard to push, and how soon, is a commercial
-- decision that changes with the season and with who is running the department. It
-- belongs in a table the manager can edit, not in a constant somebody has to redeploy.
--
-- WHY EVERY NOTICE IS LOGGED. Three things depend on knowing exactly what was sent
-- and when:
--
--   1. ESCALATION. A final demand is only fair after a reminder was actually sent. The
--      log is what proves the earlier step happened.
--   2. NOT REPEATING. Runs get started twice, or two clerks work the same list. The
--      cooldown makes a second run a no-op rather than a second demand landing in the
--      same inbox on the same morning.
--   3. EVIDENCE. If an account is suspended or handed over, the business needs to show
--      it asked first. `amount_at_send` and `oldest_days_at_send` are snapshotted for
--      that reason — the debt will have moved by the time anyone asks.
--
-- WHO GETS CHASED IS NOT WHO GETS INVOICED. A cancelled client is never invoiced
-- again, but if they left owing money they are exactly who should be chased. Dunning
-- eligibility therefore keys off the BALANCE and its age, not off `billing_status`.

begin;

-- ---------------------------------------------------------------------------
-- Levels
-- ---------------------------------------------------------------------------

create table if not exists public.accounts_dunning_levels (
  id            text primary key,
  -- 1 is the gentlest. Escalation walks up this order.
  level_order   int not null,
  name          text not null,
  -- Minimum age, in days, of the client's OLDEST unpaid invoice.
  min_days      int not null,
  -- Days that must pass before this client can be sent this level (or a lower one)
  -- again. Without it, a re-run is a second demand.
  cooldown_days int not null default 14,
  subject       text not null default '',
  body          text not null default '',
  -- Sent instead of `body` when the client pays by debit order — for them the story
  -- is a returned debit, not an unpaid invoice, and the wrong wording invites a
  -- reply pointing out they never had to pay manually in the first place.
  body_debit_order text not null default '',
  -- Levels at or above this mark the account for disconnection rather than another
  -- letter. Nothing is disconnected automatically; it produces a list.
  is_suspension boolean not null default false,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create unique index if not exists accounts_dunning_levels_order_key
  on public.accounts_dunning_levels (level_order);

insert into public.accounts_dunning_levels
  (id, level_order, name, min_days, cooldown_days, is_suspension, subject, body, body_debit_order)
values
  (
    'adl-1', 1, 'Payment reminder', 7, 14, false,
    'Your MEGS account — {{amount_due}} outstanding',
    E'Dear {{contact_name}},\n\n'
    'We hope you are well.\n\n'
    'Our records show that {{amount_due}} is currently outstanding on your MEGS account, '
    'the oldest item being {{days_overdue}} days old.\n\n'
    'If you have already made payment, thank you — please send us the proof of payment '
    'so we can allocate it, and ignore this message.\n\n'
    'Otherwise, would you kindly settle the account at your earliest convenience.\n\n'
    'Warm Regards\n{{accounts_owner}}\nMEGS Waterberg',
    E'Dear {{contact_name}},\n\n'
    'We hope you are well.\n\n'
    'Our records show that {{amount_due}} is outstanding on your MEGS account. Your '
    'account is paid by debit order, so this usually means a debit was returned unpaid.\n\n'
    'Would you kindly check with your bank, or settle the outstanding amount directly '
    'and send us the proof of payment.\n\n'
    'Warm Regards\n{{accounts_owner}}\nMEGS Waterberg'
  ),
  (
    'adl-2', 2, 'Second reminder', 30, 14, false,
    'Second reminder — {{amount_due}} overdue on your MEGS account',
    E'Dear {{contact_name}},\n\n'
    'Despite our previous reminder, {{amount_due}} remains outstanding on your MEGS '
    'account. The oldest item is now {{days_overdue}} days old.\n\n'
    'Please arrange payment, or contact us to make an arrangement — we would far rather '
    'find a workable arrangement than let the account fall further behind.\n\n'
    'Warm Regards\n{{accounts_owner}}\nMEGS Waterberg',
    ''
  ),
  (
    'adl-3', 3, 'Final demand', 60, 21, false,
    'Final demand — {{amount_due}} on your MEGS account',
    E'Dear {{contact_name}},\n\n'
    'This is a final reminder that {{amount_due}} is outstanding on your MEGS account, '
    'the oldest item being {{days_overdue}} days old.\n\n'
    'Unless the account is settled or an arrangement is made, your service may be '
    'suspended. Please contact us as soon as possible so we can avoid that.\n\n'
    'Warm Regards\n{{accounts_owner}}\nMEGS Waterberg',
    ''
  ),
  (
    'adl-4', 4, 'Suspension notice', 90, 30, true,
    'Service suspension — MEGS account {{amount_due}} overdue',
    E'Dear {{contact_name}},\n\n'
    '{{amount_due}} has been outstanding on your MEGS account for {{days_overdue}} days, '
    'and we have not been able to reach an arrangement with you.\n\n'
    'Your service is now scheduled for suspension. To avoid this, please settle the '
    'account or contact us today.\n\n'
    'Warm Regards\n{{accounts_owner}}\nMEGS Waterberg',
    ''
  )
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Notices sent
-- ---------------------------------------------------------------------------

create table if not exists public.accounts_dunning_notices (
  id          text primary key,
  client_id   text not null references public.accounts_clients(id) on delete cascade,
  level_id    text not null references public.accounts_dunning_levels(id) on delete restrict,
  level_order int not null,

  sent_at     timestamptz not null default now(),
  sent_to     text not null default '',
  -- What the account looked like when the notice went out. Snapshotted because the
  -- debt moves, and "we told you on the 3rd that you owed R4 200" has to stay true.
  amount_at_send      numeric(14,2) not null default 0,
  oldest_days_at_send int not null default 0,

  status      text not null default 'sent',
  error       text not null default '',
  sent_by     text references public.team_members(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists accounts_dunning_notices_client_idx
  on public.accounts_dunning_notices (client_id, sent_at desc);
create index if not exists accounts_dunning_notices_sent_idx
  on public.accounts_dunning_notices (sent_at desc);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'accounts_dunning_notices_status_check'
  ) then
    alter table public.accounts_dunning_notices
      add constraint accounts_dunning_notices_status_check
      check (status in ('sent', 'failed'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Suspension flag on the client
-- ---------------------------------------------------------------------------
-- Set when a suspension-level notice goes out, cleared when the account is settled.
-- Nothing is disconnected by the app: this produces a list for a human to work, and
-- cutting off a paying customer by mistake is far more expensive than a day's delay.

alter table public.accounts_clients
  add column if not exists suspension_flagged_at timestamptz;

create index if not exists accounts_clients_suspension_idx
  on public.accounts_clients (suspension_flagged_at)
  where suspension_flagged_at is not null;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Accounts runs collections, so Accounts writes here. Financial reads: they need to
-- see what has been chased before writing off a debt.

do $$
declare t text;
begin
  foreach t in array array['accounts_dunning_levels', 'accounts_dunning_notices'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);

    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using ((select public.has_module_access(''accounts'',''view''))
             or (select public.has_module_access(''financial'',''view'')))',
      t || '_select', t);

    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using ((select public.has_module_access(''accounts'',''edit'')))
         with check ((select public.has_module_access(''accounts'',''edit'')))',
      t || '_write', t);
  end loop;
end $$;

commit;
