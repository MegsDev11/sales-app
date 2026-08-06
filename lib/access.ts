import { MODULE_LIST, MODULES, moduleForPath, type ModuleDef } from "@/lib/modules";
import { applySectionOverrides, type SectionOverride } from "@/lib/nav/sections";
import type { AccessLevel, AccessMap, ModuleKey, User, UserRole } from "@/lib/types";

/**
 * The single access API for the whole app.
 *
 * This mirrors public.has_module_access() in the database (migration 040) — the two
 * must agree. The database copy is the one that actually enforces; this copy exists
 * so the UI can hide what the user cannot reach, and so API routes can reject early
 * with a clean 403 instead of returning an empty result set.
 */

export const ACCESS_RANK: Record<AccessLevel, number> = {
  none: 0,
  view: 1,
  edit: 2,
  manage: 3,
};

export const ACCESS_LEVELS: AccessLevel[] = ["none", "view", "edit", "manage"];

export const ACCESS_LABELS: Record<AccessLevel, string> = {
  none: "No access",
  view: "View only",
  edit: "Can edit",
  manage: "Full control",
};

/**
 * The levels a grant dropdown offers.
 *
 * "No access" is listed but not selectable: the tickbox beside the dropdown is
 * what turns a module off, so offering it here would give one piece of state two
 * controls that can disagree. It has to be listed all the same — a module that is
 * off holds the value "none", and a dropdown with no matching entry has nothing
 * to display.
 *
 * Built once because the admin console, the template editor and the new-staff
 * dialog all render the same picker.
 */
export const ACCESS_LEVEL_OPTIONS: {
  value: AccessLevel;
  label: string;
  disabled?: boolean;
}[] = ACCESS_LEVELS.map((l) => ({
  value: l,
  label: ACCESS_LABELS[l],
  ...(l === "none" ? { disabled: true } : {}),
}));

export function isAccessLevel(value: unknown): value is AccessLevel {
  return typeof value === "string" && value in ACCESS_RANK;
}

/** Owner is the break-glass: full control everywhere, regardless of stored grants. */
export function isOwnerRole(user: User | null | undefined): boolean {
  return user?.role === "owner";
}

export function isGeneralManager(user: User | null | undefined): boolean {
  return user?.role === "general_manager";
}

export function isFinancialManager(user: User | null | undefined): boolean {
  return user?.role === "financial_manager";
}

/**
 * Who may edit whose access — the mirror of can_administer() in migration 070.
 * Both copies must say the same thing; the SQL one is the enforcement, this one
 * decides what the console offers so a refusal is never a surprise.
 *
 *   Nobody edits an owner here.
 *   Only an owner edits the financial manager — the books answer to the owner,
 *     not to the GM who runs everything else.
 *   A general manager edits everyone else.
 *   Anyone else needs admin at manage, and still cannot touch those two.
 */
export function canAdminister(
  actor: User | null | undefined,
  target: { role: UserRole } | null | undefined
): boolean {
  if (!actor || !target) return false;
  if (actor.active === false) return false;
  if (target.role === "owner") return false;
  if (isOwnerRole(actor)) return true;
  if (target.role === "financial_manager") return false;
  if (isGeneralManager(actor)) return true;
  return can(actor, "admin", "manage");
}

/** Why the console refused, in words a person can act on. */
export function administerRefusal(
  actor: User | null | undefined,
  target: { role: UserRole } | null | undefined
): string | null {
  if (canAdminister(actor, target)) return null;
  if (target?.role === "owner") return "Owner access is not editable here.";
  if (target?.role === "financial_manager") {
    return "Only the owner can change the financial manager's access.";
  }
  return "You do not have access control rights for this person.";
}

export function accessLevel(
  user: User | null | undefined,
  moduleKey: ModuleKey
): AccessLevel {
  if (!user) return "none";
  if (user.active === false) return "none";
  if (isOwnerRole(user)) return "manage";
  return user.access?.[moduleKey] ?? "none";
}

/** The core check. `can(user, 'wireless', 'edit')` */
export function can(
  user: User | null | undefined,
  moduleKey: ModuleKey,
  level: AccessLevel = "view"
): boolean {
  return ACCESS_RANK[accessLevel(user, moduleKey)] >= ACCESS_RANK[level];
}

/** True if the user reaches at least `level` on any one of the modules. */
export function canAny(
  user: User | null | undefined,
  moduleKeys: ModuleKey[],
  level: AccessLevel = "view"
): boolean {
  return moduleKeys.some((key) => can(user, key, level));
}

export function canAll(
  user: User | null | undefined,
  moduleKeys: ModuleKey[],
  level: AccessLevel = "view"
): boolean {
  return moduleKeys.every((key) => can(user, key, level));
}

/** Modules this user may open, in display order. Drives the whole sidebar. */
export function visibleModules(user: User | null | undefined): ModuleDef[] {
  if (!user) return [];
  return MODULE_LIST.filter((mod) => can(user, mod.key, mod.minLevel));
}

export function visibleModuleKeys(user: User | null | undefined): ModuleKey[] {
  return visibleModules(user).map((m) => m.key);
}

/** Can this user open this URL? Unknown paths are allowed (shared/general pages). */
export function canAccessPath(
  user: User | null | undefined,
  pathname: string
): boolean {
  const mod = moduleForPath(pathname);
  if (!mod) return true;
  return can(user, mod.key, mod.minLevel);
}

/**
 * Where to send a user after login, or when they hit something they cannot see.
 * Owners land on the company overview; everyone else on their highest-priority module.
 */
export function homeRoute(user: User | null | undefined): string {
  if (!user) return "/login";
  if (isOwnerRole(user)) return "/company";

  const modules = visibleModules(user);
  if (modules.length === 0) return "/no-access";

  // Prefer a module they can actually work in over one they can only read.
  const workable = modules.find((m) => can(user, m.key, "edit"));
  const target = workable ?? modules[0];

  // A CRM user without management rights belongs on the board, not the overview.
  if (target.key === "crm" && !can(user, "crm", "manage")) return "/board";
  return target.root;
}

/**
 * Sidebar entries for a module, narrowed by what the user can do inside it and
 * then rearranged by whatever Administration → Sections says.
 *
 * Narrow first, arrange second. A read-only Stock user's list is cut down to the
 * pick lists before any borrowed section is appended, so lending a section to a
 * department never widens what its own module already decided to show.
 *
 * `overrides` is optional so the server and anything without the sections loaded
 * still gets the defaults rather than an empty sidebar.
 */
export function navItemsFor(
  user: User | null | undefined,
  moduleKey: ModuleKey,
  overrides: SectionOverride[] = []
): ModuleDef["nav"] {
  const mod = MODULES[moduleKey];
  if (!mod) return [];

  let base: ModuleDef["nav"];
  if (mod.staffNav && !can(user, moduleKey, "manage")) {
    base = mod.staffNav;
  } else if (moduleKey === "stock" && !can(user, "stock", "edit")) {
    // Coordination users with read-only stock only need the pick lists.
    base = mod.nav.filter((item) => item.stockOnly === false);
  } else {
    base = mod.nav;
  }

  return applySectionOverrides(base, overrides, moduleKey);
}

/** Build the access map sent to the client from raw grant rows. */
export function buildAccessMap(
  rows: { module_key: string; level: string; expires_at?: string | null }[],
  templateRows: { module_key: string; level: string }[] = []
): AccessMap {
  const map: AccessMap = {};
  const now = Date.now();

  // Template first — direct grants overwrite it, including an explicit "none".
  for (const row of templateRows) {
    if (isAccessLevel(row.level)) map[row.module_key as ModuleKey] = row.level;
  }
  for (const row of rows) {
    if (row.expires_at && new Date(row.expires_at).getTime() <= now) continue;
    if (isAccessLevel(row.level)) map[row.module_key as ModuleKey] = row.level;
  }
  return map;
}
