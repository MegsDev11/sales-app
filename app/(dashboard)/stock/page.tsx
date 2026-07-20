"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useStockAccess } from "@/lib/hooks/use-stock-access";
import { useStockStore } from "@/lib/store/stock-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, ClipboardList, Package, ScanLine } from "lucide-react";

export default function StockOverviewPage() {
  const { allowed, isLoading } = useStockAccess();
  const { products, items, requests, productCounts, isLoaded, error } = useStockStore();

  const available = items.filter((i) => i.status === "available").length;
  const bookedOut = items.filter((i) => i.status === "booked_out").length;
  const openRequests = requests.filter(
    (r) => r.status === "open" || r.status === "partial"
  ).length;

  const lowStockProducts = useMemo(() => {
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
          available: counts.available,
          openNeeded,
          short: openNeeded > counts.available,
        };
      })
      .filter((row) => row.short || row.available <= 2)
      .slice(0, 8);
  }, [products, requests, productCounts, isLoaded]);

  if (isLoading || !allowed) return null;

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
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="bg-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Available</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-emerald-600">{available}</p>
            </CardContent>
          </Card>
          <Card className="bg-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Booked out</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-amber-600">{bookedOut}</p>
            </CardContent>
          </Card>
          <Card className="bg-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Open requests
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-[#C83733]">{openRequests}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {isLoaded && lowStockProducts.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-900">
              <AlertTriangle className="h-5 w-5" />
              Low stock attention
            </CardTitle>
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
            <Link href="/stock/inventory" className="inline-block text-[#C83733] underline">
              Open inventory
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Link
          href="/stock/inventory"
          className="flex items-center gap-3 rounded-xl border bg-white p-4 hover:border-[#C83733]/40"
        >
          <Package className="h-5 w-5 text-[#C83733]" />
          <div>
            <p className="font-semibold">Inventory</p>
            <p className="text-xs text-muted-foreground">Products, units &amp; QR codes</p>
          </div>
        </Link>
        <Link
          href="/stock/requests"
          className="flex items-center gap-3 rounded-xl border bg-white p-4 hover:border-[#C83733]/40"
        >
          <ClipboardList className="h-5 w-5 text-[#C83733]" />
          <div>
            <p className="font-semibold">Requests</p>
            <p className="text-xs text-muted-foreground">Fulfill coordination pick lists</p>
          </div>
        </Link>
        <Link
          href="/stock/scan"
          className="flex items-center gap-3 rounded-xl border bg-white p-4 hover:border-[#C83733]/40"
        >
          <ScanLine className="h-5 w-5 text-[#C83733]" />
          <div>
            <p className="font-semibold">Scan</p>
            <p className="text-xs text-muted-foreground">Open a unit by QR token</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
