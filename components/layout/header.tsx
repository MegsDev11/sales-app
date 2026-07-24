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
    <header className="flex h-12 items-center justify-between border-b border-sidebar-border bg-sidebar px-3 print:hidden lg:px-4">
      <Link href={homeHref} className="flex items-center gap-2.5">
        <Image
          src="/megs-logo.png"
          alt="MEGS"
          width={120}
          height={40}
          className="h-8 w-auto object-contain"
          priority
        />
        <span className="hidden border-l border-border pl-2.5 text-xs font-medium text-muted-foreground sm:inline">
          Operations
        </span>
      </Link>

      <div className="flex items-center gap-1.5">
        <NotificationsPanel />
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium leading-tight">{currentUser.name}</p>
          <p className="text-[11px] text-muted-foreground">{currentUser.title}</p>
        </div>
        <Avatar
          className="h-8 w-8"
          style={{ boxShadow: `0 0 0 2px ${currentUser.color}` }}
        >
          <AvatarFallback
            className="text-[10px] font-semibold text-white"
            style={{ backgroundColor: currentUser.color }}
          >
            {currentUser.avatarInitials}
          </AvatarFallback>
        </Avatar>
        {badge ? (
          <Badge className="hidden bg-primary hover:bg-primary sm:inline-flex">{badge}</Badge>
        ) : null}
        {!badge && isAdmin ? (
          <Badge className="hidden bg-primary hover:bg-primary sm:inline-flex">
            Sales Manager
          </Badge>
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => void logout()}
          title="Logout"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
