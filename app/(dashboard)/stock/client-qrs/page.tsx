"use client";

import { PageHeader, PageShell } from "@/components/layout/page-shell";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStockAccess } from "@/lib/hooks/use-stock-access";
import { useStockStore } from "@/lib/store/stock-store";
import type { StockItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Printer } from "lucide-react";
import { EditUnitDialog, QrPreviewCard, VisitHistoryDialog } from "@/components/stock/qr-unit-cards";

function isClientUnit(item: StockItem) {
  return Boolean(
    item.clientName || item.clientAddress || item.clientPppoe || item.wifiName || item.wifiPassword
  );
}

export default function ClientQrsPage() {
  const { allowed, isLoading } = useStockAccess();
  const { products, items, isLoaded, error, regenerateClientPin } = useStockStore();

  const [query, setQuery] = useState("");
  const [filterProduct, setFilterProduct] = useState("all");
  const [editing, setEditing] = useState<StockItem | null>(null);
  const [visitItem, setVisitItem] = useState<StockItem | null>(null);
  const [pinMsgs, setPinMsgs] = useState<Record<string, string>>({});
  const [busyPin, setBusyPin] = useState<string | null>(null);

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const editingLive = editing ? items.find((i) => i.id === editing.id) ?? editing : null;

  const clientUnits = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (!isClientUnit(item)) return false;
      if (filterProduct !== "all" && item.productId !== filterProduct) return false;
      if (!q) return true;
      const product = productMap.get(item.productId);
      const hay = [
        item.clientName,
        item.clientAddress,
        item.clientPppoe,
        item.wifiName,
        item.brand,
        item.deviceName,
        item.serialNumber,
        item.qrToken,
        product?.name,
        product?.sku,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [items, query, filterProduct, productMap]);

  if (isLoading || !allowed) return null;

  async function handleRegeneratePin(item: StockItem) {
    if (!window.confirm("Generate a new client PIN? The old PIN will stop working.")) return;
    setBusyPin(item.id);
    try {
      const pin = await regenerateClientPin(item.id);
      setPinMsgs((prev) => ({
        ...prev,
        [item.id]: `New client PIN: ${pin} — give this to the client`,
      }));
    } catch (e) {
      setPinMsgs((prev) => ({
        ...prev,
        [item.id]: e instanceof Error ? e.message : "PIN reset failed",
      }));
    } finally {
      setBusyPin(null);
    }
  }

  return (
    <PageShell>
      <PageHeader
        className="print:hidden"
        title="Client QRs"
        description="All generated client installation QR codes — search by client, PPPoE, WiFi, or serial"
        actions={
          <Button
            type="button"
            variant="outline"
            onClick={() => window.print()}
            disabled={clientUnits.length === 0}
          >
            <Printer className="mr-1 h-4 w-4" />
            Print labels
          </Button>
        }
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 print:hidden">
          {error}
        </div>
      )}

      <div className="space-y-3 print:hidden">
        <div className="flex flex-wrap gap-3">
          <Input
            className="max-w-sm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search client, PPPoE, WiFi, serial…"
          />
          <Select value={filterProduct} onValueChange={(v) => v && setFilterProduct(v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue>
                {(value) =>
                  !value || value === "all"
                    ? "All products"
                    : products.find((p) => p.id === value)?.name ?? "All products"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All products</SelectItem>
              {products.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">
          {clientUnits.length} client QR{clientUnits.length === 1 ? "" : "s"}
        </p>
      </div>

      {!isLoaded ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : clientUnits.length === 0 ? (
        <Card className="bg-white print:hidden">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {query || filterProduct !== "all"
              ? "No client QRs match your search."
              : (
                <>
                  No client installation QRs yet. Create one on{" "}
                  <Link href="/stock/qr" className="underline">
                    Generate QR
                  </Link>{" "}
                  with client and WiFi details.
                </>
              )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 print:grid-cols-2">
          {clientUnits.map((item) => (
            <QrPreviewCard
              key={item.id}
              item={item}
              product={productMap.get(item.productId)}
              onEdit={setEditing}
              onShowVisits={setVisitItem}
              onRegeneratePin={busyPin === item.id ? undefined : handleRegeneratePin}
              clientPinMsg={pinMsgs[item.id]}
            />
          ))}
        </div>
      )}

      <EditUnitDialog
        item={editingLive}
        productName={products.find((p) => p.id === editingLive?.productId)?.name ?? "Unit"}
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
      />

      <VisitHistoryDialog
        item={visitItem}
        productName={
          products.find((p) => p.id === visitItem?.productId)?.name ?? "Unit"
        }
        open={!!visitItem}
        onOpenChange={(open) => !open && setVisitItem(null)}
      />
    </PageShell>
  );
}