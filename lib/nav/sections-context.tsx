"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import type { SectionOverride } from "@/lib/nav/sections";

/**
 * The sidebar arrangement, loaded once per session.
 *
 * The sidebar is drawn on the client, so it needs the arrangement before it can
 * render. It starts EMPTY rather than blocking: an empty override list is exactly
 * the built-in navigation, so the worst case is that a borrowed section appears a
 * moment late instead of the whole sidebar being missing while a request is in
 * flight. That also means a failed request, or a migration that has not been run
 * yet, degrades to the defaults rather than to nothing.
 */

interface SectionsContextValue {
  overrides: SectionOverride[];
  /** Re-read after Administration → Sections changes something. */
  reload: () => Promise<void>;
  isLoaded: boolean;
}

const SectionsContext = createContext<SectionsContextValue>({
  overrides: [],
  reload: async () => {},
  isLoaded: false,
});

export function SectionsProvider({ children }: { children: React.ReactNode }) {
  const { accessToken, isLoading } = useAuth();
  const [overrides, setOverrides] = useState<SectionOverride[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await fetch("/api/admin/sections", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      if (!res.ok) return;
      const body = await res.json();
      setOverrides(body.overrides ?? []);
    } catch {
      // Keep the defaults.
    } finally {
      setIsLoaded(true);
    }
  }, [accessToken]);

  useEffect(() => {
    if (isLoading) return;
    void load();
  }, [isLoading, load]);

  const value = useMemo(
    () => ({ overrides, reload: load, isLoaded }),
    [overrides, load, isLoaded]
  );

  return <SectionsContext.Provider value={value}>{children}</SectionsContext.Provider>;
}

export function useSections() {
  return useContext(SectionsContext);
}
