"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertBanner } from "@/components/layout/page-shell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Boxes, Check, Loader2, Package, Search } from "lucide-react";

/**
 * Brings items from the Sage price list into inventory.
 *
 * The list runs to ~1,800 rows, most of which are not things you keep on a shelf —
 * airtime packages, labour, callouts. So this does not bulk-import everything: it
 * filters to what looks like real stock, suggests a destination per row from the Sage
 * category, and lets the manager confirm a selection. Anything already carried is
 * shown as such and cannot be added twice.
 */

interface CatalogueItem {
  code: string;
  description: string;
  category: string;
  avgCost: number;
  exclPrice: number;
  carried: "product" | "sundry" | null;
  suggested: "product" | "sundry" | "skip" | "unknown";
  unitLabel: string;
}

interface Snapshot {
  id: string;
  source_filename: string;
  effective_from: string;
  item_count: number;
}

const money = (value: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(value);

/** Rows rendered at once. The full list is far longer than anyone scrolls. */
const PAGE = 60;

export function CatalogueImportDialog({
  open,
  onClose,
  onImported,
  canEdit,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
  canEdit: boolean;
}) {
  const { accessToken } = useAuth();
  const [items, setItems] = useState<CatalogueItem[]>([]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [scope, setScope] = useState<"suggested" | "uncategorised" | "all">("suggested");
  const [hideCarried, setHideCarried] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(PAGE);
  const [unitLabel, setUnitLabel] = useState("");

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stock/catalogue", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load the price list");
      setItems(body.items ?? []);
      setSnapshot(body.snapshot ?? null);
      setHint(body.hint ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the price list");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) if (item.category) set.add(item.category);
    return [...set].sort();
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      const isSuggestedStock =
        item.suggested === "product" || item.suggested === "sundry";
      if (scope === "suggested" && !isSuggestedStock) return false;
      if (scope === "uncategorised" && item.suggested !== "unknown") return false;
      if (hideCarried && item.carried) return false;
      if (category !== "all" && item.category !== category) return false;
      if (!q) return true;
      return (
        item.code.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
      );
    });
  }, [items, query, category, scope, hideCarried]);

  const selectable = useMemo(
    () => filtered.filter((item) => !item.carried),
    [filtered]
  );
  const visible = filtered.slice(0, limit);

  // Filters change what "select all" means, so a stale selection would import rows
  // the user can no longer see.
  useEffect(() => {
    setLimit(PAGE);
    setSelected(new Set());
  }, [query, category, scope, hideCarried]);

  const toggle = (code: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  const importSelected = async (destination: "product" | "sundry") => {
    if (!accessToken || selected.size === 0) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/stock/catalogue", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          codes: [...selected],
          destination,
          unitLabel: destination === "sundry" ? unitLabel.trim() || undefined : undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Import failed");
      setResult(
        `Added ${body.created} ${destination === "product" ? "tracked product" : "sundry"}${
          body.created === 1 ? "" : "s"
        }.` +
          (body.skipped?.length
            ? ` ${body.skipped.length} were already carried and were left alone.`
            : "")
      );
      setSelected(new Set());
      await load();
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      {/* The `sm:` prefix is required — DialogContent's base class pins sm:max-w-sm. */}
      <DialogContent className="flex max-h-[88vh] flex-col bg-white sm:max-w-[68rem]">
        <DialogHeader>
          <DialogTitle>Add items from the price list</DialogTitle>
        </DialogHeader>

        {hint ? (
          <AlertBanner tone="warn">
            No price list has been imported yet. A sales manager loads the Sage item
            export under Commission → Price lists, then it appears here.
          </AlertBanner>
        ) : null}
        {error ? <AlertBanner tone="danger">{error}</AlertBanner> : null}
        {result ? <AlertBanner tone="info">{result}</AlertBanner> : null}

        {snapshot ? (
          <p className="text-xs text-muted-foreground">
            {snapshot.item_count} items · from {snapshot.source_filename} · effective{" "}
            {snapshot.effective_from}
          </p>
        ) : null}

        {/* ---------- filters ---------- */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[14rem] flex-1">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search code, description or category…"
              className="h-8 pl-8"
            />
          </div>

          <Select value={scope} onValueChange={(v) => setScope(String(v) as typeof scope)}>
            <SelectTrigger className="w-[14rem]">
              <SelectValue>
                {(value) =>
                  value === "suggested"
                    ? "Suggested as stock"
                    : value === "uncategorised"
                      ? "Uncategorised in Sage"
                      : "Everything"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="suggested">Suggested as stock</SelectItem>
              <SelectItem value="uncategorised">Uncategorised in Sage</SelectItem>
              <SelectItem value="all">Everything</SelectItem>
            </SelectContent>
          </Select>

          <Button
            size="sm"
            variant={hideCarried ? "secondary" : "ghost"}
            onClick={() => setHideCarried((v) => !v)}
          >
            Hide carried
          </Button>

          <Select value={category} onValueChange={(v) => setCategory(String(v))}>
            <SelectTrigger className="w-[13rem]">
              <SelectValue>
                {(value) => (value === "all" ? "All categories" : String(value))}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {filtered.length} match{filtered.length === 1 ? "" : "es"}
            {selectable.length !== filtered.length
              ? ` · ${filtered.length - selectable.length} already carried`
              : ""}
            {selected.size ? ` · ${selected.size} selected` : ""}
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="xs"
              variant="ghost"
              disabled={selectable.length === 0}
              onClick={() => setSelected(new Set(selectable.map((i) => i.code)))}
            >
              Select all {selectable.length} matching
            </Button>
            {selected.size ? (
              <Button size="xs" variant="ghost" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
            ) : null}
          </div>
        </div>

        {/* ---------- list ---------- */}
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-hairline">
          <table className="w-full min-w-[46rem] text-sm">
            <thead className="sticky top-0 z-10 bg-muted">
              <tr className="text-left text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                <th className="w-9 px-3 py-2" />
                <th className="px-3 py-2 font-semibold">Code</th>
                <th className="px-3 py-2 font-semibold">Description</th>
                <th className="px-3 py-2 font-semibold">Category</th>
                <th className="px-3 py-2 text-right font-semibold">Cost</th>
                <th className="px-3 py-2 text-right font-semibold">Sells for</th>
                <th className="px-3 py-2 font-semibold">Suggested</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                    <Loader2 className="mx-auto size-4 animate-spin" />
                  </td>
                </tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                    Nothing matches those filters.
                  </td>
                </tr>
              ) : (
                visible.map((item) => {
                  const isSelected = selected.has(item.code);
                  return (
                    <tr
                      key={item.code}
                      className={`border-b border-hairline/60 last:border-0 ${
                        item.carried ? "opacity-60" : "cursor-pointer hover:bg-muted/40"
                      }`}
                      onClick={() => !item.carried && toggle(item.code)}
                    >
                      <td className="px-3 py-2">
                        {item.carried ? (
                          <Check className="size-3.5 text-muted-foreground" aria-hidden />
                        ) : (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggle(item.code)}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Select ${item.code}`}
                            className="size-3.5 accent-primary"
                          />
                        )}
                      </td>
                      <td className="px-3 py-2 font-medium">{item.code}</td>
                      <td className="max-w-[22rem] truncate px-3 py-2 text-muted-foreground">
                        {item.description}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {item.category || "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {item.avgCost > 0 ? money(item.avgCost) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {item.exclPrice > 0 ? money(item.exclPrice) : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {item.carried ? (
                          <Badge variant="secondary">
                            Carried as {item.carried === "product" ? "product" : "sundry"}
                          </Badge>
                        ) : item.suggested === "sundry" ? (
                          <Badge variant="outline">Sundry</Badge>
                        ) : item.suggested === "product" ? (
                          <Badge variant="outline">Tracked product</Badge>
                        ) : item.suggested === "skip" ? (
                          <Badge variant="ghost">Not stock</Badge>
                        ) : (
                          <Badge variant="ghost" title="Sage has no category for this row">
                            Uncategorised
                          </Badge>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {visible.length < filtered.length ? (
            <div className="border-t border-hairline p-2 text-center">
              <Button size="sm" variant="ghost" onClick={() => setLimit((l) => l + PAGE)}>
                Show {Math.min(PAGE, filtered.length - visible.length)} more of{" "}
                {filtered.length - visible.length}
              </Button>
            </div>
          ) : null}
        </div>

        {/* ---------- actions ---------- */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Sundry counting unit
            <Input
              value={unitLabel}
              onChange={(e) => setUnitLabel(e.target.value)}
              placeholder="auto (each / metre)"
              className="h-7 w-36"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!canEdit || busy || selected.size === 0}
              onClick={() => void importSelected("sundry")}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Boxes />}
              Add {selected.size || ""} as sundries
            </Button>
            <Button
              size="sm"
              disabled={!canEdit || busy || selected.size === 0}
              onClick={() => void importSelected("product")}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Package />}
              Add {selected.size || ""} as tracked products
            </Button>
          </div>
        </div>

        {!canEdit ? (
          <p className="text-xs text-muted-foreground">
            You need stock edit access to add items.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Tracked products get QR-tagged units added individually. Sundries are
            counted in bulk and start at zero.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
