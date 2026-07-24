"use client";

import { AuthGuard } from "@/components/auth/auth-guard";
import { Header } from "@/components/layout/header";
import { Sidebar, MobileNav } from "@/components/layout/sidebar";
import { OwnerSidebar, OwnerMobileNav } from "@/components/layout/owner-sidebar";
import { SupportSidebar, SupportMobileNav } from "@/components/layout/support-sidebar";
import { StockSidebar, StockMobileNav } from "@/components/layout/stock-sidebar";
import {
  CoordinationSidebar,
  CoordinationMobileNav,
} from "@/components/layout/coordination-sidebar";
import {
  WirelessSidebar,
  WirelessMobileNav,
} from "@/components/layout/wireless-sidebar";
import {
  PlaceholderDepartmentSidebar,
  PlaceholderDepartmentMobileNav,
} from "@/components/layout/placeholder-department-sidebar";
import { DbStatusBanner } from "@/components/layout/db-status-banner";
import { DepartmentProvider } from "@/lib/department-context";
import { CrmStoreProvider } from "@/lib/store/crm-store";
import { StockStoreProvider } from "@/lib/store/stock-store";
import { WirelessStoreProvider } from "@/lib/store/wireless-store";
import { useAuth } from "@/lib/auth-context";
import {
  canAccessCoordination,
  canAccessStock,
  canAccessSupport,
  canAccessWireless,
  isPlaceholderDepartment,
  type PlaceholderDepartment,
} from "@/lib/permissions";

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { isOwner, currentUser } = useAuth();
  const isSupportUser = canAccessSupport(currentUser) && currentUser?.department === "support";
  const isStockUser = canAccessStock(currentUser) && currentUser?.department === "stock";
  const isCoordinationUser =
    canAccessCoordination(currentUser) && currentUser?.department === "coordination";
  const isWirelessUser =
    canAccessWireless(currentUser) && currentUser?.department === "wireless";
  const placeholderDepartment = isPlaceholderDepartment(currentUser?.department)
    ? (currentUser.department as PlaceholderDepartment)
    : null;

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <Header />
      <div className="flex min-h-0 flex-1">
        {isOwner ? (
          <OwnerSidebar />
        ) : isSupportUser ? (
          <SupportSidebar />
        ) : isStockUser ? (
          <StockSidebar />
        ) : isCoordinationUser ? (
          <CoordinationSidebar />
        ) : isWirelessUser ? (
          <WirelessSidebar />
        ) : placeholderDepartment ? (
          <PlaceholderDepartmentSidebar department={placeholderDepartment} />
        ) : (
          <Sidebar />
        )}
        <main className="min-w-0 flex-1 overflow-auto bg-surface pb-20 lg:pb-0">
          {children}
        </main>
      </div>
      {isOwner ? (
        <OwnerMobileNav />
      ) : isSupportUser ? (
        <SupportMobileNav />
      ) : isStockUser ? (
        <StockMobileNav />
      ) : isCoordinationUser ? (
        <CoordinationMobileNav />
      ) : isWirelessUser ? (
        <WirelessMobileNav />
      ) : placeholderDepartment ? (
        <PlaceholderDepartmentMobileNav department={placeholderDepartment} />
      ) : (
        <MobileNav />
      )}
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <CrmStoreProvider>
        <StockStoreProvider>
          <WirelessStoreProvider>
            <DepartmentProvider>
              <DbStatusBanner />
              <DashboardShell>{children}</DashboardShell>
            </DepartmentProvider>
          </WirelessStoreProvider>
        </StockStoreProvider>
      </CrmStoreProvider>
    </AuthGuard>
  );
}
