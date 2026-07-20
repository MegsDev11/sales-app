"use client";

import { CrmStoreProvider } from "@/lib/store/crm-store";
import { AuthProvider } from "@/lib/auth-context";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <CrmStoreProvider>
      <AuthProvider>{children}</AuthProvider>
    </CrmStoreProvider>
  );
}
