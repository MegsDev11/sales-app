"use client";

import { useMemo, useState } from "react";
import { useStockAccess } from "@/lib/hooks/use-stock-access";
import { useStockStore } from "@/lib/store/stock-store";
import { useCrmStore } from "@/lib/store/crm-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, PackageCheck } from "lucide-react";

const dateFormatter = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Johannesburg",
});

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateFormatter.format(date);
}

export default function BookedOutStockPage() {
  const { allowed, isLoading } = useStockAccess();
  const { products, items, bookings, requests, returnItem, isLoaded, error } = useStockStore();
  const { users, getVisibleLeads } = useCrmStore();
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const leads = getVisibleLeads();

  const activeBookings = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bookings
      .filter((booking) => !booking.returnedAt)
      .map((booking) => {
        const item = items.find((candidate) => candidate.id === booking.itemId);
        if (!item || item.status !== "booked_out") return null;
        const product = products.find((candidate) => candidate.id === item.productId);
        const technician = users.find((candidate) => candidate.id === booking.technicianId);
        const lead = booking.leadId
          ? leads.find((candidate) => candidate.id === booking.leadId)
          : undefined;
        const request = booking.requestId
          ? requests.find((candidate) => candidate.id === booking.requestId)
          : undefined;
        const clientName = lead?.clientName || item.clientName || "No client linked";
        const searchable = [
          product?.name,
          product?.sku,
          item.brand,
          item.deviceName,
          item.serialNumber,
          item.qrToken,
          technician?.name,
          clientName,
          lead?.address,
          request?.title,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (q && !searchable.includes(q)) return null;
        return { booking, item, product, technician, lead, request, clientName };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .sort(
        (a, b) =>
          new Date(b.booking.bookedOutAt).getTime() -
          new Date(a.booking.bookedOutAt).getTime()
      );
  }, [bookings, items, products, users, leads, requests, query]);

  if (isLoading || !allowed) return null;

  async function handleReturn(itemId: string, label: string) {
    if (!window.confirm(`Book ${label} back into available inventory?`)) return;
    setBusyId(itemId);
    setMessage("");
    try {
      await returnItem(itemId);
      setMessage(`${label} was booked back into inventory.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Book-back failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-bold">Booked-out stock</h1>
        <p className="text-sm text-muted-foreground">
          See which technician and client has each unit, when it left stock, and book returns back
          in.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          className="max-w-sm"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search product, serial, tech, or client…"
        />
        <p className="text-sm font-medium">
          {activeBookings.length} unit{activeBookings.length === 1 ? "" : "s"} currently out
        </p>
      </div>

      {(error || message) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {message || error}
        </div>
      )}

      {!isLoaded ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : activeBookings.length === 0 ? (
        <Card className="bg-white">
          <CardContent className="py-10 text-center">
            <PackageCheck className="mx-auto mb-3 h-8 w-8 text-green-700" />
            <p className="font-medium">{query ? "No matching booked-out stock" : "All stock is in"}</p>
            <p className="text-sm text-muted-foreground">
              {query ? "Try a different search." : "There are no active stock bookings."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {activeBookings.map(
            ({ booking, item, product, technician, lead, request, clientName }) => {
              const itemLabel =
                [product?.name, item.deviceName].filter(Boolean).join(" · ") || "Stock unit";
              return (
                <Card key={booking.id} className="bg-white">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex flex-wrap items-start justify-between gap-2 text-base">
                      <span>{itemLabel}</span>
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                        Booked out
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <p className="text-xs text-muted-foreground">Technician</p>
                        <p className="font-semibold">
                          {technician?.name ?? booking.technicianId}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Client</p>
                        <p className="font-semibold">{clientName}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Serial number</p>
                        <p className="font-medium">{item.serialNumber || "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Booked out</p>
                        <p className="font-medium">{formatDate(booking.bookedOutAt)}</p>
                      </div>
                    </div>

                    {lead?.address && (
                      <p className="flex items-start gap-1 text-xs text-muted-foreground">
                        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        {lead.address}
                      </p>
                    )}
                    {request && (
                      <p className="text-xs text-muted-foreground">
                        Stock list: <span className="font-medium">{request.title}</span>
                      </p>
                    )}
                    {booking.notes && (
                      <p className="rounded border bg-gray-50 px-2 py-1 text-xs text-muted-foreground">
                        {booking.notes}
                      </p>
                    )}

                    <Button
                      className="w-full bg-[#C83733] hover:bg-[#a82f2b]"
                      disabled={busyId === item.id}
                      onClick={() =>
                        void handleReturn(
                          item.id,
                          `${product?.name ?? (item.deviceName || "unit")}${item.serialNumber ? ` (SN ${item.serialNumber})` : ""}`
                        )
                      }
                    >
                      {busyId === item.id ? "Booking back in…" : "Book back into stock"}
                    </Button>
                  </CardContent>
                </Card>
              );
            }
          )}
        </div>
      )}
    </div>
  );
}
