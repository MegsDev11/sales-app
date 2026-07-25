import type { TowerStatus } from "@/lib/types";

/** Derive public coverage-area status from child sites + active outage flag. */
export function deriveAreaStatus(
  storedAreaStatus: TowerStatus,
  siteStatuses: readonly TowerStatus[],
  hasActiveOutage: boolean
): TowerStatus {
  if (hasActiveOutage) return "offline";
  if (siteStatuses.length === 0) return storedAreaStatus;
  if (siteStatuses.some((s) => s === "offline")) return "offline";
  if (siteStatuses.some((s) => s === "maintenance")) return "maintenance";
  return "online";
}
