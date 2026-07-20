"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { canAccessStock, canAccessStockRequests, getHomeRoute } from "@/lib/permissions";

export function useStockAccess() {
  const { currentUser, isLoading } = useAuth();
  const router = useRouter();
  const allowed = canAccessStock(currentUser);

  useEffect(() => {
    if (isLoading || !currentUser) return;
    if (!allowed) {
      router.replace(getHomeRoute(currentUser));
    }
  }, [allowed, currentUser, isLoading, router]);

  return { allowed, isLoading, currentUser };
}

/** Stock inventory/scan pages, or coordination users on requests. */
export function useStockRequestsAccess() {
  const { currentUser, isLoading } = useAuth();
  const router = useRouter();
  const allowed = canAccessStockRequests(currentUser);

  useEffect(() => {
    if (isLoading || !currentUser) return;
    if (!allowed) {
      router.replace(getHomeRoute(currentUser));
    }
  }, [allowed, currentUser, isLoading, router]);

  return { allowed, isLoading, currentUser };
}
