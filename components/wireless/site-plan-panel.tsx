"use client";

import { useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Panel } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLayoutAssets } from "@/lib/wireless/use-layout-assets";
import { DEFAULT_BACKDROP } from "@/lib/wireless/layout-types";
import { measureBackdrop } from "@/lib/wireless/measure-image";
import type {
  NetworkCanvasBackdrop,
  NetworkLayoutAsset,
  NetworkLayoutLocation,
} from "@/lib/wireless/layout-types";
import {
  ExternalLink,
  ImageUp,
  Loader2,
  MapPin,
  Trash2,
} from "lucide-react";

/**
 * The property side of a layout: the image the plan is drawn on, and where on
 * Earth that property is.
 *
 * Deliberately an upload rather than live satellite tiles. Google's Maps Platform
 * terms do not allow storing their imagery, Earth Pro already exports exactly the
 * high-resolution still this needs, and half the site plans that matter are drone
 * shots or an architect's drawing rather than satellite at all. The pasted Maps
 * link is kept for what it is genuinely good for — recording where the place is,
 * so the office can jump straight back to it.
 */

function earthUrl(loc: NetworkLayoutLocation) {
  // 500d ≈ 500m eye altitude — close enough to read individual buildings.
  return `https://earth.google.com/web/@${loc.lat},${loc.lng},0a,500d,35y,0h,0t,0r`;
}

function mapsUrl(loc: NetworkLayoutLocation) {
  return `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`;
}

export function SitePlanPanel({
  layoutId,
  assets,
  backdrop,
  location,
  onBackdropChange,
  onLocationChange,
}: {
  layoutId: string;
  assets: NetworkLayoutAsset[];
  backdrop: NetworkCanvasBackdrop | null;
  location: NetworkLayoutLocation | null;
  onBackdropChange: (next: NetworkCanvasBackdrop | null) => void;
  onLocationChange: (next: NetworkLayoutLocation | null) => void;
}) {
  const { accessToken } = useAuth();
  const { upload, remove, busy, error } = useLayoutAssets(layoutId);
  const fileRef = useRef<HTMLInputElement>(null);

  const [linkInput, setLinkInput] = useState("");
  const [resolving, setResolving] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const current = backdrop ? assets.find((a) => a.id === backdrop.assetId) ?? null : null;

  async function handleFile(file: File) {
    const previous = backdrop?.assetId ?? null;
    const result = await upload([file], { kind: "backdrop" });
    if (!result) return;

    const list = (result.assets ?? []) as NetworkLayoutAsset[];
    const added = list
      .filter((a) => a.kind === "backdrop" && a.id !== previous)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .pop();
    if (!added?.publicUrl) return;

    const { width, height } = await measureBackdrop(added.publicUrl);
    onBackdropChange({
      ...DEFAULT_BACKDROP,
      assetId: added.id,
      width,
      height,
      // Keep the existing placement when swapping one image for another — the
      // markers are already positioned against it.
      x: backdrop?.x ?? DEFAULT_BACKDROP.x,
      y: backdrop?.y ?? DEFAULT_BACKDROP.y,
      opacity: backdrop?.opacity ?? DEFAULT_BACKDROP.opacity,
    });

    // Replacing means the old file is unreachable — nothing else references a
    // backdrop asset, so leaving it would just be a bill.
    if (previous && previous !== added.id) await remove(previous);
  }

  async function resolveLink() {
    const raw = linkInput.trim();
    if (!raw || !accessToken) return;
    setResolving(true);
    setLinkError(null);
    try {
      const res = await fetch("/api/maps/resolve", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: raw }),
      });
      const json = await res.json();
      if (!res.ok || typeof json.lat !== "number" || typeof json.lng !== "number") {
        throw new Error(
          json.error ??
            "Could not find coordinates in that link. Paste a Google Maps link, or the coordinates themselves as \"-24.19, 28.42\"."
        );
      }
      onLocationChange({ lat: json.lat, lng: json.lng, label: json.address ?? "" });
      setLinkInput("");
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "Could not resolve that link");
    } finally {
      setResolving(false);
    }
  }

  return (
    <Panel
      title="Property"
      description="The image this plan is drawn on, and where the property is"
    >
      {error && (
        <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
          {error}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ---- Backdrop ---- */}
        <div>
          <p className="text-xs font-semibold text-foreground">Property image</p>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = "";
            }}
          />

          {current?.publicUrl ? (
            <div className="mt-2 flex gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- user upload on an unknown host */}
              <img
                src={current.publicUrl}
                alt="Property backdrop"
                className="h-20 w-28 shrink-0 rounded-md border border-border bg-muted object-cover"
              />
              <div className="flex min-w-0 flex-col gap-1.5">
                <p className="truncate text-xs text-muted-foreground">
                  {current.caption || "Property image"}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => fileRef.current?.click()}
                  >
                    Replace
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={async () => {
                      const id = backdrop?.assetId;
                      onBackdropChange(null);
                      if (id) await remove(id);
                    }}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              >
                {busy ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ImageUp className="mr-1.5 h-3.5 w-3.5" />
                )}
                Upload property image
              </Button>
              <p className="mt-2 max-w-prose text-[11px] leading-relaxed text-muted-foreground">
                In Google Earth Pro, frame the property and use{" "}
                <span className="font-medium text-foreground">File → Save Image</span> at the
                highest resolution, then upload it here. A drone shot or an architect&apos;s
                site plan works just as well.
              </p>
            </div>
          )}
        </div>

        {/* ---- Location ---- */}
        <div>
          <p className="text-xs font-semibold text-foreground">Location</p>

          {location ? (
            <div className="mt-2 space-y-2">
              <p className="flex items-start gap-1.5 text-xs">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="min-w-0">
                  <span className="block font-medium">{location.label || "Pinned location"}</span>
                  <span className="block tabular-nums text-muted-foreground">
                    {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
                  </span>
                </span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                <a
                  href={earthUrl(location)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium transition-colors hover:bg-muted"
                >
                  Google Earth <ExternalLink className="h-3 w-3" />
                </a>
                <a
                  href={mapsUrl(location)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium transition-colors hover:bg-muted"
                >
                  Google Maps <ExternalLink className="h-3 w-3" />
                </a>
                <button
                  type="button"
                  onClick={() => onLocationChange(null)}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted"
                >
                  Clear
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-2 flex gap-1.5">
              <Input
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void resolveLink();
                  }
                }}
                placeholder="Paste a Google Maps link or coordinates"
                className="h-8"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={resolving || !linkInput.trim()}
                onClick={() => void resolveLink()}
              >
                {resolving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Pin"}
              </Button>
            </div>
          )}

          {linkError && <p className="mt-2 text-[11px] text-destructive">{linkError}</p>}
          {!location && !linkError && (
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              Records where the property is so anyone can jump from the plan straight to
              Google Earth. Short links (maps.app.goo.gl) work too.
            </p>
          )}
        </div>
      </div>
    </Panel>
  );
}
