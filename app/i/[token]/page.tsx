"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { canAccessStock } from "@/lib/permissions";
import { useStockStore } from "@/lib/store/stock-store";
import { useCrmStore } from "@/lib/store/crm-store";
import type { StockBooking, StockItem, StockProduct } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  const { currentUser, accessToken, isLoading: authLoading } = useAuth();
  const canManage = canAccessStock(currentUser);
  const { bookOut, returnItem, refresh } = useStockStore();
  const { users, getVisibleLeads } = useCrmStore();

  const [data, setData] = useState<PublicPayload | null>(null);
  const [error, setError] = useState("");
  const [techId, setTechId] = useState("");
  const [leadId, setLeadId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

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

  const techs = users.filter(
    (u) => u.department === "coordination" || u.department === "stock" || u.role === "staff"
  );
  const leads = getVisibleLeads().filter((l) => !l.deleted).slice(0, 200);

  async function handleBookOut() {
    if (!data || !techId) return;
    setBusy(true);
    setMsg("");
    try {
      await bookOut({
        itemId: data.item.id,
        technicianId: techId,
        leadId: leadId || null,
      });
      await refresh();
      const res = await fetch(`/api/stock/item/${encodeURIComponent(token!)}`, {
        cache: "no-store",
      });
      setData(await res.json());
      setMsg("Booked out");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleReturn() {
    if (!data) return;
    setBusy(true);
    try {
      await returnItem(data.item.id);
      const res = await fetch(`/api/stock/item/${encodeURIComponent(token!)}`, {
        cache: "no-store",
      });
      setData(await res.json());
      setMsg("Returned");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <p className="text-lg font-semibold">Item not found</p>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        <Link href="/" className="mt-4 inline-block text-[#C83733] underline">
          Home
        </Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Loading stock item…
      </div>
    );
  }

  const { item, product, booking, technicianName, clientName } = data;

  return (
    <div className="mx-auto max-w-md space-y-4 p-4 py-10">
      <div className="text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-[#C83733]">
          Megs Waterberg Stock
        </p>
        <h1 className="mt-2 text-2xl font-bold">{product?.name ?? "Equipment"}</h1>
      </div>

      <Card className="bg-white">
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
          <p>
            <span className="text-muted-foreground">Status:</span>{" "}
            <span className="font-semibold capitalize">{item.status.replace("_", " ")}</span>
          </p>
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
        </CardContent>
      </Card>

      {!authLoading && canManage && accessToken && (
        <Card className="bg-white">
          <CardHeader>
            <CardTitle className="text-base">Stock actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {item.status === "available" && (
              <>
                <Select value={techId} onValueChange={(v) => v && setTechId(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Technician" />
                  </SelectTrigger>
                  <SelectContent>
                    {techs.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={leadId || "__none"}
                  onValueChange={(v) => setLeadId(v === "__none" ? "" : (v ?? ""))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Client (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">No client</SelectItem>
                    {leads.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.clientName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  className="w-full bg-[#C83733] hover:bg-[#a82f2b]"
                  disabled={busy || !techId}
                  onClick={() => void handleBookOut()}
                >
                  Book out
                </Button>
              </>
            )}
            {item.status === "booked_out" && (
              <Button
                className="w-full"
                variant="outline"
                disabled={busy}
                onClick={() => void handleReturn()}
              >
                Return to stock
              </Button>
            )}
            {msg && <p className="text-[#C83733]">{msg}</p>}
            <Link href="/stock/inventory" className="block text-center text-xs underline">
              Open inventory
            </Link>
          </CardContent>
        </Card>
      )}

      {!canManage && (
        <p className="text-center text-xs text-muted-foreground">
          Stock managers can book this unit out after signing in.
        </p>
      )}
    </div>
  );
}
