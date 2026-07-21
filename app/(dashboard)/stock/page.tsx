"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useStockAccess } from "@/lib/hooks/use-stock-access";
import { useStockStore } from "@/lib/store/stock-store";
import { useCrmStore } from "@/lib/store/crm-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  const kpis = [
    {
      label: "Available units",
      value: available,
      caption: "In the office, ready to book out",
      icon: PackageCheck,
      valueClass: "text-emerald-600",
      iconClass: "bg-emerald-50 text-emerald-600",
    },
    {
      label: "Booked out",
      value: bookedOut,
      caption: "With technicians or installed",
      icon: PackageOpen,
      valueClass: "text-amber-600",
      iconClass: "bg-amber-50 text-amber-600",
    },
    {
      label: "Open requests",
      value: openRequests,
      caption: "Pick lists awaiting fulfilment",
      icon: ClipboardList,
      valueClass: "text-[#C83733]",
      iconClass: "bg-red-50 text-[#C83733]",
    },
    {
      label: "Sundry lines",
      value: sundryLines,
      caption:
        sundriesOut > 0
          ? `${sundriesOut} out of stock`
          : "Consumables tracked by quantity",
      icon: Boxes,
      valueClass: "text-sky-600",
      iconClass: "bg-sky-50 text-sky-600",
    },
  ];

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
    <div className="space-y-6 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-bold">Stock</h1>
        <p className="text-sm text-muted-foreground">
          Inventory, QR tracking, and coordination pick lists
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {!isLoaded ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {kpis.map((kpi) => (
              <Card key={kpi.label} className="bg-white">
                <CardContent className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{kpi.label}</p>
                    <p className={`mt-1 text-3xl font-bold ${kpi.valueClass}`}>{kpi.value}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{kpi.caption}</p>
                  </div>
                  <div className={`rounded-lg p-2 ${kpi.iconClass}`}>
                    <kpi.icon className="h-5 w-5" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {lowStockProducts.length > 0 && (
            <Card className="border-amber-200 bg-amber-50">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base text-amber-900">
                  <AlertTriangle className="h-5 w-5" />
                  Low stock attention
                </CardTitle>
                <p className="text-xs text-amber-800">
                  Products that are short for open pick lists or running low in the office.
                </p>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {lowStockProducts.map((row) => (
                  <div
                    key={row.product.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2"
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
                  className="inline-flex items-center gap-1 text-[#C83733] underline"
                >
                  Open inventory
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="bg-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Stock levels by product</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Availability across every product line.
                </p>
              </CardHeader>
              <CardContent className="space-y-3 border-t pt-3 text-sm">
                {productRows.length === 0 ? (
                  <p className="text-muted-foreground">No products yet.</p>
                ) : (
                  productRows.map((row) => {
                    const pct =
                      row.total > 0 ? Math.round((row.available / row.total) * 100) : 0;
                    return (
                      <div key={row.product.id} className="space-y-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">{row.product.name}</span>
                          <span className="flex gap-3 text-xs">
                            <span className="text-emerald-600">{row.available} available</span>
                            <span className="text-amber-600">{row.bookedOut} out</span>
                            <span className="text-muted-foreground">{row.total} total</span>
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
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
                  })
                )}
              </CardContent>
            </Card>

            <Card className="bg-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Recently booked out</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Latest units that left the office.
                </p>
              </CardHeader>
              <CardContent className="space-y-2 border-t pt-3 text-sm">
                {recentBookings.length === 0 ? (
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    Nothing is booked out right now.
                  </p>
                ) : (
                  <>
                    {recentBookings.map(({ booking, item, productName, technicianName }) => (
                      <div
                        key={booking.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2"
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
                    <Link
                      href="/stock/booked-out"
                      className="inline-flex items-center gap-1 text-xs text-[#C83733] underline"
                    >
                      View all booked-out stock
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {quickLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="flex items-center gap-3 rounded-xl border bg-white p-4 transition-colors hover:border-[#C83733]/40"
          >
            <link.icon className="h-5 w-5 shrink-0 text-[#C83733]" />
            <div>
              <p className="font-semibold">{link.title}</p>
              <p className="text-xs text-muted-foreground">{link.caption}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
