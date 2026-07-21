"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useCoordinationAccess } from "@/lib/hooks/use-coordination-access";
import type { User } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { KeyRound, UserPlus } from "lucide-react";

export default function CoordinationTechniciansPage() {
  const { allowed, isLoading } = useCoordinationAccess();
  const { accessToken } = useAuth();
  const [techs, setTechs] = useState<User[]>([]);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("Field technician");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [codeMsgs, setCodeMsgs] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!accessToken) return;
    const res = await fetch("/api/coordination/technicians", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    const data = await res.json();
    if (res.ok) setTechs(data.technicians ?? []);
    setLoaded(true);
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeTechs = useMemo(() => techs.filter((u) => u.active !== false), [techs]);
  const inactiveTechs = useMemo(() => techs.filter((u) => u.active === false), [techs]);

  if (isLoading || !allowed) return null;

  async function postAction(body: Record<string, unknown>) {
    if (!accessToken) throw new Error("Not signed in");
    const res = await fetch("/api/coordination/technicians", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Request failed");
    return data;
  }

  async function handleAdd() {
    if (!name.trim()) {
      setMsg("Enter a name");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      await postAction({ action: "create", name: name.trim(), title: title.trim() });
      setName("");
      setTitle("Field technician");
      setMsg("Technician added — they will appear in pick-list tech selectors after refresh.");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Add failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleAccessCode(tech: User, revoke = false) {
    if (
      !revoke &&
      !window.confirm(
        `Generate a new QR access code for ${tech.name}? Any previous code will stop working.`
      )
    ) {
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const data = await postAction({
        action: revoke ? "revokeAccessCode" : "generateAccessCode",
        technicianId: tech.id,
      });
      if (!revoke && data.accessCode) {
        setCodeMsgs((prev) => ({
          ...prev,
          [tech.id]: `Access code for ${tech.name}: ${data.accessCode as string}`,
        }));
      }
      setMsg(revoke ? "Access code revoked" : "Access code generated — shown on card");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Code update failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggle(tech: User, activate: boolean) {
    setBusy(true);
    setMsg("");
    try {
      await postAction({
        action: activate ? "reactivate" : "deactivate",
        technicianId: tech.id,
      });
      setMsg(activate ? "Technician reactivated" : "Technician removed from active list");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-bold">Technicians</h1>
        <p className="text-sm text-muted-foreground">
          Field techs for pick-list assignment. No app login is created — use Staff Accounts for
          manager logins.
        </p>
      </div>

      {msg && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {msg}
        </div>
      )}

      <Card className="bg-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserPlus className="h-4 w-4" />
            Add technician
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Input
            className="max-w-xs"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
          />
          <Input
            className="max-w-xs"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
          />
          <Button
            className="bg-[#C83733] hover:bg-[#a82f2b]"
            disabled={busy}
            onClick={() => void handleAdd()}
          >
            Add
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold">Active ({activeTechs.length})</h2>
        {!loaded ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : activeTechs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active technicians yet.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {activeTechs.map((tech) => (
              <Card key={tech.id} className="bg-white">
                <CardContent className="flex items-start justify-between gap-3 p-4">
                  <div className="flex items-center gap-3">
                    <Avatar style={{ boxShadow: `0 0 0 2px ${tech.color}` }}>
                      <AvatarFallback
                        className="text-xs font-semibold text-white"
                        style={{ backgroundColor: tech.color }}
                      >
                        {tech.avatarInitials}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{tech.name}</p>
                      <p className="text-xs text-muted-foreground">{tech.title}</p>
                      {!tech.authUserId && (
                        <Badge variant="outline" className="mt-1 text-[10px]">
                          Field only
                        </Badge>
                      )}
                      {tech.hasAccessCode ? (
                        <Badge variant="outline" className="mt-1 ml-1 text-[10px]">
                          QR code set
                        </Badge>
                      ) : null}
                      {tech.accessCode ? (
                        <p className="mt-2 font-mono text-lg font-bold tracking-[0.25em] text-[#C83733]">
                          {tech.accessCode}
                        </p>
                      ) : tech.hasAccessCode ? (
                        <p className="mt-2 max-w-36 text-[10px] text-amber-700">
                          Existing code is hidden. Select New code to create a visible 4-digit code.
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void handleAccessCode(tech)}
                    >
                      <KeyRound className="mr-1 h-3 w-3" />
                      {tech.hasAccessCode ? "New code" : "Set code"}
                    </Button>
                    {tech.hasAccessCode && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs text-muted-foreground"
                        disabled={busy}
                        onClick={() => void handleAccessCode(tech, true)}
                      >
                        Revoke
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void handleToggle(tech, false)}
                    >
                      Remove
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {Object.entries(codeMsgs).map(([techId, text]) => (
        <div
          key={techId}
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          {text}
        </div>
      ))}

      <div className="space-y-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setShowInactive((v) => !v)}>
          {showInactive ? "Hide" : "Show"} inactive ({inactiveTechs.length})
        </Button>
        {showInactive &&
          inactiveTechs.map((tech) => (
            <Card key={tech.id} className="bg-gray-50">
              <CardContent className="flex items-center justify-between gap-3 p-3 text-sm">
                <span className="text-muted-foreground">
                  {tech.name} — {tech.title}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void handleToggle(tech, true)}
                >
                  Reactivate
                </Button>
              </CardContent>
            </Card>
          ))}
      </div>
    </div>
  );
}
