"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useStockAccess } from "@/lib/hooks/use-stock-access";
import { extractStockQrToken } from "@/lib/stock-qr-token";
import { useStockStore } from "@/lib/store/stock-store";
import { useCrmStore } from "@/lib/store/crm-store";
import { BarcodeScanner } from "@/components/stock/barcode-scanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { StockItem, StockQrLabel } from "@/lib/types";

type SessionEntry = {
  id: string;
  kind: "return" | "intake";
  label: string;
  at: string;
};

export default function StockScanPage() {
  const { allowed, isLoading } = useStockAccess();
  const {
    products,
    items,
    bookings,
    qrLabels,
    claimQrLabel,
    returnByQr,
    isLoaded,
  } = useStockStore();
  const { users, getVisibleLeads } = useCrmStore();
  const router = useRouter();

  const [lookupRaw, setLookupRaw] = useState("");
  const [lookupError, setLookupError] = useState("");

  const [returnRaw, setReturnRaw] = useState("");
  const [returnMsg, setReturnMsg] = useState("");
  const [returnBusy, setReturnBusy] = useState(false);
  const [returnCount, setReturnCount] = useState(0);

  const [intakeRaw, setIntakeRaw] = useState("");
  const [intakeSerial, setIntakeSerial] = useState("");
  const [intakeMsg, setIntakeMsg] = useState("");
  const [intakeBusy, setIntakeBusy] = useState(false);
  const [intakeCount, setIntakeCount] = useState(0);

  const [sessionLog, setSessionLog] = useState<SessionEntry[]>([]);

  const productMap = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products]
  );

  const returnToken = extractStockQrToken(returnRaw);
  const returnItem = returnToken
    ? items.find((i) => i.qrToken === returnToken) ?? null
    : null;
  const returnBooking = returnItem
    ? bookings.find((b) => b.itemId === returnItem.id && !b.returnedAt) ?? null
    : null;
  const returnTech = returnBooking
    ? users.find((u) => u.id === returnBooking.technicianId)
    : null;
  const returnLead = returnBooking?.leadId
    ? getVisibleLeads().find((l) => l.id === returnBooking.leadId)
    : null;

  const intakeToken = extractStockQrToken(intakeRaw);
  const intakeLabel: StockQrLabel | null = intakeToken
    ? qrLabels.find((l) => l.qrToken === intakeToken && !l.claimedAt) ?? null
    : null;
  const intakeExistingItem = intakeToken
    ? items.find((i) => i.qrToken === intakeToken) ?? null
    : null;

  if (isLoading || !allowed) return null;

  function pushLog(kind: SessionEntry["kind"], label: string) {
    setSessionLog((prev) => [
      { id: `${Date.now()}-${prev.length}`, kind, label, at: new Date().toISOString() },
      ...prev,
    ].slice(0, 20));
  }

  function goLookup() {
    const token = extractStockQrToken(lookupRaw);
    if (!token) {
      setLookupError("Enter a QR token or sticker URL");
      return;
    }
    setLookupError("");
    const item = items.find((i) => i.qrToken === token);
    if (item) {
      router.push(`/stock/inventory?item=${item.id}`);
      return;
    }
    const pending = qrLabels.find((l) => l.qrToken === token && !l.claimedAt);
    if (pending) {
      setIntakeRaw(token);
      setLookupError("This is a pending label — use Book new stock in below.");
      return;
    }
    router.push(`/i/${token}`);
  }

  async function handleReturn() {
    if (!returnToken) {
      setReturnMsg("Scan or paste a unit QR first");
      return;
    }
    setReturnBusy(true);
    setReturnMsg("");
    try {
      const item = await returnByQr(returnToken);
      const productName = item
        ? productMap.get(item.productId)?.name ?? "Unit"
        : "Unit";
      const sn = item?.serialNumber ? ` · SN ${item.serialNumber}` : "";
      setReturnCount((c) => c + 1);
      pushLog("return", `${productName}${sn}`);
      setReturnRaw("");
      setReturnMsg(`${productName} booked back into inventory (+1 available)`);
    } catch (e) {
      setReturnMsg(e instanceof Error ? e.message : "Return failed");
    } finally {
      setReturnBusy(false);
    }
  }

  async function handleIntake() {
    if (!intakeToken) {
      setIntakeMsg("Scan or paste a pending label QR first");
      return;
    }
    setIntakeBusy(true);
    setIntakeMsg("");
    try {
      const item = await claimQrLabel(intakeToken, intakeSerial);
      const productName = item
        ? productMap.get(item.productId)?.name ?? "Unit"
        : "Unit";
      const sn = intakeSerial.trim()
        ? ` · SN ${intakeSerial.trim()}`
        : item?.serialNumber
          ? ` · SN ${item.serialNumber}`
          : "";
      setIntakeCount((c) => c + 1);
      pushLog("intake", `${productName}${sn}`);
      setIntakeRaw("");
      setIntakeSerial("");
      setIntakeMsg(`${productName} booked into inventory (+1 available)`);
    } catch (e) {
      setIntakeMsg(e instanceof Error ? e.message : "Book-in failed");
    } finally {
      setIntakeBusy(false);
    }
  }

  function describeItem(item: StockItem) {
    const product = productMap.get(item.productId);
    return {
      title: product?.name ?? (item.deviceName || "Unit"),
      detail: [item.brand, item.deviceName, item.serialNumber ? `SN ${item.serialNumber}` : null]
        .filter(Boolean)
        .join(" · "),
    };
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-bold">Scan stock</h1>
        <p className="text-sm text-muted-foreground">
          Book devices back in, claim new batch labels into inventory, or look up a unit.
        </p>
        {isLoaded && (
          <p className="mt-1 text-xs text-muted-foreground">
            Session: {returnCount} returned · {intakeCount} booked in
            {qrLabels.filter((l) => !l.claimedAt).length > 0
              ? ` · ${qrLabels.filter((l) => !l.claimedAt).length} pending labels`
              : ""}
          </p>
        )}
      </div>

      <Card className="bg-white">
        <CardHeader>
          <CardTitle className="text-base">Book stock back in</CardTitle>
          <p className="text-xs text-muted-foreground">
            When a tech returns a router, scan its QR to check it back into inventory (+1 available).
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={returnRaw}
            onChange={(e) => {
              setReturnRaw(e.target.value);
              setReturnMsg("");
            }}
            placeholder="https://…/i/stk_… or stk_…"
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleReturn();
            }}
          />
          <BarcodeScanner
            label="Scan QR to return"
            onResult={(text) => {
              setReturnRaw(text);
              setReturnMsg("");
            }}
          />
          {returnItem && (
            <div className="rounded-lg border bg-gray-50 px-3 py-2 text-xs">
              <p className="font-medium">{describeItem(returnItem).title}</p>
              <p className="text-muted-foreground">{describeItem(returnItem).detail || "—"}</p>
              <p className="capitalize text-muted-foreground">
                Status: {returnItem.status.replace("_", " ")}
              </p>
              {returnTech && (
                <p className="text-muted-foreground">
                  Booked out to: {returnTech.name}
                  {returnLead ? ` · ${returnLead.clientName}` : ""}
                </p>
              )}
              {returnItem.status === "available" && (
                <p className="mt-1 text-amber-700">Already in inventory.</p>
              )}
              {returnItem.status === "booked_out" && (
                <p className="mt-1 text-green-700">Ready to book back in.</p>
              )}
            </div>
          )}
          {returnRaw.trim() && !returnItem && (
            <p className="text-xs text-amber-700">No registered unit found for this QR.</p>
          )}
          {returnMsg && (
            <p
              className={`text-sm ${
                /failed|already|not|error|retired/i.test(returnMsg) &&
                !/booked back/i.test(returnMsg)
                  ? "text-red-600"
                  : "text-green-700"
              }`}
            >
              {returnMsg}
            </p>
          )}
          <Button
            className="w-full bg-[#C83733] hover:bg-[#a82f2b]"
            disabled={returnBusy || !returnToken}
            onClick={() => void handleReturn()}
          >
            Book back into inventory
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-white">
        <CardHeader>
          <CardTitle className="text-base">Book new stock in</CardTitle>
          <p className="text-xs text-muted-foreground">
            Scan a pending batch label (from Generate QR). Each successful scan adds +1 to
            inventory. Optional: scan or type the device serial.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">Label QR</label>
            <Input
              value={intakeRaw}
              onChange={(e) => {
                setIntakeRaw(e.target.value);
                setIntakeMsg("");
              }}
              placeholder="https://…/i/stk_… or stk_…"
            />
            <BarcodeScanner
              label="Scan label QR"
              onResult={(text) => {
                setIntakeRaw(text);
                setIntakeMsg("");
              }}
            />
          </div>
          {intakeLabel && (
            <div className="rounded-lg border bg-gray-50 px-3 py-2 text-xs">
              <p className="font-medium text-amber-800">Pending label</p>
              <p className="font-medium">
                {productMap.get(intakeLabel.productId)?.name ?? "Product"}
              </p>
              <p className="text-muted-foreground">
                {[intakeLabel.brand, intakeLabel.deviceName].filter(Boolean).join(" · ") || "—"}
              </p>
              <p className="mt-1 text-green-700">Ready to book into inventory.</p>
            </div>
          )}
          {intakeExistingItem && !intakeLabel && (
            <p className="text-xs text-amber-700">
              This QR is already a registered unit ({describeItem(intakeExistingItem).title}). Use
              Book stock back in if it was returned.
            </p>
          )}
          {intakeRaw.trim() && !intakeLabel && !intakeExistingItem && (
            <p className="text-xs text-amber-700">
              No pending label found. Generate a batch on Generate QR first.
            </p>
          )}
          <div className="space-y-1">
            <label className="text-sm font-medium">Serial number (optional)</label>
            <Input
              value={intakeSerial}
              onChange={(e) => setIntakeSerial(e.target.value)}
              placeholder="Scan or type device SN"
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleIntake();
              }}
            />
            <BarcodeScanner label="Scan SN barcode" onResult={(text) => setIntakeSerial(text)} />
          </div>
          {intakeMsg && (
            <p
              className={`text-sm ${
                /failed|already|not|error|could/i.test(intakeMsg) &&
                !/booked into/i.test(intakeMsg)
                  ? "text-red-600"
                  : "text-green-700"
              }`}
            >
              {intakeMsg}
            </p>
          )}
          <Button
            className="w-full bg-[#C83733] hover:bg-[#a82f2b]"
            disabled={intakeBusy || !intakeToken}
            onClick={() => void handleIntake()}
          >
            Book into inventory
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-white">
        <CardHeader>
          <CardTitle className="text-base">Look up unit</CardTitle>
          <p className="text-xs text-muted-foreground">
            Open a registered unit in inventory, or the public sticker page.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={lookupRaw}
            onChange={(e) => setLookupRaw(e.target.value)}
            placeholder="https://…/i/stk_… or stk_…"
            onKeyDown={(e) => {
              if (e.key === "Enter") goLookup();
            }}
          />
          <BarcodeScanner label="Scan to look up" onResult={(text) => setLookupRaw(text)} />
          {lookupError && <p className="text-sm text-red-600">{lookupError}</p>}
          <Button className="w-full bg-[#C83733] hover:bg-[#a82f2b]" onClick={goLookup}>
            Open unit
          </Button>
        </CardContent>
      </Card>

      {sessionLog.length > 0 && (
        <Card className="bg-white">
          <CardHeader>
            <CardTitle className="text-base">This session</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {sessionLog.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between gap-2 rounded border px-2 py-1 text-xs"
                >
                  <span>
                    <span className="font-semibold capitalize">{entry.kind}</span>
                    {" · "}
                    {entry.label}
                  </span>
                  <span className="text-muted-foreground">
                    {new Date(entry.at).toLocaleTimeString()}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
