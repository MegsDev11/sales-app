"use client";

import { useEffect, useState } from "react";
import { stockItemPublicUrl, useQrDataUrl } from "@/lib/hooks/use-qr-data-url";
import { useStockStore } from "@/lib/store/stock-store";
import type { StockItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Download, Trash2 } from "lucide-react";

export function ItemDetailDialog({
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
  const { updateItem, deleteItem, returnItem } = useStockStore();
  const [brand, setBrand] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const url = item ? stockItemPublicUrl(item.qrToken) : null;
  const qr = useQrDataUrl(url);

  useEffect(() => {
    if (item) {
      setBrand(item.brand);
      setDeviceName(item.deviceName);
      setSerialNumber(item.serialNumber);
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
      });
      setMsg("Saved — QR stickers still work; scan shows updated details.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleReturn() {
    setSaving(true);
    try {
      await returnItem(item!.id);
      setMsg("Returned to stock");
      onOpenChange(false);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Return failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (
      !window.confirm(
        "Remove this unit from stock? Its QR sticker will stop working. Use this only if the unit was added by mistake."
      )
    ) {
      return;
    }
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
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {productName} — {item.serialNumber || item.qrToken}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="flex flex-col items-center gap-2 rounded-xl border bg-gray-50 p-4">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="QR code" className="h-48 w-48" />
            ) : (
              <div className="flex h-48 w-48 items-center justify-center text-muted-foreground">
                Generating QR…
              </div>
            )}
            <p className="break-all text-center text-xs text-muted-foreground">{url}</p>
            {qr && (
              <a href={qr} download={`stock-${item.serialNumber || item.qrToken}.png`}>
                <Button type="button" size="sm" variant="outline">
                  <Download className="mr-1 h-4 w-4" />
                  Download QR
                </Button>
              </a>
            )}
          </div>

          <div className="space-y-2">
            <label className="font-medium">Brand</label>
            <Input value={brand} onChange={(e) => setBrand(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="font-medium">Device / model</label>
            <Input value={deviceName} onChange={(e) => setDeviceName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="font-medium">Serial number</label>
            <Input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">
            Status: <span className="font-semibold capitalize">{item.status.replace("_", " ")}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Book-outs happen from Tech Stock List or Scan — client and WiFi details are captured
            when the unit is allocated.
          </p>
          {msg && <p className="text-sm text-primary">{msg}</p>}

          {item.status === "booked_out" && (
            <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => void handleReturn()}>
              Return to stock
            </Button>
          )}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
            disabled={saving || item.status === "booked_out"}
            onClick={() => void handleDelete()}
          >
            <Trash2 className="mr-1 h-4 w-4" />
            Remove unit
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button
              type="button"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={saving}
              onClick={() => void handleSave()}
            >
              Save details
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
