"use client";

import { PageHeader, PageShell } from "@/components/layout/page-shell";

import { useMemo, useState } from "react";
import { useStockAccess } from "@/lib/hooks/use-stock-access";
import { useStockStore } from "@/lib/store/stock-store";
import type { StockItem } from "@/lib/types";
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
import { EditUnitDialog, QrPreviewCard } from "@/components/stock/qr-unit-cards";
import { PendingLabelCard } from "@/components/stock/pending-label-card";

export default function StockQrPage() {
  const { allowed, isLoading } = useStockAccess();
  const { products, items, qrLabels, createItem, createQrLabelBatch, isLoaded, error } =
    useStockStore();

  const [query, setQuery] = useState("");
  const [filterProduct, setFilterProduct] = useState("all");
  const [stockProductId, setStockProductId] = useState("");
  const [stockBrand, setStockBrand] = useState("");
  const [stockDeviceName, setStockDeviceName] = useState("");
  const [stockSerialNumber, setStockSerialNumber] = useState("");
  const [productId, setProductId] = useState("");
  const [brand, setBrand] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [clientPppoe, setClientPppoe] = useState("");
  const [wifiName, setWifiName] = useState("");
  const [wifiPassword, setWifiPassword] = useState("");
  const [batchProductId, setBatchProductId] = useState("");
  const [batchBrand, setBatchBrand] = useState("");
  const [batchDeviceName, setBatchDeviceName] = useState("");
  const [batchQty, setBatchQty] = useState("10");
  const [lastBatchId, setLastBatchId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [created, setCreated] = useState<StockItem | null>(null);
  const [editing, setEditing] = useState<StockItem | null>(null);

  const productMap = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products]
  );

  // Keep the "Just created" card in sync after edits/deletes.
  const createdLive = created
    ? items.find((i) => i.id === created.id) ?? null
    : null;
  const editingLive = editing
    ? items.find((i) => i.id === editing.id) ?? editing
    : null;

  const pendingLabels = useMemo(
    () => qrLabels.filter((l) => !l.claimedAt),
    [qrLabels]
  );

  const lastBatchLabels = useMemo(
    () =>
      lastBatchId
        ? pendingLabels.filter((l) => l.batchId === lastBatchId)
        : [],
    [pendingLabels, lastBatchId]
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
        item.clientName,
        item.clientPppoe,
        item.wifiName,
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

  async function handleCreateStock() {
    if (!stockProductId) {
      setMsg("Choose a product");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const { item } = await createItem({
        productId: stockProductId,
        brand: stockBrand,
        deviceName: stockDeviceName,
        serialNumber: stockSerialNumber,
      });
      if (!item) {
        setMsg("Create failed");
        return;
      }
      setCreated(item);
      setStockBrand("");
      setStockDeviceName("");
      setStockSerialNumber("");
      setMsg("Stock unit created — inventory QR ready below.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate() {
    if (!productId) {
      setMsg("Choose a product");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const { item, clientPin } = await createItem({
        productId,
        brand,
        deviceName,
        serialNumber,
        clientName,
        clientAddress,
        clientPppoe,
        wifiName,
        wifiPassword,
      });
      if (!item) {
        setMsg("Create failed");
        return;
      }
      setCreated(item);
      setBrand("");
      setDeviceName("");
      setSerialNumber("");
      setClientName("");
      setClientAddress("");
      setClientPppoe("");
      setWifiName("");
      setWifiPassword("");
      setMsg(
        clientPin
          ? `Unit created — client PIN: ${clientPin} (give this to the client for QR access)`
          : "Unit created — QR ready below."
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleBatchLabels() {
    if (!batchProductId) {
      setMsg("Choose a product for the batch");
      return;
    }
    const quantity = Math.floor(Number(batchQty));
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > 200) {
      setMsg("Enter a quantity between 1 and 200");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const { batchId, labels } = await createQrLabelBatch({
        productId: batchProductId,
        brand: batchBrand,
        deviceName: batchDeviceName,
        quantity,
      });
      setLastBatchId(batchId);
      setMsg(
        `${labels.length} pending label${labels.length === 1 ? "" : "s"} ready to print. Inventory count stays unchanged until each is scanned in.`
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Batch create failed");
    } finally {
      setBusy(false);
    }
  }

  const printCount = filtered.length + (lastBatchLabels.length || pendingLabels.length);

  return (
    <PageShell>
      <PageHeader
        className="print:hidden"
        title="Generate QR"
        description="Print batch labels first, then book units in on Scan — or create a registered unit now"
        actions={
          <Button
            type="button"
            variant="outline"
            onClick={() => window.print()}
            disabled={printCount === 0}
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

      <Card className="bg-white print:hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <QrCode className="h-4 w-4" />
            Batch stock labels
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Generate N stickers without adding inventory. Stock managers book each unit in by
            scanning on Stock → Scan.
          </p>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <label className="font-medium">Product</label>
              <Select
                value={batchProductId}
                onValueChange={(v) => {
                  if (!v) return;
                  setBatchProductId(v);
                  const product = products.find((p) => p.id === v);
                  if (product?.brandDefault && !batchBrand) {
                    setBatchBrand(product.brandDefault);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue>
                    {(value) =>
                      value ? products.find((p) => p.id === value)?.name ?? "Product" : "Product"
                    }
                  </SelectValue>
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
              <label className="font-medium">Brand (optional)</label>
              <Input
                value={batchBrand}
                onChange={(e) => setBatchBrand(e.target.value)}
                placeholder="MikroTik"
              />
            </div>
            <div className="space-y-1">
              <label className="font-medium">Device / model (optional)</label>
              <Input
                value={batchDeviceName}
                onChange={(e) => setBatchDeviceName(e.target.value)}
                placeholder="LHG XL 5 ac"
              />
            </div>
            <div className="space-y-1">
              <label className="font-medium">Quantity</label>
              <Input
                type="number"
                min={1}
                max={200}
                value={batchQty}
                onChange={(e) => setBatchQty(e.target.value)}
              />
            </div>
          </div>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={busy || !batchProductId || !isLoaded}
            onClick={() => void handleBatchLabels()}
          >
            Generate batch labels
          </Button>
        </CardContent>
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-2 print:hidden">
        <Card className="bg-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <QrCode className="h-4 w-4" />
              Stock inventory QR
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              For booking units in and out of inventory.
            </p>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="space-y-1">
              <label className="font-medium">Product</label>
              <Select
                value={stockProductId}
                onValueChange={(v) => {
                  if (!v) return;
                  setStockProductId(v);
                  const product = products.find((p) => p.id === v);
                  if (product?.brandDefault && !stockBrand) {
                    setStockBrand(product.brandDefault);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue>
                    {(value) =>
                      value ? products.find((p) => p.id === value)?.name ?? "Product" : "Product"
                    }
                  </SelectValue>
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
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="font-medium">Brand</label>
                <Input
                  value={stockBrand}
                  onChange={(e) => setStockBrand(e.target.value)}
                  placeholder="MikroTik"
                />
              </div>
              <div className="space-y-1">
                <label className="font-medium">Device / model</label>
                <Input
                  value={stockDeviceName}
                  onChange={(e) => setStockDeviceName(e.target.value)}
                  placeholder="LHG XL 5 ac"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="font-medium">Serial number</label>
                <Input
                  value={stockSerialNumber}
                  onChange={(e) => setStockSerialNumber(e.target.value)}
                  placeholder="SN…"
                />
              </div>
            </div>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={busy || !stockProductId || !isLoaded}
              onClick={() => void handleCreateStock()}
            >
              Generate stock QR
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <QrCode className="h-4 w-4" />
              Client installation QR
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              For installed units with client and WiFi details.
            </p>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
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
                <SelectValue>
                  {(value) =>
                    value ? products.find((p) => p.id === value)?.name ?? "Product" : "Product"
                  }
                </SelectValue>
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
          <div className="grid gap-3 sm:grid-cols-2">
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
            <div className="space-y-1">
              <label className="font-medium">Client name</label>
              <Input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Client name"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="font-medium">Client address</label>
              <Input
                value={clientAddress}
                onChange={(e) => setClientAddress(e.target.value)}
                placeholder="Street, town"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="font-medium">Client PPPoE</label>
              <Input
                value={clientPppoe}
                onChange={(e) => setClientPppoe(e.target.value)}
                placeholder="client@megs"
              />
            </div>
            <div className="space-y-1">
              <label className="font-medium">WiFi name</label>
              <Input
                value={wifiName}
                onChange={(e) => setWifiName(e.target.value)}
                placeholder="SSID"
              />
            </div>
            <div className="space-y-1">
              <label className="font-medium">WiFi password</label>
              <Input
                value={wifiPassword}
                onChange={(e) => setWifiPassword(e.target.value)}
                placeholder="WiFi password"
              />
            </div>
          </div>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={busy || !productId || !isLoaded}
              onClick={() => void handleCreate()}
            >
              Generate client QR
            </Button>
          </CardContent>
        </Card>
      </div>

      {msg && <p className="text-sm text-primary print:hidden">{msg}</p>}

      {(lastBatchLabels.length > 0 || pendingLabels.length > 0) && (
        <div className="space-y-3">
          <div className="print:hidden">
            <h2 className="text-sm font-semibold">
              {lastBatchLabels.length > 0
                ? `Latest batch (${lastBatchLabels.length} pending)`
                : `Pending labels (${pendingLabels.length})`}
            </h2>
            <p className="text-xs text-muted-foreground">
              These stickers are not in inventory yet. Print them, stick them on devices, then book
              in via Scan.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2 print:grid-cols-2">
            {(lastBatchLabels.length > 0 ? lastBatchLabels : pendingLabels).map((label) => (
              <PendingLabelCard
                key={label.id}
                label={label}
                product={productMap.get(label.productId)}
              />
            ))}
          </div>
        </div>
      )}

      {createdLive && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold print:hidden">Just created</h2>
          <QrPreviewCard
            item={createdLive}
            product={productMap.get(createdLive.productId)}
            onEdit={setEditing}
          />
        </div>
      )}

      <div className="space-y-3 print:hidden">
        <h2 className="text-sm font-semibold">Registered inventory units</h2>
        <div className="flex flex-wrap gap-3">
          <Input
            className="max-w-sm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search brand, device, serial…"
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
              onEdit={setEditing}
            />
          ))}
        </div>
      )}

      <EditUnitDialog
        item={editingLive}
        productName={
          products.find((p) => p.id === editingLive?.productId)?.name ?? "Unit"
        }
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
      />
    </PageShell>
  );
}