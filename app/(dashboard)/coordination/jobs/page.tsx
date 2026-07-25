"use client";

import { PageHeader, PageShell } from "@/components/layout/page-shell";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useCoordinationAccess } from "@/lib/hooks/use-coordination-access";
import { useCrmStore } from "@/lib/store/crm-store";
import { getFieldTechnicians } from "@/lib/permissions";
import type { FieldJob, JobKind } from "@megs/shared";
import { JOB_KIND_OPTIONS, jobKindLabel } from "@megs/shared";
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

const DEFAULT_JOB_KIND: JobKind = "service_call";

export default function CoordinationJobsPage() {
  const { allowed, isLoading } = useCoordinationAccess();
  const { accessToken } = useAuth();
  const { users, leads, towers, towerSites } = useCrmStore();
  const techs = getFieldTechnicians(users);
  const [jobs, setJobs] = useState<FieldJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("Site visit");
  const [address, setAddress] = useState("");
  const [locationLat, setLocationLat] = useState("");
  const [locationLng, setLocationLng] = useState("");
  const [leadId, setLeadId] = useState("");
  const [techId, setTechId] = useState("");
  const [jobType, setJobType] = useState<JobKind>(DEFAULT_JOB_KIND);
  const [clientPppoe, setClientPppoe] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignTechByJob, setAssignTechByJob] = useState<Record<string, string>>({});

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
    const lat = locationLat.trim() === "" ? null : Number(locationLat);
    const lng = locationLng.trim() === "" ? null : Number(locationLng);
    if (
      (lat != null && !Number.isFinite(lat)) ||
      (lng != null && !Number.isFinite(lng)) ||
      (lat == null) !== (lng == null)
    ) {
      setError("Enter both latitude and longitude, or leave both empty.");
      return;
    }
    if (lat != null && (lat < -90 || lat > 90 || lng! < -180 || lng! > 180)) {
      setError("GPS coordinates out of range.");
      return;
    }
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
          locationLat: lat,
          locationLng: lng,
          leadId: leadId || null,
          clientName: lead?.clientName || null,
          clientPppoe: clientPppoe.trim(),
          jobType,
          notes,
          technicianIds: [techId],
          source: "coordination",
          scheduledStart: new Date().toISOString(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      setJobs(json.jobs ?? []);
      setNotes("");
      setAddress("");
      setLocationLat("");
      setLocationLng("");
      setClientPppoe("");
      setJobType(DEFAULT_JOB_KIND);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function assignTech(jobId: string) {
    const tid = assignTechByJob[jobId];
    if (!accessToken || !tid) return;
    setAssigningId(jobId);
    try {
      const res = await fetch("/api/coordination/jobs", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "update",
          jobId,
          technicianIds: [tid],
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to assign");
      setJobs(json.jobs ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to assign");
    } finally {
      setAssigningId(null);
    }
  }

  if (isLoading || !allowed) return null;

  const pendingOwner = jobs.filter(
    (j) =>
      (j.source === "owner" || j.source === "support") &&
      !(j.technicianIds?.length) &&
      j.status === "scheduled"
  );

  function sourceBadge(job: FieldJob) {
    if (job.source === "owner") {
      return (
        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-800">
          From owner
        </span>
      );
    }
    if (job.source === "support") {
      return (
        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800">
          From support
        </span>
      );
    }
    return null;
  }

  function towerLabel(job: FieldJob) {
    if (!job.towerId && !job.towerSiteId) return null;
    const area = job.towerId ? towers.find((t) => t.id === job.towerId) : null;
    const site = job.towerSiteId
      ? towerSites.find((s) => s.id === job.towerSiteId)
      : null;
    if (area && site) return `${area.name} · ${site.name}`;
    if (site) return site.name;
    if (area) return area.name;
    return job.towerId ?? job.towerSiteId ?? null;
  }

  function assigneeNames(job: FieldJob) {
    const ids = job.technicianIds ?? [];
    if (!ids.length) return null;
    return ids
      .map(
        (id) =>
          techs.find((t) => t.id === id)?.name ??
          users.find((u) => u.id === id)?.name ??
          id
      )
      .join(", ");
  }

  function jobTypeCardClass(jobType?: string | null) {
    switch (jobType) {
      case "site_maintenance":
        return "border-emerald-300 bg-emerald-50";
      case "install":
        return "border-purple-400 bg-purple-100";
      case "custom_install":
        return "border-purple-200 bg-purple-50";
      case "project":
        return "border-yellow-300 bg-yellow-50";
      case "service_call":
        return "border-sky-300 bg-sky-50";
      case "tower_work":
        return "border-amber-300 bg-amber-50";
      default:
        return "";
    }
  }

  function jobTypeBadgeClass(jobType?: string | null) {
    switch (jobType) {
      case "site_maintenance":
        return "rounded-full bg-emerald-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-900";
      case "install":
        return "rounded-full bg-purple-300 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-purple-950";
      case "custom_install":
        return "rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-purple-800";
      case "project":
        return "rounded-full bg-yellow-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-yellow-900";
      case "service_call":
        return "rounded-full bg-sky-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-900";
      case "tower_work":
        return "rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900";
      default:
        return "rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700";
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="Jobs"
        description="Dispatch job cards to field technicians — including owner/support tower work requests"
      />
      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">{error}</div>
      )}

      {pendingOwner.length > 0 && (
        <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
          {pendingOwner.length} owner/support request
          {pendingOwner.length === 1 ? "" : "s"} awaiting technician assignment.
        </div>
      )}

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
          <Select
            value={techId || null}
            onValueChange={(v) => setTechId(!v ? "" : String(v))}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Technician">
                {(value) =>
                  value
                    ? techs.find((t) => t.id === value)?.name ?? "Technician"
                    : "Technician"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {techs.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={jobType}
            onValueChange={(v) => setJobType(String(v) as JobKind)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Job type" />
            </SelectTrigger>
            <SelectContent>
              {JOB_KIND_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} label={opt.label}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={clientPppoe}
            onChange={(e) => setClientPppoe(e.target.value)}
            placeholder="Client PPPoE"
            autoCapitalize="off"
            autoCorrect="off"
          />
          <Select
            value={leadId || null}
            onValueChange={(v) => setLeadId(!v || v === "__none__" ? "" : String(v))}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Client" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__" label="No client">
                No client
              </SelectItem>
              {leads
                .filter((l) => !l.deleted)
                .slice(0, 200)
                .map((l) => (
                  <SelectItem key={l.id} value={l.id} label={l.clientName}>
                    {l.clientName}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Street address (optional with GPS)"
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={locationLat}
              onChange={(e) => setLocationLat(e.target.value)}
              placeholder="Latitude e.g. -24.8836"
              inputMode="decimal"
            />
            <Input
              value={locationLng}
              onChange={(e) => setLocationLng(e.target.value)}
              placeholder="Longitude e.g. 28.2940"
              inputMode="decimal"
            />
          </div>
          <p className="text-xs text-muted-foreground md:col-span-2">
            Paste GPS from Google Maps (right‑click → coordinates). Techs tap Navigate on the app to open directions.
          </p>
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
        {jobs.map((j) => {
          const unassigned = !(j.technicianIds?.length);
          const towerName = towerLabel(j);
          const assignees = assigneeNames(j);
          return (
            <Card
              key={j.id}
              className={[
                jobTypeCardClass(j.jobType),
                j.source === "owner" && unassigned ? "ring-2 ring-violet-300" : "",
              ]
                .filter(Boolean)
                .join(" ") || undefined}
            >
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{j.title}</p>
                      {sourceBadge(j)}
                      {j.jobType && j.jobType !== "general" ? (
                        <span className={jobTypeBadgeClass(j.jobType)}>
                          {jobKindLabel(j.jobType)}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {j.clientName ?? "—"} · {j.address || "No address"}
                      {j.clientPppoe ? ` · PPPoE ${j.clientPppoe}` : ""}
                      {j.locationLat != null && j.locationLng != null
                        ? ` · GPS ${j.locationLat.toFixed(5)}, ${j.locationLng.toFixed(5)}`
                        : ""}
                      {towerName ? ` · Tower: ${towerName}` : ""}
                    </p>
                    {j.notes ? (
                      <p className="whitespace-pre-wrap text-sm text-foreground/80">{j.notes}</p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      <span className="uppercase">{j.status}</span>
                      {unassigned ? (
                        <span className="uppercase"> · awaiting assignment</span>
                      ) : assignees ? (
                        <span>
                          {" "}
                          · Assigned to{" "}
                          <span className="font-semibold text-foreground">{assignees}</span>
                        </span>
                      ) : null}
                    </p>
                  </div>
                </div>

                {unassigned && j.status === "scheduled" ? (
                  <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                    <Select
                      value={assignTechByJob[j.id] || null}
                      onValueChange={(v) =>
                        setAssignTechByJob((prev) => ({
                          ...prev,
                          [j.id]: !v ? "" : String(v),
                        }))
                      }
                    >
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Assign technician">
                          {(value) =>
                            value
                              ? techs.find((t) => t.id === value)?.name ??
                                "Assign technician"
                              : "Assign technician"
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {techs.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      className="bg-primary text-white hover:bg-primary/90"
                      disabled={assigningId === j.id || !assignTechByJob[j.id]}
                      onClick={() => void assignTech(j.id)}
                    >
                      {assigningId === j.id ? "Assigning…" : "Assign to tech"}
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </PageShell>
  );
}
