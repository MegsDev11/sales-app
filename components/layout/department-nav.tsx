"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
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

/** Sidebar for anyone with more than one module: switcher plus the active sub-nav. */
function MultiModuleSidebar({ modules }: { modules: ModuleDef[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const { activeSection, setActiveSection } = useOwnerSection();
  const { currentUser, isOwner } = useAuth();
  const { leads } = useCrmStore();
  const unassignedCount = can(currentUser, "crm", "manage")
    ? leads.filter(isInLeadInbox).length
    : 0;

  // The module owning the current URL beats the remembered section, so deep links
  // and browser-back land on the correct sub-nav.
  const pathModule = moduleForPath(pathname);
  const activeKey: OwnerSection =
    pathModule && modules.some((m) => m.key === pathModule.key)
      ? pathModule.key
      : activeSection;

  const activeModule = modules.find((m) => m.key === activeKey) ?? null;

  let lastGroup: ModuleDef["group"] | null = null;

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
        </>
      ) : null}

      {modules.map((mod) => {
        const Icon = mod.icon;
        const showGroup = mod.group !== lastGroup;
        lastGroup = mod.group;
        return (
          <div key={mod.key}>
            {showGroup ? (
              <NavSectionLabel className="mt-3">{GROUP_LABELS[mod.group]}</NavSectionLabel>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setActiveSection(mod.key);
                router.push(mod.root);
              }}
              className={navItemClass(activeKey === mod.key)}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {mod.label}
            </button>
          </div>
        );
      })}

      {activeModule ? (
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
