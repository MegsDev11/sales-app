"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, PageShell, Panel, AlertBanner } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ClientPicker } from "@/components/clients/client-picker";
import { ProjectPicker } from "@/components/projects/project-picker";
import { CheckCircle2, FileText, Loader2, Plus, Send, Trash2, XCircle } from "lucide-react";

/**
 * Quotes — numbered, sendable, convertible records (migration 068).
 *
 * The lifecycle mirrors how the office actually works: draft it, email the
 * QUOTATION PDF from the clerk's own mailbox, mark the client's answer, and on
 * acceptance convert it into a real project invoice — same number series and
 * AR ledger as the monthly billing, so ageing and statements just see it.
 */

interface QuoteRow {
  id: string;
  quote_number: string;
  client_id: string | null;
  client_name: string;
  client_email: string;
  project_id: string | null;
  quote_date: string;
  valid_until: string | null;
  total_incl: number | string;
  status: string;
  sent_at: string | null;
  invoice_id: string | null;
  notes: string;
}

interface LineDraft {
  description: string;
  qty: string;
  unitPriceIncl: string;
  discountPct: string;
}

const EMPTY_LINE: LineDraft = { description: "", qty: "1", unitPriceIncl: "", discountPct: "" };

const money = (n: number | string) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(Number(n));

const day = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })
    : "—";

const STATUS_TONE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-sky-100 text-sky-800",
  accepted: "bg-emerald-100 text-emerald-800",
  declined: "bg-red-100 text-red-800",
  expired: "bg-amber-100 text-amber-800",
};

export default function AccountsQuotesPage() {
  const { accessToken } = useAuth();
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [projectId, setProjectId] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([{ ...EMPTY_LINE }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Deep link from a project's Quotes panel: /accounts/quotes?id=<quote>
    const id = new URLSearchParams(window.location.search).get("id");
    if (id) setHighlightId(id);
  }, []);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const res = await fetch("/api/accounts/quotes", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load quotes");
      setQuotes(json.quotes ?? []);
      setCanEdit(Boolean(json.canEdit));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load quotes");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const post = useCallback(
    async (payload: Record<string, unknown>, busyKey: string): Promise<boolean> => {
      if (!accessToken) return false;
      setBusyId(busyKey);
      setError(null);
      setNotice(null);
      try {
        const res = await fetch("/api/accounts/quotes", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Request failed");
        await load();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Request failed");
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [accessToken, load]
  );

  const openPdf = useCallback(
    async (quoteId: string) => {
      if (!accessToken) return;
      try {
        const res = await fetch(`/api/accounts/quotes?id=${encodeURIComponent(quoteId)}&pdf=1`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error ?? "Could not build the PDF");
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank", "noopener");
        // The new tab has its own copy by now; holding the object alive leaks
        // the whole PDF for the life of the page.
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not open the PDF");
      }
    },
    [accessToken]
  );

  const createTotal = useMemo(
    () =>
      lines.reduce((sum, l) => {
        const qty = Number(l.qty) || 0;
        const unit = Number(l.unitPriceIncl) || 0;
        const disc = Math.min(100, Math.max(0, Number(l.discountPct) || 0));
        return sum + qty * unit * (1 - disc / 100);
      }, 0),
    [lines]
  );

  async function createQuote() {
    setSaving(true);
    const ok = await post(
      {
        action: "create",
        clientId: clientId || null,
        clientName,
        clientEmail,
        projectId: projectId || null,
        validUntil: validUntil || null,
        notes,
        lines: lines.map((l) => ({
          description: l.description,
          qty: Number(l.qty) || 0,
          unitPriceIncl: Number(l.unitPriceIncl) || 0,
          discountPct: Number(l.discountPct) || 0,
        })),
      },
      "create"
    );
    setSaving(false);
    if (ok) {
      setCreateOpen(false);
      setClientId("");
      setClientName("");
      setClientEmail("");
      setProjectId("");
      setValidUntil("");
      setNotes("");
      setLines([{ ...EMPTY_LINE }]);
      setNotice("Quote created as a draft — open its PDF or send it when ready.");
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="Quotes"
        description="Numbered quotations with a lifecycle: draft, send from the clerk's mailbox, accept, convert to a project invoice."
        actions={
          canEdit ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> New quote
            </Button>
          ) : null
        }
      />

      {error ? <AlertBanner tone="danger">{error}</AlertBanner> : null}
      {notice ? <AlertBanner tone="info">{notice}</AlertBanner> : null}

      <Panel padded={false} title={loading ? "Loading…" : `${quotes.length} quotes`}>
        {quotes.length === 0 && !loading ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            No quotes yet. A quote can stand alone, belong to a client on the book, or hang
            off a project — and converts to a real invoice when accepted.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Quote</th>
                  <th className="px-4 py-2 font-medium">Client</th>
                  <th className="px-4 py-2 font-medium">Dates</th>
                  <th className="px-4 py-2 text-right font-medium">Total</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => {
                  const busy = busyId !== null;
                  return (
                    <tr
                      key={q.id}
                      className={`border-b border-border align-top last:border-0 ${
                        highlightId === q.id ? "bg-primary/5" : ""
                      }`}
                    >
                      <td className="px-4 py-2.5">
                        <span className="font-medium">{q.quote_number}</span>
                        {q.project_id ? (
                          <span className="block text-xs text-muted-foreground">on a project</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5">
                        {q.client_name}
                        {q.client_email ? (
                          <span className="block text-xs text-muted-foreground">
                            {q.client_email}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {day(q.quote_date)}
                        {q.valid_until ? ` · valid until ${day(q.valid_until)}` : ""}
                        {q.sent_at ? ` · sent ${day(q.sent_at)}` : ""}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                        {money(q.total_incl)}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge
                          className={STATUS_TONE[q.status] ?? ""}
                          variant="secondary"
                        >
                          {q.invoice_id ? "invoiced" : q.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <Button size="xs" variant="ghost" onClick={() => void openPdf(q.id)}>
                            <FileText className="mr-1 h-3.5 w-3.5" /> PDF
                          </Button>
                          {canEdit && !q.invoice_id ? (
                            <>
                              <Button
                                size="xs"
                                variant="outline"
                                disabled={busy || !q.client_email}
                                title={q.client_email ? undefined : "No email on the quote"}
                                onClick={() => void post({ action: "send", quoteId: q.id }, q.id)}
                              >
                                {busyId === q.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <>
                                    <Send className="mr-1 h-3.5 w-3.5" /> Send
                                  </>
                                )}
                              </Button>
                              {q.status !== "accepted" ? (
                                <Button
                                  size="xs"
                                  variant="outline"
                                  disabled={busy}
                                  onClick={() =>
                                    void post(
                                      { action: "setStatus", quoteId: q.id, status: "accepted" },
                                      q.id
                                    )
                                  }
                                >
                                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Accept
                                </Button>
                              ) : (
                                <Button
                                  size="xs"
                                  disabled={busy}
                                  onClick={() => void post({ action: "convert", quoteId: q.id }, q.id)}
                                >
                                  Convert to invoice
                                </Button>
                              )}
                              {q.status === "sent" ? (
                                <Button
                                  size="xs"
                                  variant="ghost"
                                  disabled={busy}
                                  onClick={() =>
                                    void post(
                                      { action: "setStatus", quoteId: q.id, status: "declined" },
                                      q.id
                                    )
                                  }
                                >
                                  <XCircle className="mr-1 h-3.5 w-3.5" /> Declined
                                </Button>
                              ) : null}
                              {q.status === "draft" ? (
                                <Button
                                  size="xs"
                                  variant="ghost"
                                  disabled={busy}
                                  onClick={() => void post({ action: "delete", quoteId: q.id }, q.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              ) : null}
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Dialog open={createOpen} onOpenChange={(open) => !open && setCreateOpen(false)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New quote</DialogTitle>
          </DialogHeader>
          {/* Repeated inside the dialog: the page-level banner sits behind the
              overlay, so a failed save would look like nothing happened. */}
          {error && createOpen ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}
          <div className="space-y-3 text-sm">
            <div className="space-y-1">
              <label className="font-medium">Client</label>
              <ClientPicker
                value={clientId || null}
                onChange={(client) => {
                  setClientId(client?.id ?? "");
                  setClientName(client?.name ?? "");
                }}
              />
              <Input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="…or type a prospect's name"
              />
              <Input
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                placeholder="Email for sending (optional)"
                type="email"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-medium">Project (optional)</label>
                <ProjectPicker value={projectId} onChange={setProjectId} />
              </div>
              <div className="space-y-1">
                <label className="font-medium">Valid until</label>
                <Input
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="font-medium">Lines (prices VAT inclusive)</label>
              {lines.map((line, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-1.5">
                  <Input
                    value={line.description}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((l, i) => (i === idx ? { ...l, description: e.target.value } : l))
                      )
                    }
                    placeholder="Description"
                    className="min-w-52 flex-1"
                  />
                  <Input
                    value={line.qty}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((l, i) => (i === idx ? { ...l, qty: e.target.value } : l))
                      )
                    }
                    placeholder="Qty"
                    type="number"
                    className="w-20"
                  />
                  <Input
                    value={line.unitPriceIncl}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((l, i) =>
                          i === idx ? { ...l, unitPriceIncl: e.target.value } : l
                        )
                      )
                    }
                    placeholder="Unit R"
                    type="number"
                    className="w-28"
                  />
                  <Input
                    value={line.discountPct}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((l, i) => (i === idx ? { ...l, discountPct: e.target.value } : l))
                      )
                    }
                    placeholder="Disc %"
                    type="number"
                    className="w-20"
                  />
                  {lines.length > 1 ? (
                    <button
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                      aria-label="Remove line"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              ))}
              <div className="flex items-center justify-between">
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => setLines((prev) => [...prev, { ...EMPTY_LINE }])}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add line
                </Button>
                <span className="text-sm">
                  Total <span className="font-semibold tabular-nums">{money(createTotal)}</span>
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-medium">Notes (internal)</label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                saving ||
                !clientName.trim() ||
                !lines.some((l) => l.description.trim() && Number(l.qty) > 0)
              }
              onClick={() => void createQuote()}
            >
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Create draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
