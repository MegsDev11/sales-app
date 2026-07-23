import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireSupportAccess } from "@/lib/supabase/server-auth";
import { makeId, migrationHint } from "@/lib/mobile/field-mappers";
import type { SupportMessage, SupportThread } from "@megs/shared";

function threadFromRow(
  row: {
    id: string;
    lead_id: string;
    client_account_id: string;
    status: string;
    last_message_at: string | null;
    created_at: string;
  },
  clientName?: string
): SupportThread {
  return {
    id: row.id,
    leadId: row.lead_id,
    clientAccountId: row.client_account_id,
    status: row.status === "closed" ? "closed" : "open",
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
    clientName,
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
      if (tErr) throw new Error(migrationHint(tErr.message, "023_support_messaging.sql"));
      if (!thread) return NextResponse.json({ error: "Not found" }, { status: 404 });

      const { data: lead } = await supabase
        .from("leads")
        .select("client_name")
        .eq("id", thread.lead_id)
        .maybeSingle();

      const { data: messages, error } = await supabase
        .from("support_messages")
        .select("*")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);

      return NextResponse.json({
        thread: threadFromRow(thread, lead?.client_name),
        messages: (messages ?? []).map(messageFromRow),
      });
    }

    const { data: threads, error } = await supabase
      .from("support_threads")
      .select("*")
      .order("last_message_at", { ascending: false, nullsFirst: false });
    if (error) throw new Error(migrationHint(error.message, "023_support_messaging.sql"));

    const leadIds = [...new Set((threads ?? []).map((t) => t.lead_id))];
    const { data: leads } = leadIds.length
      ? await supabase.from("leads").select("id, client_name").in("id", leadIds)
      : { data: [] };
    const names = new Map((leads ?? []).map((l) => [l.id, l.client_name]));

    return NextResponse.json({
      threads: (threads ?? []).map((t) => threadFromRow(t, names.get(t.lead_id))),
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
    if (action === "send") {
      const threadId = String(body.threadId ?? "");
      const text = String(body.body ?? "").trim();
      if (!threadId || !text) {
        return NextResponse.json({ error: "threadId and body required" }, { status: 400 });
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
        .update({ status: action === "close" ? "closed" : "open" })
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
