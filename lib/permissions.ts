import type { Department, User, UserRole } from "@/lib/types";

export type OwnerSection = "company" | "sales" | "stock" | "coordination" | "support" | "staff";

const DEPARTMENT_LABELS: Record<Department, string> = {
  sales: "Sales",
  stock: "Stock",
  coordination: "Coordination",
  support: "Support",
};

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

export function isOwner(user: User | null | undefined): boolean {
  return user?.role === "owner";
}

export function isManager(user: User | null | undefined, department?: Department): boolean {
  if (!user || user.role !== "manager") return false;
  if (!department) return true;
  return user.department === department;
}

export function isSalesManager(user: User | null | undefined): boolean {
  return isManager(user, "sales");
}

export function isSupportManager(user: User | null | undefined): boolean {
  return isManager(user, "support");
}

export function isSalesStaff(user: User | null | undefined): boolean {
  return user?.role === "staff" && user.department === "sales";
}

export function isSupportStaff(user: User | null | undefined): boolean {
  return user?.role === "staff" && user.department === "support";
}

export function canCreateAccounts(user: User | null | undefined): boolean {
  return isOwner(user);
}

export function canAccessSalesAdmin(user: User | null | undefined): boolean {
  return isOwner(user) || isSalesManager(user);
}

export function canAccessSupport(user: User | null | undefined): boolean {
  if (!user) return false;
  if (isOwner(user)) return true;
  return user.department === "support";
}

export function canAccessStock(user: User | null | undefined): boolean {
  if (!user) return false;
  if (isOwner(user)) return true;
  return user.department === "stock";
}

export function canAccessCoordination(user: User | null | undefined): boolean {
  if (!user) return false;
  if (isOwner(user)) return true;
  return user.department === "coordination";
}

/** Stock dashboard pages (inventory, scan, fulfill). */
export function canManageStock(user: User | null | undefined): boolean {
  return canAccessStock(user);
}

/** Create / view stock pick lists (coordination + stock + owner). */
export function canAccessStockRequests(user: User | null | undefined): boolean {
  return canAccessStock(user) || canAccessCoordination(user);
}

export function canManageUser(actor: User, target: User): boolean {
  if (isOwner(actor)) return true;
  if (isSalesManager(actor) && target.role === "staff" && target.department === "sales") {
    return true;
  }
  return actor.id === target.id;
}

export function getVisibleUsers(actor: User, allUsers: User[]): User[] {
  if (isOwner(actor)) return allUsers;
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

export function getDepartmentLabel(department: Department): string {
  return DEPARTMENT_LABELS[department];
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
  if (isOwner(user)) return "/company";
  if (user.department === "support") return "/support";
  if (user.department === "stock") return "/stock";
  if (user.department === "coordination") return "/coordination";
  if (canAccessSalesAdmin(user)) return "/dashboard";
  return "/board";
}
