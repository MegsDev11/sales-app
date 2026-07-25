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

export type CoordinationJobRequestPayload = {
  title: string;
  notes: string;
  address: string;
  clientName: string;
};

/** Shared dialog for support/owner → coordination job cards (service calls, tower work, etc.). */
export function CoordinationJobRequestDialog({
  open,
  onOpenChange,
  onSubmit,
  busy,
  heading,
  description = "Creates a job card tagged from support. Coordination can assign a technician later.",
  defaultTitle,
  defaultNotes,
  defaultAddress = "",
  defaultClientName = "",
  submitLabel = "Submit job card",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: CoordinationJobRequestPayload) => Promise<void>;
  busy?: boolean;
  heading: string;
  description?: string;
  defaultTitle: string;
  defaultNotes: string;
  defaultAddress?: string;
  defaultClientName?: string;
  submitLabel?: string;
}) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [address, setAddress] = useState("");
  const [clientName, setClientName] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(defaultTitle);
    setNotes(defaultNotes);
    setAddress(defaultAddress);
    setClientName(defaultClientName);
  }, [open, defaultTitle, defaultNotes, defaultAddress, defaultClientName]);

  async function handleSubmit() {
    if (!title.trim() || !notes.trim()) return;
    await onSubmit({
      title: title.trim(),
      notes: notes.trim(),
      address: address.trim(),
      clientName: clientName.trim(),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{heading}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{description}</p>
          <div>
            <label className="mb-1 block text-sm font-medium">Job title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Client name</label>
            <Input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Client name"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Site address</label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Installation / visit address"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Work to be done</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={6}
              placeholder="Describe the service call…"
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
            {busy ? "Sending…" : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
