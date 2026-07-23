"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  canAccessPlaceholderDepartment,
  getHomeRoute,
  type PlaceholderDepartment,
} from "@/lib/permissions";

export function usePlaceholderDepartmentAccess(department: PlaceholderDepartment) {
  const { currentUser, isLoading } = useAuth();
  const router = useRouter();
  const allowed = canAccessPlaceholderDepartment(currentUser, department);

  useEffect(() => {
    if (isLoading || !currentUser) return;
    if (!allowed) {
      router.replace(getHomeRoute(currentUser));
    }
  }, [allowed, currentUser, isLoading, router]);

  return { allowed, isLoading, currentUser };
}
