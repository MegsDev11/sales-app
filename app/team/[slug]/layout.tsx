import { MarketingShell } from "@/components/marketing/marketing-shell";

export default function TeamProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MarketingShell>{children}</MarketingShell>;
}
