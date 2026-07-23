"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
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

export function useWirelessData() {
  const { accessToken } = useAuth();
  const [data, setData] = useState<WirelessBundle>(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/wireless", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load");
      setData({
        submissions: json.submissions ?? [],
        layouts: json.layouts ?? [],
        clients: json.clients ?? [],
        overview: { ...empty.overview, ...(json.overview ?? {}) },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load wireless data");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
      setData({
        submissions: json.submissions ?? [],
        layouts: json.layouts ?? [],
        clients: json.clients ?? [],
        overview: { ...empty.overview, ...(json.overview ?? {}) },
      });
      return json;
    },
    [accessToken]
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
      setData({
        submissions: json.submissions ?? [],
        layouts: json.layouts ?? [],
        clients: json.clients ?? [],
        overview: { ...empty.overview, ...(json.overview ?? {}) },
      });
      return json;
    },
    [accessToken]
  );

  const syncRuijie = useCallback(async () => {
    if (!accessToken) throw new Error("Not signed in");
    const res = await fetch("/api/wireless/ruijie/sync", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = await res.json();
    await refresh();
    return json as { ok: boolean; configured: boolean; message: string; updated?: number };
  }, [accessToken, refresh]);

  return { ...data, loading, error, refresh, postJson, postForm, syncRuijie };
}
