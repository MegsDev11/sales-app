"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useWirelessAccess } from "@/lib/hooks/use-wireless-access";
import { useWirelessData } from "@/lib/hooks/use-wireless-data";
import { LayoutCanvas } from "@/components/wireless/layout-canvas";
import { DeviceStatusBadge } from "@/components/wireless/device-status-badge";
import { PageHeader, PageShell } from "@/components/layout/page-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function WirelessClientProfilePage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const { leadId } = use(params);
  const { allowed, isLoading } = useWirelessAccess();
  const { clients, layouts, submissions, loading, error, postJson, syncRuijie } =
    useWirelessData();
  const [busy, setBusy] = useState(false);

  const client = clients.find((c) => c.id === leadId);
  const clientLayouts = useMemo(
    () => layouts.filter((l) => l.leadId === leadId),
    [layouts, leadId]
  );
  const published =
    clientLayouts.find((l) => l.status === "published") ?? clientLayouts[0] ?? null;
  const clientSubs = submissions.filter((s) => s.leadId === leadId);

  if (isLoading || !allowed) return null;

  async function createLayout() {
    setBusy(true);
    try {
      const json = await postJson({
        action: "create_layout",
        leadId,
        title: `${client?.clientName ?? "Client"} network layout`,
      });
      if (json.layoutId) {
        window.location.href = `/wireless/layouts/${json.layoutId}`;
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell>
      <Link href="/wireless/clients" className="text-sm text-primary hover:underline">
        ← Clients
      </Link>
      <PageHeader
        title={client?.clientName ?? (loading ? "Loading…" : "Client")}
        description={`${client?.address || "No address"} · ${client?.serviceType ?? "—"}`}
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => void syncRuijie()}>
              Sync Ruijie
            </Button>
            {published ? (
              <Link
                href={`/wireless/layouts/${published.id}`}
                className={buttonVariants({
                  className: "bg-primary text-primary-foreground hover:bg-primary/90",
                })}
              >
                Edit layout
              </Link>
            ) : (
              <Button
                type="button"
                disabled={busy}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => void createLayout()}
              >
                Create layout
              </Button>
            )}
          </>
        }
      />

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {published ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {published.title}{" "}
              <span className="ml-2 text-xs font-normal uppercase text-muted-foreground">
                {published.status}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <LayoutCanvas
              canvas={published.canvas}
              devices={published.devices ?? []}
              readOnly
              backgroundUrl={
                published.assets?.find((a) => a.kind === "sketch")?.publicUrl ??
                published.assets?.[0]?.publicUrl ??
                null
              }
            />
            <div className="mt-4 flex flex-wrap gap-2">
              {(published.devices ?? []).map((d) => (
                <div
                  key={d.id}
                  className="flex items-center gap-2 rounded-md border px-2 py-1 text-sm"
                >
                  <span>{d.label || d.serialNumber || d.externalId || "Device"}</span>
                  <DeviceStatusBadge status={d.status} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">No layout for this client yet.</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Submission history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {clientSubs.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
              <span>{new Date(s.createdAt).toLocaleString()}</span>
              <span className="uppercase text-muted-foreground">{s.status}</span>
            </div>
          ))}
          {clientSubs.length === 0 && (
            <p className="text-sm text-muted-foreground">No submissions linked.</p>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
