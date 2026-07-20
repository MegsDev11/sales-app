"use client";

import { useEffect, useState } from "react";
import { PACKAGES, SERVICE_ZONES } from "@/lib/data/packages";
import { useCrmStore } from "@/lib/store/crm-store";
import { useAuth } from "@/lib/auth-context";
import type { Lead, LeadFormData } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface LeadFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead?: Lead;
  onSaved?: (id: string) => void;
}

const defaultForm = (): LeadFormData => ({
  clientName: "",
  phone: "",
  email: "",
  serviceType: "fiber",
  packageTier: "Home Fiber 50Mbps",
  assignedToId: null,
  stage: "new_lead",
  currentActivity: "call",
  priority: "medium",
  leadSource: "website",
  coverageStatus: "pending_survey",
  serviceZone: "Pretoria North",
  temperature: "warm",
  dealValue: 899,
  discount: 0,
});

export function LeadFormDialog({ open, onOpenChange, lead, onSaved }: LeadFormDialogProps) {
  const { addLead, updateLead, users } = useCrmStore();
  const { currentUser, isAdmin } = useAuth();
  const [form, setForm] = useState<LeadFormData>(defaultForm());

  useEffect(() => {
    if (lead) {
      const { id, createdAt, stageEnteredAt, stageHistory, deleted, closedAt, ...rest } = lead;
      setForm(rest);
    } else {
      setForm({
        ...defaultForm(),
        assignedToId: isAdmin ? null : currentUser?.id ?? null,
      });
    }
  }, [lead, open, isAdmin, currentUser]);

  const salesReps = users.filter((u) => u.role === "sales");

  const handlePackageChange = (packageId: string) => {
    const pkg = PACKAGES.find((p) => p.id === packageId);
    if (pkg) {
      setForm((f) => ({
        ...f,
        packageTier: pkg.name,
        serviceType: pkg.serviceType,
        dealValue: pkg.price - (f.discount ?? 0),
      }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.clientName.trim()) return;
    if (lead) {
      updateLead(lead.id, form);
      onSaved?.(lead.id);
    } else {
      const id = addLead(form);
      onSaved?.(id);
    }
    onOpenChange(false);
  };

  const set = <K extends keyof LeadFormData>(key: K, value: LeadFormData[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{lead ? "Edit Lead" : "Add New Lead"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-foreground">Client Name *</label>
              <Input value={form.clientName} onChange={(e) => set("clientName", e.target.value)} required />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">Company</label>
              <Input value={form.company ?? ""} onChange={(e) => set("company", e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">Phone *</label>
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} required />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">Email</label>
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">Package</label>
              <Select onValueChange={(v) => { if (typeof v === "string") handlePackageChange(v); }}>
                <SelectTrigger className="mt-1 w-full"><SelectValue placeholder="Select package" /></SelectTrigger>
                <SelectContent>
                  {PACKAGES.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name} — R{p.price.toLocaleString()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">Deal Value (R)</label>
              <Input type="number" value={form.dealValue ?? ""} onChange={(e) => set("dealValue", Number(e.target.value))} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">Discount (R)</label>
              <Input type="number" value={form.discount ?? 0} onChange={(e) => set("discount", Number(e.target.value))} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">Priority</label>
              <Select value={form.priority} onValueChange={(v) => { if (typeof v === "string") set("priority", v as LeadFormData["priority"]); }}>
                <SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">Lead Source</label>
              <Select value={form.leadSource} onValueChange={(v) => { if (typeof v === "string") set("leadSource", v as LeadFormData["leadSource"]); }}>
                <SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="website">Website</SelectItem>
                  <SelectItem value="referral">Referral</SelectItem>
                  <SelectItem value="walk-in">Walk-in</SelectItem>
                  <SelectItem value="cold-call">Cold Call</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">Service Zone</label>
              <Select value={form.serviceZone} onValueChange={(v) => { if (typeof v === "string") set("serviceZone", v); }}>
                <SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SERVICE_ZONES.map((z) => <SelectItem key={z} value={z}>{z}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">Coverage</label>
              <Select value={form.coverageStatus} onValueChange={(v) => { if (typeof v === "string") set("coverageStatus", v as LeadFormData["coverageStatus"]); }}>
                <SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="pending_survey">Survey Needed</SelectItem>
                  <SelectItem value="not_available">No Coverage</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {isAdmin && (
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">Assign To</label>
                <Select value={form.assignedToId ?? "unassigned"} onValueChange={(v) => { if (typeof v === "string") set("assignedToId", v === "unassigned" ? null : v); }}>
                  <SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {salesReps.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-foreground">Address</label>
              <Input value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-foreground">Notes</label>
              <Textarea value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="bg-[#C83733] hover:bg-[#a82f2b]">
              {lead ? "Save Changes" : "Add Lead"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
