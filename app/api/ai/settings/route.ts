import { NextResponse } from "next/server";
import { requireAccess } from "@/lib/supabase/server-auth";
import { loadAiSettings } from "@/lib/ai/settings";
import { anthropicConfigured } from "@/lib/ai/client";
import { mailerStatus } from "@/lib/accounts/mailer";
import { adminDb, errorMessage, isMissingTableError } from "@/lib/ai/session";

/**
 * The assistant's settings, plus the two facts the screen needs to explain why it
 * might not be running: whether an API key is present, and whether email works.
 *
 * Both are reported as booleans only. The settings page is behind the owner login,
 * but there is still no reason to put an API key or an SMTP password on a wire.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIGRATION_HINT =
  "run supabase/migrations/057_ai_agents.sql and 062_advisor_settings.sql in Supabase.";

export async function GET(request: Request) {
  const user = await requireAccess(request, "ai", "manage");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  try {
    const db = adminDb();
    const settings = await loadAiSettings(db);

    // Usage totals, so the owner can see what the thing costs without SQL.
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await db
      .from("ai_interactions")
      .select("cost_usd, input_tokens, output_tokens, created_at")
      .gte("created_at", since)
      .limit(5000);

    const rows = (data ?? []) as Array<{ cost_usd: number | string }>;
    const spend = rows.reduce((sum, r) => sum + Number(r.cost_usd ?? 0), 0);

    return NextResponse.json(
      {
        settings,
        environment: {
          apiKeyPresent: anthropicConfigured(),
          emailConfigured: mailerStatus().configured,
        },
        usage: {
          days: 30,
          conversationTurns: rows.length,
          costUsd: Number(spend.toFixed(4)),
        },
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (e) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const user = await requireAccess(request, "ai", "manage");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const efforts = ["", "low", "medium", "high", "xhigh", "max"];
  const effort = String(body.effort ?? "").trim().toLowerCase();
  if (!efforts.includes(effort)) {
    return NextResponse.json({ error: `Invalid effort: ${effort}` }, { status: 400 });
  }

  const advisorEffort = String(body.advisorEffort ?? "").trim().toLowerCase();
  if (!efforts.includes(advisorEffort)) {
    return NextResponse.json(
      { error: `Invalid advisor effort: ${advisorEffort}` },
      { status: 400 }
    );
  }

  const opens = Number(body.officeOpensHour ?? 8);
  const closes = Number(body.officeClosesHour ?? 17);
  if (!Number.isInteger(opens) || !Number.isInteger(closes) || opens < 0 || closes > 24 || closes <= opens) {
    return NextResponse.json(
      { error: "Office hours must be whole hours, with closing after opening." },
      { status: 400 }
    );
  }

  const oncall = String(body.oncallEmail ?? "").trim();
  if (oncall && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(oncall)) {
    return NextResponse.json({ error: "That on-call address doesn't look valid." }, { status: 400 });
  }

  try {
    const db = adminDb();
    const { error } = await db.from("ai_agent_settings").upsert({
      id: "default",
      enabled: body.enabled !== false,
      greeting: String(body.greeting ?? "").trim().slice(0, 2000),
      effort,
      oncall_email: oncall,
      office_opens_hour: opens,
      office_closes_hour: closes,
      advisor_enabled: body.advisorEnabled !== false,
      advisor_effort: advisorEffort,
      // Long enough for real standing context, short enough that it cannot crowd out
      // the evidence brief it sits beside.
      advisor_house_rules: String(body.advisorHouseRules ?? "").trim().slice(0, 4000),
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;

    return NextResponse.json({ ok: true, settings: await loadAiSettings(db) });
  } catch (e) {
    const message = errorMessage(e);
    return NextResponse.json(
      { error: isMissingTableError(message) ? `${message} — ${MIGRATION_HINT}` : message },
      { status: 500 }
    );
  }
}
