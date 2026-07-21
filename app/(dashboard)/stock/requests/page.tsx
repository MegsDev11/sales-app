"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useStockRequestsAccess } from "@/lib/hooks/use-stock-access";
import { useStockStore } from "@/lib/store/stock-store";
import { useCrmStore } from "@/lib/store/crm-store";
import { canAccessStock, canAccessCoordination, getFieldTechnicians } from "@/lib/permissions";
import { extractStockQrToken } from "@/lib/stock-qr-token";
import { BarcodeScanner } from "@/components/stock/barcode-scanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function StockRequestsPage() {
  const { allowed, isLoading, currentUser } = useStockRequestsAccess();
  const { accessToken } = useAuth();
  const {
    products,
    items,
    bookings,
    requests,
    createRequest,
    cancelRequest,
    fulfillScan,
    isLoaded,
    error,
    refresh,
  } = useStockStore();
  const { users, getVisibleLeads } = useCrmStore();

  const canCreate = canAccessCoordination(currentUser) || canAccessStock(currentUser);
  const canFulfill = canAccessStock(currentUser);

  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [techId, setTechId] = useState("");
  const [leadId, setLeadId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<{ productId: string; qtyNeeded: number }[]>([
    { productId: "", qtyNeeded: 1 },
  ]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [fulfillId, setFulfillId] = useState<string | null>(null);
  const [fulfillProductId, setFulfillProductId] = useState<string | null>(null);
  const [scanToken, setScanToken] = useState("");
  const [allocSerial, setAllocSerial] = useState("");
  const [allocClientName, setAllocClientName] = useState("");
  const [allocPppoe, setAllocPppoe] = useState("");
  const [allocWifiName, setAllocWifiName] = useState("");
  const [allocWifiPassword, setAllocWifiPassword] = useState("");
  const [allocMsg, setAllocMsg] = useState("");

  const techs = useMemo(() => getFieldTechnicians(users), [users]);
  const leads = getVisibleLeads().filter((l) => !l.deleted).slice(0, 200);

  const fulfillRequest = fulfillId
    ? requests.find((r) => r.id === fulfillId) ?? null
    : null;

  // Resolve the scanned/typed token to an inventory unit.
  const scannedItem = useMemo(() => {
    const token = extractStockQrToken(scanToken);
    if (!token) return null;
    return items.find((i) => i.qrToken === token) ?? null;
  }, [scanToken, items]);

  const scannedLineStatus = useMemo(() => {
    if (!scannedItem || !fulfillRequest) return null;
    if (scannedItem.status !== "available") return "unavailable" as const;
    // When opened from a specific line, the scanned unit must be that product.
    if (fulfillProductId && scannedItem.productId !== fulfillProductId) {
      return "wrong_product" as const;
    }
    const line = fulfillRequest.lines.find(
      (l) => l.productId === scannedItem.productId && l.qtyFulfilled < l.qtyNeeded
    );
    return line ? ("ok" as const) : ("no_line" as const);
  }, [scannedItem, fulfillRequest, fulfillProductId]);

  // Prefill detail fields when a unit is matched.
  useEffect(() => {
    if (!scannedItem) return;
    setAllocSerial(scannedItem.serialNumber ?? "");
    setAllocPppoe(scannedItem.clientPppoe ?? "");
    setAllocWifiName(scannedItem.wifiName ?? "");
    setAllocWifiPassword(scannedItem.wifiPassword ?? "");
    const requestClient = fulfillRequest?.leadId
      ? leads.find((l) => l.id === fulfillRequest.leadId)?.clientName
      : undefined;
    setAllocClientName(scannedItem.clientName || requestClient || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannedItem?.id]);

  if (isLoading || !allowed) return null;

  function resetAllocation() {
    setScanToken("");
    setAllocSerial("");
    setAllocClientName("");
    setAllocPppoe("");
    setAllocWifiName("");
    setAllocWifiPassword("");
    setAllocMsg("");
  }

  async function handleCreate() {
    if (!title.trim() || !techId || lines.some((l) => !l.productId || l.qtyNeeded < 1)) {
      setMsg("Fill title, technician, and at least one product line");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      await createRequest({
        title: title.trim(),
        technicianId: techId,
        leadId: leadId || null,
        notes,
        lines: lines.filter((l) => l.productId),
      });
      setCreateOpen(false);
      setTitle("");
      setTechId("");
      setLeadId("");
      setNotes("");
      setLines([{ productId: products[0]?.id ?? "", qtyNeeded: 1 }]);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleFulfill() {
    if (!fulfillId || !scanToken.trim()) return;
    if (scannedLineStatus === "wrong_product") {
      setAllocMsg("Scanned unit does not match this line's product");
      return;
    }
    setBusy(true);
    setAllocMsg("");
    try {
      await fulfillScan(fulfillId, extractStockQrToken(scanToken), {
        serialNumber: allocSerial,
        clientName: allocClientName,
        clientPppoe: allocPppoe,
        wifiName: allocWifiName,
        wifiPassword: allocWifiPassword,
      });
      resetAllocation();
      setAllocMsg("Unit booked out to request");
    } catch (e) {
      setAllocMsg(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Stock requests</h1>
          <p className="text-sm text-muted-foreground">
            Coordination sends pick lists; stock fulfills by scanning unit QR codes
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void refresh()}>
            Refresh
          </Button>
          {canCreate && (
            <Button
              className="bg-[#C83733] hover:bg-[#a82f2b]"
              onClick={() => {
                setLines([{ productId: products[0]?.id ?? "", qtyNeeded: 1 }]);
                setCreateOpen(true);
              }}
            >
              New request
            </Button>
          )}
        </div>
      </div>

      {(error || msg) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {msg || error}
        </div>
      )}

      {!isLoaded ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : requests.length === 0 ? (
        <Card className="bg-white">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No requests yet.
            {!accessToken ? " Sign in to load data." : null}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => {
            const tech = users.find((u) => u.id === req.technicianId);
            const lead = leads.find((l) => l.id === req.leadId);
            const open = req.status === "open" || req.status === "partial";
            const allocatedUnits = bookings
              .filter((b) => b.requestId === req.id && !b.returnedAt)
              .map((b) => items.find((i) => i.id === b.itemId))
              .filter((i): i is NonNullable<typeof i> => Boolean(i));
            return (
              <Card key={req.id} className="bg-white">
                <CardHeader className="pb-2">
                  <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                    <span>{req.title}</span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold capitalize">
                      {req.status}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p>
                    Tech: <strong>{tech?.name ?? req.technicianId}</strong>
                    {lead ? (
                      <>
                        {" "}
                        · Client: <strong>{lead.clientName}</strong>
                      </>
                    ) : null}
                  </p>
                  {req.notes ? <p className="text-muted-foreground">{req.notes}</p> : null}
                  <ul className="space-y-1">
                    {req.lines.map((line) => {
                      const product = products.find((p) => p.id === line.productId);
                      const lineOpen = line.qtyFulfilled < line.qtyNeeded;
                      return (
                        <li
                          key={line.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded border px-2 py-1"
                        >
                          <span>{product?.name ?? line.productId}</span>
                          <span className="flex items-center gap-2">
                            <span>
                              {line.qtyFulfilled}/{line.qtyNeeded}
                            </span>
                            {canFulfill && open && lineOpen && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs"
                                onClick={() => {
                                  resetAllocation();
                                  setFulfillProductId(line.productId);
                                  setFulfillId(req.id);
                                }}
                              >
                                Allocate
                              </Button>
                            )}
                            {!lineOpen && (
                              <span className="text-xs font-medium text-green-700">Done</span>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  {allocatedUnits.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">
                        Allocated units
                      </p>
                      <ul className="space-y-1">
                        {allocatedUnits.map((unit) => {
                          const product = products.find((p) => p.id === unit.productId);
                          return (
                            <li
                              key={unit.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded border bg-gray-50 px-2 py-1 text-xs"
                            >
                              <span className="font-medium">
                                {product?.name ?? unit.deviceName ?? unit.productId}
                              </span>
                              <span className="text-muted-foreground">
                                SN: {unit.serialNumber || "—"}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                  {canCreate && open && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void cancelRequest(req.id)}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New stock request</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="space-y-1">
              <label className="font-medium">Title</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Install — Farm XYZ"
              />
            </div>
            <div className="space-y-1">
              <label className="font-medium">Technician</label>
              <Select value={techId} onValueChange={(v) => v && setTechId(v)}>
                <SelectTrigger>
                  <SelectValue>
                    {(value) =>
                      value ? techs.find((t) => t.id === value)?.name ?? "Select tech" : "Select tech"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {techs.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="font-medium">Client (optional)</label>
              <Select
                value={leadId || "__none"}
                onValueChange={(v) => setLeadId(v === "__none" ? "" : (v ?? ""))}
              >
                <SelectTrigger>
                  <SelectValue>
                    {(value) =>
                      value === "__none" || !value
                        ? "Client"
                        : leads.find((lead) => lead.id === value)?.clientName ?? "Client"
                    }
                  </SelectValue>
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
            </div>
            <div className="space-y-2">
              <label className="font-medium">Lines</label>
              {lines.map((line, idx) => (
                <div key={idx} className="flex gap-2">
                  <Select
                    value={line.productId}
                    onValueChange={(v) => {
                      if (!v) return;
                      setLines((prev) =>
                        prev.map((l, i) => (i === idx ? { ...l, productId: v } : l))
                      );
                    }}
                  >
                  <SelectTrigger className="flex-1">
                    <SelectValue>
                      {(value) =>
                        value
                          ? products.find((p) => p.id === value)?.name ?? "Product"
                          : "Product"
                      }
                    </SelectValue>
                  </SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={1}
                    className="w-20"
                    value={line.qtyNeeded}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((l, i) =>
                          i === idx ? { ...l, qtyNeeded: Number(e.target.value) || 1 } : l
                        )
                      )
                    }
                  />
                </div>
              ))}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setLines((prev) => [
                    ...prev,
                    { productId: products[0]?.id ?? "", qtyNeeded: 1 },
                  ])
                }
              >
                Add line
              </Button>
            </div>
            <div className="space-y-1">
              <label className="font-medium">Notes</label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-[#C83733] hover:bg-[#a82f2b]"
              disabled={busy}
              onClick={() => void handleCreate()}
            >
              Submit request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!fulfillId}
        onOpenChange={(open) => {
          if (!open) {
            setFulfillId(null);
            setFulfillProductId(null);
            resetAllocation();
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto bg-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Allocate{" "}
              {fulfillProductId
                ? products.find((p) => p.id === fulfillProductId)?.name ?? "device"
                : "device"}{" "}
              to request
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            {fulfillRequest && (
              <div className="rounded-lg border bg-gray-50 px-3 py-2">
                <p className="font-medium">{fulfillRequest.title}</p>
                <p className="text-xs text-muted-foreground">
                  Tech:{" "}
                  {users.find((u) => u.id === fulfillRequest.technicianId)?.name ??
                    fulfillRequest.technicianId}
                  {fulfillRequest.leadId
                    ? ` · Client: ${
                        leads.find((l) => l.id === fulfillRequest.leadId)?.clientName ?? ""
                      }`
                    : ""}
                </p>
                {fulfillProductId && (
                  <p className="text-xs text-muted-foreground">
                    Scan a{" "}
                    <strong>
                      {products.find((p) => p.id === fulfillProductId)?.name ?? "unit"}
                    </strong>{" "}
                    QR sticker for this line.
                  </p>
                )}
              </div>
            )}

            <div className="space-y-1">
              <label className="font-medium">Unit QR</label>
              <p className="text-xs text-muted-foreground">
                Scan the inventory QR sticker, or paste/type the token (the part after{" "}
                <code>/i/</code>).
              </p>
              <div className="flex gap-2">
                <Input
                  value={scanToken}
                  onChange={(e) => setScanToken(e.target.value)}
                  placeholder="stk_…"
                  className="flex-1"
                />
              </div>
              <BarcodeScanner label="Scan QR" onResult={(text) => setScanToken(text)} />
              {scanToken.trim() && !scannedItem && (
                <p className="text-xs text-amber-700">No unit found for this token yet.</p>
              )}
              {scannedItem && (
                <div className="rounded-lg border bg-gray-50 px-3 py-2 text-xs">
                  <p className="font-medium">
                    {products.find((p) => p.id === scannedItem.productId)?.name ??
                      scannedItem.deviceName}
                  </p>
                  <p className="text-muted-foreground">
                    {scannedItem.brand ? `${scannedItem.brand} · ` : ""}
                    Status: {scannedItem.status.replace("_", " ")}
                  </p>
                  {scannedLineStatus === "unavailable" && (
                    <p className="mt-1 text-red-600">This unit is not available to book out.</p>
                  )}
                  {scannedLineStatus === "wrong_product" && (
                    <p className="mt-1 text-red-600">
                      This is a{" "}
                      {products.find((p) => p.id === scannedItem.productId)?.name ?? "different"}{" "}
                      unit — this line needs a{" "}
                      {products.find((p) => p.id === fulfillProductId)?.name ?? "different product"}
                      .
                    </p>
                  )}
                  {scannedLineStatus === "no_line" && (
                    <p className="mt-1 text-red-600">
                      This request has no open line for this product.
                    </p>
                  )}
                  {scannedLineStatus === "ok" && (
                    <p className="mt-1 text-green-700">Matches an open line on this request.</p>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className="font-medium">Serial number</label>
              <Input
                value={allocSerial}
                onChange={(e) => setAllocSerial(e.target.value)}
                placeholder="Scan or type the device SN"
              />
              <BarcodeScanner label="Scan SN barcode" onResult={(text) => setAllocSerial(text)} />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="font-medium">Client name</label>
                <Input
                  value={allocClientName}
                  onChange={(e) => setAllocClientName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="font-medium">Client PPPoE</label>
                <Input value={allocPppoe} onChange={(e) => setAllocPppoe(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="font-medium">WiFi name</label>
                <Input value={allocWifiName} onChange={(e) => setAllocWifiName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="font-medium">WiFi password</label>
                <Input
                  value={allocWifiPassword}
                  onChange={(e) => setAllocWifiPassword(e.target.value)}
                />
              </div>
            </div>

            {allocMsg && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                {allocMsg}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setFulfillId(null);
                setFulfillProductId(null);
                resetAllocation();
              }}
            >
              Close
            </Button>
            <Button
              className="bg-[#C83733] hover:bg-[#a82f2b]"
              disabled={busy || !scanToken.trim() || scannedLineStatus === "wrong_product"}
              onClick={() => void handleFulfill()}
            >
              Book out unit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
