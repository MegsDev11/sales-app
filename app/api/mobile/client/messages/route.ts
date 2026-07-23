import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getClientAccountFromRequest } from "@/lib/mobile/client-auth";
import { makeId, migrationHint } from "@/lib/mobile/field-mappers";
import type { SupportMessage, SupportThread } from "@megs/shared";

function threadFromRow(row: {
  id: string;
  lead_id: string;
  client_account_id: string;
  status: string;
  last_message_at: string | null;
  created_at: string;
}): SupportThread {
  return {
    id: row.id,
    leadId: row.lead_id,
    clientAccountId: row.client_account_id,
    status: row.status === "closed" ? "closed" : "open",
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
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
      .order("last_message_at", { ascending: false, nullsFirst: false });
    if (error) throw new Error(migrationHint(error.message, "023_support_messaging.sql"));

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
    if (action === "ensure_thread") {
      const { data: existing } = await supabase
        .from("support_threads")
        .select("*")
        .eq("client_account_id", account.id)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing) {
        return NextResponse.json({ thread: threadFromRow(existing) });
      }
      const id = makeId("sth");
      const { error } = await supabase.from("support_threads").insert({
        id,
        lead_id: account.lead_id,
        client_account_id: account.id,
        status: "open",
        created_at: now,
      });
      if (error) throw new Error(migrationHint(error.message, "023_support_messaging.sql"));
      return NextResponse.json({
        thread: threadFromRow({
          id,
          lead_id: account.lead_id,
          client_account_id: account.id,
          status: "open",
          last_message_at: null,
          created_at: now,
        }),
      });
    }

    if (action === "send") {
      let threadId = String(body.threadId ?? "");
      const text = String(body.body ?? "").trim();
      if (!text) return NextResponse.json({ error: "Empty message" }, { status: 400 });

      if (!threadId) {
        const { data: existing } = await supabase
          .from("support_threads")
          .select("id")
          .eq("client_account_id", account.id)
          .eq("status", "open")
          .limit(1)
          .maybeSingle();
        if (existing) threadId = existing.id;
        else {
          threadId = makeId("sth");
          await supabase.from("support_threads").insert({
            id: threadId,
            lead_id: account.lead_id,
            client_account_id: account.id,
            status: "open",
            created_at: now,
          });
        }
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

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
