import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "crypto";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

const PEPPER =
  process.env.PORTAL_CODE_PEPPER ??
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "megs-portal-development-only";

export const PORTAL_SESSION_COOKIE = "qr_portal_session";
export const PORTAL_SESSION_HOURS = 4;

const attemptMap = new Map<string, { count: number; resetAt: number }>();

export function hashPortalCode(code: string): string {
  return createHash("sha256").update(`${PEPPER}:${code.trim()}`).digest("hex");
}

export function verifyPortalCode(code: string, hash: string | null | undefined): boolean {
  if (!hash) return false;
  const candidate = hashPortalCode(code);
  try {
    return timingSafeEqual(Buffer.from(candidate), Buffer.from(hash));
  } catch {
    return false;
  }
}

export function generateFourDigitCode(): string {
  return String(randomInt(1000, 10000));
}

/**
 * Six digits for the client-level portal card. A device PIN unlocks WiFi
 * details; this one unlocks invoices and a balance, so it is worth the two
 * extra digits — and it is read off a printed card rather than remembered.
 */
export function generateClientPortalPin(): string {
  return String(randomInt(100000, 1000000));
}

/** @deprecated Prefer generateFourDigitCode — kept so stale Turbopack graphs still resolve. */
export function generateSixDigitCode(): string {
  return generateFourDigitCode();
}

export function encryptPortalCode(code: string): string {
  const key = createHash("sha256").update(`${PEPPER}:encryption`).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(code, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}.${tag.toString("hex")}.${encrypted.toString("hex")}`;
}

export function decryptPortalCode(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const [ivHex, tagHex, encryptedHex] = value.split(".");
    if (!ivHex || !tagHex || !encryptedHex) return undefined;
    const key = createHash("sha256").update(`${PEPPER}:encryption`).digest();
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedHex, "hex")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return undefined;
  }
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(`${PEPPER}:session:${token}`).digest("hex");
}

export function sessionExpiresAt(): string {
  return new Date(Date.now() + PORTAL_SESSION_HOURS * 60 * 60 * 1000).toISOString();
}

export function portalCookieValue(sessionId: string, rawToken: string): string {
  return `${sessionId}.${rawToken}`;
}

export function parsePortalCookie(value: string | undefined): { sessionId: string; rawToken: string } | null {
  if (!value) return null;
  const dot = value.indexOf(".");
  if (dot <= 0) return null;
  const sessionId = value.slice(0, dot);
  const rawToken = value.slice(dot + 1);
  if (!sessionId || !rawToken) return null;
  return { sessionId, rawToken };
}

export async function getPortalCookie(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(PORTAL_SESSION_COOKIE)?.value;
}

export function checkRateLimit(key: string, maxAttempts = 8, windowMs = 15 * 60 * 1000): boolean {
  const now = Date.now();
  const entry = attemptMap.get(key);
  if (!entry || entry.resetAt < now) {
    attemptMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxAttempts) return false;
  entry.count += 1;
  return true;
}

export function clearRateLimit(key: string): void {
  attemptMap.delete(key);
}

/* ------------------------------------------------------------------ *
 * Durable rate limiting (migration 069)
 * ------------------------------------------------------------------ *
 * The in-memory limiter above counts per process: it empties on every
 * deploy and each serverless instance keeps its own tally, so the real
 * ceiling is far higher than the number it is configured with. That is
 * too thin for a code that reveals a client's invoices, so the client
 * portal counts in the database instead — every instance sees the same
 * number, and too many wrong codes lock the token out for a while.
 *
 * Falls OPEN to the in-memory limiter if the migration is not applied,
 * so an unapplied migration degrades the guard rather than the service.
 */

export interface RateVerdict {
  allowed: boolean;
  retryAfterSeconds: number;
}

export async function notePortalAttempt(
  db: SupabaseClient,
  key: string,
  options: { maxAttempts?: number; windowMinutes?: number; lockMinutes?: number } = {}
): Promise<RateVerdict> {
  const { data, error } = await db.rpc("portal_note_attempt", {
    p_key: key,
    p_max: options.maxAttempts ?? 8,
    p_window_minutes: options.windowMinutes ?? 15,
    p_lock_minutes: options.lockMinutes ?? 15,
  });
  if (error) {
    return {
      allowed: checkRateLimit(key, options.maxAttempts ?? 8),
      retryAfterSeconds: 0,
    };
  }
  const row = (data ?? {}) as { allowed?: boolean; retryAfterSeconds?: number };
  return {
    allowed: row.allowed !== false,
    retryAfterSeconds: Number(row.retryAfterSeconds ?? 0),
  };
}

export async function clearPortalAttempts(db: SupabaseClient, key: string): Promise<void> {
  clearRateLimit(key);
  await db.rpc("portal_clear_attempts", { p_key: key }).then(
    () => undefined,
    () => undefined
  );
}
