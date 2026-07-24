"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "@/lib/auth-context";
import { canAccessWireless } from "@/lib/permissions";
import type { NetworkLayout, NetworkLayoutSubmission } from "@/lib/wireless/layout-types";

export interface WirelessClientRow {
  id: string;
  clientName: string;
  address: string;
  serviceType: string;
  phone: string;
  email: string;
  stage: string;
  hasLayout: boolean;
  publishedLayoutId: string | null;
}

export interface WirelessOverview {
  openSubmissions: number;
  draftLayouts: number;
  publishedLayouts: number;
  routersOnline: number;
  routersOffline: number;
  routersUnknown: number;
  ruijieConfigured: boolean;
}

export interface WirelessBundle {
  submissions: NetworkLayoutSubmission[];
  layouts: NetworkLayout[];
  clients: WirelessClientRow[];
  overview: WirelessOverview;
}

type WirelessStoreValue = WirelessBundle & {
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  postJson: (body: Record<string, unknown>) => Promise<Record<string, unknown>>;
  postForm: (form: FormData) => Promise<Record<string, unknown>>;
  syncRuijie: () => Promise<{
    ok: boolean;
    configured: boolean;
    message: string;
    updated?: number;
  }>;
};

const empty: WirelessBundle = {
  submissions: [],
  layouts: [],
  clients: [],
  overview: {
    openSubmissions: 0,
    draftLayouts: 0,
    publishedLayouts: 0,
    routersOnline: 0,
    routersOffline: 0,
    routersUnknown: 0,
    ruijieConfigured: false,
  },
};

const WirelessStoreContext = createContext<WirelessStoreValue | null>(null);

function applyWirelessBody(
  json: Record<string, unknown>
): WirelessBundle {
  return {
    submissions: (json.submissions as NetworkLayoutSubmission[] | undefined) ?? [],
    layouts: (json.layouts as NetworkLayout[] | undefined) ?? [],
    clients: (json.clients as WirelessClientRow[] | undefined) ?? [],
    overview: { ...empty.overview, ...((json.overview as WirelessOverview) ?? {}) },
  };
}

export function WirelessStoreProvider({ children }: { children: React.ReactNode }) {
  const { accessToken, currentUser, isLoading: authLoading } = useAuth();
  const shouldLoad = canAccessWireless(currentUser);
  const [data, setData] = useState<WirelessBundle>(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedOnceRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!accessToken || !shouldLoad) {
      setData(empty);
      setLoading(false);
      hasLoadedOnceRef.current = true;
      return;
    }
    if (!hasLoadedOnceRef.current) setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/wireless", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load");
      setData(applyWirelessBody(json));
      hasLoadedOnceRef.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load wireless data");
    } finally {
      setLoading(false);
    }
  }, [accessToken, shouldLoad]);

  useEffect(() => {
    if (authLoading) return;
    void refresh();
  }, [authLoading, refresh]);

  const postJson = useCallback(
    async (body: Record<string, unknown>) => {
      if (!accessToken) throw new Error("Not signed in");
      const res = await fetch("/api/wireless", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Request failed");
      if (
        Array.isArray(json.submissions) ||
        Array.isArray(json.layouts) ||
        Array.isArray(json.clients)
      ) {
        setData(applyWirelessBody(json));
      } else {
        await refresh();
      }
      return json as Record<string, unknown>;
    },
    [accessToken, refresh]
  );

  const postForm = useCallback(
    async (form: FormData) => {
      if (!accessToken) throw new Error("Not signed in");
      const res = await fetch("/api/wireless", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload failed");
      if (
        Array.isArray(json.submissions) ||
        Array.isArray(json.layouts) ||
        Array.isArray(json.clients)
      ) {
        setData(applyWirelessBody(json));
      } else {
        await refresh();
      }
      return json as Record<string, unknown>;
    },
    [accessToken, refresh]
  );

  const syncRuijie = useCallback(async () => {
    if (!accessToken) throw new Error("Not signed in");
    const res = await fetch("/api/wireless/ruijie/sync", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = await res.json();
    await refresh();
    return json as {
      ok: boolean;
      configured: boolean;
      message: string;
      updated?: number;
    };
  }, [accessToken, refresh]);

  const value = useMemo<WirelessStoreValue>(
    () => ({
      ...data,
      loading,
      error,
      refresh,
      postJson,
      postForm,
      syncRuijie,
    }),
    [data, error, loading, postForm, postJson, refresh, syncRuijie]
  );

  return (
    <WirelessStoreContext.Provider value={value}>{children}</WirelessStoreContext.Provider>
  );
}

/** Prefer this — shared cached wireless state across department pages. */
export function useWirelessData() {
  const ctx = useContext(WirelessStoreContext);
  if (!ctx) {
    throw new Error("useWirelessData must be used within WirelessStoreProvider");
  }
  return ctx;
}
