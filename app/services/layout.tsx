import { MarketingShell } from "@/components/marketing/marketing-shell";

export default function ServicesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MarketingShell>{children}</MarketingShell>;
}
