import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Boxes,
  Briefcase,
  Building2,
  CalendarOff,
  ClipboardList,
  Clock,
  Contact,
  Inbox,
  Kanban,
  LayoutDashboard,
  Map,
  MapPin,
  MessageSquare,
  MessagesSquare,
  Package,
  QrCode,
  Radio,
  ScanLine,
  TrendingUp,
  Truck,
  Users,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  short?: string;
  /** Stock sidebar: hide from non-stock users who only need pick lists */
  stockOnly?: boolean;
};

export const salesManagerNavItems: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/board", label: "Pipeline Board", icon: Kanban },
  { href: "/inbox", label: "Lead Inbox", icon: Inbox },
  { href: "/surveys", label: "Site Surveys", icon: MapPin },
  { href: "/team", label: "Team", icon: Users },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
];

export const salesStaffNavItems: NavItem[] = [
  { href: "/board", label: "Pipeline Board", icon: Kanban },
  { href: "/surveys", label: "Site Surveys", icon: MapPin },
  { href: "/my-stats", label: "My Stats", icon: TrendingUp },
];

export const supportNavItems: NavItem[] = [
  { href: "/support", label: "Overview", icon: LayoutDashboard },
  { href: "/support/messages", label: "Messages", icon: MessagesSquare },
  { href: "/support/requests", label: "Client Requests", icon: MessageSquare },
  { href: "/support/towers", label: "Towers & Outages", icon: Radio },
  { href: "/support/clients", label: "Client Assignment", icon: Users },
];

export const stockNavItems: NavItem[] = [
  { href: "/stock", label: "Overview", icon: LayoutDashboard, stockOnly: true },
  { href: "/stock/inventory", label: "Inventory", icon: Package, stockOnly: true },
  { href: "/stock/booked-out", label: "Booked Out", icon: Truck, stockOnly: true },
  { href: "/stock/qr", label: "Generate QR", icon: QrCode, stockOnly: true },
  { href: "/stock/client-qrs", label: "Client QRs", icon: Contact, stockOnly: true },
  { href: "/stock/requests", label: "Requests", icon: ClipboardList, stockOnly: false },
  { href: "/stock/scan", label: "Scan", icon: ScanLine, stockOnly: true },
];

export const coordinationNavItems: NavItem[] = [
  { href: "/coordination", label: "Overview", icon: LayoutDashboard, short: "Home" },
  { href: "/coordination/jobs", label: "Jobs", icon: Briefcase, short: "Jobs" },
  { href: "/coordination/timesheets", label: "Timesheets", icon: Clock, short: "Time" },
  { href: "/coordination/time-off", label: "Time off", icon: CalendarOff, short: "Leave" },
  { href: "/coordination/requests", label: "Pick lists", icon: ClipboardList, short: "Lists" },
  { href: "/coordination/technicians", label: "Technicians", icon: Users, short: "Techs" },
  { href: "/coordination/availability", label: "Availability", icon: Boxes, short: "Stock" },
];

export const wirelessNavItems: NavItem[] = [
  { href: "/wireless", label: "Overview", icon: LayoutDashboard },
  { href: "/wireless/submissions", label: "Submissions", icon: Inbox },
  { href: "/wireless/layouts", label: "Layouts", icon: Map },
  { href: "/wireless/clients", label: "Clients", icon: Building2 },
];

/** Exact match for department roots; nested match for children. */
export function isNavActive(pathname: string, href: string, root: string) {
  return href === root ? pathname === root : pathname.startsWith(href);
}
