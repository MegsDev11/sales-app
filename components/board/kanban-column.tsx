"use client";

import { useDroppable } from "@dnd-kit/core";
import { LeadCard } from "@/components/board/lead-card";
import type { Lead, LeadStage, User } from "@/lib/types";
import { STAGES } from "@/lib/constants";

const STAGE_DROPPABLE_PREFIX = "stage:";

export function stageDroppableId(stage: LeadStage) {
  return `${STAGE_DROPPABLE_PREFIX}${stage}`;
}

export function parseStageDroppableId(id: string | number): LeadStage | null {
  const raw = String(id);
  const stageId = raw.startsWith(STAGE_DROPPABLE_PREFIX)
    ? raw.slice(STAGE_DROPPABLE_PREFIX.length)
    : raw;
  return STAGES.some((s) => s.id === stageId) ? (stageId as LeadStage) : null;
}

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
  const { setNodeRef, isOver } = useDroppable({ id: stageDroppableId(stage) });

  return (
    <div className="flex w-72 shrink-0 flex-col rounded-lg border border-border bg-surface-elevated shadow-sm">
      <div
        className="rounded-t-lg px-3 py-2 text-sm font-semibold text-white"
        style={{ backgroundColor: headerColor }}
      >
        <span className="flex items-center justify-between gap-2">
          <span>{label}</span>
          <span className="rounded bg-black/20 px-1.5 py-0.5 text-xs font-medium">
            {leads.length}
          </span>
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={`min-h-[200px] flex-1 space-y-2 rounded-b-lg p-2 transition-colors ${
          isOver ? "bg-accent ring-2 ring-primary/25 ring-inset" : "bg-muted/40"
        }`}
      >
        {leads.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">No leads</p>
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
