"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useCrmStore } from "@/lib/store/crm-store";
import { getNotifications } from "@/lib/utils/leads";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function NotificationsPanel() {
  const { currentUser, isAdmin } = useAuth();
  const { leads } = useCrmStore();

  if (!currentUser) return null;

  const { overdueFollowUps, dueToday, stuckLeads, unassigned } = getNotifications(
    leads,
    [],
    currentUser.id,
    isAdmin
  );

  const total = overdueFollowUps.length + dueToday.length + stuckLeads.length + unassigned.length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {total > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#C83733] text-[10px] font-bold text-white">
              {total > 9 ? "9+" : total}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {total === 0 ? (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">All caught up!</p>
        ) : (
          <>
            {dueToday.map((l) => (
              <DropdownMenuItem key={`due-${l.id}`}>
                <Link href={`/leads/${l.id}`} className="w-full">
                  Due today: {l.clientName}
                </Link>
              </DropdownMenuItem>
            ))}
            {overdueFollowUps.map((l) => (
              <DropdownMenuItem key={`over-${l.id}`}>
                <Link href={`/leads/${l.id}`} className="w-full text-destructive">
                  Overdue: {l.clientName}
                </Link>
              </DropdownMenuItem>
            ))}
            {stuckLeads.slice(0, 5).map((l) => (
              <DropdownMenuItem key={`stuck-${l.id}`}>
                <Link href={`/leads/${l.id}`} className="w-full">
                  Stuck: {l.clientName}
                </Link>
              </DropdownMenuItem>
            ))}
            {isAdmin && unassigned.map((l) => (
              <DropdownMenuItem key={`un-${l.id}`}>
                <Link href="/inbox" className="w-full">
                  Unassigned: {l.clientName}
                </Link>
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
