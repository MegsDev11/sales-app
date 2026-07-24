# Architecture notes (company ops)

## Shipping new departments

Copy the **Stock** or **Wireless** pattern — do not invent a parallel staff system:

1. Routes under `app/(dashboard)/<department>/`
2. Shared nav entries in `lib/nav/department-nav.ts` + sidebar that imports them
3. `canAccess…` in `lib/permissions.ts` + access hook
4. Own Supabase tables / `app/api/…` when the domain needs persistence
5. Reuse users from the CRM store — do not invent a second staff directory yet

Sales stays on flat routes (`/board`, `/inbox`, `/dashboard`, …). Nest under `/sales/*` only if URLs become confusing for other departments.

## Data loading (performance)

- **Auth** mounts at the root (`components/providers.tsx`).
- **CRM, Stock, and Wireless** stores mount only under `app/(dashboard)/layout.tsx` so the marketing site does not hydrate ops data.
- Stock loads only when `canAccessStockRequests(user)` (stock, coordination, owner).
- Wireless loads only when `canAccessWireless(user)` and is shared across wireless pages (no remount refetch).
- CRM realtime full-refetch is debounced (~2.5s) and skipped while the tab is hidden.

## When to extract architecture

Leave the shared CRM store (users + leads; towers today) alone until a feature forces it:

- Support towers/outages grow → extract a support module
- Non-sales pages only need users → thin `useUsers()` / staff helpers
- `lib/types.ts` hard to navigate → split by domain; re-export from a barrel
- Sales URLs confuse other depts → nest under `/sales/*` with permanent redirects

Do **not** move the web app into `apps/web`, unify everything into one mega-store, or mass-rename auth storage keys / sales routes without a concrete need.
