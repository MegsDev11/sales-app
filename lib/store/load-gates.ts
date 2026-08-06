import type { User } from "@/lib/types";
import { can, canAny } from "@/lib/access";
import { MODULE_LIST, moduleForPath } from "@/lib/modules";
import type { StoreKey } from "@/lib/modules";

/**
 * Which client stores to load, for whom, and on which routes.
 *
 * These used to be hardcoded department checks (`user.department === "stock"`) plus a
 * hand-maintained list of path prefixes. That was a real bug under the grant model:
 * a Finance user granted Stock would see the module in the nav and pass the route
 * guard, then land on an empty page because the store never mounted. The decision now
 * comes from the same module registry as everything else.
 */

function pathStartsWithAny(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * True when the current path belongs to a module that declares this store AND the
 * user may open that module.
 *
 * Path gating matters for cost: someone with access to eight modules should not pull
 * the entire CRM bundle while sitting in Wireless.
 */
function shouldMountStore(
  user: User | null | undefined,
  pathname: string,
  store: StoreKey
): boolean {
  if (!user) return false;

  const currentModule = moduleForPath(pathname);

  // On a module page: load only what that module declares, and only if allowed.
  if (currentModule) {
    if (!currentModule.stores?.includes(store)) return false;
    return can(user, currentModule.key, currentModule.minLevel);
  }

  // Off-module (e.g. /company): load a store if any reachable module needs it.
  return MODULE_LIST.some(
    (mod) => mod.stores?.includes(store) && can(user, mod.key, mod.minLevel)
  );
}

/** Sales leads/activities/towers. */
export function shouldLoadCrmLeads(user: User | null | undefined, pathname: string): boolean {
  return shouldMountStore(user, pathname, "crm");
}

export function shouldMountStockStore(user: User | null | undefined, pathname: string): boolean {
  if (!canAny(user, ["stock", "coordination"])) return false;
  return shouldMountStore(user, pathname, "stock");
}

export function shouldMountWirelessStore(
  user: User | null | undefined,
  pathname: string
): boolean {
  if (!can(user, "wireless")) return false;
  return shouldMountStore(user, pathname, "wireless");
}

/** Exported for tests and debugging: the full set of stores wanted right now. */
export function storesForPath(
  user: User | null | undefined,
  pathname: string
): StoreKey[] {
  const wanted: StoreKey[] = [];
  if (shouldLoadCrmLeads(user, pathname)) wanted.push("crm");
  if (shouldMountStockStore(user, pathname)) wanted.push("stock");
  if (shouldMountWirelessStore(user, pathname)) wanted.push("wireless");
  return wanted;
}

/** Kept for callers that only need a prefix test. */
export { pathStartsWithAny };
