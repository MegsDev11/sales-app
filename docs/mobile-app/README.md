# MEGS Field Mobile

Expo React Native app in `apps/mobile`, sharing the same Supabase project as the Next.js CRM.

## Setup

1. Run migrations in Supabase (in order):
   - `020_wireless_network_layouts.sql` (if not already)
   - `021_field_jobs_timesheets.sql`
   - `022_client_accounts.sql`
   - `023_support_messaging.sql`
2. From repo root: `npm install`
3. Copy `apps/mobile/.env.example` → `apps/mobile/.env` and set:
   - `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` (same as web)
   - `EXPO_PUBLIC_API_BASE_URL` → your Next.js origin (e.g. `http://localhost:3000` or LAN IP for a physical device)
4. Start web: `npm run dev`
5. Start mobile: `npm run mobile` (or `cd apps/mobile && npx expo start`)

## Auth / roles

| Login | Mobile dashboard |
|-------|------------------|
| `team_members` stock dept | Stock (scan book-in/out/return) |
| `team_members` coordination staff/manager | Tech (jobs + clock) |
| `client_accounts` (issued via `POST /api/client-accounts`) | Client (credentials, layout, chat) |
| Other staff / owner | Unsupported screen → use web CRM |

## Key APIs

- `GET /api/mobile/me`
- Tech: `/api/mobile/tech/jobs`, `/time`, `/location`
- Stock: `GET /api/mobile/stock/summary` + existing `POST /api/stock`
- Client: `/api/mobile/client/me`, `/layout`, `/messages`
- Web: `/api/coordination/jobs`, `/timesheets`, `/api/support/messages`, `/api/client-accounts`

## Issue a client login

`POST /api/client-accounts` with Bearer (owner/support):

```json
{ "action": "issue", "leadId": "...", "email": "client@example.com", "password": "........", "stockItemIds": ["..."] }
```

See [TODO.md](./TODO.md) for later push/offline work.
