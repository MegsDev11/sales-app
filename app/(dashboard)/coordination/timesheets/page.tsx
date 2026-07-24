"use client";

import { PageHeader, PageShell } from "@/components/layout/page-shell";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useCoordinationAccess } from "@/lib/hooks/use-coordination-access";
import { useCrmStore } from "@/lib/store/crm-store";
import { getFieldTechnicians } from "@/lib/permissions";
import type { TimeEntry } from "@megs/shared";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function CoordinationTimesheetsPage() {
  const { allowed, isLoading } = useCoordinationAccess();
  const { accessToken } = useAuth();
  const { users } = useCrmStore();
  const techs = getFieldTechnicians(users);
  const [technicianId, setTechnicianId] = useState("");
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    const q = technicianId ? `?technicianId=${technicianId}` : "";
    const res = await fetch(`/api/coordination/timesheets${q}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Failed");
      return;
    }
    setEntries(json.entries ?? []);
    setError(null);
  }, [accessToken, technicianId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (isLoading || !allowed) return null;

  const nameOf = (id: string) => techs.find((t) => t.id === id)?.name ?? id;

  return (
    <PageShell>
      <PageHeader
        title="Timesheets"
        description="Clock in/out from the mobile app (with GPS when available)"
      />
      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">{error}</div>
      )}
      <div className="max-w-sm">
        <Select
          value={technicianId || "__all__"}
          onValueChange={(v) => setTechnicianId(!v || v === "__all__" ? "" : String(v))}
        >
          <SelectTrigger>
            <SelectValue placeholder="All techs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All techs</SelectItem>
            {techs.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        {entries.map((e) => (
          <Card key={e.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
              <div>
                <p className="font-semibold">{nameOf(e.technicianId)}</p>
                <p className="text-muted-foreground">
                  In {new Date(e.clockInAt).toLocaleString()}
                  {e.clockOutAt ? ` → Out ${new Date(e.clockOutAt).toLocaleString()}` : " (open)"}
                </p>
                {(e.clockInLat != null || e.clockOutLat != null) && (
                  <p className="text-xs text-muted-foreground">
                    GPS{" "}
                    {e.clockInLat != null
                      ? `in ${e.clockInLat.toFixed(4)},${e.clockInLng?.toFixed(4)}`
                      : ""}
                    {e.clockOutLat != null
                      ? ` · out ${e.clockOutLat.toFixed(4)},${e.clockOutLng?.toFixed(4)}`
                      : ""}
                  </p>
                )}
              </div>
              <span className="text-xs uppercase text-muted-foreground">{e.source}</span>
            </CardContent>
          </Card>
        ))}
        {entries.length === 0 && (
          <p className="text-sm text-muted-foreground">No time entries yet.</p>
        )}
      </div>
    </PageShell>
  );
}