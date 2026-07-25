"use client";

import { useEffect, useState } from "react";
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

export type TowerWorkRequestTarget = {
  name: string;
  upgradePlan?: string;
  maintenanceNotes?: string;
};

export function TowerWorkRequestDialog({
  tower,
  open,
  onOpenChange,
  onSubmit,
  busy,
}: {
  tower: TowerWorkRequestTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: { title: string; notes: string }) => Promise<void>;
  busy?: boolean;
}) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!tower || !open) return;
    setTitle(`${tower.name} — Site upgrade / maintenance`);
    const parts = [
      tower.upgradePlan?.trim() ? `Upgrade plan:\n${tower.upgradePlan.trim()}` : "",
      tower.maintenanceNotes?.trim()
        ? `Maintenance notes:\n${tower.maintenanceNotes.trim()}`
        : "",
    ].filter(Boolean);
    setNotes(
      parts.length
        ? parts.join("\n\n")
        : "Add 2 sectors and upgrade the backhaul link"
    );
  }, [tower, open]);

  async function handleSubmit() {
    if (!title.trim() || !notes.trim()) return;
    await onSubmit({ title: title.trim(), notes: notes.trim() });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send to coordination — {tower?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Creates a job card tagged from you. Coordination can assign a technician later.
          </p>
          <div>
            <label className="mb-1 block text-sm font-medium">Job title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Work to be done</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={6}
              placeholder="Describe the upgrade or maintenance work…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={busy || !title.trim() || !notes.trim()}
            onClick={() => void handleSubmit()}
          >
            {busy ? "Sending…" : "Submit job card"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
