"use client";

import { PageHeader, PageShell } from "@/components/layout/page-shell";

import { useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useStockAccess } from "@/lib/hooks/use-stock-access";
import { useStockStore } from "@/lib/store/stock-store";
import { useCrmStore } from "@/lib/store/crm-store";
import type { StockItem } from "@/lib/types";
import { ItemDetailDialog } from "@/components/stock/item-detail-dialog";
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
import {
  ChevronDown,
  ChevronRight,
  Minus,
  PackagePlus,
  Plus,
  QrCode,
  Trash2,
} from "lucide-react";

const stockDateFormatter = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Johannesburg",
});

function formatStockDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : stockDateFormatter.format(date);
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
  const {
    products,
    items,
    bookings,
    sundries,
    productCounts,
    createItem,
    createSundry,
    adjustSundry,
    deleteSundry,
    isLoaded,
    error,
  } = useStockStore();
  const { users, getVisibleLeads } = useCrmStore();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [sundryExpanded, setSundryExpanded] = useState<Record<string, boolean>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [sundryOpen, setSundryOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [brand, setBrand] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<StockItem | null>(null);
  const [sundryName, setSundryName] = useState("");
  const [sundryUnit, setSundryUnit] = useState("each");
  const [sundryQuantity, setSundryQuantity] = useState("1");
  const [sundryNotes, setSundryNotes] = useState("");
  const [sundryAdjustments, setSundryAdjustments] = useState<Record<string, string>>({});
  const [sundryMsg, setSundryMsg] = useState("");

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

  async function handleAddSundry() {
    const quantity = Math.floor(Number(sundryQuantity));
    if (!sundryName.trim() || !Number.isFinite(quantity) || quantity < 0) {
      setSundryMsg("Enter a name and valid starting quantity");
      return;
    }
    setBusy(true);
    setSundryMsg("");
    try {
      await createSundry({
        name: sundryName.trim(),
        unitLabel: sundryUnit,
        quantity,
        notes: sundryNotes.trim(),
      });
      setSundryOpen(false);
      setSundryName("");
      setSundryUnit("each");
      setSundryQuantity("1");
      setSundryNotes("");
    } catch (e) {
      setSundryMsg(e instanceof Error ? e.message : "Could not add sundry");
    } finally {
      setBusy(false);
    }
  }

  async function handleAdjustSundry(sundryId: string, direction: 1 | -1) {
    const amount = Math.floor(Number(sundryAdjustments[sundryId] || "1"));
    if (!Number.isFinite(amount) || amount < 1) {
      setSundryMsg("Enter an adjustment of at least 1");
      return;
    }
    setBusy(true);
    setSundryMsg("");
    try {
      await adjustSundry(sundryId, amount * direction);
      setSundryAdjustments((prev) => ({ ...prev, [sundryId]: "1" }));
    } catch (e) {
      setSundryMsg(e instanceof Error ? e.message : "Quantity update failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteSundry(sundryId: string, name: string) {
    if (!window.confirm(`Remove ${name} from sundries?`)) return;
    setBusy(true);
    setSundryMsg("");
    try {
      await deleteSundry(sundryId);
    } catch (e) {
      setSundryMsg(e instanceof Error ? e.message : "Remove failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="Inventory"
        description="Products and units with editable QR-backed details"
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setSundryMsg("");
                setSundryOpen(true);
              }}
            >
              <PackagePlus className="mr-1 h-4 w-4" />
              Add sundry
            </Button>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => {
                setProductId(products[0]?.id ?? "");
                setAddOpen(true);
              }}
            >
              Add unit
            </Button>
          </>
        }
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {(sundries ?? []).length === 0 ? (
          <Card className="bg-white">
            <CardContent className="py-4 text-sm text-muted-foreground">
              No sundries yet. Use Add sundry to record consumable stock such as RJ45 connectors,
              clips, U-bolts, cable ties, trunking, conduit, and lugs.
            </CardContent>
          </Card>
        ) : (
          (sundries ?? []).map((sundry) => {
            const isOpen = sundryExpanded[sundry.id];
            return (
              <Card key={sundry.id} className="bg-white">
                <CardHeader className="py-3">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between text-left"
                    onClick={() =>
                      setSundryExpanded((prev) => ({ ...prev, [sundry.id]: !prev[sundry.id] }))
                    }
                  >
                    <CardTitle className="flex items-center gap-2 text-base">
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      {sundry.name}
                      <span className="text-xs font-normal text-muted-foreground">Sundry</span>
                    </CardTitle>
                    <div className="flex gap-3 text-xs">
                      <span
                        className={sundry.quantity > 0 ? "text-emerald-600" : "text-amber-600"}
                      >
                        {sundry.quantity} {sundry.unitLabel}
                      </span>
                    </div>
                  </button>
                </CardHeader>
                {isOpen && (
                  <CardContent className="space-y-2 border-t pt-3">
                    <div className="flex flex-col gap-3 rounded-lg border px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm">
                          <span className="text-2xl font-bold">{sundry.quantity}</span>{" "}
                          <span className="text-muted-foreground">{sundry.unitLabel}</span>
                        </p>
                        {sundry.notes ? (
                          <p className="text-xs text-muted-foreground">{sundry.notes}</p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          className="w-20"
                          type="number"
                          min={1}
                          value={sundryAdjustments[sundry.id] ?? "1"}
                          onChange={(e) =>
                            setSundryAdjustments((prev) => ({
                              ...prev,
                              [sundry.id]: e.target.value,
                            }))
                          }
                          aria-label={`Quantity adjustment for ${sundry.name}`}
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy || sundry.quantity === 0}
                          onClick={() => void handleAdjustSundry(sundry.id, -1)}
                        >
                          <Minus className="mr-1 h-4 w-4" />
                          Use
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => void handleAdjustSundry(sundry.id, 1)}
                        >
                          <Plus className="mr-1 h-4 w-4" />
                          Add
                        </Button>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          className="text-red-600"
                          disabled={busy}
                          onClick={() => void handleDeleteSundry(sundry.id, sundry.name)}
                          aria-label={`Remove ${sundry.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })
        )}
        {sundryMsg && <p className="text-sm text-primary">{sundryMsg}</p>}
      </div>

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
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={busy || !productId}
              onClick={() => void handleAdd()}
            >
              Add to inventory
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={sundryOpen} onOpenChange={setSundryOpen}>
        <DialogContent className="bg-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add sundry or consumable</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="space-y-1">
              <label className="font-medium">Item name</label>
              <Input
                value={sundryName}
                onChange={(e) => setSundryName(e.target.value)}
                placeholder="RJ45 connectors"
              />
            </div>
            <div className="space-y-1">
              <label className="font-medium">Counted as</label>
              <Select value={sundryUnit} onValueChange={(v) => v && setSundryUnit(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="each">Each</SelectItem>
                  <SelectItem value="packets">Packets</SelectItem>
                  <SelectItem value="boxes">Boxes</SelectItem>
                  <SelectItem value="metres">Metres</SelectItem>
                  <SelectItem value="rolls">Rolls</SelectItem>
                  <SelectItem value="lengths">Lengths</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="font-medium">Starting quantity</label>
              <Input
                type="number"
                min={0}
                value={sundryQuantity}
                onChange={(e) => setSundryQuantity(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="font-medium">Notes (optional)</label>
              <Input
                value={sundryNotes}
                onChange={(e) => setSundryNotes(e.target.value)}
                placeholder="Box size, specification, or location"
              />
            </div>
            {sundryMsg && <p className="text-sm text-primary">{sundryMsg}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSundryOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={busy || !sundryName.trim()}
              onClick={() => void handleAddSundry()}
            >
              Add sundry
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
    </PageShell>
  );
}