import type { PackageOption } from "@/lib/types";
import { SERVICE_PACKAGES } from "@megs/shared";

export const PACKAGES: PackageOption[] = SERVICE_PACKAGES.map((p) => ({
  id: p.id,
  name: p.name,
  serviceType: p.serviceType,
  price: p.price,
  speed: p.speed,
}));

/** @deprecated Use buildServiceZoneOptions() from coverage areas & sites. */
export const SERVICE_ZONES: readonly string[] = [];

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
