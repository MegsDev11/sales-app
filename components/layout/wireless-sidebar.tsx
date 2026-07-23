"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Building2,
  Inbox,
  LayoutDashboard,
  Map,
} from "lucide-react";

const wirelessNavItems = [
  { href: "/wireless", label: "Overview", icon: LayoutDashboard },
  { href: "/wireless/submissions", label: "Submissions", icon: Inbox },
  { href: "/wireless/layouts", label: "Layouts", icon: Map },
  { href: "/wireless/clients", label: "Clients", icon: Building2 },
];

export function WirelessSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 border-r bg-white print:hidden lg:block">
      <nav className="flex flex-col gap-1 p-4">
        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Wireless
        </p>
        {wirelessNavItems.map((item) => {
          const isActive =
            item.href === "/wireless"
              ? pathname === "/wireless"
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive ? "bg-[#C83733] text-white" : "text-gray-700 hover:bg-gray-100"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export function WirelessMobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t bg-white print:hidden lg:hidden">
      {wirelessNavItems.map((item) => {
        const isActive =
          item.href === "/wireless"
            ? pathname === "/wireless"
            : pathname.startsWith(item.href);
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
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-2 text-[10px] sm:text-xs",
              isActive ? "text-[#C83733]" : "text-gray-500"
            )}
          >
            {short}
          </Link>
        );
      })}
    </nav>
  );
}

export const wirelessOwnerNavItems = wirelessNavItems;
