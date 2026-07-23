"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { canAccessWireless, getHomeRoute } from "@/lib/permissions";

export function useWirelessAccess() {
  const { currentUser, isLoading } = useAuth();
  const router = useRouter();
  const allowed = canAccessWireless(currentUser);

  useEffect(() => {
    if (isLoading || !currentUser) return;
    if (!allowed) {
      router.replace(getHomeRoute(currentUser));
    }
  }, [allowed, currentUser, isLoading, router]);

  return { allowed, isLoading, currentUser };
}
