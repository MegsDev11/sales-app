"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { canAccessPath, homeRoute } from "@/lib/access";
import { moduleForPath } from "@/lib/modules";

/**
 * One route guard for every dashboard page.
 *
 * Replaces the per-page pattern that was copy-pasted across the app:
 *
 *   const allowed = canAccessFinancial(currentUser) || isOwner(currentUser);
 *   useEffect(() => { if (!allowed) router.replace("/") }, [...]);
 *   if (!allowed) return null;
 *
 * Two problems with that: it had to be remembered on every new page, and because it
 * lived *inside* the page, the page's hooks and data fetches ran before the redirect.
 * Here it sits in the layout and gates rendering of children entirely, so a page the
 * user cannot see never mounts.
 *
 * This is a UX guard, not the security boundary. The security boundary is RLS
 * (migration 042) plus the API guards — both of which hold even if this is bypassed.
 *
 * FOLLOW-UP: true server-side protection in middleware.ts needs the Supabase session
 * in a cookie rather than localStorage, i.e. adopting @supabase/ssr. Worth doing, but
 * it changes the auth client and login flow, so it is deliberately not bundled here.
 */
export function RouteGuard({ children }: { children: React.ReactNode }) {
  const { currentUser, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const allowed = isLoading || !currentUser || canAccessPath(currentUser, pathname);

  useEffect(() => {
    if (isLoading || !currentUser) return;
    if (!canAccessPath(currentUser, pathname)) {
      router.replace(homeRoute(currentUser));
    }
  }, [currentUser, isLoading, pathname, router]);

  if (isLoading) return null;

  if (currentUser && !allowed) {
    const mod = moduleForPath(pathname);
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-lg font-medium">You don&apos;t have access to this area</p>
        <p className="max-w-md text-sm text-muted-foreground">
          {mod
            ? `${mod.label} isn't enabled for your account. Ask an administrator to grant it in Administration → Access Control.`
            : "Ask an administrator to grant you access."}
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
