"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useCrmStore } from "@/lib/store/crm-store";
import { UserFormDialog } from "@/components/team/user-form-dialog";
import { getDepartmentLabel } from "@/lib/permissions";
import type { User } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { UserPlus, Pencil } from "lucide-react";

export default function StaffPage() {
  const { isOwner, canCreateAccounts } = useAuth();
  const router = useRouter();
  const { users } = useCrmStore();
  const [editUser, setEditUser] = useState<User | undefined>();
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    if (!isOwner) router.replace("/dashboard");
  }, [isOwner, router]);

  if (!isOwner) return null;

  const staffUsers = users.filter((u) => u.role !== "owner");

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Staff Accounts</h1>
          <p className="text-sm text-muted-foreground">
            Create and manage login accounts — owner only
          </p>
        </div>
        {canCreateAccounts && (
          <Button
            className="bg-[#C83733] hover:bg-[#a82f2b]"
            onClick={() => setShowAdd(true)}
          >
            <UserPlus className="mr-1 h-4 w-4" />
            Create Account
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {staffUsers.map((user) => (
          <Card key={user.id} className="bg-white">
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <Avatar style={{ boxShadow: `0 0 0 2px ${user.color}` }}>
                  <AvatarFallback
                    className="font-semibold text-white"
                    style={{ backgroundColor: user.color }}
                  >
                    {user.avatarInitials}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <CardTitle className="text-base">{user.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">{user.email || "No email"}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Badge variant="outline" className="text-xs capitalize">
                      {user.role}
                    </Badge>
                    {user.department && (
                      <Badge variant="outline" className="text-xs">
                        {getDepartmentLabel(user.department)}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setEditUser(user)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{user.title}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {staffUsers.length === 0 && (
        <Card className="bg-white">
          <CardContent className="py-10 text-center text-muted-foreground">
            No staff accounts yet. Create your first manager or staff member.
          </CardContent>
        </Card>
      )}

      <UserFormDialog
        open={!!editUser || showAdd}
        onOpenChange={(open) => {
          if (!open) {
            setEditUser(undefined);
            setShowAdd(false);
          }
        }}
        user={showAdd ? undefined : editUser}
      />
    </div>
  );
}
