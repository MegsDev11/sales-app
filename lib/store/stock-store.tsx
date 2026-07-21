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
  StockItemVisit,
  StockProduct,
  StockQrLabel,
  StockRequest,
  StockSundry,
} from "@/lib/types";

type StockBundle = {
  products: StockProduct[];
  items: StockItem[];
  bookings: StockBooking[];
  requests: StockRequest[];
  qrLabels: StockQrLabel[];
  sundries: StockSundry[];
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
    clientAddress?: string;
    clientPppoe?: string;
    wifiName?: string;
    wifiPassword?: string;
  }) => Promise<{ item: StockItem | null; clientPin?: string }>;
  updateItem: (
    itemId: string,
    updates: {
      brand?: string;
      deviceName?: string;
      serialNumber?: string;
      clientName?: string;
      clientAddress?: string;
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
    lines: { productId?: string; sundryId?: string; qtyNeeded: number }[];
  }) => Promise<void>;
  cancelRequest: (requestId: string) => Promise<void>;
  updateRequestLines: (
    requestId: string,
    lines: { id?: string; productId?: string; sundryId?: string; qtyNeeded: number }[]
  ) => Promise<void>;
  issueSundryLine: (requestId: string, lineId: string, quantity?: number) => Promise<void>;
  fulfillScan: (
    requestId: string,
    qrToken: string,
    details?: {
      serialNumber?: string;
      clientName?: string;
      clientAddress?: string;
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
  regenerateClientPin: (itemId: string) => Promise<string>;
  getItemVisits: (itemId: string) => Promise<StockItemVisit[]>;
  createSundry: (input: {
    name: string;
    unitLabel: string;
    quantity: number;
    notes?: string;
  }) => Promise<void>;
  adjustSundry: (sundryId: string, change: number) => Promise<void>;
  deleteSundry: (sundryId: string) => Promise<void>;
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
  sundries: [],
};

const StockStoreContext = createContext<StockStoreValue | null>(null);

export function StockStoreProvider({ children }: { children: React.ReactNode }) {
  const { accessToken, isLoading: authLoading } = useAuth();
  const [data, setData] = useState<StockBundle>(EMPTY);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyBundle = useCallback((body: Record<string, unknown>) => {
    setData((prev) => ({
      products: (body.products as StockProduct[] | undefined) ?? prev.products,
      items: (body.items as StockItem[] | undefined) ?? prev.items,
      bookings: (body.bookings as StockBooking[] | undefined) ?? prev.bookings,
      requests: (body.requests as StockRequest[] | undefined) ?? prev.requests,
      qrLabels: (body.qrLabels as StockQrLabel[] | undefined) ?? prev.qrLabels,
      sundries: (body.sundries as StockSundry[] | undefined) ?? prev.sundries,
    }));
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
        return {
          item: (result.item as StockItem) ?? null,
          clientPin: result.clientPin as string | undefined,
        };
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
      updateRequestLines: async (requestId, lines) => {
        await post({ action: "updateRequestLines", requestId, lines });
      },
      issueSundryLine: async (requestId, lineId, quantity) => {
        await post({ action: "issueSundryLine", requestId, lineId, quantity });
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
      regenerateClientPin: async (itemId) => {
        const result = await post({ action: "regenerateClientPin", itemId });
        return result.clientPin as string;
      },
      getItemVisits: async (itemId) => {
        const result = await post({ action: "getItemVisits", itemId });
        return (result.visits as StockItemVisit[]) ?? [];
      },
      createSundry: async (input) => {
        await post({ action: "createSundry", ...input });
      },
      adjustSundry: async (sundryId, change) => {
        await post({ action: "adjustSundry", sundryId, change });
      },
      deleteSundry: async (sundryId) => {
        await post({ action: "deleteSundry", sundryId });
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
