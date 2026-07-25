import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getClientAccountFromRequest } from "@/lib/mobile/client-auth";
import { makeId, migrationHint } from "@/lib/mobile/field-mappers";
import type { SupportMessage, SupportThread } from "@megs/shared";

function mapStatus(status: string): SupportThread["status"] {
  if (status === "closed") return "closed";
  if (status === "pending") return "pending";
  return "open";
}

function threadFromRow(row: {
  id: string;
  lead_id: string;
  client_account_id: string;
  status: string;
  last_message_at: string | null;
  created_at: string;
  accepted_by?: string | null;
  accepted_at?: string | null;
}): SupportThread {
  return {
    id: row.id,
    leadId: row.lead_id,
    clientAccountId: row.client_account_id,
    status: mapStatus(row.status),
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
    acceptedBy: row.accepted_by ?? null,
    acceptedAt: row.accepted_at ?? null,
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
  const account = await getClientAccountFromRequest(request);
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const url = new URL(request.url);
  const threadId = url.searchParams.get("threadId");
  const supabase = createSupabaseAdminClient();

  try {
    if (threadId) {
      const { data: thread } = await supabase
        .from("support_threads")
        .select("*")
        .eq("id", threadId)
        .eq("client_account_id", account.id)
        .maybeSingle();
      if (!thread) return NextResponse.json({ error: "Not found" }, { status: 404 });

      const { data: messages, error } = await supabase
        .from("support_messages")
        .select("*")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true });
      if (error) throw new Error(migrationHint(error.message, "023_support_messaging.sql"));

      return NextResponse.json({
        thread: threadFromRow(thread),
        messages: (messages ?? []).map(messageFromRow),
      });
    }

    const { data: threads, error } = await supabase
      .from("support_threads")
      .select("*")
      .eq("client_account_id", account.id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(migrationHint(error.message, "033_support_thread_accept.sql"));

    return NextResponse.json({ threads: (threads ?? []).map(threadFromRow) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const account = await getClientAccountFromRequest(request);
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = (await request.json()) as Record<string, unknown>;
  const action = String(body.action ?? "send");
  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();

  try {
    if (action === "request_chat" || action === "ensure_thread") {
      const { data: active } = await supabase
        .from("support_threads")
        .select("*")
        .eq("client_account_id", account.id)
        .in("status", ["pending", "open"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (active) {
        return NextResponse.json({ thread: threadFromRow(active) });
      }

      const id = makeId("sth");
      const { error } = await supabase.from("support_threads").insert({
        id,
        lead_id: account.lead_id,
        client_account_id: account.id,
        status: "pending",
        created_at: now,
      });
      if (error) throw new Error(migrationHint(error.message, "033_support_thread_accept.sql"));

      await supabase.from("app_notifications").insert({
        id: makeId("ntf"),
        user_id: null,
        department: "support",
        type: "support_chat_request",
        title: "Client requesting chat",
        body: "A client is waiting for support to accept their chat.",
        link: `/support/messages/${id}`,
        created_at: now,
      });

      return NextResponse.json({
        thread: threadFromRow({
          id,
          lead_id: account.lead_id,
          client_account_id: account.id,
          status: "pending",
          last_message_at: null,
          created_at: now,
          accepted_by: null,
          accepted_at: null,
        }),
      });
    }

    if (action === "send") {
      const threadId = String(body.threadId ?? "");
      const text = String(body.body ?? "").trim();
      if (!threadId || !text) {
        return NextResponse.json({ error: "threadId and body required" }, { status: 400 });
      }

      const { data: thread } = await supabase
        .from("support_threads")
        .select("*")
        .eq("id", threadId)
        .eq("client_account_id", account.id)
        .maybeSingle();
      if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
      if (thread.status !== "open") {
        return NextResponse.json(
          { error: "Wait for support to accept your chat before messaging" },
          { status: 400 }
        );
      }

      const msgId = makeId("smsg");
      const { error } = await supabase.from("support_messages").insert({
        id: msgId,
        thread_id: threadId,
        sender_type: "client",
        sender_id: account.id,
        body: text,
        created_at: now,
      });
      if (error) throw new Error(migrationHint(error.message, "023_support_messaging.sql"));

      await supabase
        .from("support_threads")
        .update({ last_message_at: now })
        .eq("id", threadId);

      await supabase.from("app_notifications").insert({
        id: makeId("ntf"),
        user_id: null,
        department: "support",
        type: "support_message",
        title: "New client message",
        body: text.slice(0, 120),
        link: `/support/messages/${threadId}`,
        created_at: now,
      });

      return NextResponse.json({ ok: true, messageId: msgId, threadId });
    }

    if (action === "report_speed_test") {
      const downloadMbps = Number(body.downloadMbps);
      const uploadMbps = Number(body.uploadMbps);
      const pingMs = Number(body.pingMs);
      const jitterMs = Number(body.jitterMs);
      if (
        ![downloadMbps, uploadMbps, pingMs, jitterMs].every((n) => Number.isFinite(n))
      ) {
        return NextResponse.json({ error: "Speed test results required" }, { status: 400 });
      }

      const clientPlatform =
        typeof body.clientPlatform === "string" && body.clientPlatform.trim()
          ? body.clientPlatform.trim()
          : null;

      // Prefer live installation from account; fall back to client-provided snapshot.
      let deviceLines: string[] = ["Installed device: Not linked on account"];
      const { data: links } = await supabase
        .from("client_account_installations")
        .select("stock_item_id")
        .eq("client_account_id", account.id);
      let itemIds = (links ?? []).map((l) => l.stock_item_id);

      if (!itemIds.length) {
        const { data: lead } = await supabase
          .from("leads")
          .select("client_name")
          .eq("id", account.lead_id)
          .maybeSingle();
        if (lead?.client_name) {
          const { data: byName } = await supabase
            .from("stock_items")
            .select("id")
            .ilike("client_name", lead.client_name);
          if (byName?.length) itemIds = byName.map((i) => i.id);
        }
      }

      if (itemIds.length) {
        const { data: items } = await supabase
          .from("stock_items")
          .select(
            "brand, device_name, serial_number, wifi_name, client_pppoe, product_id"
          )
          .in("id", itemIds)
          .limit(1);
        const item = items?.[0];
        if (item) {
          let productName = "";
          if (item.product_id) {
            const { data: product } = await supabase
              .from("stock_products")
              .select("name")
              .eq("id", item.product_id)
              .maybeSingle();
            productName = product?.name ?? "";
          }
          const label =
            [item.brand, item.device_name].filter(Boolean).join(" ").trim() ||
            productName ||
            "MEGS device";
          deviceLines = [
            `Installed device: ${label}`,
            productName ? `Product: ${productName}` : null,
            item.wifi_name ? `Installed Wi-Fi: ${item.wifi_name}` : null,
            item.serial_number ? `Serial: ${item.serial_number}` : null,
            item.client_pppoe ? `PPPoE: ${item.client_pppoe}` : null,
          ].filter((line): line is string => Boolean(line));
        }
      } else if (body.device && typeof body.device === "object") {
        const d = body.device as Record<string, unknown>;
        const label =
          [d.brand, d.deviceName].filter((v) => typeof v === "string" && v).join(" ").trim() ||
          (typeof d.productName === "string" ? d.productName : "") ||
          "Device";
        deviceLines = [
          `Installed device: ${label}`,
          typeof d.productName === "string" && d.productName
            ? `Product: ${d.productName}`
            : null,
          typeof d.wifiName === "string" && d.wifiName
            ? `Installed Wi-Fi: ${d.wifiName}`
            : null,
          typeof d.serialNumber === "string" && d.serialNumber
            ? `Serial: ${d.serialNumber}`
            : null,
          typeof d.clientPppoe === "string" && d.clientPppoe
            ? `PPPoE: ${d.clientPppoe}`
            : null,
        ].filter((line): line is string => Boolean(line));
      }

      const phoneNetwork =
        typeof body.phoneNetwork === "string" && body.phoneNetwork.trim()
          ? body.phoneNetwork.trim()
          : null;

      const text = [
        "Speed test results",
        `Download: ${downloadMbps.toFixed(2)} Mbps`,
        `Upload: ${uploadMbps.toFixed(2)} Mbps`,
        `Ping: ${Math.round(pingMs)} ms`,
        `Jitter: ${Math.round(jitterMs)} ms`,
        "",
        phoneNetwork ?? "Phone network: Unknown",
        ...deviceLines,
        clientPlatform ? `Tested on: ${clientPlatform}` : null,
        `Tested at: ${new Date(now).toLocaleString()}`,
      ]
        .filter((line): line is string => line !== null)
        .join("\n");

      let threadId: string | null = null;
      const { data: active } = await supabase
        .from("support_threads")
        .select("*")
        .eq("client_account_id", account.id)
        .in("status", ["pending", "open"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (active) {
        threadId = active.id;
      } else {
        threadId = makeId("sth");
        const { error: threadErr } = await supabase.from("support_threads").insert({
          id: threadId,
          lead_id: account.lead_id,
          client_account_id: account.id,
          status: "pending",
          created_at: now,
          last_message_at: now,
        });
        if (threadErr) {
          throw new Error(migrationHint(threadErr.message, "033_support_thread_accept.sql"));
        }
      }

      const msgId = makeId("smsg");
      const { error: msgErr } = await supabase.from("support_messages").insert({
        id: msgId,
        thread_id: threadId,
        sender_type: "client",
        sender_id: account.id,
        body: text,
        created_at: now,
      });
      if (msgErr) throw new Error(migrationHint(msgErr.message, "023_support_messaging.sql"));

      await supabase
        .from("support_threads")
        .update({ last_message_at: now })
        .eq("id", threadId);

      await supabase.from("app_notifications").insert({
        id: makeId("ntf"),
        user_id: null,
        department: "support",
        type: "support_speed_test",
        title: "Client sent a speed test",
        body: `↓ ${downloadMbps.toFixed(1)} Mbps · ↑ ${uploadMbps.toFixed(1)} Mbps · ${Math.round(pingMs)} ms`,
        link: `/support/messages/${threadId}`,
        created_at: now,
      });

      return NextResponse.json({ ok: true, messageId: msgId, threadId, pending: true });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
