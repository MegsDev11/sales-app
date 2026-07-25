"use client";

import { PageHeader, PageShell } from "@/components/layout/page-shell";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { canAccessFinancial, isOwner } from "@/lib/permissions";
import type { FuelEntry } from "@megs/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function money(n: number) {
  return `R ${n.toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function FinancialFuelPage() {
  const { accessToken, currentUser, isLoading } = useAuth();
  const router = useRouter();
  const allowed = canAccessFinancial(currentUser) || isOwner(currentUser);
  const [entries, setEntries] = useState<FuelEntry[]>([]);
  const [totalPrice, setTotalPrice] = useState(0);
  const [totalLitres, setTotalLitres] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isLoading || !currentUser) return;
    if (!allowed) router.replace("/");
  }, [allowed, currentUser, isLoading, router]);

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

  if (isLoading || !allowed) return null;

  return (
    <PageShell>
      <PageHeader
        title="Fuel"
        description="Fuel fills logged by technicians from vehicle QR scans"
      />
      {error ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-4 text-sm">
          <span>
            Total litres:{" "}
            <strong>
              {totalLitres.toLocaleString("en-ZA", { maximumFractionDigits: 2 })}
            </strong>
          </span>
          <span>
            Total cost: <strong>{money(totalPrice)}</strong>
          </span>
          <span className="text-muted-foreground">
            {loading ? "Loading…" : `${entries.length} entries`}
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </div>

      {!loading && entries.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No fuel entries yet. Techs log fills from Updates → Vehicles after Stock
            prints vehicle QRs.
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">Date</th>
                <th className="px-3 py-2 font-semibold">Vehicle</th>
                <th className="px-3 py-2 font-semibold">Technician</th>
                <th className="px-3 py-2 font-semibold">Where</th>
                <th className="px-3 py-2 font-semibold text-right">Litres</th>
                <th className="px-3 py-2 font-semibold text-right">Price</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
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
                  <td className="px-3 py-2 text-right tabular-nums">{money(e.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}
