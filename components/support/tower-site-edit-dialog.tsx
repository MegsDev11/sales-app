"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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
import type { TowerSite, TowerEquipmentItem } from "@/lib/types";

function emptyEquipment(): TowerEquipmentItem {
  return {
    id: `eq-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: "",
    category: "",
    quantity: 1,
    notes: "",
  };
}

export function TowerSiteEditDialog({
  site,
  open,
  onOpenChange,
  onSave,
}: {
  site: TowerSite | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (updates: Partial<TowerSite>) => void;
}) {
  const [name, setName] = useState("");
  const [voltage, setVoltage] = useState("");
  const [throughput, setThroughput] = useState("");
  const [maintenanceNotes, setMaintenanceNotes] = useState("");
  const [upgradePlan, setUpgradePlan] = useState("");
  const [equipment, setEquipment] = useState<TowerEquipmentItem[]>([]);

  useEffect(() => {
    if (!site || !open) return;
    setName(site.name ?? "");
    setVoltage(site.voltage ?? "");
    setThroughput(site.throughputMbps == null ? "" : String(site.throughputMbps));
    setMaintenanceNotes(site.maintenanceNotes ?? "");
    setUpgradePlan(site.upgradePlan ?? "");
    setEquipment(site.equipment?.length ? site.equipment.map((e) => ({ ...e })) : []);
  }, [site, open]);

  function updateEquipment(id: string, patch: Partial<TowerEquipmentItem>) {
    setEquipment((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }

  function handleSave() {
    if (!site || !name.trim()) return;
    const parsedThroughput = throughput.trim() === "" ? null : Number(throughput);
    onSave({
      name: name.trim(),
      voltage: voltage.trim(),
      throughputMbps:
        parsedThroughput == null || Number.isNaN(parsedThroughput)
          ? null
          : parsedThroughput,
      maintenanceNotes: maintenanceNotes.trim(),
      upgradePlan: upgradePlan.trim(),
      equipment: equipment
        .map((e) => ({
          ...e,
          name: e.name.trim(),
          category: e.category.trim(),
          notes: e.notes.trim(),
          quantity: Number.isFinite(e.quantity) && e.quantity > 0 ? e.quantity : 1,
        }))
        .filter((e) => e.name.length > 0),
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-white sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit tower site — {site?.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Site name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Bela-Bela North"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Voltage</label>
              <Input
                value={voltage}
                onChange={(e) => setVoltage(e.target.value)}
                placeholder="e.g. 48V DC / 230V AC"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Throughput (Mbps)</label>
              <Input
                type="number"
                min={0}
                step="any"
                value={throughput}
                onChange={(e) => setThroughput(e.target.value)}
                placeholder="e.g. 850"
              />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <label className="text-sm font-medium">Site equipment</label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setEquipment((prev) => [...prev, emptyEquipment()])}
              >
                <Plus className="mr-1 h-4 w-4" />
                Add
              </Button>
            </div>
            {equipment.length === 0 ? (
              <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                No equipment listed yet
              </p>
            ) : (
              <div className="space-y-3">
                {equipment.map((item) => (
                  <div
                    key={item.id}
                    className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[1fr_1fr_5rem_auto]"
                  >
                    <Input
                      value={item.name}
                      onChange={(e) => updateEquipment(item.id, { name: e.target.value })}
                      placeholder="Equipment name"
                    />
                    <Input
                      value={item.category}
                      onChange={(e) =>
                        updateEquipment(item.id, { category: e.target.value })
                      }
                      placeholder="Category (radio, backhaul…)"
                    />
                    <Input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) =>
                        updateEquipment(item.id, {
                          quantity: Number(e.target.value) || 1,
                        })
                      }
                      placeholder="Qty"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="text-red-600"
                      onClick={() =>
                        setEquipment((prev) => prev.filter((e) => e.id !== item.id))
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Input
                      className="sm:col-span-4"
                      value={item.notes}
                      onChange={(e) => updateEquipment(item.id, { notes: e.target.value })}
                      placeholder="Notes (serial, mount, etc.)"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Maintenance needed</label>
            <Textarea
              value={maintenanceNotes}
              onChange={(e) => setMaintenanceNotes(e.target.value)}
              rows={3}
              placeholder="What maintenance is required on this site?"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Upgrade plan</label>
            <Textarea
              value={upgradePlan}
              onChange={(e) => setUpgradePlan(e.target.value)}
              rows={3}
              placeholder="e.g. Add 2 sectors and upgrade the backhaul link"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={handleSave}
            disabled={!name.trim()}
          >
            Save site details
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
