"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, PageShell, Panel, AlertBanner } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useQrDataUrl, clientPortalUrl } from "@/lib/hooks/use-qr-data-url";
import { KeyRound, Loader2, Printer, QrCode, Search, Trash2 } from "lucide-react";

/**
 * Client QR cards — one card per account.
 *
 * A card carries the client's QR and a 6-digit PIN. The client scans it to see
 * their own account; a technician standing at the same fridge scans it and
 * gets the site instead. The PIN is recoverable here so the office can read it
 * back over the phone rather than reprinting the card.
 */

interface ClientRow {
  id: string;
  name: string;
  hasCard: boolean;
  billingStatus: string;
}

interface CardDetail {
  id: string;
  name: string;
  qrToken: string | null;
  pin: string | null;
  pinUpdatedAt?: string | null;
}

function PrintableCard({ card }: { card: CardDetail }) {
  const url = card.qrToken ? clientPortalUrl(card.qrToken) : null;
  const dataUrl = useQrDataUrl(url);

  if (!card.qrToken) return null;

  return (
    <div className="rounded-xl border border-border bg-white p-5 text-[#0b1220] print:border-0">
      <div className="flex items-start gap-5">
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={dataUrl} alt="Client QR" className="h-40 w-40 shrink-0" />
        ) : (
          <div className="h-40 w-40 shrink-0 animate-pulse rounded bg-muted" />
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-lg font-bold">{card.name}</p>
          <p className="text-sm text-neutral-600">
            Scan for your account, your equipment and your next invoice.
          </p>
          {card.pin ? (
            <div className="rounded-lg bg-neutral-100 px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-neutral-500">Your PIN</p>
              <p className="font-mono text-2xl font-bold tracking-[0.3em]">{card.pin}</p>
            </div>
          ) : null}
          <p className="break-all text-xs text-neutral-500">{url}</p>
          <p className="text-xs text-neutral-500">
            MEGS Waterberg · keep this card somewhere safe
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AccountsCardsPage() {
  const { accessToken } = useAuth();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [query, setQuery] = useState("");
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [card, setCard] = useState<CardDetail | null>(null);

  const search = useCallback(
    async (q: string) => {
      if (!accessToken) return;
      setLoading(true);
      try {
        const res = await fetch(
          `/api/accounts/portal-card${q ? `?q=${encodeURIComponent(q)}` : ""}`,
          { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" }
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to load");
        setClients(json.clients ?? []);
        setCanEdit(Boolean(json.canEdit));
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    },
    [accessToken]
  );

  useEffect(() => {
    void search("");
  }, [search]);

  const openCard = useCallback(
    async (clientId: string) => {
      if (!accessToken) return;
      setBusyId(clientId);
      try {
        const res = await fetch(
          `/api/accounts/portal-card?clientId=${encodeURIComponent(clientId)}`,
          { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" }
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to load");
        setCard(json.client as CardDetail);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setBusyId(null);
      }
    },
    [accessToken]
  );

  const act = useCallback(
    async (clientId: string, action: "issue" | "newPin" | "revoke") => {
      if (!accessToken) return;
      setBusyId(clientId);
      setError(null);
      try {
        const res = await fetch("/api/accounts/portal-card", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action, clientId }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Request failed");
        if (action === "revoke") {
          setCard(null);
        } else {
          setCard(json.client as CardDetail);
        }
        await search(query);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Request failed");
      } finally {
        setBusyId(null);
      }
    },
    [accessToken, query, search]
  );

  return (
    <PageShell>
      <PageHeader
        title="Client QR cards"
        description="One card per account: the client scans it for their own billing and equipment, a technician scans the same card for the site and its job cards."
        actions={loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
      />

      {error ? <AlertBanner tone="danger">{error}</AlertBanner> : null}

      {card ? (
        <Panel
          title={`Card — ${card.name}`}
          actions={
            <div className="flex gap-1.5 print:hidden">
              <Button size="xs" variant="outline" onClick={() => window.print()}>
                <Printer className="mr-1 h-3.5 w-3.5" /> Print
              </Button>
              {canEdit ? (
                <>
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={busyId === card.id}
                    onClick={() => void act(card.id, "newPin")}
                  >
                    <KeyRound className="mr-1 h-3.5 w-3.5" /> New PIN
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={busyId === card.id}
                    onClick={() => void act(card.id, "revoke")}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Revoke
                  </Button>
                </>
              ) : null}
              <Button size="xs" variant="ghost" onClick={() => setCard(null)}>
                Close
              </Button>
            </div>
          }
        >
          {card.qrToken ? (
            <>
              <PrintableCard card={card} />
              <p className="mt-2 text-xs text-muted-foreground print:hidden">
                A new PIN keeps the same QR — the printed card still scans, only the code
                changes. Revoking kills the card entirely and signs out anyone using it.
              </p>
            </>
          ) : (
            <div className="space-y-2 py-4 text-center">
              <p className="text-sm text-muted-foreground">
                This client has no card yet.
              </p>
              {canEdit ? (
                <Button disabled={busyId === card.id} onClick={() => void act(card.id, "issue")}>
                  <QrCode className="mr-1.5 h-4 w-4" /> Issue a card
                </Button>
              ) : null}
            </div>
          )}
        </Panel>
      ) : null}

      <Panel padded={false} title="Clients" className="print:hidden">
        <div className="flex gap-2 border-b border-border p-3">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void search(query);
            }}
            placeholder="Search the client book…"
            className="max-w-sm"
          />
          <Button variant="outline" onClick={() => void search(query)}>
            <Search className="mr-1.5 h-4 w-4" /> Search
          </Button>
        </div>
        {clients.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {loading ? "Loading…" : "No clients matched."}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {clients.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <span className="font-medium">{c.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{c.billingStatus}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {c.hasCard ? (
                    <Badge variant="secondary">Has card</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">No card</span>
                  )}
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={busyId === c.id}
                    onClick={() => void openCard(c.id)}
                  >
                    {busyId === c.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : c.hasCard ? (
                      "Open card"
                    ) : (
                      "Set up"
                    )}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </PageShell>
  );
}
