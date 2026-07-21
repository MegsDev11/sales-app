"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useSupportAccess } from "@/lib/hooks/use-support-access";
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
  const { accessToken } = useAuth();
  const [requests, setRequests] = useState<ClientSupportRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [loaded, setLoaded] = useState(false);

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

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-bold">Client requests</h1>
        <p className="text-sm text-muted-foreground">
          Support requests submitted from client installation QR codes
        </p>
      </div>

      {msg && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {msg}
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
                !value || value === "all" ? "All statuses" : STATUS_LABELS[value as ClientSupportRequestStatus]
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
                      className={req.status === status ? "bg-[#C83733] hover:bg-[#a82f2b]" : ""}
                      disabled={busyId === req.id || req.status === status}
                      onClick={() => void updateStatus(req.id, status)}
                    >
                      {STATUS_LABELS[status]}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
