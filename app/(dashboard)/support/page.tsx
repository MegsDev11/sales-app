"use client";

import Link from "next/link";
import { useCrmStore } from "@/lib/store/crm-store";
import { useSupportAccess } from "@/lib/hooks/use-support-access";
import { StatCard } from "@/components/stats/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="space-y-6 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-bold">Support Overview</h1>
        <p className="text-sm text-muted-foreground">
          Manage tower outages and client connectivity assignments
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Towers"
          value={towers.length}
          icon={Radio}
          accent="#C83733"
        />
        <StatCard
          title="Active Outages"
          value={activeOutages.length}
          icon={AlertTriangle}
          accent={activeOutages.length > 0 ? "#DC2626" : "#16A34A"}
        />
        <StatCard
          title="Offline Towers"
          value={offlineTowers.length}
          icon={Wifi}
          accent="#F59E0B"
        />
        <StatCard
          title="Linked Clients"
          value={linkedClients}
          icon={Users}
          accent="#6366F1"
        />
      </div>

      {activeOutages.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-800">
              <AlertTriangle className="h-5 w-5" />
              Active Public Outages
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {activeOutages.map((outage) => {
              const tower = towers.find((t) => t.id === outage.towerId);
              return (
                <div key={outage.id} className="rounded-lg border border-red-200 bg-white p-4">
                  <p className="font-semibold text-red-900">{outage.title}</p>
                  <p className="text-sm text-red-800">{tower?.name ?? "Unknown tower"}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{outage.message}</p>
                  <p className="mt-2 text-xs text-red-700">
                    Affected: {outage.affectedAreas.join(", ") || "Not specified"}
                  </p>
                </div>
              );
            })}
            <Link href="/support/towers" className={buttonVariants({ className: "bg-[#C83733] hover:bg-[#a82f2b] text-white" })}>
              Manage Outages
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-white">
          <CardHeader>
            <CardTitle className="text-base">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Link href="/support/towers" className={buttonVariants({ className: "bg-[#C83733] hover:bg-[#a82f2b] text-white" })}>
              Report Outage
            </Link>
            <Link href="/support/clients" className={buttonVariants({ variant: "outline" })}>
              Assign Clients to Towers
            </Link>
          </CardContent>
        </Card>

        <Card className="bg-white">
          <CardHeader>
            <CardTitle className="text-base">Tower Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {towers.map((tower) => (
              <div key={tower.id} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
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
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
