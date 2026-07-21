"use client";

import { useEffect, useState } from "react";
import { stockItemPublicUrl, useQrDataUrl } from "@/lib/hooks/use-qr-data-url";
import { useStockStore } from "@/lib/store/stock-store";
import type { StockItem, StockProduct } from "@/lib/types";
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
import { Download, Pencil, Trash2 } from "lucide-react";

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

export function QrPreviewCard({
  item,
  product,
  onEdit,
}: {
  item: StockItem;
  product: StockProduct | undefined;
  onEdit: (item: StockItem) => void;
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
