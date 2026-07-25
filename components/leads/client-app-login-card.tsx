"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { canAccessSalesAdmin } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type ClientAccount = {
  id: string;
  leadId: string;
  email: string;
  phone: string | null;
  active: boolean;
  createdAt: string;
};

type Props = {
  leadId: string;
  defaultEmail: string;
  defaultPhone: string;
};

export function ClientAppLoginCard({ leadId, defaultEmail, defaultPhone }: Props) {
  const { accessToken, currentUser } = useAuth();
  const allowed = canAccessSalesAdmin(currentUser);

  const [account, setAccount] = useState<ClientAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [email, setEmail] = useState(defaultEmail);
  const [phone, setPhone] = useState(defaultPhone);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [showReset, setShowReset] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken || !allowed) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/client-accounts?leadId=${encodeURIComponent(leadId)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load");
      const accounts = (json.accounts ?? []) as ClientAccount[];
      setAccount(accounts[0] ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [accessToken, allowed, leadId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!account) {
      setEmail(defaultEmail);
      setPhone(defaultPhone);
    }
  }, [account, defaultEmail, defaultPhone]);

  if (!allowed) return null;

  async function post(body: Record<string, unknown>) {
    if (!accessToken) throw new Error("Not signed in");
    const res = await fetch("/api/client-accounts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Request failed");
    return json;
  }

  async function handleIssue() {
    setError(null);
    setNotice(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (!email.trim()) {
      setError("Email is required");
      return;
    }
    setBusy(true);
    try {
      await post({
        action: "issue",
        leadId,
        email: email.trim(),
        password,
        phone: phone.trim() || undefined,
      });
      setPassword("");
      setConfirm("");
      setNotice(
        `Login created for ${email.trim()}. Share the email and password with the client now — the password cannot be shown again.`
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleReset() {
    if (!account) return;
    setError(null);
    setNotice(null);
    if (resetPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (resetPassword !== resetConfirm) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      await post({
        action: "reset_password",
        accountId: account.id,
        password: resetPassword,
      });
      setResetPassword("");
      setResetConfirm("");
      setShowReset(false);
      setNotice(
        `Password updated for ${account.email}. Share the new password with the client now.`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleActive() {
    if (!account) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await post({
        action: account.active ? "deactivate" : "reactivate",
        accountId: account.id,
      });
      setNotice(account.active ? "Client login deactivated." : "Client login reactivated.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Client app login</CardTitle>
        <p className="text-xs text-muted-foreground">
          Create email and password so this client can sign in to the MEGS client app.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900">
            {notice}
          </div>
        ) : null}

        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : account ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{account.email}</span>
              <Badge variant={account.active ? "outline" : "destructive"}>
                {account.active ? "Active" : "Inactive"}
              </Badge>
            </div>
            {account.phone ? (
              <p className="text-muted-foreground">Phone: {account.phone}</p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Created {new Date(account.createdAt).toLocaleString()}
            </p>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setShowReset((v) => !v);
                  setError(null);
                }}
              >
                {showReset ? "Cancel reset" : "Reset password"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void handleToggleActive()}
              >
                {account.active ? "Deactivate" : "Reactivate"}
              </Button>
            </div>

            {showReset ? (
              <div className="space-y-2 rounded-lg border border-border p-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium">New password</label>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    placeholder="Min 8 characters"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Confirm password</label>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={resetConfirm}
                    onChange={(e) => setResetConfirm(e.target.value)}
                    placeholder="Repeat password"
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={busy}
                  onClick={() => void handleReset()}
                >
                  {busy ? "Saving…" : "Save new password"}
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">Email</label>
              <Input
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="client@example.com"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Phone (optional)</label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="082…"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Password</label>
              <Input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 8 characters"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Confirm password</label>
              <Input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat password"
              />
            </div>
            <Button
              type="button"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={busy}
              onClick={() => void handleIssue()}
            >
              {busy ? "Creating…" : "Create login"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
