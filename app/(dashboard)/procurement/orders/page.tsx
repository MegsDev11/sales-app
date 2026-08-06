"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PageHeader, PageShell, Panel, AlertBanner } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProcurement } from "@/lib/procurement/use-procurement";
import { PO_STATUSES, fmtMoney, poStatusMeta } from "@/lib/procurement/constants";
import { PoFormDialog } from "@/components/procurement/po-form-dialog";
import { ChevronLeft, ClipboardList, Loader2, Plus, Search } from "lucide-react";

export default function OrdersPage() {
  const { suppliers, purchaseOrders, canEdit, isLoading, error, reload, post } = useProcurement();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);

  const supplierName = useMemo(() => {
    const map = new Map(suppliers.map((s) => [s.id, s.name]));
    return (id: string) => map.get(id) ?? "Unknown supplier";
  }, [suppliers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return purchaseOrders.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (q && !`${p.po_number} ${supplierName(p.supplier_id)} ${p.notes}`.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [purchaseOrders, search, statusFilter, supplierName]);

  return (
    <PageShell>
      <PageHeader
        title="Purchase orders"
        description="Track what is on order, from draft through to received"
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/procurement">
              <Button variant="outline">
                <ChevronLeft className="mr-1 h-4 w-4" /> Procurement
              </Button>
            </Link>
            {canEdit ? (
              <Button
                onClick={() => setDialogOpen(true)}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="mr-1.5 h-4 w-4" /> New PO
              </Button>
            ) : null}
          </div>
        }
      />

      {error ? <AlertBanner tone="danger">{error}</AlertBanner> : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by PO number or supplier…"
            className="pl-8"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 rounded-md border border-border bg-card px-2 text-sm"
        >
          <option value="all">Any status</option>
          {PO_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
      </div>

      <Panel title={`${filtered.length} order${filtered.length === 1 ? "" : "s"}`} padded={false}>
        {filtered.length === 0 ? (
          <div className="py-10 text-center">
            <ClipboardList className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {purchaseOrders.length === 0
                ? "No purchase orders yet."
                : "No orders match those filters."}
            </p>
            {canEdit && purchaseOrders.length === 0 ? (
              <Button variant="outline" className="mt-3" onClick={() => setDialogOpen(true)}>
                Create the first one
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">PO</th>
                  <th className="px-4 py-2 font-medium">Supplier</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Expected</th>
                  <th className="px-4 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((po) => {
                  const s = poStatusMeta(po.status);
                  return (
                    <tr key={po.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/procurement/orders/${po.id}`}
                          className="font-mono text-xs font-medium text-primary hover:underline"
                        >
                          {po.po_number}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/procurement/orders/${po.id}`}
                          className="block max-w-[240px] truncate hover:underline"
                        >
                          {supplierName(po.supplier_id)}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs"
                          style={{ background: `${s.color}1a`, color: s.color }}
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ background: s.color }}
                          />
                          {s.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {po.expected_at
                          ? new Date(po.expected_at).toLocaleDateString("en-ZA", {
                              day: "numeric",
                              month: "short",
                            })
                          : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {fmtMoney(Number(po.total ?? 0), po.currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {dialogOpen ? (
        <PoFormDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onCreated={() => {
            setDialogOpen(false);
            void reload();
          }}
          suppliers={suppliers}
          post={post}
        />
      ) : null}
    </PageShell>
  );
}
