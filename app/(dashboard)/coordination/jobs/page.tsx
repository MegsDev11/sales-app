"use client";

import { PageHeader, PageShell } from "@/components/layout/page-shell";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useCoordinationAccess } from "@/lib/hooks/use-coordination-access";
import { useCrmStore } from "@/lib/store/crm-store";
import { getFieldTechnicians } from "@/lib/permissions";
import type { FieldJob } from "@megs/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function CoordinationJobsPage() {
  const { allowed, isLoading } = useCoordinationAccess();
  const { accessToken } = useAuth();
  const { users, leads } = useCrmStore();
  const techs = getFieldTechnicians(users);
  const [jobs, setJobs] = useState<FieldJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("Site visit");
  const [address, setAddress] = useState("");
  const [leadId, setLeadId] = useState("");
  const [techId, setTechId] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    const res = await fetch("/api/coordination/jobs", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Failed to load");
      return;
    }
    setJobs(json.jobs ?? []);
    setError(null);
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createJob() {
    if (!accessToken || !techId) return;
    setBusy(true);
    try {
      const lead = leads.find((l) => l.id === leadId);
      const res = await fetch("/api/coordination/jobs", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "create",
          title,
          address: address || lead?.address || "",
          leadId: leadId || null,
          clientName: lead?.clientName || null,
          notes,
          technicianIds: [techId],
          scheduledStart: new Date().toISOString(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      setJobs(json.jobs ?? []);
      setNotes("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (isLoading || !allowed) return null;

  return (
    <PageShell>
      <PageHeader
        title="Jobs"
        description="Dispatch job cards to field technicians (mobile Today list)"
      />
      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">{error}</div>
      )}

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
          <Select value={techId || "__none__"} onValueChange={(v) => setTechId(v === "__none__" || !v ? "" : String(v))}>
            <SelectTrigger>
              <SelectValue placeholder="Technician" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Select tech</SelectItem>
              {techs.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={leadId || "__none__"} onValueChange={(v) => setLeadId(v === "__none__" || !v ? "" : String(v))}>
            <SelectTrigger>
              <SelectValue placeholder="Client (lead)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">No lead</SelectItem>
              {leads.filter((l) => !l.deleted).slice(0, 200).map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.clientName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Address" />
          <Textarea
            className="md:col-span-2"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes"
            rows={2}
          />
          <Button
            className="bg-primary text-white hover:bg-primary/90"
            disabled={busy || !techId}
            onClick={() => void createJob()}
          >
            Create job
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-3">
        {jobs.map((j) => (
          <Card key={j.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
              <div>
                <p className="font-semibold">{j.title}</p>
                <p className="text-sm text-muted-foreground">
                  {j.clientName ?? "—"} · {j.address || "No address"}
                </p>
                <p className="text-xs uppercase text-muted-foreground">{j.status}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </PageShell>
  );
}