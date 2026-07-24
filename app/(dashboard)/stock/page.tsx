"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useStockAccess } from "@/lib/hooks/use-stock-access";
import { useStockStore } from "@/lib/store/stock-store";
import { useCrmStore } from "@/lib/store/crm-store";
import { StatCard } from "@/components/stats/stat-card";
import {
  AlertBanner,
  PageHeader,
  PageShell,
  Panel,
} from "@/components/layout/page-shell";
import { buttonVariants } from "@/components/ui/button";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  ClipboardList,
  Package,
  PackageCheck,
  PackageOpen,
  QrCode,
  ScanLine,
  Wrench,
} from "lucide-react";

const dateFormatter = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Johannesburg",
});

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateFormatter.format(date);
}

export default function StockOverviewPage() {
  const { allowed, isLoading } = useStockAccess();
  const {
    products,
    items,
    bookings,
    requests,
    sundries,
    productCounts,
    isLoaded,
    error,
  } = useStockStore();
  const { users } = useCrmStore();

  const available = items.filter((i) => i.status === "available").length;
  const bookedOut = items.filter((i) => i.status === "booked_out").length;
  const openRequests = requests.filter(
    (r) => r.status === "open" || r.status === "partial"
  ).length;
  const sundryLines = (sundries ?? []).length;
  const sundriesOut = (sundries ?? []).filter((s) => s.quantity === 0).length;

  const technicianNameById = useMemo(
    () => new Map(users.map((user) => [user.id, user.name])),
    [users]
  );

  const productRows = useMemo(() => {
    if (!isLoaded) return [];
    return products
      .map((p) => {
        const counts = productCounts(p.id);
        const openNeeded = requests
          .filter((r) => r.status === "open" || r.status === "partial")
          .flatMap((r) => r.lines)
          .filter((l) => l.productId === p.id)
          .reduce((sum, l) => sum + Math.max(0, l.qtyNeeded - l.qtyFulfilled), 0);
        return {
          product: p,
          ...counts,
          openNeeded,
          short: openNeeded > counts.available,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [products, requests, productCounts, isLoaded]);

  const lowStockProducts = useMemo(
    () => productRows.filter((row) => row.short || row.available <= 2).slice(0, 8),
    [productRows]
  );

  const recentBookings = useMemo(() => {
    if (!isLoaded) return [];
    return bookings
      .filter((booking) => !booking.returnedAt)
      .map((booking) => {
        const item = items.find((i) => i.id === booking.itemId);
        if (!item) return null;
        const product = products.find((p) => p.id === item.productId);
        return {
          booking,
          item,
          productName: product?.name ?? "Unit",
          technicianName:
            technicianNameById.get(booking.technicianId) ?? "Unknown technician",
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort(
        (a, b) =>
          new Date(b.booking.bookedOutAt).getTime() -
          new Date(a.booking.bookedOutAt).getTime()
      )
      .slice(0, 5);
  }, [bookings, items, products, technicianNameById, isLoaded]);

  if (isLoading || !allowed) return null;

  const quickLinks = [
    {
      href: "/stock/inventory",
      icon: Package,
      title: "Inventory",
      caption: "Products, units & sundries",
    },
    {
      href: "/stock/booked-out",
      icon: Wrench,
      title: "Booked out",
      caption: "Units with technicians & returns",
    },
    {
      href: "/stock/requests",
      icon: ClipboardList,
      title: "Requests",
      caption: "Fulfill coordination pick lists",
    },
    {
      href: "/stock/scan",
      icon: ScanLine,
      title: "Scan",
      caption: "Find stock by QR or serial",
    },
    {
      href: "/stock/client-qrs",
      icon: QrCode,
      title: "Client QRs",
      caption: "Installed units, PINs & visits",
    },
    {
      href: "/stock/qr",
      icon: QrCode,
      title: "QR labels",
      caption: "Print & download QR stickers",
    },
  ];

  return (
    <PageShell>
      <PageHeader
        title="Stock"
        description="Inventory, QR tracking, and coordination pick lists"
        actions={
          <Link
            href="/stock/scan"
            className={buttonVariants({
              className: "bg-primary text-primary-foreground hover:bg-primary/90",
            })}
          >
            Scan unit
          </Link>
        }
      />

      {error ? <AlertBanner tone="danger">{error}</AlertBanner> : null}

      {!isLoaded ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Available units"
              value={available}
              subtitle="In the office, ready to book out"
              icon={PackageCheck}
              accent="#059669"
            />
            <StatCard
              title="Booked out"
              value={bookedOut}
              subtitle="With technicians or installed"
              icon={PackageOpen}
              accent="#D97706"
            />
            <StatCard
              title="Open requests"
              value={openRequests}
              subtitle="Pick lists awaiting fulfilment"
              icon={ClipboardList}
              accent="var(--primary)"
            />
            <StatCard
              title="Sundry lines"
              value={sundryLines}
              subtitle={
                sundriesOut > 0
                  ? `${sundriesOut} out of stock`
                  : "Consumables tracked by quantity"
              }
              icon={Boxes}
              accent="#0284C7"
            />
          </div>

          {lowStockProducts.length > 0 ? (
            <AlertBanner tone="warn">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1 space-y-2">
                <div>
                  <p className="font-medium">Low stock attention</p>
                  <p className="text-xs">
                    Products that are short for open pick lists or running low in the office.
                  </p>
                </div>
                {lowStockProducts.map((row) => (
                  <div
                    key={row.product.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border border-amber-200/80 bg-white/70 px-2.5 py-1.5 text-xs"
                  >
                    <span className="font-medium">{row.product.name}</span>
                    <span
                      className={
                        row.short || row.available === 0
                          ? "font-semibold text-red-700"
                          : "text-muted-foreground"
                      }
                    >
                      Available {row.available}
                      {row.openNeeded > 0 ? ` · Needed on open lists ${row.openNeeded}` : ""}
                    </span>
                  </div>
                ))}
                <Link
                  href="/stock/inventory"
                  className="inline-flex items-center gap-1 font-medium text-primary underline"
                >
                  Open inventory
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </AlertBanner>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Stock levels by product" description="Availability across every product line">
              {productRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No products yet.</p>
              ) : (
                <div className="space-y-3">
                  {productRows.map((row) => {
                    const pct =
                      row.total > 0 ? Math.round((row.available / row.total) * 100) : 0;
                    return (
                      <div key={row.product.id} className="space-y-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-medium">{row.product.name}</span>
                          <span className="flex gap-3 text-xs">
                            <span className="text-emerald-600">{row.available} available</span>
                            <span className="text-amber-600">{row.bookedOut} out</span>
                            <span className="text-muted-foreground">{row.total} total</span>
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full rounded-full ${
                              row.available === 0
                                ? "bg-red-400"
                                : row.short
                                  ? "bg-amber-400"
                                  : "bg-emerald-500"
                            }`}
                            style={{ width: `${Math.max(pct, row.total > 0 ? 4 : 0)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>

            <Panel
              title="Recently booked out"
              description="Latest units that left the office"
              padded={false}
            >
              <div className="divide-y divide-border">
                {recentBookings.length === 0 ? (
                  <p className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    Nothing is booked out right now.
                  </p>
                ) : (
                  <>
                    {recentBookings.map(({ booking, item, productName, technicianName }) => (
                      <div
                        key={booking.id}
                        className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm"
                      >
                        <div>
                          <p className="font-medium">
                            {productName}
                            {item.serialNumber ? (
                              <span className="ml-1 text-xs font-normal text-muted-foreground">
                                SN {item.serialNumber}
                              </span>
                            ) : null}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {technicianName}
                            {item.clientName ? ` · ${item.clientName}` : ""}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(booking.bookedOutAt)}
                        </span>
                      </div>
                    ))}
                    <div className="px-4 py-2.5">
                      <Link
                        href="/stock/booked-out"
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary underline"
                      >
                        View all booked-out stock
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </>
                )}
              </div>
            </Panel>
          </div>
        </>
      )}

      <Panel title="Shortcuts" padded={false}>
        <div className="grid sm:grid-cols-2 xl:grid-cols-3">
          {quickLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center gap-3 border-b border-border px-4 py-3 transition-colors hover:bg-muted/40 sm:border-r"
            >
              <link.icon className="h-4 w-4 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-medium">{link.title}</p>
                <p className="text-xs text-muted-foreground">{link.caption}</p>
              </div>
            </Link>
          ))}
        </div>
      </Panel>
    </PageShell>
  );
}
