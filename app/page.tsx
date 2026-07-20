"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getHomeRoute } from "@/lib/permissions";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { Hero } from "@/components/marketing/hero";
import { NetworkStatus } from "@/components/marketing/network-status";
import { Services } from "@/components/marketing/services";
import { About } from "@/components/marketing/about";
import { SalesTeam } from "@/components/marketing/sales-team";
import { ContactForm } from "@/components/marketing/contact-form";

export default function LandingPage() {
  const { currentUser, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && currentUser) {
      router.replace(getHomeRoute(currentUser));
    }
  }, [currentUser, isLoading, router]);

  if (isLoading || currentUser) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#C83733] border-t-transparent" />
      </div>
    );
  }

  return (
    <MarketingShell>
      <Hero />
      <NetworkStatus />
      <Services />
      <About />
      <SalesTeam />
      <ContactForm />
    </MarketingShell>
  );
}
