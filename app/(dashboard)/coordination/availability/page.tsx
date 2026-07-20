"use client";

import Link from "next/link";
import { useCoordinationAccess } from "@/lib/hooks/use-coordination-access";
import { useStockStore } from "@/lib/store/stock-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

export default function CoordinationAvailabilityPage() {
  const { allowed, isLoading } = useCoordinationAccess();
  const { products, productCounts, isLoaded, error } = useStockStore();

  if (isLoading || !allowed) return null;

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Stock availability</h1>
          <p className="text-sm text-muted-foreground">
            Read-only view of what’s on hand while you plan pick lists
          </p>
        </div>
        <Link
          href="/coordination/requests"
          className={buttonVariants({ className: "bg-[#C83733] hover:bg-[#a82f2b] text-white" })}
        >
          New pick list
        </Link>
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
            No products yet. Ask Stock to run the inventory migration / add products.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {products.map((product) => {
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
                    No units available — sending a pick list for this product will notify Stock of a
                    shortfall.
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
