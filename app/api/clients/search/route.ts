import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAnyAccess } from "@/lib/supabase/server-auth";

/**
 * Client directory lookup, shared by every department that attaches a client to
 * something.
 *
 * GET ?q=north          -> up to 30 matches, ranked by name
 * GET ?ids=a,b,c        -> resolve specific ids (for showing an existing selection)
 *
 * WHY THIS EXISTS SEPARATELY FROM /api/accounts/clients. Coordination and Stock users
 * need to find a client to dispatch a technician to; they must not thereby gain sight
 * of what that client pays or owes. This endpoint reads `client_directory`
 * (migration 055), a view carrying only name, contact details, address and PPPoE —
 * never balance, package price, payment method or account status detail. Access is
 * therefore granted to any department that legitimately dispatches work, rather than
 * requiring the Accounts module.
 *
 * WHY IT IS SERVER-SIDE SEARCH. The book is 5 434 clients. The screens this replaces
 * loaded a client list into the browser and capped it at 200 entries, which meant the
 * other 5 234 were simply unreachable from the dropdown. Searching in Postgres and
 * returning 30 rows is both faster and, more importantly, complete.
 */

export const runtime = "nodejs";

function admin(): SupabaseClient {
  return createSupabaseAdminClient() as unknown as SupabaseClient;
}

const MIGRATION_HINT =
  "run supabase/migrations/051 and 055 in Supabase (client book, client directory).";

/** Departments that legitimately attach a client to their work. */
const ALLOWED = ["accounts", "coordination", "stock", "wireless", "crm", "support"] as const;

const LIMIT = 30;

export interface DirectoryClient {
  id: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  pppoeUsername: string;
  billingStatus: string;
}

/**
 * Columns the directory needs, minus the ones migration 055 adds.
 *
 * The endpoint prefers the `client_directory` view, but must keep working before 055
 * is applied — otherwise every department's client picker is dead until a migration
 * is run by hand. So a missing view or a missing `address` column falls back to the
 * base table with the columns that do exist. The admin client bypasses RLS either
 * way; the view is defence in depth for any future non-admin reader, not the only
 * thing keeping balances out of this response.
 */
const BASE_COLUMNS =
  "id, name, contact_name, email, tel, mobile, pppoe_username, billing_status, lead_id";
const VIEW_COLUMNS = `${BASE_COLUMNS}, address`;

function isMissingSchema(message: string): boolean {
  return /relation .* does not exist|column .* does not exist|schema cache|could not find/i.test(
    message
  );
}

function toDirectory(row: Record<string, unknown>): DirectoryClient {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    contactName: String(row.contact_name ?? ""),
    email: String(row.email ?? ""),
    // One phone field for a picker: mobile is the one technicians actually call.
    phone: String(row.mobile ?? "") || String(row.tel ?? ""),
    address: String(row.address ?? ""),
    pppoeUsername: String(row.pppoe_username ?? ""),
    billingStatus: String(row.billing_status ?? "unclassified"),
  };
}

export async function GET(request: Request) {
  const user = await requireAnyAccess(request, [...ALLOWED], "view");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const ids = (url.searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // Callers dispatching work usually want live clients only; the client screen
  // itself can ask for everything.
  const activeOnly = url.searchParams.get("all") !== "1";

  const db = admin();

  /** Run against the view, falling back to the base table before 055 is applied. */
  const run = async (
    build: (from: string, columns: string) => ReturnType<SupabaseClient["from"]> | unknown
  ) => {
    const attempt = async (from: string, columns: string) => {
      const { data, error } = (await build(from, columns)) as {
        data: Record<string, unknown>[] | null;
        error: { message: string } | null;
      };
      if (error) throw new Error(error.message);
      return data ?? [];
    };
    try {
      return await attempt("client_directory", VIEW_COLUMNS);
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      if (!isMissingSchema(message)) throw e;
      return attempt("accounts_clients", BASE_COLUMNS);
    }
  };

  try {
    // Resolving a known selection: exact ids, no filtering, so a job that references
    // a since-cancelled client still shows that client's name rather than a blank.
    if (ids.length) {
      const rows = await run((from, columns) =>
        db.from(from).select(columns).in("id", ids.slice(0, 100))
      );
      return NextResponse.json(
        { clients: rows.map(toDirectory) },
        { headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }

    const rows = await run((from, columns) => {
      let query = db.from(from).select(columns).order("name").limit(LIMIT);
      if (q) {
        const term = `%${q.replace(/[%_]/g, "")}%`;
        query = query.or(
          `name.ilike.${term},contact_name.ilike.${term},pppoe_username.ilike.${term},email.ilike.${term}`
        );
      }
      if (activeOnly) query = query.eq("billing_status", "active");
      return query;
    });

    return NextResponse.json(
      {
        clients: rows.map(toDirectory),
        // Tells the picker to say "keep typing" rather than implying it found everything.
        truncated: rows.length >= LIMIT,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Search failed";
    const hinted = /relation .* does not exist|schema cache|could not find/i.test(message)
      ? `${message} — ${MIGRATION_HINT}`
      : message;
    return NextResponse.json({ error: hinted }, { status: 500 });
  }
}
