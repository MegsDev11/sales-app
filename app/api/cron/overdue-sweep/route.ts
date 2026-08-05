import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Scheduled entry point for the overdue sweep.
 *
 * The preferred wiring is pg_cron inside the database (migration 064 schedules
 * it there when the extension is enabled). This route exists for hosts whose
 * scheduler can only reach the app over HTTP — Vercel cron, GitHub Actions, an
 * external pinger. Guarded by the CRON_SECRET env var: accepts either
 * "Authorization: Bearer <secret>" (what Vercel cron sends) or "x-cron-secret".
 */

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (request.headers.get("authorization") === `Bearer ${secret}`) return true;
  return request.headers.get("x-cron-secret") === secret;
}

async function runSweep() {
  try {
    const supabase = createSupabaseAdminClient() as unknown as SupabaseClient;
    const { data, error } = await supabase.rpc("run_overdue_sweep");
    if (error) {
      const hint = /run_overdue_sweep/.test(error.message)
        ? " — run supabase/migrations/064_notifications_engine.sql in Supabase."
        : "";
      return NextResponse.json({ error: `${error.message}${hint}` }, { status: 500 });
    }
    return NextResponse.json({ ok: true, inserted: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sweep failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runSweep();
}

// Vercel cron invokes GET.
export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runSweep();
}
