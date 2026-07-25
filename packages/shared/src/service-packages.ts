export type ServicePackageType = "fiber" | "wireless" | "both";

export interface ServicePackage {
  id: string;
  name: string;
  serviceType: ServicePackageType;
  price: number;
  speed: string;
}

export interface ClientPackageInfo extends ServicePackage {
  /** Monthly price formatted for display e.g. R 499 */
  priceLabel: string;
}

export interface ClientPackageUpgrade extends ClientPackageInfo {
  /** Extra vs current package monthly */
  priceDelta: number;
  priceDeltaLabel: string;
}

export const SERVICE_PACKAGES: ServicePackage[] = [
  { id: "home-25", name: "Home Wireless 25Mbps", serviceType: "wireless", price: 499, speed: "25Mbps" },
  { id: "home-50w", name: "Home Wireless 50Mbps", serviceType: "wireless", price: 599, speed: "50Mbps" },
  { id: "home-50f", name: "Home Fiber 50Mbps", serviceType: "fiber", price: 899, speed: "50Mbps" },
  { id: "home-100f", name: "Home Fiber 100Mbps", serviceType: "fiber", price: 1299, speed: "100Mbps" },
  { id: "home-200f", name: "Home Fiber 200Mbps", serviceType: "fiber", price: 1899, speed: "200Mbps" },
  { id: "biz-50w", name: "Business Wireless 50Mbps", serviceType: "wireless", price: 18000, speed: "50Mbps" },
  { id: "biz-100w", name: "Business Wireless 100Mbps", serviceType: "wireless", price: 24000, speed: "100Mbps" },
  { id: "biz-100f", name: "Business Fiber 100Mbps", serviceType: "fiber", price: 45000, speed: "100Mbps" },
  { id: "biz-200f", name: "Business Fiber 200Mbps", serviceType: "fiber", price: 65000, speed: "200Mbps" },
  { id: "biz-500f", name: "Enterprise Fiber 500Mbps", serviceType: "fiber", price: 120000, speed: "500Mbps" },
  { id: "edu-200f", name: "Education Fiber 200Mbps", serviceType: "fiber", price: 85000, speed: "200Mbps" },
  { id: "combo", name: "Business Fiber + Backup Wireless", serviceType: "both", price: 38000, speed: "100Mbps" },
];

export function formatZar(amount: number): string {
  return `R ${amount.toLocaleString("en-ZA")}`;
}

export function findServicePackage(tier: string | null | undefined): ServicePackage | null {
  if (!tier?.trim()) return null;
  const needle = tier.trim().toLowerCase();
  return (
    SERVICE_PACKAGES.find((p) => p.id === needle || p.name.toLowerCase() === needle) ??
    SERVICE_PACKAGES.find((p) => p.name.toLowerCase().includes(needle)) ??
    null
  );
}

/** Higher-priced packages, same service type first, then other types. */
export function upgradesForPackage(current: ServicePackage | null): ServicePackage[] {
  if (!current) {
    return SERVICE_PACKAGES.filter((p) => p.serviceType === "wireless" || p.serviceType === "fiber").slice(
      0,
      4
    );
  }
  const higher = SERVICE_PACKAGES.filter((p) => p.price > current.price && p.id !== current.id);
  const sameType = higher
    .filter((p) => p.serviceType === current.serviceType)
    .sort((a, b) => a.price - b.price);
  const other = higher
    .filter((p) => p.serviceType !== current.serviceType)
    .sort((a, b) => a.price - b.price);
  return [...sameType, ...other].slice(0, 6);
}

export function toClientPackageInfo(pkg: ServicePackage): ClientPackageInfo {
  return { ...pkg, priceLabel: formatZar(pkg.price) };
}

export function toClientPackageUpgrade(
  pkg: ServicePackage,
  currentPrice: number
): ClientPackageUpgrade {
  const priceDelta = pkg.price - currentPrice;
  return {
    ...toClientPackageInfo(pkg),
    priceDelta,
    priceDeltaLabel: `+${formatZar(priceDelta)}/mo`,
  };
}
