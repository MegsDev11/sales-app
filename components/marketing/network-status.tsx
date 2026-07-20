"use client";

import { useEffect, useState } from "react";
import { Activity, Clock, Phone, RadioTower } from "lucide-react";
import { TOWER_SEED } from "@/lib/data/towers-seed";
import type { PublicNetworkOutage, TowerStatus } from "@/lib/types";

type PublicTower = {
  id: string;
  name: string;
  status: TowerStatus;
};

const STATUS_STYLES: Record<
  TowerStatus,
  { label: string; badge: string; dot: string }
> = {
  online: {
    label: "Online",
    badge: "bg-emerald-500/15 text-emerald-300",
    dot: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]",
  },
  maintenance: {
    label: "Maintenance",
    badge: "bg-amber-500/15 text-amber-300",
    dot: "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]",
  },
  offline: {
    label: "Offline",
    badge: "bg-red-500/15 text-red-300",
    dot: "bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.8)]",
  },
};

function formatRelative(msAgo: number) {
  const sec = Math.max(0, Math.floor(msAgo / 1000));
  if (sec < 60) return `${sec} sec ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  return `${Math.floor(min / 60)} hr ago`;
}

export function NetworkStatus() {
  const [towers, setTowers] = useState<PublicTower[]>(
    TOWER_SEED.map((t) => ({ id: t.id, name: t.name, status: "online" as const }))
  );
  const [outages, setOutages] = useState<PublicNetworkOutage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/network-status");
        const data = (await res.json()) as {
          outages?: PublicNetworkOutage[];
          towers?: PublicTower[];
        };
        if (cancelled) return;

        const nextOutages = data.outages ?? [];
        setOutages(nextOutages);

        if (data.towers && data.towers.length > 0) {
          setTowers(data.towers);
        } else {
          const offline = new Set(nextOutages.map((o) => o.towerId));
          setTowers(
            TOWER_SEED.map((t) => ({
              id: t.id,
              name: t.name,
              status: offline.has(t.id) ? "offline" : "online",
            }))
          );
        }
        setFetchedAt(Date.now());
      } catch {
        if (!cancelled) setOutages([]);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }

    load();
    const poll = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, []);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const onlineCount = towers.filter((t) => t.status === "online").length;
  const hasOutages = outages.length > 0;
  const uptime =
    towers.length === 0
      ? "—"
      : `${((onlineCount / towers.length) * 100).toFixed(onlineCount === towers.length ? 2 : 1)}%`;
  const updatedLabel =
    fetchedAt == null ? "…" : formatRelative(now - fetchedAt);

  const outageByTower = new Map(outages.map((o) => [o.towerId, o]));

  return (
    <section id="network-status" className="relative overflow-hidden bg-[#0b1220] py-20 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_0%,rgba(56,189,248,0.12),transparent)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_80%_80%,rgba(200,55,51,0.1),transparent)]" />

      <div className="relative mx-auto max-w-6xl px-4 lg:px-6">
        <h2 className="sr-only">Network status</h2>

        <div className="mx-auto max-w-lg rounded-[1.75rem] border border-white/10 bg-[#0d1526]/90 p-5 shadow-[0_0_40px_rgba(56,189,248,0.08)] backdrop-blur-md sm:p-6">
          {/* Header */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-400/20 bg-sky-400/10 text-sky-400 shadow-[0_0_20px_rgba(56,189,248,0.25)]">
                <RadioTower className="h-5 w-5" />
              </div>
              <p className="text-lg font-semibold tracking-tight text-white sm:text-xl">
                Live Tower Status
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              Live
            </span>
          </div>

          {/* Tower list */}
          <ul className="mt-5 divide-y divide-white/5">
            {towers.map((tower) => {
              const style = STATUS_STYLES[tower.status] ?? STATUS_STYLES.online;
              const outage = outageByTower.get(tower.id);

              return (
                <li key={tower.id} className="py-3.5 first:pt-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <RadioTower className="h-4 w-4 shrink-0 text-slate-400" />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-white">{tower.name}</p>
                        {outage ? (
                          <p className="mt-0.5 truncate text-xs text-red-300/80">{outage.title}</p>
                        ) : null}
                      </div>
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${style.badge}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                      {loaded ? style.label : "…"}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Footer metrics */}
          <div className="mt-2 grid grid-cols-2 gap-4 border-t border-white/10 pt-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-sky-400/30 bg-sky-400/10 text-sky-400 shadow-[0_0_18px_rgba(56,189,248,0.35)]">
                <Activity className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xl font-bold tabular-nums text-white sm:text-2xl">{uptime}</p>
                <p className="text-xs text-slate-400">Uptime</p>
              </div>
            </div>
            <div className="flex items-center gap-3 border-l border-white/10 pl-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-sky-400/30 bg-sky-400/10 text-sky-400 shadow-[0_0_18px_rgba(56,189,248,0.35)]">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-slate-400">Last updated:</p>
                <p className="font-semibold tabular-nums text-white">{updatedLabel}</p>
              </div>
            </div>
          </div>
        </div>

        {hasOutages && (
          <div className="mx-auto mt-6 max-w-lg space-y-3">
            {outages.map((outage) => (
              <div
                key={outage.id}
                className="rounded-2xl border border-red-400/25 bg-red-500/10 p-4 text-sm"
              >
                <p className="font-semibold text-red-100">
                  {outage.towerName}: {outage.title}
                </p>
                {outage.message ? (
                  <p className="mt-1.5 text-slate-300">{outage.message}</p>
                ) : null}
                {outage.affectedAreas.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {outage.affectedAreas.map((area) => (
                      <span
                        key={area}
                        className="rounded-md bg-red-500/20 px-2 py-0.5 text-xs font-medium text-red-200"
                      >
                        {area}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}

        <div className="mx-auto mt-8 flex max-w-lg flex-col items-center gap-3 text-center sm:flex-row sm:justify-between sm:text-left">
          <p className="text-sm text-slate-400">
            {hasOutages
              ? "Need help in an affected area? Our support team is standing by."
              : "Questions about coverage? Our Modimolle team can help."}
          </p>
          <a
            href="tel:0878205290"
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[#C83733] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#a82f2b]"
          >
            <Phone className="h-4 w-4" />
            087 820 5290
          </a>
        </div>
      </div>
    </section>
  );
}
