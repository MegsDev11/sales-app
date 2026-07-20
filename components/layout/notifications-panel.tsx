"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useCrmStore } from "@/lib/store/crm-store";
import { getNotifications } from "@/lib/utils/leads";
import { canAccessCoordination, canAccessStock, canAccessSalesAdmin } from "@/lib/permissions";
import type { AppNotification } from "@/lib/types";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function NotificationsPanel() {
  const { currentUser, isAdmin, accessToken } = useAuth();
  const { leads } = useCrmStore();
  const [appNotes, setAppNotes] = useState<AppNotification[]>([]);

  const loadAppNotes = useCallback(async () => {
    if (!accessToken || !currentUser) {
      setAppNotes([]);
      return;
    }
    const showApp =
      canAccessStock(currentUser) ||
      canAccessCoordination(currentUser) ||
      canAccessSalesAdmin(currentUser);
    if (!showApp && currentUser.role !== "owner") {
      setAppNotes([]);
      return;
    }
    try {
      const res = await fetch("/api/notifications", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      if (!res.ok) return;
      const body = await res.json();
      setAppNotes(body.notifications ?? []);
    } catch {
      /* ignore */
    }
  }, [accessToken, currentUser]);

  useEffect(() => {
    void loadAppNotes();
    const id = setInterval(() => void loadAppNotes(), 30000);
    return () => clearInterval(id);
  }, [loadAppNotes]);

  if (!currentUser) return null;

  const showLeadNotes = canAccessSalesAdmin(currentUser) || currentUser.department === "sales";
  const { overdueFollowUps, dueToday, stuckLeads, unassigned } = showLeadNotes
    ? getNotifications(leads, [], currentUser.id, isAdmin)
    : { overdueFollowUps: [], dueToday: [], stuckLeads: [], unassigned: [] };

  const leadTotal =
    overdueFollowUps.length + dueToday.length + stuckLeads.length + unassigned.length;
  const total = leadTotal + appNotes.length;

  async function markRead(id: string) {
    if (!accessToken) return;
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id }),
    });
    setAppNotes((prev) => prev.filter((n) => n.id !== id));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "relative")}
      >
        <Bell className="h-4 w-4" />
        {total > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#C83733] text-[10px] font-bold text-white">
            {total > 9 ? "9+" : total}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Notifications</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {total === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">All caught up!</p>
          ) : (
            <>
              {appNotes.map((n) => (
                <DropdownMenuItem key={n.id} onClick={() => void markRead(n.id)}>
                  <Link href={n.link || "#"} className="w-full">
                    <span className="block font-medium">{n.title}</span>
                    {n.body ? (
                      <span className="block text-xs text-muted-foreground">{n.body}</span>
                    ) : null}
                  </Link>
                </DropdownMenuItem>
              ))}
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
              {isAdmin &&
                unassigned.map((l) => (
                  <DropdownMenuItem key={`un-${l.id}`}>
                    <Link href="/inbox" className="w-full">
                      Unassigned: {l.clientName}
                    </Link>
                  </DropdownMenuItem>
                ))}
            </>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
