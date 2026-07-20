"use client";

import { AuthGuard } from "@/components/auth/auth-guard";
import { Header } from "@/components/layout/header";
import { Sidebar, MobileNav } from "@/components/layout/sidebar";
import { OwnerSidebar, OwnerMobileNav } from "@/components/layout/owner-sidebar";
import { DbStatusBanner } from "@/components/layout/db-status-banner";
import { DepartmentProvider } from "@/lib/department-context";
import { useAuth } from "@/lib/auth-context";

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { isOwner } = useAuth();

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <div className="flex flex-1">
        {isOwner ? <OwnerSidebar /> : <Sidebar />}
        <main className="flex-1 overflow-auto pb-20 lg:pb-6">{children}</main>
      </div>
      {isOwner ? <OwnerMobileNav /> : <MobileNav />}
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
