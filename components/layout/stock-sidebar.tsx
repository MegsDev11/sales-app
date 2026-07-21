"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ClipboardList, LayoutDashboard, Package, QrCode, ScanLine, Truck } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { canAccessStock } from "@/lib/permissions";

const stockNavItems = [
  { href: "/stock", label: "Overview", icon: LayoutDashboard, stockOnly: true },
  { href: "/stock/inventory", label: "Inventory", icon: Package, stockOnly: true },
  { href: "/stock/booked-out", label: "Booked Out", icon: Truck, stockOnly: true },
  { href: "/stock/qr", label: "Generate QR", icon: QrCode, stockOnly: true },
  { href: "/stock/requests", label: "Requests", icon: ClipboardList, stockOnly: false },
  { href: "/stock/scan", label: "Scan", icon: ScanLine, stockOnly: true },
];

export function StockSidebar() {
  const pathname = usePathname();
  const { currentUser } = useAuth();
  const isStockUser = canAccessStock(currentUser);

  const items = stockNavItems.filter((item) => isStockUser || !item.stockOnly);

  return (
    <aside className="hidden w-60 shrink-0 border-r bg-white print:hidden lg:block">
      <nav className="flex flex-col gap-1 p-4">
        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Stock
        </p>
        {items.map((item) => {
          const isActive =
            item.href === "/stock"
              ? pathname === "/stock"
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

export function StockMobileNav() {
  const pathname = usePathname();
  const { currentUser } = useAuth();
  const isStockUser = canAccessStock(currentUser);
  const items = stockNavItems.filter((item) => isStockUser || !item.stockOnly);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t bg-white print:hidden lg:hidden">
      {items.map((item) => {
        const isActive =
          item.href === "/stock" ? pathname === "/stock" : pathname.startsWith(item.href);
        const short =
          item.href === "/stock/qr"
            ? "QR"
            : item.href === "/stock/inventory"
              ? "Stock"
              : item.href === "/stock/booked-out"
                ? "Out"
              : item.href === "/stock/requests"
                ? "Tech Stock List"
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
