"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, Clock, RadioTower } from "lucide-react";
import { Panel } from "@/components/layout/page-shell";
import { StatCard } from "@/components/stats/stat-card";
import { buttonVariants } from "@/components/ui/button";
import { useCrmStore } from "@/lib/store/crm-store";

function formatRelative(msAgo: number) {
  const sec = Math.max(0, Math.floor(msAgo / 1000));
  if (sec < 60) return `${sec} sec ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  return `${Math.floor(min / 60)} hr ago`;
}

/** Owner-only network ops overview — area-level public health + private site count. */
export function NetworkOperationsSection() {
  const { towers, towerSites, getActiveOutages, isLoaded } = useCrmStore();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const activeOutages = getActiveOutages().length;

  const stats = useMemo(() => {
    const online = towers.filter((t) => t.status === "online").length;
    const offline = towers.filter((t) => t.status === "offline").length;
    const maintenance = towers.filter((t) => t.status === "maintenance").length;
    const uptime =
      towers.length === 0
        ? "—"
        : `${((online / towers.length) * 100).toFixed(online === towers.length ? 2 : 1)}%`;

    const latestMs = towers.reduce((latest, tower) => {
      const t = Date.parse(tower.updatedAt);
      return Number.isFinite(t) && t > latest ? t : latest;
    }, 0);

    const totalThroughput = towerSites.reduce(
      (sum, site) => sum + (site.throughputMbps ?? 0),
      0
    );

    return {
      online,
      offline,
      maintenance,
      total: towers.length,
      uptime,
      latestMs: latestMs || null,
      totalThroughput,
      siteCount: towerSites.length,
    };
  }, [towers, towerSites]);

  const updatedLabel =
    !isLoaded || stats.latestMs == null
      ? "…"
      : formatRelative(now - stats.latestMs);

  return (
    <Panel
      title="Network operations"
      description="Public town status + private tower sites — manage under Support → Towers"
      actions={
        <Link
          href="/support/towers"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Manage towers
        </Link>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Area uptime"
          value={isLoaded ? stats.uptime : "…"}
          subtitle={
            isLoaded
              ? `${stats.online} of ${stats.total} towns online`
              : "Loading…"
          }
          icon={Activity}
          accent="var(--primary)"
        />
        <StatCard
          title="Last updated"
          value={updatedLabel}
          subtitle="Most recent town status change"
          icon={Clock}
        />
        <StatCard
          title="Towns"
          value={isLoaded ? stats.total : "…"}
          subtitle={
            isLoaded
              ? `${stats.offline} offline · ${stats.maintenance} maintenance`
              : undefined
          }
          icon={RadioTower}
        />
        <StatCard
          title="Active outages"
          value={isLoaded ? activeOutages : "…"}
          subtitle={
            isLoaded
              ? `${stats.siteCount} private sites${
                  stats.totalThroughput > 0
                    ? ` · ${stats.totalThroughput} Mbps`
                    : ""
                }`
              : "Public & internal"
          }
          accent={activeOutages > 0 ? "#dc2626" : undefined}
        />
      </div>
    </Panel>
  );
}
