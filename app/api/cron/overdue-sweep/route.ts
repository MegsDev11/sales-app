import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { recipientsForModule, sendStaffMail } from "@/lib/mail/staff-mail";

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

/**
 * Email the managers of a module when the sweep raised something for them.
 *
 * The bell only reaches someone who happens to open the app. Overdue work is
 * exactly the case where nobody is looking — so the same rows go out as a short
 * digest. Best-effort: a mail failure never fails the sweep, because the
 * notifications are already written either way.
 */
async function emailDigests(db: SupabaseClient): Promise<Record<string, number>> {
  const sentPerModule: Record<string, number> = {};
  const since = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString();

  const { data: fresh } = await db
    .from("app_notifications")
    .select("department, title, body, link, type, created_at")
    .gte("created_at", since)
    .is("read_at", null)
    .like("type", "overdue_%");

  const rows = (fresh ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return sentPerModule;

  const byModule = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const key = String(row.department ?? "");
    if (!key) continue;
    byModule.set(key, [...(byModule.get(key) ?? []), row]);
  }

  for (const [moduleKey, moduleRows] of byModule) {
    const people = await recipientsForModule(db, moduleKey, "manage");
    if (people.length === 0) continue;

    const lines = moduleRows
      .slice(0, 25)
      .map((r) => `• ${String(r.title)}${r.body ? ` — ${String(r.body)}` : ""}`);
    const more = moduleRows.length > lines.length ? `\n…and ${moduleRows.length - lines.length} more.` : "";

    const body = [
      `${moduleRows.length} item${moduleRows.length === 1 ? "" : "s"} need${
        moduleRows.length === 1 ? "s" : ""
      } attention:`,
      "",
      lines.join("\n"),
      more,
      "",
      "Open the platform to see the detail and clear them.",
    ].join("\n");

    const result = await sendStaffMail(
      people,
      `Overdue: ${moduleRows.length} item${moduleRows.length === 1 ? "" : "s"} in ${moduleKey}`,
      body
    );
    sentPerModule[moduleKey] = result.sent;
  }

  return sentPerModule;
}

async function runSweep(request: Request) {
  try {
    const supabase = createSupabaseAdminClient() as unknown as SupabaseClient;
    const { data, error } = await supabase.rpc("run_overdue_sweep");
    if (error) {
      const hint = /run_overdue_sweep/.test(error.message)
        ? " — run supabase/migrations/064_notifications_engine.sql in Supabase."
        : "";
      return NextResponse.json({ error: `${error.message}${hint}` }, { status: 500 });
    }

    // ?email=0 runs the sweep without sending — useful for a manual re-run.
    let emailed: Record<string, number> | { skipped: string } = { skipped: "disabled" };
    if (new URL(request.url).searchParams.get("email") !== "0") {
      try {
        emailed = await emailDigests(supabase);
      } catch (mailError) {
        emailed = {
          skipped: mailError instanceof Error ? mailError.message : "digest failed",
        };
      }
    }

    return NextResponse.json({ ok: true, inserted: data, emailed });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sweep failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runSweep(request);
}

// Vercel cron invokes GET.
export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runSweep(request);
}
