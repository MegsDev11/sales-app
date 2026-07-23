"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useWirelessAccess } from "@/lib/hooks/use-wireless-access";
import { useWirelessData } from "@/lib/hooks/use-wireless-data";
import { LayoutCanvas } from "@/components/wireless/layout-canvas";
import { DeviceStatusBadge } from "@/components/wireless/device-status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  NetworkCanvasDocument,
  NetworkDevice,
  NetworkDeviceStatus,
} from "@/lib/wireless/layout-types";
import { EMPTY_CANVAS } from "@/lib/wireless/layout-types";

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
  const [devices, setDevices] = useState<NetworkDevice[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ruijieMsg, setRuijieMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!layout) return;
    setTitle(layout.title);
    setLeadId(layout.leadId ?? "");
    setCanvas(layout.canvas);
    setDevices(layout.devices ?? []);
  }, [layout]);

  const backgroundUrl = useMemo(() => {
    const assets = layout?.assets ?? [];
    return (
      assets.find((a) => a.kind === "sketch")?.publicUrl ??
      assets.find((a) => a.kind === "photo")?.publicUrl ??
      null
    );
  }, [layout]);

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
        <Link href="/wireless/layouts" className="text-[#C83733] hover:underline">
          Back
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/wireless/layouts" className="text-sm text-[#C83733] hover:underline">
            ← Layouts
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="max-w-md font-semibold"
            />
            <span className="text-xs uppercase text-muted-foreground">
              {layout?.status ?? "draft"}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => void doSync()}>
            Sync Ruijie
          </Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => void save()}>
            Save
          </Button>
          <Button
            type="button"
            disabled={busy}
            className="bg-[#C83733] hover:bg-[#a82f2b] text-white"
            onClick={() => void save("published")}
          >
            Publish
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

      {(error || msg || ruijieMsg) && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
          {error || msg || ruijieMsg}
        </div>
      )}

      <div className="max-w-sm">
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Client</label>
        <Select
          value={leadId || "__none__"}
          onValueChange={(v) => setLeadId(!v || v === "__none__" ? "" : String(v))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Unassigned" />
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

      <LayoutCanvas
        canvas={canvas}
        devices={devices}
        backgroundUrl={backgroundUrl}
        onChange={setCanvas}
      />

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Ruijie devices on this layout</h2>
        {devices.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Place Ruijie Router / AP nodes, then Save — device rows are created automatically.
          </p>
        )}
        {devices.map((d) => (
          <div
            key={d.id}
            className="flex flex-wrap items-center gap-2 rounded border px-3 py-2 text-sm"
          >
            <span className="font-medium">{d.label || d.nodeId}</span>
            <DeviceStatusBadge status={d.status} />
            {d.manualOverride && (
              <span className="text-[10px] uppercase text-muted-foreground">manual</span>
            )}
            <Input
              className="h-8 max-w-[140px]"
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
              className="h-8 max-w-[140px]"
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
                <SelectValue />
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
    </div>
  );
}
