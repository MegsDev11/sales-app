"use client";

import { PageHeader, PageShell } from "@/components/layout/page-shell";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import type { FuelEntry } from "@megs/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function money(n: number) {
  return `R ${n.toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function litresLabel(n: number) {
  return `${n.toLocaleString("en-ZA", { maximumFractionDigits: 2 })} L`;
}

function pricePerLitre(litres: number, price: number) {
  if (!litres || litres <= 0) return null;
  return price / litres;
}

export default function FinancialFuelPage() {
  const { accessToken } = useAuth();
  const [entries, setEntries] = useState<FuelEntry[]>([]);
  const [totalPrice, setTotalPrice] = useState(0);
  const [totalLitres, setTotalLitres] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const avgPerLitre = useMemo(
    () => pricePerLitre(totalLitres, totalPrice),
    [totalLitres, totalPrice]
  );

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const res = await fetch("/api/financial/fuel", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to load");
        return;
      }
      setEntries(json.entries ?? []);
      setTotalPrice(Number(json.totalPrice) || 0);
      setTotalLitres(Number(json.totalLitres) || 0);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PageShell>
      <PageHeader
        title="Fuel"
        description="Fuel fills logged by technicians from vehicle QR scans"
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
        }
      />
      {error ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Fuel totals</CardTitle>
          <p className="text-xs text-muted-foreground">
            Sum of logged litres and fill prices (price is the R total for each fill).
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Total litres
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {loading ? "…" : litresLabel(totalLitres)}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Avg price / L
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {loading ? "…" : avgPerLitre != null ? money(avgPerLitre) : "—"}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Total
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {loading ? "…" : money(totalPrice)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {loading
                  ? "Loading…"
                  : `${entries.length} entr${entries.length === 1 ? "y" : "ies"}`}
              </p>
            </div>
          </div>
          <p className="rounded-lg border border-border bg-white px-4 py-3 text-sm tabular-nums">
            <span className="text-muted-foreground">Calculation: </span>
            <strong>{litresLabel(totalLitres)}</strong>
            <span className="text-muted-foreground"> × </span>
            <strong>
              {avgPerLitre != null ? `${money(avgPerLitre)}/L` : "—"}
            </strong>
            <span className="text-muted-foreground"> = </span>
            <strong>{money(totalPrice)}</strong>
          </p>
        </CardContent>
      </Card>

      {!loading && entries.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No fuel entries yet. Techs log fills from Updates → Vehicles after Stock
            prints vehicle QRs.
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">Date</th>
                <th className="px-3 py-2 font-semibold">Vehicle</th>
                <th className="px-3 py-2 font-semibold">Technician</th>
                <th className="px-3 py-2 font-semibold">Where</th>
                <th className="px-3 py-2 font-semibold text-right">Litres</th>
                <th className="px-3 py-2 font-semibold text-right">R/L</th>
                <th className="px-3 py-2 font-semibold text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const perL = pricePerLitre(e.litres, e.price);
                return (
                  <tr key={e.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {new Date(e.recordedAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      {[e.vehicleBrand, e.vehicleNumberPlate].filter(Boolean).join(" · ") ||
                        e.vehicleId}
                    </td>
                    <td className="px-3 py-2">{e.technicianName ?? e.technicianId}</td>
                    <td className="px-3 py-2">{e.location || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {e.litres.toLocaleString("en-ZA", { maximumFractionDigits: 2 })}
                    </td>
                    {/* price is the R total for the fill; R/L is derived from it */}
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {perL != null ? money(perL) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {money(e.price)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {entries.length > 0 ? (
              <tfoot>
                <tr className="border-t border-border bg-muted/30 font-medium">
                  <td className="px-3 py-2" colSpan={4}>
                    Totals
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {totalLitres.toLocaleString("en-ZA", { maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {avgPerLitre != null ? money(avgPerLitre) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(totalPrice)}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      )}
    </PageShell>
  );
}
