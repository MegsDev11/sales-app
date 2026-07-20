"use client";

import { AuthGuard } from "@/components/auth/auth-guard";
import { Header } from "@/components/layout/header";
import { Sidebar, MobileNav } from "@/components/layout/sidebar";
import { DbStatusBanner } from "@/components/layout/db-status-banner";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <DbStatusBanner />
      <div className="flex min-h-screen flex-col">
        <Header />
        <div className="flex flex-1">
          <Sidebar />
          <main className="flex-1 overflow-auto pb-20 lg:pb-6">{children}</main>
        </div>
        <MobileNav />
      </div>
    </AuthGuard>
  );
}
