"use client";

import type { User } from "@/lib/types";
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

export function TechnicianEditDialog({
  editing,
  open,
  onOpenChange,
  editName,
  onEditNameChange,
  editTitle,
  onEditTitleChange,
  editTechnicianLevel,
  onEditTechnicianLevelChange,
  editPhone,
  onEditPhoneChange,
  editEmail,
  onEditEmailChange,
  editIdNumber,
  onEditIdNumberChange,
  editPassword,
  onEditPasswordChange,
  editMsg,
  busy,
  onSave,
  onCancel,
}: {
  editing: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editName: string;
  onEditNameChange: (value: string) => void;
  editTitle: string;
  onEditTitleChange: (value: string) => void;
  editTechnicianLevel: "junior" | "senior";
  onEditTechnicianLevelChange: (value: "junior" | "senior") => void;
  editPhone: string;
  onEditPhoneChange: (value: string) => void;
  editEmail: string;
  onEditEmailChange: (value: string) => void;
  editIdNumber: string;
  onEditIdNumberChange: (value: string) => void;
  editPassword: string;
  onEditPasswordChange: (value: string) => void;
  editMsg: string;
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit technician</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="space-y-1">
            <label className="font-medium">Full name</label>
            <Input value={editName} onChange={(e) => onEditNameChange(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="font-medium">Team / title</label>
            <Select value={editTitle} onValueChange={(v) => v && onEditTitleChange(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEAM_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
                {!TEAM_OPTIONS.some((o) => o.value === editTitle) && editTitle ? (
                  <SelectItem value={editTitle}>{editTitle}</SelectItem>
                ) : null}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Wireless and fiber technicians are grouped separately on this page.
            </p>
          </div>
          <div className="space-y-1">
            <label className="font-medium">Seniority</label>
            <Select
              value={editTechnicianLevel}
              onValueChange={(value) =>
                value && onEditTechnicianLevelChange(value as "junior" | "senior")
              }
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
            <label className="font-medium">Phone number</label>
            <Input
              type="tel"
              value={editPhone}
              onChange={(e) => onEditPhoneChange(e.target.value)}
              placeholder="Phone number"
            />
          </div>
          <div className="space-y-1">
            <label className="font-medium">App login email</label>
            <Input
              type="email"
              value={editEmail}
              onChange={(e) => onEditEmailChange(e.target.value)}
              placeholder="Email for MEGS Field app"
            />
          </div>
          <div className="space-y-1">
            <label className="font-medium">
              {editing?.authUserId ? "New app password (optional)" : "App password"}
            </label>
            <Input
              type="text"
              value={editPassword}
              onChange={(e) => onEditPasswordChange(e.target.value)}
              placeholder={
                editing?.authUserId
                  ? "Leave blank to keep current password"
                  : "Min 8 characters — enables mobile login"
              }
              autoComplete="new-password"
            />
            <p className="text-xs text-muted-foreground">
              Changing email or password here updates MEGS Field app sign-in immediately.
            </p>
          </div>
          <div className="space-y-1">
            <label className="font-medium">ID number</label>
            <Input
              value={editIdNumber}
              onChange={(e) => onEditIdNumberChange(e.target.value)}
              placeholder="ID number"
            />
          </div>
          {editMsg && <p className="text-sm text-primary">{editMsg}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={busy}
            onClick={onSave}
          >
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
