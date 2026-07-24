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
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <SidebarShell>
      <NavSectionLabel>{label}</NavSectionLabel>
      <Link href={href} className={navItemClass(active)}>
        <LayoutDashboard className="h-4 w-4 shrink-0" />
        Overview
      </Link>
    </SidebarShell>
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
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <MobileNavShell>
      <Link href={href} className={mobileNavItemClass(active)}>
        {label}
      </Link>
    </MobileNavShell>
  );
}
