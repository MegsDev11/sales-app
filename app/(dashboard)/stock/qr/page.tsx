"use client";

import { useMemo, useState } from "react";
import { useStockAccess } from "@/lib/hooks/use-stock-access";
import { stockItemPublicUrl, useQrDataUrl } from "@/lib/hooks/use-qr-data-url";
import { useStockStore } from "@/lib/store/stock-store";
import type { StockItem, StockProduct } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, Printer, QrCode } from "lucide-react";

function QrPreviewCard({
  item,
  product,
}: {
  item: StockItem;
  product: StockProduct | undefined;
}) {
  const url = stockItemPublicUrl(item.qrToken);
  const qr = useQrDataUrl(url);
  const fileName = `stock-${item.serialNumber || item.qrToken}.png`;

  return (
    <Card className="bg-white print:break-inside-avoid print:shadow-none">
      <CardContent className="flex flex-col items-center gap-3 p-4 sm:flex-row sm:items-start">
        <div className="shrink-0 rounded-lg border bg-white p-2">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt={`QR ${item.serialNumber || item.qrToken}`} className="h-36 w-36" />
          ) : (
            <div className="flex h-36 w-36 items-center justify-center text-xs text-muted-foreground">
              Generating…
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#C83733]">
            {product?.name ?? "Unit"}
          </p>
          <p className="font-semibold">
            {[item.brand, item.deviceName].filter(Boolean).join(" ") || product?.name || "—"}
          </p>
          <p>
            <span className="text-muted-foreground">Serial:</span> {item.serialNumber || "—"}
          </p>
          <p>
            <span className="text-muted-foreground">Brand:</span> {item.brand || "—"}
          </p>
          <p>
            <span className="text-muted-foreground">Device:</span> {item.deviceName || "—"}
          </p>
          <p className="capitalize">
            <span className="text-muted-foreground">Status:</span>{" "}
            {item.status.replace("_", " ")}
          </p>
          <p className="break-all text-xs text-muted-foreground print:hidden">{url}</p>
          <div className="flex flex-wrap gap-2 pt-2 print:hidden">
            {qr && (
              <a href={qr} download={fileName}>
                <Button type="button" size="sm" variant="outline">
                  <Download className="mr-1 h-4 w-4" />
                  Download
                </Button>
              </a>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function StockQrPage() {
  const { allowed, isLoading } = useStockAccess();
  const { products, items, createItem, isLoaded, error } = useStockStore();

  const [query, setQuery] = useState("");
  const [filterProduct, setFilterProduct] = useState("all");
  const [productId, setProductId] = useState("");
  const [brand, setBrand] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [created, setCreated] = useState<StockItem | null>(null);

  const productMap = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (filterProduct !== "all" && item.productId !== filterProduct) return false;
      if (!q) return true;
      const product = productMap.get(item.productId);
      const hay = [
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

  async function handleCreate() {
    if (!productId) {
      setMsg("Choose a product");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const item = await createItem({ productId, brand, deviceName, serialNumber });
      if (!item) {
        setMsg("Create failed");
        return;
      }
      setCreated(item);
      setBrand("");
      setDeviceName("");
      setSerialNumber("");
      setMsg("Unit created — QR ready below.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-bold">Generate QR</h1>
          <p className="text-sm text-muted-foreground">
            Create a new unit or print labels with brand, device, and serial details
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => window.print()}
          disabled={filtered.length === 0}
        >
          <Printer className="mr-1 h-4 w-4" />
          Print labels
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 print:hidden">
          {error}
        </div>
      )}

      <Card className="bg-white print:hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <QrCode className="h-4 w-4" />
            New unit + QR
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="font-medium">Product</label>
              <Select
                value={productId}
                onValueChange={(v) => {
                  if (!v) return;
                  setProductId(v);
                  const product = products.find((p) => p.id === v);
                  if (product?.brandDefault && !brand) setBrand(product.brandDefault);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Product" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="font-medium">Brand</label>
              <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="MikroTik" />
            </div>
            <div className="space-y-1">
              <label className="font-medium">Device / model</label>
              <Input
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="LHG XL 5 ac"
              />
            </div>
            <div className="space-y-1">
              <label className="font-medium">Serial number</label>
              <Input
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                placeholder="SN…"
              />
            </div>
          </div>
          {msg && <p className="text-[#C83733]">{msg}</p>}
          <Button
            className="bg-[#C83733] hover:bg-[#a82f2b]"
            disabled={busy || !productId || !isLoaded}
            onClick={() => void handleCreate()}
          >
            Generate QR
          </Button>
        </CardContent>
      </Card>

      {created && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold print:hidden">Just created</h2>
          <QrPreviewCard item={created} product={productMap.get(created.productId)} />
        </div>
      )}

      <div className="space-y-3 print:hidden">
        <div className="flex flex-wrap gap-3">
          <Input
            className="max-w-sm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search brand, device, serial…"
          />
          <Select value={filterProduct} onValueChange={(v) => v && setFilterProduct(v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All products" />
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
          {filtered.length} unit{filtered.length === 1 ? "" : "s"} — QR stickers keep working when
          you edit details in Inventory
        </p>
      </div>

      {!isLoaded ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <Card className="bg-white print:hidden">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No units yet. Create one above or add units in Inventory.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 print:grid-cols-2">
          {filtered.map((item) => (
            <QrPreviewCard
              key={item.id}
              item={item}
              product={productMap.get(item.productId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
