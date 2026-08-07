import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type Anthropic from "@anthropic-ai/sdk";
import { mailerStatus } from "@/lib/accounts/mailer";
import { checkRateLimit } from "@/lib/portal-auth";
import {
  CHAT_BETAS,
  CHAT_MAX_TOKENS,
  CHAT_MODEL,
  MAX_TOOL_ITERATIONS,
  addUsage,
  anthropicConfigured,
  costUsd,
  emptyUsage,
  getAnthropic,
} from "@/lib/ai/client";
import { loadAiSettings } from "@/lib/ai/settings";
import { SYSTEM_PROMPT, runtimeContext } from "@/lib/ai/prompt";
import { TOOL_DEFINITIONS, runTool, type ToolContext } from "@/lib/ai/tools";
import { isAfterHours } from "@/lib/ai/escalate";
import {
  CHAT_COOKIE,
  CHAT_COOKIE_DAYS,
  MIGRATION_HINT,
  SESSION_MESSAGE_CAP,
  adminDb,
  clientIpFrom,
  errorMessage,
  hashIp,
  isMissingTableError,
  loadHistory,
  loadOrCreateSession,
  makeId,
  newVisitorToken,
  recordMessage,
  touchSession,
} from "@/lib/ai/session";

/**
 * The client-facing support assistant.
 *
 * POST { message, sessionId? } -> { sessionId, reply, verified, escalation? }
 * GET                          -> { available } so the widget can hide itself
 *
 * The loop below is written by hand rather than with the SDK's tool runner. The runner
 * would execute every tool the model asks for automatically, which is the wrong
 * default when three of the tools send real email and read a stranger's billing data:
 * here each call goes through runTool, which re-checks this session's verification
 * against the database before it returns anything.
 *
 * Nothing about the visitor is trusted. The cookie scopes a conversation and nothing
 * more; identity comes only from the one-time code.
 */

export const runtime = "nodejs";
// Every reply depends on live outage and account data, and on a per-visitor cookie.
export const dynamic = "force-dynamic";

const MAX_MESSAGE_CHARS = 2000;

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: CHAT_COOKIE_DAYS * 24 * 60 * 60,
  };
}

/**
 * What the widget asks before it renders anything.
 *
 * `available` is the API key AND the owner's kill switch in /ai. The greeting comes
 * back with it so the opening line can be changed without a deploy.
 */
export async function GET() {
  const settings = await loadAiSettings(adminDb());
  return NextResponse.json(
    {
      available: anthropicConfigured() && settings.enabled,
      greeting: settings.greeting || null,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

export async function POST(request: Request) {
  if (!anthropicConfigured()) {
    return NextResponse.json(
      { error: "The assistant isn't configured yet. Set ANTHROPIC_API_KEY." },
      { status: 503 }
    );
  }

  let body: { message?: unknown; sessionId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    return NextResponse.json(
      { error: `Please keep it under ${MAX_MESSAGE_CHARS} characters.` },
      { status: 400 }
    );
  }

  const ipHash = hashIp(clientIpFrom(request));
  // Two ceilings: one per browser, one per address, because clearing a cookie is
  // trivial and the address is the only thing that costs an abuser anything.
  if (!checkRateLimit(`chat-msg:${ipHash || "unknown"}`, 40, 15 * 60 * 1000)) {
    return NextResponse.json(
      { error: "That's a lot of messages in a short time. Please try again shortly." },
      { status: 429 }
    );
  }

  const jar = await cookies();
  let visitorToken = jar.get(CHAT_COOKIE)?.value ?? "";
  let mintedCookie = false;
  if (!visitorToken) {
    visitorToken = newVisitorToken();
    mintedCookie = true;
  }

  const db = adminDb();
  const now = new Date();

  try {
    const settings = await loadAiSettings(db);
    if (!settings.enabled) {
      return NextResponse.json(
        {
          error:
            "The assistant is switched off at the moment. Please call the office on " +
            "087 820 5290 and somebody will help you.",
        },
        { status: 503 }
      );
    }

    const session = await loadOrCreateSession(db, {
      visitorToken,
      sessionId: typeof body.sessionId === "string" ? body.sessionId : null,
      ipHash,
    });

    if (session.messageCount >= SESSION_MESSAGE_CAP) {
      return NextResponse.json(
        {
          sessionId: session.id,
          reply:
            "This conversation has gone on a while and I've lost the earlier context. " +
            "Please start a new chat, or call the office on 087 820 5290 and somebody " +
            "will pick it up from here.",
          verified: Boolean(session.verifiedClientId),
          capped: true,
        },
        { headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }

    // The account name is shown to the model so it doesn't re-verify someone it has
    // already verified. Read here rather than trusted from the client.
    let verifiedAccountName: string | null = null;
    if (session.verifiedClientId) {
      const { data } = await db
        .from("accounts_clients")
        .select("name")
        .eq("id", session.verifiedClientId)
        .maybeSingle();
      verifiedAccountName = (data as { name?: string } | null)?.name ?? null;
    }

    const history = await loadHistory(db, session.id);
    await recordMessage(db, session.id, "user", message);

    const messages: Anthropic.Beta.BetaMessageParam[] = [
      ...history.map((m) => ({ role: m.role, content: m.body })),
      { role: "user", content: message },
      // Per-turn state as an operator-authority message, placed after the cached
      // history so changing it every turn costs nothing. See lib/ai/prompt.ts.
      {
        role: "system",
        content: runtimeContext({
          now,
          verifiedAccountName,
          afterHours: isAfterHours(now, settings.officeOpensHour, settings.officeClosesHour),
          canSendEmail: mailerStatus().configured,
          opensHour: settings.officeOpensHour,
        }),
      },
    ];

    const ctx: ToolContext = { db, session, now, settings };
    const usage = emptyUsage();
    const toolsUsed: Array<{ name: string; ok: boolean; ms: number }> = [];

    let replyText = "";
    let stopReason = "";
    let escalationId: string | undefined;
    let becameVerified = Boolean(session.verifiedClientId);

    const anthropic = getAnthropic();

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
      const response = await anthropic.beta.messages.create({
        model: CHAT_MODEL,
        max_tokens: CHAT_MAX_TOKENS,
        betas: [...CHAT_BETAS],
        // Recover a policy decline on another model rather than dead-ending the turn.
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort: settings.effort },
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            // Tools render before system, so one breakpoint here caches both.
            cache_control: { type: "ephemeral" },
          },
        ],
        tools: TOOL_DEFINITIONS,
        messages,
      });

      addUsage(usage, response.usage);
      stopReason = response.stop_reason ?? "";

      // Check before reading content: a refusal can arrive with content empty.
      if (stopReason === "refusal") {
        replyText =
          "I can't help with that one, I'm sorry. If it's about your service or your " +
          "account, tell me what you need and I'll put you through to somebody.";
        break;
      }

      // Thinking blocks must go back unchanged on the same model, so push the whole
      // content array rather than picking pieces out of it.
      messages.push({ role: "assistant", content: response.content });

      const text = response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
      if (text) replyText = text;

      if (stopReason !== "tool_use") break;

      const calls = response.content.filter(
        (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use"
      );
      if (calls.length === 0) break;

      // Run them concurrently, then return every result in ONE user message —
      // splitting them across messages teaches the model to stop batching calls.
      const results = await Promise.all(
        calls.map(async (call) => {
          const started = Date.now();
          const outcome = await runTool(call.name, call.input, ctx);
          toolsUsed.push({
            name: call.name,
            ok: !outcome.isError,
            ms: Date.now() - started,
          });

          if (outcome.verifiedClientId) {
            becameVerified = true;
            ctx.session.verifiedClientId = outcome.verifiedClientId;
          }
          if (outcome.escalationId) escalationId = outcome.escalationId;

          const block: Anthropic.Beta.BetaToolResultBlockParam = {
            type: "tool_result",
            tool_use_id: call.id,
            content: JSON.stringify(outcome.result),
            ...(outcome.isError ? { is_error: true } : {}),
          };
          return block;
        })
      );

      messages.push({ role: "user", content: results });
    }

    if (!replyText) {
      replyText =
        stopReason === "max_tokens"
          ? "Sorry — that answer got away from me. Could you ask me the short version?"
          : "Sorry, I couldn't work that one out. Would you like me to have somebody call you?";
    }

    await recordMessage(
      db,
      session.id,
      "assistant",
      replyText,
      toolsUsed.map((t) => t.name)
    );
    await touchSession(db, session.id, session.messageCount + 2);

    // Audit and cost, per docs/OPS_PLATFORM_PLAN.md §5.3. Never allowed to fail the
    // request — a missing log line is not worth a broken reply.
    void db
      .from("ai_interactions")
      .insert({
        id: makeId("ai"),
        surface: "support_chat",
        session_id: session.id,
        model: CHAT_MODEL,
        effort: settings.effort,
        prompt: message.slice(0, 4000),
        response: replyText.slice(0, 4000),
        tools_used: toolsUsed,
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        cache_read_tokens: usage.cacheReadTokens,
        cache_write_tokens: usage.cacheWriteTokens,
        cost_usd: costUsd(usage),
        stop_reason: stopReason,
      })
      .then(undefined, () => undefined);

    const response = NextResponse.json(
      {
        sessionId: session.id,
        reply: replyText,
        verified: becameVerified,
        escalated: Boolean(escalationId),
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
    if (mintedCookie) response.cookies.set(CHAT_COOKIE, visitorToken, cookieOptions());
    return response;
  } catch (e) {
    const message_ = errorMessage(e);
    if (isMissingTableError(message_)) {
      return NextResponse.json({ error: `${message_} — ${MIGRATION_HINT}` }, { status: 500 });
    }
    return NextResponse.json({ error: message_ }, { status: 500 });
  }
}
