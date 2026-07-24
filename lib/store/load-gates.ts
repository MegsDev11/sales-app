import type { User } from "@/lib/types";
import {
  canAccessStockRequests,
  canAccessWireless,
  isOwner,
} from "@/lib/permissions";

const SALES_PATH_PREFIXES = [
  "/dashboard",
  "/board",
  "/inbox",
  "/surveys",
  "/team",
  "/analytics",
  "/my-stats",
  "/leads",
  "/company",
  "/staff",
];

function pathStartsWithAny(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Load sales leads/activities (+ towers) for sales, support, or owner on those hubs. */
export function shouldLoadCrmLeads(user: User | null | undefined, pathname: string): boolean {
  if (!user) return false;
  if (user.department === "sales") return true;
  if (user.department === "support") return true;
  // Pick lists / jobs reference leads — load CRM for coordination, skip stock/wireless.
  if (user.department === "coordination") return true;
  if (isOwner(user)) {
    if (pathStartsWithAny(pathname, SALES_PATH_PREFIXES)) return true;
    if (pathname.startsWith("/support") || pathname.startsWith("/coordination")) return true;
    return false;
  }
  return false;
}

export function shouldMountStockStore(user: User | null | undefined, pathname: string): boolean {
  if (!canAccessStockRequests(user) || !user) return false;
  if (user.department === "stock" || user.department === "coordination") return true;
  if (isOwner(user)) {
    return pathname.startsWith("/stock") || pathname.startsWith("/coordination");
  }
  return false;
}

export function shouldMountWirelessStore(user: User | null | undefined, pathname: string): boolean {
  if (!canAccessWireless(user) || !user) return false;
  if (user.department === "wireless") return true;
  if (isOwner(user)) return pathname.startsWith("/wireless");
  return false;
}
