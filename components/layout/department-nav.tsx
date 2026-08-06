"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Building2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useOwnerSection } from "@/lib/department-context";
import { useCrmStore } from "@/lib/store/crm-store";
import { isInLeadInbox } from "@/lib/utils/leads";
import { can, navItemsFor } from "@/lib/access";
import { moduleForPath, type ModuleDef } from "@/lib/modules";
import type { OwnerSection } from "@/lib/permissions";
import {
  MobileNavShell,
  NavSectionLabel,
  SidebarShell,
  mobileNavItemClass,
  navBadgeClass,
  navItemClass,
} from "@/components/layout/page-shell";
import { isNavActive, type NavItem } from "@/lib/nav/department-nav";

/**
 * Registry-driven navigation.
 *
 * This file used to be 510 lines: a hardcoded `ownerSections` array, a `showXNav`
 * boolean per department, and an if-chain in DashboardNav with one branch per
 * department. Adding a module meant editing all three. It now renders whatever
 * `visibleModules(user)` returns, so a module appears the moment someone is granted
 * it — no code change, no deployment.
 */

const GROUP_LABELS: Record<ModuleDef["group"], string> = {
  commercial: "Commercial",
  operations: "Operations",
  admin: "Administration",
};

/** Sidebar group order. Modules keep their own sortOrder *within* a group. */
const GROUP_ORDER: ModuleDef["group"][] = ["commercial", "operations", "admin"];

/**
 * Bucket modules under their group.
 *
 * MODULE_LIST is sorted by sortOrder, which interleaves groups — Financial (110,
 * commercial) sorts after Projects (100, operations). Walking the flat list and
 * emitting a label whenever the group changed therefore printed "Commercial" and
 * "Operations" twice each, with Financial and General stranded at the bottom.
 */
function groupModules(modules: ModuleDef[]) {
  return GROUP_ORDER.map((group) => ({
    group,
    modules: modules.filter((m) => m.group === group),
  })).filter((entry) => entry.modules.length > 0);
}

function NavLinks({
  items,
  root,
  badgeHref,
  badgeCount,
  onNavigate,
}: {
  items: NavItem[];
  root: string;
  badgeHref?: string;
  badgeCount?: number;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <>
      {items.map((item) => {
        const active = isNavActive(pathname, item.href, root);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={navItemClass(active)}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="flex-1">{item.label}</span>
            {badgeHref && item.href === badgeHref && badgeCount && badgeCount > 0 ? (
              <span className={navBadgeClass(active)}>{badgeCount}</span>
            ) : null}
          </Link>
        );
      })}
    </>
  );
}

function MobileLinks({ items, root }: { items: NavItem[]; root: string }) {
  const pathname = usePathname();
  return (
    <>
      {items.map((item) => {
        const Icon = item.icon;
        const label = item.short ?? item.label.split(" ")[0];
        return (
          <Link
            key={item.href}
            href={item.href}
            className={mobileNavItemClass(isNavActive(pathname, item.href, root))}
          >
            <Icon className="h-5 w-5" />
            <span className="truncate px-1">{label}</span>
          </Link>
        );
      })}
    </>
  );
}

const COLLAPSE_KEY = "megs.nav.collapsed-groups";

/** Collapsible group heading. Looks like NavSectionLabel, but it is a control. */
function GroupHeader({
  label,
  collapsed,
  count,
  onToggle,
}: {
  label: string;
  collapsed: boolean;
  count: number;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      className="group mt-3 mb-1.5 flex w-full items-center gap-1 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
    >
      <ChevronRight
        className={cn(
          "h-3 w-3 shrink-0 transition-transform",
          !collapsed && "rotate-90"
        )}
      />
      <span className="flex-1 text-left">{label}</span>
      {collapsed ? (
        <span className="tabular-nums opacity-70">{count}</span>
      ) : null}
    </button>
  );
}

/**
 * Sidebar for anyone with more than one module.
 *
 * The owner holds every module, which made this a flat list of 16 buttons with
 * the active module's pages stranded at the very bottom — so choosing Stock put
 * its pages a screen away from the Stock button. Three changes fix that:
 * the active module's pages now nest directly beneath it, groups collapse (the
 * choice is remembered), and the owner-only destinations are pinned to the top.
 */
function MultiModuleSidebar({ modules }: { modules: ModuleDef[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const { activeSection, setActiveSection } = useOwnerSection();
  const { currentUser, isOwner } = useAuth();
  const { leads } = useCrmStore();
  const unassignedCount = can(currentUser, "crm", "manage")
    ? leads.filter(isInLeadInbox).length
    : 0;

  const [collapsed, setCollapsed] = useState<string[]>([]);

  // Read after mount rather than during render so server and client markup agree.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COLLAPSE_KEY);
      if (raw) setCollapsed(JSON.parse(raw) as string[]);
    } catch {
      // A malformed or unavailable store just means "nothing collapsed".
    }
  }, []);

  const toggleGroup = (group: string) =>
    setCollapsed((prev) => {
      const next = prev.includes(group)
        ? prev.filter((g) => g !== group)
        : [...prev, group];
      try {
        window.localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
      } catch {
        // Persistence is a convenience; the session still works without it.
      }
      return next;
    });

  // The module owning the current URL beats the remembered section, so deep links
  // and browser-back land on the correct sub-nav.
  const pathModule = moduleForPath(pathname);
  const activeKey: OwnerSection =
    pathModule && modules.some((m) => m.key === pathModule.key)
      ? pathModule.key
      : activeSection;

  const activeModule = modules.find((m) => m.key === activeKey) ?? null;

  /*
   * Administration and Staff Performance are not departments — they are the
   * owner's control over accounts, roles and people, closer to a site admin role
   * than to Sales or Stock. For the owner they are lifted out of the department
   * switcher into their own Management block, so the department list below is
   * exactly the business departments and nothing else.
   */
  const managementKeys = ["admin", "staff", "ai"] as const;
  const management = isOwner
    ? managementKeys
        .map((key) => modules.find((m) => m.key === key))
        .filter((m): m is ModuleDef => Boolean(m))
    : [];
  const managementSet = new Set(management.map((m) => m.key));
  const groups = groupModules(modules.filter((m) => !managementSet.has(m.key)));

  const renderModule = (mod: ModuleDef, opts: { isDepartment?: boolean } = {}) => {
    const { isDepartment = true } = opts;
    const Icon = mod.icon;
    const isActive = activeKey === mod.key;
    const allPages = isActive ? navItemsFor(currentUser, mod.key) : [];
    // A single page that IS the module root (Administration, Staff Performance,
    // the placeholders) would just repeat the button's own label underneath it.
    const pages =
      allPages.length === 1 && allPages[0].href === mod.root ? [] : allPages;
    return (
      <div key={mod.key}>
        <button
          type="button"
          onClick={() => {
            // Management tools are not departments, so they must not become the
            // remembered department — leaving Administration would otherwise
            // leave no department selected.
            if (isDepartment) setActiveSection(mod.key);
            router.push(mod.root);
          }}
          className={navItemClass(isActive)}
        >
          <Icon className="h-4 w-4 shrink-0" />
          {mod.label}
        </button>

        {/* The module's pages sit under the module, not at the end of the list. */}
        {pages.length > 0 ? (
          <div className="mt-0.5 mb-1 ml-[1.0625rem] flex flex-col gap-0.5 border-l border-border pl-2">
            <NavLinks
              items={pages}
              root={mod.root}
              badgeHref="/inbox"
              badgeCount={mod.key === "crm" ? unassignedCount : 0}
              onNavigate={() => setActiveSection(mod.key)}
            />
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <SidebarShell>
      {isOwner ? (
        <>
          <NavSectionLabel>Company</NavSectionLabel>
          <button
            type="button"
            onClick={() => {
              setActiveSection("company");
              router.push("/company");
            }}
            className={navItemClass(pathname === "/company")}
          >
            <Building2 className="h-4 w-4 shrink-0" />
            Company Overview
          </button>

          {management.length > 0 ? (
            <>
              <NavSectionLabel className="mt-3">Management</NavSectionLabel>
              <div className="flex flex-col gap-0.5">
                {management.map((mod) => renderModule(mod, { isDepartment: false }))}
              </div>
            </>
          ) : null}

          {/* Everything below this line is a business department. */}
          <div className="mx-2.5 mt-4 border-t border-sidebar-border" />
        </>
      ) : null}

      {groups.map(({ group, modules: groupModuleList }) => {
        // Never hide the section the user is standing in.
        const holdsActive = groupModuleList.some((m) => m.key === activeKey);
        const isCollapsed = collapsed.includes(group) && !holdsActive;
        return (
          <div key={group}>
            <GroupHeader
              label={GROUP_LABELS[group]}
              collapsed={isCollapsed}
              count={groupModuleList.length}
              onToggle={() => toggleGroup(group)}
            />
            {!isCollapsed ? (
              <div className="flex flex-col gap-0.5">
                {groupModuleList.map((mod) => renderModule(mod))}
              </div>
            ) : null}
          </div>
        );
      })}

      {/* A non-owner multi-module user has no pinned section, so if their active
          module somehow sits outside the rendered groups, fall back to its pages. */}
      {activeModule && !modules.some((m) => m.key === activeModule.key) ? (
        <>
          <NavSectionLabel className="mt-3">{activeModule.label}</NavSectionLabel>
          <NavLinks
            items={navItemsFor(currentUser, activeModule.key)}
            root={activeModule.root}
            badgeHref="/inbox"
            badgeCount={activeModule.key === "crm" ? unassignedCount : 0}
            onNavigate={() => setActiveSection(activeModule.key)}
          />
        </>
      ) : null}
    </SidebarShell>
  );
}

/** Sidebar for a single-module user — no switcher, straight to the pages. */
function SingleModuleSidebar({ module }: { module: ModuleDef }) {
  const { currentUser } = useAuth();
  const { leads } = useCrmStore();
  const unassignedCount = can(currentUser, "crm", "manage")
    ? leads.filter(isInLeadInbox).length
    : 0;

  return (
    <SidebarShell>
      <NavSectionLabel>{module.label}</NavSectionLabel>
      <NavLinks
        items={navItemsFor(currentUser, module.key)}
        root={module.root}
        badgeHref="/inbox"
        badgeCount={module.key === "crm" ? unassignedCount : 0}
      />
    </SidebarShell>
  );
}

function MobileNav({ modules }: { modules: ModuleDef[] }) {
  const pathname = usePathname();
  const { currentUser } = useAuth();

  const pathModule = moduleForPath(pathname);
  const activeModule =
    (pathModule && modules.find((m) => m.key === pathModule.key)) ??
    (modules.length === 1 ? modules[0] : null);

  // Inside a module: show its pages. Otherwise: show the modules themselves.
  if (activeModule) {
    return (
      <MobileNavShell>
        <MobileLinks
          items={navItemsFor(currentUser, activeModule.key).slice(0, 5)}
          root={activeModule.root}
        />
      </MobileNavShell>
    );
  }

  return (
    <MobileNavShell>
      {modules.slice(0, 5).map((mod) => {
        const Icon = mod.icon;
        return (
          <Link
            key={mod.key}
            href={mod.root}
            className={mobileNavItemClass(pathname.startsWith(mod.root))}
          >
            <Icon className="h-5 w-5" />
            <span className="truncate px-1">{mod.label.split(" ")[0]}</span>
          </Link>
        );
      })}
    </MobileNavShell>
  );
}

/** Single nav entry point for every dashboard shell. */
export function DashboardNav({ variant }: { variant: "sidebar" | "mobile" }) {
  const { currentUser, modules, isOwner } = useAuth();

  if (!currentUser) return null;
  if (modules.length === 0) return null;

  if (variant === "mobile") return <MobileNav modules={modules} />;

  if (modules.length === 1 && !isOwner) {
    return <SingleModuleSidebar module={modules[0]} />;
  }

  return <MultiModuleSidebar modules={modules} />;
}
