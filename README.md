# Megs Operations

Company management platform for **Megs Waterberg** — sales pipeline, stock, coordination, support, wireless, and field mobile — plus the public marketing site.

This started as a sales CRM and grew into multi-department ops. Keep shipping department features on the current shell; do not rewrite for naming alone.

## Apps

| Path | What |
|------|------|
| Repo root (`app/`, `components/`, `lib/`) | Next.js web: marketing site + staff operations dashboard |
| `apps/mobile/` | Expo app for field techs, stock, and clients |
| `packages/shared/` | Shared helpers (`@megs/shared`) |
| `supabase/` | SQL migrations |

## Departments (web)

Built: **Company**, **Sales**, **Stock**, **Coordination**, **Support**, **Wireless**, **Staff accounts**

Placeholders (shell only): Fiber, Financial, General, Accounts, Reception

Staff land on their department home after login. Owners use `/company` and switch departments from the sidebar.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Staff login: `/login`.

```bash
npm run mobile          # Expo app
npm run db:migrate      # Apply Supabase migrations (needs DATABASE_URL)
```

Configure `.env.local` with Supabase URL/keys (and optional Ruijie / database URL as needed).

## Adding a department

Follow the Stock / Wireless pattern:

1. Prefixed routes under `app/(dashboard)/<dept>/`
2. Department sidebar + access hook (`canAccess…` in `lib/permissions.ts`)
3. Own API routes / tables when needed
4. Reuse users from the shared CRM store — do not invent a second staff directory yet

## When to extract architecture

Leave the shared store (users + leads; towers today) alone until a feature forces it:

- Support towers/outages grow → extract a support module
- Non-sales pages only need users → thin `useUsers()` / staff helpers
- `lib/types.ts` becomes hard to navigate → split by domain with a barrel re-export
- Sales URLs confuse other depts → nest under `/sales/*` with redirects

Do **not** move the web app into `apps/web`, unify everything into one mega-store, or mass-rename auth storage keys / sales routes without a concrete need.

See also [docs/architecture.md](docs/architecture.md) for the department shipping pattern and extract-on-pain triggers.
