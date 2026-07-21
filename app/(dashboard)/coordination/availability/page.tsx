"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useCoordinationAccess } from "@/lib/hooks/use-coordination-access";
import { useStockStore } from "@/lib/store/stock-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Boxes, Package, RefreshCw } from "lucide-react";

export default function CoordinationAvailabilityPage() {
  const { allowed, isLoading } = useCoordinationAccess();
  const { products, sundries, productCounts, isLoaded, error, refresh } = useStockStore();
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refreshAvailability = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
      setLastUpdated(new Date());
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  useEffect(() => {
    if (!allowed) return;

    void refreshAvailability();
    const interval = window.setInterval(() => void refreshAvailability(), 15_000);
    const refreshOnFocus = () => void refreshAvailability();
    window.addEventListener("focus", refreshOnFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, [allowed, refreshAvailability]);

  if (isLoading || !allowed) return null;

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Stock availability</h1>
          <p className="text-sm text-muted-foreground">
            Live read-only view of serialized stock and sundries held by Stock
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={refreshing}
            onClick={() => void refreshAvailability()}
          >
            <RefreshCw className={`mr-1 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Link
            href="/coordination/requests"
            className={buttonVariants({ className: "bg-[#C83733] hover:bg-[#a82f2b] text-white" })}
          >
            New pick list
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
        <span>Synced automatically with Stock every 15 seconds and when this page regains focus.</span>
        <span>{lastUpdated ? `Last updated ${lastUpdated.toLocaleTimeString()}` : "Syncing…"}</span>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {!isLoaded ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : products.length === 0 && sundries.length === 0 ? (
        <Card className="bg-white">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No stock has been added by Stock yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Package className="h-4 w-4 text-[#C83733]" />
              Serialized products ({products.length})
            </h2>
            {products.length === 0 ? (
              <p className="text-sm text-muted-foreground">No serialized products have been added.</p>
            ) : (
              products.map((product) => {
                const counts = productCounts(product.id);
                const low = counts.available === 0;
                return (
                  <Card
                    key={product.id}
                    className={low ? "border-red-200 bg-red-50" : "bg-white"}
                  >
                    <CardHeader className="py-3">
                      <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                        <span>
                          {product.name}
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            {product.sku}
                          </span>
                        </span>
                        <div className="flex gap-3 text-xs font-semibold">
                          <span className={low ? "text-red-700" : "text-emerald-600"}>
                            {counts.available} available
                          </span>
                          <span className="text-amber-600">{counts.bookedOut} out</span>
                          <span className="text-muted-foreground">{counts.total} total</span>
                        </div>
                      </CardTitle>
                    </CardHeader>
                    {low && (
                      <CardContent className="pt-0 text-xs text-red-800">
                        No units available — sending a pick list for this product will notify Stock
                        of a shortfall.
                      </CardContent>
                    )}
                  </Card>
                );
              })
            )}
          </section>

          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Boxes className="h-4 w-4 text-[#C83733]" />
              Sundries and consumables ({sundries.length})
            </h2>
            {sundries.length === 0 ? (
              <Card className="bg-white">
                <CardContent className="py-4 text-sm text-muted-foreground">
                  No sundries have been added by Stock.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {sundries.map((sundry) => {
                  const empty = sundry.quantity === 0;
                  return (
                    <Card
                      key={sundry.id}
                      className={empty ? "border-red-200 bg-red-50" : "bg-white"}
                    >
                      <CardContent className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{sundry.name}</p>
                          {sundry.notes ? (
                            <p className="mt-1 text-xs text-muted-foreground">{sundry.notes}</p>
                          ) : null}
                        </div>
                        <p
                          className={`shrink-0 text-lg font-bold ${
                            empty ? "text-red-700" : "text-emerald-600"
                          }`}
                        >
                          {sundry.quantity}{" "}
                          <span className="text-xs font-normal">{sundry.unitLabel}</span>
                        </p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
