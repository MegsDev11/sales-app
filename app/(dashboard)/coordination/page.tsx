"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useCrmStore } from "@/lib/store/crm-store";
import { getDepartmentManagers, getDepartmentStaff } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Network } from "lucide-react";

export default function CoordinationPage() {
  const { isOwner } = useAuth();
  const router = useRouter();
  const { users } = useCrmStore();

  useEffect(() => {
    if (!isOwner) router.replace("/dashboard");
  }, [isOwner, router]);

  if (!isOwner) return null;

  const manager = getDepartmentManagers(users, "coordination")[0];
  const staff = getDepartmentStaff(users, "coordination");

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-bold">Coordination Department</h1>
        <p className="text-sm text-muted-foreground">Operations and coordination — coming soon</p>
      </div>

      <Card className="bg-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="h-5 w-5 text-[#C83733]" />
            Coordination Module
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            The coordination dashboard will be built in a future update. Create coordination
            manager and staff accounts from Staff Accounts to prepare your team.
          </p>
          <div className="rounded-lg bg-muted/50 p-4">
            <p><strong>Manager:</strong> {manager?.name ?? "Not assigned"}</p>
            <p className="mt-1"><strong>Staff:</strong> {staff.length} member{staff.length !== 1 ? "s" : ""}</p>
            {staff.length > 0 && (
              <ul className="mt-2 list-inside list-disc text-muted-foreground">
                {staff.map((s) => (
                  <li key={s.id}>{s.name}</li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
