"use client";

import { stockItemPublicUrl, useQrDataUrl } from "@/lib/hooks/use-qr-data-url";
import type { StockProduct, StockQrLabel } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Download } from "lucide-react";

export function PendingLabelCard({
  label,
  product,
}: {
  label: StockQrLabel;
  product: StockProduct | undefined;
}) {
  const url = stockItemPublicUrl(label.qrToken);
  const qr = useQrDataUrl(url);
  const fileName = `pending-${label.qrToken}.png`;

  return (
    <Card className="bg-white print:break-inside-avoid print:shadow-none">
      <CardContent className="flex flex-col items-center gap-3 p-4 sm:flex-row sm:items-start">
        <div className="shrink-0 rounded-lg border bg-white p-2">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt={`QR ${label.qrToken}`} className="h-36 w-36" />
          ) : (
            <div className="flex h-36 w-36 items-center justify-center text-xs text-muted-foreground">
              Generating…
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
            Not booked in
          </p>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            {product?.name ?? "Unit"}
          </p>
          <p className="font-semibold">
            {[label.brand, label.deviceName].filter(Boolean).join(" ") || product?.name || "—"}
          </p>
          <p>
            <span className="text-muted-foreground">Brand:</span> {label.brand || "—"}
          </p>
          <p>
            <span className="text-muted-foreground">Device:</span> {label.deviceName || "—"}
          </p>
          <p className="text-xs text-muted-foreground">
            Scan on Stock → Scan to book this unit into inventory.
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
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
