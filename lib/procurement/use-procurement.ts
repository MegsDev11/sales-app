"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import type {
  PurchaseOrder,
  PurchaseOrderLine,
  ReorderAlert,
  SupplierWithStats,
} from "@/lib/procurement/constants";

interface ProcurementData {
  suppliers: SupplierWithStats[];
  purchaseOrders: PurchaseOrder[];
  lines: PurchaseOrderLine[];
  alerts: ReorderAlert[];
  canEdit: boolean;
}

const EMPTY: ProcurementData = {
  suppliers: [],
  purchaseOrders: [],
  lines: [],
  alerts: [],
  canEdit: false,
};

/**
 * Loads the whole procurement snapshot in one request and hands back a `post`
 * helper for the action-based API. Every mutation reloads, mirroring how the
 * projects screens keep the list authoritative rather than patching locally.
 */
export function useProcurement() {
  const { accessToken } = useAuth();
  const [data, setData] = useState<ProcurementData>(EMPTY);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/procurement", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load procurement");
      setData({
        suppliers: body.suppliers ?? [],
        purchaseOrders: body.purchaseOrders ?? [],
        lines: body.lines ?? [],
        alerts: body.alerts ?? [],
        canEdit: !!body.canEdit,
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load procurement");
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
      const res = await fetch("/api/procurement", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Request failed");
      return body as { ok: boolean; id?: string };
    },
    [accessToken]
  );

  return { ...data, isLoading, error, reload: load, post, accessToken };
}
