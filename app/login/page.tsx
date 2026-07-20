"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useCrmStore } from "@/lib/store/crm-store";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Shield, UserCircle } from "lucide-react";
import type { User } from "@/lib/types";

export default function LoginPage() {
  const { users } = useCrmStore();
  const { login, currentUser, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && currentUser) {
      router.replace("/dashboard");
    }
  }, [currentUser, isLoading, router]);

  const admins = users.filter((u) => u.role === "admin");
  const salesReps = users.filter((u) => u.role === "sales");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-4">
      <div className="mb-8 text-center">
        <Image
          src="/megs-logo.png"
          alt="MEGS"
          width={220}
          height={80}
          className="mx-auto mb-4 h-16 w-auto object-contain"
          priority
        />
        <h1 className="text-2xl font-bold text-black">Sales CRM</h1>
        <p className="mt-1 text-muted-foreground">
          Select your account to continue
        </p>
      </div>

      <div className="w-full max-w-2xl space-y-6">
        {users.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-6 text-center">
              <p className="font-medium text-gray-900">No team members yet</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Add your first team member in Supabase (Table Editor → team_members)
                or ask your administrator to set up accounts.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Shield className="h-4 w-4 text-[#C83733]" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Sales Manager
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {admins.map((user) => (
              <UserCard key={user.id} user={user} onSelect={login} />
            ))}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center gap-2">
            <UserCircle className="h-4 w-4 text-gray-500" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Sales Team
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {salesReps.map((user) => (
              <UserCard key={user.id} user={user} onSelect={login} />
            ))}
          </div>
        </section>
          </>
        )}
      </div>

      <p className="mt-8 text-xs text-muted-foreground">
        Select your account to sign in
      </p>
    </div>
  );
}

function UserCard({
  user,
  onSelect,
}: {
  user: User;
  onSelect: (id: string) => void;
}) {
  return (
    <Card
      className="cursor-pointer transition-all hover:shadow-md hover:ring-2"
      style={{ ["--tw-ring-color" as string]: user.color }}
      onClick={() => onSelect(user.id)}
    >
      <CardContent className="flex items-center gap-4 p-4">
        <Avatar
          className="h-12 w-12"
          style={{ boxShadow: `0 0 0 2px ${user.color}` }}
        >
          <AvatarFallback
            className="font-semibold text-white"
            style={{ backgroundColor: user.color }}
          >
            {user.avatarInitials}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <p className="font-semibold">{user.name}</p>
          <p className="text-sm text-muted-foreground">{user.title}</p>
        </div>
        {user.role === "admin" && (
          <Badge className="bg-[#C83733] hover:bg-[#C83733]">Admin</Badge>
        )}
      </CardContent>
    </Card>
  );
}
