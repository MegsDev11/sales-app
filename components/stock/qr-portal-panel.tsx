"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  ClientSupportRequest,
  ClientSupportRequestCategory,
  QrPortalRole,
  StockItemVisit,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CATEGORY_LABELS: Record<ClientSupportRequestCategory, string> = {
  slow_internet: "Slow internet",
  no_internet: "No internet",
  quote: "Request a quote",
  other: "Other",
};

const STATUS_LABELS: Record<ClientSupportRequest["status"], string> = {
  new: "Submitted",
  checked: "Checked",
  site_survey_needed: "Site survey needed",
  resolved: "Resolved",
};

type PortalState = {
  authenticated: boolean;
  role?: QrPortalRole;
  technicianName?: string;
  visits: StockItemVisit[];
  supportRequests: ClientSupportRequest[];
  clientDetails?: {
    clientPppoe: string;
    wifiName: string;
    wifiPassword: string;
  } | null;
};

export function QrPortalPanel({ token }: { token: string }) {
  const [portal, setPortal] = useState<PortalState>({
    authenticated: false,
    visits: [],
    supportRequests: [],
  });
  const [role, setRole] = useState<QrPortalRole>("client");
  const [code, setCode] = useState("");
  const [workNotes, setWorkNotes] = useState("");
  const [category, setCategory] = useState<ClientSupportRequestCategory>("slow_internet");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  const portalUrl = `/api/stock/item/${encodeURIComponent(token)}/portal`;

  const loadPortal = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(portalUrl, { cache: "no-store", credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load portal");
      setPortal({
        authenticated: Boolean(data.authenticated),
        role: data.role,
        technicianName: data.technicianName,
        visits: data.visits ?? [],
        supportRequests: data.supportRequests ?? [],
        clientDetails: data.clientDetails ?? null,
      });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed to load portal");
    } finally {
      setLoading(false);
    }
  }, [portalUrl]);

  useEffect(() => {
    void loadPortal();
  }, [loadPortal]);

  async function postAction(body: Record<string, unknown>) {
    const res = await fetch(portalUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Request failed");
    return data;
  }

  async function handleAuthenticate() {
    if (!code.trim()) {
      setMsg("Enter your access code");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const data = await postAction({ action: "authenticate", role, code: code.trim() });
      setPortal({
        authenticated: true,
        role: data.role,
        technicianName: data.technicianName,
        visits: data.visits ?? [],
        supportRequests: data.supportRequests ?? [],
        clientDetails: data.clientDetails ?? null,
      });
      setCode("");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Invalid code");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    setBusy(true);
    try {
      await postAction({ action: "logout" });
      setPortal({ authenticated: false, visits: [], supportRequests: [] });
      setWorkNotes("");
      setDescription("");
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitVisit() {
    setBusy(true);
    setMsg("");
    try {
      const data = await postAction({ action: "submitVisit", workNotes });
      setPortal((prev) => ({ ...prev, visits: data.visits ?? [] }));
      setWorkNotes("");
      setMsg("Work log submitted");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitSupport() {
    setBusy(true);
    setMsg("");
    try {
      const data = await postAction({
        action: "submitSupportRequest",
        category,
        description,
      });
      setPortal((prev) => ({
        ...prev,
        supportRequests: data.supportRequests ?? [],
      }));
      setDescription("");
      setMsg("Support request sent — our team will update the status here.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <Card className="border-white/10 bg-white/5 text-white">
        <CardContent className="py-6 text-center text-sm text-white/70">Loading portal…</CardContent>
      </Card>
    );
  }

  if (!portal.authenticated) {
    return (
      <Card className="border-white/10 bg-white text-gray-900">
        <CardHeader>
          <CardTitle className="text-base">Client or technician access</CardTitle>
          <p className="text-xs text-muted-foreground">
            Choose your role and enter your access code to continue.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {(["client", "technician"] as const).map((value) => (
              <Button
                key={value}
                type="button"
                variant={role === value ? "default" : "outline"}
                className={role === value ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""}
                onClick={() => setRole(value)}
              >
                {value === "client" ? "Client" : "Technician"}
              </Button>
            ))}
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Access code</label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
              inputMode="numeric"
              maxLength={4}
              placeholder="4-digit code"
              onKeyDown={(e) => e.key === "Enter" && void handleAuthenticate()}
            />
          </div>
          {msg && <p className="text-sm text-primary">{msg}</p>}
          <Button
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={busy}
            onClick={() => void handleAuthenticate()}
          >
            Continue
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-white/80">
          Signed in as{" "}
          <span className="font-semibold text-white">
            {portal.role === "technician"
              ? portal.technicianName ?? "Technician"
              : "Client"}
          </span>
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void handleLogout()}
        >
          Sign out
        </Button>
      </div>

      {portal.role === "client" && portal.clientDetails && (
        <Card className="border-white/10 bg-white text-gray-900">
          <CardHeader>
            <CardTitle className="text-base">Connection details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {portal.clientDetails.clientPppoe ? (
              <p>
                <span className="text-muted-foreground">PPPoE:</span>{" "}
                {portal.clientDetails.clientPppoe}
              </p>
            ) : null}
            {portal.clientDetails.wifiName ? (
              <p>
                <span className="text-muted-foreground">WiFi:</span> {portal.clientDetails.wifiName}
              </p>
            ) : null}
            {portal.clientDetails.wifiPassword ? (
              <p>
                <span className="text-muted-foreground">WiFi password:</span>{" "}
                {portal.clientDetails.wifiPassword}
              </p>
            ) : null}
          </CardContent>
        </Card>
      )}

      {portal.role === "technician" && (
        <Card className="border-white/10 bg-white text-gray-900">
          <CardHeader>
            <CardTitle className="text-base">Log work on site</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={workNotes}
              onChange={(e) => setWorkNotes(e.target.value)}
              placeholder="What did you do on site?"
              rows={4}
            />
            <Button
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={busy || !workNotes.trim()}
              onClick={() => void handleSubmitVisit()}
            >
              Submit work log
            </Button>
          </CardContent>
        </Card>
      )}

      {portal.role === "client" && (
        <Card className="border-white/10 bg-white text-gray-900">
          <CardHeader>
            <CardTitle className="text-base">Contact support</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Issue type</label>
              <Select
                value={category}
                onValueChange={(v) => v && setCategory(v as ClientSupportRequestCategory)}
              >
                <SelectTrigger>
                  <SelectValue>
                    {(value) => CATEGORY_LABELS[value as ClientSupportRequestCategory] ?? "Issue"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your problem or request…"
              rows={4}
            />
            <Button
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={busy || !description.trim()}
              onClick={() => void handleSubmitSupport()}
            >
              Send to support
            </Button>
          </CardContent>
        </Card>
      )}

      {portal.role === "client" && portal.supportRequests.length > 0 && (
        <Card className="border-white/10 bg-white text-gray-900">
          <CardHeader>
            <CardTitle className="text-base">Your support requests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {portal.supportRequests.map((req) => (
              <div key={req.id} className="rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{CATEGORY_LABELS[req.category]}</p>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium">
                    {STATUS_LABELS[req.status]}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap">{req.description}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Submitted {new Date(req.createdAt).toLocaleString("en-ZA")}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {portal.visits.length > 0 && (
        <Card className="border-white/10 bg-white text-gray-900">
          <CardHeader>
            <CardTitle className="text-base">Technician visit history</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {portal.visits.map((visit) => (
              <div key={visit.id} className="rounded-lg border p-3 text-sm">
                <p className="font-medium">{visit.technicianName ?? "Technician"}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(visit.submittedAt).toLocaleString("en-ZA")}
                </p>
                <p className="mt-2 whitespace-pre-wrap">{visit.workNotes}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {msg && <p className="text-center text-sm text-[#e05752]">{msg}</p>}
    </div>
  );
}
