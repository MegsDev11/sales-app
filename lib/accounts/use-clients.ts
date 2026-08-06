"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import type { BillingStatus, ClientRecord } from "@/lib/accounts/constants";

export interface ClientFilters {
  q: string;
  status: BillingStatus | "all";
  owner: string;
  debitDay: string;
  payment: string;
  review: boolean;
}

export const EMPTY_FILTERS: ClientFilters = {
  q: "",
  status: "all",
  owner: "all",
  debitDay: "all",
  payment: "all",
  review: false,
};

export interface ClientFacets {
  byStatus: Record<string, number>;
  total: number;
  needsReview: number;
  readyToInvoice: number;
}

export interface ImportRecord {
  id: string;
  source_filename: string;
  created_at: string;
  rows_read: number;
  clients_created: number;
  clients_updated: number;
}

const EMPTY_FACETS: ClientFacets = {
  byStatus: {},
  total: 0,
  needsReview: 0,
  readyToInvoice: 0,
};

export const PAGE_SIZE = 100;

/**
 * Loads the client book a page at a time.
 *
 * Unlike the other departments' hooks, this one does NOT pull its whole table: the
 * book is 5 400 rows, and shipping all of it to filter three of them in the browser
 * would make every visit to the page a multi-megabyte download. Filtering, searching
 * and paging therefore happen in Postgres, and the hook re-fetches when they change.
 *
 * The header counts come from a separate `facets=1` call so that changing a filter
 * doesn't make the totals flicker — they describe the whole book, not the page.
 */
export function useClients(filters: ClientFilters, offset: number) {
  const { accessToken } = useAuth();

  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [facets, setFacets] = useState<ClientFacets>(EMPTY_FACETS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (filters.q.trim()) params.set("q", filters.q.trim());
      if (filters.status !== "all") params.set("status", filters.status);
      if (filters.owner !== "all") params.set("owner", filters.owner);
      if (filters.debitDay !== "all") params.set("debitDay", filters.debitDay);
      if (filters.payment !== "all") params.set("payment", filters.payment);
      if (filters.review) params.set("review", "1");

      const res = await fetch(`/api/accounts/clients?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load clients");

      setClients(body.clients ?? []);
      setTotal(body.total ?? 0);
      setImports(body.imports ?? []);
      setCanEdit(!!body.canEdit);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load clients");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, filters, offset]);

  const loadFacets = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await fetch("/api/accounts/clients?facets=1", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const body = await res.json();
      if (res.ok) setFacets(body);
    } catch {
      // The counts are a convenience; a failure here must not blank the list.
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadFacets();
  }, [loadFacets]);

  const reload = useCallback(async () => {
    await Promise.all([load(), loadFacets()]);
  }, [load, loadFacets]);

  const post = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!accessToken) throw new Error("Not signed in");
      const res = await fetch("/api/accounts/clients", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Request failed");
      return body;
    },
    [accessToken]
  );

  return {
    clients,
    total,
    imports,
    facets,
    canEdit,
    isLoading,
    error,
    reload,
    post,
  };
}
