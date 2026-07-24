"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useCoordinationAccess } from "@/lib/hooks/use-coordination-access";
import { useStockStore } from "@/lib/store/stock-store";
import { useCrmStore } from "@/lib/store/crm-store";
import { getFieldTechnicians } from "@/lib/permissions";
import { StatCard } from "@/components/stats/stat-card";
import {
  AlertBanner,
  PageHeader,
  PageShell,
  Panel,
} from "@/components/layout/page-shell";
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
    <PageShell>
      <PageHeader
        title="Coordination"
        description="Build daily stock pick lists for technicians and send them to Stock"
        actions={
          <Link
            href="/coordination/requests"
            className={buttonVariants({
              className: "bg-primary text-primary-foreground hover:bg-primary/90",
            })}
          >
            New pick list
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Open pick lists" value={openCount} icon={ClipboardList} accent="var(--primary)" />
        <StatCard title="Partial" value={partialCount} icon={ClipboardList} accent="#F59E0B" />
        <StatCard title="Active techs" value={techs.length} icon={Users} accent="#0EA5E9" />
        <StatCard
          title="Units available"
          value={items.filter((i) => i.status === "available").length}
          icon={Boxes}
          accent="#16A34A"
        />
      </div>

      {shortfallProducts.length > 0 ? (
        <AlertBanner tone="warn">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="font-medium">Availability attention</p>
            {shortfallProducts.map((row) => (
              <div
                key={row.product.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-amber-200/80 bg-white/70 px-2.5 py-1.5 text-xs"
              >
                <span className="font-medium">{row.product.name}</span>
                <span className={row.short ? "font-semibold text-red-700" : "text-muted-foreground"}>
                  Available {row.available}
                  {row.openNeeded > 0 ? ` · Needed on open lists ${row.openNeeded}` : ""}
                </span>
              </div>
            ))}
            <Link href="/coordination/availability" className="inline-block text-primary underline">
              View full availability
            </Link>
          </div>
        </AlertBanner>
      ) : null}

      <Panel title="Shortcuts" padded={false}>
        <div className="divide-y divide-border">
          {[
            {
              href: "/coordination/requests",
              title: "Pick lists",
              body: "Choose a tech, add products with live stock counts, then send to Stock.",
            },
            {
              href: "/coordination/technicians",
              title: "Technicians",
              body: "Add field techs for assignment, or deactivate people who no longer work here.",
            },
            {
              href: "/coordination/availability",
              title: "Availability",
              body: "See how many units of each product are available before you build the day’s list.",
            },
          ].map((item) => (
            <div key={item.href} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-sm font-medium">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.body}</p>
              </div>
              <Link href={item.href} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Open
              </Link>
            </div>
          ))}
        </div>
      </Panel>
    </PageShell>
  );
}
