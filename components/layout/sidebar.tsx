"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useCrmStore } from "@/lib/store/crm-store";
import { isSalesStaff } from "@/lib/permissions";
import { isInLeadInbox } from "@/lib/utils/leads";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Kanban,
  Users,
  BarChart3,
  TrendingUp,
  Inbox,
  MapPin,
} from "lucide-react";

const managerNavItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/board", label: "Pipeline Board", icon: Kanban },
  { href: "/inbox", label: "Lead Inbox", icon: Inbox },
  { href: "/surveys", label: "Site Surveys", icon: MapPin },
  { href: "/team", label: "Team", icon: Users },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
];

const staffNavItems = [
  { href: "/board", label: "Pipeline Board", icon: Kanban },
  { href: "/surveys", label: "Site Surveys", icon: MapPin },
  { href: "/my-stats", label: "My Stats", icon: TrendingUp },
];

export function Sidebar() {
  const pathname = usePathname();
  const { isAdmin, currentUser } = useAuth();
  const { leads } = useCrmStore();

  if (!currentUser) return null;

  const unassignedCount = isAdmin ? leads.filter(isInLeadInbox).length : 0;

  const visibleItems = isAdmin ? managerNavItems : staffNavItems;

  return (
    <aside className="hidden w-56 shrink-0 border-r bg-white lg:block">
      <nav className="flex flex-col gap-1 p-4">
        {visibleItems.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive ? "bg-[#C83733] text-white" : "text-gray-700 hover:bg-gray-100"
              )}
            >
              <span className="flex items-center gap-3">
                <Icon className="h-4 w-4" />
                {item.label}
              </span>
              {item.href === "/inbox" && unassignedCount > 0 && (
                <span className="rounded-full bg-white px-1.5 text-xs font-bold text-[#C83733]">
                  {unassignedCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  const { isAdmin, currentUser } = useAuth();

  if (!currentUser) return null;

  const visibleItems = (isAdmin ? managerNavItems : staffNavItems).slice(0, 5);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t bg-white lg:hidden">
      {visibleItems.map((item) => {
        const isActive =
          item.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-2 text-xs",
              isActive ? "text-[#C83733]" : "text-gray-500"
            )}
          >
            <Icon className="h-5 w-5" />
            <span className="truncate px-1">{item.label.split(" ")[0]}</span>
          </Link>
        );
      })}
    </nav>
  );
}
