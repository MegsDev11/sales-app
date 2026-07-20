"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useStockRequestsAccess } from "@/lib/hooks/use-stock-access";
import { useStockStore } from "@/lib/store/stock-store";
import { useCrmStore } from "@/lib/store/crm-store";
import { canAccessStock, canAccessCoordination, getFieldTechnicians } from "@/lib/permissions";
import { extractStockQrToken } from "@/lib/stock-qr-token";
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
  const [scanToken, setScanToken] = useState("");

  const techs = useMemo(() => getFieldTechnicians(users), [users]);
  const leads = getVisibleLeads().filter((l) => !l.deleted).slice(0, 200);

  if (isLoading || !allowed) return null;

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
    setBusy(true);
    setMsg("");
    try {
      await fulfillScan(fulfillId, extractStockQrToken(scanToken));
      setScanToken("");
      setMsg("Unit booked out to request");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Scan failed");
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
                      return (
                        <li key={line.id} className="flex justify-between rounded border px-2 py-1">
                          <span>{product?.name ?? line.productId}</span>
                          <span>
                            {line.qtyFulfilled}/{line.qtyNeeded}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="flex flex-wrap gap-2">
                    {canFulfill && open && (
                      <Button size="sm" variant="outline" onClick={() => setFulfillId(req.id)}>
                        Scan to fulfill
                      </Button>
                    )}
                    {canCreate && open && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void cancelRequest(req.id)}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
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
                  <SelectValue placeholder="Select tech" />
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
                  <SelectValue placeholder="Client" />
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
                      <SelectValue placeholder="Product" />
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

      <Dialog open={!!fulfillId} onOpenChange={(open) => !open && setFulfillId(null)}>
        <DialogContent className="bg-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Scan unit onto request</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Paste the QR token from the sticker URL (the part after <code>/i/</code>), or type the
              full token.
            </p>
            <Input
              value={scanToken}
              onChange={(e) => setScanToken(e.target.value)}
              placeholder="stk_…"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFulfillId(null)}>
              Close
            </Button>
            <Button
              className="bg-[#C83733] hover:bg-[#a82f2b]"
              disabled={busy || !scanToken.trim()}
              onClick={() => void handleFulfill()}
            >
              Book out scanned unit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
