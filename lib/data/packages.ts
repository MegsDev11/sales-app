import type { PackageOption } from "@/lib/types";

export const PACKAGES: PackageOption[] = [
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

export const SERVICE_ZONES = [
  "Pretoria North",
  "Pretoria East",
  "Sandton",
  "Johannesburg CBD",
  "Soweto",
  "Midrand",
  "Centurion",
  "Randburg",
  "Benoni",
  "Roodepoort",
  "Hartbeespoort",
] as const;

export const ACTIVITY_TEMPLATES = [
  "Left voicemail",
  "Sent quote",
  "Site survey completed",
  "Follow-up call scheduled",
  "Proposal sent",
  "Contract sent for signature",
  "Customer requested callback",
  "No answer — will retry",
] as const;
