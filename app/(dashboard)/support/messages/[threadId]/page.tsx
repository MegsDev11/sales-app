"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useSupportAccess } from "@/lib/hooks/use-support-access";
import type { SupportMessage, SupportThread } from "@megs/shared";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export default function SupportMessageThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = use(params);
  const { allowed, isLoading } = useSupportAccess();
  const { accessToken } = useAuth();
  const [thread, setThread] = useState<SupportThread | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    const res = await fetch(`/api/support/messages?threadId=${threadId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Failed");
      return;
    }
    setThread(json.thread);
    setMessages(json.messages ?? []);
    setError(null);
  }, [accessToken, threadId]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [load]);

  async function send() {
    if (!accessToken || !body.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/support/messages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "send", threadId, body: body.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      setBody("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (isLoading || !allowed) return null;

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4 p-4 lg:p-6">
      <div>
        <Link href="/support/messages" className="text-sm text-[#C83733] hover:underline">
          ← Messages
        </Link>
        <h1 className="mt-1 text-2xl font-bold">{thread?.clientName ?? "Thread"}</h1>
        <p className="text-xs uppercase text-muted-foreground">{thread?.status}</p>
      </div>
      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">{error}</div>
      )}
      <div className="flex-1 space-y-2 overflow-auto rounded-lg border bg-white p-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
              m.senderType === "staff" ? "ml-auto bg-[#C83733]/10" : "bg-gray-100"
            }`}
          >
            <p>{m.body}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {m.senderType} · {new Date(m.createdAt).toLocaleString()}
            </p>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder="Reply to client…"
        />
        <Button
          className="bg-[#C83733] text-white hover:bg-[#a82f2b]"
          disabled={busy}
          onClick={() => void send()}
        >
          Send
        </Button>
      </div>
    </div>
  );
}
