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
import { isNavActive, stockNavItems } from "@/lib/nav/department-nav";
import { useAuth } from "@/lib/auth-context";
import { canAccessStock } from "@/lib/permissions";

export function StockSidebar() {
  const pathname = usePathname();
  const { currentUser } = useAuth();
  const isStockUser = canAccessStock(currentUser);
  const items = stockNavItems.filter((item) => isStockUser || !item.stockOnly);

  return (
    <SidebarShell>
      <NavSectionLabel>Stock</NavSectionLabel>
      {items.map((item) => {
        const active = isNavActive(pathname, item.href, "/stock");
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

export function StockMobileNav() {
  const pathname = usePathname();
  const { currentUser } = useAuth();
  const isStockUser = canAccessStock(currentUser);
  const items = stockNavItems.filter((item) => isStockUser || !item.stockOnly);

  return (
    <MobileNavShell>
      {items.map((item) => {
        const short =
          item.href === "/stock/qr"
            ? "QR"
            : item.href === "/stock/client-qrs"
              ? "Clients"
              : item.href === "/stock/inventory"
                ? "Stock"
                : item.href === "/stock/booked-out"
                  ? "Out"
                  : item.href === "/stock/requests"
                    ? "Lists"
                    : item.label;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={mobileNavItemClass(isNavActive(pathname, item.href, "/stock"))}
          >
            {short}
          </Link>
        );
      })}
    </MobileNavShell>
  );
}
