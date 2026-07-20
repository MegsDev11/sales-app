"use client";

import Link from "next/link";
import { Wifi } from "lucide-react";
import { TOWER_SEED } from "@/lib/data/towers-seed";
import { usePublicNetworkStatus } from "@/lib/hooks/use-public-network-status";
import type { TowerStatus } from "@/lib/types";

const DOT: Record<TowerStatus, string> = {
  online: "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]",
  maintenance: "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.7)]",
  offline: "bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.7)]",
};

export function HeroNetworkWidget() {
  const { towers: apiTowers, outages, loaded } = usePublicNetworkStatus();

  const towers =
    apiTowers.length > 0
      ? apiTowers
      : TOWER_SEED.map((t) => ({ id: t.id, name: t.name, status: "online" as const }));

  const offlineCount = towers.filter((t) => t.status === "offline").length;
  const maintenanceCount = towers.filter((t) => t.status === "maintenance").length;
  const hasIssues = offlineCount > 0 || maintenanceCount > 0;

  const badgeLabel = !loaded
    ? "…"
    : offlineCount > 0
      ? `${offlineCount} offline`
      : maintenanceCount > 0
        ? `${maintenanceCount} maintenance`
        : "All online";

  return (
    <div className="absolute inset-x-5 top-5 rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur-md">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wifi
            className={`h-4 w-4 ${
              offlineCount > 0
                ? "text-red-400"
                : maintenanceCount > 0
                  ? "text-amber-400"
                  : "text-emerald-400"
            }`}
          />
          <span className="text-sm font-medium">Network status</span>
        </div>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            !loaded
              ? "bg-white/10 text-slate-300"
              : offlineCount > 0
                ? "bg-red-500/20 text-red-300"
                : maintenanceCount > 0
                  ? "bg-amber-500/20 text-amber-300"
                  : "bg-emerald-500/20 text-emerald-300"
          }`}
        >
          {badgeLabel}
        </span>
      </div>

      <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
        {towers.map((tower) => (
          <li key={tower.id} className="flex min-w-0 items-center gap-1.5">
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                !loaded ? "bg-slate-500" : DOT[tower.status]
              }`}
              aria-hidden
            />
            <span
              className={`truncate text-[11px] leading-tight ${
                tower.status === "offline"
                  ? "font-medium text-red-200"
                  : tower.status === "maintenance"
                    ? "font-medium text-amber-200"
                    : "text-slate-300"
              }`}
            >
              {tower.name}
            </span>
          </li>
        ))}
      </ul>

      <Link
        href="/#network-status"
        className="mt-3 inline-block text-[11px] font-medium text-slate-400 transition-colors hover:text-white"
      >
        {hasIssues || outages.length > 0 ? "View affected areas →" : "Live tower board →"}
      </Link>
    </div>
  );
}
