import { can, canAny, homeRoute, isOwnerRole } from "@/lib/access";
import { moduleForDepartment } from "@/lib/modules";
import type { Department, ModuleKey, User, UserRole } from "@/lib/types";

/**
 * COMPATIBILITY LAYER.
 *
 * Every function here keeps the exact name and signature it had under the old
 * one-department-per-user model, but is now backed by module grants (lib/access.ts).
 * 48 files import from here, so preserving the surface avoided a 48-file rewrite in
 * the same change that swapped the security model — one risky thing at a time.
 *
 * For new code, prefer the direct API:
 *   can(user, 'wireless', 'edit')      instead of   canAccessWireless(user)
 *   visibleModules(user)               instead of   the OwnerSection list
 *
 * These wrappers can be inlined and deleted incrementally.
 */

export type OwnerSection = ModuleKey | "company";

/** Modules with no real screens yet — they render the placeholder shell. */
export const PLACEHOLDER_DEPARTMENTS = [
  "fiber",
  "general",
  "accounts",
  "reception",
] as const satisfies readonly Department[];

export type PlaceholderDepartment = (typeof PLACEHOLDER_DEPARTMENTS)[number];

const DEPARTMENT_LABELS: Record<Department, string> = {
  sales: "Sales",
  stock: "Stock",
  coordination: "Coordination",
  support: "Support",
  wireless: "Wireless",
  fiber: "Fiber",
  financial: "Financial",
  general: "General",
  accounts: "Accounts",
  reception: "Reception",
};

export function isPlaceholderDepartment(
  department: string | null | undefined
): department is PlaceholderDepartment {
  return (
    department === "fiber" ||
    department === "general" ||
    department === "accounts" ||
    department === "reception"
  );
}

/**
 * Legacy role/department normaliser.
 *
 * The 'admin'/'sales' role values predate the owner/manager/staff hierarchy in
 * migration 003. Kept because rows written before that migration may still carry
 * them; safe to delete once the database has no such rows.
 */
export function normalizeRoleAndDepartment(
  role: string,
  department: string | null | undefined
): { role: UserRole; department: Department | null } {
  if (role === "admin") {
    return { role: "manager", department: (department as Department) ?? "sales" };
  }
  if (role === "sales") {
    return { role: "staff", department: (department as Department) ?? "sales" };
  }
  if (role === "owner") {
    return { role: "owner", department: null };
  }
  return {
    role: role as UserRole,
    department: role === "owner" ? null : ((department as Department | null) ?? null),
  };
}

// ---------------------------------------------------------------------------
// Role helpers
// ---------------------------------------------------------------------------

export function isOwner(user: User | null | undefined): boolean {
  return isOwnerRole(user);
}

/**
 * "Manager" now means `manage` on the module, not the legacy role column.
 * A Finance manager granted Wireless at `manage` is a wireless manager too, which
 * is the whole point of the new model.
 */
export function isManager(user: User | null | undefined, department?: Department): boolean {
  if (!user) return false;
  if (!department) {
    return isOwnerRole(user) || user.role === "manager";
  }
  const moduleKey = moduleForDepartment(department);
  return moduleKey ? can(user, moduleKey, "manage") : false;
}

export function isSalesManager(user: User | null | undefined): boolean {
  return can(user, "crm", "manage");
}

export function isSupportManager(user: User | null | undefined): boolean {
  return can(user, "support", "manage");
}

export function isSalesStaff(user: User | null | undefined): boolean {
  return can(user, "crm", "edit") && !can(user, "crm", "manage");
}

export function isSupportStaff(user: User | null | undefined): boolean {
  return can(user, "support", "edit") && !can(user, "support", "manage");
}

// ---------------------------------------------------------------------------
// Module access
// ---------------------------------------------------------------------------

export function canCreateAccounts(user: User | null | undefined): boolean {
  return can(user, "admin", "manage");
}

/** Sales management screens: team, analytics, overview. */
export function canAccessSalesAdmin(user: User | null | undefined): boolean {
  return can(user, "crm", "manage");
}

export function canAccessDepartment(
  user: User | null | undefined,
  department: Department
): boolean {
  const moduleKey = moduleForDepartment(department);
  return moduleKey ? can(user, moduleKey) : false;
}

export function canAccessSupport(user: User | null | undefined): boolean {
  return can(user, "support");
}

/**
 * AI Agents is `manage`-only — there is no read-only view of a kill switch worth
 * having, and the module is granted to no template, so this is the owner unless
 * somebody is given it explicitly in /admin.
 */
export function canAccessAi(user: User | null | undefined): boolean {
  return can(user, "ai", "manage");
}

export function canAccessStock(user: User | null | undefined): boolean {
  return can(user, "stock");
}

export function canAccessCoordination(user: User | null | undefined): boolean {
  return can(user, "coordination");
}

export function canAccessWireless(user: User | null | undefined): boolean {
  return can(user, "wireless");
}

export function canAccessFiber(user: User | null | undefined): boolean {
  return can(user, "fiber");
}

export function canAccessFinancial(user: User | null | undefined): boolean {
  return can(user, "financial");
}

export function canAccessGeneral(user: User | null | undefined): boolean {
  return can(user, "general");
}

export function canAccessAccounts(user: User | null | undefined): boolean {
  return can(user, "accounts");
}

export function canAccessReception(user: User | null | undefined): boolean {
  return can(user, "reception");
}

export function canAccessPlaceholderDepartment(
  user: User | null | undefined,
  department: PlaceholderDepartment
): boolean {
  return canAccessDepartment(user, department);
}

/** Stock dashboard pages (inventory, scan, fulfil). */
export function canManageStock(user: User | null | undefined): boolean {
  return can(user, "stock", "edit");
}

/** Create / view stock pick lists — stock or coordination. */
export function canAccessStockRequests(user: User | null | undefined): boolean {
  return canAny(user, ["stock", "coordination"]);
}

// ---------------------------------------------------------------------------
// User management
// ---------------------------------------------------------------------------

export function canManageUser(actor: User, target: User): boolean {
  if (can(actor, "admin", "manage")) return true;
  if (actor.id === target.id) return true;
  // A module manager may manage staff whose home department maps to that module.
  const targetModule = moduleForDepartment(target.department);
  if (targetModule && can(actor, targetModule, "manage") && target.role === "staff") {
    return true;
  }
  return false;
}

export function getVisibleUsers(actor: User, allUsers: User[]): User[] {
  if (can(actor, "staff", "view") || can(actor, "admin", "view")) return allUsers;
  if (isSalesManager(actor)) {
    return allUsers.filter((u) => u.department === "sales" || u.role === "owner");
  }
  return allUsers.filter((u) => u.id === actor.id);
}

export function getSalesStaff(users: User[]): User[] {
  return users.filter((u) => u.role === "staff" && u.department === "sales");
}

export function getDepartmentManagers(users: User[], department: Department): User[] {
  return users.filter((u) => u.role === "manager" && u.department === department);
}

export function getDepartmentStaff(users: User[], department: Department): User[] {
  return users.filter((u) => u.role === "staff" && u.department === department);
}

/** Active field technicians for pick-list assignment. */
export function getFieldTechnicians(users: User[]): User[] {
  return users.filter(
    (u) =>
      u.active !== false &&
      u.role === "staff" &&
      (u.department === "coordination" || u.department === "stock")
  );
}

// ---------------------------------------------------------------------------
// Labels and routing
// ---------------------------------------------------------------------------

export function getDepartmentLabel(department: Department): string {
  return DEPARTMENT_LABELS[department] ?? department;
}

export function getUserBadgeLabel(user: User): string | null {
  if (isOwner(user)) return "Owner";
  if (user.role === "manager" && user.department) {
    return `${getDepartmentLabel(user.department)} Manager`;
  }
  return null;
}

export function getDefaultTitle(role: UserRole, department: Department | null): string {
  if (role === "owner") return "Megs Owner";
  if (role === "manager" && department) return `${getDepartmentLabel(department)} Manager`;
  if (role === "staff" && department === "sales") return "Sales Representative";
  if (role === "staff" && department) return `${getDepartmentLabel(department)} Staff`;
  return "Staff Member";
}

export function getHomeRoute(user: User): string {
  return homeRoute(user);
}
