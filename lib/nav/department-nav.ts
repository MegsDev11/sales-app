import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  BarChart3,
  Bot,
  Boxes,
  Briefcase,
  Building2,
  Calculator,
  CalendarOff,
  Car,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Contact,
  FolderKanban,
  Inbox,
  Kanban,
  LayoutDashboard,
  Map,
  MapPin,
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
  { href: "/board", label: "Sales Tracker", icon: Kanban },
  { href: "/inbox", label: "Lead Inbox", icon: Inbox },
  { href: "/surveys", label: "Site Surveys", icon: MapPin },
  { href: "/team", label: "Team", icon: Users },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  // Manager-only by construction: this list is not used for users below `manage`,
  // who get salesStaffNavItems instead. Commission is pay data.
  { href: "/commission", label: "Commission", icon: Calculator, short: "Comm" },
  // New-business enquiries the website assistant took after hours.
  { href: "/sales/chatbot", label: "Chatbot", icon: Bot, short: "Bot" },
  { href: "/sales/projects", label: "Projects", icon: FolderKanban, short: "Proj" },
];

export const salesStaffNavItems: NavItem[] = [
  { href: "/board", label: "Sales Tracker", icon: Kanban },
  { href: "/surveys", label: "Site Surveys", icon: MapPin },
  { href: "/my-stats", label: "My Stats", icon: TrendingUp },
  { href: "/sales/projects", label: "Projects", icon: FolderKanban, short: "Proj" },
];

export const supportNavItems: NavItem[] = [
  { href: "/support", label: "Overview", icon: LayoutDashboard },
  { href: "/support/messages", label: "Messages", icon: MessagesSquare },
  // Requests arriving from client installation QR codes — not chat threads.
  { href: "/support/requests", label: "QR Requests", icon: ClipboardList, short: "QR" },
  { href: "/support/towers", label: "Towers & Outages", icon: Radio },
  { href: "/support/clients", label: "Client Assignment", icon: Users },
  // Connectivity and general enquiries the website assistant could not close itself.
  { href: "/support/chatbot", label: "Chatbot", icon: Bot },
  { href: "/support/projects", label: "Projects", icon: FolderKanban, short: "Proj" },
];

export const stockNavItems: NavItem[] = [
  { href: "/stock", label: "Overview", icon: LayoutDashboard, stockOnly: true },
  { href: "/stock/inventory", label: "Inventory", icon: Package, stockOnly: true },
  { href: "/stock/booked-out", label: "Booked Out", icon: Truck, stockOnly: true },
  { href: "/stock/qr", label: "Stock QR", icon: QrCode, stockOnly: true },
  { href: "/stock/vehicles", label: "Vehicle QRs", icon: Car, stockOnly: true },
  { href: "/stock/client-qrs", label: "Client QRs", icon: Contact, stockOnly: true },
  { href: "/stock/requests", label: "Requests", icon: ClipboardList, stockOnly: false },
  { href: "/stock/scan", label: "Scan", icon: ScanLine, stockOnly: true },
  { href: "/stock/projects", label: "Projects", icon: FolderKanban, short: "Proj", stockOnly: false },
];

export const financialNavItems: NavItem[] = [
  { href: "/financial", label: "Overview", icon: LayoutDashboard },
  { href: "/financial/payments", label: "Payments in", icon: Banknote, short: "Pay" },
  { href: "/financial/fuel", label: "Fuel", icon: Truck },
  // Billing enquiries the assistant escalated — arrangements, disputes, credits.
  { href: "/financial/chatbot", label: "Chatbot", icon: Bot },
  { href: "/financial/projects", label: "Projects", icon: FolderKanban, short: "Proj" },
];

/**
 * AI Agents is a management tool, not a department, so it follows Administration's
 * pattern: one sidebar entry, sections as in-page tabs.
 */
export const aiNavItems: NavItem[] = [
  { href: "/ai", label: "AI Agents", icon: Bot },
];

export const coordinationNavItems: NavItem[] = [
  { href: "/coordination", label: "Overview", icon: LayoutDashboard, short: "Home" },
  { href: "/coordination/jobs", label: "Jobs", icon: Briefcase, short: "Jobs" },
  { href: "/coordination/job-cards", label: "Job cards", icon: ClipboardCheck, short: "Cards" },
  { href: "/coordination/timesheets", label: "Timesheets", icon: Clock, short: "Time" },
  { href: "/coordination/time-off", label: "Time off", icon: CalendarOff, short: "Leave" },
  { href: "/coordination/requests", label: "Pick lists", icon: ClipboardList, short: "Lists" },
  { href: "/coordination/technicians", label: "Technicians", icon: Users, short: "Techs" },
  { href: "/coordination/availability", label: "Availability", icon: Boxes, short: "Stock" },
  { href: "/coordination/projects", label: "Projects", icon: FolderKanban, short: "Proj" },
];

export const wirelessNavItems: NavItem[] = [
  { href: "/wireless", label: "Overview", icon: LayoutDashboard },
  { href: "/wireless/submissions", label: "Submissions", icon: Inbox },
  { href: "/wireless/layouts", label: "Layouts", icon: Map },
  { href: "/wireless/clients", label: "Clients", icon: Building2 },
  { href: "/wireless/projects", label: "Projects", icon: FolderKanban, short: "Proj" },
];

/** Exact match for department roots; nested match for children. */
export function isNavActive(pathname: string, href: string, root: string) {
  return href === root ? pathname === root : pathname.startsWith(href);
}
