"use client";

import { PageHeader, PageShell } from "@/components/layout/page-shell";

import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useCrmStore } from "@/lib/store/crm-store";
import { useSupportAccess } from "@/lib/hooks/use-support-access";
import { canAccessCoordination, canAccessSupport, isOwner } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TowerSiteEditDialog } from "@/components/support/tower-site-edit-dialog";
import { TowerWorkRequestDialog } from "@/components/support/tower-work-request-dialog";
import type { Tower, TowerSite, TowerStatus } from "@/lib/types";
import { deriveAreaStatus } from "@/lib/utils/tower-status";
import {
  AlertTriangle,
  CheckCircle,
  ClipboardList,
  Gauge,
  Pencil,
  Plus,
  Radio,
  Send,
  Trash2,
  Wrench,
  Zap,
} from "lucide-react";

const STATUS_BADGE: Record<TowerStatus, string> = {
  online: "bg-emerald-100 text-emerald-700",
  offline: "bg-red-100 text-red-700",
  maintenance: "bg-amber-100 text-amber-800",
};

/** Stable accent per coverage area so towns are easier to tell apart. */
const AREA_ACCENTS = [
  {
    bar: "bg-sky-600",
    header: "bg-sky-50 border-sky-200",
    icon: "text-sky-700",
    badge: "bg-sky-100 text-sky-800 border-sky-200",
    sitesWrap: "border-sky-200 bg-sky-50/80",
    tabIdle: "border-sky-200 hover:border-sky-400 hover:bg-sky-100/60",
    tabActive: "border-sky-700 bg-sky-700 text-white ring-sky-300",
    tabIcon: "text-sky-700",
  },
  {
    bar: "bg-teal-600",
    header: "bg-teal-50 border-teal-200",
    icon: "text-teal-700",
    badge: "bg-teal-100 text-teal-800 border-teal-200",
    sitesWrap: "border-teal-200 bg-teal-50/80",
    tabIdle: "border-teal-200 hover:border-teal-400 hover:bg-teal-100/60",
    tabActive: "border-teal-700 bg-teal-700 text-white ring-teal-300",
    tabIcon: "text-teal-700",
  },
  {
    bar: "bg-amber-600",
    header: "bg-amber-50 border-amber-200",
    icon: "text-amber-800",
    badge: "bg-amber-100 text-amber-900 border-amber-200",
    sitesWrap: "border-amber-200 bg-amber-50/80",
    tabIdle: "border-amber-200 hover:border-amber-400 hover:bg-amber-100/60",
    tabActive: "border-amber-700 bg-amber-700 text-white ring-amber-300",
    tabIcon: "text-amber-700",
  },
  {
    bar: "bg-rose-600",
    header: "bg-rose-50 border-rose-200",
    icon: "text-rose-700",
    badge: "bg-rose-100 text-rose-800 border-rose-200",
    sitesWrap: "border-rose-200 bg-rose-50/80",
    tabIdle: "border-rose-200 hover:border-rose-400 hover:bg-rose-100/60",
    tabActive: "border-rose-700 bg-rose-700 text-white ring-rose-300",
    tabIcon: "text-rose-700",
  },
  {
    bar: "bg-indigo-600",
    header: "bg-indigo-50 border-indigo-200",
    icon: "text-indigo-700",
    badge: "bg-indigo-100 text-indigo-800 border-indigo-200",
    sitesWrap: "border-indigo-200 bg-indigo-50/80",
    tabIdle: "border-indigo-200 hover:border-indigo-400 hover:bg-indigo-100/60",
    tabActive: "border-indigo-700 bg-indigo-700 text-white ring-indigo-300",
    tabIcon: "text-indigo-700",
  },
  {
    bar: "bg-emerald-700",
    header: "bg-emerald-50 border-emerald-200",
    icon: "text-emerald-800",
    badge: "bg-emerald-100 text-emerald-900 border-emerald-200",
    sitesWrap: "border-emerald-200 bg-emerald-50/80",
    tabIdle: "border-emerald-200 hover:border-emerald-400 hover:bg-emerald-100/60",
    tabActive: "border-emerald-800 bg-emerald-800 text-white ring-emerald-300",
    tabIcon: "text-emerald-700",
  },
] as const;

function areaAccent(areaId: string) {
  let hash = 0;
  for (let i = 0; i < areaId.length; i++) {
    hash = (hash * 31 + areaId.charCodeAt(i)) >>> 0;
  }
  return AREA_ACCENTS[hash % AREA_ACCENTS.length];
}

export default function SupportTowersPage() {
  const { allowed, isLoading } = useSupportAccess();
  const { currentUser, accessToken, isOwner: ownerFlag } = useAuth();
  const {
    towers,
    towerOutages,
    towerSites,
    isLoaded,
    dbError,
    createOutage,
    resolveOutage,
    setSiteStatus,
    createCoverageArea,
    updateTower,
    createTowerSite,
    updateTowerSite,
    deleteTowerSite,
    getActiveOutages,
  } = useCrmStore();

  const [selectedArea, setSelectedArea] = useState<Tower | null>(null);
  const [selectedSiteForOutage, setSelectedSiteForOutage] = useState<TowerSite | null>(null);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [affectedAreas, setAffectedAreas] = useState("");

  const [activeSiteByArea, setActiveSiteByArea] = useState<Record<string, string>>({});
  const [editSite, setEditSite] = useState<TowerSite | null>(null);
  const [workSite, setWorkSite] = useState<TowerSite | null>(null);
  const [workBusy, setWorkBusy] = useState(false);
  const [workError, setWorkError] = useState<string | null>(null);
  const [workSuccess, setWorkSuccess] = useState<string | null>(null);
  const [addAreaId, setAddAreaId] = useState<string | null>(null);
  const [newSiteName, setNewSiteName] = useState("");

  const [areaDialogOpen, setAreaDialogOpen] = useState(false);
  const [editingArea, setEditingArea] = useState<Tower | null>(null);
  const [areaName, setAreaName] = useState("");
  const canSendWork =
    !!currentUser &&
    (ownerFlag ||
      isOwner(currentUser) ||
      canAccessCoordination(currentUser) ||
      canAccessSupport(currentUser));

  const sitesByArea = useMemo(() => {
    const map = new Map<string, TowerSite[]>();
    for (const site of towerSites) {
      const list = map.get(site.areaId) ?? [];
      list.push(site);
      map.set(site.areaId, list);
    }
    for (const [, list] of map) {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return map;
  }, [towerSites]);

  if (isLoading || !allowed) return null;

  const activeOutages = getActiveOutages();

  function openOutageDialog(area: Tower, site: TowerSite) {
    setSelectedArea(area);
    setSelectedSiteForOutage(site);
    setTitle(`${area.name} — Service Disruption`);
    setMessage(
      "We are aware of a service disruption in your area. Our team is working to restore connectivity as quickly as possible."
    );
    setAffectedAreas(area.serviceAreas.join(", "));
  }

  function handleCreateOutage() {
    if (!selectedArea || !currentUser || !title.trim()) return;
    const areas = affectedAreas
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);

    createOutage(
      selectedArea.id,
      title.trim(),
      message.trim(),
      areas.length > 0 ? areas : selectedArea.serviceAreas,
      currentUser.id,
      selectedSiteForOutage?.id
    );
    setSelectedArea(null);
    setSelectedSiteForOutage(null);
    setTitle("");
    setMessage("");
    setAffectedAreas("");
  }

  function handleSetSiteStatus(site: TowerSite, status: "online" | "maintenance") {
    if (!currentUser || site.status === status) return;
    setSiteStatus(site.id, status, currentUser.id);
  }

  function displayAreaStatus(area: Tower, sites: TowerSite[]): TowerStatus {
    const hasActiveOutage = getActiveOutages().some(
      (o) => o.towerId === area.id && !o.resolvedAt
    );
    return deriveAreaStatus(
      area.status,
      sites.map((s) => s.status),
      hasActiveOutage
    );
  }

  function activeSiteFor(areaId: string): TowerSite | null {
    const sites = sitesByArea.get(areaId) ?? [];
    if (sites.length === 0) return null;
    const selectedId = activeSiteByArea[areaId];
    return sites.find((s) => s.id === selectedId) ?? sites[0];
  }

  function openCreateArea() {
    setEditingArea(null);
    setAreaName("");
    setAreaDialogOpen(true);
  }

  function openEditArea(area: Tower) {
    setEditingArea(area);
    setAreaName(area.name);
    setAreaDialogOpen(true);
  }

  function handleSaveCoverageArea() {
    if (!currentUser || !areaName.trim()) return;
    const name = areaName.trim();
    const serviceAreas = [name];
    const now = new Date().toISOString();

    if (editingArea) {
      updateTower(editingArea.id, {
        name,
        serviceAreas,
        updatedById: currentUser.id,
        updatedAt: now,
      });
    } else {
      const id = `tower_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
      createCoverageArea({
        id,
        name,
        serviceAreas,
        status: "online",
        updatedAt: now,
        updatedById: currentUser.id,
      });
    }
    setAreaDialogOpen(false);
    setEditingArea(null);
    setAreaName("");
  }

  function handleAddSite(areaId: string) {
    if (!currentUser || !newSiteName.trim()) return;
    const now = new Date().toISOString();
    const site: TowerSite = {
      id: `site_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
      areaId,
      name: newSiteName.trim(),
      voltage: "",
      throughputMbps: null,
      equipment: [],
      maintenanceNotes: "",
      upgradePlan: "",
      status: "online",
      updatedAt: now,
      updatedById: currentUser.id,
      createdAt: now,
    };
    createTowerSite(site);
    setActiveSiteByArea((prev) => ({ ...prev, [areaId]: site.id }));
    setAddAreaId(null);
    setNewSiteName("");
  }

  async function handleWorkSubmit(payload: { title: string; notes: string }) {
    if (!workSite || !accessToken || !currentUser) return;
    const area = towers.find((t) => t.id === workSite.areaId);
    setWorkBusy(true);
    setWorkError(null);
    try {
      const source = ownerFlag || isOwner(currentUser) ? "owner" : "support";
      const res = await fetch("/api/coordination/jobs", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "create",
          title: payload.title,
          notes: payload.notes,
          address: area ? `${area.name} · ${workSite.name}` : workSite.name,
          clientName: area?.name ?? workSite.name,
          towerId: workSite.areaId,
          towerSiteId: workSite.id,
          jobType: "tower_work",
          source,
          technicianIds: [],
          scheduledStart: new Date().toISOString(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create job");
      setWorkSuccess(`Job card sent to coordination for ${workSite.name}`);
      setWorkSite(null);
    } catch (e) {
      setWorkError(e instanceof Error ? e.message : "Failed to send job");
    } finally {
      setWorkBusy(false);
    }
  }

  const workArea = workSite ? towers.find((t) => t.id === workSite.areaId) : null;

  return (
    <PageShell>
      <PageHeader
        title="Coverage areas & towers"
        actions={
          <Button
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={openCreateArea}
          >
            <Plus className="mr-1 h-4 w-4" />
            Add coverage area
          </Button>
        }
      />

      {dbError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {dbError}
        </div>
      )}
      {workError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {workError}
        </div>
      )}
      {workSuccess && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {workSuccess}
        </div>
      )}

      {!isLoaded && (
        <p className="text-sm text-muted-foreground">Loading coverage areas…</p>
      )}

      {isLoaded && towers.length === 0 && (
        <Card className="bg-white">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No coverage areas found. Confirm the database migration has been applied.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {towers.map((area) => {
          const activeOutage = activeOutages.find((o) => o.towerId === area.id);
          const sites = sitesByArea.get(area.id) ?? [];
          const activeSite = activeSiteFor(area.id);
          const accent = areaAccent(area.id);
          const areaStatus = displayAreaStatus(area, sites);

          return (
            <Card key={area.id} className="overflow-hidden bg-white ring-1 ring-black/5">
              <div className={`h-1.5 w-full ${accent.bar}`} />
              <CardHeader className={`border-b ${accent.header}`}>
                <CardTitle className="flex items-start justify-between gap-2 text-base">
                  <span className="min-w-0 space-y-1">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Coverage area
                    </span>
                    <span className="flex min-w-0 items-center gap-2">
                      <Radio className={`h-5 w-5 shrink-0 ${accent.icon}`} />
                      <span className="truncate text-lg font-bold tracking-tight">
                        {area.name}
                      </span>
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-2">
                    <span
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${STATUS_BADGE[areaStatus]}`}
                    >
                      {areaStatus}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="bg-white/80"
                      onClick={() => openEditArea(area)}
                    >
                      <Pencil className="mr-1 h-3.5 w-3.5" />
                      Edit area
                    </Button>
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-4 text-sm">
                {activeOutage && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                    <p className="flex items-center gap-1 font-semibold text-red-800">
                      <AlertTriangle className="h-4 w-4" />
                      {activeOutage.title}
                    </p>
                    <p className="mt-1 text-red-700">{activeOutage.message}</p>
                    <p className="mt-2 text-xs text-red-600">
                      Affected: {activeOutage.affectedAreas.join(", ")}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-3"
                      onClick={() => resolveOutage(activeOutage.id, area.id)}
                    >
                      <CheckCircle className="mr-1 h-4 w-4" />
                      Mark Resolved
                    </Button>
                  </div>
                )}

                <div className={`rounded-xl border p-3 ${accent.sitesWrap}`}>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className={`text-[10px] font-bold uppercase tracking-wider ${accent.icon}`}>
                        Private towers
                      </p>
                      <p className="text-sm font-semibold text-foreground">
                        Sites in {area.name}
                        <span className="ml-1.5 font-normal text-muted-foreground">
                          ({sites.length})
                        </span>
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="bg-white"
                      onClick={() => {
                        setAddAreaId(area.id);
                        setNewSiteName(`${area.name} — `);
                      }}
                    >
                      <Plus className="mr-1 h-4 w-4" />
                      Add tower
                    </Button>
                  </div>

                  {sites.length === 0 ? (
                    <p className="rounded-md border border-dashed border-border bg-white px-3 py-4 text-center text-xs text-muted-foreground">
                      No private towers yet under {area.name}. Add sites for equipment and upgrades.
                    </p>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {sites.map((site) => {
                          const selected = activeSite?.id === site.id;
                          return (
                            <button
                              key={site.id}
                              type="button"
                              onClick={() =>
                                setActiveSiteByArea((prev) => ({
                                  ...prev,
                                  [area.id]: site.id,
                                }))
                              }
                              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold shadow-sm transition-colors ${
                                selected
                                  ? `${accent.tabActive} shadow-md ring-2`
                                  : `bg-white text-foreground ${accent.tabIdle}`
                              }`}
                            >
                              <Radio
                                className={`h-3.5 w-3.5 shrink-0 ${
                                  selected ? "text-white" : accent.tabIcon
                                }`}
                              />
                              <span className="truncate">{site.name}</span>
                              <span
                                className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                                  selected
                                    ? "bg-white/20 text-white"
                                    : STATUS_BADGE[site.status]
                                }`}
                              >
                                {site.status === "online"
                                  ? "on"
                                  : site.status === "maintenance"
                                    ? "mnt"
                                    : "off"}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {activeSite ? (
                        <div className="mt-3 space-y-3 rounded-lg border border-border bg-white p-3 shadow-sm">
                          <p className="text-xs text-muted-foreground">
                            Viewing{" "}
                            <span className="font-semibold text-foreground">{activeSite.name}</span>
                            {" · "}
                            under{" "}
                            <span className={`font-semibold ${accent.icon}`}>{area.name}</span>
                          </p>

                          <div>
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Site status
                              </p>
                              <span
                                className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${STATUS_BADGE[activeSite.status]}`}
                              >
                                {activeSite.status}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant={activeSite.status === "online" ? "default" : "outline"}
                                className={
                                  activeSite.status === "online"
                                    ? "bg-emerald-600 hover:bg-emerald-700"
                                    : ""
                                }
                                disabled={!currentUser || activeSite.status === "online"}
                                onClick={() => handleSetSiteStatus(activeSite, "online")}
                              >
                                <CheckCircle className="mr-1 h-4 w-4" />
                                Online
                              </Button>
                              <Button
                                size="sm"
                                variant={
                                  activeSite.status === "maintenance" ? "default" : "outline"
                                }
                                className={
                                  activeSite.status === "maintenance"
                                    ? "bg-amber-500 hover:bg-amber-600"
                                    : ""
                                }
                                disabled={!currentUser || activeSite.status === "maintenance"}
                                onClick={() => handleSetSiteStatus(activeSite, "maintenance")}
                              >
                                <Wrench className="mr-1 h-4 w-4" />
                                Maintenance
                              </Button>
                              <Button
                                size="sm"
                                variant={activeSite.status === "offline" ? "default" : "outline"}
                                className={
                                  activeSite.status === "offline"
                                    ? "bg-red-600 hover:bg-red-700"
                                    : ""
                                }
                                disabled={!currentUser || activeSite.status === "offline"}
                                onClick={() => openOutageDialog(area, activeSite)}
                              >
                                <AlertTriangle className="mr-1 h-4 w-4" />
                                Offline
                              </Button>
                            </div>
                            <p className="mt-2 text-xs text-muted-foreground">
                              Offline marks this town offline on the landing page and publishes a
                              public outage.
                            </p>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-md border border-border bg-slate-50 px-3 py-2">
                              <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                                <Zap className="h-3.5 w-3.5" />
                                Voltage
                              </p>
                              <p className="mt-0.5 font-semibold tabular-nums">
                                {activeSite.voltage?.trim() || "—"}
                              </p>
                            </div>
                            <div className="rounded-md border border-border bg-slate-50 px-3 py-2">
                              <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                                <Gauge className="h-3.5 w-3.5" />
                                Throughput
                              </p>
                              <p className="mt-0.5 font-semibold tabular-nums">
                                {activeSite.throughputMbps == null
                                  ? "—"
                                  : `${activeSite.throughputMbps} Mbps`}
                              </p>
                            </div>
                          </div>

                          <div>
                            <p className="mb-1.5 flex items-center gap-1 font-medium text-muted-foreground">
                              <ClipboardList className="h-3.5 w-3.5" />
                              Equipment ({activeSite.equipment?.length ?? 0})
                            </p>
                            {(activeSite.equipment?.length ?? 0) === 0 ? (
                              <p className="text-xs text-muted-foreground">No equipment listed</p>
                            ) : (
                              <ul className="space-y-1">
                                {activeSite.equipment.slice(0, 4).map((item) => (
                                  <li key={item.id} className="text-xs">
                                    <span className="font-medium">{item.name}</span>
                                    {item.quantity > 1 ? ` ×${item.quantity}` : ""}
                                    {item.category ? (
                                      <span className="text-muted-foreground">
                                        {" "}
                                        · {item.category}
                                      </span>
                                    ) : null}
                                  </li>
                                ))}
                                {activeSite.equipment.length > 4 ? (
                                  <li className="text-xs text-muted-foreground">
                                    +{activeSite.equipment.length - 4} more
                                  </li>
                                ) : null}
                              </ul>
                            )}
                          </div>

                          {(activeSite.maintenanceNotes?.trim() ||
                            activeSite.upgradePlan?.trim()) && (
                            <div className="space-y-2 rounded-md border border-amber-200/80 bg-amber-50/60 p-3">
                              {activeSite.maintenanceNotes?.trim() ? (
                                <div>
                                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                                    Maintenance needed
                                  </p>
                                  <p className="mt-0.5 whitespace-pre-wrap text-amber-950">
                                    {activeSite.maintenanceNotes}
                                  </p>
                                </div>
                              ) : null}
                              {activeSite.upgradePlan?.trim() ? (
                                <div>
                                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                                    Upgrade plan
                                  </p>
                                  <p className="mt-0.5 whitespace-pre-wrap text-amber-950">
                                    {activeSite.upgradePlan}
                                  </p>
                                </div>
                              ) : null}
                            </div>
                          )}

                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditSite(activeSite)}
                            >
                              <Pencil className="mr-1 h-4 w-4" />
                              Edit site
                            </Button>
                            {canSendWork ? (
                              <Button
                                size="sm"
                                className="bg-primary text-primary-foreground hover:bg-primary/90"
                                onClick={() => {
                                  setWorkSuccess(null);
                                  setWorkSite(activeSite);
                                }}
                              >
                                <Send className="mr-1 h-4 w-4" />
                                Send to coordination
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600"
                              onClick={() => {
                                if (
                                  confirm(
                                    `Delete private site “${activeSite.name}”? This cannot be undone.`
                                  )
                                ) {
                                  deleteTowerSite(activeSite.id);
                                }
                              }}
                            >
                              <Trash2 className="mr-1 h-4 w-4" />
                              Delete
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {towerOutages.filter((o) => o.resolvedAt).length > 0 && (
        <Card className="bg-white">
          <CardHeader>
            <CardTitle className="text-base">Recently Resolved</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            {towerOutages
              .filter((o) => o.resolvedAt)
              .slice(0, 5)
              .map((outage) => {
                const area = towers.find((t) => t.id === outage.towerId);
                return (
                  <p key={outage.id}>
                    {area?.name}: {outage.title} — resolved{" "}
                    {outage.resolvedAt ? new Date(outage.resolvedAt).toLocaleString() : ""}
                  </p>
                );
              })}
          </CardContent>
        </Card>
      )}

      <Dialog
        open={!!selectedArea}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedArea(null);
            setSelectedSiteForOutage(null);
          }
        }}
      >
        <DialogContent className="bg-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Mark Offline — {selectedSiteForOutage?.name ?? selectedArea?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Publishes a public outage for{" "}
              <span className="font-medium">{selectedArea?.name}</span> on the landing page (town
              name only). The private site is set offline.
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium">Public headline</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Customer message</label>
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                Affected areas (comma-separated)
              </label>
              <Input
                value={affectedAreas}
                onChange={(e) => setAffectedAreas(e.target.value)}
                placeholder="Modimolle, Naboom, ..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setSelectedArea(null);
              setSelectedSiteForOutage(null);
            }}>
              Cancel
            </Button>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleCreateOutage}
            >
              Publish Offline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!addAreaId}
        onOpenChange={(open) => {
          if (!open) {
            setAddAreaId(null);
            setNewSiteName("");
          }
        }}
      >
        <DialogContent className="bg-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Add tower under {towers.find((t) => t.id === addAreaId)?.name}
            </DialogTitle>
          </DialogHeader>
          <div>
            <label className="mb-1 block text-sm font-medium">Tower site name</label>
            <Input
              value={newSiteName}
              onChange={(e) => setNewSiteName(e.target.value)}
              placeholder="e.g. Bela-Bela North"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Private only — never shown on the public landing page.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddAreaId(null)}>
              Cancel
            </Button>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={!newSiteName.trim()}
              onClick={() => addAreaId && handleAddSite(addAreaId)}
            >
              Add tower
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={areaDialogOpen}
        onOpenChange={(open) => {
          setAreaDialogOpen(open);
          if (!open) {
            setEditingArea(null);
            setAreaName("");
          }
        }}
      >
        <DialogContent className="bg-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingArea ? `Edit coverage area — ${editingArea.name}` : "Add coverage area"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Coverage areas appear on the public landing page (name + status only).
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium">Town / area name</label>
              <Input
                value={areaName}
                onChange={(e) => setAreaName(e.target.value)}
                placeholder="e.g. Thabazimbi"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAreaDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={!areaName.trim()}
              onClick={handleSaveCoverageArea}
            >
              {editingArea ? "Save area" : "Add coverage area"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TowerSiteEditDialog
        site={editSite}
        open={!!editSite}
        onOpenChange={(open) => !open && setEditSite(null)}
        onSave={(updates) => {
          if (!editSite || !currentUser) return;
          updateTowerSite(editSite.id, {
            ...updates,
            updatedById: currentUser.id,
          });
        }}
      />

      <TowerWorkRequestDialog
        tower={
          workSite
            ? {
                name: workArea
                  ? `${workArea.name} · ${workSite.name}`
                  : workSite.name,
                upgradePlan: workSite.upgradePlan,
                maintenanceNotes: workSite.maintenanceNotes,
              }
            : null
        }
        open={!!workSite}
        onOpenChange={(open) => !open && setWorkSite(null)}
        onSubmit={handleWorkSubmit}
        busy={workBusy}
      />
    </PageShell>
  );
}
