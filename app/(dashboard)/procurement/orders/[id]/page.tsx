"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { PageShell, Panel, AlertBanner } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PO_FLOW,
  fmtMoney,
  poStatusMeta,
  type PurchaseOrder,
  type PurchaseOrderLine,
  type Supplier,
} from "@/lib/procurement/constants";
import {
  ChevronLeft,
  Clock,
  Loader2,
  Mail,
  PackageCheck,
  Phone,
  Plus,
  Send,
  Trash2,
  XCircle,
} from "lucide-react";

export default function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { accessToken, can } = useAuth();
  const canEdit = can("procurement", "edit");

  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [lines, setLines] = useState<PurchaseOrderLine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // New-line draft (draft POs only)
  const [newDesc, setNewDesc] = useState("");
  const [newQty, setNewQty] = useState("1");
  const [newPrice, setNewPrice] = useState("0");

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/procurement?id=${id}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load purchase order");
      setPo(body.po);
      setSupplier(body.supplier);
      setLines(body.lines ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load purchase order");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, id]);

  useEffect(() => {
    void load();
  }, [load]);

  const post = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!accessToken) return;
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/procurement", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(payload),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? "Request failed");
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Request failed");
      } finally {
        setBusy(false);
      }
    },
    [accessToken, load]
  );

  if (isLoading && !po) {
    return (
      <PageShell>
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      </PageShell>
    );
  }

  if (!po) {
    return (
      <PageShell>
        {error ? <AlertBanner tone="danger">{error}</AlertBanner> : null}
        <p className="text-sm">Purchase order not found.</p>
        <Link href="/procurement/orders" className="text-sm text-primary hover:underline">
          ← Back to orders
        </Link>
      </PageShell>
    );
  }

  const s = poStatusMeta(po.status);
  const isDraft = po.status === "draft";
  const isReceiving = po.status === "ordered" || po.status === "partially_received";
  const isClosed = po.status === "received" || po.status === "cancelled";
  const receivedCount = lines.filter((l) => l.qty_received >= l.qty_ordered).length;

  const addLine = () => {
    if (!newDesc.trim()) return;
    void post({
      action: "addLine",
      poId: po.id,
      description: newDesc,
      qtyOrdered: Number(newQty) || 1,
      unitPrice: Number(newPrice) || 0,
    });
    setNewDesc("");
    setNewQty("1");
    setNewPrice("0");
  };

  return (
    <PageShell>
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-border pb-4">
        <Link
          href="/procurement/orders"
          className="inline-flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> All orders
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-lg font-semibold tracking-tight">{po.po_number}</h1>
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
                style={{ background: `${s.color}1a`, color: s.color }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
                {s.label}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {supplier?.name ?? "Unknown supplier"}
              {po.expected_at
                ? ` · expected ${new Date(po.expected_at).toLocaleDateString("en-ZA", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}`
                : ""}
            </p>
          </div>

          {canEdit ? (
            <div className="flex flex-wrap items-center gap-2">
              {isDraft ? (
                <Button
                  disabled={busy || lines.length === 0}
                  onClick={() => void post({ action: "setPOStatus", poId: po.id, status: "ordered" })}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Send className="h-3.5 w-3.5" /> Mark as ordered
                </Button>
              ) : null}
              {isReceiving ? (
                <Button
                  disabled={busy}
                  onClick={() => void post({ action: "receiveAll", poId: po.id })}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <PackageCheck className="h-3.5 w-3.5" /> Receive all
                </Button>
              ) : null}
              {!isClosed ? (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void post({ action: "setPOStatus", poId: po.id, status: "cancelled" })}
                >
                  <XCircle className="h-3.5 w-3.5" /> Cancel
                </Button>
              ) : (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void post({ action: "setPOStatus", poId: po.id, status: "draft" })}
                >
                  Reopen as draft
                </Button>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {error ? <AlertBanner tone="danger">{error}</AlertBanner> : null}

      {/* Progress hint */}
      {isReceiving ? (
        <AlertBanner tone="info">
          <PackageCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">
            {receivedCount} of {lines.length} line{lines.length === 1 ? "" : "s"} fully received.
            Enter received quantities below as stock arrives.
          </span>
        </AlertBanner>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Lines */}
        <div className="lg:col-span-2">
          <Panel title="Line items" padded={false}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Description</th>
                    <th className="px-4 py-2 text-right font-medium">Qty</th>
                    <th className="px-4 py-2 text-right font-medium">Unit</th>
                    <th className="px-4 py-2 text-right font-medium">Total</th>
                    {isReceiving ? (
                      <th className="px-4 py-2 text-right font-medium">Received</th>
                    ) : null}
                    {isDraft && canEdit ? <th className="px-4 py-2" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {lines.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">
                        No line items yet.
                      </td>
                    </tr>
                  ) : (
                    lines.map((l) => (
                      <tr key={l.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-2.5">{l.description || "Item"}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{l.qty_ordered}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                          {fmtMoney(Number(l.unit_price), po.currency)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {fmtMoney(l.qty_ordered * Number(l.unit_price), po.currency)}
                        </td>
                        {isReceiving ? (
                          <td className="px-4 py-2 text-right">
                            {canEdit ? (
                              <input
                                type="number"
                                min={0}
                                max={l.qty_ordered}
                                defaultValue={l.qty_received}
                                onBlur={(e) => {
                                  const v = Math.max(
                                    0,
                                    Math.min(Number(e.target.value) || 0, l.qty_ordered)
                                  );
                                  if (v !== l.qty_received) {
                                    void post({
                                      action: "receiveLine",
                                      lineId: l.id,
                                      qtyReceived: v,
                                    });
                                  }
                                }}
                                className="h-8 w-16 rounded-md border border-border bg-background px-2 text-right text-sm tabular-nums outline-none focus:border-primary"
                              />
                            ) : (
                              <span className="tabular-nums">
                                {l.qty_received}/{l.qty_ordered}
                              </span>
                            )}
                          </td>
                        ) : null}
                        {isDraft && canEdit ? (
                          <td className="px-4 py-2.5 text-right">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              disabled={busy}
                              onClick={() =>
                                void post({ action: "deleteLine", lineId: l.id, poId: po.id })
                              }
                              title="Remove line"
                            >
                              <Trash2 className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </td>
                        ) : null}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Add line (draft only) */}
            {isDraft && canEdit ? (
              <div className="flex flex-wrap items-center gap-2 border-t border-border p-3">
                <Input
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Add a line item…"
                  className="min-w-[160px] flex-1"
                  onKeyDown={(e) => e.key === "Enter" && addLine()}
                />
                <Input
                  type="number"
                  min={1}
                  value={newQty}
                  onChange={(e) => setNewQty(e.target.value)}
                  className="w-16"
                  title="Quantity"
                />
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                  className="w-24"
                  title="Unit price"
                />
                <Button variant="outline" size="sm" disabled={busy || !newDesc.trim()} onClick={addLine}>
                  <Plus className="h-3.5 w-3.5" /> Add
                </Button>
              </div>
            ) : null}

            {/* Totals */}
            <div className="border-t border-border px-4 py-3">
              <dl className="ml-auto max-w-xs space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd className="tabular-nums">{fmtMoney(Number(po.subtotal), po.currency)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">
                    VAT ({Math.round(Number(po.vat_rate) * 100)}%)
                  </dt>
                  <dd className="tabular-nums">{fmtMoney(Number(po.vat), po.currency)}</dd>
                </div>
                <div className="flex justify-between border-t border-border pt-1 font-semibold">
                  <dt>Total</dt>
                  <dd className="tabular-nums">{fmtMoney(Number(po.total), po.currency)}</dd>
                </div>
              </dl>
            </div>
          </Panel>
        </div>

        {/* Supplier + meta */}
        <div className="space-y-4">
          <Panel title="Supplier">
            {supplier ? (
              <div className="space-y-1.5 text-sm">
                <p className="font-medium">{supplier.name}</p>
                {supplier.contact_name ? (
                  <p className="text-muted-foreground">{supplier.contact_name}</p>
                ) : null}
                {supplier.email ? (
                  <p className="flex items-center gap-1.5 text-muted-foreground">
                    <Mail className="h-3.5 w-3.5" /> {supplier.email}
                  </p>
                ) : null}
                {supplier.phone ? (
                  <p className="flex items-center gap-1.5 text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" /> {supplier.phone}
                  </p>
                ) : null}
                <p className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" /> {supplier.lead_time_days}-day lead time
                </p>
                <Link
                  href="/procurement/suppliers"
                  className="mt-1 inline-block text-xs text-primary hover:underline"
                >
                  View suppliers
                </Link>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Supplier unavailable.</p>
            )}
          </Panel>

          <Panel title="Workflow">
            <ol className="space-y-2 text-sm">
              {PO_FLOW.map((step) => {
                const meta = poStatusMeta(step);
                const currentIndex = PO_FLOW.indexOf(po.status as (typeof PO_FLOW)[number]);
                const stepIndex = PO_FLOW.indexOf(step);
                const done = po.status !== "cancelled" && currentIndex >= stepIndex && currentIndex >= 0;
                const active = po.status === step;
                return (
                  <li key={step} className="flex items-center gap-2">
                    <span
                      className="flex h-4 w-4 items-center justify-center rounded-full text-[10px]"
                      style={{
                        background: done ? meta.color : "transparent",
                        border: done ? "none" : "1px solid var(--border)",
                      }}
                    >
                      {done ? <span className="text-white">✓</span> : null}
                    </span>
                    <span className={active ? "font-medium" : "text-muted-foreground"}>
                      {meta.label}
                    </span>
                  </li>
                );
              })}
              {po.status === "cancelled" ? (
                <li className="flex items-center gap-2 text-muted-foreground">
                  <XCircle className="h-4 w-4" /> Cancelled
                </li>
              ) : null}
            </ol>
            {po.notes ? (
              <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
                {po.notes}
              </p>
            ) : null}
          </Panel>
        </div>
      </div>
    </PageShell>
  );
}
