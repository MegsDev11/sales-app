"use client";

import { StaffStoreProvider } from "@/lib/store/staff-store";
import { CrmStoreProvider } from "@/lib/store/crm-store";
import { StockStoreProvider } from "@/lib/store/stock-store";
import { WirelessStoreProvider } from "@/lib/store/wireless-store";
import { SectionsProvider } from "@/lib/nav/sections-context";

/** Staff + CRM always; stock/wireless providers always wrap but load only when gated. */
export function DashboardDataProviders({ children }: { children: React.ReactNode }) {
  return (
    <StaffStoreProvider>
      <CrmStoreProvider>
        <StockStoreProvider>
          <WirelessStoreProvider>
            {/* Outermost of the nav concerns: one small request, and the sidebar
                falls back to the built-in arrangement until it lands. */}
            <SectionsProvider>{children}</SectionsProvider>
          </WirelessStoreProvider>
        </StockStoreProvider>
      </CrmStoreProvider>
    </StaffStoreProvider>
  );
}
