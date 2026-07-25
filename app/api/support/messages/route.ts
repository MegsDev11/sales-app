import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireSupportAccess } from "@/lib/supabase/server-auth";
import { makeId, migrationHint } from "@/lib/mobile/field-mappers";
import { findServicePackage, toClientPackageInfo } from "@megs/shared";
import type { SupportMessage, SupportThread } from "@megs/shared";

function mapStatus(status: string): SupportThread["status"] {
  if (status === "closed") return "closed";
  if (status === "pending") return "pending";
  return "open";
}

function threadFromRow(
  row: {
    id: string;
    lead_id: string;
    client_account_id: string;
    status: string;
    last_message_at: string | null;
    created_at: string;
    accepted_by?: string | null;
    accepted_at?: string | null;
  },
  extras?: { clientName?: string; clientAddress?: string }
): SupportThread {
  return {
    id: row.id,
    leadId: row.lead_id,
    clientAccountId: row.client_account_id,
    status: mapStatus(row.status),
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
    acceptedBy: row.accepted_by ?? null,
    acceptedAt: row.accepted_at ?? null,
    clientName: extras?.clientName,
    clientAddress: extras?.clientAddress,
  };
}

function messageFromRow(row: {
  id: string;
  thread_id: string;
  sender_type: string;
  sender_id: string | null;
  body: string;
  created_at: string;
}): SupportMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    senderType: row.sender_type === "staff" ? "staff" : "client",
    senderId: row.sender_id,
    body: row.body,
    createdAt: row.created_at,
  };
}

export async function GET(request: Request) {
  const user = await requireSupportAccess(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const url = new URL(request.url);
  const threadId = url.searchParams.get("threadId");
  const supabase = createSupabaseAdminClient();

  try {
    if (threadId) {
      const { data: thread, error: tErr } = await supabase
        .from("support_threads")
        .select("*")
        .eq("id", threadId)
        .maybeSingle();
      if (tErr) throw new Error(migrationHint(tErr.message, "033_support_thread_accept.sql"));
      if (!thread) return NextResponse.json({ error: "Not found" }, { status: 404 });

      const { data: lead } = await supabase
        .from("leads")
        .select(
          "id, client_name, company, phone, email, address, service_type, package_tier, service_zone, stage, tower_id, tower_site_id, assigned_to_id, notes, client_pppoe"
        )
        .eq("id", thread.lead_id)
        .maybeSingle();

      let assignedToName: string | null = null;
      if (lead?.assigned_to_id) {
        const { data: rep } = await supabase
          .from("team_members")
          .select("name")
          .eq("id", lead.assigned_to_id)
          .maybeSingle();
        assignedToName = rep?.name ?? null;
      }

      let towerName: string | null = null;
      if (lead?.tower_id) {
        const { data: tower } = await supabase
          .from("towers")
          .select("name")
          .eq("id", lead.tower_id)
          .maybeSingle();
        towerName = tower?.name ?? null;
      }

      let towerSiteName: string | null = null;
      if (lead?.tower_site_id) {
        const { data: site } = await supabase
          .from("tower_sites")
          .select("name")
          .eq("id", lead.tower_site_id)
          .maybeSingle();
        towerSiteName = site?.name ?? null;
      }

      const { data: links } = await supabase
        .from("client_account_installations")
        .select("stock_item_id")
        .eq("client_account_id", thread.client_account_id);
      let itemIds = (links ?? []).map((l) => l.stock_item_id);
      if (!itemIds.length && lead?.client_name) {
        const { data: byName } = await supabase
          .from("stock_items")
          .select("id")
          .ilike("client_name", lead.client_name);
        if (byName?.length) itemIds = byName.map((i) => i.id);
      }

      let installations: {
        itemId: string;
        productName: string;
        brand: string;
        deviceName: string;
        serialNumber: string;
        wifiName: string | null;
        wifiPassword: string | null;
        clientPppoe: string | null;
        clientAddress: string | null;
      }[] = [];

      if (itemIds.length) {
        const { data: items } = await supabase
          .from("stock_items")
          .select(
            "id, brand, device_name, serial_number, wifi_name, wifi_password, client_pppoe, client_address, product_id"
          )
          .in("id", itemIds);
        const productIds = [...new Set((items ?? []).map((i) => i.product_id).filter(Boolean))];
        const { data: products } = productIds.length
          ? await supabase.from("stock_products").select("id, name").in("id", productIds)
          : { data: [] };
        const productNames = new Map((products ?? []).map((p) => [p.id, p.name]));
        installations = (items ?? []).map((i) => ({
          itemId: i.id,
          productName: productNames.get(i.product_id) ?? "Device",
          brand: i.brand ?? "",
          deviceName: i.device_name ?? "",
          serialNumber: i.serial_number ?? "",
          wifiName: i.wifi_name,
          wifiPassword: i.wifi_password,
          clientPppoe: i.client_pppoe,
          clientAddress: i.client_address,
        }));
      }

      const matched = findServicePackage(lead?.package_tier ?? null);

      const { data: account } = await supabase
        .from("client_accounts")
        .select("email, phone, active")
        .eq("id", thread.client_account_id)
        .maybeSingle();

      const { data: messages, error } = await supabase
        .from("support_messages")
        .select("*")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);

      return NextResponse.json({
        thread: threadFromRow(thread, {
          clientName: lead?.client_name,
          clientAddress: lead?.address ?? undefined,
        }),
        messages: (messages ?? []).map(messageFromRow),
        clientProfile: lead
          ? {
              leadId: lead.id,
              clientName: lead.client_name,
              company: lead.company ?? "",
              phone: lead.phone ?? "",
              email: lead.email ?? "",
              address: lead.address ?? "",
              serviceType: lead.service_type ?? "",
              packageTier: lead.package_tier ?? "",
              packagePrice: matched ? toClientPackageInfo(matched).priceLabel : null,
              packageSpeed: matched?.speed ?? null,
              serviceZone: lead.service_zone ?? "",
              stage: lead.stage ?? "",
              towerName,
              towerSiteName,
              assignedToName,
              notes: lead.notes ?? "",
              clientPppoe: lead.client_pppoe ?? "",
              appEmail: account?.email ?? null,
              appPhone: account?.phone ?? null,
              appActive: account?.active ?? null,
              installations,
            }
          : null,
      });
    }

    const { data: threads, error } = await supabase
      .from("support_threads")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(migrationHint(error.message, "033_support_thread_accept.sql"));

    const leadIds = [...new Set((threads ?? []).map((t) => t.lead_id))];
    const { data: leads } = leadIds.length
      ? await supabase.from("leads").select("id, client_name, address").in("id", leadIds)
      : { data: [] };
    const byLead = new Map(
      (leads ?? []).map((l) => [l.id, { name: l.client_name, address: l.address }])
    );

    return NextResponse.json({
      threads: (threads ?? []).map((t) => {
        const lead = byLead.get(t.lead_id);
        return threadFromRow(t, {
          clientName: lead?.name,
          clientAddress: lead?.address ?? undefined,
        });
      }),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const user = await requireSupportAccess(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = (await request.json()) as Record<string, unknown>;
  const action = String(body.action ?? "send");
  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();

  try {
    if (action === "accept") {
      const threadId = String(body.threadId ?? "");
      if (!threadId) {
        return NextResponse.json({ error: "threadId required" }, { status: 400 });
      }

      const { data: thread } = await supabase
        .from("support_threads")
        .select("*")
        .eq("id", threadId)
        .maybeSingle();
      if (!thread) return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (thread.status === "closed") {
        return NextResponse.json({ error: "Reopen the thread first" }, { status: 400 });
      }
      if (thread.status === "open") {
        return NextResponse.json({ ok: true, alreadyOpen: true });
      }

      const { error } = await supabase
        .from("support_threads")
        .update({
          status: "open",
          accepted_by: user.id,
          accepted_at: now,
          last_message_at: now,
        })
        .eq("id", threadId);
      if (error) throw new Error(migrationHint(error.message, "033_support_thread_accept.sql"));

      const msgId = makeId("smsg");
      await supabase.from("support_messages").insert({
        id: msgId,
        thread_id: threadId,
        sender_type: "staff",
        sender_id: user.id,
        body: "Support is available — you can chat now.",
        created_at: now,
      });

      const { data: account } = await supabase
        .from("client_accounts")
        .select("auth_user_id")
        .eq("id", thread.client_account_id)
        .maybeSingle();

      if (account?.auth_user_id) {
        await supabase.from("app_notifications").insert({
          id: makeId("ntf"),
          user_id: account.auth_user_id,
          department: null,
          type: "support_chat_accepted",
          title: "Support is available",
          body: "A support tech accepted your chat. You can message them now.",
          link: "",
          created_at: now,
        });
      }

      return NextResponse.json({ ok: true });
    }

    if (action === "send") {
      const threadId = String(body.threadId ?? "");
      const text = String(body.body ?? "").trim();
      if (!threadId || !text) {
        return NextResponse.json({ error: "threadId and body required" }, { status: 400 });
      }

      const { data: thread } = await supabase
        .from("support_threads")
        .select("status")
        .eq("id", threadId)
        .maybeSingle();
      if (!thread) return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (thread.status === "pending") {
        return NextResponse.json(
          { error: "Accept the chat request before replying" },
          { status: 400 }
        );
      }
      if (thread.status === "closed") {
        return NextResponse.json({ error: "Thread is closed" }, { status: 400 });
      }

      const msgId = makeId("smsg");
      const { error } = await supabase.from("support_messages").insert({
        id: msgId,
        thread_id: threadId,
        sender_type: "staff",
        sender_id: user.id,
        body: text,
        created_at: now,
      });
      if (error) throw new Error(migrationHint(error.message, "023_support_messaging.sql"));
      await supabase
        .from("support_threads")
        .update({ last_message_at: now })
        .eq("id", threadId);
      return NextResponse.json({ ok: true, messageId: msgId });
    }

    if (action === "close" || action === "reopen") {
      const threadId = String(body.threadId ?? "");
      await supabase
        .from("support_threads")
        .update({
          status: action === "close" ? "closed" : "open",
          ...(action === "reopen"
            ? { accepted_by: user.id, accepted_at: now }
            : {}),
        })
        .eq("id", threadId);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
