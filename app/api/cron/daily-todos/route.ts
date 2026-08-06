import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Builds each department's list for the day (migration 071).
 *
 * The generation itself is SQL — generate_daily_todos() — so pg_cron can run it
 * without reaching back out over HTTP. This endpoint exists for hosts whose
 * scheduler can only make web requests, and is guarded by CRON_SECRET the same
 * way the overdue sweep is.
 *
 * Re-running is harmless: every generated row carries a source reference and a
 * unique index makes a second insert a no-op, so a retry after a failed run
 * cannot double the list.
 */

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (request.headers.get("authorization") === `Bearer ${secret}`) return true;
  return request.headers.get("x-cron-secret") === secret;
}

async function run(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const db = createSupabaseAdminClient() as unknown as SupabaseClient;
    // ?day=YYYY-MM-DD regenerates a specific day; omitted means today.
    const day = new URL(request.url).searchParams.get("day");
    const { data, error } = await db.rpc("generate_daily_todos", {
      p_day: day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null,
    });
    if (error) {
      const hint = /generate_daily_todos/.test(error.message)
        ? " — run supabase/migrations/071_todos_supplier_prices_market.sql in Supabase."
        : "";
      return NextResponse.json({ error: `${error.message}${hint}` }, { status: 500 });
    }
    return NextResponse.json({ ok: true, generated: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return run(request);
}

// Vercel cron invokes GET.
export async function GET(request: Request) {
  return run(request);
}
