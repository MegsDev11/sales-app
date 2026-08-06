import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadClientBilling, loadClientJobCards } from "@/lib/portal/client-billing";
import {
  clearPortalAttempts,
  notePortalAttempt,
  generateSessionToken,
  getPortalCookie,
  hashSessionToken,
  parsePortalCookie,
  portalCookieValue,
  PORTAL_SESSION_COOKIE,
  PORTAL_SESSION_HOURS,
  sessionExpiresAt,
  verifyPortalCode,
} from "@/lib/portal-auth";

/**
 * The client-level QR portal (migration 069).
 *
 * The device portal at /api/stock/item/[token]/portal answers for ONE unit.
 * This one answers for the client: every device on the account, the billing
 * position, and — for a technician — the job cards behind it. A client with a
 * router, a CPE and a mesh unit has one card and one PIN, not three.
 *
 * Two roles behind one scan, deliberately asymmetric:
 *   client     — 6-digit PIN from their card. Sees their devices' basics,
 *                their last invoice, their balance and their next debit date.
 *   technician — the staff 4-digit access code. Sees the whole site including
 *                WiFi credentials and past job cards, but NOT the money.
 *
 * Everything is projected field by field (see lib/portal/client-billing.ts):
 * this response leaves the building, so nothing is ever spread from a row.
 */

export const runtime = "nodejs";

const MIGRATION_HINT = "run supabase/migrations/069_client_qr_vehicles_ppe.sql in Supabase.";

type PortalAction =
  | { action: "authenticate"; role: "client" | "technician"; code: string }
  | { action: "logout" };

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: PORTAL_SESSION_HOURS * 60 * 60,
  };
}

async function loadClientByToken(db: SupabaseClient, token: string) {
  const { data, error } = await db
    .from("accounts_clients")
    .select("id, name, portal_pin_hash, billing_status")
    .eq("qr_token", token)
    .maybeSingle();
  if (error) {
    throw new Error(
      /does not exist|schema cache/i.test(error.message)
        ? `${error.message} — ${MIGRATION_HINT}`
        : error.message
    );
  }
  return data as { id: string; name: string; portal_pin_hash: string | null } | null;
}

async function resolveSession(db: SupabaseClient, clientId: string) {
  const parsed = parsePortalCookie(await getPortalCookie());
  if (!parsed) return null;

  const { data: session } = await db
    .from("qr_portal_sessions")
    .select("*")
    .eq("id", parsed.sessionId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (!session) return null;

  if (new Date(session.expires_at as string).getTime() < Date.now()) {
    await db.from("qr_portal_sessions").delete().eq("id", session.id as string);
    return null;
  }
  if (session.session_token_hash !== hashSessionToken(parsed.rawToken)) return null;
  return session as Record<string, unknown>;
}

/** Devices on this account. The client gets identity only; no serials. */
async function loadDevices(db: SupabaseClient, clientId: string, forTechnician: boolean) {
  const { data } = await db
    .from("stock_items")
    .select("id, brand, device_name, serial_number, qr_token, client_pppoe, wifi_name, wifi_password")
    .eq("client_id", clientId)
    .limit(50);

  return ((data ?? []) as Record<string, unknown>[]).map((d) => ({
    id: String(d.id),
    label: [d.brand, d.device_name].filter(Boolean).join(" ") || "Unit",
    ...(forTechnician
      ? {
          serialNumber: String(d.serial_number ?? ""),
          qrToken: String(d.qr_token ?? ""),
          pppoe: String(d.client_pppoe ?? ""),
          wifiName: String(d.wifi_name ?? ""),
          wifiPassword: String(d.wifi_password ?? ""),
        }
      : {}),
  }));
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    const db = createSupabaseAdminClient() as unknown as SupabaseClient;

    const client = await loadClientByToken(db, token);
    if (!client) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const session = await resolveSession(db, client.id);
    if (!session) {
      // The name is shown before sign-in so a scanner knows whose card this
      // is — nothing else is revealed without a code.
      return NextResponse.json({ authenticated: false, accountName: client.name });
    }

    const role = String(session.role);
    const isTech = role === "technician";
    const [billing, devices, jobCards] = await Promise.all([
      loadClientBilling(db, client.id),
      loadDevices(db, client.id, isTech),
      isTech ? loadClientJobCards(db, client.id) : Promise.resolve([]),
    ]);

    if (isTech) {
      return NextResponse.json(
        {
          authenticated: true,
          role: "technician",
          accountName: client.name,
          devices,
          jobCards,
          // Status and package only. What the client owes is not a
          // technician's business.
          account: billing
            ? { billingStatus: billing.billingStatus, package: billing.package }
            : null,
        },
        { headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }

    return NextResponse.json(
      {
        authenticated: true,
        role: "client",
        accountName: client.name,
        devices,
        billing,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Portal load failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    const body = (await request.json()) as PortalAction;
    const db = createSupabaseAdminClient() as unknown as SupabaseClient;

    const client = await loadClientByToken(db, token);
    if (!client) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (body.action === "logout") {
      const session = await resolveSession(db, client.id);
      if (session) {
        await db.from("qr_portal_sessions").delete().eq("id", session.id as string);
      }
      const jar = await cookies();
      jar.set(PORTAL_SESSION_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
      return NextResponse.json({ ok: true, authenticated: false });
    }

    if (body.action !== "authenticate") {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    const code = body.code?.trim() ?? "";
    const role = body.role;
    // A client card carries six digits; staff access codes are four.
    const expected = role === "client" ? /^\d{6}$/ : /^\d{4}$/;
    if (!expected.test(code)) {
      return NextResponse.json(
        {
          error:
            role === "client"
              ? "Enter the 6-digit PIN from your card"
              : "Enter your 4-digit staff code",
        },
        { status: 400 }
      );
    }

    const rateKey = `c:${token}:${role}:${request.headers.get("x-forwarded-for") ?? "local"}`;
    const verdict = await notePortalAttempt(db, rateKey);
    if (!verdict.allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Try again later." },
        {
          status: 429,
          headers: verdict.retryAfterSeconds
            ? { "Retry-After": String(verdict.retryAfterSeconds) }
            : undefined,
        }
      );
    }

    let technicianId: string | null = null;
    let technicianName: string | null = null;

    if (role === "client") {
      if (!verifyPortalCode(code, client.portal_pin_hash)) {
        return NextResponse.json({ error: "Invalid code" }, { status: 401 });
      }
    } else {
      const { data: techs } = await db
        .from("team_members")
        .select("id, name, access_code_hash, active")
        .not("access_code_hash", "is", null);
      const match = ((techs ?? []) as Record<string, unknown>[]).find(
        (t) => t.active !== false && verifyPortalCode(code, t.access_code_hash as string)
      );
      if (!match) {
        return NextResponse.json({ error: "Invalid code" }, { status: 401 });
      }
      technicianId = String(match.id);
      technicianName = String(match.name ?? "Technician");
    }

    const sessionId = `qps-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const rawToken = generateSessionToken();
    const { error: sessionError } = await db.from("qr_portal_sessions").insert({
      id: sessionId,
      stock_item_id: null,
      client_id: client.id,
      qr_token: token,
      role,
      technician_id: technicianId,
      session_token_hash: hashSessionToken(rawToken),
      expires_at: sessionExpiresAt(),
    });
    if (sessionError) {
      throw new Error(
        /does not exist|schema cache|violates check/i.test(sessionError.message)
          ? `${sessionError.message} — ${MIGRATION_HINT}`
          : sessionError.message
      );
    }

    await clearPortalAttempts(db, rateKey);
    const jar = await cookies();
    jar.set(PORTAL_SESSION_COOKIE, portalCookieValue(sessionId, rawToken), cookieOptions());

    return NextResponse.json({ ok: true, role, technicianName });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sign-in failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
