"use client";

import Link from "next/link";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { AlertCircle, Calendar, Inbox, MoreHorizontal, Phone, Mail, Trash2 } from "lucide-react";
import { ServiceTypeBadge } from "@/components/leads/service-type-badge";
import { CoverageBadge } from "@/components/leads/coverage-badge";
import { ActivityIcon } from "@/components/leads/activity-timeline";
import { ACTIVITY_LABELS, TEMPERATURE_LABELS } from "@/lib/constants";
import { daysInStage, isOverdue } from "@/lib/utils/time";
import { isFollowUpOverdue, isFollowUpDueToday } from "@/lib/utils/leads";
import { useCrmStore } from "@/lib/store/crm-store";
import { useAuth } from "@/lib/auth-context";
import type { Lead, User } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface LeadCardProps {
  lead: Lead;
  rep?: User;
  showRep?: boolean;
}

const tempColors = { hot: "text-red-600", warm: "text-amber-600", cold: "text-blue-500" };

export function LeadCard({ lead, rep, showRep = false }: LeadCardProps) {
  const { addActivity, returnLeadToInbox, deleteLead } = useCrmStore();
  const { isAdmin, currentUser } = useAuth();
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: lead.id });

  const canManage =
    isAdmin || (currentUser?.id != null && lead.assignedToId === currentUser.id);

  const style = {
    transform: CSS.Translate.toString(transform),
    borderLeftColor: rep?.color ?? "#ccc",
  };

  const days = daysInStage(lead);
  const overdue = isOverdue(lead);
  const followUpOverdue = isFollowUpOverdue(lead);
  const followUpToday = isFollowUpDueToday(lead);
  const progress = overdue ? 100 : Math.min((days / 5) * 100, 100);

  const quickLogCall = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    addActivity(lead.id, "call", `Quick call to ${lead.clientName}`);
  };

  const sendToInbox = () => {
    if (
      !window.confirm(
        `Send “${lead.clientName}” back to the Lead Inbox? It will be unassigned.`
      )
    ) {
      return;
    }
    returnLeadToInbox(lead.id);
  };

  const removeLead = () => {
    if (
      !window.confirm(
        `Remove “${lead.clientName}” from the pipeline? You can restore it later from the lead record if needed.`
      )
    ) {
      return;
    }
    deleteLead(lead.id);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        "rounded-lg border border-l-4 bg-white p-3 shadow-sm transition-shadow hover:shadow-md",
        isDragging && "opacity-50 shadow-lg ring-2 ring-primary"
      )}
    >
      <Link href={`/leads/${lead.id}`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded bg-gray-100">
              <ActivityIcon type={lead.currentActivity} className="h-3.5 w-3.5" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight">{lead.clientName}</p>
              <p className="text-xs text-muted-foreground">
                {lead.nextAction ?? ACTIVITY_LABELS[lead.currentActivity]}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {(lead.priority === "high" || followUpOverdue) && (
              <AlertCircle className="h-4 w-4 fill-primary text-white" />
            )}
            {followUpToday && !followUpOverdue && (
              <Calendar className="h-3.5 w-3.5 text-primary" />
            )}
          </div>
        </div>

        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <ServiceTypeBadge type={lead.serviceType} />
          <CoverageBadge status={lead.coverageStatus} />
          <span className={cn("text-xs font-medium", tempColors[lead.temperature])}>
            {TEMPERATURE_LABELS[lead.temperature]}
          </span>
          {showRep && rep && (
            <span className="rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: rep.color }}>
              {rep.name.split(" ")[0]}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200">
            <div
              className={cn("h-full rounded-full", overdue || followUpOverdue ? "bg-red-500" : "bg-green-500")}
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className={cn("text-xs font-semibold", overdue || followUpOverdue ? "text-red-600" : "text-green-600")}>
            {days}d
          </span>
        </div>
      </Link>

      <div className="mt-2 flex items-center gap-1 border-t pt-2">
        <Button variant="ghost" size="icon-xs" onClick={(e) => { e.stopPropagation(); window.location.href = `tel:${lead.phone}`; }} title="Call">
          <Phone className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="icon-xs" onClick={(e) => { e.stopPropagation(); window.location.href = `mailto:${lead.email}`; }} title="Email">
          <Mail className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="xs" className="text-xs" onClick={quickLogCall}>
          Log call
        </Button>

        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                "ml-auto inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
              title="More actions"
              aria-label={`More actions for ${lead.clientName}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  sendToInbox();
                }}
              >
                <Inbox className="h-3.5 w-3.5" />
                Send to Lead Inbox
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  removeLead();
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove from pipeline
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
