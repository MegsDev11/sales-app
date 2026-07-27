"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SUPPLIER_CATEGORIES, categoryLabel, type Supplier } from "@/lib/procurement/constants";
import { Loader2 } from "lucide-react";

export function SupplierFormDialog({
  open,
  onClose,
  onSaved,
  supplier,
  post,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  supplier: Supplier | null;
  post: (payload: Record<string, unknown>) => Promise<{ ok: boolean; id?: string }>;
}) {
  const isEdit = Boolean(supplier);

  const [name, setName] = useState(supplier?.name ?? "");
  const [contactName, setContactName] = useState(supplier?.contact_name ?? "");
  const [email, setEmail] = useState(supplier?.email ?? "");
  const [phone, setPhone] = useState(supplier?.phone ?? "");
  const [website, setWebsite] = useState(supplier?.website ?? "");
  const [address, setAddress] = useState(supplier?.address ?? "");
  const [leadTime, setLeadTime] = useState(String(supplier?.lead_time_days ?? 7));
  const [paymentTerms, setPaymentTerms] = useState(supplier?.payment_terms ?? "");
  const [category, setCategory] = useState(supplier?.category ?? "");
  const [active, setActive] = useState(supplier?.active ?? true);
  const [notes, setNotes] = useState(supplier?.notes ?? "");

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!name.trim()) return setError("Give the supplier a name.");
    setIsSaving(true);
    try {
      await post({
        action: isEdit ? "updateSupplier" : "createSupplier",
        supplierId: supplier?.id,
        name,
        contactName,
        email,
        phone,
        website,
        address,
        leadTimeDays: Number(leadTime) || 0,
        paymentTerms,
        category,
        active,
        notes,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit supplier" : "New supplier"}</DialogTitle>
        </DialogHeader>

        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="MiRO Distribution"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Contact person
              </label>
              <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
              >
                <option value="">Uncategorised</option>
                {SUPPLIER_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {categoryLabel(c)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Email</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Phone</label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Lead time (days)
              </label>
              <Input
                type="number"
                min={0}
                value={leadTime}
                onChange={(e) => setLeadTime(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Payment terms
              </label>
              <Input
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                placeholder="30 days"
              />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Website
              </label>
              <Input
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://…"
              />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Address
              </label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Notes</label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Active supplier
          </label>
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
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Saving…
              </>
            ) : isEdit ? (
              "Save changes"
            ) : (
              "Add supplier"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
