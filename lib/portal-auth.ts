import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "crypto";
import { cookies } from "next/headers";

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
  return String(Math.floor(1000 + Math.random() * 9000));
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
