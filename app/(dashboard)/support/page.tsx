"use client";

import Link from "next/link";
import { useCrmStore } from "@/lib/store/crm-store";
import { useSupportAccess } from "@/lib/hooks/use-support-access";
import { StatCard } from "@/components/stats/stat-card";
import {
  AlertBanner,
  PageHeader,
  PageShell,
  Panel,
} from "@/components/layout/page-shell";
import { buttonVariants } from "@/components/ui/button";
import { AlertTriangle, Radio, Users, Wifi } from "lucide-react";

export default function SupportOverviewPage() {
  const { allowed, isLoading } = useSupportAccess();
  const { towers, getActiveOutages, leads } = useCrmStore();

  if (isLoading || !allowed) return null;

  const activeOutages = getActiveOutages();
  const offlineTowers = towers.filter((t) => t.status === "offline");
  const linkedClients = leads.filter((l) => !l.deleted && l.towerId).length;

  return (
    <PageShell>
      <PageHeader
        title="Support Overview"
        description="Manage tower outages and client connectivity assignments"
        actions={
          <Link
            href="/support/towers"
            className={buttonVariants({
              className: "bg-primary text-primary-foreground hover:bg-primary/90",
            })}
          >
            Report outage
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Towers" value={towers.length} icon={Radio} accent="var(--primary)" />
        <StatCard
          title="Active Outages"
          value={activeOutages.length}
          icon={AlertTriangle}
          accent={activeOutages.length > 0 ? "#DC2626" : "#16A34A"}
        />
        <StatCard title="Offline Towers" value={offlineTowers.length} icon={Wifi} accent="#F59E0B" />
        <StatCard title="Linked Clients" value={linkedClients} icon={Users} />
      </div>

      {activeOutages.length > 0 ? (
        <AlertBanner tone="danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="font-medium">Active public outages</p>
            {activeOutages.map((outage) => {
              const tower = towers.find((t) => t.id === outage.towerId);
              return (
                <div
                  key={outage.id}
                  className="rounded border border-red-200/80 bg-white/80 px-2.5 py-2"
                >
                  <p className="font-semibold">{outage.title}</p>
                  <p className="text-xs">{tower?.name ?? "Unknown tower"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{outage.message}</p>
                  <p className="mt-1 text-[11px]">
                    Affected: {outage.affectedAreas.join(", ") || "Not specified"}
                  </p>
                </div>
              );
            })}
            <Link href="/support/towers" className="inline-block font-medium underline">
              Manage outages
            </Link>
          </div>
        </AlertBanner>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Quick actions">
          <div className="flex flex-wrap gap-2">
            <Link
              href="/support/towers"
              className={buttonVariants({
                className: "bg-primary text-primary-foreground hover:bg-primary/90",
              })}
            >
              Report outage
            </Link>
            <Link href="/support/clients" className={buttonVariants({ variant: "outline" })}>
              Assign clients to towers
            </Link>
            <Link href="/support/messages" className={buttonVariants({ variant: "outline" })}>
              Messages
            </Link>
          </div>
        </Panel>

        <Panel title="Tower status" padded={false}>
          <div className="divide-y divide-border">
            {towers.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">No towers configured.</p>
            ) : (
              towers.map((tower) => (
                <div
                  key={tower.id}
                  className="flex items-center justify-between px-4 py-2.5 text-sm"
                >
                  <span>{tower.name}</span>
                  <span
                    className={
                      tower.status === "online"
                        ? "text-green-600"
                        : tower.status === "offline"
                          ? "text-red-600"
                          : "text-amber-600"
                    }
                  >
                    {tower.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>
    </PageShell>
  );
}
