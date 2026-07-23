"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useCoordinationAccess } from "@/lib/hooks/use-coordination-access";
import type { TimeOffRequest, TimeOffStatus } from "@megs/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const LEAVE_LABELS: Record<string, string> = {
  family: "Family",
  time_off: "Time off",
  sick: "Sick leave",
  unpaid: "Unpaid leave",
};

function statusTone(status: TimeOffStatus) {
  if (status === "approved") return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (status === "declined") return "bg-red-50 text-red-800 border-red-200";
  return "bg-amber-50 text-amber-900 border-amber-200";
}

export default function CoordinationTimeOffPage() {
  const { allowed, isLoading } = useCoordinationAccess();
  const { accessToken } = useAuth();
  const [status, setStatus] = useState<"all" | TimeOffStatus>("pending");
  const [requests, setRequests] = useState<TimeOffRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    const q = status === "all" ? "" : `?status=${status}`;
    const res = await fetch(`/api/coordination/time-off${q}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Failed to load requests");
      return;
    }
    setRequests(json.requests ?? []);
    setError(null);
  }, [accessToken, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingCount = useMemo(
    () => requests.filter((r) => r.status === "pending").length,
    [requests]
  );

  async function decide(requestId: string, action: "approve" | "decline") {
    if (!accessToken) return;
    setBusyId(requestId);
    setError(null);
    try {
      const res = await fetch("/api/coordination/time-off", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          requestId,
          reviewNote: notes[requestId] ?? "",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Update failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  if (isLoading || !allowed) return null;

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Time off</h1>
          <p className="text-sm text-muted-foreground">
            Approve or decline technician leave requests from MEGS Field
          </p>
        </div>
        <div className="w-44">
          <Select
            value={status}
            onValueChange={(v) => v && setStatus(v as typeof status)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="declined">Declined</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </div>
      )}

      {status === "pending" && pendingCount === 0 && (
        <p className="text-sm text-muted-foreground">No pending time-off requests.</p>
      )}

      <div className="grid gap-3">
        {requests.map((r) => (
          <Card key={r.id} className="bg-white">
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{r.technicianName ?? r.technicianId}</p>
                  <p className="text-sm text-muted-foreground">
                    {LEAVE_LABELS[r.leaveType] ?? r.leaveType} · {r.startDate} → {r.endDate} (
                    {r.days} day{r.days === 1 ? "" : "s"})
                  </p>
                  {r.reason ? (
                    <p className="mt-1 text-sm">{r.reason}</p>
                  ) : (
                    <p className="mt-1 text-sm text-muted-foreground">No reason given</p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Requested {new Date(r.createdAt).toLocaleString()}
                  </p>
                </div>
                <Badge variant="outline" className={statusTone(r.status)}>
                  {r.status}
                </Badge>
              </div>

              {r.status === "pending" ? (
                <div className="space-y-2 border-t pt-3">
                  <Input
                    placeholder="Note to technician (optional)"
                    value={notes[r.id] ?? ""}
                    onChange={(e) =>
                      setNotes((prev) => ({ ...prev, [r.id]: e.target.value }))
                    }
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      className="bg-emerald-600 hover:bg-emerald-700"
                      disabled={busyId === r.id}
                      onClick={() => void decide(r.id, "approve")}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      className="border-red-300 text-red-700 hover:bg-red-50"
                      disabled={busyId === r.id}
                      onClick={() => void decide(r.id, "decline")}
                    >
                      Decline
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="border-t pt-3 text-sm text-muted-foreground">
                  {r.reviewedAt
                    ? `${r.status} ${new Date(r.reviewedAt).toLocaleString()}`
                    : r.status}
                  {r.reviewNote ? ` — ${r.reviewNote}` : ""}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
