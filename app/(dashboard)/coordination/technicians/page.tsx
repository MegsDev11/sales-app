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
import { KeyRound, Pencil, Radio, Cable, UserPlus } from "lucide-react";

const TEAM_OPTIONS = [
  { value: "Wireless technician", label: "Wireless technician" },
  { value: "Fiber technician", label: "Fiber technician" },
];

function teamOf(tech: User): "wireless" | "fiber" | "general" {
  const title = (tech.title ?? "").toLowerCase();
  if (title.includes("fib")) return "fiber";
  if (title.includes("wireless") || title.includes("wifi")) return "wireless";
  return "general";
}

export default function CoordinationTechniciansPage() {
  const { allowed, isLoading } = useCoordinationAccess();
  const { accessToken } = useAuth();
  const [techs, setTechs] = useState<User[]>([]);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("Wireless technician");
  const [technicianLevel, setTechnicianLevel] = useState<"junior" | "senior">("junior");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [codeMsgs, setCodeMsgs] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<User | null>(null);
  const [editName, setEditName] = useState("");
  const [editTitle, setEditTitle] = useState("Wireless technician");
  const [editTechnicianLevel, setEditTechnicianLevel] =
    useState<"junior" | "senior">("junior");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editIdNumber, setEditIdNumber] = useState("");
  const [editMsg, setEditMsg] = useState("");

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
  const teamGroups = useMemo(
    () => [
      {
        key: "wireless" as const,
        label: "Wireless technicians",
        icon: Radio,
        members: activeTechs.filter((t) => teamOf(t) === "wireless"),
      },
      {
        key: "fiber" as const,
        label: "Fiber technicians",
        icon: Cable,
        members: activeTechs.filter((t) => teamOf(t) === "fiber"),
      },
      {
        key: "general" as const,
        label: "Other field technicians",
        icon: UserPlus,
        members: activeTechs.filter((t) => teamOf(t) === "general"),
      },
    ],
    [activeTechs]
  );

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
      await postAction({
        action: "create",
        name: name.trim(),
        title: title.trim(),
        technicianLevel,
        phone: phone.trim(),
        email: email.trim(),
        idNumber: idNumber.trim(),
      });
      setName("");
      setPhone("");
      setEmail("");
      setIdNumber("");
      setMsg("Technician added — they will appear in pick-list tech selectors after refresh.");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Add failed");
    } finally {
      setBusy(false);
    }
  }

  function openEdit(tech: User) {
    setEditing(tech);
    setEditName(tech.name);
    setEditTitle(
      TEAM_OPTIONS.some((o) => o.value === tech.title) ? tech.title : tech.title || "Field technician"
    );
    setEditTechnicianLevel(tech.technicianLevel ?? "junior");
    setEditPhone(tech.phone ?? "");
    setEditEmail(tech.email ?? "");
    setEditIdNumber(tech.idNumber ?? "");
    setEditMsg("");
  }

  async function handleSaveEdit() {
    if (!editing) return;
    if (!editName.trim()) {
      setEditMsg("Enter a name");
      return;
    }
    setBusy(true);
    setEditMsg("");
    try {
      await postAction({
        action: "update",
        technicianId: editing.id,
        name: editName.trim(),
        title: editTitle.trim(),
        technicianLevel: editTechnicianLevel,
        phone: editPhone.trim(),
        email: editEmail.trim(),
        idNumber: editIdNumber.trim(),
      });
      setEditing(null);
      setMsg("Technician updated");
      await load();
    } catch (e) {
      setEditMsg(e instanceof Error ? e.message : "Update failed");
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
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
          />
          <Select value={title} onValueChange={(v) => v && setTitle(v)}>
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
          <Select
            value={technicianLevel}
            onValueChange={(value) =>
              value && setTechnicianLevel(value as "junior" | "senior")
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
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" />
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
          />
          <Input
            value={idNumber}
            onChange={(e) => setIdNumber(e.target.value)}
            placeholder="ID number"
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

      {!loaded ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : activeTechs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active technicians yet.</p>
      ) : (
        teamGroups
          .filter((group) => group.key !== "general" || group.members.length > 0)
          .map((group) => (
            <div key={group.key} className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <group.icon className="h-4 w-4 text-[#C83733]" />
                {group.label} ({group.members.length})
              </h2>
              {group.members.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No {group.label.toLowerCase()} yet.
                </p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {group.members.map((tech) => (
                    <Card key={tech.id} className="bg-white">
                      <CardContent className="flex items-start justify-between gap-3 p-4">
                        <div className="flex items-start gap-3">
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
                            <Badge
                              variant="outline"
                              className="mt-1 text-[10px] capitalize"
                            >
                              {tech.technicianLevel ?? "junior"}
                            </Badge>
                            {!tech.authUserId && (
                              <Badge variant="outline" className="mt-1 ml-1 text-[10px]">
                                Field only
                              </Badge>
                            )}
                            {tech.hasAccessCode ? (
                              <Badge variant="outline" className="mt-1 ml-1 text-[10px]">
                                QR code set
                              </Badge>
                            ) : null}
                            {(tech.phone || tech.email || tech.idNumber) && (
                              <div className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
                                {tech.phone ? <p>Phone: {tech.phone}</p> : null}
                                {tech.email ? <p className="break-all">Email: {tech.email}</p> : null}
                                {tech.idNumber ? <p>ID: {tech.idNumber}</p> : null}
                              </div>
                            )}
                            {tech.accessCode ? (
                              <p className="mt-2 font-mono text-lg font-bold tracking-[0.25em] text-[#C83733]">
                                {tech.accessCode}
                              </p>
                            ) : tech.hasAccessCode ? (
                              <p className="mt-2 max-w-36 text-[10px] text-amber-700">
                                Existing code is hidden. Select New code to create a visible
                                4-digit code.
                              </p>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => openEdit(tech)}
                          >
                            <Pencil className="mr-1 h-3 w-3" />
                            Edit
                          </Button>
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
          ))
      )}

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

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto bg-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit technician</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="space-y-1">
              <label className="font-medium">Full name</label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="font-medium">Team / title</label>
              <Select value={editTitle} onValueChange={(v) => v && setEditTitle(v)}>
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
                  value && setEditTechnicianLevel(value as "junior" | "senior")
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
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="Phone number"
              />
            </div>
            <div className="space-y-1">
              <label className="font-medium">Email address</label>
              <Input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="Email address"
              />
            </div>
            <div className="space-y-1">
              <label className="font-medium">ID number</label>
              <Input
                value={editIdNumber}
                onChange={(e) => setEditIdNumber(e.target.value)}
                placeholder="ID number"
              />
            </div>
            {editMsg && <p className="text-sm text-[#C83733]">{editMsg}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              className="bg-[#C83733] hover:bg-[#a82f2b]"
              disabled={busy}
              onClick={() => void handleSaveEdit()}
            >
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
