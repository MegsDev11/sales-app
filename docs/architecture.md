# Architecture notes (company ops)

## Shipping new departments

Copy the **Stock** or **Wireless** pattern — do not invent a parallel staff system:

1. Routes under `app/(dashboard)/<department>/`
2. Shared nav entries in `lib/nav/department-nav.ts` + `DepartmentNav` / `DepartmentMobileNav`
3. `canAccess…` in `lib/permissions.ts` + access hook
4. Own Supabase tables / `app/api/…` when the domain needs persistence
5. Reuse users from the **staff store** (`useStaffStore` / `useCrmStore().users`) — do not invent a second staff directory

Sales stays on flat routes (`/board`, `/inbox`, `/dashboard`, …). Nest under `/sales/*` only if URLs become confusing for other departments.

## Migrations (do not paste ad hoc)

1. Add a numbered file under `supabase/migrations/`.
2. Prefer `supabase link` + `supabase db push`, or `npm run db:apply -- <file.sql>` with `DATABASE_URL` in `.env.local`.
3. Verify with `npm run db:audit` (probes live OpenAPI vs migration-expected columns).
4. If applying in the Dashboard SQL Editor, still commit the same file so git is the source of truth.

## Security

- Browser Supabase client shares the auth session (`authenticated` role). Anon **write** policies on business tables are removed (`025_ops_harden_rls_and_inbox.sql`).
- Prefer stock/wireless pattern: authenticated API + service-role admin client for mutations.
- Public network status uses `/api/network-status` (service role), not anon DB writes.

## Data loading (performance)

- **Auth** mounts at the root (`components/providers.tsx`).
- **Staff + CRM** mount under `app/(dashboard)/layout.tsx`. Staff (team members) always loads for the signed-in user.
- **CRM leads/activities/towers** load only when the route/department needs sales or support data (stock/coordination/wireless hubs skip the sales bundle).
- **Stock / Wireless** providers mount only when the user can access those domains; loads are further gated by path for owners.
- CRM realtime full-refetch is debounced (~2.5s) and skipped while the tab is hidden.

## When to extract architecture

- Support towers/outages grow → extract a dedicated support store (towers already path-gated)
- `lib/types.ts` hard to navigate → split by domain; re-export from a barrel
- Sales URLs confuse other depts → nest under `/sales/*` with permanent redirects

Do **not** move the web app into `apps/web`, unify everything into one mega-store, or mass-rename auth storage keys / sales routes without a concrete need.
