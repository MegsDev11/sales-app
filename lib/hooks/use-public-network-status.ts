"use client";

import { useCallback, useEffect, useState } from "react";
import type { PublicNetworkOutage, TowerStatus } from "@/lib/types";

export type PublicTowerStatus = {
  id: string;
  name: string;
  status: TowerStatus;
};

export type PublicNetworkStatus = {
  outages: PublicNetworkOutage[];
  towers: PublicTowerStatus[];
  loaded: boolean;
  fetchedAt: number | null;
  refresh: () => void;
};

const POLL_MS = 45_000;

export function usePublicNetworkStatus(): PublicNetworkStatus {
  const [outages, setOutages] = useState<PublicNetworkOutage[]>([]);
  const [towers, setTowers] = useState<PublicTowerStatus[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);

  const refresh = useCallback(() => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return;
    }
    fetch("/api/network-status", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { outages?: PublicNetworkOutage[]; towers?: PublicTowerStatus[] }) => {
        setOutages(data.outages ?? []);
        setTowers(data.towers ?? []);
        setFetchedAt(Date.now());
      })
      .catch(() => {
        setOutages([]);
        setTowers([]);
      })
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    const onFocus = () => refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  return { outages, towers, loaded, fetchedAt, refresh };
}
