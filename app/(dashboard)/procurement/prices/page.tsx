"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, PageShell, Panel, AlertBanner } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select-field";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2 } from "lucide-react";

/**
 * Supplier prices — what each supplier charges for the same item.
 *
 * Sorted by spread, so the items where the gap between cheapest and dearest is
 * widest come first: that ordering is the point of the page. A price carries
 * the date it was last confirmed, and anything older than the staleness window
 * is labelled rather than quietly presented as current.
 */

interface Offer {
  id: string;
  supplierId: string;
  supplierName: string;
  leadTimeDays: number;
  unitPrice: number | null;
  supplierSku: string;
  url: string;
  lastPriceAt: string | null;
  stale: boolean;
}

interface PriceItem {
  key: string;
  itemKind: "product" | "sundry";
  itemId: string;
  itemName: string;
  offers: Offer[];
  cheapest: number | null;
  dearest: number | null;
  spread: number;
  staleCount: number;
}

interface Option {
  id: string;
  name: string;
}

const money = (n: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(n);

const day = (value: string | null) =>
  value ? new Date(value).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }) : "never";

export default function SupplierPricesPage() {
  const { accessToken } = useAuth();
  const [items, setItems] = useState<PriceItem[]>([]);
  const [suppliers, setSuppliers] = useState<Option[]>([]);
  const [products, setProducts] = useState<Option[]>([]);
  const [sundries, setSundries] = useState<Option[]>([]);
  const [staleDays, setStaleDays] = useState(90);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [supplierId, setSupplierId] = useState("");
  const [itemKind, setItemKind] = useState<"product" | "sundry">("product");
  const [itemId, setItemId] = useState("");
  const [price, setPrice] = useState("");
  const [sku, setSku] = useState("");

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const res = await fetch("/api/procurement/prices", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load prices");
      setItems(json.items ?? []);
      setSuppliers(json.suppliers ?? []);
      setProducts(json.products ?? []);
      setSundries(json.sundries ?? []);
      setStaleDays(json.staleDays ?? 90);
      setCanEdit(Boolean(json.canEdit));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load prices");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const post = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!accessToken) return false;
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/procurement/prices", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Request failed");
        await load();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Request failed");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [accessToken, load]
  );

  const itemOptions = itemKind === "product" ? products : sundries;
  const staleTotal = items.reduce((sum, i) => sum + i.staleCount, 0);

  // The advisor: our own figures first, the web only as a retail sanity check.
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<{ title: string; url: string }[]>([]);
  const [asking, setAsking] = useState(false);

  const ask = useCallback(async () => {
    if (!accessToken || !question.trim()) return;
    setAsking(true);
    setError(null);
    try {
      const res = await fetch("/api/procurement/advisor", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "The advisor could not answer");
      setAnswer(json.answer ?? "");
      setSources(json.sources ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The advisor could not answer");
    } finally {
      setAsking(false);
    }
  }, [accessToken, question]);

  return (
    <PageShell>
      <PageHeader
        title="Supplier prices"
        description="What each supplier charges for the same item, widest gap first — the negotiated prices behind every reorder decision."
        actions={loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
      />

      {error ? <AlertBanner tone="danger">{error}</AlertBanner> : null}
      {staleTotal > 0 ? (
        <AlertBanner tone="warn">
          {staleTotal} price{staleTotal === 1 ? "" : "s"} {staleTotal === 1 ? "has" : "have"} not
          been confirmed in over {staleDays} days. Re-quote before relying on them.
        </AlertBanner>
      ) : null}

      <Panel
        title="Ask about buying"
        description="Answers come from your own quoted and paid prices. The web is used only to check a retail benchmark — trade pricing is behind logins and cannot be looked up."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void ask();
            }}
            placeholder="Where should we buy ADSS cable, and are we paying too much?"
            className="min-w-64 flex-1"
          />
          <Button disabled={asking || !question.trim()} onClick={() => void ask()}>
            {asking ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            Ask
          </Button>
        </div>
        {answer ? (
          <div className="mt-3 space-y-2">
            <p className="whitespace-pre-wrap text-sm">{answer}</p>
            {sources.length > 0 ? (
              <div className="border-t border-border pt-2">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Looked at
                </p>
                <ul className="space-y-0.5">
                  {sources.map((s) => (
                    <li key={s.url} className="truncate text-xs">
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </Panel>

      {canEdit ? (
        <Panel title="Record a price">
          <div className="flex flex-wrap items-end gap-2">
            <SelectField
              className="w-48"
              value={supplierId}
              onValueChange={setSupplierId}
              options={[
                { value: "", label: "Supplier…" },
                ...suppliers.map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
            <SelectField
              className="w-32"
              value={itemKind}
              onValueChange={(v) => {
                setItemKind(v === "sundry" ? "sundry" : "product");
                setItemId("");
              }}
              options={[
                { value: "product", label: "Product" },
                { value: "sundry", label: "Sundry" },
              ]}
            />
            <SelectField
              className="w-56"
              value={itemId}
              onValueChange={setItemId}
              options={[
                { value: "", label: "Item…" },
                ...itemOptions.map((o) => ({ value: o.id, label: o.name })),
              ]}
            />
            <Input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Unit price R"
              type="number"
              className="w-32"
            />
            <Input
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="Their code (optional)"
              className="w-44"
            />
            <Button
              disabled={busy || !supplierId || !itemId || price.trim() === ""}
              onClick={() =>
                void post({
                  action: "setPrice",
                  supplierId,
                  itemKind,
                  itemId,
                  unitPrice: Number(price),
                  supplierSku: sku,
                }).then((ok) => {
                  if (ok) {
                    setPrice("");
                    setSku("");
                  }
                })
              }
            >
              <Plus className="mr-1 h-4 w-4" /> Save price
            </Button>
          </div>
        </Panel>
      ) : null}

      {items.length === 0 ? (
        <Panel title="Nothing priced yet">
          <p className="text-sm text-muted-foreground">
            {loading
              ? "Loading…"
              : "Record what each supplier quotes and this becomes the comparison behind every reorder — and the figures the weekly digest reports movement against."}
          </p>
        </Panel>
      ) : (
        items.map((item) => (
          <Panel
            key={item.key}
            title={item.itemName}
            description={
              item.spread > 0
                ? `${money(item.spread)} between cheapest and dearest`
                : "One price on record"
            }
            padded={false}
          >
            <ul className="divide-y divide-border">
              {item.offers.map((offer, index) => (
                <li
                  key={offer.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm"
                >
                  <span className="min-w-0">
                    <span className="font-medium">{offer.supplierName}</span>
                    {index === 0 && offer.unitPrice != null && item.offers.length > 1 ? (
                      <Badge className="ml-2 bg-emerald-100 text-emerald-800" variant="secondary">
                        cheapest
                      </Badge>
                    ) : null}
                    {offer.stale ? (
                      <Badge className="ml-2 bg-amber-100 text-amber-800" variant="secondary">
                        unconfirmed
                      </Badge>
                    ) : null}
                    <span className="block text-xs text-muted-foreground">
                      {offer.supplierSku ? `${offer.supplierSku} · ` : ""}
                      {offer.leadTimeDays} day lead · confirmed {day(offer.lastPriceAt)}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="font-medium tabular-nums">
                      {offer.unitPrice == null ? "—" : money(offer.unitPrice)}
                    </span>
                    {canEdit ? (
                      <button
                        className="text-muted-foreground hover:text-destructive"
                        disabled={busy}
                        aria-label="Remove price"
                        onClick={() => void post({ action: "remove", id: offer.id })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        ))
      )}
    </PageShell>
  );
}
