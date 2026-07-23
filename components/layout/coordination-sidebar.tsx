"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Boxes, Briefcase, CalendarOff, ClipboardList, Clock, LayoutDashboard, Users } from "lucide-react";

const coordinationNavItems = [
  { href: "/coordination", label: "Overview", icon: LayoutDashboard, short: "Home" },
  { href: "/coordination/jobs", label: "Jobs", icon: Briefcase, short: "Jobs" },
  { href: "/coordination/timesheets", label: "Timesheets", icon: Clock, short: "Time" },
  { href: "/coordination/time-off", label: "Time off", icon: CalendarOff, short: "Leave" },
  { href: "/coordination/requests", label: "Pick lists", icon: ClipboardList, short: "Lists" },
  { href: "/coordination/technicians", label: "Technicians", icon: Users, short: "Techs" },
  { href: "/coordination/availability", label: "Availability", icon: Boxes, short: "Stock" },
];

export function CoordinationSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 border-r bg-white print:hidden lg:block">
      <nav className="flex flex-col gap-1 p-4">
        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Coordination
        </p>
        {coordinationNavItems.map((item) => {
          const isActive =
            item.href === "/coordination"
              ? pathname === "/coordination"
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

export function CoordinationMobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t bg-white print:hidden lg:hidden">
      {coordinationNavItems.map((item) => {
        const isActive =
          item.href === "/coordination"
            ? pathname === "/coordination"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-2 text-[10px] sm:text-xs",
              isActive ? "text-[#C83733]" : "text-gray-500"
            )}
          >
            {item.short}
          </Link>
        );
      })}
    </nav>
  );
}
