import type { LucideIcon } from "lucide-react";
import {
  BookUser,
  Briefcase,
  Cable,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  ConciergeBell,
  FolderKanban,
  Headphones,
  Kanban,
  LayoutDashboard,
  Lightbulb,
  Network,
  Package,
  ShieldCheck,
  ShoppingCart,
  TrendingUp,
  Users,
  Wallet,
  Wifi,
} from "lucide-react";
import {
  coordinationNavItems,
  financialNavItems,
  salesManagerNavItems,
  salesStaffNavItems,
  stockNavItems,
  supportNavItems,
  wirelessNavItems,
  type NavItem,
} from "@/lib/nav/department-nav";
import type { AccessLevel, ModuleKey } from "@/lib/types";

/**
 * THE module registry.
 *
 * Before this existed, adding a department meant editing six files plus a SQL CHECK
 * constraint: lib/permissions.ts, a lib/hooks/use-*-access.ts, lib/nav/department-nav.ts,
 * components/layout/department-nav.tsx, lib/store/load-gates.ts and
 * lib/supabase/server-auth.ts. That cost is why fiber/general/accounts/reception sat
 * empty for so long.
 *
 * Now: add an entry here, insert a row in the `modules` table, done. Navigation,
 * route protection, store mounting, API guards and the admin console all read from
 * this one place.
 */

export type StoreKey = "crm" | "stock" | "wireless";

export interface ModuleDef {
  key: ModuleKey;
  label: string;
  description: string;
  icon: LucideIcon;
  group: "commercial" | "operations" | "admin";
  /** Landing route when this module is the user's home. */
  root: string;
  /** Sidebar entries shown when this module is active. */
  nav: NavItem[];
  /** Sidebar entries for users below `manage` (falls back to `nav`). */
  staffNav?: NavItem[];
  /**
   * URL prefixes owned by this module. Used by middleware for server-side route
   * protection and by the data providers to decide which stores to mount.
   */
  pathPrefixes: string[];
  /** Client stores this module needs loaded. */
  stores?: StoreKey[];
  /** Level required to open the module at all. */
  minLevel: AccessLevel;
  sortOrder: number;
  /** Not yet built out — renders the placeholder shell. */
  placeholder?: boolean;
}

const PLACEHOLDER_NAV = (root: string): NavItem[] => [
  { href: root, label: "Overview", icon: LayoutDashboard },
];

export const MODULES: Record<ModuleKey, ModuleDef> = {
  crm: {
    key: "crm",
    label: "Sales / CRM",
    description: "Leads, pipeline, site surveys, sales analytics",
    icon: Kanban,
    group: "commercial",
    root: "/dashboard",
    nav: salesManagerNavItems,
    staffNav: salesStaffNavItems,
    // Sales owns flat top-level routes for historical reasons.
    pathPrefixes: [
      "/dashboard",
      "/board",
      "/inbox",
      "/surveys",
      "/analytics",
      "/my-stats",
      "/leads",
      "/team",
    ],
    stores: ["crm"],
    minLevel: "view",
    sortOrder: 10,
  },
  reception: {
    key: "reception",
    label: "Reception",
    description: "Walk-in clients and front desk",
    icon: ConciergeBell,
    group: "commercial",
    root: "/reception",
    nav: PLACEHOLDER_NAV("/reception"),
    pathPrefixes: ["/reception"],
    minLevel: "view",
    sortOrder: 20,
    placeholder: true,
  },
  accounts: {
    key: "accounts",
    label: "Accounts",
    description: "Client accounts and packages",
    icon: BookUser,
    group: "commercial",
    root: "/accounts",
    nav: PLACEHOLDER_NAV("/accounts"),
    pathPrefixes: ["/accounts"],
    minLevel: "view",
    sortOrder: 30,
    placeholder: true,
  },
  support: {
    key: "support",
    label: "Support",
    description: "Tickets, towers, outages, client messaging",
    icon: Headphones,
    group: "operations",
    root: "/support",
    nav: supportNavItems,
    pathPrefixes: ["/support"],
    stores: ["crm"],
    minLevel: "view",
    sortOrder: 40,
  },
  coordination: {
    key: "coordination",
    label: "Coordination",
    description: "Jobs, job cards, technicians, timesheets",
    icon: Network,
    group: "operations",
    root: "/coordination",
    nav: coordinationNavItems,
    pathPrefixes: ["/coordination"],
    stores: ["crm", "stock"],
    minLevel: "view",
    sortOrder: 50,
  },
  scheduler: {
    key: "scheduler",
    label: "Scheduler",
    description: "Meetings, project dates and department calendars",
    icon: CalendarDays,
    group: "operations",
    root: "/scheduler",
    nav: [
      { href: "/scheduler", label: "Calendar", icon: CalendarDays, short: "Cal" },
      { href: "/scheduler/agenda", label: "My agenda", icon: CalendarClock, short: "Mine" },
    ],
    pathPrefixes: ["/scheduler"],
    minLevel: "view",
    sortOrder: 35,
  },
  stock: {
    key: "stock",
    label: "Stock",
    description: "Inventory, QR tracking, pick lists, vehicles",
    icon: Package,
    group: "operations",
    root: "/stock",
    nav: stockNavItems,
    pathPrefixes: ["/stock"],
    stores: ["crm", "stock"],
    minLevel: "view",
    sortOrder: 60,
  },
  procurement: {
    key: "procurement",
    label: "Procurement",
    description: "Suppliers, purchase orders, reorder alerts",
    icon: ShoppingCart,
    group: "operations",
    root: "/procurement",
    nav: [
      { href: "/procurement", label: "Overview", icon: LayoutDashboard },
      { href: "/procurement/suppliers", label: "Suppliers", icon: Users, short: "Suppliers" },
      { href: "/procurement/orders", label: "Purchase orders", icon: ClipboardList, short: "Orders" },
    ],
    pathPrefixes: ["/procurement"],
    minLevel: "view",
    sortOrder: 70,
  },
  wireless: {
    key: "wireless",
    label: "Wireless",
    description: "Network layouts, devices, Ruijie sync",
    icon: Wifi,
    group: "operations",
    root: "/wireless",
    nav: wirelessNavItems,
    pathPrefixes: ["/wireless"],
    stores: ["wireless"],
    minLevel: "view",
    sortOrder: 80,
  },
  fiber: {
    key: "fiber",
    label: "Fiber",
    description: "Fiber operations",
    icon: Cable,
    group: "operations",
    root: "/fiber",
    nav: PLACEHOLDER_NAV("/fiber"),
    pathPrefixes: ["/fiber"],
    minLevel: "view",
    sortOrder: 90,
    placeholder: true,
  },
  projects: {
    key: "projects",
    label: "Projects",
    description: "Cross-department projects and business ideas",
    icon: FolderKanban,
    group: "operations",
    root: "/projects",
    nav: [
      { href: "/projects", label: "All projects", icon: FolderKanban, short: "All" },
      { href: "/projects/board", label: "Board", icon: Kanban, short: "Board" },
      { href: "/projects/ideas", label: "Idea funnel", icon: Lightbulb, short: "Ideas" },
    ],
    pathPrefixes: ["/projects"],
    // Projects reference leads and jobs, so the CRM bundle is needed for names.
    stores: ["crm"],
    minLevel: "view",
    sortOrder: 100,
  },
  financial: {
    key: "financial",
    label: "Financial",
    description: "Fuel, expenses, invoicing, budgets",
    icon: Wallet,
    group: "commercial",
    root: "/financial",
    nav: financialNavItems,
    pathPrefixes: ["/financial"],
    minLevel: "view",
    sortOrder: 110,
  },
  general: {
    key: "general",
    label: "General",
    description: "General management",
    icon: Briefcase,
    group: "operations",
    root: "/general",
    nav: PLACEHOLDER_NAV("/general"),
    pathPrefixes: ["/general"],
    minLevel: "view",
    sortOrder: 120,
    placeholder: true,
  },
  staff: {
    key: "staff",
    label: "Staff Performance",
    description: "Performance analytics and reports per staff member",
    icon: TrendingUp,
    group: "admin",
    root: "/staff",
    // Account creation and access moved to Administration; this section is the
    // reporting view. Its data comes from /api/staff/performance, so the CRM
    // bundle no longer needs mounting here.
    nav: [{ href: "/staff", label: "Performance", icon: TrendingUp }],
    pathPrefixes: ["/staff"],
    minLevel: "view",
    sortOrder: 130,
  },
  admin: {
    key: "admin",
    label: "Administration",
    description: "Module access, templates, departments, audit log",
    icon: ShieldCheck,
    group: "admin",
    root: "/admin",
    // One sidebar entry: staff accounts, access, templates and departments are one
    // job done in one place, so the sections are in-page tabs rather than nav items.
    nav: [{ href: "/admin", label: "Administration", icon: ShieldCheck }],
    pathPrefixes: ["/admin"],
    minLevel: "manage",
    sortOrder: 140,
  },
};

export const MODULE_LIST: ModuleDef[] = Object.values(MODULES).sort(
  (a, b) => a.sortOrder - b.sortOrder
);

export const MODULE_KEYS = MODULE_LIST.map((m) => m.key);

export function isModuleKey(value: string | null | undefined): value is ModuleKey {
  return !!value && Object.prototype.hasOwnProperty.call(MODULES, value);
}

export function getModule(key: ModuleKey): ModuleDef {
  return MODULES[key];
}

/**
 * Map an org department onto its module. Only `sales` differs from its module key.
 * Used when migrating legacy data and when routing department-tagged notifications.
 */
export function moduleForDepartment(
  department: string | null | undefined
): ModuleKey | null {
  if (!department) return null;
  if (department === "sales") return "crm";
  return isModuleKey(department) ? department : null;
}

/** Longest-prefix match so `/stock/requests` resolves to stock, not a shorter rival. */
export function moduleForPath(pathname: string): ModuleDef | null {
  let best: ModuleDef | null = null;
  let bestLength = -1;
  for (const mod of MODULE_LIST) {
    for (const prefix of mod.pathPrefixes) {
      const matches = pathname === prefix || pathname.startsWith(`${prefix}/`);
      if (matches && prefix.length > bestLength) {
        best = mod;
        bestLength = prefix.length;
      }
    }
  }
  return best;
}
