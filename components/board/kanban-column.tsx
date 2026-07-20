"use client";

import { useDroppable } from "@dnd-kit/core";
import { LeadCard } from "@/components/board/lead-card";
import type { Lead, LeadStage, User } from "@/lib/types";

interface KanbanColumnProps {
  stage: LeadStage;
  label: string;
  headerColor: string;
  leads: Lead[];
  getUserById: (id: string) => User | undefined;
  showRep?: boolean;
}

export function KanbanColumn({
  stage,
  label,
  headerColor,
  leads,
  getUserById,
  showRep = false,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });

  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div
        className="mb-3 rounded-t-lg px-3 py-2 text-sm font-semibold text-white"
        style={{ backgroundColor: headerColor }}
      >
        {label} ({leads.length})
      </div>
      <div
        ref={setNodeRef}
        className={`min-h-[200px] flex-1 space-y-2 rounded-b-lg bg-gray-100/80 p-2 transition-colors ${
          isOver ? "bg-blue-50 ring-2 ring-[#C83733]/30" : ""
        }`}
      >
        {leads.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            No leads
          </p>
        ) : (
          leads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              rep={lead.assignedToId ? getUserById(lead.assignedToId) : undefined}
              showRep={showRep}
            />
          ))
        )}
      </div>
    </div>
  );
}
