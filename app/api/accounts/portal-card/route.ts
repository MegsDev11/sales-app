import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireAccess } from "@/lib/supabase/server-auth";
import { can } from "@/lib/access";
import { adminClient, errorMessage } from "@/lib/api/route-helpers";
import {
  decryptPortalCode,
  encryptPortalCode,
  generateClientPortalPin,
  hashPortalCode,
} from "@/lib/portal-auth";

/**
 * Issue and reissue the client's QR card (migration 069).
 *
 * The PIN is stored twice on purpose, exactly as the device PIN already is: a
 * hash to check against, and a recoverable ciphertext so the office can read a
 * client their own PIN over the phone without resetting it and reprinting the
 * card. It is never returned in a list — only for the one client asked about.
 */

export const runtime = "nodejs";

const MIGRATION_HINT = "run supabase/migrations/069_client_qr_vehicles_ppe.sql in Supabase.";

const withHint = (message: string) =>
  /does not exist|schema cache/i.test(message) ? `${message} — ${MIGRATION_HINT}` : message;

const makeToken = () => `c_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

export async function GET(request: Request) {
  const user = await requireAccess(request, "accounts", "view");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  try {
    const db = adminClient();
    const url = new URL(request.url);
    const clientId = url.searchParams.get("clientId");
    const q = url.searchParams.get("q")?.trim();

    if (clientId) {
      const { data, error } = await db
        .from("accounts_clients")
        .select("id, name, qr_token, portal_pin_ciphertext, portal_pin_updated_at")
        .eq("id", clientId)
        .maybeSingle();
      if (error) throw new Error(withHint(error.message));
      if (!data) return NextResponse.json({ error: "Client not found" }, { status: 404 });
      return NextResponse.json(
        {
          client: {
            id: data.id,
            name: data.name,
            qrToken: data.qr_token ?? null,
            pin: decryptPortalCode(data.portal_pin_ciphertext as string | null) ?? null,
            pinUpdatedAt: data.portal_pin_updated_at ?? null,
          },
          canEdit: can(user, "accounts", "edit"),
        },
        { headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }

    // Search results carry no PIN — you have to open a client to see it.
    let query = db
      .from("accounts_clients")
      .select("id, name, qr_token, billing_status")
      .order("name")
      .limit(50);
    if (q) query = query.ilike("name", `%${q.replace(/([%_\\])/g, "\\$1")}%`);
    const { data, error } = await query;
    if (error) throw new Error(withHint(error.message));

    return NextResponse.json(
      {
        clients: (data ?? []).map((c) => ({
          id: c.id,
          name: c.name,
          hasCard: Boolean(c.qr_token),
          billingStatus: c.billing_status,
        })),
        canEdit: can(user, "accounts", "edit"),
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await requireAccess(request, "accounts", "edit");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  try {
    const db = adminClient();
    const body = (await request.json()) as { action?: string; clientId?: string };
    if (!body.clientId) {
      return NextResponse.json({ error: "clientId required" }, { status: 400 });
    }

    const { data: existing, error: readError } = await db
      .from("accounts_clients")
      .select("id, name, qr_token")
      .eq("id", body.clientId)
      .maybeSingle();
    if (readError) throw new Error(withHint(readError.message));
    if (!existing) return NextResponse.json({ error: "Client not found" }, { status: 404 });

    if (body.action === "revoke") {
      const { error } = await db
        .from("accounts_clients")
        .update({
          qr_token: null,
          portal_pin_hash: null,
          portal_pin_ciphertext: null,
          portal_pin_updated_at: null,
        })
        .eq("id", body.clientId);
      if (error) throw new Error(withHint(error.message));
      // Any live session on that card dies with it.
      await db.from("qr_portal_sessions").delete().eq("client_id", body.clientId);
      return NextResponse.json({ ok: true });
    }

    if (body.action !== "issue" && body.action !== "newPin") {
      return NextResponse.json({ error: `Unknown action: ${body.action ?? ""}` }, { status: 400 });
    }

    const pin = generateClientPortalPin();
    const patch: Record<string, unknown> = {
      portal_pin_hash: hashPortalCode(pin),
      portal_pin_ciphertext: encryptPortalCode(pin),
      portal_pin_updated_at: new Date().toISOString(),
    };
    // Reissuing a PIN keeps the token, so a card already on a client's fridge
    // still scans; only the code they type changes.
    if (body.action === "issue" && !existing.qr_token) {
      patch.qr_token = makeToken();
    }

    const { error } = await db
      .from("accounts_clients")
      .update(patch)
      .eq("id", body.clientId);
    if (error) throw new Error(withHint(error.message));

    if (body.action === "newPin") {
      await db.from("qr_portal_sessions").delete().eq("client_id", body.clientId);
    }

    const { data: fresh } = await db
      .from("accounts_clients")
      .select("id, name, qr_token")
      .eq("id", body.clientId)
      .maybeSingle();

    return NextResponse.json({
      ok: true,
      client: {
        id: existing.id,
        name: existing.name,
        qrToken: fresh?.qr_token ?? existing.qr_token ?? null,
        pin,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
