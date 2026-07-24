"use client";

import { AuthGuard } from "@/components/auth/auth-guard";
import { Header } from "@/components/layout/header";
import { DashboardNav } from "@/components/layout/department-nav";
import { DbStatusBanner } from "@/components/layout/db-status-banner";
import { DashboardDataProviders } from "@/components/layout/dashboard-data-providers";
import { DepartmentProvider } from "@/lib/department-context";

function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <Header />
      <div className="flex min-h-0 flex-1">
        <DashboardNav variant="sidebar" />
        <main className="min-w-0 flex-1 overflow-auto bg-surface pb-20 lg:pb-0">
          {children}
        </main>
      </div>
      <DashboardNav variant="mobile" />
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
      <DashboardDataProviders>
        <DepartmentProvider>
          <DbStatusBanner />
          <DashboardShell>{children}</DashboardShell>
        </DepartmentProvider>
      </DashboardDataProviders>
    </AuthGuard>
  );
}
