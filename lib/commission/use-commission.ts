"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import type {
  CommissionInvoiceRow,
  CommissionResult,
  CommissionRule,
  ParsedInvoice,
} from "@/lib/commission/constants";

export interface CatalogueImportRow {
  id: string;
  source_filename: string;
  sheet_name: string;
  effective_from: string;
  item_count: number;
  zero_price_count: number;
  non_positive_gp_count: number;
  created_at: string;
}

export interface AliasRow {
  id: string;
  invoice_code: string;
  catalogue_code: string;
  note: string;
}

export interface ExcludedRow {
  code: string;
  reason: string;
}

export interface RepRow {
  id: string;
  name: string;
  title: string;
  role: string;
  color: string;
  avatar_initials: string;
}

/** What an invoice upload hands back. */
export interface UploadOutcome {
  invoiceId: string;
  parsed: ParsedInvoice;
  result: CommissionResult;
  match: {
    leadId: string;
    leadName: string;
    confidence: number;
    reason: string;
    repId: string | null;
  } | null;
  /** Set when reopening a saved invoice: the earner already recorded against it. */
  savedRepId?: string | null;
  /** Set when the price list used didn't come into force until after the invoice date. */
  catalogueWarning?: string | null;
}

interface CommissionData {
  invoices: CommissionInvoiceRow[];
  catalogueImports: CatalogueImportRow[];
  aliases: AliasRow[];
  excludedCodes: ExcludedRow[];
  rules: CommissionRule[];
  reps: RepRow[];
}

const EMPTY: CommissionData = {
  invoices: [],
  catalogueImports: [],
  aliases: [],
  excludedCodes: [],
  rules: [],
  reps: [],
};

/**
 * Loads the commission snapshot in one request and exposes the action helpers.
 * Mirrors lib/procurement/use-procurement.ts: every mutation reloads rather than
 * patching local state, so the list stays authoritative.
 */
export function useCommission() {
  const { accessToken } = useAuth();
  const [data, setData] = useState<CommissionData>(EMPTY);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/commission", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load commission data");
      setData({
        invoices: body.invoices ?? [],
        catalogueImports: body.catalogueImports ?? [],
        aliases: body.aliases ?? [],
        excludedCodes: body.excludedCodes ?? [],
        rules: body.rules ?? [],
        reps: body.reps ?? [],
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load commission data");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const post = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!accessToken) throw new Error("Not signed in");
      const res = await fetch("/api/commission", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Request failed");
      // `note` carries a soft failure: the action succeeded but a follow-on step
      // (repricing after a code mapping) could not run.
      return body as { ok: boolean; result?: CommissionResult; note?: string | null };
    },
    [accessToken]
  );

  const upload = useCallback(
    async (kind: "invoice" | "catalogue", file: File, extra: Record<string, string> = {}) => {
      if (!accessToken) throw new Error("Not signed in");
      const form = new FormData();
      form.set("kind", kind);
      form.set("file", file);
      for (const [key, value] of Object.entries(extra)) form.set(key, value);

      const res = await fetch("/api/commission", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Upload failed");
      return body;
    },
    [accessToken]
  );

  /** One invoice with its frozen lines. */
  const loadInvoice = useCallback(
    async (id: string) => {
      if (!accessToken) throw new Error("Not signed in");
      const res = await fetch(`/api/commission?id=${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load invoice");
      return body as { invoice: CommissionInvoiceRow; lines: Record<string, unknown>[] };
    },
    [accessToken]
  );

  return { ...data, isLoading, error, reload: load, post, upload, loadInvoice };
}
