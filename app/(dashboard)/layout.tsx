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
import { DbStatusBanner } from "@/components/layout/db-status-banner";
import { DepartmentProvider } from "@/lib/department-context";
import { useAuth } from "@/lib/auth-context";
import {
  canAccessCoordination,
  canAccessStock,
  canAccessSupport,
} from "@/lib/permissions";

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { isOwner, currentUser } = useAuth();
  const isSupportUser = canAccessSupport(currentUser) && currentUser?.department === "support";
  const isStockUser = canAccessStock(currentUser) && currentUser?.department === "stock";
  const isCoordinationUser =
    canAccessCoordination(currentUser) && currentUser?.department === "coordination";

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <div className="flex flex-1">
        {isOwner ? (
          <OwnerSidebar />
        ) : isSupportUser ? (
          <SupportSidebar />
        ) : isStockUser ? (
          <StockSidebar />
        ) : isCoordinationUser ? (
          <CoordinationSidebar />
        ) : (
          <Sidebar />
        )}
        <main className="flex-1 overflow-auto pb-20 lg:pb-6">{children}</main>
      </div>
      {isOwner ? (
        <OwnerMobileNav />
      ) : isSupportUser ? (
        <SupportMobileNav />
      ) : isStockUser ? (
        <StockMobileNav />
      ) : isCoordinationUser ? (
        <CoordinationMobileNav />
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
      <DepartmentProvider>
        <DbStatusBanner />
        <DashboardShell>{children}</DashboardShell>
      </DepartmentProvider>
    </AuthGuard>
  );
}
