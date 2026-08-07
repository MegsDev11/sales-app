"use client";

import type { LostReason } from "@/lib/types";
import { LOST_REASON_LABELS } from "@/lib/constants";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { useState } from "react";

interface LostReasonDialogProps {
  open: boolean;
  onConfirm: (reason: LostReason) => void;
  onCancel: () => void;
}

export function LostReasonDialog({ open, onConfirm, onCancel }: LostReasonDialogProps) {
  const [reason, setReason] = useState<LostReason>("price");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Why was this deal lost?</DialogTitle>
        </DialogHeader>
        <SelectField
          className="w-full"
          aria-label="Reason the deal was lost"
          value={reason}
          onValueChange={(v) => setReason(v as LostReason)}
          options={Object.entries(LOST_REASON_LABELS).map(([value, label]) => ({
            value,
            label,
          }))}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => onConfirm(reason)}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
