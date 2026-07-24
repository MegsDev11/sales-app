"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useCrmStore } from "@/lib/store/crm-store";
import { UserFormDialog } from "@/components/team/user-form-dialog";
import { getDepartmentLabel } from "@/lib/permissions";
import type { User } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader, PageShell } from "@/components/layout/page-shell";
import { UserPlus, Pencil, Eye, EyeOff, KeyRound, Copy, Check } from "lucide-react";

export default function StaffPage() {
  const { isOwner, canCreateAccounts, accessToken } = useAuth();
  const router = useRouter();
  const { users } = useCrmStore();
  const [editUser, setEditUser] = useState<User | undefined>();
  const [showAdd, setShowAdd] = useState(false);
  const [passwords, setPasswords] = useState<Record<string, string | null>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [passwordHint, setPasswordHint] = useState("");
  const [changeUser, setChangeUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [changeError, setChangeError] = useState("");
  const [changeBusy, setChangeBusy] = useState(false);

  const loadPasswords = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await fetch("/api/users", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const body = await res.json();
      if (!res.ok) return;
      if (body.error && typeof body.error === "string") {
        setPasswordHint(body.error);
      } else {
        setPasswordHint("");
      }
      const next: Record<string, string | null> = {};
      for (const row of body.credentials ?? []) {
        next[row.id as string] = (row.loginPassword as string | null) ?? null;
      }
      setPasswords(next);
    } catch {
      /* ignore */
    }
  }, [accessToken]);

  useEffect(() => {
    if (!isOwner) router.replace("/dashboard");
  }, [isOwner, router]);

  useEffect(() => {
    if (isOwner) void loadPasswords();
  }, [isOwner, loadPasswords]);

  if (!isOwner) return null;

  const staffUsers = users.filter((u) => u.role !== "owner");

  async function handleCopy(userId: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(userId);
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch {
      /* ignore */
    }
  }

  async function handleSetPassword() {
    if (!changeUser || !accessToken) return;
    if (newPassword.length < 8) {
      setChangeError("Password must be at least 8 characters");
      return;
    }
    setChangeBusy(true);
    setChangeError("");
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "setPassword",
          userId: changeUser.id,
          password: newPassword,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not update password");
      setPasswords((prev) => ({
        ...prev,
        [changeUser.id]: (body.loginPassword as string) ?? newPassword,
      }));
      setRevealed((prev) => ({ ...prev, [changeUser.id]: true }));
      setChangeUser(null);
      setNewPassword("");
    } catch (e) {
      setChangeError(e instanceof Error ? e.message : "Could not update password");
    } finally {
      setChangeBusy(false);
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="Staff Accounts"
        description="Create and manage login accounts — owner only"
        actions={
          canCreateAccounts ? (
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => setShowAdd(true)}
            >
              <UserPlus className="mr-1 h-4 w-4" />
              Create Account
            </Button>
          ) : undefined
        }
      />

      {passwordHint && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {passwordHint}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {staffUsers.map((user) => {
          const stored = passwords[user.id];
          const isRevealed = revealed[user.id];
          return (
            <Card key={user.id} className="bg-white">
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Avatar style={{ boxShadow: `0 0 0 2px ${user.color}` }}>
                    <AvatarFallback
                      className="font-semibold text-white"
                      style={{ backgroundColor: user.color }}
                    >
                      {user.avatarInitials}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <CardTitle className="text-base">{user.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">{user.email || "No email"}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge variant="outline" className="text-xs capitalize">
                        {user.role}
                      </Badge>
                      {user.department && (
                        <Badge variant="outline" className="text-xs">
                          {getDepartmentLabel(user.department)}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => setEditUser(user)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{user.title}</p>
                <div className="rounded-lg border bg-gray-50 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Login password
                  </p>
                  {stored ? (
                    <div className="mt-1 flex items-center gap-2">
                      <code className="flex-1 break-all font-mono text-sm">
                        {isRevealed ? stored : "••••••••••••"}
                      </code>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        onClick={() =>
                          setRevealed((prev) => ({ ...prev, [user.id]: !prev[user.id] }))
                        }
                        aria-label={isRevealed ? "Hide password" : "Show password"}
                      >
                        {isRevealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => void handleCopy(user.id, stored)}
                        aria-label="Copy password"
                      >
                        {copiedId === user.id ? (
                          <Check className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-amber-700">
                      Not stored yet. Set a new password to view it here.
                    </p>
                  )}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setChangeUser(user);
                    setNewPassword("");
                    setChangeError("");
                  }}
                >
                  <KeyRound className="mr-1 h-3.5 w-3.5" />
                  Change password
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {staffUsers.length === 0 && (
        <Card className="bg-white">
          <CardContent className="py-10 text-center text-muted-foreground">
            No staff accounts yet. Create your first manager or staff member.
          </CardContent>
        </Card>
      )}

      <UserFormDialog
        open={!!editUser || showAdd}
        onOpenChange={(open) => {
          if (!open) {
            setEditUser(undefined);
            setShowAdd(false);
            void loadPasswords();
          }
        }}
        user={showAdd ? undefined : editUser}
      />

      <Dialog open={!!changeUser} onOpenChange={(open) => !open && setChangeUser(null)}>
        <DialogContent className="bg-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Change password{changeUser ? ` — ${changeUser.name}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-xs text-muted-foreground">
              This updates their login immediately. The new password will be shown on their staff
              card.
            </p>
            <div className="space-y-1">
              <label className="font-medium">New password</label>
              <Input
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min 8 characters"
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            {changeError && <p className="text-sm text-primary">{changeError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangeUser(null)}>
              Cancel
            </Button>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={changeBusy}
              onClick={() => void handleSetPassword()}
            >
              Save password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
