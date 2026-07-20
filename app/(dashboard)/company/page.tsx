"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useCrmStore } from "@/lib/store/crm-store";
import { StatCard } from "@/components/stats/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import {
  getDepartmentManagers,
  getDepartmentStaff,
  getSalesStaff,
} from "@/lib/permissions";
import { isActiveLead, isInLeadInbox, isLeadVisible } from "@/lib/utils/leads";
import { Building2, Kanban, Package, Network, Users, Target } from "lucide-react";

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
  const coordManager = getDepartmentManagers(users, "coordination")[0];
  const activeSalesLeads = leads.filter(
    (l) => isLeadVisible(l) && isActiveLead(l)
  );
  const unassigned = activeSalesLeads.filter(isInLeadInbox);

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
      id: "stock",
      label: "Stock",
      icon: Package,
      href: "/stock",
      manager: stockManager?.name ?? "Not assigned",
      staffCount: getDepartmentStaff(users, "stock").length,
      stat: "Module coming soon",
    },
    {
      id: "coordination",
      label: "Coordination",
      icon: Network,
      href: "/coordination",
      manager: coordManager?.name ?? "Not assigned",
      staffCount: getDepartmentStaff(users, "coordination").length,
      stat: "Module coming soon",
    },
  ];

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-bold">Company Overview</h1>
        <p className="text-sm text-muted-foreground">
          Megs Waterberg — all departments at a glance
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Staff" value={users.filter((u) => u.role !== "owner").length} icon={Users} accent="#C83733" />
        <StatCard title="Sales Active Leads" value={activeSalesLeads.length} icon={Target} accent="#C83733" />
        <StatCard title="Unassigned Leads" value={unassigned.length} icon={Building2} />
        <StatCard title="Departments" value={3} icon={Building2} accent="#6366F1" />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {departments.map((dept) => {
          const Icon = dept.icon;
          return (
            <Card key={dept.id} className="bg-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Icon className="h-4 w-4 text-[#C83733]" />
                  {dept.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p><span className="text-muted-foreground">Manager:</span> {dept.manager}</p>
                <p><span className="text-muted-foreground">Staff:</span> {dept.staffCount}</p>
                <p className="text-muted-foreground">{dept.stat}</p>
                <Link
                  href={dept.href}
                  className={buttonVariants({ variant: "outline", size: "sm", className: "mt-2 inline-flex" })}
                >
                  View {dept.label}
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="bg-white">
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Link href="/staff" className={buttonVariants({ className: "bg-[#C83733] hover:bg-[#a82f2b] text-white" })}>
            Manage Staff Accounts
          </Link>
          <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>
            Sales Command Center
          </Link>
          <Link href="/inbox" className={buttonVariants({ variant: "outline" })}>
            Lead Inbox
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
