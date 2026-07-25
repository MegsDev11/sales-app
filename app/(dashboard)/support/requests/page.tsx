"use client";

import { PageHeader, PageShell } from "@/components/layout/page-shell";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Send } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useSupportAccess } from "@/lib/hooks/use-support-access";
import { isOwner } from "@/lib/permissions";
import type { ClientSupportRequest, ClientSupportRequestStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CoordinationJobRequestDialog,
  type CoordinationJobRequestPayload,
} from "@/components/support/coordination-job-request-dialog";

const STATUS_LABELS: Record<ClientSupportRequestStatus, string> = {
  new: "New",
  checked: "Checked",
  site_survey_needed: "Site survey needed",
  resolved: "Resolved",
};

const CATEGORY_LABELS: Record<ClientSupportRequest["category"], string> = {
  slow_internet: "Slow internet",
  no_internet: "No internet",
  quote: "Quote request",
  other: "Other",
};

export default function SupportRequestsPage() {
  const { allowed, isLoading } = useSupportAccess();
  const { accessToken, currentUser, isOwner: ownerFlag } = useAuth();
  const [requests, setRequests] = useState<ClientSupportRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [success, setSuccess] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [jobRequest, setJobRequest] = useState<ClientSupportRequest | null>(null);
  const [jobBusy, setJobBusy] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    const params = statusFilter !== "all" ? `?status=${statusFilter}` : "";
    const res = await fetch(`/api/support/requests${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    const data = await res.json();
    if (res.ok) setRequests(data.requests ?? []);
    setLoaded(true);
  }, [accessToken, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter((req) => {
      const hay = [
        req.clientName,
        req.clientAddress,
        req.productName,
        req.deviceLabel,
        req.description,
        CATEGORY_LABELS[req.category],
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [requests, query]);

  if (isLoading || !allowed) return null;

  async function updateStatus(requestId: string, status: ClientSupportRequestStatus) {
    if (!accessToken) return;
    setBusyId(requestId);
    setMsg("");
    try {
      const res = await fetch("/api/support/requests", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "updateStatus", requestId, status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      setRequests((prev) =>
        prev.map((r) => (r.id === requestId ? (data.request as ClientSupportRequest) : r))
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  async function submitServiceCall(payload: CoordinationJobRequestPayload) {
    if (!accessToken || !jobRequest || !currentUser) return;
    setJobBusy(true);
    setMsg("");
    setSuccess("");
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
          clientName: payload.clientName || jobRequest.clientName || null,
          jobType: "service_call",
          source,
          technicianIds: [],
          scheduledStart: new Date().toISOString(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create job");
      const clientLabel = jobRequest.clientName || "client";
      setJobRequest(null);
      setSuccess(`Service call sent to coordination for ${clientLabel}.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed to send service call");
    } finally {
      setJobBusy(false);
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="Client requests"
        description="Support requests submitted from client installation QR codes"
      />

      {msg && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {msg}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {success}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Input
          className="max-w-sm"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search client, device, message…"
        />
        <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue>
              {(value) =>
                !value || value === "all"
                  ? "All statuses"
                  : STATUS_LABELS[value as ClientSupportRequestStatus]
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!loaded ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <Card className="bg-white">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No client support requests yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((req) => (
            <Card key={req.id} className="bg-white">
              <CardContent className="space-y-3 p-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{req.clientName || "Client"}</p>
                    <p className="text-muted-foreground">
                      {req.productName}
                      {req.deviceLabel ? ` · ${req.deviceLabel}` : ""}
                    </p>
                    {req.clientAddress ? (
                      <p className="text-xs text-muted-foreground">{req.clientAddress}</p>
                    ) : null}
                  </div>
                  <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium">
                    {STATUS_LABELS[req.status]}
                  </span>
                </div>
                <p>
                  <span className="font-medium">{CATEGORY_LABELS[req.category]}</span>
                </p>
                <p className="whitespace-pre-wrap">{req.description}</p>
                <p className="text-xs text-muted-foreground">
                  Submitted {new Date(req.createdAt).toLocaleString("en-ZA")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {(["checked", "site_survey_needed", "resolved"] as const).map((status) => (
                    <Button
                      key={status}
                      size="sm"
                      variant={req.status === status ? "default" : "outline"}
                      className={
                        req.status === status
                          ? "bg-primary text-primary-foreground hover:bg-primary/90"
                          : ""
                      }
                      disabled={busyId === req.id || req.status === status}
                      onClick={() => void updateStatus(req.id, status)}
                    >
                      {STATUS_LABELS[status]}
                    </Button>
                  ))}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSuccess("");
                      setMsg("");
                      setJobRequest(req);
                    }}
                  >
                    <Send className="mr-1 h-4 w-4" />
                    Send to coordination
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CoordinationJobRequestDialog
        open={!!jobRequest}
        onOpenChange={(open) => !open && setJobRequest(null)}
        onSubmit={submitServiceCall}
        busy={jobBusy}
        heading={`Book service call — ${jobRequest?.clientName || "Client"}`}
        description="Sends a job card to coordination (tagged from support). They can assign a technician to book the visit."
        defaultTitle={`Service call — ${jobRequest?.clientName || "Client"}`}
        defaultNotes={
          jobRequest
            ? [
                `${CATEGORY_LABELS[jobRequest.category]}: ${jobRequest.description}`,
                jobRequest.productName
                  ? `Device: ${jobRequest.productName}${
                      jobRequest.deviceLabel ? ` · ${jobRequest.deviceLabel}` : ""
                    }`
                  : "",
                `QR support request: ${jobRequest.id}`,
              ]
                .filter(Boolean)
                .join("\n\n")
            : ""
        }
        defaultAddress={jobRequest?.clientAddress ?? ""}
        defaultClientName={jobRequest?.clientName ?? ""}
        submitLabel="Send to coordination"
      />
    </PageShell>
  );
}
