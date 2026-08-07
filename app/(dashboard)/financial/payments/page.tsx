"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, PageShell, Panel, AlertBanner } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClientPicker } from "@/components/clients/client-picker";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  Check,
  FileUp,
  Loader2,
  Upload,
  X,
} from "lucide-react";

/**
 * Money in — import a bank statement, then say who each deposit came from.
 *
 * The screen is built around the review queue rather than the import, because the
 * import is thirty seconds and the queue is the actual work. Each unmatched credit is
 * shown with the client the matcher believes it belongs to AND THE REASONS for that
 * belief, so confirming is a glance rather than an act of faith.
 *
 * Only a clear winner gets a one-click confirm. Anything ambiguous shows a client
 * picker instead: a wrongly allocated receipt credits the wrong client and leaves a
 * real debtor being chased for money they already sent, which costs far more than the
 * two seconds saved by guessing.
 */

const money = (value: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(value);

interface Candidate {
  clientId: string;
  clientName: string;
  invoiceNumber?: string;
  confidence: "certain" | "high" | "medium" | "low";
  score: number;
  reasons: string[];
}

interface QueueLine {
  id: string;
  date: string;
  description: string;
  reference: string;
  amount: number;
  candidates: Candidate[];
  autoPostable: boolean;
}

interface StatementSummary {
  rowsRead: number;
  parsed: number;
  dateFrom: string | null;
  dateTo: string | null;
  totalIn: number;
  totalOut: number;
  dateOrder: string;
  warnings: { kind: string; detail: string }[];
}

interface PreviewResult {
  summary: StatementSummary;
  wouldImport: number;
  duplicates: number;
}

export default function PaymentsPage() {
  const { accessToken } = useAuth();

  const [queue, setQueue] = useState<QueueLine[]>([]);
  const [queueSize, setQueueSize] = useState(0);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyLine, setBusyLine] = useState<string | null>(null);

  // Manual selection for lines the matcher couldn't call.
  const [chosen, setChosen] = useState<Record<string, { id: string; name: string }>>({});

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [importing, setImporting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const [head, q] = await Promise.all([
        fetch("/api/financial/payments", {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        }).then((r) => r.json()),
        fetch("/api/financial/payments?view=queue", {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        }).then((r) => r.json()),
      ]);
      if (head.error) throw new Error(head.error);
      if (q.error) throw new Error(q.error);
      setQueueSize(head.queueSize ?? 0);
      setCanEdit(!!head.canEdit);
      setQueue(q.queue ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load payments");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const post = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!accessToken) throw new Error("Not signed in");
      const res = await fetch("/api/financial/payments", {
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

  const sendFile = useCallback(
    async (chosenFile: File, dryRun: boolean) => {
      if (!accessToken) throw new Error("Not signed in");
      const form = new FormData();
      form.append("file", chosenFile);
      if (dryRun) form.append("dryRun", "1");
      const res = await fetch("/api/financial/payments", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Import failed");
      return body;
    },
    [accessToken]
  );

  const onPick = useCallback(
    async (chosenFile: File | null) => {
      if (!chosenFile) return;
      setFile(chosenFile);
      setPreview(null);
      setError(null);
      setImporting(true);
      try {
        setPreview(await sendFile(chosenFile, true));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't read that file");
      } finally {
        setImporting(false);
      }
    },
    [sendFile]
  );

  const commitImport = useCallback(async () => {
    if (!file) return;
    setImporting(true);
    try {
      const result = await sendFile(file, false);
      setNotice(
        `Imported ${result.imported} transaction${result.imported === 1 ? "" : "s"}` +
          (result.duplicates ? `, skipped ${result.duplicates} already held.` : ".")
      );
      setFile(null);
      setPreview(null);
      if (inputRef.current) inputRef.current.value = "";
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }, [file, sendFile, load]);

  const confirmMatch = useCallback(
    async (line: QueueLine, clientId: string) => {
      setBusyLine(line.id);
      setError(null);
      try {
        const r = await post({
          action: "match",
          bankTransactionId: line.id,
          clientId,
        });
        setNotice(
          `${r.receiptNumber} — ${money(line.amount)} receipted to ${r.clientName}` +
            (r.unallocated > 0
              ? `, ${money(r.unallocated)} left as a credit on the account.`
              : `, settling ${r.allocated} invoice${r.allocated === 1 ? "" : "s"}.`)
        );
        setQueue((q) => q.filter((l) => l.id !== line.id));
        setQueueSize((n) => Math.max(0, n - 1));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't record that receipt");
      } finally {
        setBusyLine(null);
      }
    },
    [post]
  );

  const ignore = useCallback(
    async (line: QueueLine) => {
      setBusyLine(line.id);
      try {
        await post({ action: "ignore", bankTransactionId: line.id });
        setQueue((q) => q.filter((l) => l.id !== line.id));
        setQueueSize((n) => Math.max(0, n - 1));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      } finally {
        setBusyLine(null);
      }
    },
    [post]
  );

  const ready = queue.filter((l) => l.autoPostable);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Financial"
        title="Payments in"
        description="Import a bank statement, then confirm who each deposit came from."
        meta={
          queueSize ? (
            <span>
              <span className="font-medium text-foreground">{queueSize.toLocaleString("en-ZA")}</span>{" "}
              deposit{queueSize === 1 ? "" : "s"} waiting
              {ready.length ? (
                <>
                  {" · "}
                  <span className="font-medium text-emerald-700">{ready.length}</span> ready to
                  confirm
                </>
              ) : null}
            </span>
          ) : null
        }
        actions={
          canEdit ? (
            <>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.txt,text/csv"
                className="hidden"
                onChange={(e) => void onPick(e.target.files?.[0] ?? null)}
              />
              <Button
                onClick={() => inputRef.current?.click()}
                disabled={importing}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {importing ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <FileUp className="mr-1.5 h-4 w-4" />
                )}
                Import statement
              </Button>
            </>
          ) : null
        }
      />

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

      {/* --- import preview: nothing is written until this is confirmed --- */}
      {preview ? (
        <Panel className="p-4">
          <h2 className="text-sm font-semibold text-foreground">
            {file?.name}
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            <Stat label="Transactions read" value={String(preview.summary.parsed)} />
            <Stat label="New" value={String(preview.wouldImport)} tone="good" />
            <Stat
              label="Already held"
              value={String(preview.duplicates)}
              hint="Overlapping export — skipped"
            />
            <Stat label="Money in" value={money(preview.summary.totalIn)} tone="good" />
          </div>
          {preview.summary.dateFrom ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {preview.summary.dateFrom} to {preview.summary.dateTo} · dates read as{" "}
              {preview.summary.dateOrder === "dmy"
                ? "day/month"
                : preview.summary.dateOrder === "mdy"
                  ? "month/day"
                  : "ISO"}
            </p>
          ) : null}

          {preview.summary.warnings.length ? (
            <div className="mt-3 space-y-1.5">
              {preview.summary.warnings.slice(0, 4).map((w, i) => (
                <p key={i} className="flex items-start gap-1.5 text-xs text-amber-700">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {w.detail}
                </p>
              ))}
            </div>
          ) : null}

          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setPreview(null);
                setFile(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
              disabled={importing}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void commitImport()}
              disabled={importing || preview.wouldImport === 0}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {importing ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-1.5 h-4 w-4" />
              )}
              Import {preview.wouldImport}
            </Button>
          </div>
        </Panel>
      ) : null}

      {/* --- the queue --- */}
      <Panel className="p-0">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : queue.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="font-medium text-foreground">Nothing waiting</p>
            <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
              Every deposit imported so far has been receipted. Import a bank statement
              to bring in more.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-hairline">
            {queue.map((line) => {
              const top = line.candidates[0];
              const picked = chosen[line.id];
              const busy = busyLine === line.id;

              return (
                <li key={line.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 basis-[22rem]">
                      <p className="text-sm font-medium text-foreground">
                        {money(line.amount)}
                        <span className="ml-2 font-normal text-muted-foreground">
                          {line.date}
                        </span>
                      </p>
                      <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                        {line.description}
                        {line.reference ? ` · ${line.reference}` : ""}
                      </p>

                      {top ? (
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <Badge variant={line.autoPostable ? "default" : "secondary"}>
                            {top.clientName}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {top.reasons.join(" · ")}
                          </span>
                        </div>
                      ) : (
                        <p className="mt-1.5 text-xs text-amber-700">
                          No client could be identified from this narration.
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {/* A clear winner gets one click. Everything else has to be
                          chosen explicitly — see the file header. */}
                      {line.autoPostable && top ? (
                        <Button
                          disabled={busy || !canEdit}
                          onClick={() => void confirmMatch(line, top.clientId)}
                          className="bg-primary text-primary-foreground hover:bg-primary/90"
                        >
                          {busy ? (
                            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="mr-1.5 h-4 w-4" />
                          )}
                          Confirm
                        </Button>
                      ) : (
                        <>
                          <div className="w-[15rem]">
                            <ClientPicker
                              value={picked?.id ?? top?.clientId ?? null}
                              placeholder="Choose client"
                              disabled={busy || !canEdit}
                              onChange={(c) =>
                                setChosen((prev) => ({
                                  ...prev,
                                  [line.id]: c ? { id: c.id, name: c.name } : { id: "", name: "" },
                                }))
                              }
                            />
                          </div>
                          <Button
                            variant="outline"
                            disabled={
                              busy || !canEdit || !(picked?.id || top?.clientId)
                            }
                            onClick={() =>
                              void confirmMatch(line, picked?.id || top?.clientId || "")
                            }
                          >
                            {busy ? (
                              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="mr-1.5 h-4 w-4" />
                            )}
                            Receipt
                          </Button>
                        </>
                      )}

                      <Button
                        variant="ghost"
                        disabled={busy || !canEdit}
                        title="Not client money — a supplier payment, transfer or bank charge"
                        onClick={() => void ignore(line)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </PageShell>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "good";
}) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-lg font-semibold tabular-nums",
          tone === "good" ? "text-emerald-700" : "text-foreground"
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
