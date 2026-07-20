import { SiteNav } from "@/components/marketing/site-nav";
import { NetworkStatusBanner } from "@/components/marketing/network-status-banner";
import { SiteFooter } from "@/components/marketing/site-footer";

export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav />
      <NetworkStatusBanner />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
