"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Wifi } from "lucide-react";
import { TOWER_SEED } from "@/lib/data/towers-seed";
import type { PublicNetworkOutage } from "@/lib/types";

export function HeroNetworkWidget() {
  const [offlineIds, setOfflineIds] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/network-status")
      .then((res) => res.json())
      .then((data: { outages?: PublicNetworkOutage[] }) => {
        setOfflineIds(new Set((data.outages ?? []).map((o) => o.towerId)));
      })
      .catch(() => setOfflineIds(new Set()))
      .finally(() => setLoaded(true));
  }, []);

  const offlineCount = offlineIds.size;
  const hasOutages = offlineCount > 0;

  return (
    <div className="absolute inset-x-5 top-5 rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur-md">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wifi className={`h-4 w-4 ${hasOutages ? "text-red-400" : "text-emerald-400"}`} />
          <span className="text-sm font-medium">Network status</span>
        </div>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            !loaded
              ? "bg-white/10 text-slate-300"
              : hasOutages
                ? "bg-red-500/20 text-red-300"
                : "bg-emerald-500/20 text-emerald-300"
          }`}
        >
          {!loaded ? "…" : hasOutages ? `${offlineCount} offline` : "All online"}
        </span>
      </div>

      <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
        {TOWER_SEED.map((tower) => {
          const isOffline = offlineIds.has(tower.id);
          return (
            <li key={tower.id} className="flex min-w-0 items-center gap-1.5">
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  !loaded
                    ? "bg-slate-500"
                    : isOffline
                      ? "bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.7)]"
                      : "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]"
                }`}
                aria-hidden
              />
              <span
                className={`truncate text-[11px] leading-tight ${
                  isOffline ? "font-medium text-red-200" : "text-slate-300"
                }`}
              >
                {tower.name}
              </span>
            </li>
          );
        })}
      </ul>

      <Link
        href="/#network-status"
        className="mt-3 inline-block text-[11px] font-medium text-slate-400 transition-colors hover:text-white"
      >
        {hasOutages ? "View affected areas →" : "Live tower board →"}
      </Link>
    </div>
  );
}
