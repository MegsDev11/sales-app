"use client";

import { StaffStoreProvider } from "@/lib/store/staff-store";
import { CrmStoreProvider } from "@/lib/store/crm-store";
import { StockStoreProvider } from "@/lib/store/stock-store";
import { WirelessStoreProvider } from "@/lib/store/wireless-store";

/** Staff + CRM always; stock/wireless providers always wrap but load only when gated. */
export function DashboardDataProviders({ children }: { children: React.ReactNode }) {
  return (
    <StaffStoreProvider>
      <CrmStoreProvider>
        <StockStoreProvider>
          <WirelessStoreProvider>{children}</WirelessStoreProvider>
        </StockStoreProvider>
      </CrmStoreProvider>
    </StaffStoreProvider>
  );
}
