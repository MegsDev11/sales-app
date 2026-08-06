"use client";

import { PageHeader, PageShell, Panel } from "@/components/layout/page-shell";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useCoordinationAccess } from "@/lib/hooks/use-coordination-access";
import type { User } from "@/lib/types";
import {
  TEAM_OPTIONS,
} from "@/components/coordination/technician-create-form";
import { TechnicianCreateDialog } from "@/components/coordination/technician-create-dialog";
import { TechnicianEditDialog } from "@/components/coordination/technician-edit-dialog";
import {
  TechnicianDocsDialog,
  expiryStatus,
  type TechnicianDocument,
} from "@/components/coordination/technician-docs-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/charts/primitives";
import { SERIES, STATUS } from "@/components/charts/tokens";
import {
  Cable,
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  Pencil,
  Phone,
  FileText,
  Plus,
  Radio,
  Search,
  ShieldAlert,
  Users,
  Wrench,
} from "lucide-react";

type TeamKey = "wireless" | "fiber" | "general";

function teamOf(tech: User): TeamKey {
  const title = (tech.title ?? "").toLowerCase();
  if (title.includes("fib")) return "fiber";
  if (title.includes("wireless") || title.includes("wifi")) return "wireless";
  return "general";
}

const TEAM_META: Record<TeamKey, { label: string; icon: typeof Radio }> = {
  wireless: { label: "Wireless technicians", icon: Radio },
  fiber: { label: "Fiber technicians", icon: Cable },
  general: { label: "Other field technicians", icon: Wrench },
};

/** A masked value with reveal + copy — used for app password and QR code. */
function Secret({
  value,
  revealed,
  onToggle,
}: {
  value: string;
  revealed: boolean;
  onToggle: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="flex items-center gap-1.5">
      <span className="font-mono text-sm font-semibold text-foreground">
        {revealed ? value : "••••••••"}
      </span>
      <button
        type="button"
        onClick={onToggle}
        className="text-muted-foreground transition-colors hover:text-foreground"
        aria-label={revealed ? "Hide" : "Show"}
      >
        {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
        className="text-muted-foreground transition-colors hover:text-foreground"
        aria-label="Copy"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-600" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
    </span>
  );
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
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addMsg, setAddMsg] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState<"all" | TeamKey>("all");
  const [editing, setEditing] = useState<User | null>(null);
  const [editName, setEditName] = useState("");
  const [editTitle, setEditTitle] = useState("Wireless technician");
  const [editTechnicianLevel, setEditTechnicianLevel] =
    useState<"junior" | "senior">("junior");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editIdNumber, setEditIdNumber] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editMsg, setEditMsg] = useState("");
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});
  const [revealedCodes, setRevealedCodes] = useState<Record<string, boolean>>({});
  const [docsFor, setDocsFor] = useState<User | null>(null);
  const [docMeta, setDocMeta] = useState<
    Pick<TechnicianDocument, "id" | "technician_id" | "expires_on">[]
  >([]);

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

  const loadDocMeta = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await fetch("/api/coordination/technicians/documents", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (res.ok) setDocMeta(data.documents ?? []);
    } catch {
      // Documents are additive — a missing migration shouldn't break the roster.
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
    void loadDocMeta();
  }, [load, loadDocMeta]);

  const docSummary = useMemo(() => {
    const map = new Map<string, { count: number; expired: number; soon: number }>();
    for (const d of docMeta) {
      const entry = map.get(d.technician_id) ?? { count: 0, expired: 0, soon: 0 };
      entry.count += 1;
      const status = expiryStatus(d.expires_on);
      if (status?.tone === "danger") entry.expired += 1;
      else if (status?.tone === "warn") entry.soon += 1;
      map.set(d.technician_id, entry);
    }
    return map;
  }, [docMeta]);

  const activeTechs = useMemo(() => techs.filter((u) => u.active !== false), [techs]);
  const inactiveTechs = useMemo(() => techs.filter((u) => u.active === false), [techs]);

  const stats = useMemo(
    () => ({
      total: activeTechs.length,
      wireless: activeTechs.filter((t) => teamOf(t) === "wireless").length,
      fiber: activeTechs.filter((t) => teamOf(t) === "fiber").length,
      noLogin: activeTechs.filter((t) => !t.authUserId).length,
    }),
    [activeTechs]
  );

  const filteredActive = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeTechs.filter((t) => {
      if (teamFilter !== "all" && teamOf(t) !== teamFilter) return false;
      if (
        q &&
        !`${t.name} ${t.title ?? ""} ${t.email ?? ""} ${t.phone ?? ""} ${t.idNumber ?? ""}`
          .toLowerCase()
          .includes(q)
      )
        return false;
      return true;
    });
  }, [activeTechs, search, teamFilter]);

  const teamGroups = useMemo(
    () =>
      (["wireless", "fiber", "general"] as TeamKey[]).map((key) => ({
        key,
        ...TEAM_META[key],
        members: filteredActive.filter((t) => teamOf(t) === key),
      })),
    [filteredActive]
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
    if (!name.trim()) return setAddMsg("Enter a name");
    if (!email.trim()) {
      return setAddMsg(
        "Email is required — techs sign into the MEGS Field app with email + password"
      );
    }
    if (password.length < 8) return setAddMsg("App password must be at least 8 characters");
    setBusy(true);
    setAddMsg("");
    try {
      await postAction({
        action: "create",
        name: name.trim(),
        title: title.trim(),
        technicianLevel,
        phone: phone.trim(),
        email: email.trim(),
        idNumber: idNumber.trim(),
        password,
      });
      setName("");
      setPhone("");
      setEmail("");
      setIdNumber("");
      setPassword("");
      setAddOpen(false);
      setMsg("Technician added with MEGS Field app login (email + password on their card).");
      await load();
    } catch (e) {
      setAddMsg(e instanceof Error ? e.message : "Add failed");
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
    setEditPassword("");
    setEditMsg("");
  }

  async function handleSaveEdit() {
    if (!editing) return;
    if (!editName.trim()) return setEditMsg("Enter a name");
    if (!editEmail.trim()) return setEditMsg("Email is required for app login");
    if (!editing.authUserId && editPassword.length < 8) {
      return setEditMsg("Set an app password (min 8 characters) to enable mobile login");
    }
    if (editPassword && editPassword.length < 8) {
      return setEditMsg("New app password must be at least 8 characters");
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
        ...(editPassword ? { password: editPassword } : {}),
      });
      setEditing(null);
      setMsg(editPassword ? "Technician updated — app login password changed" : "Technician updated");
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
      await postAction({
        action: revoke ? "revokeAccessCode" : "generateAccessCode",
        technicianId: tech.id,
      });
      if (!revoke) setRevealedCodes((prev) => ({ ...prev, [tech.id]: true }));
      setMsg(revoke ? "Access code revoked" : "New QR access code generated — shown on the card.");
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

  const visibleGroups = teamGroups.filter((g) => g.members.length > 0);

  return (
    <PageShell>
      <PageHeader
        title="Technicians"
        description="Field technicians and their MEGS Field app access"
        actions={
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => {
              setAddMsg("");
              setAddOpen(true);
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" /> Add technician
          </Button>
        }
      />

      {msg && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
          <span>{msg}</span>
          <button
            type="button"
            onClick={() => setMsg("")}
            className="shrink-0 text-slate-400 hover:text-slate-600"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* Overview */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Active technicians" value={stats.total} icon={Users} accent={SERIES[0]} />
        <StatTile label="Wireless" value={stats.wireless} icon={Radio} accent={SERIES[3]} />
        <StatTile label="Fiber" value={stats.fiber} icon={Cable} accent={SERIES[6]} />
        <StatTile
          label="No app login"
          value={stats.noLogin}
          icon={ShieldAlert}
          accent={stats.noLogin > 0 ? STATUS.warning : SERIES[2]}
          higherIsBetter={false}
        />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, phone…"
            className="pl-8"
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-0.5">
          {(["all", "wireless", "fiber", "general"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTeamFilter(key)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                teamFilter === key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {key === "general" ? "Other" : key}
            </button>
          ))}
        </div>
      </div>

      {!loaded ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : activeTechs.length === 0 ? (
        <Panel>
          <div className="py-6 text-center">
            <Users className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No active technicians yet.</p>
            <Button variant="outline" className="mt-3" onClick={() => setAddOpen(true)}>
              Add the first one
            </Button>
          </div>
        </Panel>
      ) : visibleGroups.length === 0 ? (
        <p className="text-sm text-muted-foreground">No technicians match those filters.</p>
      ) : (
        visibleGroups.map((group) => (
          <div key={group.key} className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <group.icon className="h-4 w-4 text-primary" />
              {group.label}
              <span className="text-muted-foreground">({group.members.length})</span>
            </h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {group.members.map((tech) => (
                <Card key={tech.id} className="bg-white">
                  <CardContent className="space-y-3 p-4">
                    {/* Identity */}
                    <div className="flex items-start gap-3">
                      <Avatar style={{ boxShadow: `0 0 0 2px ${tech.color}` }}>
                        <AvatarFallback
                          className="text-xs font-semibold text-white"
                          style={{ backgroundColor: tech.color }}
                        >
                          {tech.avatarInitials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{tech.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{tech.title}</p>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {tech.technicianLevel ?? "junior"}
                          </Badge>
                          {tech.authUserId ? (
                            <Badge className="border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700">
                              App login active
                            </Badge>
                          ) : (
                            <Badge className="border-amber-200 bg-amber-50 text-[10px] text-amber-700">
                              No app login
                            </Badge>
                          )}
                          {tech.hasAccessCode ? (
                            <Badge variant="outline" className="text-[10px]">
                              QR code
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {/* Contact */}
                    {(tech.phone || tech.email || tech.idNumber) && (
                      <div className="space-y-1 text-xs text-muted-foreground">
                        {tech.phone ? (
                          <p className="flex items-center gap-1.5">
                            <Phone className="h-3.5 w-3.5 shrink-0" /> {tech.phone}
                          </p>
                        ) : null}
                        {tech.email ? (
                          <p className="flex items-center gap-1.5 break-all">
                            <Mail className="h-3.5 w-3.5 shrink-0" /> {tech.email}
                          </p>
                        ) : null}
                        {tech.idNumber ? (
                          <p className="flex items-center gap-1.5">
                            <span className="w-3.5 shrink-0 text-center font-semibold">#</span>
                            {tech.idNumber}
                          </p>
                        ) : null}
                      </div>
                    )}

                    {/* Credentials */}
                    <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-2.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-muted-foreground">App password</span>
                        {tech.loginPassword ? (
                          <Secret
                            value={tech.loginPassword}
                            revealed={!!revealedPasswords[tech.id]}
                            onToggle={() =>
                              setRevealedPasswords((p) => ({ ...p, [tech.id]: !p[tech.id] }))
                            }
                          />
                        ) : (
                          <span className="text-amber-700">Not set</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
                        <span className="font-medium text-muted-foreground">QR access code</span>
                        {tech.accessCode ? (
                          <Secret
                            value={tech.accessCode}
                            revealed={!!revealedCodes[tech.id]}
                            onToggle={() =>
                              setRevealedCodes((p) => ({ ...p, [tech.id]: !p[tech.id] }))
                            }
                          />
                        ) : tech.hasAccessCode ? (
                          <span className="text-muted-foreground">Set (hidden)</span>
                        ) : (
                          <span className="text-muted-foreground">None</span>
                        )}
                      </div>
                    </div>

                    {/* Docs & qualifications */}
                    {(() => {
                      const summary = docSummary.get(tech.id);
                      return (
                        <button
                          type="button"
                          onClick={() => setDocsFor(tech)}
                          className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-background px-2.5 py-2 text-xs transition-colors hover:bg-muted"
                        >
                          <span className="flex items-center gap-1.5 font-medium">
                            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                            Docs &amp; qualifications
                          </span>
                          <span className="flex items-center gap-1.5">
                            {summary?.expired ? (
                              <Badge className="border-red-200 bg-red-50 text-[10px] text-red-700">
                                {summary.expired} expired
                              </Badge>
                            ) : summary?.soon ? (
                              <Badge className="border-amber-200 bg-amber-50 text-[10px] text-amber-700">
                                {summary.soon} expiring
                              </Badge>
                            ) : null}
                            <span className="text-muted-foreground">{summary?.count ?? 0}</span>
                          </span>
                        </button>
                      );
                    })()}

                    {/* Actions */}
                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => openEdit(tech)}>
                        <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void handleAccessCode(tech)}
                      >
                        <KeyRound className="mr-1 h-3.5 w-3.5" />
                        {tech.hasAccessCode ? "New code" : "Set code"}
                      </Button>
                      <div className="ml-auto flex items-center gap-1">
                        {tech.hasAccessCode ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs text-muted-foreground"
                            disabled={busy}
                            onClick={() => void handleAccessCode(tech, true)}
                          >
                            Revoke
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs text-muted-foreground hover:text-destructive"
                          disabled={busy}
                          onClick={() => void handleToggle(tech, false)}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))
      )}

      {/* Inactive */}
      {inactiveTechs.length > 0 ? (
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
      ) : null}

      <TechnicianCreateDialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) setAddMsg("");
        }}
        name={name}
        onNameChange={setName}
        title={title}
        onTitleChange={setTitle}
        technicianLevel={technicianLevel}
        onTechnicianLevelChange={setTechnicianLevel}
        phone={phone}
        onPhoneChange={setPhone}
        email={email}
        onEmailChange={setEmail}
        password={password}
        onPasswordChange={setPassword}
        idNumber={idNumber}
        onIdNumberChange={setIdNumber}
        msg={addMsg}
        busy={busy}
        onAdd={() => void handleAdd()}
      />

      <TechnicianDocsDialog
        technician={docsFor}
        open={!!docsFor}
        onOpenChange={(open) => !open && setDocsFor(null)}
        accessToken={accessToken ?? ""}
        onChanged={() => void loadDocMeta()}
      />

      <TechnicianEditDialog
        editing={editing}
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
        editName={editName}
        onEditNameChange={setEditName}
        editTitle={editTitle}
        onEditTitleChange={setEditTitle}
        editTechnicianLevel={editTechnicianLevel}
        onEditTechnicianLevelChange={setEditTechnicianLevel}
        editPhone={editPhone}
        onEditPhoneChange={setEditPhone}
        editEmail={editEmail}
        onEditEmailChange={setEditEmail}
        editIdNumber={editIdNumber}
        onEditIdNumberChange={setEditIdNumber}
        editPassword={editPassword}
        onEditPasswordChange={setEditPassword}
        editMsg={editMsg}
        busy={busy}
        onSave={() => void handleSaveEdit()}
        onCancel={() => setEditing(null)}
      />
    </PageShell>
  );
}
