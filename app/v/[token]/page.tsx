"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Public landing page for printed vehicle QR labels.
 *
 * The labels have always encoded /v/{token}, but this route never existed — a
 * phone-camera scan 404ed, and the QR only worked through the in-app scanner.
 * This page closes that gap: it identifies the vehicle and points staff at the
 * MEGS Field app, where fuel logging (and later booking) actually happens.
 */

type PublicVehicle = { brand: string; numberPlate: string };

export default function PublicVehiclePage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;

  const [vehicle, setVehicle] = useState<PublicVehicle | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    fetch(`/api/vehicles/public/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Not found");
        setVehicle(body.vehicle as PublicVehicle);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, [token]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0b1220] p-6 text-center text-white">
        <Image
          src="/megs-logo.png"
          alt="MEGS"
          width={180}
          height={64}
          className="mb-6 h-14 w-auto object-contain"
          priority
        />
        <p className="text-lg font-semibold">Vehicle not found</p>
        <p className="mt-2 text-sm text-white/60">{error}</p>
        <Link href="/" className="mt-4 inline-block text-[#e05752] underline">
          Home
        </Link>
      </div>
    );
  }

  if (!vehicle || !token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b1220] text-sm text-white/60">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b1220] text-white">
      <div className="mx-auto max-w-md space-y-4 p-4 py-10">
        <div className="text-center">
          <Image
            src="/megs-logo.png"
            alt="MEGS"
            width={200}
            height={72}
            className="mx-auto h-16 w-auto object-contain"
            priority
          />
          <h1 className="mt-4 text-2xl font-bold">{vehicle.brand || "MEGS vehicle"}</h1>
          <p className="mt-1 text-lg tracking-wide text-white/80">{vehicle.numberPlate}</p>
        </div>

        <Card className="border-white/10 bg-white/5 text-white">
          <CardHeader>
            <CardTitle className="text-base">MEGS staff</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-white/80">
            <p>
              Open the <span className="font-semibold text-white">MEGS Field</span> app and
              scan this code from <span className="font-semibold text-white">Vehicles</span>{" "}
              to log a fuel fill for this vehicle.
            </p>
            <p className="text-white/60">
              Fuel entries land on the Financial fuel tracker automatically.
            </p>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/5 text-white">
          <CardContent className="pt-6 text-sm text-white/60">
            Found this vehicle unattended or involved in an incident? Call the MEGS office
            and quote the number plate above.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
