"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import type { CompanyOverview } from "@/lib/general/overview-types";

/**
 * The whole company in one request.
 *
 * `tzOffset` goes up with the call so the server buckets months and weeks in the
 * viewer's local time rather than UTC — without it a dashboard opened just after
 * midnight files today's numbers under yesterday.
 */
export function useCompanyOverview() {
  const { accessToken } = useAuth();
  const [data, setData] = useState<CompanyOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const tzOffset = new Date().getTimezoneOffset();
      const res = await fetch(`/api/general/overview?tzOffset=${tzOffset}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load the company overview");
      setData(body as CompanyOverview);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the company overview");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, isLoading, error, reload: load };
}
