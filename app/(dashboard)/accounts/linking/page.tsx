"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, PageShell, Panel, AlertBanner } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link2, Loader2, Search, UserCheck } from "lucide-react";

/**
 * Client identity linking — the human review step for what migration 066
 * could not join automatically.
 *
 * Three queues, three joins:
 *   devices -> billing clients   (stock_items.client_id)
 *   Sage rep strings -> staff    (accounts_clients.sales_rep_member_id)
 *   CRM leads -> billing clients (accounts_clients.lead_id)
 *
 * Everything shown here is a suggestion; nothing links without a click. The
 * queues shrink as links land, so an empty page means the identities are joined.
 */

interface Suggestion {
  id: string;
  name: string;
  pppoe: string;
  billingStatus: string;
  score: number;
  reason: string;
}

interface DeviceRow {
  id: string;
  brand: string;
  deviceName: string;
  serialNumber: string;
  clientName: string;
  clientAddress: string;
  clientPppoe: string;
  suggestions: Suggestion[];
}

interface RepRow {
  salesRep: string;
  clients: number;
  suggestedMemberId: string | null;
  suggestedMemberName: string | null;
}

interface LeadRow {
  id: string;
  clientName: string;
  email: string;
  phone: string;
  leadSource: string;
  suggestions: Suggestion[];
}

interface Member {
  id: string;
  name: string;
}

interface LinkingData {
  devices: DeviceRow[];
  reps: RepRow[];
  leads: LeadRow[];
  members: Member[];
  totals: {
    unlinkedDevices: number;
    unresolvedRepClients: number;
    unlinkedLeads: number;
    clients: number;
  };
  canEdit: boolean;
}

export default function LinkingPage() {
  const { accessToken } = useAuth();

  const [data, setData] = useState<LinkingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [repChoice, setRepChoice] = useState<Record<string, string>>({});
  const [searchFor, setSearchFor] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/accounts/linking", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load");
      setData(body as LinkingData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const post = useCallback(
    async (payload: Record<string, unknown>, key: string) => {
      if (!accessToken) return;
      setBusy(key);
      setError(null);
      try {
        const res = await fetch("/api/accounts/linking", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Failed to save");
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      } finally {
        setBusy(null);
      }
    },
    [accessToken, load]
  );

  const runSearch = useCallback(async () => {
    if (!accessToken || !searchText.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(
        `/api/accounts/linking?q=${encodeURIComponent(searchText.trim())}`,
        { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" }
      );
      const body = await res.json();
      if (res.ok) setSearchResults(body.results ?? []);
    } finally {
      setSearching(false);
    }
  }, [accessToken, searchText]);

  const canEdit = data?.canEdit ?? false;

  return (
    <PageShell>
      <PageHeader
        title="Client linking"
        description="Join installed devices, Sage sales reps and CRM leads to the client book — invoices per project, QR billing info and commission matching all depend on these links."
        actions={loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
      />

      {error ? <AlertBanner tone="danger">{error}</AlertBanner> : null}

      {data ? (
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">{data.totals.unlinkedDevices} devices to link</Badge>
          <Badge variant="outline">
            {data.totals.unresolvedRepClients} clients with an unresolved rep
          </Badge>
          <Badge variant="outline">{data.totals.unlinkedLeads} leads not in the book</Badge>
          <Badge variant="outline">{data.totals.clients.toLocaleString()} billing clients</Badge>
        </div>
      ) : null}

      <Panel title="Devices without a billing client" padded={false}>
        {!data || data.devices.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {loading ? "Loading…" : "Every device with client details is linked."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Device</th>
                  <th className="px-4 py-2 font-medium">On the label</th>
                  <th className="px-4 py-2 font-medium">Suggested client</th>
                </tr>
              </thead>
              <tbody>
                {data.devices.map((d) => (
                  <tr key={d.id} className="border-b border-border align-top last:border-0">
                    <td className="px-4 py-2.5">
                      <span className="font-medium">
                        {[d.brand, d.deviceName].filter(Boolean).join(" ") || "Unit"}
                      </span>
                      {d.serialNumber ? (
                        <span className="block text-xs text-muted-foreground">
                          SN {d.serialNumber}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5">
                      <span>{d.clientName || "—"}</span>
                      {d.clientPppoe ? (
                        <span className="block text-xs text-muted-foreground">
                          PPPoE {d.clientPppoe}
                        </span>
                      ) : null}
                      {d.clientAddress ? (
                        <span className="block text-xs text-muted-foreground">
                          {d.clientAddress}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {d.suggestions.map((s) => (
                          <Button
                            key={s.id}
                            size="xs"
                            variant="outline"
                            disabled={!canEdit || busy !== null}
                            onClick={() =>
                              void post(
                                { action: "linkDevice", itemId: d.id, clientId: s.id },
                                `dev-${d.id}`
                              )
                            }
                          >
                            <Link2 className="mr-1 h-3 w-3" />
                            {s.name}
                            <span className="ml-1 text-muted-foreground">
                              {s.score}% · {s.reason}
                            </span>
                          </Button>
                        ))}
                        <Button
                          size="xs"
                          variant="ghost"
                          disabled={!canEdit}
                          onClick={() => {
                            setSearchFor(searchFor === d.id ? null : d.id);
                            setSearchText(d.clientName);
                            setSearchResults([]);
                          }}
                        >
                          <Search className="mr-1 h-3 w-3" />
                          Find…
                        </Button>
                      </div>
                      {searchFor === d.id ? (
                        <div className="mt-2 space-y-1.5">
                          <div className="flex items-center gap-1.5">
                            <Input
                              value={searchText}
                              onChange={(e) => setSearchText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") void runSearch();
                              }}
                              placeholder="Search the client book…"
                              className="h-7 max-w-60 text-xs"
                            />
                            <Button size="xs" variant="outline" onClick={() => void runSearch()}>
                              {searching ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                "Search"
                              )}
                            </Button>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {searchResults.map((s) => (
                              <Button
                                key={s.id}
                                size="xs"
                                variant="outline"
                                disabled={!canEdit || busy !== null}
                                onClick={() =>
                                  void post(
                                    { action: "linkDevice", itemId: d.id, clientId: s.id },
                                    `dev-${d.id}`
                                  )
                                }
                              >
                                <Link2 className="mr-1 h-3 w-3" />
                                {s.name}
                              </Button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Sage sales reps → staff" padded={false}>
        {!data || data.reps.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {loading ? "Loading…" : "Every sales rep on the book resolves to a staff member."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Name in Sage</th>
                  <th className="px-4 py-2 text-right font-medium">Clients</th>
                  <th className="px-4 py-2 font-medium">Staff member</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {data.reps.map((r) => {
                  const chosen = repChoice[r.salesRep] ?? r.suggestedMemberId ?? "";
                  return (
                    <tr key={r.salesRep} className="border-b border-border last:border-0">
                      <td className="px-4 py-2.5 font-medium">{r.salesRep}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{r.clients}</td>
                      <td className="px-4 py-2.5">
                        <Select
                          value={chosen}
                          onValueChange={(value) =>
                            setRepChoice((prev) => ({ ...prev, [r.salesRep]: value ?? "" }))
                          }
                        >
                          <SelectTrigger className="h-8 w-56 text-xs">
                            <SelectValue placeholder="Pick a staff member…" />
                          </SelectTrigger>
                          <SelectContent>
                            {data.members.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Button
                          size="xs"
                          variant="outline"
                          disabled={!canEdit || !chosen || busy !== null}
                          onClick={() =>
                            void post(
                              { action: "mapRep", salesRep: r.salesRep, memberId: chosen },
                              `rep-${r.salesRep}`
                            )
                          }
                        >
                          {busy === `rep-${r.salesRep}` ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <>
                              <UserCheck className="mr-1 h-3 w-3" />
                              Apply to {r.clients}
                            </>
                          )}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="CRM leads → client book" padded={false}>
        {!data || data.leads.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {loading ? "Loading…" : "Every lead is linked to a billing client."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Lead</th>
                  <th className="px-4 py-2 font-medium">Source</th>
                  <th className="px-4 py-2 font-medium">Matches in the book</th>
                </tr>
              </thead>
              <tbody>
                {data.leads.map((l) => (
                  <tr key={l.id} className="border-b border-border align-top last:border-0">
                    <td className="px-4 py-2.5">
                      <span className="font-medium">{l.clientName || "Unnamed lead"}</span>
                      {l.email || l.phone ? (
                        <span className="block text-xs text-muted-foreground">
                          {[l.email, l.phone].filter(Boolean).join(" · ")}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 capitalize text-muted-foreground">
                      {l.leadSource.replace(/-/g, " ") || "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      {l.suggestions.length === 0 ? (
                        <span className="text-xs text-muted-foreground">
                          No close match — probably not on the book yet.
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {l.suggestions.map((s) => (
                            <Button
                              key={s.id}
                              size="xs"
                              variant="outline"
                              disabled={!canEdit || busy !== null}
                              onClick={() =>
                                void post(
                                  { action: "linkLead", clientId: s.id, leadId: l.id },
                                  `lead-${l.id}`
                                )
                              }
                            >
                              <Link2 className="mr-1 h-3 w-3" />
                              {s.name}
                              <span className="ml-1 text-muted-foreground">{s.score}%</span>
                            </Button>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </PageShell>
  );
}
