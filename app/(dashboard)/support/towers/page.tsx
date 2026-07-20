"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useCrmStore } from "@/lib/store/crm-store";
import { useSupportAccess } from "@/lib/hooks/use-support-access";
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
import type { Tower, TowerStatus } from "@/lib/types";
import { AlertTriangle, CheckCircle, Radio, Wrench } from "lucide-react";

const STATUS_BADGE: Record<TowerStatus, string> = {
  online: "bg-emerald-100 text-emerald-700",
  offline: "bg-red-100 text-red-700",
  maintenance: "bg-amber-100 text-amber-800",
};

export default function SupportTowersPage() {
  const { allowed, isLoading } = useSupportAccess();
  const { currentUser } = useAuth();
  const {
    towers,
    towerOutages,
    isLoaded,
    dbError,
    createOutage,
    resolveOutage,
    setTowerStatus,
    getActiveOutages,
  } = useCrmStore();

  const [selectedTower, setSelectedTower] = useState<Tower | null>(null);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [affectedAreas, setAffectedAreas] = useState("");

  if (isLoading || !allowed) return null;

  const activeOutages = getActiveOutages();

  function openOutageDialog(tower: Tower) {
    setSelectedTower(tower);
    setTitle(`${tower.name} — Service Disruption`);
    setMessage(
      "We are aware of a service disruption in your area. Our team is working to restore connectivity as quickly as possible."
    );
    setAffectedAreas(tower.serviceAreas.join(", "));
  }

  function handleCreateOutage() {
    if (!selectedTower || !currentUser || !title.trim()) return;
    const areas = affectedAreas
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);

    createOutage(
      selectedTower.id,
      title.trim(),
      message.trim(),
      areas.length > 0 ? areas : selectedTower.serviceAreas,
      currentUser.id
    );
    setSelectedTower(null);
    setTitle("");
    setMessage("");
    setAffectedAreas("");
  }

  function handleSetStatus(tower: Tower, status: "online" | "maintenance") {
    if (!currentUser || tower.status === status) return;
    setTowerStatus(tower.id, status, currentUser.id);
  }

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-bold">Towers & Outages</h1>
        <p className="text-sm text-muted-foreground">
          Set towers online, offline, or maintenance — changes appear live on the public website within
          a few seconds.
        </p>
      </div>

      {dbError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {dbError}
        </div>
      )}

      {!isLoaded && (
        <p className="text-sm text-muted-foreground">Loading towers…</p>
      )}

      {isLoaded && towers.length === 0 && (
        <Card className="bg-white">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No towers found. Confirm the database migration has been applied and you have support
            access.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {towers.map((tower) => {
          const activeOutage = activeOutages.find((o) => o.towerId === tower.id);
          return (
            <Card key={tower.id} className="bg-white">
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="flex items-center gap-2">
                    <Radio className="h-4 w-4 text-[#C83733]" />
                    {tower.name}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${STATUS_BADGE[tower.status]}`}
                  >
                    {tower.status}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div>
                  <p className="font-medium text-muted-foreground">Service areas</p>
                  <p>{tower.serviceAreas.join(", ")}</p>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Set status
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={tower.status === "online" ? "default" : "outline"}
                      className={
                        tower.status === "online"
                          ? "bg-emerald-600 hover:bg-emerald-700"
                          : ""
                      }
                      disabled={!currentUser || tower.status === "online"}
                      onClick={() => handleSetStatus(tower, "online")}
                    >
                      <CheckCircle className="mr-1 h-4 w-4" />
                      Online
                    </Button>
                    <Button
                      size="sm"
                      variant={tower.status === "maintenance" ? "default" : "outline"}
                      className={
                        tower.status === "maintenance"
                          ? "bg-amber-500 hover:bg-amber-600"
                          : ""
                      }
                      disabled={!currentUser || tower.status === "maintenance"}
                      onClick={() => handleSetStatus(tower, "maintenance")}
                    >
                      <Wrench className="mr-1 h-4 w-4" />
                      Maintenance
                    </Button>
                    <Button
                      size="sm"
                      variant={tower.status === "offline" ? "default" : "outline"}
                      className={
                        tower.status === "offline"
                          ? "bg-red-600 hover:bg-red-700"
                          : ""
                      }
                      disabled={!currentUser || tower.status === "offline"}
                      onClick={() => openOutageDialog(tower)}
                    >
                      <AlertTriangle className="mr-1 h-4 w-4" />
                      Offline
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Offline publishes a public outage message. Online / Maintenance clears any
                    active outage for this tower.
                  </p>
                </div>

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
                      onClick={() => resolveOutage(activeOutage.id, tower.id)}
                    >
                      <CheckCircle className="mr-1 h-4 w-4" />
                      Mark Resolved
                    </Button>
                  </div>
                )}
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
                const tower = towers.find((t) => t.id === outage.towerId);
                return (
                  <p key={outage.id}>
                    {tower?.name}: {outage.title} — resolved{" "}
                    {outage.resolvedAt ? new Date(outage.resolvedAt).toLocaleString() : ""}
                  </p>
                );
              })}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!selectedTower} onOpenChange={(open) => !open && setSelectedTower(null)}>
        <DialogContent className="bg-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Mark Offline — {selectedTower?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This publishes to the landing page Network Status and the top alert banner.
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
            <Button variant="outline" onClick={() => setSelectedTower(null)}>
              Cancel
            </Button>
            <Button className="bg-[#C83733] hover:bg-[#a82f2b]" onClick={handleCreateOutage}>
              Publish Offline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
