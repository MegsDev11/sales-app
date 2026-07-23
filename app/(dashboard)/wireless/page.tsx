"use client";

import Link from "next/link";
import { useWirelessAccess } from "@/lib/hooks/use-wireless-access";
import { useWirelessData } from "@/lib/hooks/use-wireless-data";
import { StatCard } from "@/components/stats/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { AlertTriangle, Inbox, Map, Router, Wifi } from "lucide-react";

export default function WirelessOverviewPage() {
  const { allowed, isLoading } = useWirelessAccess();
  const { overview, submissions, layouts, loading, error, syncRuijie } = useWirelessData();

  if (isLoading || !allowed) return null;

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Wireless Overview</h1>
          <p className="text-sm text-muted-foreground">
            Network layouts, tech submissions, and Ruijie router status
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/wireless/submissions"
            className={buttonVariants({ variant: "outline" })}
          >
            Submissions
          </Link>
          <Link
            href="/wireless/layouts"
            className={buttonVariants({ className: "bg-[#C83733] hover:bg-[#a82f2b] text-white" })}
          >
            Layouts
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </div>
      )}

      {!overview.ruijieConfigured && (
        <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div>
            <p className="font-medium">Ruijie Cloud not configured</p>
            <p className="text-muted-foreground">
              Set <code className="text-xs">RUIJIE_APP_ID</code> and{" "}
              <code className="text-xs">RUIJIE_APP_SECRET</code> when API access is granted.
              Layouts still show last-known / manual status.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Open submissions"
          value={loading ? "—" : overview.openSubmissions}
          icon={Inbox}
          accent="#C83733"
        />
        <StatCard
          title="Draft layouts"
          value={loading ? "—" : overview.draftLayouts}
          icon={Map}
          accent="#6366F1"
        />
        <StatCard
          title="Published layouts"
          value={loading ? "—" : overview.publishedLayouts}
          icon={Wifi}
          accent="#16A34A"
        />
        <StatCard
          title="Routers online"
          value={
            loading
              ? "—"
              : `${overview.routersOnline} / ${
                  overview.routersOnline + overview.routersOffline + overview.routersUnknown
                }`
          }
          icon={Router}
          accent={overview.routersOffline > 0 ? "#DC2626" : "#16A34A"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent submissions</CardTitle>
            <button
              type="button"
              className="text-xs text-[#C83733] hover:underline"
              onClick={() => void syncRuijie()}
            >
              Sync Ruijie
            </button>
          </CardHeader>
          <CardContent className="space-y-2">
            {submissions.slice(0, 5).map((s) => (
              <Link
                key={s.id}
                href="/wireless/submissions"
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
              >
                <span>{s.clientName ?? "Unassigned"}</span>
                <span className="text-xs uppercase text-muted-foreground">{s.status}</span>
              </Link>
            ))}
            {!loading && submissions.length === 0 && (
              <p className="text-sm text-muted-foreground">No submissions yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent layouts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {layouts.slice(0, 5).map((l) => (
              <Link
                key={l.id}
                href={`/wireless/layouts/${l.id}`}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
              >
                <span>{l.title}</span>
                <span className="text-xs uppercase text-muted-foreground">{l.status}</span>
              </Link>
            ))}
            {!loading && layouts.length === 0 && (
              <p className="text-sm text-muted-foreground">No layouts yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
