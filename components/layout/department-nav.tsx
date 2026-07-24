"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useOwnerSection } from "@/lib/department-context";
import { useCrmStore } from "@/lib/store/crm-store";
import { isInLeadInbox } from "@/lib/utils/leads";
import {
  canAccessCoordination,
  canAccessStock,
  canAccessSupport,
  canAccessWireless,
  getDepartmentLabel,
  isPlaceholderDepartment,
  PLACEHOLDER_DEPARTMENTS,
  type OwnerSection,
  type PlaceholderDepartment,
} from "@/lib/permissions";
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
  salesStaffNavItems,
  stockNavItems,
  supportNavItems,
  type NavItem,
  wirelessNavItems,
} from "@/lib/nav/department-nav";
import {
  BookUser,
  Briefcase,
  Building2,
  Cable,
  ConciergeBell,
  Headphones,
  Kanban,
  LayoutDashboard,
  Network,
  Package,
  UserCog,
  Wallet,
  Wifi,
} from "lucide-react";

const ownerSections: {
  id: OwnerSection;
  label: string;
  icon: typeof Building2;
  href: string;
}[] = [
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

function NavLinks({
  items,
  root,
  badgeHref,
  badgeCount,
  onNavigate,
}: {
  items: NavItem[];
  root: string;
  badgeHref?: string;
  badgeCount?: number;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <>
      {items.map((item) => {
        const active = isNavActive(pathname, item.href, root);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={navItemClass(active)}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="flex-1">{item.label}</span>
            {badgeHref && item.href === badgeHref && badgeCount && badgeCount > 0 ? (
              <span className={navBadgeClass(active)}>{badgeCount}</span>
            ) : null}
          </Link>
        );
      })}
    </>
  );
}

function MobileLinks({
  items,
  root,
  labelFn,
}: {
  items: NavItem[];
  root: string;
  labelFn?: (item: NavItem) => string;
}) {
  const pathname = usePathname();
  return (
    <>
      {items.map((item) => {
        const Icon = item.icon;
        const label = labelFn?.(item) ?? item.short ?? item.label.split(" ")[0];
        return (
          <Link
            key={item.href}
            href={item.href}
            className={mobileNavItemClass(isNavActive(pathname, item.href, root))}
          >
            <Icon className="h-5 w-5" />
            <span className="truncate px-1">{label}</span>
          </Link>
        );
      })}
    </>
  );
}

function OwnerNav({ variant }: { variant: "sidebar" | "mobile" }) {
  const pathname = usePathname();
  const router = useRouter();
  const { activeSection, setActiveSection } = useOwnerSection();
  const { leads } = useCrmStore();
  const unassignedCount = leads.filter(isInLeadInbox).length;

  if (variant === "mobile") {
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

  const salesPaths = salesManagerNavItems.map((i) => i.href);
  const supportPaths = supportNavItems.map((i) => i.href);
  const stockPaths = stockNavItems.map((i) => i.href);
  const coordinationPaths = coordinationNavItems.map((i) => i.href);
  const wirelessPaths = wirelessNavItems.map((i) => i.href);
  const placeholderPaths = PLACEHOLDER_DEPARTMENTS.map((dept) => `/${dept}`);

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
            onClick={() => {
              setActiveSection(section.id);
              router.push(section.href);
            }}
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
          <NavLinks
            items={salesManagerNavItems}
            root="/dashboard"
            badgeHref="/inbox"
            badgeCount={unassignedCount}
            onNavigate={() => setActiveSection("sales")}
          />
        </>
      ) : null}

      {showSupportNav ? (
        <>
          <NavSectionLabel className="mt-3">Support</NavSectionLabel>
          <NavLinks
            items={supportNavItems}
            root="/support"
            onNavigate={() => setActiveSection("support")}
          />
        </>
      ) : null}

      {showStockNav ? (
        <>
          <NavSectionLabel className="mt-3">Stock</NavSectionLabel>
          <NavLinks
            items={stockNavItems}
            root="/stock"
            onNavigate={() => setActiveSection("stock")}
          />
        </>
      ) : null}

      {showCoordinationNav ? (
        <>
          <NavSectionLabel className="mt-3">Coordination</NavSectionLabel>
          <NavLinks
            items={coordinationNavItems}
            root="/coordination"
            onNavigate={() => setActiveSection("coordination")}
          />
        </>
      ) : null}

      {showWirelessNav ? (
        <>
          <NavSectionLabel className="mt-3">Wireless</NavSectionLabel>
          <NavLinks
            items={wirelessNavItems}
            root="/wireless"
            onNavigate={() => setActiveSection("wireless")}
          />
        </>
      ) : null}

      {activePlaceholder ? (
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

function DepartmentLinks({
  variant,
  label,
  items,
  root,
  badgeHref,
  badgeCount,
  mobileLabelFn,
}: {
  variant: "sidebar" | "mobile";
  label: string;
  items: NavItem[];
  root: string;
  badgeHref?: string;
  badgeCount?: number;
  mobileLabelFn?: (item: NavItem) => string;
}) {
  if (variant === "mobile") {
    return (
      <MobileNavShell>
        <MobileLinks items={items} root={root} labelFn={mobileLabelFn} />
      </MobileNavShell>
    );
  }
  return (
    <SidebarShell>
      <NavSectionLabel>{label}</NavSectionLabel>
      <NavLinks items={items} root={root} badgeHref={badgeHref} badgeCount={badgeCount} />
    </SidebarShell>
  );
}

function PlaceholderNav({
  variant,
  department,
}: {
  variant: "sidebar" | "mobile";
  department: PlaceholderDepartment;
}) {
  const pathname = usePathname();
  const href = `/${department}`;
  const label = getDepartmentLabel(department);
  const active = pathname === href || pathname.startsWith(`${href}/`);

  if (variant === "mobile") {
    return (
      <MobileNavShell>
        <Link href={href} className={mobileNavItemClass(active)}>
          {label}
        </Link>
      </MobileNavShell>
    );
  }

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

/** Single nav entry for all department shells (sidebar or bottom mobile). */
export function DashboardNav({ variant }: { variant: "sidebar" | "mobile" }) {
  const { isOwner, isAdmin, currentUser } = useAuth();
  const { leads } = useCrmStore();

  if (!currentUser) return null;

  if (isOwner) return <OwnerNav variant={variant} />;

  if (canAccessSupport(currentUser) && currentUser.department === "support") {
    return (
      <DepartmentLinks
        variant={variant}
        label="Support"
        items={supportNavItems}
        root="/support"
        mobileLabelFn={(item) => item.label.split(" ")[0]}
      />
    );
  }

  if (canAccessStock(currentUser) && currentUser.department === "stock") {
    return (
      <DepartmentLinks
        variant={variant}
        label="Stock"
        items={stockNavItems}
        root="/stock"
        mobileLabelFn={(item) =>
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
                    : item.label
        }
      />
    );
  }

  if (canAccessCoordination(currentUser) && currentUser.department === "coordination") {
    return (
      <DepartmentLinks
        variant={variant}
        label="Coordination"
        items={coordinationNavItems}
        root="/coordination"
        mobileLabelFn={(item) => item.short ?? item.label}
      />
    );
  }

  if (canAccessWireless(currentUser) && currentUser.department === "wireless") {
    return (
      <DepartmentLinks
        variant={variant}
        label="Wireless"
        items={wirelessNavItems}
        root="/wireless"
      />
    );
  }

  if (isPlaceholderDepartment(currentUser.department)) {
    return (
      <PlaceholderNav
        variant={variant}
        department={currentUser.department as PlaceholderDepartment}
      />
    );
  }

  const salesItems = isAdmin ? salesManagerNavItems : salesStaffNavItems;
  const unassignedCount = isAdmin ? leads.filter(isInLeadInbox).length : 0;
  const mobileItems = salesItems.slice(0, 5);

  if (variant === "mobile") {
    return (
      <MobileNavShell>
        <MobileLinks
          items={mobileItems}
          root="/dashboard"
          labelFn={(item) => item.label.split(" ")[0]}
        />
      </MobileNavShell>
    );
  }

  return (
    <DepartmentLinks
      variant="sidebar"
      label="Sales"
      items={salesItems}
      root="/dashboard"
      badgeHref="/inbox"
      badgeCount={unassignedCount}
    />
  );
}
