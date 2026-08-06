"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useWirelessData } from "@/lib/store/wireless-store";
import type { NetworkAssetKind } from "@/lib/wireless/layout-types";

/**
 * Photo and backdrop operations for one layout.
 *
 * Every mutation ends with the wireless bundle refreshing rather than patching a
 * local copy. Assets show up in three places — the editor, the client profile and
 * the layout list — and the bundle is what all three read, so re-fetching is what
 * keeps them from disagreeing.
 */
export function useLayoutAssets(layoutId: string) {
  const { accessToken } = useAuth();
  const { refresh } = useWirelessData();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | null> => {
      setBusy(true);
      setError(null);
      try {
        const result = await fn();
        await refresh();
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Request failed");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [refresh]
  );

  const post = useCallback(
    async (body: Record<string, unknown>) => {
      if (!accessToken) throw new Error("Not signed in");
      const res = await fetch("/api/wireless/assets", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Request failed");
      return json as Record<string, unknown>;
    },
    [accessToken]
  );

  /**
   * `nodeId` null means the image belongs to the layout as a whole — that is how a
   * backdrop is stored, since it is not attached to any one marker.
   */
  const upload = useCallback(
    (files: File[], opts: { nodeId?: string | null; kind?: NetworkAssetKind } = {}) =>
      run(async () => {
        if (!accessToken) throw new Error("Not signed in");
        if (files.length === 0) return null;

        const form = new FormData();
        form.set("layoutId", layoutId);
        form.set("nodeId", opts.nodeId ?? "");
        form.set("kind", opts.kind ?? "photo");
        for (const file of files) {
          form.append("files", file);
          // Filename minus extension is a better first caption than nothing —
          // "chalet-3-deck.jpg" already says what it is.
          form.append("captions", file.name.replace(/\.[^.]+$/, ""));
        }

        const res = await fetch("/api/wireless/assets", {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: form,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Upload failed");
        return json as Record<string, unknown>;
      }),
    [accessToken, layoutId, run]
  );

  const setCaption = useCallback(
    (assetId: string, caption: string) =>
      run(() => post({ action: "update_asset", assetId, caption })),
    [post, run]
  );

  const remove = useCallback(
    (assetId: string) => run(() => post({ action: "delete_asset", assetId })),
    [post, run]
  );

  /** Used when a marker is deleted — its photos go with it. */
  const removeForNode = useCallback(
    (nodeId: string) => run(() => post({ action: "delete_node_assets", layoutId, nodeId })),
    [layoutId, post, run]
  );

  return { upload, setCaption, remove, removeForNode, busy, error, clearError: () => setError(null) };
}
