"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, PageShell, Panel, AlertBanner } from "@/components/layout/page-shell";
import { buttonVariants } from "@/components/ui/button";
import { HeroFigure, StatTile } from "@/components/charts/primitives";
import { ColumnChart, BarChart } from "@/components/charts/bar-chart";
import { LineChart } from "@/components/charts/line-chart";
import { SERIES, STATUS, compact } from "@/components/charts/tokens";
import { momChange } from "@/lib/analytics/metrics";
import type { FuelEntry } from "@megs/shared";
import { Droplet, Fuel, Loader2, Truck, Wallet } from "lucide-react";

/**
 * Financial overview.
 *
 * Fuel is currently the only real cost feed in the system, so it is what this page
 * reports on honestly. Invoicing, expenses and budgets arrive in Phase 6 — tiles for
 * those are deliberately absent rather than shown as zeroes, which would read as
 * "we spent nothing" instead of "not tracked yet".
 */
export default function FinancialPage() {
  const { accessToken, can } = useAuth();

  const [entries, setEntries] = useState<FuelEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/financial/fuel", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load fuel data");
      setEntries(body.entries ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load fuel data");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const m = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) => {
      const start = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      return { start, end, label: start.toLocaleDateString("en-ZA", { month: "short" }) };
    });

    const inMonth = (e: FuelEntry, b: (typeof months)[number]) => {
      const t = new Date(e.recordedAt).getTime();
      return t >= b.start.getTime() && t < b.end.getTime();
    };

    const spendByMonth = months.map((b) =>
      entries.filter((e) => inMonth(e, b)).reduce((s, e) => s + (e.price ?? 0), 0)
    );
    const litresByMonth = months.map((b) =>
      entries.filter((e) => inMonth(e, b)).reduce((s, e) => s + (e.litres ?? 0), 0)
    );

    const byVehicle = new Map<string, { spend: number; litres: number; label: string }>();
    for (const e of entries) {
      const key = e.vehicleId;
      const label = e.vehicleNumberPlate || e.vehicleBrand || "Unknown vehicle";
      const prev = byVehicle.get(key) ?? { spend: 0, litres: 0, label };
      byVehicle.set(key, {
        label,
        spend: prev.spend + (e.price ?? 0),
        litres: prev.litres + (e.litres ?? 0),
      });
    }

    const byTech = new Map<string, number>();
    for (const e of entries) {
      const name = e.technicianName ?? "Unknown";
      byTech.set(name, (byTech.get(name) ?? 0) + (e.price ?? 0));
    }

    const totalSpend = entries.reduce((s, e) => s + (e.price ?? 0), 0);
    const totalLitres = entries.reduce((s, e) => s + (e.litres ?? 0), 0);

    return {
      months: months.map((b) => b.label),
      spendByMonth,
      litresByMonth,
      thisMonth: spendByMonth[spendByMonth.length - 1] ?? 0,
      change: momChange(spendByMonth),
      vehicles: Array.from(byVehicle.values())
        .map((v) => ({ label: v.label, value: Math.round(v.spend) }))
        .sort((a, b) => b.value - a.value),
      technicians: Array.from(byTech.entries())
        .map(([label, value]) => ({ label, value: Math.round(value) }))
        .sort((a, b) => b.value - a.value),
      totalSpend,
      totalLitres,
      avgPerLitre: totalLitres > 0 ? totalSpend / totalLitres : 0,
      fillCount: entries.length,
    };
  }, [entries]);

  return (
    <PageShell>
      <PageHeader
        title="Financial"
        description="Cost tracking and reporting"
        actions={
          <Link href="/financial/fuel" className={buttonVariants({ variant: "outline" })}>
            <Fuel className="mr-1.5 h-4 w-4" /> Fuel log
          </Link>
        }
      />

      {error ? <AlertBanner tone="danger">{error}</AlertBanner> : null}

      <AlertBanner tone="info">
        Fuel is the only cost feed connected so far. Invoicing, recurring client billing,
        expenses and budgets arrive in Phase 6.
      </AlertBanner>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <Panel title="This month">
          <HeroFigure
            label="Fuel spend"
            value={m.thisMonth}
            currency
            delta={m.change}
            deltaLabel="vs last month"
            higherIsBetter={false}
          />
        </Panel>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Total fuel spend"
            value={m.totalSpend}
            currency
            icon={Wallet}
            accent={SERIES[0]}
            trend={m.spendByMonth}
          />
          <StatTile
            label="Litres purchased"
            value={Math.round(m.totalLitres)}
            icon={Droplet}
            accent={SERIES[2]}
            trend={m.litresByMonth}
          />
          <StatTile
            label="Average per litre"
            value={`R${m.avgPerLitre.toFixed(2)}`}
            icon={Fuel}
            accent={SERIES[3]}
            higherIsBetter={false}
          />
          <StatTile
            label="Fill-ups logged"
            value={m.fillCount}
            icon={Truck}
            accent={SERIES[6]}
            href="/financial/fuel"
          />
        </div>
      </div>

      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading fuel data…
        </p>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <LineChart
              title="Fuel spend"
              subtitle="Total per month, last 6 months"
              labels={m.months}
              series={[{ label: "Spend", points: m.spendByMonth }]}
              currency
              area
            />
            <ColumnChart
              title="Litres purchased"
              subtitle="Volume per month"
              data={m.months.map((label, i) => ({
                label,
                value: Math.round(m.litresByMonth[i]),
              }))}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <BarChart
              title="Spend by vehicle"
              subtitle="Total fuel cost per vehicle, all time"
              data={m.vehicles}
              currency
            />
            <BarChart
              title="Spend by technician"
              subtitle="Who is logging the fills"
              data={m.technicians}
              currency
            />
          </div>
        </>
      )}

      {can("financial", "manage") && m.vehicles.length > 0 ? (
        <Panel
          title="Cost watchlist"
          description="Vehicles ranked by spend — the top of this list is where savings live"
          padded={false}
        >
          <ul className="divide-y divide-border">
            {m.vehicles.slice(0, 5).map((v, i) => (
              <li key={v.label} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-medium tabular-nums text-white"
                    style={{ background: i === 0 ? STATUS.serious : SERIES[0] }}
                  >
                    {i + 1}
                  </span>
                  <span className="text-sm">{v.label}</span>
                </span>
                <span className="text-sm font-medium tabular-nums">
                  {compact(v.value, true)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </PageShell>
  );
}
