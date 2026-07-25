"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle, Send } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useSupportAccess } from "@/lib/hooks/use-support-access";
import { isOwner } from "@/lib/permissions";
import type { SupportMessage, SupportThread } from "@megs/shared";
import { PageHeader, PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  CoordinationJobRequestDialog,
  type CoordinationJobRequestPayload,
} from "@/components/support/coordination-job-request-dialog";

export default function SupportMessageThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = use(params);
  const { allowed, isLoading } = useSupportAccess();
  const { accessToken, currentUser, isOwner: ownerFlag } = useAuth();
  const [thread, setThread] = useState<SupportThread | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [jobOpen, setJobOpen] = useState(false);
  const [jobBusy, setJobBusy] = useState(false);

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
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
  }, [load]);

  const latestClientMessages = useMemo(() => {
    return messages
      .filter((m) => m.senderType === "client")
      .slice(-3)
      .map((m) => m.body.trim())
      .filter(Boolean)
      .join("\n\n");
  }, [messages]);

  const defaultNotes = useMemo(() => {
    const parts = [
      latestClientMessages
        ? `Client message(s):\n${latestClientMessages}`
        : "Service call required after support chat.",
      `Support thread: /support/messages/${threadId}`,
    ];
    return parts.join("\n\n");
  }, [latestClientMessages, threadId]);

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

  async function setThreadStatus(action: "close" | "reopen") {
    if (!accessToken) return;
    setBusy(true);
    setSuccess(null);
    try {
      const res = await fetch("/api/support/messages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action, threadId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      setSuccess(action === "close" ? "Thread marked resolved." : "Thread reopened.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitServiceCall(payload: CoordinationJobRequestPayload) {
    if (!accessToken || !thread || !currentUser) return;
    setJobBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const source = ownerFlag || isOwner(currentUser) ? "owner" : "support";
      const res = await fetch("/api/coordination/jobs", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "create",
          title: payload.title,
          notes: payload.notes,
          address: payload.address,
          clientName: payload.clientName || thread.clientName || null,
          leadId: thread.leadId,
          jobType: "service_call",
          source,
          technicianIds: [],
          scheduledStart: new Date().toISOString(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create job");
      setJobOpen(false);
      setSuccess("Service call sent to coordination for booking.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send service call");
    } finally {
      setJobBusy(false);
    }
  }

  if (isLoading || !allowed) return null;

  const isClosed = thread?.status === "closed";

  return (
    <PageShell className="flex h-[calc(100vh-8rem)] max-w-none flex-col gap-4 space-y-0">
      <div>
        <Link href="/support/messages" className="text-sm text-primary hover:underline">
          ← Messages
        </Link>
        <PageHeader
          className="mt-1 border-b-0 pb-0"
          title={thread?.clientName ?? "Thread"}
          description={
            [
              thread?.status,
              thread?.clientAddress ? thread.clientAddress : null,
            ]
              .filter(Boolean)
              .join(" · ") || undefined
          }
          actions={
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => {
                  setSuccess(null);
                  setJobOpen(true);
                }}
              >
                <Send className="mr-1 h-4 w-4" />
                Send to coordination
              </Button>
              {isClosed ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void setThreadStatus("reopen")}
                >
                  Reopen
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void setThreadStatus("close")}
                >
                  <CheckCircle className="mr-1 h-4 w-4" />
                  Mark resolved
                </Button>
              )}
            </div>
          }
        />
      </div>
      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">{error}</div>
      )}
      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {success}
        </div>
      )}
      <div className="flex-1 space-y-2 overflow-auto rounded-lg border bg-white p-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
              m.senderType === "staff" ? "ml-auto bg-primary/10" : "bg-gray-100"
            }`}
          >
            <p>{m.body}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {m.senderType} · {new Date(m.createdAt).toLocaleString()}
            </p>
          </div>
        ))}
      </div>
      {!isClosed ? (
        <div className="flex gap-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            placeholder="Reply to client…"
          />
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={busy}
            onClick={() => void send()}
          >
            Send
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Thread is resolved. Reopen to reply, or send a service call to coordination if a visit is
          still needed.
        </p>
      )}

      <CoordinationJobRequestDialog
        open={jobOpen}
        onOpenChange={setJobOpen}
        onSubmit={submitServiceCall}
        busy={jobBusy}
        heading={`Book service call — ${thread?.clientName ?? "Client"}`}
        description="Sends a job card to coordination (tagged from support). They can assign a technician to book the visit."
        defaultTitle={`Service call — ${thread?.clientName ?? "Client"}`}
        defaultNotes={defaultNotes}
        defaultAddress={thread?.clientAddress ?? ""}
        defaultClientName={thread?.clientName ?? ""}
        submitLabel="Send to coordination"
      />
    </PageShell>
  );
}
