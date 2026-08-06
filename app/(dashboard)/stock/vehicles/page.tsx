"use client";

import { PageHeader, PageShell } from "@/components/layout/page-shell";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useCrmStore } from "@/lib/store/crm-store";
import { getFieldTechnicians } from "@/lib/permissions";
import { vehiclePublicUrl, useQrDataUrl } from "@/lib/hooks/use-qr-data-url";
import type { Vehicle } from "@megs/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, Printer } from "lucide-react";

function VehicleQrCard({ vehicle }: { vehicle: Vehicle }) {
  const url = vehiclePublicUrl(vehicle.qrToken);
  const dataUrl = useQrDataUrl(url);

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 p-4 sm:flex-row sm:items-start">
        <div className="rounded-lg border border-border bg-white p-2">
          {dataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={dataUrl} alt={`QR ${vehicle.numberPlate}`} className="h-40 w-40" />
          ) : (
            <div className="flex h-40 w-40 items-center justify-center text-xs text-muted-foreground">
              Generating…
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1 text-center sm:text-left">
          <p className="text-lg font-semibold">
            {vehicle.brand || "Vehicle"} · {vehicle.numberPlate}
          </p>
          <p className="text-sm text-muted-foreground">
            Driver: {vehicle.technicianName ?? vehicle.technicianId}
          </p>
          {/* Who physically has it now, which is not always the assigned driver. */}
          {vehicle.heldBy ? (
            <p className="text-sm font-medium text-amber-700">
              Out with {vehicle.heldBy.technicianName} since{" "}
              {new Date(vehicle.heldBy.since).toLocaleDateString("en-ZA", {
                day: "numeric",
                month: "short",
              })}
              {vehicle.heldBy.odometerStart != null
                ? ` · ${vehicle.heldBy.odometerStart.toLocaleString("en-ZA")} km`
                : ""}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">In the pool</p>
          )}
          <p className="break-all text-xs text-muted-foreground">{url}</p>
          <div className="flex flex-wrap justify-center gap-2 pt-2 sm:justify-start">
            {dataUrl ? (
              <a href={dataUrl} download={`vehicle-${vehicle.numberPlate}.png`}>
                <Button type="button" size="sm" variant="outline">
                  <Download className="mr-1 size-4" />
                  Download
                </Button>
              </a>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => window.print()}
            >
              <Printer className="mr-1 size-4" />
              Print
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function StockVehiclesPage() {
  const { accessToken } = useAuth();
  const { users } = useCrmStore();
  const techs = getFieldTechnicians(users);

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [brand, setBrand] = useState("");
  const [numberPlate, setNumberPlate] = useState("");
  const [technicianId, setTechnicianId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Vehicle | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    const res = await fetch("/api/stock/vehicles", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Failed to load vehicles");
      return;
    }
    setVehicles(json.vehicles ?? []);
    setError(null);
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createVehicle() {
    if (!accessToken || !technicianId || !numberPlate.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/stock/vehicles", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          brand: brand.trim(),
          numberPlate: numberPlate.trim(),
          technicianId,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Create failed");
      setCreated(json.vehicle);
      setBrand("");
      setNumberPlate("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="Vehicle QRs"
        description="Register fleet vehicles, assign a driver, and print QR labels for fuel logging"
      />
      {error ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Register vehicle</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Input
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="Brand e.g. Toyota"
          />
          <Input
            value={numberPlate}
            onChange={(e) => setNumberPlate(e.target.value.toUpperCase())}
            placeholder="Number plate"
            autoCapitalize="characters"
          />
          <Select
            value={technicianId || null}
            onValueChange={(v) => setTechnicianId(!v ? "" : String(v))}
          >
            <SelectTrigger className="w-full md:col-span-2">
              <SelectValue placeholder="Technician (driver)">
                {(value) =>
                  value
                    ? techs.find((t) => t.id === value)?.name ?? "Technician (driver)"
                    : "Technician (driver)"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {techs.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            className="bg-primary text-white hover:bg-primary/90 md:col-span-2"
            disabled={busy || !numberPlate.trim() || !technicianId}
            onClick={() => void createVehicle()}
          >
            {busy ? "Creating…" : "Create vehicle QR"}
          </Button>
        </CardContent>
      </Card>

      {created ? (
        <div className="space-y-2">
          <p className="text-sm font-semibold">Just created</p>
          <VehicleQrCard vehicle={created} />
        </div>
      ) : null}

      <div className="space-y-3">
        <p className="text-sm font-semibold">Fleet ({vehicles.length})</p>
        {vehicles.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              No vehicles yet. Create one above to print a fuel QR.
            </CardContent>
          </Card>
        ) : (
          vehicles.map((v) => <VehicleQrCard key={v.id} vehicle={v} />)
        )}
      </div>
    </PageShell>
  );
}
