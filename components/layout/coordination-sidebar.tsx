"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MobileNavShell,
  NavSectionLabel,
  SidebarShell,
  mobileNavItemClass,
  navItemClass,
} from "@/components/layout/page-shell";
import { coordinationNavItems, isNavActive } from "@/lib/nav/department-nav";

export function CoordinationSidebar() {
  const pathname = usePathname();

  return (
    <SidebarShell>
      <NavSectionLabel>Coordination</NavSectionLabel>
      {coordinationNavItems.map((item) => {
        const active = isNavActive(pathname, item.href, "/coordination");
        const Icon = item.icon;
        return (
          <Link key={item.href} href={item.href} className={navItemClass(active)}>
            <Icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </SidebarShell>
  );
}

export function CoordinationMobileNav() {
  const pathname = usePathname();

  return (
    <MobileNavShell>
      {coordinationNavItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={mobileNavItemClass(isNavActive(pathname, item.href, "/coordination"))}
        >
          {item.short ?? item.label}
        </Link>
      ))}
    </MobileNavShell>
  );
}
