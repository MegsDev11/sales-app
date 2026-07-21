"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useCoordinationAccess } from "@/lib/hooks/use-coordination-access";
import { useStockStore } from "@/lib/store/stock-store";
import { useCrmStore } from "@/lib/store/crm-store";
import { getFieldTechnicians } from "@/lib/permissions";
import type { User } from "@/lib/types";
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

export default function CoordinationRequestsPage() {
  const { allowed, isLoading } = useCoordinationAccess();
  const { accessToken } = useAuth();
  const {
    products,
    sundries,
    requests,
    createRequest,
    cancelRequest,
    updateRequestLines,
    productCounts,
    isLoaded,
    error,
    refresh,
  } = useStockStore();
  const { users, getVisibleLeads } = useCrmStore();
  const [apiTechs, setApiTechs] = useState<User[]>([]);

  const loadTechs = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await fetch("/api/coordination/technicians", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      if (!res.ok) return;
      const body = await res.json();
      setApiTechs((body.technicians ?? []).filter((t: User) => t.active !== false));
    } catch {
      /* ignore */
    }
  }, [accessToken]);

  useEffect(() => {
    void loadTechs();
  }, [loadTechs]);

  const techs = useMemo(() => {
    if (apiTechs.length > 0) return apiTechs;
    return getFieldTechnicians(users);
  }, [apiTechs, users]);
  const seniorTechs = useMemo(
    () => techs.filter((tech) => tech.technicianLevel === "senior"),
    [techs]
  );
  const leads = getVisibleLeads().filter((l) => !l.deleted).slice(0, 200);

  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [techId, setTechId] = useState("");
  const [leadId, setLeadId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<{ target: string; qtyNeeded: number }[]>([
    { target: "", qtyNeeded: 1 },
  ]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [editRequestId, setEditRequestId] = useState<string | null>(null);
  const [editLines, setEditLines] = useState<
    { id?: string; target: string; qtyNeeded: number; qtyFulfilled: number }[]
  >([]);
  const [editMsg, setEditMsg] = useState("");

  const editingRequest = useMemo(
    () => requests.find((r) => r.id === editRequestId) ?? null,
    [requests, editRequestId]
  );

  // Line targets are encoded as "product:{id}" or "sundry:{id}" so one select covers both.
  const decodeTarget = useCallback((target: string) => {
    if (target.startsWith("sundry:")) return { sundryId: target.slice(7) };
    if (target.startsWith("product:")) return { productId: target.slice(8) };
    return {};
  }, []);

  const targetName = useCallback(
    (target: string) => {
      const { productId, sundryId } = decodeTarget(target);
      if (sundryId) {
        const sundry = sundries.find((s) => s.id === sundryId);
        return sundry ? `${sundry.name} (sundry)` : "Sundry";
      }
      if (productId) {
        return products.find((p) => p.id === productId)?.name ?? "Product";
      }
      return "Product or sundry";
    },
    [decodeTarget, products, sundries]
  );

  const targetAvailable = useCallback(
    (target: string) => {
      const { productId, sundryId } = decodeTarget(target);
      if (sundryId) return sundries.find((s) => s.id === sundryId)?.quantity ?? 0;
      if (productId) return productCounts(productId).available;
      return null;
    },
    [decodeTarget, sundries, productCounts]
  );

  const lineWarnings = useMemo(() => {
    return lines.map((line) => {
      const available = targetAvailable(line.target);
      if (available === null) return null;
      if (line.qtyNeeded > available) {
        return `Need ${line.qtyNeeded}, only ${available} available`;
      }
      return null;
    });
  }, [lines, targetAvailable]);

  const hasShortfall = lineWarnings.some(Boolean);

  if (isLoading || !allowed) return null;

  function lineTargetOptions() {
    return (
      <SelectContent>
        {products.map((p) => {
          const avail = productCounts(p.id).available;
          return (
            <SelectItem key={p.id} value={`product:${p.id}`}>
              {p.name} (avail {avail})
            </SelectItem>
          );
        })}
        {sundries.map((s) => (
          <SelectItem key={s.id} value={`sundry:${s.id}`}>
            {s.name} — sundry (avail {s.quantity} {s.unitLabel})
          </SelectItem>
        ))}
      </SelectContent>
    );
  }

  async function handleCreate() {
    if (!title.trim() || !techId || lines.some((l) => !l.target || l.qtyNeeded < 1)) {
      setMsg("Fill title, senior technician, and at least one stock line");
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
        lines: lines
          .filter((l) => l.target)
          .map((l) => ({ ...decodeTarget(l.target), qtyNeeded: l.qtyNeeded })),
      });
      setCreateOpen(false);
      setTitle("");
      setTechId("");
      setLeadId("");
      setNotes("");
      setLines([{ target: products[0] ? `product:${products[0].id}` : "", qtyNeeded: 1 }]);
      setMsg(
        hasShortfall
          ? "Sent to Stock with shortfall warning — Stock was notified."
          : "Pick list sent to Stock."
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Send failed");
    } finally {
      setBusy(false);
    }
  }

  function openEdit(requestId: string) {
    const req = requests.find((r) => r.id === requestId);
    if (!req) return;
    setEditLines(
      req.lines.map((line) => ({
        id: line.id,
        target: line.sundryId ? `sundry:${line.sundryId}` : `product:${line.productId}`,
        qtyNeeded: line.qtyNeeded,
        qtyFulfilled: line.qtyFulfilled,
      }))
    );
    setEditMsg("");
    setEditRequestId(requestId);
  }

  async function handleSaveEdit() {
    if (!editRequestId) return;
    if (editLines.length === 0) {
      setEditMsg("Keep at least one line, or cancel the whole pick list instead.");
      return;
    }
    if (editLines.some((l) => !l.target || l.qtyNeeded < 1)) {
      setEditMsg("Every line needs a product or sundry and a quantity of at least 1.");
      return;
    }
    setBusy(true);
    setEditMsg("");
    try {
      await updateRequestLines(
        editRequestId,
        editLines.map((l) => ({
          id: l.id,
          ...decodeTarget(l.target),
          qtyNeeded: l.qtyNeeded,
        }))
      );
      setEditRequestId(null);
      setMsg("Pick list updated — Stock sees the changes immediately.");
    } catch (e) {
      setEditMsg(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Pick lists</h1>
          <p className="text-sm text-muted-foreground">
            Build the day’s stock list for a technician and send it to Stock to book out
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void refresh()}>
            Refresh
          </Button>
          <Button
            className="bg-[#C83733] hover:bg-[#a82f2b]"
            onClick={() => {
              setLines([
                { target: products[0] ? `product:${products[0].id}` : "", qtyNeeded: 1 },
              ]);
              setCreateOpen(true);
            }}
          >
            New pick list
          </Button>
        </div>
      </div>

      {(error || msg) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {msg || error}
        </div>
      )}

      {techs.length === 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          No active technicians yet.{" "}
          <Link href="/coordination/technicians" className="font-medium underline">
            Add a tech
          </Link>{" "}
          before sending pick lists.
        </div>
      )}
      {techs.length > 0 && seniorTechs.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          No senior technicians are available. Mark a wireless or fiber technician as Senior on the{" "}
          <Link href="/coordination/technicians" className="font-medium underline">
            Technicians page
          </Link>{" "}
          before creating a pick list.
        </div>
      )}

      {!isLoaded ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : requests.length === 0 ? (
        <Card className="bg-white">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No pick lists yet. Create one for today’s jobs.
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
                      const target = line.sundryId
                        ? `sundry:${line.sundryId}`
                        : `product:${line.productId}`;
                      const available = targetAvailable(target) ?? 0;
                      const remaining = Math.max(0, line.qtyNeeded - line.qtyFulfilled);
                      const short = remaining > available && open;
                      return (
                        <li
                          key={line.id}
                          className={`flex flex-wrap justify-between gap-2 rounded border px-2 py-1 ${
                            short ? "border-red-200 bg-red-50" : ""
                          }`}
                        >
                          <span>{targetName(target)}</span>
                          <span>
                            {line.qtyFulfilled}/{line.qtyNeeded}
                            {short ? (
                              <span className="ml-2 text-xs text-red-700">
                                (avail {available})
                              </span>
                            ) : null}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  {open && (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEdit(req.id)}>
                        Edit lines
                      </Button>
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

      <Dialog open={!!editRequestId} onOpenChange={(open) => !open && setEditRequestId(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto bg-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Edit pick list{editingRequest ? ` — ${editingRequest.title}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-xs text-muted-foreground">
              Add or remove stock lines, or change quantities. Lines that already have units
              booked out cannot be removed or reduced below what was fulfilled.
            </p>
            <div className="space-y-2">
              {editLines.map((line, idx) => {
                const locked = line.qtyFulfilled > 0;
                const available = targetAvailable(line.target);
                return (
                  <div key={line.id ?? `new-${idx}`} className="space-y-1">
                    <div className="flex gap-2">
                      <Select
                        value={line.target}
                        onValueChange={(v) => {
                          if (!v || locked) return;
                          setEditLines((prev) =>
                            prev.map((l, i) => (i === idx ? { ...l, target: v } : l))
                          );
                        }}
                      >
                        <SelectTrigger className="flex-1" disabled={locked}>
                          <SelectValue>
                            {(value) =>
                              typeof value === "string" && value
                                ? targetName(value)
                                : "Product or sundry"
                            }
                          </SelectValue>
                        </SelectTrigger>
                        {lineTargetOptions()}
                      </Select>
                      <Input
                        type="number"
                        min={Math.max(1, line.qtyFulfilled)}
                        className="w-20"
                        value={line.qtyNeeded}
                        onChange={(e) =>
                          setEditLines((prev) =>
                            prev.map((l, i) =>
                              i === idx
                                ? {
                                    ...l,
                                    qtyNeeded: Math.max(
                                      Math.max(1, l.qtyFulfilled),
                                      Number(e.target.value) || 1
                                    ),
                                  }
                                : l
                            )
                          )
                        }
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-red-600"
                        disabled={locked}
                        onClick={() =>
                          setEditLines((prev) => prev.filter((_, i) => i !== idx))
                        }
                      >
                        Remove
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {locked ? `Fulfilled ${line.qtyFulfilled} — line locked. ` : ""}
                      {available !== null ? `Available: ${available}` : ""}
                    </p>
                  </div>
                );
              })}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setEditLines((prev) => [
                    ...prev,
                    {
                      target: products[0] ? `product:${products[0].id}` : "",
                      qtyNeeded: 1,
                      qtyFulfilled: 0,
                    },
                  ])
                }
              >
                Add line
              </Button>
            </div>
            {editMsg && <p className="text-sm text-[#C83733]">{editMsg}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRequestId(null)}>
              Cancel
            </Button>
            <Button
              className="bg-[#C83733] hover:bg-[#a82f2b]"
              disabled={busy}
              onClick={() => void handleSaveEdit()}
            >
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto bg-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New pick list</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="space-y-1">
              <label className="font-medium">Title</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Tuesday installs — North"
              />
            </div>
            <div className="space-y-1">
              <label className="font-medium">Senior technician</label>
              <Select value={techId} onValueChange={(v) => v && setTechId(v)}>
                <SelectTrigger>
                  <SelectValue>
                    {(value) =>
                      value
                        ? seniorTechs.find((t) => t.id === value)?.name ?? "Select senior tech"
                        : "Select senior tech"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {seniorTechs.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} — Senior
                      {t.title ? ` — ${t.title}` : ""}
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
              <label className="font-medium">Stock lines</label>
              {lines.map((line, idx) => {
                const available = targetAvailable(line.target);
                const warn = lineWarnings[idx];
                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex gap-2">
                      <Select
                        value={line.target}
                        onValueChange={(v) => {
                          if (!v) return;
                          setLines((prev) =>
                            prev.map((l, i) => (i === idx ? { ...l, target: v } : l))
                          );
                        }}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue>
                            {(value) =>
                              typeof value === "string" && value
                                ? targetName(value)
                                : "Product or sundry"
                            }
                          </SelectValue>
                        </SelectTrigger>
                        {lineTargetOptions()}
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
                    {available !== null && (
                      <p className={`text-xs ${warn ? "font-medium text-red-700" : "text-muted-foreground"}`}>
                        Available: {available}
                        {warn ? ` — ${warn}` : ""}
                      </p>
                    )}
                  </div>
                );
              })}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setLines((prev) => [
                    ...prev,
                    { target: products[0] ? `product:${products[0].id}` : "", qtyNeeded: 1 },
                  ])
                }
              >
                Add line
              </Button>
            </div>
            {hasShortfall && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                Some lines need more than is available. You can still send — Stock will be notified
                of the shortfall.
              </p>
            )}
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
              disabled={busy || seniorTechs.length === 0}
              onClick={() => void handleCreate()}
            >
              Send to Stock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
