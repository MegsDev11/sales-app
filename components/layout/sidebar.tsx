"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useCrmStore } from "@/lib/store/crm-store";
import { isInLeadInbox } from "@/lib/utils/leads";
import {
  MobileNavShell,
  NavSectionLabel,
  SidebarShell,
  mobileNavItemClass,
  navBadgeClass,
  navItemClass,
} from "@/components/layout/page-shell";
import {
  isNavActive,
  salesManagerNavItems,
  salesStaffNavItems,
} from "@/lib/nav/department-nav";

export function Sidebar() {
  const pathname = usePathname();
  const { isAdmin, currentUser } = useAuth();
  const { leads } = useCrmStore();

  if (!currentUser) return null;

  const unassignedCount = isAdmin ? leads.filter(isInLeadInbox).length : 0;
  const visibleItems = isAdmin ? salesManagerNavItems : salesStaffNavItems;

  return (
    <SidebarShell>
      <NavSectionLabel>Sales</NavSectionLabel>
      {visibleItems.map((item) => {
        const active = isNavActive(pathname, item.href, "/dashboard");
        const Icon = item.icon;
        return (
          <Link key={item.href} href={item.href} className={navItemClass(active)}>
            <Icon className="h-4 w-4 shrink-0" />
            <span className="flex-1">{item.label}</span>
            {item.href === "/inbox" && unassignedCount > 0 ? (
              <span className={navBadgeClass(active)}>{unassignedCount}</span>
            ) : null}
          </Link>
        );
      })}
    </SidebarShell>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  const { isAdmin, currentUser } = useAuth();

  if (!currentUser) return null;

  const visibleItems = (isAdmin ? salesManagerNavItems : salesStaffNavItems).slice(0, 5);

  return (
    <MobileNavShell>
      {visibleItems.map((item) => {
        const active = isNavActive(pathname, item.href, "/dashboard");
        const Icon = item.icon;
        return (
          <Link key={item.href} href={item.href} className={mobileNavItemClass(active)}>
            <Icon className="h-5 w-5" />
            <span className="truncate px-1">{item.label.split(" ")[0]}</span>
          </Link>
        );
      })}
    </MobileNavShell>
  );
}
