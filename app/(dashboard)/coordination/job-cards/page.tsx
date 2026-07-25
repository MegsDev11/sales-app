"use client";

import { PageHeader, PageShell } from "@/components/layout/page-shell";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useCoordinationAccess } from "@/lib/hooks/use-coordination-access";
import {
  jobKindLabel,
  type CoordinationJobCardRow,
  type JobCardMediaItem,
  type YesNo,
} from "@megs/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function yn(v: YesNo) {
  if (v === "yes") return "Yes";
  if (v === "no") return "No";
  return "—";
}

function PhotoRow({ label, items }: { label: string; items: JobCardMediaItem[] }) {
  if (!items.length) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label} ({items.length})
      </p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) =>
          item.dataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <a key={item.id} href={item.dataUrl} target="_blank" rel="noreferrer">
              <img
                src={item.dataUrl}
                alt={label}
                className="h-20 w-20 rounded-md border border-border object-cover"
              />
            </a>
          ) : null
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="whitespace-pre-wrap text-sm text-foreground">{value || "—"}</p>
    </div>
  );
}

export default function CoordinationJobCardsPage() {
  const { allowed, isLoading } = useCoordinationAccess();
  const { accessToken } = useAuth();
  const [cards, setCards] = useState<CoordinationJobCardRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: "submitted" });
      if (query.trim()) params.set("q", query.trim());
      const res = await fetch(`/api/coordination/job-cards?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to load job cards");
        return;
      }
      setCards(json.cards ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [accessToken, query]);

  useEffect(() => {
    void load();
  }, [load]);

  if (isLoading || !allowed) return null;

  return (
    <PageShell>
      <PageHeader
        title="Job cards"
        description="Technician job cards submitted from the field app"
      />
      {error ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {loading ? "Loading…" : `${cards.length} submitted`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setQuery(search);
            }}
            placeholder="Search JC-01001, client, tech…"
            className="w-full sm:w-64"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setQuery(search)}
            disabled={loading}
          >
            Search
          </Button>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
        </div>
      </div>

      {!loading && cards.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            {query.trim()
              ? `No job cards match “${query.trim()}”.`
              : "No submitted job cards yet. When a tech taps Send on a job card, it appears here."}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3">
        {cards.map((card) => {
          const open = expandedId === card.id;
          const p = card.payload;
          return (
            <Card key={card.id} className="overflow-hidden">
              <CardContent className="space-y-3 p-4">
                <button
                  type="button"
                  className="flex w-full flex-wrap items-start justify-between gap-2 text-left"
                  onClick={() => setExpandedId(open ? null : card.id)}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {card.cardNumber ? (
                        <span className="rounded-md bg-slate-900 px-2 py-0.5 font-mono text-xs font-semibold tracking-wide text-white">
                          {card.cardNumber}
                        </span>
                      ) : null}
                      <p className="font-semibold">{card.jobTitle}</p>
                      {card.jobType && card.jobType !== "general" ? (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                          {jobKindLabel(card.jobType)}
                        </span>
                      ) : null}
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                        Submitted
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {p.clientNameSurname || card.jobClientName || "—"}
                      {card.jobAddress ? ` · ${card.jobAddress}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Tech:{" "}
                      <span className="font-semibold text-foreground">
                        {card.technicianName}
                      </span>
                      {card.submittedAt
                        ? ` · ${new Date(card.submittedAt).toLocaleString()}`
                        : ""}
                    </p>
                  </div>
                  <span className="text-sm font-medium text-primary">
                    {open ? "Hide" : "View"}
                  </span>
                </button>

                {open ? (
                  <div className="space-y-4 border-t border-border pt-4">
                    {card.cardNumber ? (
                      <Field label="Job card #" value={card.cardNumber} />
                    ) : null}
                    <div>
                      <p className="mb-2 text-sm font-semibold">Risk assessment</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Field label="Working on heights" value={yn(p.workingOnHeights)} />
                        <Field label="Weather danger" value={yn(p.weatherDanger)} />
                        <Field label="High voltage nearby" value={yn(p.highVoltageNearby)} />
                        <Field label="Has PPE" value={yn(p.hasPpe)} />
                        <Field
                          label="Needs management approval"
                          value={yn(p.needsMgmtApproval)}
                        />
                        <Field
                          label="Senior tech signature"
                          value={
                            p.seniorTechSignature
                              ? `${p.seniorTechSignature.name} (${new Date(
                                  p.seniorTechSignature.signedAt
                                ).toLocaleString()})`
                              : "—"
                          }
                        />
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-sm font-semibold">Technical job card</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Field label="Client name" value={p.clientNameSurname} />
                        <Field label="Cable work" value={yn(p.requiresCableWork)} />
                        <Field
                          label="Risk assessment approved"
                          value={yn(p.riskAssessmentApproved)}
                        />
                        <Field
                          label="Date / time"
                          value={[p.jobDate, p.jobTime].filter(Boolean).join(" ") || "—"}
                        />
                        <Field label="Hours on site" value={p.hoursOnSite} />
                        <Field label="Travel (one way)" value={p.travelOneWay} />
                        <div className="sm:col-span-2">
                          <Field label="Work done" value={p.workDone} />
                        </div>
                        <div className="sm:col-span-2">
                          <Field label="Stock used" value={p.stockUsed} />
                        </div>
                        {Array.isArray(p.stockChecklist) && p.stockChecklist.length > 0 ? (
                          <div className="sm:col-span-2 space-y-1">
                            <p className="text-xs font-medium text-muted-foreground">
                              Stock checklist
                            </p>
                            <ul className="space-y-1 rounded-lg border bg-muted/20 p-2 text-sm">
                              {p.stockChecklist.map((line) => (
                                <li
                                  key={line.bookingId}
                                  className="flex flex-wrap items-center justify-between gap-2"
                                >
                                  <span>
                                    {line.productName}
                                    {line.serialNumber ? ` · ${line.serialNumber}` : ""}
                                  </span>
                                  <span
                                    className={
                                      line.used === true
                                        ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800"
                                        : line.used === false
                                          ? "rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800"
                                          : "rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600"
                                    }
                                  >
                                    {line.used === true
                                      ? "Used"
                                      : line.used === false
                                        ? "Not used"
                                        : "—"}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        <Field label="Technicians" value={p.technicians} />
                        <Field
                          label="Client signature"
                          value={
                            p.clientSignature
                              ? `${p.clientSignature.name} (${new Date(
                                  p.clientSignature.signedAt
                                ).toLocaleString()})`
                              : "—"
                          }
                        />
                        <div className="sm:col-span-2">
                          <Field label="Notes" value={p.notes} />
                        </div>
                        <Field
                          label="Location"
                          value={
                            p.locationLabel ||
                            (p.locationLat != null && p.locationLng != null
                              ? `${p.locationLat}, ${p.locationLng}`
                              : "—")
                          }
                        />
                        <Field
                          label="Video"
                          value={p.video?.fileName ? `Attached: ${p.video.fileName}` : "—"}
                        />
                      </div>
                    </div>

                    <PhotoRow label="Before photos" items={p.beforePhotos} />
                    <PhotoRow label="After photos" items={p.afterPhotos} />
                    <PhotoRow label="Serial photos" items={p.serialPhotos} />
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
