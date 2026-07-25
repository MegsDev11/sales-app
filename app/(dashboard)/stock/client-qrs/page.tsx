"use client";

import { PageHeader, PageShell } from "@/components/layout/page-shell";

import { useMemo, useState } from "react";
import { useStockAccess } from "@/lib/hooks/use-stock-access";
import { useStockStore } from "@/lib/store/stock-store";
import { useCrmStore } from "@/lib/store/crm-store";
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
import { Printer, QrCode } from "lucide-react";
import { EditUnitDialog, QrPreviewCard, VisitHistoryDialog } from "@/components/stock/qr-unit-cards";

function isClientUnit(item: StockItem) {
  return Boolean(
    item.clientName || item.clientAddress || item.clientPppoe || item.wifiName || item.wifiPassword
  );
}

export default function ClientQrsPage() {
  const { allowed, isLoading } = useStockAccess();
  const { products, items, isLoaded, error, createItem, regenerateClientPin } = useStockStore();
  const { getVisibleLeads, leads } = useCrmStore();

  const [query, setQuery] = useState("");
  const [filterProduct, setFilterProduct] = useState("all");
  const [editing, setEditing] = useState<StockItem | null>(null);
  const [visitItem, setVisitItem] = useState<StockItem | null>(null);
  const [pinMsgs, setPinMsgs] = useState<Record<string, string>>({});
  const [busyPin, setBusyPin] = useState<string | null>(null);

  const [productId, setProductId] = useState("");
  const [brand, setBrand] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [leadId, setLeadId] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [clientPppoe, setClientPppoe] = useState("");
  const [wifiName, setWifiName] = useState("");
  const [wifiPassword, setWifiPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [created, setCreated] = useState<StockItem | null>(null);

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const clients = useMemo(
    () =>
      getVisibleLeads()
        .filter((l) => !l.deleted && l.clientName.trim())
        .slice()
        .sort((a, b) => a.clientName.localeCompare(b.clientName)),
    [getVisibleLeads, leads]
  );

  const editingLive = editing ? items.find((i) => i.id === editing.id) ?? editing : null;
  const createdLive = created ? items.find((i) => i.id === created.id) ?? null : null;

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
      setLeadId("");
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
        description="Create client installation QRs and manage existing ones — search by client, PPPoE, WiFi, or serial"
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

      <Card className="bg-white print:hidden">
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
              <Input
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="MikroTik"
              />
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
              <Select
                value={leadId || "__none"}
                onValueChange={(v) => {
                  if (typeof v !== "string") return;
                  if (v === "__none") {
                    setLeadId("");
                    setClientName("");
                    setClientAddress("");
                    setClientPppoe("");
                    setWifiName("");
                    setWifiPassword("");
                    return;
                  }
                  const lead = clients.find((c) => c.id === v);
                  setLeadId(v);
                  if (!lead) return;
                  setClientName(lead.clientName);
                  setClientAddress(lead.address?.trim() || "");
                  setClientPppoe(lead.clientPppoe?.trim() || "");
                  setWifiName(lead.wifiName?.trim() || "");
                  setWifiPassword(lead.wifiPassword?.trim() || "");
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select client">
                    {(value) => {
                      if (!value || value === "__none") return "Select client";
                      return (
                        clients.find((c) => c.id === value)?.clientName ||
                        clientName ||
                        "Select client"
                      );
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Select client</SelectItem>
                  {clients.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.clientName}
                      {l.address ? ` — ${l.address}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
          {msg ? <p className="text-sm text-primary">{msg}</p> : null}
        </CardContent>
      </Card>

      {createdLive ? (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold print:hidden">Just created</h2>
          <QrPreviewCard
            item={createdLive}
            product={productMap.get(createdLive.productId)}
            onEdit={setEditing}
            onShowVisits={setVisitItem}
            onRegeneratePin={
              busyPin === createdLive.id ? undefined : handleRegeneratePin
            }
            clientPinMsg={pinMsgs[createdLive.id]}
          />
        </div>
      ) : null}

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
              : "No client installation QRs yet. Create one with the form above."}
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
