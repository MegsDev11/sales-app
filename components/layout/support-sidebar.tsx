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
import { isNavActive, supportNavItems } from "@/lib/nav/department-nav";

export function SupportSidebar() {
  const pathname = usePathname();

  return (
    <SidebarShell>
      <NavSectionLabel>Support</NavSectionLabel>
      {supportNavItems.map((item) => {
        const active = isNavActive(pathname, item.href, "/support");
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

export function SupportMobileNav() {
  const pathname = usePathname();

  return (
    <MobileNavShell>
      {supportNavItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={mobileNavItemClass(isNavActive(pathname, item.href, "/support"))}
        >
          {item.label.split(" ")[0]}
        </Link>
      ))}
    </MobileNavShell>
  );
}
