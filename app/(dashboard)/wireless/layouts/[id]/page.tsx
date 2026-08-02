"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useWirelessAccess } from "@/lib/hooks/use-wireless-access";
import { useWirelessData } from "@/lib/hooks/use-wireless-data";
import { PageShell, Panel } from "@/components/layout/page-shell";
import { LayoutCanvas } from "@/components/wireless/layout-canvas";
import { SitePlanPanel } from "@/components/wireless/site-plan-panel";
import { DeviceStatusBadge } from "@/components/wireless/device-status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ChevronLeft, RefreshCw, Save, Send } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  NetworkCanvasBackdrop,
  NetworkCanvasDocument,
  NetworkDevice,
  NetworkDeviceStatus,
  NetworkLayoutLocation,
} from "@/lib/wireless/layout-types";
import { DEFAULT_BACKDROP, EMPTY_CANVAS } from "@/lib/wireless/layout-types";
import { measureBackdrop } from "@/lib/wireless/measure-image";

export default function WirelessLayoutEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { allowed, isLoading } = useWirelessAccess();
  const { layouts, clients, loading, error, postJson, syncRuijie } = useWirelessData();
  const layout = layouts.find((l) => l.id === id);

  const [title, setTitle] = useState("");
  const [leadId, setLeadId] = useState<string>("");
  const [canvas, setCanvas] = useState<NetworkCanvasDocument>(EMPTY_CANVAS);
  const [location, setLocation] = useState<NetworkLayoutLocation | null>(null);
  const [devices, setDevices] = useState<NetworkDevice[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ruijieMsg, setRuijieMsg] = useState<string | null>(null);

  const assets = useMemo(() => layout?.assets ?? [], [layout]);

  /**
   * Load the layout into local editing state — ONCE per saved version.
   *
   * The guard is the whole point. `layout` is re-derived from a `layouts.find()`
   * over a freshly parsed store bundle, so its identity changes on every refresh
   * even when nothing about it changed. Every asset mutation refreshes. Keying the
   * effect on the object therefore meant that uploading a photo reset the canvas to
   * the last SAVED version — silently deleting every marker placed since, and
   * orphaning the photo that had just been tagged onto one of them.
   *
   * `updatedAt` only moves when the row is actually written, which is exactly when
   * re-reading the server's copy is correct.
   */
  const loadedVersion = useRef<string | null>(null);
  useEffect(() => {
    if (!layout) return;
    const version = `${layout.id}:${layout.updatedAt}`;
    if (loadedVersion.current === version) return;
    loadedVersion.current = version;

    setTitle(layout.title);
    setLeadId(layout.leadId ?? "");
    setCanvas(layout.canvas);
    setLocation(layout.location);
    setDevices(layout.devices ?? []);
  }, [layout]);

  /**
   * Adopt a backdrop the saved canvas has lost track of.
   *
   * Uploading writes the asset row immediately, but the canvas pointer to it only
   * reaches the database on Save. Close the tab in between and the file is still in
   * storage while the editor shows an empty Property panel — so the next upload
   * silently makes a duplicate and pays for two.
   *
   * Keyed on a ref rather than cancelled on cleanup, because both matter here:
   *  - the ref makes it idempotent, so StrictMode's mount/unmount/mount in dev (and
   *    any store refresh landing mid-measure) cannot run it twice;
   *  - NOT cancelling means the measure still lands. An `alive` flag flipped by the
   *    cleanup silently threw the result away on the second StrictMode pass, and the
   *    ref guard then blocked the retry — the image never came back at all.
   * The updater re-checks `c.backdrop` so a real upload always wins the race.
   */
  const adoptedAsset = useRef<string | null>(null);
  useEffect(() => {
    if (!layout || canvas.backdrop) return;
    const orphan = assets.find((a) => a.kind === "backdrop" && a.publicUrl);
    if (!orphan?.publicUrl || adoptedAsset.current === orphan.id) return;

    adoptedAsset.current = orphan.id;
    void (async () => {
      const { width, height } = await measureBackdrop(orphan.publicUrl as string);
      setCanvas((c) =>
        c.backdrop
          ? c
          : { ...c, backdrop: { ...DEFAULT_BACKDROP, assetId: orphan.id, width, height } }
      );
    })();
  }, [layout, assets, canvas.backdrop]);

  /**
   * Legacy backdrop. Layouts drawn before positioned backdrops named an image but
   * had nowhere to record its placement, so the canvas still falls back to the
   * first sketch or photo when `canvas.backdrop` is unset.
   */
  const backgroundUrl = useMemo(() => {
    if (canvas.backdrop) return null;
    return (
      assets.find((a) => a.kind === "sketch")?.publicUrl ??
      assets.find((a) => a.kind === "photo" && !a.nodeId)?.publicUrl ??
      null
    );
  }, [assets, canvas.backdrop]);

  if (isLoading || !allowed) return null;

  async function save(status?: "draft" | "published") {
    setBusy(true);
    setMsg(null);
    try {
      // Ensure Ruijie nodes have device rows
      const ruijieNodes = canvas.nodes.filter((n) => n.kind === "ruijie_router");
      const nextDevices = [...devices];
      for (const node of ruijieNodes) {
        if (!nextDevices.some((d) => d.nodeId === node.id)) {
          nextDevices.push({
            id: `ndv_${node.id}`,
            layoutId: id,
            nodeId: node.id,
            vendor: "ruijie",
            externalId: node.meta?.externalId ?? null,
            serialNumber: node.meta?.serial ?? null,
            macAddress: node.meta?.mac ?? null,
            label: node.label || "Ruijie",
            status: "unknown",
            lastSeenAt: null,
            manualOverride: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      }
      setDevices(nextDevices);

      await postJson({
        action: "save_layout",
        layoutId: id,
        title,
        leadId: leadId || null,
        canvas,
        location,
        devices: nextDevices,
        status,
      });
      setMsg(status === "published" ? "Published." : "Saved.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function overrideStatus(deviceId: string, status: NetworkDeviceStatus) {
    await postJson({ action: "override_device_status", deviceId, status });
    setDevices((prev) =>
      prev.map((d) =>
        d.id === deviceId ? { ...d, status, manualOverride: true } : d
      )
    );
  }

  async function doSync() {
    const result = await syncRuijie();
    setRuijieMsg(result.message);
  }

  if (!loading && !layout) {
    return (
      <div className="p-6">
        <p>Layout not found.</p>
        <Link href="/wireless/layouts" className="text-primary hover:underline">
          Back
        </Link>
      </div>
    );
  }

  const status = layout?.status ?? "draft";
  const clientName = leadId
    ? clients.find((c) => c.id === leadId)?.clientName ?? null
    : null;

  return (
    <PageShell>
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-border pb-4">
        <Link
          href="/wireless/layouts"
          className="inline-flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> All layouts
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Untitled layout"
                className="h-9 max-w-md border-transparent bg-transparent px-1 text-lg font-semibold tracking-tight shadow-none hover:border-border focus:border-border"
              />
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                  status === "published"
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-amber-100 text-amber-900"
                )}
              >
                {status}
              </span>
            </div>
            <p className="mt-1 px-1 text-xs text-muted-foreground">
              {clientName ? `Client: ${clientName}` : "No client assigned"}
              {devices.length > 0 && ` · ${devices.length} Ruijie device${devices.length === 1 ? "" : "s"}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void doSync()}>
              <RefreshCw className="h-3.5 w-3.5" /> Sync Ruijie
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void save()}
            >
              <Save className="h-3.5 w-3.5" /> Save
            </Button>
            <Button type="button" size="sm" disabled={busy} onClick={() => void save("published")}>
              <Send className="h-3.5 w-3.5" /> Publish
            </Button>
            {leadId && (
              <Link
                href={`/wireless/clients/${leadId}`}
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                Client profile
              </Link>
            )}
          </div>
        </div>
      </div>

      {(error || msg || ruijieMsg) && (
        <div
          className={cn(
            "rounded-md border px-3 py-2.5 text-sm",
            error
              ? "border-red-200 bg-red-50 text-red-900"
              : "border-emerald-200 bg-emerald-50 text-emerald-900"
          )}
        >
          {error || msg || ruijieMsg}
        </div>
      )}

      {/* Client assignment */}
      <div className="max-w-sm">
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          Assigned client
        </label>
        <Select
          value={leadId || "__none__"}
          onValueChange={(v) => setLeadId(!v || v === "__none__" ? "" : String(v))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Unassigned">
              {(value) => {
                if (!value || value === "__none__") return "Unassigned";
                return clients.find((c) => c.id === value)?.clientName ?? "Selected client";
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Unassigned</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.clientName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <SitePlanPanel
        layoutId={id}
        assets={assets}
        backdrop={canvas.backdrop ?? null}
        location={location}
        onBackdropChange={(backdrop: NetworkCanvasBackdrop | null) =>
          setCanvas((c) => ({ ...c, backdrop, backgroundAssetId: null }))
        }
        onLocationChange={setLocation}
      />

      <LayoutCanvas
        canvas={canvas}
        devices={devices}
        layoutId={id}
        assets={assets}
        backgroundUrl={backgroundUrl}
        onChange={setCanvas}
      />

      {/* Ruijie device provisioning */}
      <Panel
        title="Ruijie devices on this layout"
        description="Serial and external ID map canvas nodes to live gear. Status can be overridden manually."
        padded={false}
      >
        {devices.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">
            Place Ruijie Router / AP nodes, then Save — device rows are created automatically.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {devices.map((d) => (
              <div
                key={d.id}
                className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm"
              >
                <div className="flex min-w-[140px] items-center gap-2">
                  <span className="font-medium">{d.label || d.nodeId}</span>
                  {d.manualOverride && (
                    <span className="rounded bg-muted px-1 text-[10px] uppercase text-muted-foreground">
                      manual
                    </span>
                  )}
                </div>
                <DeviceStatusBadge status={d.status} />
                <Input
                  className="h-8 max-w-[150px]"
                  placeholder="Serial"
                  value={d.serialNumber ?? ""}
                  onChange={(e) =>
                    setDevices((prev) =>
                      prev.map((x) =>
                        x.id === d.id ? { ...x, serialNumber: e.target.value || null } : x
                      )
                    )
                  }
                />
                <Input
                  className="h-8 max-w-[150px]"
                  placeholder="External ID"
                  value={d.externalId ?? ""}
                  onChange={(e) =>
                    setDevices((prev) =>
                      prev.map((x) =>
                        x.id === d.id ? { ...x, externalId: e.target.value || null } : x
                      )
                    )
                  }
                />
                <Select
                  value={d.status}
                  onValueChange={(v) =>
                    void overrideStatus(d.id, (v as NetworkDeviceStatus) || "unknown")
                  }
                >
                  <SelectTrigger className="h-8 w-[120px]">
                    <SelectValue>{(value) => String(value ?? "unknown")}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="online">online</SelectItem>
                    <SelectItem value="offline">offline</SelectItem>
                    <SelectItem value="unknown">unknown</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </PageShell>
  );
}
