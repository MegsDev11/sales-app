"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useStockAccess } from "@/lib/hooks/use-stock-access";
import { stockItemPublicUrl, useQrDataUrl } from "@/lib/hooks/use-qr-data-url";
import { useStockStore } from "@/lib/store/stock-store";
import { useCrmStore } from "@/lib/store/crm-store";
import { getFieldTechnicians } from "@/lib/permissions";
import type { StockItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown, ChevronRight, Download, QrCode } from "lucide-react";

const stockDateFormatter = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Johannesburg",
});

function formatStockDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : stockDateFormatter.format(date);
}

function ItemDetailDialog({
  item,
  productName,
  open,
  onOpenChange,
}: {
  item: StockItem | null;
  productName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { updateItem, bookOut, returnItem } = useStockStore();
  const { users, getVisibleLeads } = useCrmStore();
  const [brand, setBrand] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientPppoe, setClientPppoe] = useState("");
  const [wifiName, setWifiName] = useState("");
  const [wifiPassword, setWifiPassword] = useState("");
  const [techId, setTechId] = useState("");
  const [leadId, setLeadId] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const url = item ? stockItemPublicUrl(item.qrToken) : null;
  const qr = useQrDataUrl(url);

  const techs = useMemo(() => getFieldTechnicians(users), [users]);
  const leads = getVisibleLeads().filter((l) => !l.deleted).slice(0, 200);

  useEffect(() => {
    if (item) {
      setBrand(item.brand);
      setDeviceName(item.deviceName);
      setSerialNumber(item.serialNumber);
      setClientName(item.clientName ?? "");
      setClientPppoe(item.clientPppoe ?? "");
      setWifiName(item.wifiName ?? "");
      setWifiPassword(item.wifiPassword ?? "");
      setMsg("");
      setTechId("");
      setLeadId("");
    }
  }, [item]);

  if (!item) return null;

  async function handleSave() {
    setSaving(true);
    setMsg("");
    try {
      await updateItem(item!.id, {
        brand,
        deviceName,
        serialNumber,
        clientName,
        clientPppoe,
        wifiName,
        wifiPassword,
      });
      setMsg("Saved — QR stickers still work; scan shows updated details.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleBookOut() {
    if (!techId) {
      setMsg("Select a technician");
      return;
    }
    setSaving(true);
    try {
      await bookOut({
        itemId: item!.id,
        technicianId: techId,
        leadId: leadId || null,
      });
      setMsg("Booked out");
      onOpenChange(false);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Book out failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleReturn() {
    setSaving(true);
    try {
      await returnItem(item!.id);
      setMsg("Returned to stock");
      onOpenChange(false);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Return failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {productName} — {item.serialNumber || item.qrToken}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="flex flex-col items-center gap-2 rounded-xl border bg-gray-50 p-4">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="QR code" className="h-48 w-48" />
            ) : (
              <div className="flex h-48 w-48 items-center justify-center text-muted-foreground">
                Generating QR…
              </div>
            )}
            <p className="break-all text-center text-xs text-muted-foreground">{url}</p>
            {qr && (
              <a href={qr} download={`stock-${item.serialNumber || item.qrToken}.png`}>
                <Button type="button" size="sm" variant="outline">
                  <Download className="mr-1 h-4 w-4" />
                  Download QR
                </Button>
              </a>
            )}
          </div>

          <div className="space-y-2">
            <label className="font-medium">Brand</label>
            <Input value={brand} onChange={(e) => setBrand(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="font-medium">Device / model</label>
            <Input value={deviceName} onChange={(e) => setDeviceName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="font-medium">Serial number</label>
            <Input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="font-medium">Client name</label>
            <Input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Client name"
            />
          </div>
          <div className="space-y-2">
            <label className="font-medium">Client PPPoE</label>
            <Input
              value={clientPppoe}
              onChange={(e) => setClientPppoe(e.target.value)}
              placeholder="client@megs"
            />
          </div>
          <div className="space-y-2">
            <label className="font-medium">WiFi name</label>
            <Input
              value={wifiName}
              onChange={(e) => setWifiName(e.target.value)}
              placeholder="SSID"
            />
          </div>
          <div className="space-y-2">
            <label className="font-medium">WiFi password</label>
            <Input
              value={wifiPassword}
              onChange={(e) => setWifiPassword(e.target.value)}
              placeholder="WiFi password"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Status: <span className="font-semibold capitalize">{item.status.replace("_", " ")}</span>
          </p>
          {msg && <p className="text-sm text-[#C83733]">{msg}</p>}

          {item.status === "available" && (
            <div className="space-y-2 rounded-lg border p-3">
              <p className="font-medium">Book out</p>
              <Select value={techId} onValueChange={(v) => v && setTechId(v)}>
                <SelectTrigger>
                  <SelectValue>
                    {(value) =>
                      value ? techs.find((t) => t.id === value)?.name ?? "Technician" : "Technician"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {techs.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                      {t.department ? ` (${t.department})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={leadId || "__none"} onValueChange={(v) => setLeadId(v === "__none" ? "" : (v ?? ""))}>
                <SelectTrigger>
                  <SelectValue>
                    {(value) =>
                      value === "__none"
                        ? "Client"
                        : leads.find((lead) => lead.id === value)?.clientName ?? "Client"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No client</SelectItem>
                  {leads.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.clientName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="sm"
                className="bg-[#C83733] hover:bg-[#a82f2b]"
                disabled={saving}
                onClick={() => void handleBookOut()}
              >
                Book out
              </Button>
            </div>
          )}

          {item.status === "booked_out" && (
            <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => void handleReturn()}>
              Return to stock
            </Button>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            type="button"
            className="bg-[#C83733] hover:bg-[#a82f2b]"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            Save details
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function StockInventoryPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">Loading…</p>}>
      <StockInventoryPageInner />
    </Suspense>
  );
}

function StockInventoryPageInner() {
  const { allowed, isLoading } = useStockAccess();
  const searchParams = useSearchParams();
  const { products, items, bookings, productCounts, createItem, isLoaded, error } =
    useStockStore();
  const { users, getVisibleLeads } = useCrmStore();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [brand, setBrand] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<StockItem | null>(null);

  const activeBookingByItem = useMemo(
    () =>
      new Map(
        bookings
          .filter((booking) => !booking.returnedAt)
          .map((booking) => [booking.itemId, booking])
      ),
    [bookings]
  );
  const technicianNameById = useMemo(
    () => new Map(users.map((user) => [user.id, user.name])),
    [users]
  );
  const clientNameById = useMemo(
    () =>
      new Map(
        getVisibleLeads()
          .filter((lead) => !lead.deleted)
          .map((lead) => [lead.id, lead.clientName])
      ),
    [getVisibleLeads]
  );

  useEffect(() => {
    const itemId = searchParams.get("item");
    if (!itemId || !isLoaded) return;
    const match = items.find((i) => i.id === itemId);
    if (!match) return;
    setSelected(match);
    setExpanded((prev) => ({ ...prev, [match.productId]: true }));
  }, [searchParams, items, isLoaded]);

  if (isLoading || !allowed) return null;

  async function handleAdd() {
    if (!productId) return;
    setBusy(true);
    try {
      await createItem({
        productId,
        brand,
        deviceName,
        serialNumber,
      });
      setAddOpen(false);
      setBrand("");
      setDeviceName("");
      setSerialNumber("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Inventory</h1>
          <p className="text-sm text-muted-foreground">
            Products and units with editable QR-backed details
          </p>
        </div>
        <Button
          className="bg-[#C83733] hover:bg-[#a82f2b]"
          onClick={() => {
            setProductId(products[0]?.id ?? "");
            setAddOpen(true);
          }}
        >
          Add unit
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {!isLoaded ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : products.length === 0 ? (
        <Card className="bg-white">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No products yet. Run the stock migration (`007_stock_inventory.sql`) in Supabase.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {products.map((product) => {
            const counts = productCounts(product.id);
            const units = items.filter((i) => i.productId === product.id);
            const isOpen = expanded[product.id];
            return (
              <Card key={product.id} className="bg-white">
                <CardHeader className="py-3">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between text-left"
                    onClick={() =>
                      setExpanded((prev) => ({ ...prev, [product.id]: !prev[product.id] }))
                    }
                  >
                    <CardTitle className="flex items-center gap-2 text-base">
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      {product.name}
                      <span className="text-xs font-normal text-muted-foreground">
                        {product.sku}
                      </span>
                    </CardTitle>
                    <div className="flex gap-3 text-xs">
                      <span className="text-emerald-600">{counts.available} available</span>
                      <span className="text-amber-600">{counts.bookedOut} out</span>
                      <span className="text-muted-foreground">{counts.total} total</span>
                    </div>
                  </button>
                </CardHeader>
                {isOpen && (
                  <CardContent className="space-y-2 border-t pt-3">
                    {units.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No units yet.</p>
                    ) : (
                      units.map((unit) => {
                        const booking = activeBookingByItem.get(unit.id);
                        const technicianName = booking
                          ? technicianNameById.get(booking.technicianId)
                          : null;
                        const clientName = booking?.leadId
                          ? clientNameById.get(booking.leadId)
                          : null;

                        return (
                          <div
                            key={unit.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                          >
                            <div>
                              <p className="font-medium">
                                {unit.brand || product.brandDefault || "—"}{" "}
                                {unit.deviceName || product.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                SN: {unit.serialNumber || "—"} ·{" "}
                                <span className="capitalize">{unit.status.replace("_", " ")}</span>
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Booked in: {formatStockDate(unit.createdAt)}
                              </p>
                              {unit.status === "booked_out" && booking && (
                                <div className="mt-1 space-y-0.5 text-xs text-amber-700">
                                  <p>
                                    Tech: {technicianName ?? "Unknown technician"}
                                    {clientName ? ` · Client: ${clientName}` : ""}
                                  </p>
                                  <p>Booked out: {formatStockDate(booking.bookedOutAt)}</p>
                                </div>
                              )}
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelected(unit)}
                            >
                              <QrCode className="mr-1 h-4 w-4" />
                              QR / Edit
                            </Button>
                          </div>
                        );
                      })
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="bg-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add stock unit</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="space-y-1">
              <label className="font-medium">Product</label>
              <Select value={productId} onValueChange={(v) => v && setProductId(v)}>
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-[#C83733] hover:bg-[#a82f2b]"
              disabled={busy || !productId}
              onClick={() => void handleAdd()}
            >
              Add to inventory
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ItemDetailDialog
        item={selected}
        productName={
          products.find((p) => p.id === selected?.productId)?.name ?? "Unit"
        }
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
      />

      <p className="text-xs text-muted-foreground">
        Tip: after creating a unit, open <Link href="/stock/scan" className="underline">Scan</Link> or
        print the QR from the unit dialog.
      </p>
    </div>
  );
}
