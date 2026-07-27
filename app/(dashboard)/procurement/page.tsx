"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PageHeader, PageShell, Panel, AlertBanner } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { StatTile } from "@/components/charts/primitives";
import { SERIES, STATUS } from "@/components/charts/tokens";
import { useProcurement } from "@/lib/procurement/use-procurement";
import {
  fmtMoney,
  poStatusMeta,
  type ReorderAlert,
} from "@/lib/procurement/constants";
import { SupplierFormDialog } from "@/components/procurement/supplier-form-dialog";
import { PoFormDialog, type DraftLine } from "@/components/procurement/po-form-dialog";
import {
  AlertTriangle,
  ClipboardList,
  Loader2,
  PackageCheck,
  Plus,
  ShoppingCart,
  Truck,
  Users,
} from "lucide-react";

export default function ProcurementOverviewPage() {
  const { suppliers, purchaseOrders, alerts, canEdit, isLoading, error, reload, post } =
    useProcurement();

  const [supplierOpen, setSupplierOpen] = useState(false);
  const [poOpen, setPoOpen] = useState(false);
  const [poPrefill, setPoPrefill] = useState<{ supplierId: string; lines: DraftLine[] } | null>(
    null
  );

  const supplierName = useMemo(() => {
    const map = new Map(suppliers.map((s) => [s.id, s.name]));
    return (id: string) => map.get(id) ?? "Unknown supplier";
  }, [suppliers]);

  const stats = useMemo(() => {
    const activeSuppliers = suppliers.filter((s) => s.active).length;
    const open = purchaseOrders.filter((p) =>
      ["draft", "ordered", "partially_received"].includes(p.status)
    );
    const awaiting = purchaseOrders.filter((p) =>
      ["ordered", "partially_received"].includes(p.status)
    );
    const committed = awaiting.reduce((n, p) => n + Number(p.total ?? 0), 0);
    return { activeSuppliers, open: open.length, awaiting: awaiting.length, committed };
  }, [suppliers, purchaseOrders]);

  const recentPOs = purchaseOrders.slice(0, 8);

  const draftFromAlert = (a: ReorderAlert) => {
    setPoPrefill({
      supplierId: a.preferred_supplier_id ?? "",
      lines: [
        {
          description: a.name,
          qtyOrdered: a.reorder_qty > 0 ? a.reorder_qty : Math.max(1, a.reorder_point - a.on_hand),
          unitPrice: a.unit_cost ?? 0,
          productId: a.kind === "product" ? a.id : null,
          sundryId: a.kind === "sundry" ? a.id : null,
        },
      ],
    });
    setPoOpen(true);
  };

  return (
    <PageShell>
      <PageHeader
        title="Procurement"
        description="Suppliers, purchase orders and low-stock reorder alerts"
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/procurement/suppliers">
              <Button variant="outline">
                <Users className="mr-1.5 h-4 w-4" /> Suppliers
              </Button>
            </Link>
            <Link href="/procurement/orders">
              <Button variant="outline">
                <ClipboardList className="mr-1.5 h-4 w-4" /> Orders
              </Button>
            </Link>
            {canEdit ? (
              <Button
                onClick={() => {
                  setPoPrefill(null);
                  setPoOpen(true);
                }}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="mr-1.5 h-4 w-4" /> New PO
              </Button>
            ) : null}
          </div>
        }
      />

      {error ? <AlertBanner tone="danger">{error}</AlertBanner> : null}

      {alerts.length > 0 ? (
        <AlertBanner tone="warn">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">
            {alerts.length} item{alerts.length === 1 ? " is" : "s are"} at or below the reorder
            point.
          </span>
        </AlertBanner>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Active suppliers"
          value={stats.activeSuppliers}
          icon={Users}
          accent={SERIES[0]}
          href="/procurement/suppliers"
        />
        <StatTile
          label="Open purchase orders"
          value={stats.open}
          icon={ShoppingCart}
          accent={SERIES[3]}
          href="/procurement/orders"
        />
        <StatTile
          label="Awaiting delivery"
          value={stats.awaiting}
          icon={Truck}
          accent={SERIES[6]}
        />
        <StatTile
          label="Committed spend"
          value={stats.committed}
          currency
          icon={PackageCheck}
          accent={SERIES[2]}
        />
      </div>

      <Panel
        title="Reorder alerts"
        description="On-hand at or below the reorder point. Set points on stock products and sundries to populate this."
        padded={false}
        actions={isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
      >
        {alerts.length === 0 ? (
          <div className="py-10 text-center">
            <PackageCheck className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {isLoading ? "Checking stock levels…" : "Nothing needs reordering right now."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Item</th>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 text-right font-medium">On hand</th>
                  <th className="px-4 py-2 text-right font-medium">Point</th>
                  <th className="px-4 py-2 text-right font-medium">On order</th>
                  <th className="px-4 py-2 text-right font-medium">Suggested</th>
                  {canEdit ? <th className="px-4 py-2" /> : null}
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => {
                  const suggested =
                    a.reorder_qty > 0 ? a.reorder_qty : Math.max(1, a.reorder_point - a.on_hand);
                  const covered = a.on_order >= a.reorder_point - a.on_hand;
                  return (
                    <tr key={`${a.kind}-${a.id}`} className="border-b border-border last:border-0">
                      <td className="px-4 py-2.5 font-medium">{a.name}</td>
                      <td className="px-4 py-2.5 text-muted-foreground capitalize">{a.kind}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        <span style={{ color: a.on_hand === 0 ? STATUS.critical : undefined }}>
                          {a.on_hand}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                        {a.reorder_point}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {a.on_order > 0 ? (
                          <span style={{ color: covered ? STATUS.good : undefined }}>
                            {a.on_order}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium tabular-nums">{suggested}</td>
                      {canEdit ? (
                        <td className="px-4 py-2.5 text-right">
                          <Button size="xs" variant="outline" onClick={() => draftFromAlert(a)}>
                            Draft PO
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel
        title="Recent purchase orders"
        padded={false}
        actions={
          <Link href="/procurement/orders" className="text-xs text-primary hover:underline">
            View all
          </Link>
        }
      >
        {recentPOs.length === 0 ? (
          <div className="py-10 text-center">
            <ShoppingCart className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No purchase orders yet.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {recentPOs.map((po) => {
              const s = poStatusMeta(po.status);
              return (
                <li key={po.id}>
                  <Link
                    href={`/procurement/orders/${po.id}`}
                    className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
                  >
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: s.color }}
                    />
                    <span className="font-mono text-xs text-muted-foreground">{po.po_number}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {supplierName(po.supplier_id)}
                    </span>
                    <span className="text-xs text-muted-foreground">{s.label}</span>
                    <span className="w-24 text-right text-sm tabular-nums">
                      {fmtMoney(Number(po.total ?? 0), po.currency)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {supplierOpen ? (
        <SupplierFormDialog
          open={supplierOpen}
          onClose={() => setSupplierOpen(false)}
          onSaved={() => {
            setSupplierOpen(false);
            void reload();
          }}
          supplier={null}
          post={post}
        />
      ) : null}

      {poOpen ? (
        <PoFormDialog
          open={poOpen}
          onClose={() => setPoOpen(false)}
          onCreated={() => {
            setPoOpen(false);
            void reload();
          }}
          suppliers={suppliers}
          post={post}
          initialSupplierId={poPrefill?.supplierId ?? ""}
          initialLines={poPrefill?.lines}
        />
      ) : null}
    </PageShell>
  );
}
