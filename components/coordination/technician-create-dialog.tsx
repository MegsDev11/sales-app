"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TEAM_OPTIONS } from "@/components/coordination/technician-create-form";

/**
 * Create a technician. Same controlled props as the old inline form, moved into a
 * dialog so the roster is what the page leads with, not a wall of empty inputs.
 */
export function TechnicianCreateDialog({
  open,
  onOpenChange,
  name,
  onNameChange,
  title,
  onTitleChange,
  technicianLevel,
  onTechnicianLevelChange,
  phone,
  onPhoneChange,
  email,
  onEmailChange,
  password,
  onPasswordChange,
  idNumber,
  onIdNumberChange,
  msg,
  busy,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  onNameChange: (value: string) => void;
  title: string;
  onTitleChange: (value: string) => void;
  technicianLevel: "junior" | "senior";
  onTechnicianLevelChange: (value: "junior" | "senior") => void;
  phone: string;
  onPhoneChange: (value: string) => void;
  email: string;
  onEmailChange: (value: string) => void;
  password: string;
  onPasswordChange: (value: string) => void;
  idNumber: string;
  onIdNumberChange: (value: string) => void;
  msg: string;
  busy: boolean;
  onAdd: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto bg-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add technician</DialogTitle>
        </DialogHeader>
        <p className="-mt-1 text-xs text-muted-foreground">
          Email and app password are the MEGS Field mobile login — they work as soon as you save.
        </p>

        <div className="mt-1 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Full name</label>
            <Input value={name} onChange={(e) => onNameChange(e.target.value)} placeholder="Full name" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Team</label>
            <Select value={title} onValueChange={(v) => v && onTitleChange(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEAM_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Seniority</label>
            <Select
              value={technicianLevel}
              onValueChange={(value) => value && onTechnicianLevelChange(value as "junior" | "senior")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="junior">Junior technician</SelectItem>
                <SelectItem value="senior">Senior technician</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Phone number</label>
            <Input value={phone} onChange={(e) => onPhoneChange(e.target.value)} placeholder="Phone number" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">ID number</label>
            <Input value={idNumber} onChange={(e) => onIdNumberChange(e.target.value)} placeholder="ID number" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">App login email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              placeholder="you@megswb.co.za"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">App password</label>
            <Input
              type="text"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              placeholder="Min 8 characters"
              autoComplete="new-password"
            />
          </div>
        </div>

        {msg ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {msg}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={busy}
            onClick={onAdd}
          >
            Add technician
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
