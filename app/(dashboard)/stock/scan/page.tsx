"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStockAccess } from "@/lib/hooks/use-stock-access";
import { extractStockQrToken } from "@/lib/stock-qr-token";
import { useStockStore } from "@/lib/store/stock-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function StockScanPage() {
  const { allowed, isLoading } = useStockAccess();
  const { items } = useStockStore();
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [error, setError] = useState("");

  if (isLoading || !allowed) return null;

  function go() {
    const token = extractStockQrToken(raw);
    if (!token) {
      setError("Enter a QR token or sticker URL");
      return;
    }
    const item = items.find((i) => i.qrToken === token);
    if (item) {
      router.push(`/stock/inventory?item=${item.id}`);
      return;
    }
    router.push(`/i/${token}`);
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-bold">Scan stock</h1>
        <p className="text-sm text-muted-foreground">
          Paste a QR URL or token from a sticker. Phone camera scanning opens the public item page
          when you scan the printed code.
        </p>
      </div>
      <Card className="bg-white">
        <CardHeader>
          <CardTitle className="text-base">Look up unit</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="https://…/i/stk_… or stk_…"
            onKeyDown={(e) => {
              if (e.key === "Enter") go();
            }}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button className="w-full bg-[#C83733] hover:bg-[#a82f2b]" onClick={go}>
            Open unit
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
