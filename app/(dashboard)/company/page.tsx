"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useCrmStore } from "@/lib/store/crm-store";
import { StatCard } from "@/components/stats/stat-card";
import {
  AlertBanner,
  PageHeader,
  PageShell,
  Panel,
} from "@/components/layout/page-shell";
import { buttonVariants } from "@/components/ui/button";
import {
  getDepartmentManagers,
  getDepartmentStaff,
  getSalesStaff,
  PLACEHOLDER_DEPARTMENTS,
  getDepartmentLabel,
} from "@/lib/permissions";
import { isActiveLead, isInLeadInbox, isLeadVisible } from "@/lib/utils/leads";
import {
  Building2,
  Kanban,
  Package,
  Network,
  Users,
  Target,
  Headphones,
  Wifi,
  Cable,
  Wallet,
  Briefcase,
  BookUser,
  ConciergeBell,
} from "lucide-react";

export default function CompanyPage() {
  const { isOwner } = useAuth();
  const router = useRouter();
  const { users, leads } = useCrmStore();

  useEffect(() => {
    if (!isOwner) router.replace("/dashboard");
  }, [isOwner, router]);

  if (!isOwner) return null;

  const salesStaff = getSalesStaff(users);
  const salesManager = getDepartmentManagers(users, "sales")[0];
  const stockManager = getDepartmentManagers(users, "stock")[0];
  const supportManager = getDepartmentManagers(users, "support")[0];
  const activeSalesLeads = leads.filter(
    (l) => isLeadVisible(l) && isActiveLead(l)
  );
  const unassigned = activeSalesLeads.filter(isInLeadInbox);

  const placeholderMeta: Record<
    (typeof PLACEHOLDER_DEPARTMENTS)[number],
    { icon: typeof Wifi; stat: string }
  > = {
    fiber: { icon: Cable, stat: "Fiber operations" },
    financial: { icon: Wallet, stat: "Financial management" },
    general: { icon: Briefcase, stat: "General management" },
    accounts: { icon: BookUser, stat: "Clients & packages" },
    reception: { icon: ConciergeBell, stat: "Walk-in clients" },
  };

  const departments = [
    {
      id: "sales",
      label: "Sales",
      icon: Kanban,
      href: "/dashboard",
      manager: salesManager?.name ?? "Not assigned",
      staffCount: salesStaff.length,
      stat: `${activeSalesLeads.length} active leads`,
    },
    {
      id: "support",
      label: "Support",
      icon: Headphones,
      href: "/support",
      manager: supportManager?.name ?? "Not assigned",
      staffCount: getDepartmentStaff(users, "support").length,
      stat: "Tower & outage management",
    },
    {
      id: "stock",
      label: "Stock",
      icon: Package,
      href: "/stock",
      manager: stockManager?.name ?? "Not assigned",
      staffCount: getDepartmentStaff(users, "stock").length,
      stat: "Inventory & QR booking",
    },
    {
      id: "coordination",
      label: "Coordination",
      icon: Network,
      href: "/coordination",
      manager: getDepartmentManagers(users, "coordination")[0]?.name ?? "Not assigned",
      staffCount: getDepartmentStaff(users, "coordination").length,
      stat: "Pick lists & techs",
    },
    {
      id: "wireless",
      label: "Wireless",
      icon: Wifi,
      href: "/wireless",
      manager: getDepartmentManagers(users, "wireless")[0]?.name ?? "Not assigned",
      staffCount: getDepartmentStaff(users, "wireless").length,
      stat: "Network layouts & Ruijie",
    },
    ...PLACEHOLDER_DEPARTMENTS.map((dept) => ({
      id: dept,
      label: getDepartmentLabel(dept),
      icon: placeholderMeta[dept].icon,
      href: `/${dept}`,
      manager: getDepartmentManagers(users, dept)[0]?.name ?? "Not assigned",
      staffCount: getDepartmentStaff(users, dept).length,
      stat: placeholderMeta[dept].stat,
    })),
  ];

  return (
    <PageShell>
      <PageHeader
        title="Company Overview"
        description="Megs Waterberg — all departments at a glance"
        actions={
          <Link
            href="/staff"
            className={buttonVariants({ className: "bg-primary text-primary-foreground hover:bg-primary/90" })}
          >
            Manage staff
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Staff"
          value={users.filter((u) => u.role !== "owner").length}
          icon={Users}
          accent="var(--primary)"
        />
        <StatCard
          title="Sales Active Leads"
          value={activeSalesLeads.length}
          icon={Target}
          accent="var(--primary)"
        />
        <StatCard title="Unassigned Leads" value={unassigned.length} icon={Building2} />
        <StatCard title="Departments" value={departments.length} icon={Building2} />
      </div>

      {unassigned.length > 0 ? (
        <AlertBanner tone="warn">
          <span>
            {unassigned.length} lead{unassigned.length === 1 ? "" : "s"} waiting in the{" "}
            <Link href="/inbox" className="font-medium underline">
              Lead Inbox
            </Link>
            .
          </span>
        </AlertBanner>
      ) : null}

      <Panel title="Departments" description="Managers, headcount, and shortcuts" padded={false}>
        <div className="divide-y divide-border">
          {departments.map((dept) => {
            const Icon = dept.icon;
            return (
              <div
                key={dept.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="font-medium">{dept.label}</p>
                    <p className="text-xs text-muted-foreground">
                      Manager: {dept.manager} · Staff: {dept.staffCount}
                    </p>
                    <p className="text-xs text-muted-foreground">{dept.stat}</p>
                  </div>
                </div>
                <Link
                  href={dept.href}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Open
                </Link>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="Quick actions">
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>
            Sales command center
          </Link>
          <Link href="/inbox" className={buttonVariants({ variant: "outline" })}>
            Lead inbox
          </Link>
          <Link href="/board" className={buttonVariants({ variant: "outline" })}>
            Pipeline board
          </Link>
        </div>
      </Panel>
    </PageShell>
  );
}
