"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useCrmStore } from "@/lib/store/crm-store";
import type { User, UserFormData } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

const REP_COLORS = [
  "#3B82F6",
  "#22C55E",
  "#F97316",
  "#A855F7",
  "#14B8A6",
  "#EC4899",
  "#EAB308",
  "#6366F1",
];

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

const defaultForm = (): UserFormData => ({
  name: "",
  email: "",
  role: "sales",
  color: REP_COLORS[0],
  avatarInitials: "",
  title: "Sales Representative",
  monthlyRevenueTarget: 100000,
  monthlyDealsTarget: 6,
});

interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: User;
}

export function UserFormDialog({ open, onOpenChange, user }: UserFormDialogProps) {
  const { updateUser, addUser } = useCrmStore();
  const { accessToken } = useAuth();
  const [form, setForm] = useState<UserFormData>(defaultForm());
  const [password, setPassword] = useState("");
  const [initialsManual, setInitialsManual] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      const { id: _id, authUserId: _auth, ...rest } = user;
      setForm(rest);
      setInitialsManual(true);
      setPassword("");
    } else {
      setForm(defaultForm());
      setInitialsManual(false);
      setPassword("");
    }
    setError("");
  }, [user, open]);

  const set = <K extends keyof UserFormData>(key: K, value: UserFormData[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "name" && !initialsManual) {
        next.avatarInitials = initialsFromName(String(value));
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;

    setError("");
    setSubmitting(true);

    const payload: UserFormData = {
      ...form,
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      avatarInitials: form.avatarInitials.trim() || initialsFromName(form.name),
      title: form.title.trim() || "Sales Representative",
    };

    try {
      if (user) {
        updateUser(user.id, payload);
        onOpenChange(false);
      } else {
        if (!payload.email) {
          setError("Email is required for new accounts");
          return;
        }
        if (password.length < 8) {
          setError("Password must be at least 8 characters");
          return;
        }
        if (!accessToken) {
          setError("You must be signed in as admin to create accounts");
          return;
        }
        await addUser({ ...payload, password }, accessToken);
        onOpenChange(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  const isAdmin = user?.role === "admin";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{user ? "Edit Team Member" : "Add Sales Rep Account"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">Full Name *</label>
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. Wine Petzer"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                Email {user ? "" : "*"}
              </label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="rep@megswb.co.za"
                required={!user}
                disabled={Boolean(user)}
              />
              {user && (
                <p className="mt-1 text-xs text-muted-foreground">Login email cannot be changed here.</p>
              )}
            </div>
            {!user && (
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">Initial Password *</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 8 characters — share with the rep securely"
                  required
                  minLength={8}
                />
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">Job Title</label>
              <Input
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Sales Representative"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">Avatar Initials</label>
              <Input
                value={form.avatarInitials}
                onChange={(e) => {
                  setInitialsManual(true);
                  set("avatarInitials", e.target.value.toUpperCase().slice(0, 3));
                }}
                placeholder="WP"
                maxLength={3}
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-medium text-foreground">Color Code</label>
              <div className="flex flex-wrap gap-2">
                {REP_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => set("color", color)}
                    className={cn(
                      "h-8 w-8 rounded-full ring-2 ring-offset-2 transition-transform hover:scale-110",
                      form.color === color ? "ring-black" : "ring-transparent"
                    )}
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">Monthly Revenue Target (R)</label>
                <Input
                  type="number"
                  min={0}
                  value={form.monthlyRevenueTarget}
                  onChange={(e) => set("monthlyRevenueTarget", Number(e.target.value))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">Monthly Deals Target</label>
                <Input
                  type="number"
                  min={0}
                  value={form.monthlyDealsTarget}
                  onChange={(e) => set("monthlyDealsTarget", Number(e.target.value))}
                />
              </div>
            </div>
            {!user && (
              <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                Only admins can create accounts. The rep will use this email and password to sign in at /login.
              </p>
            )}
            {isAdmin && user && (
              <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                Admin account — name and title can be updated; role stays admin.
              </p>
            )}
          </div>
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="bg-[#C83733] hover:bg-[#a82f2b]" disabled={submitting}>
              {submitting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</>
              ) : user ? (
                "Save Changes"
              ) : (
                "Create Account"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
