"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { NetworkLayoutAsset } from "@/lib/wireless/layout-types";
import { useLayoutAssets } from "@/lib/wireless/use-layout-assets";
import {
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Loader2,
  Trash2,
  X,
} from "lucide-react";

/**
 * The photos behind a site marker.
 *
 * This is the whole point of a site plan for someone who is not on site: click the
 * chalet, see the chalet. It renders in two modes off the same asset list — a
 * managed grid for the office, and a plain lightbox for anyone just looking.
 *
 * Images are deliberately plain <img>, not next/image. They are user uploads on a
 * Supabase public URL with no known dimensions and no build-time knowledge of the
 * host, and routing them through the optimizer would mean maintaining a remote
 * pattern allowlist for every project's storage domain.
 */

function sortAssets(assets: NetworkLayoutAsset[]): NetworkLayoutAsset[] {
  return [...assets].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt)
  );
}

/* ---------- Lightbox ---------- */

export function PhotoLightbox({
  assets,
  startIndex = 0,
  title,
  onClose,
}: {
  assets: NetworkLayoutAsset[];
  startIndex?: number;
  title: string;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const count = assets.length;

  const step = useCallback(
    (delta: number) => setIndex((i) => (count === 0 ? 0 : (i + delta + count) % count)),
    [count]
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" && e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      // Captured and stopped: one Escape used to dismiss the lightbox AND the
      // gallery dialog behind it, throwing the user all the way back to the canvas.
      e.stopPropagation();
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, step]);

  // Clamped during render rather than corrected in an effect: deleting the photo
  // currently on screen shrinks the list under the viewer, and a state round-trip
  // would paint one blank frame first.
  const safeIndex = Math.min(index, Math.max(count - 1, 0));
  const current = assets[safeIndex];
  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black/90 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`${title} photos`}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{title}</p>
          <p className="text-xs text-white/60">
            {safeIndex + 1} of {count}
            {current.caption ? ` · ${current.caption}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-9 w-9 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-4">
        {count > 1 && (
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Previous photo"
            className="absolute left-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}

        {/* eslint-disable-next-line @next/next/no-img-element -- user upload on an unknown host; see note above */}
        <img
          src={current.publicUrl ?? ""}
          alt={current.caption || title}
          className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
        />

        {count > 1 && (
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Next photo"
            className="absolute right-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>

      {count > 1 && (
        <div className="flex gap-2 overflow-x-auto px-4 pb-4">
          {assets.map((a, i) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Photo ${i + 1}`}
              aria-current={i === safeIndex}
              className={cn(
                "h-14 w-20 shrink-0 overflow-hidden rounded-md border-2 transition-colors",
                i === safeIndex ? "border-white" : "border-transparent opacity-60 hover:opacity-100"
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- see note above */}
              <img
                src={a.publicUrl ?? ""}
                alt=""
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Drop zone ---------- */

function DropZone({
  onFiles,
  busy,
  label,
}: {
  onFiles: (files: File[]) => void;
  busy: boolean;
  label: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const files = Array.from(e.dataTransfer.files).filter((f) =>
          f.type.startsWith("image/")
        );
        if (files.length) onFiles(files);
      }}
      className={cn(
        "rounded-lg border-2 border-dashed p-4 text-center transition-colors",
        over ? "border-primary bg-primary/5" : "border-border bg-muted/30"
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFiles(files);
          e.target.value = "";
        }}
      />
      <ImagePlus className="mx-auto h-6 w-6 text-muted-foreground" />
      <p className="mt-1.5 text-xs text-muted-foreground">
        Drop images here, or{" "}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="font-medium text-primary hover:underline disabled:opacity-50"
        >
          browse
        </button>
      </p>
      <p className="mt-0.5 text-[11px] text-muted-foreground/80">{label}</p>
      {busy && (
        <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…
        </p>
      )}
    </div>
  );
}

/* ---------- Managed gallery dialog ---------- */

export function SitePhotoDialog({
  open,
  onClose,
  layoutId,
  nodeId,
  title,
  assets,
  canEdit,
}: {
  open: boolean;
  onClose: () => void;
  layoutId: string;
  nodeId: string;
  title: string;
  assets: NetworkLayoutAsset[];
  canEdit: boolean;
}) {
  const { upload, setCaption, remove, busy, error } = useLayoutAssets(layoutId);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const ordered = sortAssets(assets);

  // Read-only viewers get the lightbox directly — there is nothing to manage.
  if (open && !canEdit) {
    if (ordered.length === 0) return null;
    return (
      <PhotoLightbox
        assets={ordered}
        title={title}
        startIndex={0}
        onClose={onClose}
      />
    );
  }

  // The lightbox REPLACES the dialog rather than layering over it. Rendered as a
  // sibling of an open Base UI dialog it landed inside the region that dialog marks
  // aria-hidden and traps focus out of, so its controls were unreachable by keyboard
  // and invisible to a screen reader. Closing it returns to the grid.
  if (viewerIndex !== null && ordered.length > 0) {
    return (
      <PhotoLightbox
        assets={ordered}
        startIndex={viewerIndex}
        title={title || "Site marker"}
        onClose={() => setViewerIndex(null)}
      />
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{title || "Site marker"}</DialogTitle>
            <DialogDescription>
              {ordered.length === 0
                ? "No photos yet. Add pictures of this building so the office can see it."
                : `${ordered.length} photo${ordered.length === 1 ? "" : "s"} · click one to view it full size`}
            </DialogDescription>
          </DialogHeader>

          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
              {error}
            </p>
          )}

          <DropZone
            busy={busy}
            label="JPG, PNG or WebP · up to 12MB each"
            onFiles={(files) => void upload(files, { nodeId, kind: "photo" })}
          />

          {ordered.length > 0 && (
            <ul className="grid max-h-[45vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
              {ordered.map((asset, i) => (
                <li key={asset.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => setViewerIndex(i)}
                    className="block w-full overflow-hidden rounded-md border border-border"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- user upload on an unknown host */}
                    <img
                      src={asset.publicUrl ?? ""}
                      alt={asset.caption || "Site photo"}
                      className="aspect-[4/3] w-full bg-muted object-cover transition-transform group-hover:scale-[1.02]"
                    />
                  </button>
                  <input
                    defaultValue={asset.caption}
                    placeholder="Caption"
                    onBlur={(e) => {
                      if (e.target.value !== asset.caption) {
                        void setCaption(asset.id, e.target.value);
                      }
                    }}
                    className="mt-1 w-full rounded border border-border bg-background px-1.5 py-1 text-[11px] outline-none focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setConfirmId(asset.id)}
                    aria-label="Delete photo"
                    className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-md bg-black/60 text-white opacity-0 transition-opacity hover:bg-destructive group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      {/* Deleting removes the file from storage, so it asks first. */}
      <Dialog open={confirmId !== null} onOpenChange={(next) => !next && setConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this photo?</DialogTitle>
            <DialogDescription>
              It will be removed from {title || "this marker"} and deleted from storage. This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                const id = confirmId;
                setConfirmId(null);
                if (id) await remove(id);
              }}
            >
              Delete photo
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </>
  );
}
