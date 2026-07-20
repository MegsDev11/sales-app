"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useCoordinationAccess } from "@/lib/hooks/use-coordination-access";
import { useStockStore } from "@/lib/store/stock-store";
import { useCrmStore } from "@/lib/store/crm-store";
import { getFieldTechnicians } from "@/lib/permissions";
import { StatCard } from "@/components/stats/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { AlertTriangle, Boxes, ClipboardList, Users } from "lucide-react";

export default function CoordinationOverviewPage() {
  const { allowed, isLoading } = useCoordinationAccess();
  const { products, items, requests, productCounts, isLoaded } = useStockStore();
  const { users } = useCrmStore();

  const techs = useMemo(() => getFieldTechnicians(users), [users]);

  const openCount = requests.filter((r) => r.status === "open").length;
  const partialCount = requests.filter((r) => r.status === "partial").length;

  const shortfallProducts = useMemo(() => {
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Coordination</h1>
          <p className="text-sm text-muted-foreground">
            Build daily stock pick lists for technicians and send them to Stock
          </p>
        </div>
        <Link
          href="/coordination/requests"
          className={buttonVariants({ className: "bg-[#C83733] hover:bg-[#a82f2b] text-white" })}
        >
          New pick list
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Open pick lists" value={openCount} icon={ClipboardList} accent="#C83733" />
        <StatCard title="Partial" value={partialCount} icon={ClipboardList} accent="#F59E0B" />
        <StatCard title="Active techs" value={techs.length} icon={Users} accent="#0EA5E9" />
        <StatCard
          title="Units available"
          value={items.filter((i) => i.status === "available").length}
          icon={Boxes}
          accent="#16A34A"
        />
      </div>

      {shortfallProducts.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-900">
              <AlertTriangle className="h-5 w-5" />
              Availability attention
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {shortfallProducts.map((row) => (
              <div
                key={row.product.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2"
              >
                <span className="font-medium">{row.product.name}</span>
                <span className={row.short ? "font-semibold text-red-700" : "text-muted-foreground"}>
                  Available {row.available}
                  {row.openNeeded > 0 ? ` · Needed on open lists ${row.openNeeded}` : ""}
                </span>
              </div>
            ))}
            <Link href="/coordination/availability" className="inline-block text-[#C83733] underline">
              View full availability
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-white">
          <CardHeader>
            <CardTitle className="text-base">Pick lists</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Choose a tech, add products with live stock counts, then send to Stock for book-out.
            <Link
              href="/coordination/requests"
              className="mt-3 block font-medium text-[#C83733] underline"
            >
              Open pick lists
            </Link>
          </CardContent>
        </Card>
        <Card className="bg-white">
          <CardHeader>
            <CardTitle className="text-base">Technicians</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Add field techs for assignment, or deactivate people who no longer work here.
            <Link
              href="/coordination/technicians"
              className="mt-3 block font-medium text-[#C83733] underline"
            >
              Manage technicians
            </Link>
          </CardContent>
        </Card>
        <Card className="bg-white">
          <CardHeader>
            <CardTitle className="text-base">Availability</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            See how many units of each product are available before you build the day’s list.
            <Link
              href="/coordination/availability"
              className="mt-3 block font-medium text-[#C83733] underline"
            >
              Check stock levels
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
