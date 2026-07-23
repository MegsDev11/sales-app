"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { getDepartmentLabel, type PlaceholderDepartment } from "@/lib/permissions";
import { LayoutDashboard } from "lucide-react";

export function PlaceholderDepartmentSidebar({
  department,
}: {
  department: PlaceholderDepartment;
}) {
  const pathname = usePathname();
  const href = `/${department}`;
  const label = getDepartmentLabel(department);
  const isActive = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside className="hidden w-60 shrink-0 border-r bg-white lg:block">
      <nav className="flex flex-col gap-1 p-4">
        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <Link
          href={href}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            isActive ? "bg-[#C83733] text-white" : "text-gray-700 hover:bg-gray-100"
          )}
        >
          <LayoutDashboard className="h-4 w-4 shrink-0" />
          Overview
        </Link>
      </nav>
    </aside>
  );
}

export function PlaceholderDepartmentMobileNav({
  department,
}: {
  department: PlaceholderDepartment;
}) {
  const pathname = usePathname();
  const href = `/${department}`;
  const label = getDepartmentLabel(department);
  const isActive = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t bg-white lg:hidden">
      <Link
        href={href}
        className={cn(
          "flex flex-1 flex-col items-center gap-1 py-2 text-xs",
          isActive ? "text-[#C83733]" : "text-gray-500"
        )}
      >
        {label}
      </Link>
    </nav>
  );
}
