"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { canAccessPath, homeRoute } from "@/lib/access";
import { moduleForPath } from "@/lib/modules";

/**
 * THE route guard for every dashboard page.
 *
 * It replaces the per-page pattern that used to be copy-pasted across the app:
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
 * That replacement is now complete. Thirty-one pages were still running a second
 * copy of this check — six `use*Access` hooks plus two inline versions — every one
 * of them testing exactly what `canAccessPath` tests for the same path. Because
 * this guard runs first, their `!allowed` branch could never be reached, and their
 * `isLoading` was always false by the time the page mounted: dead code that read
 * like a security boundary. They are gone, and this is the only gate. A new page
 * needs nothing; a page needing something STRICTER than its module's `minLevel`
 * should say so in the page, and say what it is adding.
 *
 * This is a UX guard, not the security boundary. The security boundary is RLS
 * (migration 042) plus the API guards — both of which hold even if this is bypassed.
 *
 * FOLLOW-UP: true server-side protection in proxy.ts needs the Supabase session
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
