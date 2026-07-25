"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle, ExternalLink, Phone, Send } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useSupportAccess } from "@/lib/hooks/use-support-access";
import { isOwner } from "@/lib/permissions";
import { SERVICE_LABELS, STAGE_LABELS } from "@/lib/constants";
import type { LeadStage, ServiceType } from "@/lib/types";
import type { SupportMessage, SupportThread } from "@megs/shared";
import { PageHeader, PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CoordinationJobRequestDialog,
  type CoordinationJobRequestPayload,
} from "@/components/support/coordination-job-request-dialog";

type ClientInstallation = {
  itemId: string;
  productName: string;
  brand: string;
  deviceName: string;
  serialNumber: string;
  wifiName: string | null;
  wifiPassword: string | null;
  clientPppoe: string | null;
  clientAddress: string | null;
};

type ClientProfile = {
  leadId: string;
  clientName: string;
  company: string;
  phone: string;
  email: string;
  address: string;
  serviceType: string;
  packageTier: string;
  packagePrice: string | null;
  packageSpeed: string | null;
  serviceZone: string;
  stage: string;
  towerName: string | null;
  towerSiteName: string | null;
  assignedToName: string | null;
  notes: string;
  clientPppoe: string;
  appEmail: string | null;
  appPhone: string | null;
  appActive: boolean | null;
  installations: ClientInstallation[];
};

function Detail({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right font-medium break-all">{value}</span>
    </div>
  );
}

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
  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null);
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
    setClientProfile(json.clientProfile ?? null);
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

  async function acceptChat() {
    if (!accessToken) return;
    setBusy(true);
    setSuccess(null);
    setError(null);
    try {
      const res = await fetch("/api/support/messages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "accept", threadId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      setSuccess("Chat accepted — client can message now.");
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
  const isPending = thread?.status === "pending";
  const isOpen = thread?.status === "open";

  const serviceLabel =
    clientProfile?.serviceType && clientProfile.serviceType in SERVICE_LABELS
      ? SERVICE_LABELS[clientProfile.serviceType as ServiceType]
      : clientProfile?.serviceType;
  const stageLabel =
    clientProfile?.stage && clientProfile.stage in STAGE_LABELS
      ? STAGE_LABELS[clientProfile.stage as LeadStage]
      : clientProfile?.stage;

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
              thread?.status === "pending"
                ? "Pending — accept to chat"
                : thread?.status,
              thread?.clientAddress ? thread.clientAddress : null,
            ]
              .filter(Boolean)
              .join(" · ") || undefined
          }
          actions={
            <div className="flex flex-wrap gap-2">
              {isPending ? (
                <Button
                  size="sm"
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={busy}
                  onClick={() => void acceptChat()}
                >
                  Accept chat
                </Button>
              ) : null}
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
              ) : isOpen ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void setThreadStatus("close")}
                >
                  <CheckCircle className="mr-1 h-4 w-4" />
                  Mark resolved
                </Button>
              ) : null}
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
      {isPending ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          This client is waiting for support. Accept the chat to let them know you are available,
          then reply below.
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-h-0 flex-col gap-3">
          <div className="min-h-0 flex-1 space-y-2 overflow-auto rounded-lg border bg-white p-4">
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
            {messages.length === 0 && isPending ? (
              <p className="text-sm text-muted-foreground">
                No messages yet — accept to open the chat.
              </p>
            ) : null}
          </div>
          {isOpen ? (
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
          ) : isPending ? (
            <p className="text-sm text-muted-foreground">
              Accept the chat request before sending a reply.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Thread is resolved. Reopen to reply, or send a service call to coordination if a visit
              is still needed.
            </p>
          )}
        </div>

        <Card className="max-h-full overflow-auto bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Client details</CardTitle>
            <p className="text-xs text-muted-foreground">
              From sales lead record
              {clientProfile?.leadId ? (
                <>
                  {" · "}
                  <Link
                    href={`/leads/${clientProfile.leadId}`}
                    className="inline-flex items-center gap-0.5 text-primary underline"
                  >
                    Open in sales
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </>
              ) : null}
            </p>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {!clientProfile ? (
              <p className="text-muted-foreground">No sales lead linked to this chat.</p>
            ) : (
              <>
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Contact
                  </p>
                  <Detail label="Name" value={clientProfile.clientName} />
                  <Detail label="Company" value={clientProfile.company} />
                  <Detail label="Phone" value={clientProfile.phone} />
                  <Detail label="Email" value={clientProfile.email} />
                  <Detail label="Address" value={clientProfile.address} />
                  <Detail label="Client PPPoE" value={clientProfile.clientPppoe} />
                  {clientProfile.phone ? (
                    <a
                      href={`tel:${clientProfile.phone}`}
                      className="inline-flex items-center gap-1 text-xs text-primary underline"
                    >
                      <Phone className="h-3 w-3" />
                      Call
                    </a>
                  ) : null}
                </div>

                <div className="space-y-1.5 border-t border-border pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Service
                  </p>
                  <Detail label="Type" value={serviceLabel} />
                  <Detail label="Package" value={clientProfile.packageTier} />
                  <Detail label="Price" value={clientProfile.packagePrice} />
                  <Detail label="Speed" value={clientProfile.packageSpeed} />
                  <Detail label="Coverage area" value={clientProfile.towerName} />
                  <Detail label="Tower" value={clientProfile.towerSiteName} />
                  <Detail label="Stage" value={stageLabel} />
                  <Detail label="Sales rep" value={clientProfile.assignedToName} />
                </div>

                <div className="space-y-1.5 border-t border-border pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    App login
                  </p>
                  <Detail label="App email" value={clientProfile.appEmail} />
                  <Detail label="App phone" value={clientProfile.appPhone} />
                  <Detail
                    label="Status"
                    value={
                      clientProfile.appActive == null
                        ? null
                        : clientProfile.appActive
                          ? "Active"
                          : "Inactive"
                    }
                  />
                </div>

                {clientProfile.notes ? (
                  <div className="space-y-1 border-t border-border pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Sales notes
                    </p>
                    <p className="whitespace-pre-wrap text-sm">{clientProfile.notes}</p>
                  </div>
                ) : null}

                <div className="space-y-2 border-t border-border pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Installation / QR
                  </p>
                  {clientProfile.installations.length === 0 ? (
                    <p className="text-muted-foreground">No linked installation QR yet.</p>
                  ) : (
                    clientProfile.installations.map((inst) => (
                      <div
                        key={inst.itemId}
                        className="space-y-1 rounded-lg border border-border bg-muted/20 p-2"
                      >
                        <p className="font-semibold">{inst.productName}</p>
                        <Detail
                          label="Device"
                          value={[inst.brand, inst.deviceName].filter(Boolean).join(" · ")}
                        />
                        <Detail label="Serial" value={inst.serialNumber} />
                        <Detail label="PPPoE" value={inst.clientPppoe} />
                        <Detail label="WiFi" value={inst.wifiName} />
                        <Detail label="WiFi pass" value={inst.wifiPassword} />
                        <Detail label="Site address" value={inst.clientAddress} />
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <CoordinationJobRequestDialog
        open={jobOpen}
        onOpenChange={setJobOpen}
        onSubmit={submitServiceCall}
        busy={jobBusy}
        heading={`Book service call — ${thread?.clientName ?? "Client"}`}
        description="Sends a job card to coordination (tagged from support). They can assign a technician to book the visit."
        defaultTitle={`Service call — ${thread?.clientName ?? "Client"}`}
        defaultNotes={defaultNotes}
        defaultAddress={clientProfile?.address || thread?.clientAddress || ""}
        defaultClientName={clientProfile?.clientName || thread?.clientName || ""}
        submitLabel="Send to coordination"
      />
    </PageShell>
  );
}
