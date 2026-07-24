"use client";

import Link from "next/link";
import { useWirelessAccess } from "@/lib/hooks/use-wireless-access";
import { useWirelessData } from "@/lib/hooks/use-wireless-data";
import { StatCard } from "@/components/stats/stat-card";
import {
  AlertBanner,
  PageHeader,
  PageShell,
  Panel,
} from "@/components/layout/page-shell";
import { buttonVariants } from "@/components/ui/button";
import { AlertTriangle, Inbox, Map, Router, Wifi } from "lucide-react";

export default function WirelessOverviewPage() {
  const { allowed, isLoading } = useWirelessAccess();
  const { overview, submissions, layouts, loading, error, syncRuijie } = useWirelessData();

  if (isLoading || !allowed) return null;

  return (
    <PageShell>
      <PageHeader
        title="Wireless Overview"
        description="Network layouts, tech submissions, and Ruijie router status"
        actions={
          <>
            <Link href="/wireless/submissions" className={buttonVariants({ variant: "outline" })}>
              Submissions
            </Link>
            <Link
              href="/wireless/layouts"
              className={buttonVariants({
                className: "bg-primary text-primary-foreground hover:bg-primary/90",
              })}
            >
              Layouts
            </Link>
          </>
        }
      />

      {error ? <AlertBanner tone="warn">{error}</AlertBanner> : null}

      {!overview.ruijieConfigured ? (
        <AlertBanner tone="info">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div>
            <p className="font-medium">Ruijie Cloud not configured</p>
            <p className="text-muted-foreground">
              Set <code className="text-xs">RUIJIE_APP_ID</code> and{" "}
              <code className="text-xs">RUIJIE_APP_SECRET</code> when API access is granted.
              Layouts still show last-known / manual status.
            </p>
          </div>
        </AlertBanner>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Open submissions"
          value={loading ? "—" : overview.openSubmissions}
          icon={Inbox}
          accent="var(--primary)"
        />
        <StatCard
          title="Draft layouts"
          value={loading ? "—" : overview.draftLayouts}
          icon={Map}
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
        <Panel
          title="Recent submissions"
          actions={
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => void syncRuijie()}
            >
              Sync Ruijie
            </button>
          }
          padded={false}
        >
          <div className="divide-y divide-border">
            {submissions.slice(0, 5).map((s) => (
              <Link
                key={s.id}
                href="/wireless/submissions"
                className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-muted/40"
              >
                <span>{s.clientName ?? "Unassigned"}</span>
                <span className="text-xs uppercase text-muted-foreground">{s.status}</span>
              </Link>
            ))}
            {!loading && submissions.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">No submissions yet.</p>
            ) : null}
          </div>
        </Panel>

        <Panel title="Recent layouts" padded={false}>
          <div className="divide-y divide-border">
            {layouts.slice(0, 5).map((l) => (
              <Link
                key={l.id}
                href={`/wireless/layouts/${l.id}`}
                className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-muted/40"
              >
                <span>{l.title}</span>
                <span className="text-xs uppercase text-muted-foreground">{l.status}</span>
              </Link>
            ))}
            {!loading && layouts.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">No layouts yet.</p>
            ) : null}
          </div>
        </Panel>
      </div>
    </PageShell>
  );
}
