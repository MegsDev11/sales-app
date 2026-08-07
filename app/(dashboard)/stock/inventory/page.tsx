"use client";

import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useStockStore } from "@/lib/store/stock-store";
import { useCrmStore } from "@/lib/store/crm-store";
import type { StockItem } from "@/lib/types";
import { ItemDetailDialog } from "@/components/stock/item-detail-dialog";
import { CatalogueImportDialog } from "@/components/stock/catalogue-import-dialog";
import { PageHeader, PageShell, Panel, AlertBanner } from "@/components/layout/page-shell";
import { StatTile } from "@/components/charts/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { SelectField } from "@/components/ui/select-field";
import {
  Boxes,
  ChevronDown,
  ChevronRight,
  Minus,
  Package,
  PackagePlus,
  Plus,
  QrCode,
  Search,
  Trash2,
  Truck,
} from "lucide-react";

/**
 * Stock inventory.
 *
 * Sized for hundreds of lines rather than a handful: the price-list import can add
 * several hundred products at once, so this is search-first with a dense table and
 * paging instead of a stack of expandable cards. Sundry counts adjust inline — that
 * is the most frequent action here, and it used to take two clicks to reach.
 */

const stockDateFormatter = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Johannesburg",
});

function formatStockDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : stockDateFormatter.format(date);
}

/** Rows rendered before paging. */
const PAGE = 40;

type Tab = "products" | "sundries";
type ProductFilter = "all" | "available" | "out" | "empty";

export default function StockInventoryPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">Loading…</p>}>
      <StockInventoryPageInner />
    </Suspense>
  );
}

function StockInventoryPageInner() {
  const { can } = useAuth();
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
    refresh,
    isLoaded,
    error,
  } = useStockStore();
  const { users, getVisibleLeads } = useCrmStore();

  const [tab, setTab] = useState<Tab>("products");
  const [query, setQuery] = useState("");
  const [productFilter, setProductFilter] = useState<ProductFilter>("all");
  const [onlyOutOfStock, setOnlyOutOfStock] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [sundryOpen, setSundryOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
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

  const canEdit = can("stock", "edit");

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

  /** Grouped once rather than filtering `items` per product row. */
  const unitsByProduct = useMemo(() => {
    const map = new Map<string, StockItem[]>();
    for (const item of items) {
      const list = map.get(item.productId);
      if (list) list.push(item);
      else map.set(item.productId, [item]);
    }
    return map;
  }, [items]);

  const totals = useMemo(() => {
    const list = sundries ?? [];
    return {
      products: products.length,
      available: items.filter((i) => i.status === "available").length,
      bookedOut: items.filter((i) => i.status === "booked_out").length,
      sundries: list.length,
      sundriesEmpty: list.filter((s) => s.quantity === 0).length,
    };
  }, [items, products, sundries]);

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((product) => {
      const counts = productCounts(product.id);
      if (productFilter === "available" && counts.available === 0) return false;
      if (productFilter === "out" && counts.bookedOut === 0) return false;
      if (productFilter === "empty" && counts.total > 0) return false;
      if (!q) return true;
      if (
        product.name.toLowerCase().includes(q) ||
        product.sku.toLowerCase().includes(q) ||
        product.brandDefault.toLowerCase().includes(q)
      ) {
        return true;
      }
      // A serial number is the fastest way to find a unit, so search reaches into them.
      return (unitsByProduct.get(product.id) ?? []).some(
        (unit) =>
          unit.serialNumber.toLowerCase().includes(q) ||
          unit.deviceName.toLowerCase().includes(q) ||
          unit.brand.toLowerCase().includes(q)
      );
    });
  }, [products, query, productFilter, productCounts, unitsByProduct]);

  const filteredSundries = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (sundries ?? []).filter((sundry) => {
      if (onlyOutOfStock && sundry.quantity > 0) return false;
      if (!q) return true;
      return (
        sundry.name.toLowerCase().includes(q) || sundry.notes.toLowerCase().includes(q)
      );
    });
  }, [sundries, query, onlyOutOfStock]);

  useEffect(() => {
    setLimit(PAGE);
  }, [query, productFilter, onlyOutOfStock, tab]);

  /** Deep link from a QR scan, or from a link elsewhere in the app. */
  useEffect(() => {
    const itemId = searchParams.get("item");
    if (!itemId || !isLoaded) return;
    const match = items.find((i) => i.id === itemId);
    if (!match) return;
    setSelected(match);
    setTab("products");
    setExpanded((prev) => ({ ...prev, [match.productId]: true }));
  }, [searchParams, items, isLoaded]);

  const handleAdd = useCallback(async () => {
    if (!productId) return;
    setBusy(true);
    try {
      await createItem({ productId, brand, deviceName, serialNumber });
      setAddOpen(false);
      setBrand("");
      setDeviceName("");
      setSerialNumber("");
    } finally {
      setBusy(false);
    }
  }, [productId, brand, deviceName, serialNumber, createItem]);

  const handleAddSundry = useCallback(async () => {
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
  }, [sundryName, sundryQuantity, sundryUnit, sundryNotes, createSundry]);

  const handleAdjustSundry = useCallback(
    async (sundryId: string, direction: 1 | -1) => {
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
    },
    [sundryAdjustments, adjustSundry]
  );

  const handleDeleteSundry = useCallback(
    async (sundryId: string, name: string) => {
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
    },
    [deleteSundry]
  );

  const visibleProducts = filteredProducts.slice(0, limit);
  const visibleSundries = filteredSundries.slice(0, limit);
  const shown = tab === "products" ? visibleProducts.length : visibleSundries.length;
  const matching = tab === "products" ? filteredProducts.length : filteredSundries.length;
  const sundryCount = (sundries ?? []).length;

  const tabClass = (value: Tab) =>
    `rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors ${
      tab === value
        ? "bg-surface-elevated text-foreground shadow-panel"
        : "text-muted-foreground hover:text-foreground"
    }`;

  return (
    <PageShell>
      <PageHeader
        eyebrow="Stock"
        title="Inventory"
        description="Serialised units carry a QR code and are booked out one at a time. Sundries are counted in bulk."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Package />
              Import from price list
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSundryMsg("");
                setSundryOpen(true);
              }}
            >
              <PackagePlus />
              Add sundry
            </Button>
            <Button
              size="sm"
              disabled={products.length === 0}
              title={products.length === 0 ? "Add a product first" : undefined}
              onClick={() => {
                setProductId(products[0]?.id ?? "");
                setAddOpen(true);
              }}
            >
              <Plus />
              Add unit
            </Button>
          </>
        }
      >
        <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5">
          <button
            type="button"
            className={tabClass("products")}
            onClick={() => setTab("products")}
          >
            Products{totals.products ? ` (${totals.products})` : ""}
          </button>
          <button
            type="button"
            className={tabClass("sundries")}
            onClick={() => setTab("sundries")}
          >
            Sundries{sundryCount ? ` (${sundryCount})` : ""}
          </button>
        </div>

        <div className="relative min-w-[15rem] flex-1 max-sm:w-full">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              tab === "products"
                ? "Search product, SKU or serial number…"
                : "Search sundries…"
            }
            className="h-8 pl-8"
          />
        </div>

        {tab === "products" ? (
          <Select
            value={productFilter}
            onValueChange={(v) => setProductFilter(String(v) as ProductFilter)}
          >
            <SelectTrigger size="sm" className="w-[11.5rem]">
              <SelectValue>
                {(value) =>
                  value === "available"
                    ? "Has stock on hand"
                    : value === "out"
                      ? "Has units out"
                      : value === "empty"
                        ? "No units yet"
                        : "All products"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All products</SelectItem>
              <SelectItem value="available">Has stock on hand</SelectItem>
              <SelectItem value="out">Has units out</SelectItem>
              <SelectItem value="empty">No units yet</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <Button
            size="sm"
            variant={onlyOutOfStock ? "secondary" : "ghost"}
            onClick={() => setOnlyOutOfStock((v) => !v)}
          >
            Out of stock only
            {totals.sundriesEmpty ? ` (${totals.sundriesEmpty})` : ""}
          </Button>
        )}
      </PageHeader>

      {error ? <AlertBanner tone="danger">{error}</AlertBanner> : null}
      {sundryMsg ? <AlertBanner tone="info">{sundryMsg}</AlertBanner> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile label="Products carried" value={totals.products} icon={Package} />
        <StatTile
          label="Units on hand"
          value={totals.available}
          icon={Boxes}
          status={totals.available === 0 ? "warning" : "good"}
        />
        <StatTile label="Units booked out" value={totals.bookedOut} icon={Truck} />
        <StatTile label="Sundry lines" value={sundryCount} />
        <StatTile
          label="Sundries at zero"
          value={totals.sundriesEmpty}
          higherIsBetter={false}
          status={totals.sundriesEmpty > 0 ? "warning" : "good"}
        />
      </div>

      {!isLoaded ? (
        <Panel>
          <p className="py-6 text-center text-sm text-muted-foreground">
            Loading inventory…
          </p>
        </Panel>
      ) : tab === "products" ? (
        <Panel
          padded={false}
          title="Products"
          description={
            matching === products.length
              ? `${products.length} carried`
              : `${matching} of ${products.length} match`
          }
        >
          {products.length === 0 ? (
            <div className="space-y-3 p-8 text-center">
              <p className="mx-auto max-w-prose text-sm text-muted-foreground">
                No products yet. Import them from the Sage price list — codes, names and
                unit costs come across, then you add QR-tagged units per product.
              </p>
              <Button size="sm" onClick={() => setImportOpen(true)}>
                <Package />
                Import from price list
              </Button>
            </div>
          ) : matching === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Nothing matches that search.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[44rem] text-sm">
                  <thead>
                    <tr className="border-b border-hairline text-left text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                      <th className="px-4 py-2 font-semibold">Product</th>
                      <th className="w-[10rem] px-3 py-2 font-semibold">SKU</th>
                      <th className="w-[6.5rem] px-3 py-2 text-right font-semibold">
                        On hand
                      </th>
                      <th className="w-[5rem] px-3 py-2 text-right font-semibold">Out</th>
                      <th className="w-[5rem] px-3 py-2 text-right font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleProducts.flatMap((product) => {
                      const counts = productCounts(product.id);
                      const units = unitsByProduct.get(product.id) ?? [];
                      const isOpen = !!expanded[product.id];

                      const rows = [
                        <tr
                          key={product.id}
                          className="cursor-pointer border-b border-hairline/60 hover:bg-muted/40"
                          onClick={() =>
                            setExpanded((prev) => ({
                              ...prev,
                              [product.id]: !prev[product.id],
                            }))
                          }
                        >
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-1.5">
                              {isOpen ? (
                                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                              )}
                              <span className="font-medium text-foreground">
                                {product.name}
                              </span>
                              {product.brandDefault ? (
                                <span className="text-xs text-muted-foreground">
                                  {product.brandDefault}
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                            {product.sku || "—"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {counts.available > 0 ? (
                              <span className="font-medium text-foreground">
                                {counts.available}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                            {counts.bookedOut || "—"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                            {counts.total || "—"}
                          </td>
                        </tr>,
                      ];

                      if (isOpen) {
                        rows.push(
                          <tr key={`${product.id}-units`} className="border-b border-hairline/60">
                            <td colSpan={5} className="bg-muted/25 px-4 py-2.5">
                              {units.length === 0 ? (
                                <div className="flex flex-wrap items-center gap-3">
                                  <p className="text-xs text-muted-foreground">
                                    No units recorded against this product yet.
                                  </p>
                                  <Button
                                    size="xs"
                                    variant="outline"
                                    onClick={() => {
                                      setProductId(product.id);
                                      setAddOpen(true);
                                    }}
                                  >
                                    <Plus />
                                    Add a unit
                                  </Button>
                                </div>
                              ) : (
                                <ul className="space-y-1.5">
                                  {units.map((unit) => {
                                    const booking = activeBookingByItem.get(unit.id);
                                    const technicianName = booking
                                      ? technicianNameById.get(booking.technicianId)
                                      : null;
                                    const clientName = booking?.leadId
                                      ? clientNameById.get(booking.leadId)
                                      : null;
                                    return (
                                      <li
                                        key={unit.id}
                                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-hairline bg-surface-elevated px-3 py-2"
                                      >
                                        <div className="min-w-0">
                                          <div className="flex flex-wrap items-center gap-1.5">
                                            <span className="font-medium">
                                              {unit.brand || product.brandDefault || "—"}{" "}
                                              {unit.deviceName || product.name}
                                            </span>
                                            <Badge
                                              variant={
                                                unit.status === "available"
                                                  ? "outline"
                                                  : unit.status === "booked_out"
                                                    ? "secondary"
                                                    : "ghost"
                                              }
                                            >
                                              {unit.status.replace("_", " ")}
                                            </Badge>
                                          </div>
                                          <p className="mt-0.5 text-xs text-muted-foreground">
                                            SN {unit.serialNumber || "—"} · added{" "}
                                            {formatStockDate(unit.createdAt)}
                                          </p>
                                          {unit.status === "booked_out" && booking ? (
                                            <p className="mt-0.5 text-xs text-amber-700">
                                              With {technicianName ?? "unknown technician"}
                                              {clientName ? ` for ${clientName}` : ""} since{" "}
                                              {formatStockDate(booking.bookedOutAt)}
                                            </p>
                                          ) : null}
                                        </div>
                                        <Button
                                          size="xs"
                                          variant="outline"
                                          onClick={() => setSelected(unit)}
                                        >
                                          <QrCode />
                                          QR / edit
                                        </Button>
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </td>
                          </tr>
                        );
                      }

                      return rows;
                    })}
                  </tbody>
                </table>
              </div>
              {shown < matching ? (
                <div className="border-t border-hairline p-2 text-center">
                  <Button size="sm" variant="ghost" onClick={() => setLimit((l) => l + PAGE)}>
                    Show {Math.min(PAGE, matching - shown)} more of {matching - shown}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </Panel>
      ) : (
        <Panel
          padded={false}
          title="Sundries and consumables"
          description={
            matching === sundryCount
              ? `${sundryCount} lines`
              : `${matching} of ${sundryCount} match`
          }
        >
          {sundryCount === 0 ? (
            <div className="space-y-3 p-8 text-center">
              <p className="mx-auto max-w-prose text-sm text-muted-foreground">
                No sundries yet. These are the things you count rather than serialise —
                RJ45 connectors, cable, clips, U-bolts, trunking, lugs.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
                  <Package />
                  Import from price list
                </Button>
                <Button size="sm" onClick={() => setSundryOpen(true)}>
                  <PackagePlus />
                  Add sundry
                </Button>
              </div>
            </div>
          ) : matching === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Nothing matches that search.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[42rem] text-sm">
                  <thead>
                    <tr className="border-b border-hairline text-left text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                      <th className="px-4 py-2 font-semibold">Item</th>
                      <th className="w-[8rem] px-3 py-2 text-right font-semibold">On hand</th>
                      <th className="w-[17rem] px-3 py-2 font-semibold">Adjust</th>
                      <th className="w-[3.5rem] px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {visibleSundries.map((sundry) => (
                      <tr
                        key={sundry.id}
                        className="border-b border-hairline/60 last:border-0 hover:bg-muted/30"
                      >
                        <td className="px-4 py-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium text-foreground">{sundry.name}</span>
                            {sundry.quantity === 0 ? (
                              <Badge variant="destructive">Out of stock</Badge>
                            ) : null}
                          </div>
                          {sundry.notes ? (
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {sundry.notes}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span
                            className={`text-base font-semibold tabular-nums ${
                              sundry.quantity === 0 ? "text-destructive" : "text-foreground"
                            }`}
                          >
                            {sundry.quantity}
                          </span>
                          <span className="ml-1 text-xs text-muted-foreground">
                            {sundry.unitLabel}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <Input
                              className="h-7 w-16 text-right tabular-nums"
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
                              size="xs"
                              variant="outline"
                              disabled={busy || sundry.quantity === 0}
                              onClick={() => void handleAdjustSundry(sundry.id, -1)}
                            >
                              <Minus />
                              Use
                            </Button>
                            <Button
                              size="xs"
                              variant="outline"
                              disabled={busy}
                              onClick={() => void handleAdjustSundry(sundry.id, 1)}
                            >
                              <Plus />
                              Receive
                            </Button>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            className="text-destructive"
                            disabled={busy}
                            onClick={() => void handleDeleteSundry(sundry.id, sundry.name)}
                            aria-label={`Remove ${sundry.name}`}
                          >
                            <Trash2 />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {shown < matching ? (
                <div className="border-t border-hairline p-2 text-center">
                  <Button size="sm" variant="ghost" onClick={() => setLimit((l) => l + PAGE)}>
                    Show {Math.min(PAGE, matching - shown)} more of {matching - shown}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </Panel>
      )}

      <p className="text-xs text-muted-foreground">
        After creating a unit, print its QR from the unit dialog, or use{" "}
        <Link href="/stock/scan" className="underline underline-offset-2">
          Scan
        </Link>{" "}
        to book it out.
      </p>

      {/* ---------- dialogs ---------- */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="bg-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add stock unit</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="space-y-1">
              <label className="font-medium">Product</label>
              <Select value={productId} onValueChange={(v) => v && setProductId(String(v))}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(value) =>
                      value
                        ? (products.find((p) => p.id === value)?.name ?? "Product")
                        : "Product"
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy || !productId} onClick={() => void handleAdd()}>
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
              <SelectField
                className="w-full"
                aria-label="Counted as"
                value={sundryUnit}
                onValueChange={setSundryUnit}
                options={[
                  { value: "each", label: "Each" },
                  { value: "packets", label: "Packets" },
                  { value: "boxes", label: "Boxes" },
                  { value: "metres", label: "Metres" },
                  { value: "rolls", label: "Rolls" },
                  { value: "lengths", label: "Lengths" },
                ]}
              />
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
            {sundryMsg ? <p className="text-sm text-destructive">{sundryMsg}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSundryOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={busy || !sundryName.trim()}
              onClick={() => void handleAddSundry()}
            >
              Add sundry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CatalogueImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => void refresh()}
        canEdit={canEdit}
      />

      <ItemDetailDialog
        item={selected}
        productName={products.find((p) => p.id === selected?.productId)?.name ?? "Unit"}
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </PageShell>
  );
}
