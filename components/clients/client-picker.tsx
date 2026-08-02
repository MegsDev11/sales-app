"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, Loader2, Search, X } from "lucide-react";

/**
 * Pick a client from the Accounts client book.
 *
 * Replaces the `<Select>` of CRM leads that Coordination, Stock and Wireless used to
 * share. That control could not do this job for two reasons: the list it read holds
 * 8 pipeline rows rather than the 5 434 real customers, and a native select over
 * thousands of entries is unusable even when the data is right — which is why the
 * screens capped it at 200 and quietly made the rest unreachable.
 *
 * So this searches on the server and never holds the book in the browser. It returns
 * the whole client record, not just an id, so a form can fill in the address, PPPoE
 * username and phone from one choice instead of making somebody retype them.
 *
 * An existing selection is resolved by id on mount, including for clients who have
 * since been cancelled — a job done last month must keep showing who it was for.
 */

export interface DirectoryClient {
  id: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  pppoeUsername: string;
  billingStatus: string;
}

/** Wait this long after the last keystroke before asking the server. */
const DEBOUNCE_MS = 220;

export function ClientPicker({
  value,
  onChange,
  placeholder = "Client",
  className,
  disabled,
  /** Include non-active clients. Off by default: you dispatch to live customers. */
  includeInactive = false,
}: {
  value: string | null;
  onChange: (client: DirectoryClient | null) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  includeInactive?: boolean;
}) {
  const { accessToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DirectoryClient[]>([]);
  const [selected, setSelected] = useState<DirectoryClient | null>(null);
  const [loading, setLoading] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const search = useCallback(
    async (params: string) => {
      if (!accessToken) return null;
      const res = await fetch(`/api/clients/search?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Client search failed");
      return body as { clients: DirectoryClient[]; truncated?: boolean };
    },
    [accessToken]
  );

  // Resolve an id we were handed into a name to display.
  useEffect(() => {
    let cancelled = false;
    if (!value) {
      setSelected(null);
      return;
    }
    if (selected?.id === value) return;
    (async () => {
      try {
        const body = await search(`ids=${encodeURIComponent(value)}`);
        if (!cancelled && body?.clients?.length) setSelected(body.clients[0]);
      } catch {
        /* leave the id unresolved rather than blanking the field */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [value, selected?.id, search]);

  // Debounced search while the panel is open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set("q", query.trim());
        if (includeInactive) params.set("all", "1");
        const body = await search(params.toString());
        if (cancelled || !body) return;
        setResults(body.clients);
        setTruncated(!!body.truncated);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Search failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query, includeInactive, search]);

  // Close on an outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (client: DirectoryClient | null) => {
    setSelected(client);
    onChange(client);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen((v) => !v);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border border-border",
          "bg-white py-2 pr-2 pl-2.5 text-left text-sm whitespace-nowrap transition-colors",
          "outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          "disabled:cursor-not-allowed disabled:opacity-50",
          selected ? "text-foreground" : "text-muted-foreground"
        )}
      >
        <span className="line-clamp-1 flex-1">{selected ? selected.name : placeholder}</span>
        {selected && !disabled ? (
          <span
            role="button"
            tabIndex={-1}
            aria-label="Clear client"
            onClick={(e) => {
              e.stopPropagation();
              choose(null);
            }}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" />
          </span>
        ) : (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {open ? (
        <div className="absolute z-50 mt-1 w-full min-w-[16rem] overflow-hidden rounded-lg border border-border bg-surface-elevated shadow-lift">
          <div className="relative border-b border-hairline">
            <Search className="absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, contact, PPPoE…"
              className="h-9 border-0 pl-8 focus-visible:ring-0"
            />
          </div>

          <div className="max-h-64 overflow-y-auto py-1" role="listbox">
            {loading ? (
              <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Searching…
              </div>
            ) : error ? (
              <div className="px-3 py-3 text-sm text-destructive">{error}</div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => choose(null)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted"
                >
                  {!selected ? <Check className="size-3.5" /> : <span className="w-3.5" />}
                  No client
                </button>

                {results.length === 0 ? (
                  <div className="px-3 py-3 text-sm text-muted-foreground">
                    {query.trim() ? "No clients match that." : "Start typing to search."}
                  </div>
                ) : (
                  results.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      role="option"
                      aria-selected={selected?.id === c.id}
                      onClick={() => choose(c)}
                      className="flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-muted"
                    >
                      {selected?.id === c.id ? (
                        <Check className="mt-0.5 size-3.5 shrink-0" />
                      ) : (
                        <span className="w-3.5 shrink-0" />
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-foreground">{c.name}</span>
                        {c.contactName || c.pppoeUsername ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            {[c.contactName, c.pppoeUsername].filter(Boolean).join(" · ")}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  ))
                )}

                {truncated ? (
                  // Never imply the list is everything — that is the bug this replaces.
                  <div className="border-t border-hairline px-3 py-1.5 text-[11px] text-muted-foreground">
                    Showing the first {results.length}. Keep typing to narrow it down.
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
