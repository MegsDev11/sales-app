"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { fmtMoney, type SupplierWithStats } from "@/lib/procurement/constants";
import { Loader2, Plus, Trash2 } from "lucide-react";

export interface DraftLine {
  description: string;
  qtyOrdered: number;
  unitPrice: number;
  productId?: string | null;
  sundryId?: string | null;
}

const BLANK_LINE: DraftLine = { description: "", qtyOrdered: 1, unitPrice: 0 };

export function PoFormDialog({
  open,
  onClose,
  onCreated,
  suppliers,
  post,
  initialSupplierId = "",
  initialLines,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id?: string) => void;
  suppliers: SupplierWithStats[];
  post: (payload: Record<string, unknown>) => Promise<{ ok: boolean; id?: string }>;
  initialSupplierId?: string;
  initialLines?: DraftLine[];
}) {
  const [supplierId, setSupplierId] = useState(initialSupplierId);
  const [expectedAt, setExpectedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>(
    initialLines && initialLines.length ? initialLines : [{ ...BLANK_LINE }]
  );

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeSuppliers = suppliers.filter((s) => s.active);
  const subtotal = lines.reduce((n, l) => n + l.qtyOrdered * l.unitPrice, 0);

  const updateLine = (i: number, patch: Partial<DraftLine>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const submit = async () => {
    setError(null);
    if (!supplierId) return setError("Pick a supplier.");
    const clean = lines.filter((l) => l.description.trim() || l.productId || l.sundryId);
    if (clean.length === 0) return setError("Add at least one line item.");
    setIsSaving(true);
    try {
      const res = await post({
        action: "createPO",
        supplierId,
        expectedAt: expectedAt || null,
        notes,
        lines: clean.map((l) => ({
          description: l.description,
          qtyOrdered: l.qtyOrdered,
          unitPrice: l.unitPrice,
          productId: l.productId ?? null,
          sundryId: l.sundryId ?? null,
        })),
      });
      onCreated(res.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create purchase order");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-auto sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>New purchase order</DialogTitle>
        </DialogHeader>

        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Supplier
              </label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
              >
                <option value="">Select a supplier…</option>
                {activeSuppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {activeSuppliers.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Add a supplier first.
                </p>
              ) : null}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Expected delivery
              </label>
              <Input
                type="date"
                value={expectedAt}
                onChange={(e) => setExpectedAt(e.target.value)}
              />
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Line items</label>
              <span className="text-xs text-muted-foreground">
                Subtotal {fmtMoney(subtotal)} · +15% VAT
              </span>
            </div>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={l.description}
                    onChange={(e) => updateLine(i, { description: e.target.value })}
                    placeholder="Item description"
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    min={1}
                    value={l.qtyOrdered}
                    onChange={(e) =>
                      updateLine(i, { qtyOrdered: Math.max(1, Number(e.target.value) || 1) })
                    }
                    className="w-16"
                    title="Quantity"
                  />
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={l.unitPrice}
                    onChange={(e) => updateLine(i, { unitPrice: Number(e.target.value) || 0 })}
                    className="w-24"
                    title="Unit price"
                  />
                  <span className="w-24 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                    {fmtMoney(l.qtyOrdered * l.unitPrice)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() =>
                      setLines((prev) =>
                        prev.length === 1 ? [{ ...BLANK_LINE }] : prev.filter((_, idx) => idx !== i)
                      )
                    }
                    title="Remove line"
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => setLines((prev) => [...prev, { ...BLANK_LINE }])}
            >
              <Plus className="h-3.5 w-3.5" /> Add line
            </Button>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Notes</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Delivery instructions, quote reference…"
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={isSaving}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Creating…
              </>
            ) : (
              "Create draft PO"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
