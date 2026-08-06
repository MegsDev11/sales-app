"use client";

import { useCallback, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertBanner } from "@/components/layout/page-shell";
import {
  BILLING_STATUSES,
  ISSUE_LABELS,
  isBillable,
  statusLabel,
  type ClientImportSummary,
  type ClientIssueKind,
} from "@/lib/accounts/constants";
import { CheckCircle2, FileUp, Loader2, Upload } from "lucide-react";

/**
 * Brings the Sage "Megs Kliente lys" export into the client book.
 *
 * Imports run in two steps on purpose. The book is the department's record of who
 * exists and who gets billed, so an upload that silently reclassified 400 accounts
 * would be discovered a month later on a customer's phone call. The first step
 * therefore parses and reports without writing anything: how many clients, how they
 * split by status, how many are actually invoiceable, and how many rows a person
 * needs to look at. Only then is the write offered.
 *
 * Re-importing is safe and expected — clients are matched by name and updated in
 * place, so next month's export refreshes balances rather than duplicating the book.
 */

const money = (value: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(value);

interface DryRunResult {
  summary: ClientImportSummary;
}

interface CommitResult {
  created: number;
  updated: number;
  summary: ClientImportSummary;
}

export function ClientImportDialog({
  open,
  onClose,
  onImported,
  canEdit,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
  canEdit: boolean;
}) {
  const { accessToken } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<DryRunResult | null>(null);
  const [committed, setCommitted] = useState<CommitResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setFile(null);
    setPreview(null);
    setCommitted(null);
    setError(null);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const send = useCallback(
    async (chosen: File, dryRun: boolean) => {
      if (!accessToken) throw new Error("Not signed in");
      const form = new FormData();
      form.append("file", chosen);
      if (dryRun) form.append("dryRun", "1");

      const res = await fetch("/api/accounts/clients", {
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
    async (chosen: File | null) => {
      if (!chosen) return;
      setFile(chosen);
      setPreview(null);
      setCommitted(null);
      setError(null);
      setBusy(true);
      try {
        setPreview(await send(chosen, true));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't read that file");
      } finally {
        setBusy(false);
      }
    },
    [send]
  );

  const commit = useCallback(async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      setCommitted(await send(file, false));
      onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }, [file, send, onImported]);

  const close = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const summary = committed?.summary ?? preview?.summary ?? null;

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? null : close())}>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import clients from Sage</DialogTitle>
        </DialogHeader>

        <p className="text-sm leading-relaxed text-muted-foreground">
          Upload the <span className="font-medium text-foreground">Megs Kliente lys</span>{" "}
          export (.csv or .xlsx). Nothing is written until you confirm, and re-importing
          updates existing clients by name rather than duplicating them.
        </p>

        {error ? <AlertBanner tone="danger">{error}</AlertBanner> : null}

        {/* --- file picker --- */}
        {!committed ? (
          <div className="rounded-lg border border-dashed border-border p-4">
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xls,text/csv"
              className="hidden"
              onChange={(e) => void onPick(e.target.files?.[0] ?? null)}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {file ? file.name : "No file chosen"}
                </p>
                {file ? (
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(0)} KB
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Sage exports this as a semicolon-separated CSV.
                  </p>
                )}
              </div>
              <Button
                variant="outline"
                disabled={busy || !canEdit}
                onClick={() => inputRef.current?.click()}
              >
                {busy && !preview ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <FileUp className="mr-1.5 h-4 w-4" />
                )}
                Choose file
              </Button>
            </div>
          </div>
        ) : null}

        {/* --- what the file contains --- */}
        {summary ? (
          <div className="space-y-4">
            {committed ? (
              <AlertBanner tone="info">
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" />
                  Imported — {committed.created} new client
                  {committed.created === 1 ? "" : "s"}, {committed.updated} updated.
                </span>
              </AlertBanner>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Clients in file" value={summary.parsed.toLocaleString("en-ZA")} />
              <Stat
                label="Ready to invoice"
                value={summary.withPricedPackage.toLocaleString("en-ZA")}
                hint="Active, with an email and a priced package"
                tone="good"
              />
              <Stat
                label="Need a look"
                value={Object.values(summary.issueCounts)
                  .reduce((a, b) => a + b, 0)
                  .toLocaleString("en-ZA")}
                hint="Rows with something unreadable"
                tone="warn"
              />
            </div>

            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                By account status
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {BILLING_STATUSES.filter((s) => summary.byStatus[s.value]).map((s) => (
                  <Badge
                    key={s.value}
                    variant={isBillable(s.value) ? "default" : "secondary"}
                    title={s.blurb}
                  >
                    {statusLabel(s.value)} {summary.byStatus[s.value].toLocaleString("en-ZA")}
                  </Badge>
                ))}
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Only <span className="font-medium text-foreground">Active</span> clients are
                ever invoiced. Anything the importer couldn&apos;t recognise is left as{" "}
                <span className="font-medium text-foreground">Needs review</span> and billed
                to nobody.
              </p>
            </div>

            {Object.keys(summary.issueCounts).length ? (
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Rows needing a person
                </h4>
                <ul className="space-y-1 text-sm">
                  {Object.entries(summary.issueCounts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([kind, count]) => (
                      <li key={kind} className="flex items-baseline justify-between gap-3">
                        <span className="text-muted-foreground">
                          {ISSUE_LABELS[kind as ClientIssueKind] ?? kind}
                        </span>
                        <span className="font-medium tabular-nums text-foreground">
                          {count.toLocaleString("en-ZA")}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <Stat label="Owed to MEGS" value={money(summary.totalOwing)} tone="warn" />
              <Stat label="In credit" value={money(summary.totalCredit)} />
            </div>

            {summary.duplicateNames.length ? (
              <AlertBanner tone="warn">
                {summary.duplicateNames.length} name
                {summary.duplicateNames.length === 1 ? " appears" : "s appear"} more than once
                in the file; the last row of each wins.
              </AlertBanner>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button variant="outline" onClick={close} disabled={busy}>
            {committed ? "Done" : "Cancel"}
          </Button>
          {preview && !committed ? (
            <Button
              onClick={() => void commit()}
              disabled={busy || !canEdit}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {busy ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-1.5 h-4 w-4" />
              )}
              Import {summary?.parsed.toLocaleString("en-ZA")} clients
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
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
  tone?: "good" | "warn";
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-elevated px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={
          tone === "good"
            ? "text-lg font-semibold tabular-nums text-emerald-700"
            : tone === "warn"
              ? "text-lg font-semibold tabular-nums text-amber-700"
              : "text-lg font-semibold tabular-nums text-foreground"
        }
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
