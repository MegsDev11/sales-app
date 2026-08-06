"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useStockAccess } from "@/lib/hooks/use-stock-access";
import { useStockStore } from "@/lib/store/stock-store";
import { useCrmStore } from "@/lib/store/crm-store";
import { PageHeader, PageShell, Panel, AlertBanner } from "@/components/layout/page-shell";
import { buttonVariants } from "@/components/ui/button";
import { StatTile, Meter } from "@/components/charts/primitives";
import { StackedBar, BarChart, ColumnChart } from "@/components/charts/bar-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { SERIES, STATUS } from "@/components/charts/tokens";
import {
  AlertTriangle,
  Boxes,
  ClipboardList,
  Package,
  QrCode,
  ScanLine,
  Truck,
} from "lucide-react";

/**
 * Stock overview.
 *
 * The reorder signals here are deliberately deterministic — "quantity is at or below
 * zero", "this product has no units available". No forecasting yet: that needs the
 * stock_movements ledger from Phase 4, without which consumption rate cannot be
 * computed honestly.
 */
export default function StockOverviewPage() {
  const { allowed, isLoading } = useStockAccess();
  const { products, items, bookings, requests, sundries, isLoaded, error } = useStockStore();
  const { users } = useCrmStore();

  const m = useMemo(() => {
    const available = items.filter((i) => i.status === "available").length;
    const bookedOut = items.filter((i) => i.status === "booked_out").length;
    const retired = items.filter((i) => i.status === "retired").length;

    const byProduct = products
      .map((p) => {
        const units = items.filter((i) => i.productId === p.id);
        return {
          label: p.name,
          total: units.length,
          available: units.filter((i) => i.status === "available").length,
          bookedOut: units.filter((i) => i.status === "booked_out").length,
        };
      })
      .sort((a, b) => b.total - a.total);

    // Deterministic low-stock rules. Nothing predictive.
    const outOfStock = byProduct.filter((p) => p.total > 0 && p.available === 0);
    const lowSundries = (sundries ?? []).filter((s) => s.quantity <= 0);

    const openRequests = requests.filter((r) => r.status === "open" || r.status === "partial");

    // Book-outs per week for the last 8 weeks.
    const now = new Date();
    const weeks = Array.from({ length: 8 }, (_, i) => {
      const end = new Date(now);
      end.setDate(now.getDate() - (7 - i) * 7);
      const start = new Date(end);
      start.setDate(end.getDate() - 7);
      return { start, end, label: `${start.getDate()}/${start.getMonth() + 1}` };
    });
    const bookOutTrend = weeks.map((w) => ({
      label: w.label,
      value: bookings.filter((b) => {
        const t = new Date(b.bookedOutAt).getTime();
        return t >= w.start.getTime() && t < w.end.getTime();
      }).length,
    }));

    // Who currently holds stock.
    const heldBy = new Map<string, number>();
    for (const b of bookings.filter((x) => !x.returnedAt)) {
      heldBy.set(b.technicianId, (heldBy.get(b.technicianId) ?? 0) + 1);
    }
    const holders = Array.from(heldBy.entries())
      .map(([id, count]) => ({
        label: users.find((u) => u.id === id)?.name ?? "Unknown",
        value: count,
      }))
      .sort((a, b) => b.value - a.value);

    const returnsDue = bookings.filter(
      (b) => !b.returnedAt && b.returnNeededAt && new Date(b.returnNeededAt) <= now
    );

    return {
      available,
      bookedOut,
      retired,
      byProduct,
      outOfStock,
      lowSundries,
      openRequests,
      bookOutTrend,
      holders,
      returnsDue,
    };
  }, [products, items, bookings, requests, sundries, users]);

  if (isLoading || !allowed) return null;

  return (
    <PageShell>
      <PageHeader
        title="Stock"
        description="Inventory, bookings and pick lists"
        actions={
          <div className="flex gap-2">
            <Link href="/stock/scan" className={buttonVariants({ variant: "outline" })}>
              <ScanLine className="mr-1.5 h-4 w-4" /> Scan
            </Link>
            <Link
              href="/stock/inventory"
              className={buttonVariants({
                className: "bg-primary text-primary-foreground hover:bg-primary/90",
              })}
            >
              <Package className="mr-1.5 h-4 w-4" /> Inventory
            </Link>
          </div>
        }
      />

      {error ? <AlertBanner tone="danger">{error}</AlertBanner> : null}

      {m.outOfStock.length > 0 || m.lowSundries.length > 0 ? (
        <AlertBanner tone="warn">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">
            {m.outOfStock.length > 0
              ? `${m.outOfStock.length} product${m.outOfStock.length === 1 ? " has" : "s have"} no units available`
              : ""}
            {m.outOfStock.length > 0 && m.lowSundries.length > 0 ? " · " : ""}
            {m.lowSundries.length > 0
              ? `${m.lowSundries.length} sundr${m.lowSundries.length === 1 ? "y is" : "ies are"} at zero`
              : ""}
          </span>
          <Link href="/stock/inventory" className="shrink-0 font-medium underline">
            Inventory
          </Link>
        </AlertBanner>
      ) : null}

      {m.returnsDue.length > 0 ? (
        <AlertBanner tone="warn">
          <Truck className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">
            {m.returnsDue.length} item{m.returnsDue.length === 1 ? "" : "s"} past the return date.
          </span>
          <Link href="/stock/booked-out" className="shrink-0 font-medium underline">
            Booked out
          </Link>
        </AlertBanner>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Available units"
          value={m.available}
          icon={Package}
          accent={SERIES[2]}
          href="/stock/inventory"
        />
        <StatTile
          label="Booked out"
          value={m.bookedOut}
          icon={Truck}
          accent={SERIES[1]}
          href="/stock/booked-out"
        />
        <StatTile
          label="Open pick lists"
          value={m.openRequests.length}
          icon={ClipboardList}
          accent={m.openRequests.length > 0 ? STATUS.warning : SERIES[2]}
          href="/stock/requests"
        />
        <StatTile
          label="Products tracked"
          value={products.length}
          icon={Boxes}
          accent={SERIES[0]}
          href="/stock/inventory"
        />
        <StatTile
          label="Out of stock"
          value={m.outOfStock.length}
          icon={AlertTriangle}
          accent={m.outOfStock.length > 0 ? STATUS.critical : SERIES[2]}
          higherIsBetter={false}
        />
        <StatTile
          label="Sundry lines"
          value={(sundries ?? []).length}
          icon={Boxes}
          accent={SERIES[6]}
        />
        <StatTile
          label="Returns overdue"
          value={m.returnsDue.length}
          icon={Truck}
          accent={m.returnsDue.length > 0 ? STATUS.critical : SERIES[2]}
          higherIsBetter={false}
          href="/stock/booked-out"
        />
        <StatTile
          label="QR labels"
          value={items.length}
          icon={QrCode}
          accent={SERIES[4]}
          href="/stock/qr"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <StackedBar
          title="Where the stock is"
          subtitle="Every tracked unit by current status"
          segments={[
            { label: "Available", value: m.available, colorIndex: 2 },
            { label: "Booked out", value: m.bookedOut, colorIndex: 1 },
            { label: "Retired", value: m.retired, color: "#94a3b8" },
          ]}
        />
        <ColumnChart
          title="Book-out activity"
          subtitle="Units booked out per week"
          data={m.bookOutTrend}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <BarChart
          title="Units by product"
          subtitle="Total tracked units, largest first"
          data={m.byProduct.map((p) => ({
            label: p.label,
            value: p.total,
            href: "/stock/inventory",
          }))}
        />
        {m.holders.length > 0 ? (
          <BarChart
            title="Stock held by technician"
            subtitle="Units currently booked out and not returned"
            data={m.holders}
          />
        ) : (
          <DonutChart
            title="Stock held by technician"
            subtitle="Units currently booked out"
            segments={[]}
          />
        )}
      </div>

      {m.byProduct.length > 0 ? (
        <Panel
          title="Availability by product"
          description="Available units against the total tracked for each product"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {m.byProduct.slice(0, 9).map((p) => (
              <Meter
                key={p.label}
                label={p.label}
                value={p.available}
                max={p.total}
                // Low availability is the problem, so the severity scale is flipped:
                // under half available warns, under a quarter is critical.
                invert
              />
            ))}
          </div>
        </Panel>
      ) : null}

      {!isLoaded ? (
        <p className="text-xs text-muted-foreground">Loading stock…</p>
      ) : null}
    </PageShell>
  );
}
