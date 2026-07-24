"use client";

import { AuthProvider } from "@/lib/auth-context";

/** Root providers — auth only. CRM/Stock hydrate under the dashboard layout. */
export function Providers({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
