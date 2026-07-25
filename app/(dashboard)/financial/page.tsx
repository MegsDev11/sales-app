"use client";

import { PageHeader, PageShell, Panel } from "@/components/layout/page-shell";
import { useAuth } from "@/lib/auth-context";
import { canAccessFinancial, isOwner } from "@/lib/permissions";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function FinancialPage() {
  const { currentUser, isLoading } = useAuth();
  const router = useRouter();
  const allowed =
    canAccessFinancial(currentUser) || isOwner(currentUser);

  useEffect(() => {
    if (isLoading || !currentUser) return;
    if (!allowed) router.replace("/");
  }, [allowed, currentUser, isLoading, router]);

  if (isLoading || !allowed) return null;

  return (
    <PageShell>
      <PageHeader
        title="Financial"
        description="Financial management and reporting"
      />
      <Panel title="Fuel">
        <p className="mb-3 text-sm text-muted-foreground">
          Review technician fuel fills logged from vehicle QR scans.
        </p>
        <Link href="/financial/fuel">
          <Button className="bg-primary text-white hover:bg-primary/90">Open Fuel</Button>
        </Link>
      </Panel>
    </PageShell>
  );
}
