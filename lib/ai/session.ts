import { createHash, randomBytes, randomInt } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hashPortalCode } from "@/lib/portal-auth";

/**
 * Conversation state for the public support assistant.
 *
 * Everything here is written with the service-role client. That is deliberate: the
 * visitor is anonymous and has no Supabase session, so there is no user for RLS to
 * key on. The access rules therefore live in this file and in lib/ai/tools.ts rather
 * than in policies — see the RLS note at the bottom of 056_support_chat.sql.
 */

export const CHAT_COOKIE = "megs_chat_visitor";
export const CHAT_COOKIE_DAYS = 30;

/** Turns kept in one conversation before the visitor is asked to start again. */
export const SESSION_MESSAGE_CAP = 60;

/** Turns of history replayed to the model. Older turns fall out of the window. */
export const HISTORY_TURNS = 24;

export const MIGRATION_HINT =
  "run supabase/migrations/056_support_chat.sql in Supabase.";

export function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
}

export { adminClient as adminDb } from "@/lib/api/route-helpers";

/** Opaque per-browser token. Not an identity — it only scopes a conversation. */
export function newVisitorToken(): string {
  return randomBytes(24).toString("hex");
}

export function hashVisitorToken(token: string): string {
  return createHash("sha256").update(`chat-visitor:${token}`).digest("hex");
}

/**
 * Addresses are hashed rather than stored: rate limiting needs to recognise a
 * repeat caller, it does not need to know where they live.
 */
export function hashIp(ip: string): string {
  if (!ip) return "";
  return createHash("sha256").update(`chat-ip:${ip}`).digest("hex").slice(0, 32);
}

export function clientIpFrom(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip")?.trim() ?? "";
}

/**
 * Six digits, not the QR portal's four.
 *
 * The portal's code guards a page showing one router's serial number; this one
 * guards a client's balance and ledger. `randomInt` is the CSPRNG — `Math.random`
 * would make codes predictable from one another.
 */
export function generateOtp(): string {
  return String(randomInt(100_000, 1_000_000));
}

/** Same peppered SHA-256 as the QR portal, so codes are never stored in the clear. */
export const hashOtp = hashPortalCode;

export interface ChatSession {
  id: string;
  status: "active" | "escalated" | "closed";
  verifiedClientId: string | null;
  verifiedAt: string | null;
  verifiedChannel: string;
  messageCount: number;
}

interface SessionRow {
  id: string;
  status: string;
  verified_client_id: string | null;
  verified_at: string | null;
  verified_channel: string | null;
  message_count: number | null;
}

function toSession(row: SessionRow): ChatSession {
  return {
    id: row.id,
    status: (row.status as ChatSession["status"]) ?? "active",
    verifiedClientId: row.verified_client_id,
    verifiedAt: row.verified_at,
    verifiedChannel: row.verified_channel ?? "",
    messageCount: row.message_count ?? 0,
  };
}

const SESSION_COLUMNS =
  "id, status, verified_client_id, verified_at, verified_channel, message_count";

/**
 * Resume the visitor's conversation, or start one.
 *
 * A supplied `sessionId` is only honoured when it also matches the caller's visitor
 * hash. Without that check, knowing a session id would be enough to read someone
 * else's transcript — including a verified one.
 */
export async function loadOrCreateSession(
  db: SupabaseClient,
  opts: { visitorToken: string; sessionId?: string | null; ipHash: string }
): Promise<ChatSession> {
  const visitorHash = hashVisitorToken(opts.visitorToken);

  if (opts.sessionId) {
    const { data, error } = await db
      .from("support_chat_sessions")
      .select(SESSION_COLUMNS)
      .eq("id", opts.sessionId)
      .eq("visitor_hash", visitorHash)
      .maybeSingle();
    if (error) throw error;
    if (data) return toSession(data as SessionRow);
  }

  const id = makeId("chat");
  const { error } = await db.from("support_chat_sessions").insert({
    id,
    visitor_hash: visitorHash,
    ip_hash: opts.ipHash,
    status: "active",
  });
  if (error) throw error;

  return {
    id,
    status: "active",
    verifiedClientId: null,
    verifiedAt: null,
    verifiedChannel: "",
    messageCount: 0,
  };
}

/**
 * Re-read verification straight from the database.
 *
 * Every account-scoped tool calls this instead of trusting the session object it was
 * handed. The cost is one small query per tool call; the benefit is that a bug in the
 * request path cannot turn into a data leak, and that a session revoked mid-turn stops
 * working immediately.
 */
export async function verifiedClientId(
  db: SupabaseClient,
  sessionId: string
): Promise<string | null> {
  const { data, error } = await db
    .from("support_chat_sessions")
    .select("verified_client_id, verified_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw error;
  const row = data as { verified_client_id: string | null; verified_at: string | null } | null;
  if (!row?.verified_client_id || !row.verified_at) return null;
  return row.verified_client_id;
}

export async function markVerified(
  db: SupabaseClient,
  sessionId: string,
  clientId: string,
  channel: string
): Promise<void> {
  const { error } = await db
    .from("support_chat_sessions")
    .update({
      verified_client_id: clientId,
      verified_at: new Date().toISOString(),
      verified_channel: channel,
    })
    .eq("id", sessionId);
  if (error) throw error;
}

export interface StoredMessage {
  role: "user" | "assistant";
  body: string;
}

export async function recordMessage(
  db: SupabaseClient,
  sessionId: string,
  role: "user" | "assistant",
  body: string,
  toolsUsed: string[] = []
): Promise<void> {
  const { error } = await db.from("support_chat_messages").insert({
    id: makeId("cmsg"),
    session_id: sessionId,
    role,
    body,
    tools_used: toolsUsed,
  });
  if (error) throw error;
}

export async function touchSession(
  db: SupabaseClient,
  sessionId: string,
  messageCount: number
): Promise<void> {
  await db
    .from("support_chat_sessions")
    .update({ message_count: messageCount, last_message_at: new Date().toISOString() })
    .eq("id", sessionId);
}

/** Oldest-first, capped to the replay window. */
export async function loadHistory(
  db: SupabaseClient,
  sessionId: string,
  limit = HISTORY_TURNS
): Promise<StoredMessage[]> {
  const { data, error } = await db
    .from("support_chat_messages")
    .select("role, body, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const rows = (data ?? []) as Array<{ role: string; body: string }>;
  return rows
    .reverse()
    .filter((r) => r.body.trim())
    .map((r) => ({ role: r.role === "assistant" ? "assistant" : "user", body: r.body }));
}

/** Full transcript, for handing an escalation to a human. */
export async function loadTranscript(
  db: SupabaseClient,
  sessionId: string
): Promise<StoredMessage[]> {
  const { data, error } = await db
    .from("support_chat_messages")
    .select("role, body, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as Array<{ role: string; body: string }>;
  return rows.map((r) => ({ role: r.role === "assistant" ? "assistant" : "user", body: r.body }));
}

/**
 * Kept as re-exports so the chat routes import their whole toolkit from one place.
 * The implementations live in lib/api/route-helpers alongside every other route's.
 */
export {
  errorMessage,
  isMissingSchemaError as isMissingTableError,
} from "@/lib/api/route-helpers";
