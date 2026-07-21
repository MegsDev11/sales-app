"use client";

import { useEffect, useState } from "react";
import { stockItemPublicUrl, useQrDataUrl } from "@/lib/hooks/use-qr-data-url";
import { useStockStore } from "@/lib/store/stock-store";
import type { StockItem, StockItemVisit, StockProduct } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Download, History, KeyRound, Pencil, Trash2 } from "lucide-react";

export function EditUnitDialog({
  item,
  productName,
  open,
  onOpenChange,
}: {
  item: StockItem | null;
  productName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { updateItem, deleteItem } = useStockStore();
  const [brand, setBrand] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [clientPppoe, setClientPppoe] = useState("");
  const [wifiName, setWifiName] = useState("");
  const [wifiPassword, setWifiPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (item) {
      setBrand(item.brand);
      setDeviceName(item.deviceName);
      setSerialNumber(item.serialNumber);
      setClientName(item.clientName ?? "");
      setClientAddress(item.clientAddress ?? "");
      setClientPppoe(item.clientPppoe ?? "");
      setWifiName(item.wifiName ?? "");
      setWifiPassword(item.wifiPassword ?? "");
      setMsg("");
    }
  }, [item]);

  if (!item) return null;

  async function handleSave() {
    setSaving(true);
    setMsg("");
    try {
      await updateItem(item!.id, {
        brand,
        deviceName,
        serialNumber,
        clientName,
        clientAddress,
        clientPppoe,
        wifiName,
        wifiPassword,
      });
      onOpenChange(false);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm("Delete this unit? Its QR sticker will stop working.")) return;
    setSaving(true);
    setMsg("");
    try {
      await deleteItem(item!.id);
      onOpenChange(false);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Edit {productName} — {item.serialNumber || item.qrToken}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="space-y-1">
            <label className="font-medium">Brand</label>
            <Input value={brand} onChange={(e) => setBrand(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="font-medium">Device / model</label>
            <Input value={deviceName} onChange={(e) => setDeviceName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="font-medium">Serial number</label>
            <Input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="font-medium">Client name</label>
            <Input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Client name"
            />
          </div>
          <div className="space-y-1">
            <label className="font-medium">Client address</label>
            <Input
              value={clientAddress}
              onChange={(e) => setClientAddress(e.target.value)}
              placeholder="Street, town"
            />
          </div>
          <div className="space-y-1">
            <label className="font-medium">Client PPPoE</label>
            <Input
              value={clientPppoe}
              onChange={(e) => setClientPppoe(e.target.value)}
              placeholder="client@megs"
            />
          </div>
          <div className="space-y-1">
            <label className="font-medium">WiFi name</label>
            <Input
              value={wifiName}
              onChange={(e) => setWifiName(e.target.value)}
              placeholder="SSID"
            />
          </div>
          <div className="space-y-1">
            <label className="font-medium">WiFi password</label>
            <Input
              value={wifiPassword}
              onChange={(e) => setWifiPassword(e.target.value)}
              placeholder="WiFi password"
            />
          </div>
          {msg && <p className="text-[#C83733]">{msg}</p>}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
            disabled={saving}
            onClick={() => void handleDelete()}
          >
            <Trash2 className="mr-1 h-4 w-4" />
            Delete unit
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-[#C83733] hover:bg-[#a82f2b]"
              disabled={saving}
              onClick={() => void handleSave()}
            >
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function VisitHistoryDialog({
  item,
  productName,
  open,
  onOpenChange,
}: {
  item: StockItem | null;
  productName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { getItemVisits } = useStockStore();
  const [visits, setVisits] = useState<StockItemVisit[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!open || !item) return;
    setLoading(true);
    setMsg("");
    void getItemVisits(item.id)
      .then(setVisits)
      .catch((e) => setMsg(e instanceof Error ? e.message : "Failed to load visits"))
      .finally(() => setLoading(false));
  }, [open, item, getItemVisits]);

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Visit history — {productName}
            {item.clientName ? ` · ${item.clientName}` : ""}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {loading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : visits.length === 0 ? (
            <p className="text-muted-foreground">No technician visits logged yet.</p>
          ) : (
            visits.map((visit) => (
              <div key={visit.id} className="rounded-lg border p-3">
                <p className="font-medium">{visit.technicianName ?? "Technician"}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(visit.submittedAt).toLocaleString("en-ZA")}
                </p>
                <p className="mt-2 whitespace-pre-wrap">{visit.workNotes}</p>
              </div>
            ))
          )}
          {msg && <p className="text-[#C83733]">{msg}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function QrPreviewCard({
  item,
  product,
  onEdit,
  onShowVisits,
  onRegeneratePin,
  clientPinMsg,
}: {
  item: StockItem;
  product: StockProduct | undefined;
  onEdit: (item: StockItem) => void;
  onShowVisits?: (item: StockItem) => void;
  onRegeneratePin?: (item: StockItem) => void;
  clientPinMsg?: string;
}) {
  const url = stockItemPublicUrl(item.qrToken);
  const qr = useQrDataUrl(url);
  const fileName = `stock-${item.serialNumber || item.qrToken}.png`;

  return (
    <Card className="bg-white print:break-inside-avoid print:shadow-none">
      <CardContent className="flex flex-col items-center gap-3 p-4 sm:flex-row sm:items-start">
        <div className="shrink-0 rounded-lg border bg-white p-2">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt={`QR ${item.serialNumber || item.qrToken}`} className="h-36 w-36" />
          ) : (
            <div className="flex h-36 w-36 items-center justify-center text-xs text-muted-foreground">
              Generating…
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#C83733]">
            {product?.name ?? "Unit"}
          </p>
          <p className="font-semibold">
            {[item.brand, item.deviceName].filter(Boolean).join(" ") || product?.name || "—"}
          </p>
          <p>
            <span className="text-muted-foreground">Serial:</span> {item.serialNumber || "—"}
          </p>
          <p>
            <span className="text-muted-foreground">Brand:</span> {item.brand || "—"}
          </p>
          <p>
            <span className="text-muted-foreground">Device:</span> {item.deviceName || "—"}
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
          {item.clientPppoe ? (
            <p>
              <span className="text-muted-foreground">Client PPPoE:</span> {item.clientPppoe}
            </p>
          ) : null}
          {item.wifiName ? (
            <p>
              <span className="text-muted-foreground">WiFi name:</span> {item.wifiName}
            </p>
          ) : null}
          <p className="capitalize">
            <span className="text-muted-foreground">Status:</span>{" "}
            {item.status.replace("_", " ")}
          </p>
          {item.hasClientPin !== undefined && (
            <p>
              <span className="text-muted-foreground">Client PIN:</span>{" "}
              {item.clientPin ? (
                <span className="font-mono text-base font-bold tracking-[0.2em] text-[#C83733]">
                  {item.clientPin}
                </span>
              ) : item.hasClientPin ? (
                <span className="text-xs text-amber-700">
                  Hidden legacy code — select New PIN
                </span>
              ) : (
                "Not set"
              )}
            </p>
          )}
          {clientPinMsg ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">
              {clientPinMsg}
            </p>
          ) : null}
          <p className="break-all text-xs text-muted-foreground print:hidden">{url}</p>
          <div className="flex flex-wrap gap-2 pt-2 print:hidden">
            {qr && (
              <a href={qr} download={fileName}>
                <Button type="button" size="sm" variant="outline">
                  <Download className="mr-1 h-4 w-4" />
                  Download
                </Button>
              </a>
            )}
            {onShowVisits && (
              <Button type="button" size="sm" variant="outline" onClick={() => onShowVisits(item)}>
                <History className="mr-1 h-4 w-4" />
                Visits
              </Button>
            )}
            {onRegeneratePin && (
              <Button type="button" size="sm" variant="outline" onClick={() => onRegeneratePin(item)}>
                <KeyRound className="mr-1 h-4 w-4" />
                New PIN
              </Button>
            )}
            <Button type="button" size="sm" variant="outline" onClick={() => onEdit(item)}>
              <Pencil className="mr-1 h-4 w-4" />
              Edit
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
