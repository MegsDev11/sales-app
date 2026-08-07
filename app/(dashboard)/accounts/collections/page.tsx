"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, PageShell, Panel, AlertBanner } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ACCOUNTS_OWNERS } from "@/lib/accounts/parse-clients";
import { paymentLabel, type PaymentMethod } from "@/lib/accounts/constants";
import { cn } from "@/lib/utils";
import { ChevronLeft, Loader2, Phone, Send, Check, ShieldAlert } from "lucide-react";

/**
 * Collections — the chase list.
 *
 * Walks down clients worst-first, sending one letter at a time. There is deliberately
 * no "send all": a demand letter is outward-facing and commercially consequential, and
 * a thousand of them fired by one mis-click is not recoverable. Sending one at a time
 * keeps every failure attributable, lets the clerk stop mid-list, and means the person
 * pressing the button has seen who it is going to.
 *
 * Clients with no email are shown as a separate phone list rather than dropped. They
 * are usually the ones furthest behind, and a run that silently omits them looks like
 * it worked when it didn't.
 */

const money = (value: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(value);

interface Level {
  id: string;
  levelOrder: number;
  name: string;
  minDays: number;
  cooldownDays: number;
  isSuspension: boolean;
  active: boolean;
}

interface Candidate {
  clientId: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  accountsOwner: string | null;
  paymentMethod: PaymentMethod;
  billingStatus: string;
  total: number;
  oldestDays: number | null;
  levelId: string;
  levelOrder: number;
  levelName: string;
  isSuspension: boolean;
  isEscalation: boolean;
  daysSinceLastNotice: number | null;
}

interface NeedsCall {
  clientId: string;
  name: string;
  phone: string;
  total: number;
  oldestDays: number | null;
}

const SKIP_LABELS: Record<string, string> = {
  nothing_owed: "nothing outstanding",
  not_old_enough: "not yet due a reminder",
  no_email: "no email address",
  cooling_off: "chased recently",
  age_unknown: "age unknown (Sage opening balance)",
};

export default function CollectionsPage() {
  const { accessToken } = useAuth();

  const [levels, setLevels] = useState<Level[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [needsCall, setNeedsCall] = useState<NeedsCall[]>([]);
  const [skipCounts, setSkipCounts] = useState<Record<string, number>>({});
  const [totalCandidates, setTotalCandidates] = useState(0);
  const [totalOwed, setTotalOwed] = useState(0);
  const [mailer, setMailer] = useState<{ configured: boolean; missing: string[] } | null>(null);
  const [canEdit, setCanEdit] = useState(false);

  const [levelFilter, setLevelFilter] = useState("all");
  const [owner, setOwner] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (levelFilter !== "all") params.set("level", levelFilter);
      if (owner !== "all") params.set("owner", owner);
      const res = await fetch(`/api/accounts/dunning?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to build the chase list");
      setLevels(body.levels ?? []);
      setCandidates(body.candidates ?? []);
      setNeedsCall(body.needsCall ?? []);
      setSkipCounts(body.skipCounts ?? {});
      setTotalCandidates(body.totalCandidates ?? 0);
      setTotalOwed(body.totalOwed ?? 0);
      setMailer(body.mailer ?? null);
      setCanEdit(!!body.canEdit);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to build the chase list");
    } finally {
      setLoading(false);
    }
  }, [accessToken, levelFilter, owner]);

  useEffect(() => {
    void load();
  }, [load]);

  const post = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!accessToken) throw new Error("Not signed in");
      const res = await fetch("/api/accounts/dunning", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Request failed");
      return body;
    },
    [accessToken]
  );

  const send = useCallback(
    async (c: Candidate) => {
      setBusy(c.clientId);
      setError(null);
      try {
        const r = await post({ action: "send", clientId: c.clientId, levelId: c.levelId });
        setDone((d) => ({ ...d, [c.clientId]: `${r.level} sent` }));
        setNotice(
          `${c.levelName} sent to ${c.name}` +
            (r.flaggedForSuspension ? " — flagged for suspension." : ".")
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Send failed");
      } finally {
        setBusy(null);
      }
    },
    [post]
  );

  const logCall = useCallback(
    async (clientId: string, levelId: string, name: string) => {
      setBusy(clientId);
      try {
        const r = await post({ action: "log", clientId, levelId, note: "phone call" });
        setDone((d) => ({ ...d, [clientId]: `${r.level} logged` }));
        setNotice(`Call to ${name} recorded.`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      } finally {
        setBusy(null);
      }
    },
    [post]
  );

  const skipTotal = Object.values(skipCounts).reduce((a, b) => a + b, 0);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Accounts"
        title="Collections"
        description="Who to chase today, at the right level. One letter at a time."
        meta={
          totalCandidates ? (
            <>
              <span>
                <span className="font-medium text-foreground">
                  {totalCandidates.toLocaleString("en-ZA")}
                </span>{" "}
                to chase
              </span>
              <span>
                <span className="font-medium text-foreground">{money(totalOwed)}</span> between
                them
              </span>
              {needsCall.length ? (
                <span>
                  <span className="font-medium text-amber-700">{needsCall.length}</span> need a
                  phone call
                </span>
              ) : null}
            </>
          ) : null
        }
        actions={
          <Link href="/accounts/ageing">
            <Button variant="outline">
              <ChevronLeft className="mr-1 h-4 w-4" /> Age analysis
            </Button>
          </Link>
        }
      >
        <Select value={levelFilter} onValueChange={(v) => setLevelFilter(v ?? "all")}>
          <SelectTrigger className="w-[190px] bg-surface-elevated">
            <SelectValue>
              {(v) =>
                v === "all"
                  ? "All levels"
                  : levels.find((l) => String(l.levelOrder) === v)?.name ?? String(v)
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All levels</SelectItem>
            {levels.map((l) => (
              <SelectItem key={l.id} value={String(l.levelOrder)}>
                {l.name} — {l.minDays}+ days
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={owner} onValueChange={(v) => setOwner(v ?? "all")}>
          <SelectTrigger className="w-[168px] bg-surface-elevated">
            <SelectValue>
              {(v) => (v === "all" ? "All owners" : v === "none" ? "Unassigned" : String(v))}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All owners</SelectItem>
            {ACCOUNTS_OWNERS.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
            <SelectItem value="none">Unassigned</SelectItem>
          </SelectContent>
        </Select>
      </PageHeader>

      {error ? <AlertBanner tone="danger">{error}</AlertBanner> : null}
      {notice ? (
        <AlertBanner tone="info">
          <span className="flex-1">{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="shrink-0 font-medium underline underline-offset-2"
          >
            Dismiss
          </button>
        </AlertBanner>
      ) : null}

      {mailer && !mailer.configured ? (
        <AlertBanner tone="warn">
          Email isn&apos;t configured, so letters can be reviewed but not sent. Set{" "}
          <span className="font-mono text-xs">{mailer.missing.join(", ")}</span> in the
          environment. Phone calls can still be logged, which keeps the escalation ladder
          honest.
        </AlertBanner>
      ) : null}

      {skipTotal > 0 ? (
        <p className="text-sm text-muted-foreground">
          {skipTotal.toLocaleString("en-ZA")} not being chased today —{" "}
          {Object.entries(skipCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([k, v]) => `${v.toLocaleString("en-ZA")} ${SKIP_LABELS[k] ?? k}`)
            .join(", ")}
          .
        </p>
      ) : null}

      {/* --- the chase list --- */}
      <Panel className="p-0">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Working out who to chase…
          </div>
        ) : candidates.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="font-medium text-foreground">Nobody to chase</p>
            <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
              Everyone overdue has either been chased recently or isn&apos;t old enough yet.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-hairline">
            {candidates.map((c) => {
              const finished = done[c.clientId];
              return (
                <li
                  key={c.clientId}
                  className={cn("px-4 py-3", finished && "bg-muted/40 opacity-70")}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 basis-[22rem]">
                      <p className="flex flex-wrap items-center gap-1.5 font-medium text-foreground">
                        <span className="truncate">{c.name}</span>
                        <Badge variant={c.isSuspension ? "destructive" : "secondary"}>
                          {c.isSuspension ? (
                            <ShieldAlert className="mr-1 h-3 w-3" />
                          ) : null}
                          {c.levelName}
                        </Badge>
                        {c.isEscalation ? <Badge variant="outline">Escalating</Badge> : null}
                      </p>
                      <p className="mt-0.5 text-sm text-foreground">
                        <span className="font-semibold tabular-nums">{money(c.total)}</span>
                        <span className="text-muted-foreground">
                          {" · "}
                          oldest {c.oldestDays} days
                          {c.paymentMethod !== "unknown"
                            ? ` · ${paymentLabel(c.paymentMethod)}`
                            : ""}
                        </span>
                      </p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {c.accountsOwner ? <span>{c.accountsOwner}</span> : null}
                        {c.email ? <span className="truncate">{c.email}</span> : null}
                        {c.daysSinceLastNotice !== null ? (
                          <span>last chased {c.daysSinceLastNotice} days ago</span>
                        ) : (
                          <span>never chased</span>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {finished ? (
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                          <Check className="h-4 w-4" /> {finished}
                        </span>
                      ) : (
                        <>
                          <Button
                            variant="outline"
                            disabled={busy === c.clientId || !canEdit}
                            title="Record that you phoned them — keeps the escalation ladder honest"
                            onClick={() => void logCall(c.clientId, c.levelId, c.name)}
                          >
                            <Phone className="mr-1.5 h-4 w-4" /> Log call
                          </Button>
                          <Button
                            disabled={
                              busy === c.clientId || !canEdit || !mailer?.configured
                            }
                            onClick={() => void send(c)}
                            className="bg-primary text-primary-foreground hover:bg-primary/90"
                          >
                            {busy === c.clientId ? (
                              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                            ) : (
                              <Send className="mr-1.5 h-4 w-4" />
                            )}
                            Send
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {/* --- the phone list --- */}
      {needsCall.length ? (
        <Panel title="Need a phone call" description="Overdue, but no email address on file.">
          <ul className="divide-y divide-hairline">
            {needsCall.map((n) => (
              <li key={n.clientId} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{n.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {money(n.total)} · oldest {n.oldestDays} days
                    {n.phone ? ` · ${n.phone}` : " · no phone number either"}
                  </p>
                </div>
                {n.phone ? (
                  <a
                    href={`tel:${n.phone.replace(/\s+/g, "")}`}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-2 hover:underline"
                  >
                    <Phone className="h-3.5 w-3.5" /> Call
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </PageShell>
  );
}
