import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadClientBilling, loadClientJobCards } from "@/lib/portal/client-billing";
import {
  appNotificationToRow,
  clientSupportRequestFromRow,
  clientSupportRequestToRow,
  stockItemFromRow,
  stockItemVisitFromRow,
  stockItemVisitToRow,
} from "@/lib/supabase/mappers";
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
import type {
  ClientSupportRequest,
  ClientSupportRequestCategory,
  QrPortalRole,
  StockItemVisit,
} from "@/lib/types";

type PortalAction =
  | { action: "authenticate"; role: QrPortalRole; code: string }
  | { action: "logout" }
  | { action: "submitVisit"; workNotes: string }
  | { action: "submitSupportRequest"; category: ClientSupportRequestCategory; description: string };

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: PORTAL_SESSION_HOURS * 60 * 60,
  };
}

async function resolveSession(token: string) {
  const cookieValue = await getPortalCookie();
  const parsed = parsePortalCookie(cookieValue);
  if (!parsed) return null;

  const supabase = createSupabaseAdminClient();
  const { data: session, error } = await supabase
    .from("qr_portal_sessions")
    .select("*")
    .eq("id", parsed.sessionId)
    .eq("qr_token", token)
    .maybeSingle();
  if (error || !session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) {
    await supabase.from("qr_portal_sessions").delete().eq("id", session.id);
    return null;
  }
  if (session.session_token_hash !== hashSessionToken(parsed.rawToken)) return null;
  return session;
}

async function loadVisits(itemId: string): Promise<StockItemVisit[]> {
  const supabase = createSupabaseAdminClient();
  const { data: visits, error } = await supabase
    .from("stock_item_visits")
    .select("*")
    .eq("item_id", itemId)
    .order("submitted_at", { ascending: false });
  if (error) throw error;

  const techIds = [...new Set((visits ?? []).map((v) => v.technician_id))];
  const { data: techs } = await supabase
    .from("team_members")
    .select("id, name")
    .in("id", techIds.length ? techIds : ["__none__"]);
  const techMap = new Map((techs ?? []).map((t) => [t.id, t.name]));

  return (visits ?? []).map((row) =>
    stockItemVisitFromRow(row, techMap.get(row.technician_id) ?? undefined)
  );
}

async function loadSupportRequests(itemId: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("client_support_requests")
    .select("*")
    .eq("item_id", itemId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => clientSupportRequestFromRow(row));
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    const supabase = createSupabaseAdminClient();
    const { data: itemRow, error } = await supabase
      .from("stock_items")
      .select("*")
      .eq("qr_token", token)
      .maybeSingle();
    if (error) throw error;
    if (!itemRow) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const session = await resolveSession(token);
    if (!session) {
      return NextResponse.json({ authenticated: false });
    }

    const item = stockItemFromRow(itemRow);
    const visits = await loadVisits(item.id);
    const supportRequests =
      session.role === "client" ? await loadSupportRequests(item.id) : [];

    // The device is linked to a billing client by migration 066. When that
    // link exists both roles get more: the client sees their own account,
    // the technician sees the whole site.
    const clientId = (itemRow as { client_id?: string | null }).client_id ?? null;

    if (session.role === "technician") {
      // The technician branch used to return null here, so a tech scanning a
      // unit saw strictly LESS than the client did — no PPPoE, no SSID, no
      // address. Inverted on purpose now: this is the person standing at the
      // router who needs the credentials to fix it.
      const [billing, jobCards, siblings] = await Promise.all([
        clientId ? loadClientBilling(supabase as unknown as SupabaseClient, clientId) : null,
        clientId ? loadClientJobCards(supabase as unknown as SupabaseClient, clientId) : [],
        clientId
          ? (supabase as unknown as SupabaseClient)
              .from("stock_items")
              .select("id, brand, device_name, serial_number, qr_token")
              .eq("client_id", clientId)
              .neq("id", item.id)
              .limit(20)
          : Promise.resolve({ data: [] }),
      ]);

      return NextResponse.json({
        authenticated: true,
        role: "technician" as QrPortalRole,
        technicianId: session.technician_id,
        visits,
        supportRequests: [],
        clientDetails: null,
        siteDetails: {
          clientName: item.clientName,
          clientAddress: item.clientAddress,
          clientPppoe: item.clientPppoe,
          wifiName: item.wifiName,
          wifiPassword: item.wifiPassword,
          // Account status only — a technician has no business seeing the
          // balance or what the client pays.
          billingStatus: billing?.billingStatus ?? null,
          package: billing?.package ?? null,
        },
        otherDevices: ((siblings as { data?: unknown[] }).data ?? []).map((row) => {
          const d = row as Record<string, unknown>;
          return {
            id: String(d.id),
            label:
              [d.brand, d.device_name].filter(Boolean).join(" ") || "Unit",
            serialNumber: String(d.serial_number ?? ""),
            qrToken: String(d.qr_token ?? ""),
          };
        }),
        jobCards,
      });
    }

    // Client role: their own network basics, plus their own money.
    const billing = clientId
      ? await loadClientBilling(supabase as unknown as SupabaseClient, clientId)
      : null;

    return NextResponse.json({
      authenticated: true,
      role: "client" as QrPortalRole,
      technicianId: null,
      visits,
      supportRequests,
      clientDetails: {
        clientPppoe: item.clientPppoe,
        wifiName: item.wifiName,
        wifiPassword: item.wifiPassword,
      },
      billing,
    });
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
    const supabase = createSupabaseAdminClient();
    const now = new Date().toISOString();

    const { data: itemRow, error: itemError } = await supabase
      .from("stock_items")
      .select("*")
      .eq("qr_token", token)
      .maybeSingle();
    if (itemError) throw itemError;
    if (!itemRow) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    if (body.action === "logout") {
      const session = await resolveSession(token);
      if (session) {
        await supabase.from("qr_portal_sessions").delete().eq("id", session.id);
      }
      const jar = await cookies();
      jar.set(PORTAL_SESSION_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
      return NextResponse.json({ ok: true, authenticated: false });
    }

    if (body.action === "authenticate") {
      const code = body.code?.trim();
      if (!code || !body.role || !/^\d{4}$/.test(code)) {
        return NextResponse.json(
          { error: "Enter a 4-digit numeric access code" },
          { status: 400 }
        );
      }

      // Counted in the database (migration 069) so the ceiling holds across
      // instances and deploys, not just within one process.
      const rateKey = `${token}:${body.role}:${request.headers.get("x-forwarded-for") ?? "local"}`;
      const verdict = await notePortalAttempt(supabase as unknown as SupabaseClient, rateKey);
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

      if (body.role === "client") {
        if (!verifyPortalCode(code, itemRow.client_pin_hash)) {
          return NextResponse.json({ error: "Invalid code" }, { status: 401 });
        }
      } else if (body.role === "technician") {
        const { data: techs, error: techError } = await supabase
          .from("team_members")
          .select("id, name, access_code_hash, active")
          .not("access_code_hash", "is", null);
        if (techError) throw techError;
        const match = (techs ?? []).find(
          (t) => t.active !== false && verifyPortalCode(code, t.access_code_hash)
        );
        if (!match) {
          return NextResponse.json({ error: "Invalid code" }, { status: 401 });
        }

        const sessionId = `qps-${Date.now()}`;
        const rawToken = generateSessionToken();
        const { error: sessionError } = await supabase.from("qr_portal_sessions").insert({
          id: sessionId,
          stock_item_id: itemRow.id,
          qr_token: token,
          role: "technician",
          technician_id: match.id,
          session_token_hash: hashSessionToken(rawToken),
          expires_at: sessionExpiresAt(),
          created_at: now,
        });
        if (sessionError) throw sessionError;

        await clearPortalAttempts(supabase as unknown as SupabaseClient, rateKey);
        const jar = await cookies();
        jar.set(PORTAL_SESSION_COOKIE, portalCookieValue(sessionId, rawToken), cookieOptions());

        const visits = await loadVisits(itemRow.id);
        return NextResponse.json({
          ok: true,
          authenticated: true,
          role: "technician",
          technicianId: match.id,
          technicianName: match.name,
          visits,
        });
      } else {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }

      // Client session
      const sessionId = `qps-${Date.now()}`;
      const rawToken = generateSessionToken();
      const { error: sessionError } = await supabase.from("qr_portal_sessions").insert({
        id: sessionId,
        stock_item_id: itemRow.id,
        qr_token: token,
        role: "client",
        technician_id: null,
        session_token_hash: hashSessionToken(rawToken),
        expires_at: sessionExpiresAt(),
        created_at: now,
      });
      if (sessionError) throw sessionError;

      await clearPortalAttempts(supabase as unknown as SupabaseClient, rateKey);
      const jar = await cookies();
      jar.set(PORTAL_SESSION_COOKIE, portalCookieValue(sessionId, rawToken), cookieOptions());

      const item = stockItemFromRow(itemRow);
      const supportRequests = await loadSupportRequests(itemRow.id);
      return NextResponse.json({
        ok: true,
        authenticated: true,
        role: "client",
        supportRequests,
        clientDetails: {
          clientPppoe: item.clientPppoe,
          wifiName: item.wifiName,
          wifiPassword: item.wifiPassword,
        },
      });
    }

    const session = await resolveSession(token);
    if (!session) {
      return NextResponse.json({ error: "Session expired. Sign in again." }, { status: 401 });
    }

    if (body.action === "submitVisit") {
      if (session.role !== "technician" || !session.technician_id) {
        return NextResponse.json({ error: "Technician access required" }, { status: 403 });
      }
      const workNotes = body.workNotes?.trim();
      if (!workNotes) {
        return NextResponse.json({ error: "Work notes are required" }, { status: 400 });
      }

      const visit: StockItemVisit = {
        id: `svisit-${Date.now()}`,
        itemId: itemRow.id,
        technicianId: session.technician_id,
        workNotes,
        submittedAt: now,
      };
      const { error } = await supabase
        .from("stock_item_visits")
        .insert(stockItemVisitToRow(visit));
      if (error) throw error;

      const visits = await loadVisits(itemRow.id);
      return NextResponse.json({ ok: true, visits });
    }

    if (body.action === "submitSupportRequest") {
      if (session.role !== "client") {
        return NextResponse.json({ error: "Client access required" }, { status: 403 });
      }
      const description = body.description?.trim();
      if (!description) {
        return NextResponse.json({ error: "Please describe your issue" }, { status: 400 });
      }

      const supportRequest: ClientSupportRequest = {
        id: `csreq-${Date.now()}`,
        itemId: itemRow.id,
        category: body.category ?? "other",
        description,
        status: "new",
        createdAt: now,
        updatedAt: now,
      };
      const { error } = await supabase
        .from("client_support_requests")
        .insert(clientSupportRequestToRow(supportRequest));
      if (error) throw error;

      const item = stockItemFromRow(itemRow);
      const [{ data: productRow }] = await Promise.all([
        supabase.from("stock_products").select("name").eq("id", item.productId).maybeSingle(),
      ]);

      try {
        await supabase.from("app_notifications").insert(
          appNotificationToRow({
            id: `notif-${Date.now()}`,
            department: "support",
            type: "client_support_request",
            title: "New client support request",
            body: `${item.clientName || "Client"} — ${description.slice(0, 120)}`,
            link: "/support/requests",
            requestId: supportRequest.id,
            createdAt: now,
          })
        );
      } catch {
        /* notifications table may be unavailable */
      }

      const supportRequests = await loadSupportRequests(itemRow.id);
      return NextResponse.json({
        ok: true,
        supportRequests,
        clientLabel: item.clientName,
        productName: productRow?.name,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Portal action failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
