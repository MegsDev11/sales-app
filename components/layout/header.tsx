"use client";

import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { getUserBadgeLabel } from "@/lib/permissions";
import { NotificationsPanel } from "@/components/layout/notifications-panel";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LogOut } from "lucide-react";

export function Header() {
  const { currentUser, logout, isOwner, isAdmin } = useAuth();

  if (!currentUser) return null;

  const badge = getUserBadgeLabel(currentUser);
  const homeHref = isOwner ? "/company" : "/dashboard";

  return (
    <header className="flex h-16 items-center justify-between border-b bg-white px-4 print:hidden lg:px-6">
      <Link href={homeHref} className="flex items-center gap-3">
        <Image src="/megs-logo.png" alt="MEGS" width={140} height={48} className="h-10 w-auto object-contain" priority />
      </Link>

      <div className="flex items-center gap-2">
        <NotificationsPanel />
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium">{currentUser.name}</p>
          <p className="text-xs text-muted-foreground">{currentUser.title}</p>
        </div>
        <Avatar className="h-9 w-9" style={{ boxShadow: `0 0 0 2px ${currentUser.color}` }}>
          <AvatarFallback className="text-xs font-semibold text-white" style={{ backgroundColor: currentUser.color }}>
            {currentUser.avatarInitials}
          </AvatarFallback>
        </Avatar>
        {badge && (
          <Badge className="hidden bg-[#C83733] hover:bg-[#C83733] sm:inline-flex">{badge}</Badge>
        )}
        {!badge && isAdmin && (
          <Badge className="hidden bg-[#C83733] hover:bg-[#C83733] sm:inline-flex">Sales Manager</Badge>
        )}
        <Button variant="ghost" size="icon" onClick={() => void logout()} title="Logout">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
