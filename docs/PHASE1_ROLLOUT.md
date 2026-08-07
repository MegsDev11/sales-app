# Phase 0 + 1 rollout — module access control

What shipped, how to apply it, and how to verify it worked.

---

## 1. Apply the migrations, in order

```bash
npm run db:apply -- supabase/migrations/039_close_public_read.sql
npm run db:apply -- supabase/migrations/040_module_access.sql
npm run db:apply -- supabase/migrations/041_backfill_module_access.sql
npm run db:apply -- supabase/migrations/042_rls_module_policies.sql
npm run db:apply -- supabase/migrations/044_audit_log_and_password_cleanup.sql
```

(Or paste each into the Supabase SQL editor. `supabase db push` also works.)

All five are **idempotent** — re-running them is safe.

There is deliberately no `043`. The numbering keeps `044` aligned with the audit-log
work described in the plan document; nothing is missing.

**Apply 039 first, today, even if you do nothing else.** It closes a live data leak on
its own — see §5.

### Order matters

`041` backfills grants from the old `department` column, and `042` then locks the
tables down. Running `042` before `041` locks everyone out until you backfill.

---

## 2. What changed conceptually

**Department** and **module** are now two different things.

| | Meaning | Where it lives |
|---|---|---|
| Department | Org structure — where a person sits | `team_members.department` → `departments` table |
| Module | A feature area of the software | `modules` table, granted via `user_module_access` |

A user's access to a module is the highest of:

1. `role = 'owner'` → `manage` on everything (break-glass, unchanged)
2. their access template, if one is applied
3. a direct grant — **wins over the template**, including an explicit `none` to revoke

Four levels: `none` → `view` → `edit` → `manage`.

Departments are now rows, not a `CHECK` constraint. Adding "HR" is:

```sql
insert into departments (key, label, sort_order) values ('hr','HR',110);
```

---

## 3. Using it

Go to **Administration → Access Control** (`/admin`) as the owner.

Pick a staff member, tick the modules they should have, choose a level per module,
save. It takes effect on their next page load — no deployment, no migration.

Your original example works exactly as described: tick **Wireless** on a Finance
account and they get the Wireless section; untick it and it disappears, and the
database rejects their queries too.

**Templates** (`Finance Manager`, `Field Technician`, `Sales Rep`, …) set a baseline so
you tick one dropdown for a new hire instead of twelve boxes. Direct ticks override
the template.

**Temporary access** is supported at the database level — `user_module_access.expires_at`.
Set it and access lapses automatically. There is no UI for it yet.

---

## 4. Verifying it worked

A full security test suite ships in `supabase/tests/`. It runs against a throwaway
local Postgres, not your real database:

```bash
# needs a local postgres on port 5433; see the header of the shim file
psql -f supabase/tests/local-supabase-shim.sql
# apply all migrations, then:
psql -f supabase/tests/seed-fixtures.sql
bash supabase/tests/rls-access.test.sh
```

23 assertions covering: anonymous access, per-module isolation, privilege escalation,
grant/revoke round-trips, level enforcement, expiring grants, template precedence and
timesheet self-access.

Quick manual checks against your real database:

```sql
-- 1. Nothing should be readable without a login. Expect 0 rows:
select tablename, policyname, roles from pg_policies
where schemaname='public' and ('anon'=any(roles) or 'public'=any(roles));

-- 2. Only the four registry tables should still be wide open (they hold no data
--    beyond module names, and every signed-in user needs them to render the nav):
select tablename, policyname, cmd from pg_policies
where schemaname='public' and qual='true';

-- 3. Confirm the backfill gave everyone what they had before:
select tm.name, tm.department, uma.module_key, uma.level
from team_members tm left join user_module_access uma on uma.user_id = tm.id
order by tm.name;
```

Then, in the app: sign in as a non-owner and confirm you see only your modules.

---

## 5. Security fixes included

**Anonymous read access (critical).** Migration 025 dropped the `anon` *write*
policies but left the *read* ones. Several were created with no `TO` clause, which in
Postgres means `TO PUBLIC`. Since `NEXT_PUBLIC_SUPABASE_ANON_KEY` ships in the browser
bundle, anyone could read `leads`, `team_members`, and `stock_items` — the last of
which stores `client_address`, `client_pppoe` and `wifi_password` in plaintext.
Fixed in 039.

**Privilege escalation (critical).** `"Allow authenticated write team_members"` was
`for all ... using (true)`, so any signed-in staff member could run
`update team_members set role='owner' where id=<self>`. Fixed in 039 by a trigger, and
in 042 by removing the blanket policy.

> Worth knowing: the first version of that trigger did not work. It bypassed itself
> whenever `request.jwt.claims` was unset, which handed a free pass to the very users
> it was meant to stop. The test suite caught it. That is why the tests exist.

**Recoverable staff passwords (high).** `login_password_ciphertext` stored passwords
with reversible encryption, and `GET /api/users` returned all of them decrypted. The
column is dropped (044) and the endpoint no longer returns stored passwords. Setting a
password still shows it once so you can hand it over.

**Unauthenticated dev endpoints.** `/api/migrate`, `/api/admin/bootstrap` and
`/api/admin/migrate-auth` now refuse to run in production unless
`ALLOW_DEV_ENDPOINTS=true` is set. You will need that flag once, to bootstrap the
owner on first deploy — then remove it.

**Audit log.** `audit_log` records every change to `team_members`, grants, templates,
modules and departments, written by a database trigger so it cannot be bypassed by
forgetting to call it. Readable with `admin:view`.

---

## 6. Code changes worth knowing about

`lib/modules.ts` is the new single source of truth. Adding a module means one entry
there plus one row in the `modules` table — navigation, route guarding, store
mounting and the admin console all follow automatically. Previously this took edits in
six files plus a SQL constraint, which is why `fiber`, `general`, `accounts` and
`reception` stayed empty for so long.

`lib/access.ts` is the access API: `can(user, 'wireless', 'edit')`,
`visibleModules(user)`, `homeRoute(user)`.

`lib/permissions.ts` keeps every old function name as a thin wrapper over the new
model, so the 48 files importing it did not have to change in the same commit that
swapped the security model. Prefer `can(...)` in new code; the wrappers can be inlined
and deleted gradually.

`components/layout/department-nav.tsx` went from 510 lines to ~250 and no longer
mentions any department by name.

`lib/store/load-gates.ts` now decides which data stores to mount from module grants.
Under the old department checks, a Finance user granted Stock would have seen the menu
and passed the route guard, then landed on an empty page.

---

## 7. Known gaps

**Route protection is client-side.** `components/auth/route-guard.tsx` gates rendering
in the dashboard layout — better than the old per-page `useEffect` (which let the page
mount and fetch before redirecting), but it is still a UX guard. The real boundary is
RLS, which is now tested. True server-side blocking in `proxy.ts` needs the
Supabase session in a cookie rather than `localStorage`, i.e. adopting `@supabase/ssr`.
That changes the auth client and login flow, so it was not bundled here.

**Technician access codes and client PINs** still use reversible encryption. Lower
value than staff passwords — they are short-lived shared secrets for a QR portal — but
worth revisiting.

**`app/api/stock/route.ts` is still a 40 KB single file.** Untouched here on purpose;
splitting it is Phase 7.

**Typecheck was not run in the build environment.** The sandbox npm registry blocked
several packages, so `tsc --noEmit` could not run. Instead: all 43 migrations were
executed against a real PostgreSQL 16 instance, the 23-assertion security suite passes,
and `node scripts/check-imports.mjs` verifies every `@/` import resolves to a real
export across all 209 files. **Please run `npx tsc --noEmit` locally and send me any
errors** — that is the one check I could not do for you.

---

## 8. Next

Phase 2 (rest of the admin console: templates editor, department manager, audit
viewer, "view as user"), then Phase 3 (Projects), Phase 4 (Procurement + stock
intelligence), Phase 5 (AI). See `docs/OPS_PLATFORM_PLAN.md`.

---

## 9. Addendum — UI overhaul + Scheduler

### Migration to apply

```bash
npm run db:apply -- supabase/migrations/045_scheduler.sql
```

Idempotent like the rest. It registers the `scheduler` module and grants it to every
existing staff member (managers get `manage`), so the calendar is usable immediately.

### Chart kit

`components/charts/` — a dependency-free SVG kit: `StatTile`, `HeroFigure`, `Meter`,
`Sparkline`, `LineChart`, `BarChart`, `ColumnChart`, `StackedBar`, `DonutChart`,
`FunnelChart`. Nothing was added to `package.json`.

The palette in `components/charts/tokens.ts` was **validated against this app's actual
chart surface** (`#ffffff`), not a generic default:

```
Lightness band      PASS   Chroma floor  PASS
CVD separation      PASS   worst adjacent pair ΔE 9.1 (protan)
Normal-vision floor PASS   worst adjacent pair ΔE 19.6
Contrast vs surface WARN   aqua / yellow / magenta below 3:1
```

That WARN is why every chart ships a table-view toggle and direct labels — it is the
required relief, not a nicety. Do not reorder the categorical slots: the ordering *is*
the colourblind-safety mechanism.

**The Megs red is deliberately not a series colour.** It sits almost on top of
`destructive` and status-critical, so using it for data would make ordinary numbers
read as errors. Brand red stays on buttons and active nav.

Rules the kit follows, worth knowing before extending it: no dual-axis charts ever
(two scales invent a correlation that isn't in the data — use two charts); one series
means one colour and no legend; a legend is mandatory from two series up; labels are
placed selectively, never on every point; text never wears the series colour.

### Dashboards rebuilt

Company, Sales, Stock, Coordination and Financial. Each leads with one hero figure or
a KPI row, then charts, then the detail table. Every chart has a table view.

Financial deliberately shows **only fuel**, because fuel is the only cost feed that
exists. Empty invoice/expense tiles would read as "we spent nothing" rather than "not
tracked yet".

> One bug worth recording: the `Meter` component escalated colour when the ratio was
> HIGH, but both places it is used — stock availability and revenue against target —
> are cases where LOW is the problem. A nearly-empty stock meter rendered calm blue
> and a great sales month rendered red. Caught by rendering the kit in a headless
> browser and looking at it; fixed with an explicit `invert` prop.

### Scheduler

`/scheduler` (month calendar) and `/scheduler/agenda` (my invitations + RSVP).

Five visibility levels, because "who can see this" is what people get wrong when
booking:

| Visibility | Who sees it |
|---|---|
| `private` / `attendees` | Only the organiser and invitees |
| `department` | Anyone who can open that module — so granting Wireless also grants the wireless calendar |
| `managers` | Anyone holding `manage` on **any** module |
| `company` | Everyone |

"Managers" means holding `manage` on any module, not the legacy `role = 'manager'`
column — under the grant model a Finance user granted Wireless at manage genuinely is
a wireless manager.

Events carry optional `project_id`, `lead_id` and `job_id` so project dates and site
visits land on the same calendar. Only the organiser (or a scheduler manager) can move
or cancel an event; anyone can always answer their own invitation.

Verified by 19 assertions in `supabase/tests/` covering each visibility level,
grant-then-revoke, "nobody can quietly move someone else's meeting", and "nobody can
RSVP on your behalf".

### Still outstanding

- `npx tsc --noEmit` has still not been run — the sandbox registry blocks the install.
  Verification here was: 44 migrations against real PostgreSQL, 42 security assertions,
  221-file import/export check, and a headless-browser render of the chart kit.
- Support and Wireless dashboards were not rebuilt in this pass.

---

## 10. Addendum — Projects

### Migration

```bash
npm run db:apply -- supabase/migrations/046_projects.sql
```

Idempotent. It registers the module, creates the tables, and grants Projects to every
existing staff member (managers get `manage`) so it is usable immediately.

### Screens

| Route | What it is |
|---|---|
| `/projects` | List with search, status/type filters and "my projects", plus stage and department charts |
| `/projects/board` | Status board — idea → evaluating → approved → active → on hold → completed |
| `/projects/ideas` | Idea funnel with one-click promotion through the stages |
| `/projects/[id]` | Detail: tasks, members, linked records, updates, costs vs budget |

### Deciding who is involved

The member picker is deliberately the same checkbox pattern as Administration →
Access Control, because it is the same mental action. Four member roles:

| Role | Can do |
|---|---|
| Lead | Edit the project, change membership, manage tasks |
| Contributor | Work on tasks assigned to them |
| Reviewer | Read and comment |
| Viewer | Read only |

**A task assignee can progress their own task without being a project lead.** That is
what makes cross-department assignment actually work — a Stock person given a task on
a Wireless project can move it to done without being handed edit rights over the whole
project. Verified by test.

Private projects are members-only even for people who otherwise have the module.

> One bug the tests caught: the first version treated membership and ownership as
> independent grounds for access, so revoking someone's Projects module still left
> them able to read projects they owned or belonged to — the navigation hid the
> module while the database kept serving rows. The module grant is now a
> prerequisite, and membership only decides *which* projects you see inside it.

### Linked records — why this isn't just a task board

`project_links` attaches real records from other modules to a project: clients/leads,
jobs, pick lists, tower sites, network layouts, calendar events. The index is
bidirectional, so "which projects touch this client?" is answerable from the lead side
too. This is what "get the departments working together" means concretely, rather than
everyone filing into the same folder.

### Costs

`project_costs` rolls up into `projects.actual_cost` **via a database trigger**, not
application code — so the total is right no matter which route, script or manual fix
inserted the row. Over-budget projects are flagged on the list and the detail page.

### Scheduler integration

Project target dates and milestones now appear on the calendar as **derived,
read-only entries** rather than duplicated event rows. A copied date drifts the moment
someone reschedules the project; a derived one cannot. Clicking one opens the project,
which is where the date actually lives.

Project visibility is respected: a project you cannot open does not leak its deadlines
onto your calendar. Both the scheduler and the projects API share
`lib/projects/visibility.ts` for this — two copies of that rule would drift, and the
drift would be a quiet privacy bug.

### Verification

`supabase/tests/projects.test.sh` — 21 assertions covering private-project membership,
grant-then-revoke, edit rights, task-assignee rights, cost roll-up, cross-module links
and project code uniqueness.

Totals across the three suites: **63 assertions, 0 failures**, against 45 migrations
applied to a real PostgreSQL 16 instance.

### Still outstanding

- `npx tsc --noEmit` has not been run — the sandbox registry blocks the install.
- Nothing else yet *writes* to the scheduler: scheduling a job in Coordination, or
  approving leave, still does not appear on the calendar. Project dates were the first
  producer; job and leave hooks are the obvious next ones.
- Milestones have a table and appear on the calendar, but no UI to create them yet
  (add them via the API or SQL for now).
