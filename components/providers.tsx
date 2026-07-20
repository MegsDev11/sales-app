"use client";

import { AuthProvider } from "@/lib/auth-context";
import { CrmStoreProvider } from "@/lib/store/crm-store";
import { StockStoreProvider } from "@/lib/store/stock-store";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <CrmStoreProvider>
        <StockStoreProvider>{children}</StockStoreProvider>
      </CrmStoreProvider>
    </AuthProvider>
  );
}
