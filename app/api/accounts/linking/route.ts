import { NextResponse } from "next/server";
import { requireAccess } from "@/lib/supabase/server-auth";
import { can } from "@/lib/access";
import { adminClient, errorMessage } from "@/lib/api/route-helpers";

/**
 * Client identity linking — the review step migration 051 deferred.
 *
 * GET  -> the three unresolved queues with suggested matches:
 *           devices  — stock_items carrying client text but no client_id
 *           reps     — distinct Sage sales_rep strings with no team member
 *           leads    — CRM leads not yet tied to a billing client
 * POST -> confirm or clear one link:
 *           linkDevice / unlinkDevice   (stock_items.client_id)
 *           mapRep                      (accounts_clients.sales_rep_member_id, bulk per rep string)
 *           linkLead / unlinkLead       (accounts_clients.lead_id)
 *
 * Auto-linking already happened in migration 066 for exact PPPoE and exact
 * staff-name matches; everything this screen shows needs a human eye, so
 * suggestions are ranked but never applied silently.
 *
 * Guarded at accounts/view for reads, accounts/edit for writes. Untyped admin
 * client — the generated types predate migrations 051/066.
 */

const MIGRATION_HINT = "run supabase/migrations/066_client_identity.sql in Supabase.";

const noStore = { headers: { "Cache-Control": "no-store, max-age=0" } };

interface ClientLite {
  id: string;
  name: string;
  pppoe_username: string;
  contact_name: string;
  tel: string;
  mobile: string;
  billing_status: string;
  lead_id: string | null;
}

const norm = (value: unknown): string =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Token-overlap score between two names: 0..1, order-insensitive. */
function nameScore(a: string, b: string): number {
  const ta = new Set(norm(a).split(" ").filter(Boolean));
  const tb = new Set(norm(b).split(" ").filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  return shared / Math.max(ta.size, tb.size);
}

function topMatches(name: string, pppoe: string, clients: ClientLite[], limit = 3) {
  const wantPppoe = norm(pppoe);
  const scored: { client: ClientLite; score: number; reason: string }[] = [];
  for (const client of clients) {
    if (wantPppoe && norm(client.pppoe_username) === wantPppoe) {
      scored.push({ client, score: 1, reason: "PPPoE matches" });
      continue;
    }
    const score = nameScore(name, client.name);
    if (score >= 0.5) scored.push({ client, score, reason: "similar name" });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => ({
    id: s.client.id,
    name: s.client.name,
    pppoe: s.client.pppoe_username,
    billingStatus: s.client.billing_status,
    score: Math.round(s.score * 100),
    reason: s.reason,
  }));
}

/** ilike-escape a literal so % and _ in Sage rep strings stay literal. */
const ilikeLiteral = (value: string) => value.replace(/([%_\\])/g, "\\$1");

export async function GET(request: Request) {
  const user = await requireAccess(request, "accounts", "view");
  if (!user) {
    return NextResponse.json({ error: "Unauthorized — accounts access required" }, { status: 403 });
  }

  try {
    const supabase = adminClient();

    // ?q= — manual client-book search for a device with no good suggestion.
    const q = new URL(request.url).searchParams.get("q");
    if (q?.trim()) {
      const { data: rows, error } = await supabase
        .from("accounts_clients")
        .select("id, name, pppoe_username, billing_status")
        .ilike("name", `%${ilikeLiteral(q.trim())}%`)
        .order("name")
        .limit(10);
      if (error) throw new Error(error.message);
      return NextResponse.json(
        {
          results: (rows ?? []).map((r) => ({
            id: r.id as string,
            name: r.name as string,
            pppoe: (r.pppoe_username as string) ?? "",
            billingStatus: (r.billing_status as string) ?? "",
            score: 0,
            reason: "search",
          })),
        },
        noStore
      );
    }

    const [devices, clients, reps, members, leads] = await Promise.all([
      supabase
        .from("stock_items")
        .select("id, brand, device_name, serial_number, client_name, client_address, client_pppoe, client_id")
        .is("client_id", null)
        .or("client_name.neq.,client_pppoe.neq.")
        .order("client_name")
        .limit(300),
      supabase
        .from("accounts_clients")
        .select("id, name, pppoe_username, contact_name, tel, mobile, billing_status, lead_id"),
      supabase
        .from("accounts_clients")
        .select("sales_rep")
        .is("sales_rep_member_id", null)
        .neq("sales_rep", ""),
      supabase.from("team_members").select("id, name, active").order("name"),
      supabase.from("leads").select("id, client_name, email, phone, lead_source, assigned_to_id, deleted"),
    ]);

    if (devices.error) throw new Error(`${devices.error.message} — ${MIGRATION_HINT}`);
    if (clients.error) throw new Error(clients.error.message);
    if (reps.error) throw new Error(`${reps.error.message} — ${MIGRATION_HINT}`);

    const clientRows = (clients.data ?? []) as ClientLite[];

    const deviceQueue = (devices.data ?? []).map((d) => ({
      id: d.id as string,
      brand: (d.brand as string) ?? "",
      deviceName: (d.device_name as string) ?? "",
      serialNumber: (d.serial_number as string) ?? "",
      clientName: (d.client_name as string) ?? "",
      clientAddress: (d.client_address as string) ?? "",
      clientPppoe: (d.client_pppoe as string) ?? "",
      suggestions: topMatches(
        (d.client_name as string) ?? "",
        (d.client_pppoe as string) ?? "",
        clientRows
      ),
    }));

    // Distinct unresolved rep strings with row counts.
    const repCounts = new Map<string, number>();
    for (const row of reps.data ?? []) {
      const key = String(row.sales_rep ?? "").trim();
      if (!key) continue;
      repCounts.set(key, (repCounts.get(key) ?? 0) + 1);
    }
    const memberRows = (members.data ?? []) as { id: string; name: string; active: boolean }[];
    const repQueue = [...repCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([salesRep, count]) => {
        const suggestion =
          memberRows.find((m) => norm(m.name) === norm(salesRep)) ??
          memberRows.find((m) => nameScore(m.name, salesRep) >= 0.5) ??
          null;
        return {
          salesRep,
          clients: count,
          suggestedMemberId: suggestion?.id ?? null,
          suggestedMemberName: suggestion?.name ?? null,
        };
      });

    // Leads not yet tied to a billing client, with candidates from the book.
    const linkedLeadIds = new Set(
      clientRows.filter((c) => c.lead_id).map((c) => c.lead_id as string)
    );
    const leadQueue = ((leads.data ?? []) as Record<string, unknown>[])
      .filter((l) => !l.deleted && !linkedLeadIds.has(l.id as string))
      .map((l) => ({
        id: l.id as string,
        clientName: (l.client_name as string) ?? "",
        email: (l.email as string) ?? "",
        phone: (l.phone as string) ?? "",
        leadSource: (l.lead_source as string) ?? "",
        suggestions: topMatches((l.client_name as string) ?? "", "", clientRows),
      }));

    return NextResponse.json(
      {
        devices: deviceQueue,
        reps: repQueue,
        leads: leadQueue,
        members: memberRows.filter((m) => m.active !== false),
        totals: {
          unlinkedDevices: deviceQueue.length,
          unresolvedRepClients: [...repCounts.values()].reduce((a, b) => a + b, 0),
          unlinkedLeads: leadQueue.length,
          clients: clientRows.length,
        },
        canEdit: can(user, "accounts", "edit"),
      },
      noStore
    );
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

interface Body {
  action?: string;
  itemId?: string;
  clientId?: string;
  salesRep?: string;
  memberId?: string | null;
  leadId?: string;
}

export async function POST(request: Request) {
  const user = await requireAccess(request, "accounts", "edit");
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized — accounts edit access required" },
      { status: 403 }
    );
  }

  try {
    const body = (await request.json()) as Body;
    const supabase = adminClient();

    switch (body.action) {
      case "linkDevice": {
        if (!body.itemId || !body.clientId) {
          return NextResponse.json({ error: "itemId and clientId required" }, { status: 400 });
        }
        const { data: client } = await supabase
          .from("accounts_clients")
          .select("id")
          .eq("id", body.clientId)
          .maybeSingle();
        if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
        const { error } = await supabase
          .from("stock_items")
          .update({ client_id: body.clientId })
          .eq("id", body.itemId);
        if (error) throw new Error(`${error.message} — ${MIGRATION_HINT}`);
        return NextResponse.json({ ok: true });
      }

      case "unlinkDevice": {
        if (!body.itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });
        const { error } = await supabase
          .from("stock_items")
          .update({ client_id: null })
          .eq("id", body.itemId);
        if (error) throw new Error(`${error.message} — ${MIGRATION_HINT}`);
        return NextResponse.json({ ok: true });
      }

      case "mapRep": {
        if (!body.salesRep?.trim()) {
          return NextResponse.json({ error: "salesRep required" }, { status: 400 });
        }
        // ilike with no wildcards = exact case-insensitive match on the Sage string.
        const { data: rows, error: findError } = await supabase
          .from("accounts_clients")
          .select("id")
          .ilike("sales_rep", ilikeLiteral(body.salesRep.trim()));
        if (findError) throw new Error(`${findError.message} — ${MIGRATION_HINT}`);
        const ids = (rows ?? []).map((r) => r.id as string);
        for (let from = 0; from < ids.length; from += 500) {
          const { error } = await supabase
            .from("accounts_clients")
            .update({ sales_rep_member_id: body.memberId ?? null })
            .in("id", ids.slice(from, from + 500));
          if (error) throw new Error(`${error.message} — ${MIGRATION_HINT}`);
        }
        return NextResponse.json({ ok: true, updated: ids.length });
      }

      case "linkLead": {
        if (!body.clientId || !body.leadId) {
          return NextResponse.json({ error: "clientId and leadId required" }, { status: 400 });
        }
        const { error } = await supabase
          .from("accounts_clients")
          .update({ lead_id: body.leadId })
          .eq("id", body.clientId);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      case "unlinkLead": {
        if (!body.clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 });
        const { error } = await supabase
          .from("accounts_clients")
          .update({ lead_id: null })
          .eq("id", body.clientId);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${body.action ?? ""}` }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
