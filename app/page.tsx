"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { SiteNav } from "@/components/marketing/site-nav";
import { Hero } from "@/components/marketing/hero";
import { Services } from "@/components/marketing/services";
import { About } from "@/components/marketing/about";
import { SalesTeam } from "@/components/marketing/sales-team";
import { ContactForm } from "@/components/marketing/contact-form";
import { SiteFooter } from "@/components/marketing/site-footer";

export default function LandingPage() {
  const { currentUser, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && currentUser) {
      router.replace("/dashboard");
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
    <div className="flex min-h-screen flex-col">
      <SiteNav />
      <main className="flex-1">
        <Hero />
        <Services />
        <About />
        <SalesTeam />
        <ContactForm />
      </main>
      <SiteFooter />
    </div>
  );
}
