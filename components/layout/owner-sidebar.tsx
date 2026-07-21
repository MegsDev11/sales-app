"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useOwnerSection } from "@/lib/department-context";
import { useCrmStore } from "@/lib/store/crm-store";
import { isInLeadInbox } from "@/lib/utils/leads";
import type { OwnerSection } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Kanban,
  Users,
  BarChart3,
  Inbox,
  MapPin,
  MessageSquare,
  Radio,
  Building2,
  Package,
  Network,
  UserCog,
  Headphones,
  ClipboardList,
  QrCode,
  ScanLine,
  Boxes,
  Truck,
  Contact,
} from "lucide-react";

const ownerSections: { id: OwnerSection; label: string; icon: typeof Building2; href: string }[] = [
  { id: "company", label: "Company", icon: Building2, href: "/company" },
  { id: "sales", label: "Sales", icon: Kanban, href: "/dashboard" },
  { id: "support", label: "Support", icon: Headphones, href: "/support" },
  { id: "stock", label: "Stock", icon: Package, href: "/stock" },
  { id: "coordination", label: "Coordination", icon: Network, href: "/coordination" },
  { id: "staff", label: "Staff Accounts", icon: UserCog, href: "/staff" },
];

const salesNavItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/board", label: "Pipeline Board", icon: Kanban },
  { href: "/inbox", label: "Lead Inbox", icon: Inbox },
  { href: "/surveys", label: "Site Surveys", icon: MapPin },
  { href: "/team", label: "Team", icon: Users },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
];

const supportNavItems = [
  { href: "/support", label: "Overview", icon: LayoutDashboard },
  { href: "/support/requests", label: "Client Requests", icon: MessageSquare },
  { href: "/support/towers", label: "Towers & Outages", icon: Radio },
  { href: "/support/clients", label: "Client Assignment", icon: Users },
];

const stockNavItems = [
  { href: "/stock", label: "Overview", icon: LayoutDashboard },
  { href: "/stock/inventory", label: "Inventory", icon: Package },
  { href: "/stock/booked-out", label: "Booked Out", icon: Truck },
  { href: "/stock/qr", label: "Generate QR", icon: QrCode },
  { href: "/stock/client-qrs", label: "Client QRs", icon: Contact },
  { href: "/stock/requests", label: "Requests", icon: ClipboardList },
  { href: "/stock/scan", label: "Scan", icon: ScanLine },
];

const coordinationNavItems = [
  { href: "/coordination", label: "Overview", icon: LayoutDashboard },
  { href: "/coordination/requests", label: "Pick lists", icon: ClipboardList },
  { href: "/coordination/technicians", label: "Technicians", icon: Users },
  { href: "/coordination/availability", label: "Availability", icon: Boxes },
];

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
  const showSalesNav = activeSection === "sales" || salesPaths.some((p) => pathname.startsWith(p));
  const showSupportNav =
    activeSection === "support" || supportPaths.some((p) => pathname.startsWith(p));
  const showStockNav =
    activeSection === "stock" || stockPaths.some((p) => pathname.startsWith(p));
  const showCoordinationNav =
    activeSection === "coordination" ||
    coordinationPaths.some((p) => pathname.startsWith(p));

  return (
    <aside className="hidden w-60 shrink-0 border-r bg-white print:hidden lg:block">
      <nav className="flex flex-col gap-1 p-4">
        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Departments
        </p>
        {ownerSections.map((section) => {
          const Icon = section.icon;
          const isActive =
            section.id === activeSection ||
            (section.id === "sales" && salesPaths.some((p) => pathname.startsWith(p))) ||
            (section.id === "support" && supportPaths.some((p) => pathname.startsWith(p))) ||
            (section.id === "stock" && stockPaths.some((p) => pathname.startsWith(p))) ||
            (section.id === "coordination" &&
              coordinationPaths.some((p) => pathname.startsWith(p)));
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => handleSectionClick(section.id, section.href)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors text-left",
                isActive ? "bg-[#C83733] text-white" : "text-gray-700 hover:bg-gray-100"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {section.label}
            </button>
          );
        })}

        {showSalesNav && (
          <>
            <p className="mb-2 mt-4 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Sales CRM
            </p>
            {salesNavItems.map((item) => {
              const isActive =
                item.href === "/dashboard"
                  ? pathname === "/dashboard"
                  : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setActiveSection("sales")}
                  className={cn(
                    "flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive ? "bg-[#C83733]/10 text-[#C83733]" : "text-gray-700 hover:bg-gray-100"
                  )}
                >
                  <span className="flex items-center gap-3">
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </span>
                  {item.href === "/inbox" && unassignedCount > 0 && (
                    <span className="rounded-full bg-[#C83733] px-1.5 text-xs font-bold text-white">
                      {unassignedCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </>
        )}

        {showSupportNav && (
          <>
            <p className="mb-2 mt-4 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
                  onClick={() => setActiveSection("support")}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive ? "bg-[#C83733]/10 text-[#C83733]" : "text-gray-700 hover:bg-gray-100"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </>
        )}

        {showStockNav && (
          <>
            <p className="mb-2 mt-4 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Stock
            </p>
            {stockNavItems.map((item) => {
              const isActive =
                item.href === "/stock" ? pathname === "/stock" : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setActiveSection("stock")}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive ? "bg-[#C83733]/10 text-[#C83733]" : "text-gray-700 hover:bg-gray-100"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </>
        )}

        {showCoordinationNav && (
          <>
            <p className="mb-2 mt-4 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
                  onClick={() => setActiveSection("coordination")}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive ? "bg-[#C83733]/10 text-[#C83733]" : "text-gray-700 hover:bg-gray-100"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </>
        )}
      </nav>
    </aside>
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
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t bg-white lg:hidden">
      {items.map((item) => {
        const isActive = pathname.startsWith(item.href);
        return (
          <button
            key={item.href}
            type="button"
            onClick={() => {
              setActiveSection(item.section);
              router.push(item.href);
            }}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-2 text-xs",
              isActive ? "text-[#C83733]" : "text-gray-500"
            )}
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
