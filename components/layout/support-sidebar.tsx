"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Radio, Users } from "lucide-react";

const supportNavItems = [
  { href: "/support", label: "Overview", icon: LayoutDashboard },
  { href: "/support/towers", label: "Towers & Outages", icon: Radio },
  { href: "/support/clients", label: "Client Assignment", icon: Users },
];

export function SupportSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 border-r bg-white lg:block">
      <nav className="flex flex-col gap-1 p-4">
        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Support
        </p>
        {supportNavItems.map((item) => {
          const isActive =
            item.href === "/support"
              ? pathname === "/support"
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

export function SupportMobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t bg-white lg:hidden">
      {supportNavItems.map((item) => {
        const isActive =
          item.href === "/support"
            ? pathname === "/support"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-2 text-xs",
              isActive ? "text-[#C83733]" : "text-gray-500"
            )}
          >
            {item.label.split(" ")[0]}
          </Link>
        );
      })}
    </nav>
  );
}
