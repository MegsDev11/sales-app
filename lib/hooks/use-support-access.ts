"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { canAccessSupport, getHomeRoute } from "@/lib/permissions";

export function useSupportAccess() {
  const { currentUser, isLoading } = useAuth();
  const router = useRouter();
  const allowed = canAccessSupport(currentUser);

  useEffect(() => {
    if (isLoading || !currentUser) return;
    if (!allowed) {
      router.replace(getHomeRoute(currentUser));
    }
  }, [allowed, currentUser, isLoading, router]);

  return { allowed, isLoading, currentUser };
}
