"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { StockBooking, StockItem, StockProduct } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QrPortalPanel } from "@/components/stock/qr-portal-panel";

type PublicPayload = {
  item: StockItem;
  product: StockProduct | null;
  booking: StockBooking | null;
  technicianName: string | null;
  clientName: string | null;
};

export default function PublicStockItemPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;

  const [data, setData] = useState<PublicPayload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    fetch(`/api/stock/item/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Not found");
        setData(body as PublicPayload);
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
        <p className="text-lg font-semibold">Item not found</p>
        <p className="mt-2 text-sm text-white/60">{error}</p>
        <Link href="/" className="mt-4 inline-block text-[#e05752] underline">
          Home
        </Link>
      </div>
    );
  }

  if (!data || !token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b1220] text-sm text-white/60">
        Loading…
      </div>
    );
  }

  const { item, product, booking, technicianName, clientName } = data;

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
          <h1 className="mt-4 text-2xl font-bold">{product?.name ?? "Equipment"}</h1>
        </div>

        <Card className="border-white/10 bg-white text-gray-900">
          <CardHeader>
            <CardTitle className="text-base">Device details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Brand:</span> {item.brand || "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Device:</span> {item.deviceName || "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Serial:</span> {item.serialNumber || "—"}
            </p>
            {item.clientName ? (
              <p>
                <span className="text-muted-foreground">Client:</span> {item.clientName}
              </p>
            ) : null}
            {item.clientAddress ? (
              <p>
                <span className="text-muted-foreground">Address:</span> {item.clientAddress}
              </p>
            ) : null}
            {booking && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                <p className="font-semibold">Booked out</p>
                <p>Tech: {technicianName ?? booking.technicianId}</p>
                {clientName ? <p>Client: {clientName}</p> : null}
                <p className="text-xs">
                  Since {new Date(booking.bookedOutAt).toLocaleString("en-ZA")}
                </p>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Sign in below to view connection details, log work, or contact support.
            </p>
          </CardContent>
        </Card>

        <QrPortalPanel token={token} />
      </div>
    </div>
  );
}
