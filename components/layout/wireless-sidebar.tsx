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
import { isNavActive, wirelessNavItems } from "@/lib/nav/department-nav";

export function WirelessSidebar() {
  const pathname = usePathname();

  return (
    <SidebarShell>
      <NavSectionLabel>Wireless</NavSectionLabel>
      {wirelessNavItems.map((item) => {
        const active = isNavActive(pathname, item.href, "/wireless");
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

export function WirelessMobileNav() {
  const pathname = usePathname();

  return (
    <MobileNavShell>
      {wirelessNavItems.map((item) => {
        const short =
          item.href === "/wireless/submissions"
            ? "Inbox"
            : item.href === "/wireless/layouts"
              ? "Maps"
              : item.label;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={mobileNavItemClass(isNavActive(pathname, item.href, "/wireless"))}
          >
            {short}
          </Link>
        );
      })}
    </MobileNavShell>
  );
}
