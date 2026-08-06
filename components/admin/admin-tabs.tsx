"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Briefcase, History, LayoutList, ShieldCheck, Users } from "lucide-react";

/**
 * In-page tabs for Administration.
 *
 * These used to be three separate sidebar entries. Administration is one job done
 * in one place, so the sidebar carries a single entry and the sections live here.
 */
const TABS = [
  { href: "/admin", label: "Staff & Access", icon: ShieldCheck },
  { href: "/admin/templates", label: "Role Templates", icon: Users },
  { href: "/admin/departments", label: "Departments", icon: Briefcase },
  { href: "/admin/sections", label: "Sections", icon: LayoutList },
  { href: "/admin/audit", label: "Audit trail", icon: History },
];

export function AdminTabs() {
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-border pb-2">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
