"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { canAccessCoordination, getHomeRoute } from "@/lib/permissions";

export function useCoordinationAccess() {
  const { currentUser, isLoading } = useAuth();
  const router = useRouter();
  const allowed = canAccessCoordination(currentUser);

  useEffect(() => {
    if (isLoading || !currentUser) return;
    if (!allowed) {
      router.replace(getHomeRoute(currentUser));
    }
  }, [allowed, currentUser, isLoading, router]);

  return { allowed, isLoading, currentUser };
}
