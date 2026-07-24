"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useOwnerSection } from "@/lib/department-context";
import { useCrmStore } from "@/lib/store/crm-store";
import { isInLeadInbox } from "@/lib/utils/leads";
import type { OwnerSection } from "@/lib/permissions";
import {
  MobileNavShell,
  NavSectionLabel,
  SidebarShell,
  mobileNavItemClass,
  navBadgeClass,
  navItemClass,
} from "@/components/layout/page-shell";
import {
  coordinationNavItems,
  isNavActive,
  salesManagerNavItems,
  stockNavItems,
  supportNavItems,
  wirelessNavItems,
} from "@/lib/nav/department-nav";
import {
  LayoutDashboard,
  Kanban,
  Building2,
  Package,
  Network,
  UserCog,
  Headphones,
  Wifi,
  Cable,
  Wallet,
  Briefcase,
  BookUser,
  ConciergeBell,
} from "lucide-react";
import { PLACEHOLDER_DEPARTMENTS } from "@/lib/permissions";

const ownerSections: { id: OwnerSection; label: string; icon: typeof Building2; href: string }[] = [
  { id: "company", label: "Company", icon: Building2, href: "/company" },
  { id: "sales", label: "Sales", icon: Kanban, href: "/dashboard" },
  { id: "support", label: "Support", icon: Headphones, href: "/support" },
  { id: "stock", label: "Stock", icon: Package, href: "/stock" },
  { id: "coordination", label: "Coordination", icon: Network, href: "/coordination" },
  { id: "wireless", label: "Wireless", icon: Wifi, href: "/wireless" },
  { id: "fiber", label: "Fiber", icon: Cable, href: "/fiber" },
  { id: "financial", label: "Financial", icon: Wallet, href: "/financial" },
  { id: "general", label: "General", icon: Briefcase, href: "/general" },
  { id: "accounts", label: "Accounts", icon: BookUser, href: "/accounts" },
  { id: "reception", label: "Reception", icon: ConciergeBell, href: "/reception" },
  { id: "staff", label: "Staff Accounts", icon: UserCog, href: "/staff" },
];

const placeholderPaths = PLACEHOLDER_DEPARTMENTS.map((dept) => `/${dept}`);
const salesNavItems = salesManagerNavItems;

export function OwnerSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { activeSection, setActiveSection } = useOwnerSection();
  const { leads } = useCrmStore();

  const unassignedCount = leads.filter(isInLeadInbox).length;

  const handleSectionClick = (section: OwnerSection, href: string) => {
    setActiveSection(section);
    router.push(href);
  };

  const salesPaths = salesNavItems.map((i) => i.href);
  const supportPaths = supportNavItems.map((i) => i.href);
  const stockPaths = stockNavItems.map((i) => i.href);
  const coordinationPaths = coordinationNavItems.map((i) => i.href);
  const wirelessPaths = wirelessNavItems.map((i) => i.href);
  const showSalesNav = activeSection === "sales" || salesPaths.some((p) => pathname.startsWith(p));
  const showSupportNav =
    activeSection === "support" || supportPaths.some((p) => pathname.startsWith(p));
  const showStockNav =
    activeSection === "stock" || stockPaths.some((p) => pathname.startsWith(p));
  const showCoordinationNav =
    activeSection === "coordination" ||
    coordinationPaths.some((p) => pathname.startsWith(p));
  const showWirelessNav =
    activeSection === "wireless" || wirelessPaths.some((p) => pathname.startsWith(p));
  const activePlaceholder = PLACEHOLDER_DEPARTMENTS.find(
    (dept) =>
      activeSection === dept ||
      pathname === `/${dept}` ||
      pathname.startsWith(`/${dept}/`)
  );
  const showPlaceholderNav = Boolean(activePlaceholder);

  return (
    <SidebarShell>
      <NavSectionLabel>Departments</NavSectionLabel>
      {ownerSections.map((section) => {
        const Icon = section.icon;
        const isActive =
          section.id === activeSection ||
          (section.id === "sales" && salesPaths.some((p) => pathname.startsWith(p))) ||
          (section.id === "support" && supportPaths.some((p) => pathname.startsWith(p))) ||
          (section.id === "stock" && stockPaths.some((p) => pathname.startsWith(p))) ||
          (section.id === "coordination" &&
            coordinationPaths.some((p) => pathname.startsWith(p))) ||
          (section.id === "wireless" && wirelessPaths.some((p) => pathname.startsWith(p))) ||
          (placeholderPaths.includes(section.href) &&
            (pathname === section.href || pathname.startsWith(`${section.href}/`)));
        return (
          <button
            key={section.id}
            type="button"
            onClick={() => handleSectionClick(section.id, section.href)}
            className={navItemClass(isActive)}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {section.label}
          </button>
        );
      })}

      {showSalesNav ? (
        <>
          <NavSectionLabel className="mt-3">Sales</NavSectionLabel>
          {salesNavItems.map((item) => {
            const active = isNavActive(pathname, item.href, "/dashboard");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setActiveSection("sales")}
                className={navItemClass(active)}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1">{item.label}</span>
                {item.href === "/inbox" && unassignedCount > 0 ? (
                  <span className={navBadgeClass(active)}>{unassignedCount}</span>
                ) : null}
              </Link>
            );
          })}
        </>
      ) : null}

      {showSupportNav ? (
        <>
          <NavSectionLabel className="mt-3">Support</NavSectionLabel>
          {supportNavItems.map((item) => {
            const active = isNavActive(pathname, item.href, "/support");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setActiveSection("support")}
                className={navItemClass(active)}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </>
      ) : null}

      {showStockNav ? (
        <>
          <NavSectionLabel className="mt-3">Stock</NavSectionLabel>
          {stockNavItems.map((item) => {
            const active = isNavActive(pathname, item.href, "/stock");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setActiveSection("stock")}
                className={navItemClass(active)}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </>
      ) : null}

      {showCoordinationNav ? (
        <>
          <NavSectionLabel className="mt-3">Coordination</NavSectionLabel>
          {coordinationNavItems.map((item) => {
            const active = isNavActive(pathname, item.href, "/coordination");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setActiveSection("coordination")}
                className={navItemClass(active)}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </>
      ) : null}

      {showWirelessNav ? (
        <>
          <NavSectionLabel className="mt-3">Wireless</NavSectionLabel>
          {wirelessNavItems.map((item) => {
            const active = isNavActive(pathname, item.href, "/wireless");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setActiveSection("wireless")}
                className={navItemClass(active)}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </>
      ) : null}

      {showPlaceholderNav && activePlaceholder ? (
        <>
          <NavSectionLabel className="mt-3">
            {ownerSections.find((s) => s.id === activePlaceholder)?.label}
          </NavSectionLabel>
          <Link
            href={`/${activePlaceholder}`}
            onClick={() => setActiveSection(activePlaceholder)}
            className={navItemClass(
              pathname === `/${activePlaceholder}` ||
                pathname.startsWith(`/${activePlaceholder}/`)
            )}
          >
            <LayoutDashboard className="h-4 w-4 shrink-0" />
            Overview
          </Link>
        </>
      ) : null}
    </SidebarShell>
  );
}

export function OwnerMobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { setActiveSection } = useOwnerSection();

  const items = [
    { href: "/company", label: "Company", section: "company" as const },
    { href: "/dashboard", label: "Sales", section: "sales" as const },
    { href: "/staff", label: "Staff", section: "staff" as const },
  ];

  return (
    <MobileNavShell>
      {items.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <button
            key={item.href}
            type="button"
            onClick={() => {
              setActiveSection(item.section);
              router.push(item.href);
            }}
            className={mobileNavItemClass(active)}
          >
            {item.label}
          </button>
        );
      })}
    </MobileNavShell>
  );
}
