# Megs Ops Platform — Architecture & Build Plan

**From:** Sales CRM that grew into a management site
**To:** Multi-layer company operations platform — stock, finance, staff, projects, field ops, with AI assistance
**Repo:** `C:\Users\User\Desktop\Sales app`
**Date:** 27 July 2026
**Status:** Plan for review. No code changed yet.

---

## 0. Executive summary

You have built a lot. 38 Supabase tables, 10 departments, a working Expo field app, QR stock tracking, job cards, timesheets, tower management, client portals. The functionality is genuinely there.

The problem is not features. It is that **the foundation was designed for one department and now carries ten.** Specifically:

1. A user belongs to exactly **one** `department` (a single text column). Every permission check in the app is literally `user.department === 'wireless'`. Your requested feature — "super admin ticks a box to give Finance access to Wireless" — is impossible without replacing this. This is the central refactor and everything else waits on it.

2. **Row Level Security is effectively off, and some of it is open to the public internet.** Migration 025 dropped the anonymous *write* policies but left the anonymous *read* policies in place. The publishable/anon key ships inside your browser bundle by design — it is not a secret. That means, with no login at all, anyone can read your full lead database, your staff list, and `stock_items`, which stores customer **addresses, PPPoE usernames and WiFi passwords in plaintext**. Separately, any logged-in staff member can update any `team_members` row, including their own `role` — self-promotion to owner. Details in F1/F2. **Fix this before anything else in this document.**

3. Permission logic for one department is **duplicated across six files**. Adding a department means editing all six plus a SQL `CHECK` constraint migration. That is why `fiber`, `general`, `accounts` and `reception` are still empty placeholders — the cost of adding a module is too high.

The plan below fixes the foundation first, then builds Projects, Procurement and AI on top of it. Roughly 5–7 weeks of focused work, sequenced so each phase is independently shippable.

---

## 1. What you have today

### Stack

| Layer | Tech |
|---|---|
| Web | Next.js 15 App Router, React, Tailwind, shadcn-style UI in `components/ui` |
| Mobile | Expo React Native, `apps/mobile` |
| Shared | `packages/shared` — types, service packages, overtime calc |
| Data | Supabase (Postgres + Auth + Realtime) |
| Migrations | 38 numbered SQL files in `supabase/migrations` |

### Modules that exist and work

| Module | Routes | Tables |
|---|---|---|
| Sales / CRM | `/dashboard` `/board` `/inbox` `/leads` `/surveys` `/analytics` `/my-stats` | `leads`, `activities` |
| Stock | `/stock/*` (8 pages) | `stock_products`, `stock_items`, `stock_bookings`, `stock_requests`, `stock_request_lines`, `stock_qr_labels`, `stock_sundries`, `stock_item_visits` |
| Coordination | `/coordination/*` (8 pages) | `jobs`, `job_assignments`, `job_status_events`, `job_card_submissions`, `time_entries`, `time_off_requests`, `ot_settings`, `location_pings` |
| Support | `/support/*` | `towers`, `tower_sites`, `tower_outages`, `support_threads`, `support_messages`, `client_support_requests` |
| Wireless | `/wireless/*` | `network_layouts`, `network_devices`, `network_layout_assets`, `network_layout_submissions` |
| Financial | `/financial` `/financial/fuel` | `vehicles`, `fuel_entries` |
| Staff | `/staff` `/team` | `team_members` |
| Client portal | `/i/[token]`, mobile client app | `client_accounts`, `client_account_installations`, `qr_portal_sessions` |

### Modules that are empty shells

`fiber`, `general`, `accounts`, `reception` — listed in `PLACEHOLDER_DEPARTMENTS` in `lib/permissions.ts:18`, rendering `components/department/placeholder-department-page.tsx`.

### Modules that do not exist at all

Projects. Suppliers and purchasing. Reorder points. Invoicing, quotes, recurring client billing, expenses, budgets. Documents / SOPs. Audit log. HR beyond a staff list. Any AI.

---

## 2. Findings — ranked by severity

### 🔴 CRITICAL

**F1a. Customer and staff data is readable with no login at all**

`migrations/025_ops_harden_rls_and_inbox.sql` dropped the policies named `"Allow anon write …"`. It did **not** drop the ones named `"Allow anon read …"`. Those are still live on:

`team_members`, `leads`, `activities`, `towers`, `tower_outages`, `stock_products`, `stock_items`, `stock_bookings`, `stock_requests`, `stock_request_lines`, `stock_qr_labels`

Worse, the ones created in migrations 006, 007 and 011 have **no `TO` clause at all**:

```sql
-- 007_stock_inventory.sql:94
create policy "Allow anon read stock_items" on public.stock_items for select using (true);
--                                                     ^ no TO role = TO PUBLIC
```

In Postgres, omitting `TO` means `TO PUBLIC` — every role, `anon` included.

`NEXT_PUBLIC_SUPABASE_ANON_KEY` is compiled into your client bundle. It is public by design; anyone can read it off your marketing site. Combined with the policies above, an anonymous visitor can run:

```js
await supabase.from('stock_items').select('client_name, client_address, client_pppoe, wifi_password')
await supabase.from('leads').select('*')          // every client name, phone, email, address, deal value
await supabase.from('team_members').select('*')   // staff list + login_password_ciphertext
```

Verified against `lib/supabase/database.types.ts` — `stock_items` really does store `client_pppoe` and `wifi_password` as plain columns. **This is customer credential disclosure and, under POPIA, a reportable personal-information breach.**

*Fix:* today, not Phase 1. Drop every `"Allow anon read …"` policy. Public marketing data (tower status) already has its own service-role path via `/api/network-status` — it does not need anon DB reads.

**F1b. Any logged-in staff member can promote themselves to owner**

For the `authenticated` role, 025 left:

```sql
create policy "Allow authenticated write team_members"
  on public.team_members for all to authenticated using (true) with check (true);
```

`for all` includes `UPDATE`, and both `using` and `with check` are unconditional. So:

```js
await supabase.from('team_members').update({ role: 'owner' }).eq('id', myId)
```

succeeds for any staff member. Once owner, they inherit `isOwner()` bypasses everywhere plus `GET /api/users`, which hands back decrypted staff passwords (F2). The same `using (true)` pattern applies to `leads`, `activities`, `towers`, `tower_outages`, all six stock tables, `app_notifications` and `time_off_requests`.

Your API guards (`requireStockAccess` etc.) are correctly written, but they only protect the API path. The browser talks to Postgres directly — `lib/store/crm-store.tsx` does exactly that — so the guards are bypassable by design.

*Fix:* Phase 1. Replace every `using (true)` with `has_module_access('<module>', '<level>')`, and remove the blanket write policy on `team_members` entirely.

**F2. Staff passwords are stored reversibly and returned over the API**

`app/api/users/route.ts:44-47` returns decrypted plaintext passwords for every non-owner staff member. `team_members.login_password_ciphertext` is symmetric encryption (`encryptPortalCode` / `decryptPortalCode` in `lib/portal-auth.ts`), not hashing. Same pattern for client PINs (`stock_items.client_pin`) and technician access codes (`team_members.access_code`).

Consequences: one leaked `SUPABASE_SERVICE_ROLE_KEY` or encryption secret exposes every staff password — and people reuse passwords. Combined with F1 (self-promotion to owner) any staff member can retrieve all of them today.

*Fix:* Phase 0. Drop `login_password_ciphertext`. Replace "show me the password" with "reset this user's password" — owner sets a new one, it is shown once, never stored. Keep the encrypted-code pattern only for the 4-digit client portal PINs, where it is a low-value shared secret, not a login credential.

**F3. No server-side route protection**

`proxy.ts` handles CORS only. Every dashboard page protects itself with a client-side `useEffect(() => { if (!allowed) router.replace('/') })` — see `app/(dashboard)/financial/page.tsx:17-20` and `app/(dashboard)/company/page.tsx:46-48`. The page's JavaScript, its data-fetching hooks, and the sensitive content all execute before the redirect fires.

*Fix:* Phase 0/1. Supabase SSR session in proxy.ts, module check per route prefix, redirect server-side before render.

### 🟠 HIGH

**F4. The single-department model blocks everything you asked for**

`lib/types.ts:65` — `department: Department | null`, one value. `lib/permissions.ts:122-129`:

```ts
export function canAccessDepartment(user, department) {
  if (isOwner(user)) return true;
  return user.department === department;   // ← one department, hard equality
}
```

No user can hold access to two modules. No level of access below "everything the department can do". Owner is an all-or-nothing bypass, so you cannot have a second admin or a scoped one.

**F5. Six-fold duplication of module wiring**

Adding one module today requires edits in all of these:

| File | What it holds |
|---|---|
| `lib/permissions.ts` | `canAccessX()` + `OwnerSection` union + `DEPARTMENT_LABELS` + `getHomeRoute()` |
| `lib/hooks/use-X-access.ts` | one hook file per module |
| `lib/nav/department-nav.ts` | `xNavItems` array |
| `components/layout/department-nav.tsx` | `ownerSections` array + `showXNav` flag + a branch in the `DashboardNav` if-chain |
| `lib/store/load-gates.ts` | path prefixes and mount conditions |
| `lib/supabase/server-auth.ts` | `requireXAccess()` |
| `supabase/migrations/…` | a new `CHECK` constraint on `team_members.department` **and** `app_notifications.department` |

`components/layout/department-nav.tsx` is 510 lines, most of it this branching.

*Fix:* Phase 1. One `lib/modules.ts` registry drives permissions, nav, load gates, API guards and the admin UI. Adding a module becomes: one registry entry + one `modules` table row + RLS policies.

**F6. Department enums are hardcoded in SQL `CHECK` constraints**

`migrations/018_new_departments.sql` re-writes a ten-value `CHECK` on two tables. Adding "HR" or "Legal" is a schema migration. Departments should be rows in a table.

**F7. No audit log**

The moment one person can act across finance, stock and projects, "who changed this" becomes essential. Nothing records it today.

### 🟡 MEDIUM

**F8. `app/api/stock/route.ts` is 40 KB in a single file** — an action-switch mega-router. Hard to test, hard to permission per action, hard to review. `app/api/support/messages/route.ts` (12.7 KB) and `app/api/coordination/technicians/route.ts` (13 KB) are heading the same way.

**F9. Full-table client-side stores with no pagination.** `lib/store/crm-store.tsx` (28 KB) loads all leads + activities + towers into browser state and refetches everything on realtime events. Fine at 500 leads; unusable at 10,000. Same shape in `stock-store.tsx` and `wireless-store.tsx`.

**F10. Three parallel identity systems** — `team_members` (Supabase Auth), `client_accounts`, and `qr_portal_sessions` (access codes / PINs). Each has its own auth path and its own guard helpers. Workable, but document the boundaries before adding a fourth.

**F10b. Every table uses `text` primary keys, and staff identity is ambiguous.**

All 35 existing tables declare `id text primary key` — including `team_members`, where the column stores an Auth UUID *as a string*. There is also a separate `auth_user_id uuid unique` column (`migrations/002_auth.sql`), and `getAuthUserFromRequest` (`lib/supabase/server-auth.ts:24-38`) has to try **both** — look up by `id`, and if that misses, look up by `auth_user_id`.

Two consequences that matter for Phase 1:

- All new foreign keys to existing tables must be `text`, not `uuid`. Getting this wrong means every migration fails.
- Inside RLS, `auth.uid()` returns `uuid` while `team_members.id` is `text`. A naive `where id = auth.uid()` throws `operator does not exist: text = uuid`. Every policy needs `id = auth.uid()::text or auth_user_id = auth.uid()`.

*Fix:* Phase 1. Normalise to a single identity: backfill `auth_user_id` for every row, make it `not null`, and settle on one lookup path. `text` PKs elsewhere are ugly but harmless — leave them.

**F11. Naming and route layout say "sales app".** Repo folder is `Sales app`, README says "MEGS Sales CRM", and sales owns the top-level routes (`/board`, `/inbox`, `/dashboard`) while every other module is namespaced. For an ops platform this is backwards. `docs/architecture.md:13` says not to nest sales "without a concrete need" — the pivot to an ops platform is that need.

**F12. Legacy role translation still live.** `normalizeRoleAndDepartment` (`lib/permissions.ts:51-68`) still maps `'admin'` → `manager` and `'sales'` → `staff`. Since you are pre-production, delete it.

### 🟢 LOW

**F13.** `app/api/migrate`, `app/api/seed`, `app/api/clear-data`, `app/api/admin/bootstrap` are unguarded-by-design dev endpoints. Gate them behind `NODE_ENV !== 'production'` before you go live.
**F14.** Web app lives at repo root while `apps/mobile` exists. Cosmetic; `docs/architecture.md` explicitly says leave it. Agreed — leave it.
**F15.** `next.config.ts` is 133 bytes — no security headers, no image domains, no bundle analysis.

---

## 3. Target architecture

### 3.1 The key idea: separate **department** from **module**

Today these are the same word and the same column. They are not the same thing.

- **Department** = org structure. Where a person sits, who their manager is, how notifications route by default. *Wesley is in Finance.*
- **Module** = a feature area of the software. Granted independently, at a level. *Wesley can also edit Wireless and view Stock.*

Split them, and your checkbox feature falls out naturally.

### 3.2 Permission model

Four levels, ordered:

| Level | Means |
|---|---|
| `none` | Module hidden entirely |
| `view` | Read-only. Sees the pages and the data, no writes |
| `edit` | Normal day-to-day work — create, update own/team records |
| `manage` | Everything in the module including settings, approvals, deletes, and granting others access to it |

**Effective access** for a user on a module = the highest of:
1. `owner` role → `manage` on everything (keep this as the break-glass)
2. Any applied access template
3. Direct per-user grant

Direct grants always win over templates, including a direct `none` to revoke.

### 3.3 Schema — permissions

> **Type convention (verified against the live schema).** Every existing table uses `id text primary key`, including `team_members`. All foreign keys pointing at existing tables below are therefore `text`. New tables introduced by this plan use `uuid` PKs, since nothing legacy references them. Where a policy compares to `auth.uid()` (a `uuid`), it must cast — see §3.4.

```sql
-- 040_module_registry.sql

create table public.modules (
  key           text primary key,          -- 'stock', 'crm', 'projects', 'finance'
  label         text not null,
  description   text not null default '',
  icon          text not null default 'Boxes',
  group_name    text not null default 'operations',
  sort_order    int  not null default 100,
  is_core       boolean not null default false,   -- cannot be disabled company-wide
  active        boolean not null default true
);

create table public.departments (
  key         text primary key,            -- 'sales', 'finance', 'wireless'
  label       text not null,
  manager_id  text references public.team_members(id) on delete set null,
  parent_key  text references public.departments(key) on delete set null,
  sort_order  int not null default 100,
  active      boolean not null default true
);

create type public.access_level as enum ('none','view','edit','manage');

create table public.user_module_access (
  user_id     text not null references public.team_members(id) on delete cascade,
  module_key  text not null references public.modules(key)      on delete cascade,
  level       public.access_level not null default 'view',
  granted_by  text references public.team_members(id) on delete set null,
  granted_at  timestamptz not null default now(),
  expires_at  timestamptz,                 -- optional temporary access
  primary key (user_id, module_key)
);
create index on public.user_module_access (user_id, module_key);

create table public.access_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,        -- 'Finance Manager', 'Field Technician'
  description text not null default '',
  created_at  timestamptz not null default now()
);

create table public.access_template_modules (
  template_id uuid not null references public.access_templates(id) on delete cascade,
  module_key  text not null references public.modules(key) on delete cascade,
  level       public.access_level not null,
  primary key (template_id, module_key)
);

alter table public.team_members
  add column template_id  uuid references public.access_templates(id) on delete set null,
  add column department_key text references public.departments(key)   on delete set null;
```

### 3.4 The function that makes RLS real

This is the most important 20 lines in the whole plan. Once RLS calls it, security stops depending on the app remembering to check.

```sql
create or replace function public.access_rank(l public.access_level)
returns int language sql immutable as $$
  select case l when 'manage' then 3 when 'edit' then 2 when 'view' then 1 else 0 end;
$$;

create or replace function public.has_module_access(
  p_module text,
  p_min    public.access_level default 'view'
) returns boolean
language sql stable security definer set search_path = public as $$
  with me as (
    select id, role, active, template_id
    from team_members
    where id = auth.uid()::text or auth_user_id = auth.uid()   -- ← see F10b
  ),
  direct as (
    select level from user_module_access uma, me
    where uma.user_id = me.id and uma.module_key = p_module
      and (uma.expires_at is null or uma.expires_at > now())
  ),
  templated as (
    select atm.level from access_template_modules atm, me
    where atm.template_id = me.template_id and atm.module_key = p_module
  )
  select coalesce(
    (select active from me), false
  ) and (
    (select role from me) = 'owner'
    or access_rank(coalesce(
         (select level from direct),          -- direct grant wins
         (select level from templated),
         'none'
       )) >= access_rank(p_min)
  );
$$;
```

Then every policy becomes readable and correct:

```sql
drop policy if exists "Allow authenticated write leads" on public.leads;

create policy "crm read"   on public.leads for select
  using (has_module_access('crm','view'));
create policy "crm write"  on public.leads for insert
  with check (has_module_access('crm','edit'));
create policy "crm update" on public.leads for update
  using (has_module_access('crm','edit')) with check (has_module_access('crm','edit'));
create policy "crm delete" on public.leads for delete
  using (has_module_access('crm','manage'));
```

And `team_members` gets the escalation fix — self-update of safe columns only, role changes restricted to `manage` on the `admin` module:

```sql
create policy "self read"    on public.team_members for select
  using (has_module_access('staff','view') or id = auth.uid()::text);
create policy "admin manage" on public.team_members for all
  using (has_module_access('admin','manage'))
  with check (has_module_access('admin','manage'));
-- no general authenticated update policy at all
```

*Note:* `has_module_access` is called per row by the planner. Wrap it as `(select has_module_access(...))` inside policies so Postgres evaluates it once per query rather than per row — a well-known Supabase RLS performance pattern. Add an index on `user_module_access(user_id, module_key)`.

### 3.5 Application layer

**`lib/modules.ts`** — the single registry that replaces six files:

```ts
export type ModuleKey =
  | 'crm' | 'stock' | 'coordination' | 'support' | 'wireless' | 'fiber'
  | 'finance' | 'projects' | 'staff' | 'procurement' | 'reception'
  | 'accounts' | 'general' | 'admin' | 'ai';

export interface ModuleDef {
  key: ModuleKey;
  label: string;
  icon: LucideIcon;
  group: 'core' | 'operations' | 'commercial' | 'admin';
  root: string;                       // '/stock'
  nav: NavItem[];                     // moved from lib/nav/department-nav.ts
  minLevel: AccessLevel;              // level needed to see it at all
  pathPrefixes: string[];             // replaces load-gates.ts
  mountStores?: StoreKey[];           // which client stores to mount
}

export const MODULES: Record<ModuleKey, ModuleDef> = { /* … */ };
```

**`lib/access.ts`** — replaces all of `lib/permissions.ts`'s `canAccessX` family:

```ts
export function can(user: User | null, module: ModuleKey, level: AccessLevel = 'view'): boolean;
export function accessLevel(user: User | null, module: ModuleKey): AccessLevel;
export function visibleModules(user: User | null): ModuleDef[];
export function homeRoute(user: User): string;   // first visible module's root
```

The user's grants come down with the session — extend `fetchTeamMember` in `lib/auth-context.tsx:35` to join `user_module_access` and the template, and hang the resolved map on `User.access`.

**`lib/supabase/server-auth.ts`** collapses to one guard:

```ts
export async function requireAccess(
  request: Request, module: ModuleKey, level: AccessLevel = 'view'
): Promise<User | null>;
```

`requireStockAccess`, `requireWirelessAccess`, `requireCoordinationAccess`, `requireSupportAccess`, `requireStockRequestsAccess` all delete.

**`components/layout/department-nav.tsx`** drops from 510 lines to roughly 120 — it maps `visibleModules(user)` instead of branching per department.

**`proxy.ts`** gains real route protection: read the Supabase session, match `pathname` against `MODULES[].pathPrefixes`, redirect if the level is insufficient.

### 3.6 Migration path from `department`

Since you are pre-production, this is clean:

```sql
-- backfill: everyone gets a grant matching their old department
insert into user_module_access (user_id, module_key, level)
select id,
       case department when 'sales' then 'crm' else department end,
       case role when 'manager' then 'manage' else 'edit' end
from team_members
where department is not null and role <> 'owner';

-- copy department -> department_key for org structure
update team_members set department_key = department where department is not null;

-- then drop the CHECK constraints and the old column
alter table team_members drop constraint if exists team_members_department_check;
alter table team_members drop column department;
```

---

## 4. Projects module

This is the layer that makes it an ops platform rather than a set of parallel tools. A project is where departments meet.

### 4.1 Schema

```sql
-- 045_projects.sql

create type project_status as enum
  ('idea','evaluating','approved','active','on_hold','completed','cancelled');
create type project_type as enum
  ('business_idea','client_install','infrastructure','maintenance','internal','rd');
create type project_member_role as enum ('lead','contributor','reviewer','viewer');

create table public.projects (
  id             uuid primary key default gen_random_uuid(),
  code           text unique not null,          -- 'PRJ-0042', auto-numbered
  name           text not null,
  description    text not null default '',
  type           project_type   not null default 'internal',
  status         project_status not null default 'idea',
  priority       text not null default 'medium',
  owner_id       text references team_members(id) on delete set null,
  client_lead_id text references leads(id)        on delete set null,
  start_date     date,
  target_date    date,
  completed_at   timestamptz,
  budget_amount  numeric(14,2),
  actual_cost    numeric(14,2) not null default 0,
  is_private     boolean not null default false,  -- members-only visibility
  created_by     text references team_members(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.project_members (
  project_id uuid not null references projects(id) on delete cascade,
  user_id    text not null references team_members(id) on delete cascade,
  role       project_member_role not null default 'contributor',
  added_by   text references team_members(id) on delete set null,
  added_at   timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index on public.project_members (user_id);

-- which departments are formally involved (drives dept dashboards + notifications)
create table public.project_departments (
  project_id     uuid not null references projects(id) on delete cascade,
  department_key text not null references departments(key) on delete cascade,
  primary key (project_id, department_key)
);

create table public.project_tasks (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references projects(id) on delete cascade,
  parent_task_id uuid references project_tasks(id) on delete cascade,
  title          text not null,
  description    text not null default '',
  status         text not null default 'todo',   -- todo|in_progress|blocked|review|done
  assignee_id    text references team_members(id) on delete set null,
  department_key text references departments(key) on delete set null,
  due_date       date,
  estimate_hours numeric(6,2),
  actual_hours   numeric(6,2),
  order_index    int not null default 0,
  created_at     timestamptz not null default now(),
  completed_at   timestamptz
);

create table public.project_milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null, due_date date, completed_at timestamptz,
  order_index int not null default 0
);

-- ★ the cross-module glue
create table public.project_links (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  entity_type text not null,   -- lead|job|stock_request|purchase_order|tower_site
                               -- |network_layout|invoice|expense|document
  entity_id   text not null,
  label       text not null default '',
  linked_by   text references team_members(id) on delete set null,
  linked_at   timestamptz not null default now(),
  unique (project_id, entity_type, entity_id)
);
create index on public.project_links (entity_type, entity_id);  -- reverse lookup

create table public.project_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  author_id  text references team_members(id) on delete set null,
  body       text not null,
  kind       text not null default 'note',  -- note|status_change|risk|decision
  created_at timestamptz not null default now()
);

create table public.project_costs (
  id uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  description text not null,
  amount      numeric(14,2) not null,
  category    text not null default 'other',  -- labour|stock|fuel|subcontract|other
  incurred_on date not null default current_date,
  ref_type    text, ref_id text,              -- traceable to a PO, fuel entry, timesheet
  created_by  text references team_members(id) on delete set null,
  created_at  timestamptz not null default now()
);
```

### 4.2 Visibility rule

```sql
create or replace function public.can_see_project(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    has_module_access('projects','manage')
    or exists (select 1 from project_members
               where project_id = p_project and user_id = auth.uid()::text)
    or (
      has_module_access('projects','view')
      and not (select is_private from projects where id = p_project)
    );
$$;
```

So: project managers see everything; members see their projects; anyone with `projects:view` sees non-private projects. Exactly the "super admin decides who is involved" behaviour you described, plus a sensible default for company-wide visibility.

### 4.3 UI

| Route | Purpose |
|---|---|
| `/projects` | List + filters (status, type, department, my projects) |
| `/projects/board` | Kanban by status — reuse `components/board/kanban-board.tsx` |
| `/projects/[id]` | Detail: overview, tasks, members, linked records, updates feed, costs vs budget |
| `/projects/[id]/members` | The checkbox picker — staff list grouped by department, tick to add, set project role |
| `/projects/ideas` | Idea funnel: `idea → evaluating → approved` before a project becomes active |

Cross-module surfacing: a "Projects" panel on the lead detail page, the job detail page, the tower site page — anywhere a `project_links` row points. That is what makes departments feel like they are working together rather than filing into the same folder.

Mobile: "My Projects" + "My Tasks" screens, task status updates from the field.

---

## 5. Procurement + stock intelligence

Your AI asks — *where to buy stock, when stock is low* — need data that does not exist yet. Build the data first; the intelligence is then almost free.

### 5.1 Schema

```sql
-- 050_procurement.sql

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null, contact_name text default '',
  email text default '', phone text default '', website text default '',
  address text default '',
  lead_time_days int not null default 7,
  payment_terms text default '',
  rating numeric(3,2),                      -- computed from PO history
  active boolean not null default true,
  notes text default '', created_at timestamptz not null default now()
);

create table public.supplier_products (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references suppliers(id) on delete cascade,
  product_id  text references stock_products(id)  on delete cascade,
  sundry_id   text references stock_sundries(id)  on delete cascade,
  supplier_sku text default '',
  unit_price   numeric(12,2),
  currency     text not null default 'ZAR',
  min_order_qty int not null default 1,
  url          text default '',
  last_price_at timestamptz,
  check (product_id is not null or sundry_id is not null)
);

alter table public.stock_products add column
  reorder_point int not null default 0,
  reorder_qty   int not null default 0,
  unit_cost     numeric(12,2),
  preferred_supplier_id uuid references suppliers(id) on delete set null;

alter table public.stock_sundries add column
  reorder_point int not null default 0,
  reorder_qty   int not null default 0,
  unit_cost     numeric(12,2),
  preferred_supplier_id uuid references suppliers(id) on delete set null;

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_number text unique not null,
  supplier_id uuid not null references suppliers(id) on delete restrict,
  project_id  uuid references projects(id) on delete set null,
  status text not null default 'draft',   -- draft|submitted|approved|ordered
                                          -- |partially_received|received|cancelled
  subtotal numeric(14,2) not null default 0,
  vat      numeric(14,2) not null default 0,
  total    numeric(14,2) not null default 0,
  ordered_at timestamptz, expected_at date, received_at timestamptz,
  created_by  text references team_members(id) on delete set null,
  approved_by text references team_members(id) on delete set null,
  notes text default '', created_at timestamptz not null default now()
);

create table public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references purchase_orders(id) on delete cascade,
  product_id text references stock_products(id) on delete set null,
  sundry_id  text references stock_sundries(id) on delete set null,
  description text not null default '',
  qty_ordered  int not null,
  qty_received int not null default 0,
  unit_price numeric(12,2) not null default 0
);

-- ★ the movement ledger — this is what makes forecasting possible
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id text references stock_products(id) on delete set null,
  sundry_id  text references stock_sundries(id) on delete set null,
  item_id    text references stock_items(id)    on delete set null,
  movement   text not null,   -- received|booked_out|returned|consumed
                              -- |written_off|adjusted|transferred
  qty        int not null,    -- signed: +in, -out
  ref_type   text, ref_id text,          -- booking, PO, job, adjustment
  actor_id   text references team_members(id) on delete set null,
  note       text default '',
  created_at timestamptz not null default now()
);
create index on stock_movements (product_id, created_at desc);
create index on stock_movements (sundry_id,  created_at desc);
```

Backfill `stock_movements` from existing `stock_bookings` in the same migration so history is not lost.

### 5.2 Deterministic intelligence — build this before any AI

Most of the value you described needs no model at all:

| Signal | Rule |
|---|---|
| Low stock | `qty_on_hand <= reorder_point` → notification to Stock + Procurement |
| Days of cover | `qty_on_hand ÷ avg_daily_consumption(30d)` from `stock_movements` |
| Order now | `days_of_cover < supplier.lead_time_days + safety_buffer` |
| Dead stock | no movement in 180 days and qty > 0 |
| Cost creep | unit price on latest PO > 15% above 12-month average |
| Fuel anomaly | `fuel_entries` litres/100km for a vehicle > 1.5× its own baseline |
| OT risk | technician projected weekly hours > `ot_settings` threshold |

Surface these as a `/stock/alerts` page and a nightly job (Supabase `pg_cron` or a Vercel cron hitting `/api/jobs/nightly`).

### 5.3 AI layer — what is realistic

Server-only, `/api/ai/*`, Anthropic API with `ANTHROPIC_API_KEY`. **Never** give the model database credentials. Give it a fixed tool registry, and every tool re-checks the calling user's module grants before it returns anything.

```ts
// lib/ai/tools.ts
const TOOLS = [
  { name: 'get_stock_levels',    module: 'stock',       level: 'view' },
  { name: 'get_consumption',     module: 'stock',       level: 'view' },
  { name: 'list_suppliers',      module: 'procurement', level: 'view' },
  { name: 'compare_supplier_prices', module: 'procurement', level: 'view' },
  { name: 'draft_purchase_order',module: 'procurement', level: 'edit' },
  { name: 'get_project_status',  module: 'projects',    level: 'view' },
  { name: 'query_finance',       module: 'finance',     level: 'view' },
  { name: 'get_job_stats',       module: 'coordination', level: 'view' },
];
```

Realistic capabilities, in order of value:

1. **Reorder assistant** — "3 products are below reorder point. Based on 30-day consumption and Supplier X's 5-day lead time, order 40 units of the AX3000. Draft PO?" Then it drafts a real `purchase_orders` row in `draft` status for a human to approve. High value, low risk.
2. **Natural-language ops queries** — "how much did we spend on routers last quarter", "which technician has the most overdue job cards". Read-only, scoped to the asker's modules.
3. **Weekly ops digest** — cross-module summary per department, emailed Monday morning.
4. **Job card extraction** — technician notes and photos → structured fields, fewer typos from the field.
5. **Project brief generation** — from a one-line business idea, draft scope, suggest which departments to involve and what the first tasks are. Fits your "business ideas in projects" ask directly.

**Honest note on "where to buy":** live price scraping of South African trade suppliers is fragile and mostly futile — trade pricing is behind login walls, not on public pages. The version that actually works is: maintain your negotiated prices in `supplier_products`, let AI rank suppliers on **price × lead time × reliability score computed from your own PO history**, and optionally use web search to flag when a retail benchmark price is materially below what you are paying. That gives you real negotiating leverage. A scraper would give you broken selectors.

Log every AI call in `ai_interactions (id, user_id, prompt, tools_used, response, tokens, cost, created_at)` — you will want the audit trail and the cost visibility.

---

## 6. Finance module

Currently `/financial` is a page with a link to fuel. For an ISP, the finance core is **recurring client billing**, not fuel.

```sql
-- 055_finance.sql
create table client_subscriptions (
  id uuid primary key default gen_random_uuid(),
  client_account_id text references client_accounts(id) on delete cascade,
  lead_id text references leads(id) on delete set null,
  package_id text not null, amount numeric(12,2) not null,
  cycle text not null default 'monthly',
  status text not null default 'active',       -- active|suspended|cancelled
  started_on date not null, next_invoice_on date not null, cancelled_on date
);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  number text unique not null,
  client_account_id text references client_accounts(id) on delete set null,
  lead_id text references leads(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  status text not null default 'draft',        -- draft|sent|paid|overdue|void
  issued_at date, due_at date, paid_at timestamptz,
  subtotal numeric(14,2) not null default 0,
  vat numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0
);
create table invoice_lines (…);
create table quotes (…);   create table quote_lines (…);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  category text not null, amount numeric(14,2) not null, vat numeric(14,2) default 0,
  incurred_on date not null default current_date,
  vendor text default '', description text default '',
  project_id uuid references projects(id) on delete set null,
  vehicle_id text references vehicles(id) on delete set null,
  submitted_by text references team_members(id) on delete set null,
  approved_by  text references team_members(id) on delete set null,
  status text not null default 'pending',      -- pending|approved|rejected|reimbursed
  receipt_url text
);

create table budgets (
  id uuid primary key default gen_random_uuid(),
  department_key text references departments(key) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  period_start date not null, period_end date not null,
  amount numeric(14,2) not null, category text default 'all'
);
```

Roll `fuel_entries` into the expense view rather than replacing it — it already works.

---

## 7. Also worth adding

**Audit log** (Phase 0) — trigger-driven, not app-driven, so it cannot be forgotten:

```sql
create table audit_log (
  id bigserial primary key,
  actor_id text, action text not null, entity_type text not null, entity_id text,
  before jsonb, after jsonb, at timestamptz not null default now()
);
-- attach a generic trigger to: team_members, user_module_access, purchase_orders,
-- invoices, expenses, projects, stock_items
```

**Documents / SOPs** — you mentioned an SOP system. `documents (id, module_key, project_id, title, body_md, version, status, owner_id)` plus `document_acknowledgements (document_id, user_id, acknowledged_at)` so you can prove a technician read the safety procedure.

**Notifications by module** — `app_notifications.department` becomes `module_key` + optional `project_id`, so cross-department project events route correctly.

---

## 8. Phased plan

Each phase is independently shippable. Estimates assume focused work.

### Phase 0 — Stop the bleeding · 2–3 days
- [ ] **Do first, today:** drop every `"Allow anon read …"` policy (F1a) and the blanket `team_members` write policy (F1b). This is a ~20-line migration and it closes the public data leak on its own.
- [ ] Consider whether `wifi_password` / `client_pppoe` need to be stored at all, or encrypted like the PINs already are
- [ ] Server-side route protection in `proxy.ts` (Supabase SSR session)
- [ ] Delete `login_password_ciphertext` + the `GET /api/users` credential dump; replace with "reset password" (shown once, never stored)
- [ ] `audit_log` table + triggers on sensitive tables
- [ ] Gate `/api/seed`, `/api/clear-data`, `/api/migrate`, `/api/admin/bootstrap` behind non-production
- [ ] Security headers in `next.config.ts`

### Phase 1 — Permission foundation · 5–7 days ← **the critical one**
- [ ] Migrations: `modules`, `departments`, `access_level`, `user_module_access`, `access_templates`, `access_template_modules`
- [ ] `access_rank()` + `has_module_access()` functions
- [ ] **Rewrite every RLS policy** on all 38 tables to use `has_module_access`
- [ ] Backfill grants from `team_members.department`, then drop the column and both `CHECK` constraints
- [ ] Normalise staff identity (F10b): backfill `auth_user_id` on every row, make it `not null`, collapse the dual lookup in `getAuthUserFromRequest` to one path
- [ ] New `lib/modules.ts` registry + `lib/access.ts`
- [ ] Delete: `canAccessX` family, `lib/hooks/use-*-access.ts`, `lib/store/load-gates.ts`, `requireXAccess` family, `normalizeRoleAndDepartment`
- [ ] Rewrite `components/layout/department-nav.tsx` (510 → ~120 lines) off the registry
- [ ] Update all API routes to `requireAccess(request, 'module', 'level')`
- [ ] Mobile: same access map through `/api/mobile/me`

**Exit test:** create a Finance staff user, tick Wireless `edit` in the admin console, confirm they see and can use `/wireless` — with no code deployment. Then untick and confirm the API rejects them *and* a direct Supabase call from their browser also fails.

### Phase 2 — Super admin console · 3–4 days
- [ ] `/admin` — owner + `admin:manage` only
- [ ] `/admin/users/[id]` — the module × level checkbox matrix you described
- [ ] `/admin/templates` — reusable role bundles, apply to a user in one click
- [ ] `/admin/departments` — add/rename/reorder departments as data
- [ ] `/admin/modules` — enable/disable modules company-wide
- [ ] "View as user" impersonation for verifying grants
- [ ] `/admin/audit` — the audit log viewer

### Phase 3 — Projects · 4–6 days
- [ ] Schema + `can_see_project()` + RLS
- [ ] `/projects` list, board, detail, ideas funnel
- [ ] Member picker (the checkbox pattern again)
- [ ] `project_links` panels on lead / job / tower site / layout pages
- [ ] Costs vs budget rollup, pulling from `project_costs` + linked POs + fuel + timesheets
- [ ] Mobile: My Projects / My Tasks

### Phase 4 — Procurement + stock intelligence · 4–5 days
- [ ] Suppliers, supplier products, purchase orders, `stock_movements` (+ backfill)
- [ ] Reorder points on products and sundries
- [ ] `/stock/alerts` + nightly job
- [ ] `/procurement` — suppliers, PO workflow (draft → approve → order → receive)
- [ ] Receiving flow writes movements and updates stock automatically

### Phase 5 — AI layer · 4–6 days
- [ ] `/api/ai/chat` with permission-scoped tool registry
- [ ] Reorder assistant → drafts real POs
- [ ] Natural-language ops queries
- [ ] Weekly digest job
- [ ] `ai_interactions` logging + cost tracking

### Phase 6 — Finance build-out · 5–7 days
- [ ] Subscriptions, invoices, quotes, expenses, budgets
- [ ] Recurring billing run
- [ ] Financial dashboard: revenue, MRR, churn, expenses by department, project P&L

### Phase 7 — Consolidation · 3–4 days
- [ ] Nest sales under `/crm/*` with permanent redirects; ops home becomes the root
- [ ] Split `api/stock/route.ts` into per-resource routes
- [ ] Paginate `crm-store` and `stock-store`; move to server components + React Query where sensible
- [ ] Rename repo / README to reflect the ops platform
- [ ] Refresh `docs/architecture.md` for the module model

---

## 9. Decisions I need from you

1. **Module list.** I have assumed: `crm, stock, procurement, coordination, support, wireless, fiber, finance, projects, staff, reception, accounts, general, admin, ai`. Anything to add, drop, or rename? Specifically — do `accounts` and `general` still mean something distinct to you, or were they placeholders?

2. **Owner override.** Should `role = 'owner'` keep unconditional access to everything, or should even the owner hold explicit grants (with a break-glass)? Unconditional is simpler and I recommend it for now.

3. **Phase 0 + Phase 1 together?** They touch the same files. Doing them in one pass is less rework, but it is one large diff to review. My recommendation: yes, combine.

4. **AI provider.** Anthropic (Claude) assumed. Confirm, or say if you want OpenAI / a local model.

5. **What ships first after the foundation?** Projects (Phase 3) or Procurement + AI (Phases 4–5)? You mentioned both; Projects is the bigger structural change, Procurement gives faster visible payoff.

---

## 10. Recommendation

Start with **Phase 0 + Phase 1 combined**. Nothing else you want is safely buildable on the current permission model, and the RLS hole gets more expensive to fix with every table you add. It is unglamorous work — no new screens — but it converts "adding a module means editing six files and a SQL constraint" into "adding a module means one registry entry", which is the difference between this being a product and being a pile of departments.

Say the word and I will start on the migrations and the permission layer.
