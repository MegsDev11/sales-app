"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "@/lib/auth-context";
import type {
  StockBooking,
  StockItem,
  StockProduct,
  StockQrLabel,
  StockRequest,
} from "@/lib/types";

type StockBundle = {
  products: StockProduct[];
  items: StockItem[];
  bookings: StockBooking[];
  requests: StockRequest[];
  qrLabels: StockQrLabel[];
};

type StockStoreValue = StockBundle & {
  isLoaded: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createItem: (input: {
    productId: string;
    brand: string;
    deviceName: string;
    serialNumber: string;
    clientName?: string;
    clientPppoe?: string;
    wifiName?: string;
    wifiPassword?: string;
  }) => Promise<StockItem | null>;
  updateItem: (
    itemId: string,
    updates: {
      brand?: string;
      deviceName?: string;
      serialNumber?: string;
      clientName?: string;
      clientPppoe?: string;
      wifiName?: string;
      wifiPassword?: string;
    }
  ) => Promise<void>;
  deleteItem: (itemId: string) => Promise<void>;
  bookOut: (input: {
    itemId: string;
    technicianId: string;
    leadId?: string | null;
    notes?: string;
  }) => Promise<void>;
  returnItem: (itemId: string) => Promise<void>;
  createRequest: (input: {
    title: string;
    technicianId: string;
    leadId?: string | null;
    notes?: string;
    lines: { productId: string; qtyNeeded: number }[];
  }) => Promise<void>;
  cancelRequest: (requestId: string) => Promise<void>;
  fulfillScan: (
    requestId: string,
    qrToken: string,
    details?: {
      serialNumber?: string;
      clientName?: string;
      clientPppoe?: string;
      wifiName?: string;
      wifiPassword?: string;
    }
  ) => Promise<void>;
  createQrLabelBatch: (input: {
    productId: string;
    brand?: string;
    deviceName?: string;
    quantity: number;
  }) => Promise<{ batchId: string; labels: StockQrLabel[] }>;
  claimQrLabel: (
    qrToken: string,
    serialNumber?: string
  ) => Promise<StockItem | null>;
  returnByQr: (qrToken: string) => Promise<StockItem | null>;
  productCounts: (productId: string) => {
    total: number;
    available: number;
    bookedOut: number;
  };
};

const EMPTY: StockBundle = {
  products: [],
  items: [],
  bookings: [],
  requests: [],
  qrLabels: [],
};

const StockStoreContext = createContext<StockStoreValue | null>(null);

export function StockStoreProvider({ children }: { children: React.ReactNode }) {
  const { accessToken, isLoading: authLoading } = useAuth();
  const [data, setData] = useState<StockBundle>(EMPTY);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyBundle = useCallback((body: Record<string, unknown>) => {
    setData({
      products: (body.products as StockProduct[]) ?? [],
      items: (body.items as StockItem[]) ?? [],
      bookings: (body.bookings as StockBooking[]) ?? [],
      requests: (body.requests as StockRequest[]) ?? [],
      qrLabels: (body.qrLabels as StockQrLabel[]) ?? [],
    });
  }, []);

  const refresh = useCallback(async () => {
    if (!accessToken) {
      setData(EMPTY);
      setIsLoaded(true);
      return;
    }
    try {
      const res = await fetch("/api/stock", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load stock");
      applyBundle(body);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stock");
    } finally {
      setIsLoaded(true);
    }
  }, [accessToken, applyBundle]);

  useEffect(() => {
    if (authLoading) return;
    void refresh();
  }, [authLoading, refresh]);

  const post = useCallback(
    async (body: unknown) => {
      if (!accessToken) throw new Error("Not signed in");
      const res = await fetch("/api/stock", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Stock action failed");
      applyBundle(data);
      setError(null);
      return data;
    },
    [accessToken, applyBundle]
  );

  const value = useMemo<StockStoreValue>(
    () => ({
      ...data,
      isLoaded,
      error,
      refresh,
      createItem: async (input) => {
        const result = await post({ action: "createItem", ...input });
        return (result.item as StockItem) ?? null;
      },
      updateItem: async (itemId, updates) => {
        await post({ action: "updateItem", itemId, ...updates });
      },
      deleteItem: async (itemId) => {
        await post({ action: "deleteItem", itemId });
      },
      bookOut: async (input) => {
        await post({ action: "bookOut", ...input });
      },
      returnItem: async (itemId) => {
        await post({ action: "returnItem", itemId });
      },
      createRequest: async (input) => {
        await post({ action: "createRequest", ...input });
      },
      cancelRequest: async (requestId) => {
        await post({ action: "cancelRequest", requestId });
      },
      fulfillScan: async (requestId, qrToken, details) => {
        await post({ action: "fulfillScan", requestId, qrToken, ...details });
      },
      createQrLabelBatch: async (input) => {
        const result = await post({ action: "createQrLabelBatch", ...input });
        return {
          batchId: (result.batchId as string) ?? "",
          labels: (result.labels as StockQrLabel[]) ?? [],
        };
      },
      claimQrLabel: async (qrToken, serialNumber) => {
        const result = await post({ action: "claimQrLabel", qrToken, serialNumber });
        return (result.item as StockItem) ?? null;
      },
      returnByQr: async (qrToken) => {
        const result = await post({ action: "returnByQr", qrToken });
        return (result.item as StockItem) ?? null;
      },
      productCounts: (productId) => {
        const units = data.items.filter((i) => i.productId === productId);
        return {
          total: units.length,
          available: units.filter((i) => i.status === "available").length,
          bookedOut: units.filter((i) => i.status === "booked_out").length,
        };
      },
    }),
    [data, error, isLoaded, post, refresh]
  );

  return (
    <StockStoreContext.Provider value={value}>{children}</StockStoreContext.Provider>
  );
}

export function useStockStore() {
  const ctx = useContext(StockStoreContext);
  if (!ctx) throw new Error("useStockStore must be used within StockStoreProvider");
  return ctx;
}
