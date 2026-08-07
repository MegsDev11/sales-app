"use client";

import { useEffect, useMemo, useState } from "react";
import { PACKAGES } from "@/lib/data/packages";
import { useCrmStore } from "@/lib/store/crm-store";
import { useAuth } from "@/lib/auth-context";
import { getSalesStaff } from "@/lib/permissions";
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
  serviceZone: "",
  temperature: "warm",
  dealValue: 899,
  discount: 0,
  clientPppoe: "",
  wifiName: "",
  wifiPassword: "",
  towerId: null,
  towerSiteId: null,
});

function leadToFormData(lead: Lead): LeadFormData {
  return {
    clientName: lead.clientName,
    company: lead.company,
    phone: lead.phone,
    email: lead.email,
    serviceType: lead.serviceType,
    packageTier: lead.packageTier,
    assignedToId: lead.assignedToId,
    stage: lead.stage,
    currentActivity: lead.currentActivity,
    priority: lead.priority,
    closedAt: lead.closedAt,
    dealValue: lead.dealValue,
    discount: lead.discount,
    leadSource: lead.leadSource,
    address: lead.address,
    clientPppoe: lead.clientPppoe ?? "",
    wifiName: lead.wifiName ?? "",
    wifiPassword: lead.wifiPassword ?? "",
    notes: lead.notes,
    nextFollowUpAt: lead.nextFollowUpAt,
    nextAction: lead.nextAction,
    coverageStatus: lead.coverageStatus,
    serviceZone: lead.serviceZone,
    siteSurveyDate: lead.siteSurveyDate,
    siteSurveyNotes: lead.siteSurveyNotes,
    lostReason: lead.lostReason,
    installationStatus: lead.installationStatus,
    installationDate: lead.installationDate,
    temperature: lead.temperature,
    inboxDismissedAt: lead.inboxDismissedAt,
    towerId: lead.towerId ?? null,
    towerSiteId: lead.towerSiteId ?? null,
  };
}

export function LeadFormDialog({ open, onOpenChange, lead, onSaved }: LeadFormDialogProps) {
  const { addLead, updateLead, users, towers, towerSites } = useCrmStore();
  const { currentUser, isAdmin } = useAuth();
  const [form, setForm] = useState<LeadFormData>(defaultForm());

  const sortedTowers = useMemo(
    () => [...towers].sort((a, b) => a.name.localeCompare(b.name)),
    [towers]
  );

  const sitesForArea = useMemo(() => {
    if (!form.towerId) return [];
    return towerSites
      .filter((s) => s.areaId === form.towerId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [towerSites, form.towerId]);

  // Only hydrate when the dialog opens (or the edited lead changes) —
  // not on every store refresh, which was wiping in-progress edits.
  useEffect(() => {
    if (!open) return;
    if (lead) {
      const data = leadToFormData(lead);
      if (!data.towerSiteId && data.towerId && data.serviceZone) {
        const match = towerSites.find(
          (s) => s.areaId === data.towerId && s.name === data.serviceZone
        );
        if (match) data.towerSiteId = match.id;
      }
      if (!data.towerId && data.serviceZone) {
        const area = towers.find((t) => t.name === data.serviceZone);
        if (area) data.towerId = area.id;
      }
      setForm(data);
    } else {
      setForm({
        ...defaultForm(),
        assignedToId: isAdmin ? null : currentUser?.id ?? null,
      });
    }
    // `lead?.id`, not `lead`: the store hands back a new lead object on every
    // refresh, and depending on the object would refill the form — discarding
    // whatever the user had typed — each time anything in the CRM changed. The
    // form is seeded when a DIFFERENT lead is opened, which is what the id tracks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lead?.id, isAdmin, currentUser?.id, towers, towerSites]);

  const salesReps = getSalesStaff(users);

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

  const handleCoverageAreaChange = (areaId: string) => {
    if (areaId === "unassigned") {
      setForm((f) => ({
        ...f,
        towerId: null,
        towerSiteId: null,
        serviceZone: "",
      }));
      return;
    }
    const area = towers.find((t) => t.id === areaId);
    setForm((f) => ({
      ...f,
      towerId: areaId,
      towerSiteId: null,
      serviceZone: area?.name ?? "",
    }));
  };

  const handleTowerSiteChange = (siteId: string) => {
    if (siteId === "unassigned") {
      const area = towers.find((t) => t.id === form.towerId);
      setForm((f) => ({
        ...f,
        towerSiteId: null,
        serviceZone: area?.name ?? f.serviceZone,
      }));
      return;
    }
    const site = towerSites.find((s) => s.id === siteId);
    const area = towers.find((t) => t.id === (site?.areaId ?? form.towerId));
    setForm((f) => ({
      ...f,
      towerSiteId: siteId,
      towerId: site?.areaId ?? f.towerId,
      serviceZone: site?.name ?? area?.name ?? f.serviceZone,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clientName = form.clientName.trim();
    if (!clientName) return;

    const updates: LeadFormData = { ...form, clientName };

    if (lead) {
      updateLead(lead.id, updates);
      onSaved?.(lead.id);
    } else {
      const id = addLead(updates);
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
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Client Name *</label>
              <Input value={form.clientName} onChange={(e) => set("clientName", e.target.value)} required />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Company</label>
              <Input value={form.company ?? ""} onChange={(e) => set("company", e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Phone *</label>
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} required />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Email</label>
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Package</label>
              <Select onValueChange={(v) => { if (typeof v === "string") handlePackageChange(v); }}>
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue placeholder="Select package">
                    {(value) => {
                      if (typeof value !== "string") return "Select package";
                      const pkg = PACKAGES.find((p) => p.id === value);
                      return pkg
                        ? `${pkg.name} — R${pkg.price.toLocaleString()}`
                        : form.packageTier || "Select package";
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {PACKAGES.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — R{p.price.toLocaleString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Deal Value (R)</label>
              <Input
                type="number"
                value={form.dealValue ?? ""}
                onChange={(e) => set("dealValue", Number(e.target.value))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Discount (R)</label>
              <Input
                type="number"
                value={form.discount ?? 0}
                onChange={(e) => set("discount", Number(e.target.value))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Priority</label>
              <Select
                value={form.priority}
                onValueChange={(v) => {
                  if (typeof v === "string") set("priority", v as LeadFormData["priority"]);
                }}
              >
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue>
                    {(value) =>
                      value === "high" ? "High" : value === "low" ? "Low" : "Medium"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Lead Source</label>
              <Select
                value={form.leadSource}
                onValueChange={(v) => {
                  if (typeof v === "string") set("leadSource", v as LeadFormData["leadSource"]);
                }}
              >
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue>
                    {(value) =>
                      value === "website"
                        ? "Website"
                        : value === "referral"
                          ? "Referral"
                          : value === "walk-in"
                            ? "Walk-in"
                            : value === "cold-call"
                              ? "Cold Call"
                              : String(value ?? "")
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="website">Website</SelectItem>
                  <SelectItem value="referral">Referral</SelectItem>
                  <SelectItem value="walk-in">Walk-in</SelectItem>
                  <SelectItem value="cold-call">Cold Call</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Coverage area</label>
              <Select
                value={form.towerId ?? "unassigned"}
                onValueChange={(v) => {
                  if (typeof v === "string") handleCoverageAreaChange(v);
                }}
              >
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue placeholder="Select coverage area">
                    {(value) => {
                      if (!value || value === "unassigned") return "Select coverage area";
                      return (
                        sortedTowers.find((t) => t.id === value)?.name ?? "Select coverage area"
                      );
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Not set</SelectItem>
                  {sortedTowers.map((tower) => (
                    <SelectItem key={tower.id} value={tower.id}>
                      {tower.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Tower</label>
              <Select
                value={form.towerSiteId ?? "unassigned"}
                onValueChange={(v) => {
                  if (typeof v === "string") handleTowerSiteChange(v);
                }}
                disabled={!form.towerId}
              >
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue
                    placeholder={form.towerId ? "Select tower" : "Pick coverage area first"}
                  >
                    {(value) => {
                      if (!form.towerId) return "Pick coverage area first";
                      if (!value || value === "unassigned") return "Select tower";
                      return sitesForArea.find((s) => s.id === value)?.name ?? "Select tower";
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Not set</SelectItem>
                  {sitesForArea.map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Coverage</label>
              <Select
                value={form.coverageStatus}
                onValueChange={(v) => {
                  if (typeof v === "string") {
                    set("coverageStatus", v as LeadFormData["coverageStatus"]);
                  }
                }}
              >
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue>
                    {(value) =>
                      value === "confirmed"
                        ? "Confirmed"
                        : value === "not_available"
                          ? "No Coverage"
                          : "Survey Needed"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="pending_survey">Survey Needed</SelectItem>
                  <SelectItem value="not_available">No Coverage</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {isAdmin && (
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Assign To</label>
                <Select
                  value={form.assignedToId ?? "unassigned"}
                  onValueChange={(v) => {
                    if (typeof v === "string") {
                      set("assignedToId", v === "unassigned" ? null : v);
                    }
                  }}
                >
                  <SelectTrigger className="mt-1 w-full">
                    <SelectValue>
                      {(value) =>
                        !value || value === "unassigned"
                          ? "Unassigned"
                          : salesReps.find((r) => r.id === value)?.name ?? "Unassigned"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {salesReps.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Address</label>
              <Input value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Client PPPoE</label>
              <Input
                value={form.clientPppoe ?? ""}
                onChange={(e) => set("clientPppoe", e.target.value)}
                placeholder="client@megs"
                autoCapitalize="off"
                autoCorrect="off"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Wi‑Fi name</label>
              <Input
                value={form.wifiName ?? ""}
                onChange={(e) => set("wifiName", e.target.value)}
                placeholder="SSID"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Wi‑Fi password</label>
              <Input
                value={form.wifiPassword ?? ""}
                onChange={(e) => set("wifiPassword", e.target.value)}
                placeholder="Wi‑Fi password"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Notes</label>
              <Textarea
                value={form.notes ?? ""}
                onChange={(e) => set("notes", e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="bg-primary text-primary-foreground hover:bg-primary/90">
              {lead ? "Save Changes" : "Add Lead"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
