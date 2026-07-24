"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { KanbanColumn, parseStageDroppableId } from "@/components/board/kanban-column";
import { LeadCard } from "@/components/board/lead-card";
import { RepFilter } from "@/components/board/rep-filter";
import { BoardFilters, defaultFilters, type BoardFilterState } from "@/components/board/board-filters";
import { LostReasonDialog } from "@/components/board/lost-reason-dialog";
import { LeadFormDialog } from "@/components/leads/lead-form-dialog";
import { useAuth } from "@/lib/auth-context";
import { useCrmStore } from "@/lib/store/crm-store";
import { ACTIVE_STAGES, STAGES } from "@/lib/constants";
import { SERVICE_ZONES } from "@/lib/data/packages";
import {
  filterLeadsForUser,
  isFollowUpDueToday,
  isFollowUpOverdue,
  isLeadVisible,
  searchLeads,
  sortLeads,
} from "@/lib/utils/leads";
import { isOverdue } from "@/lib/utils/time";
import type { Lead, LeadStage, LostReason, ServiceType } from "@/lib/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Plus, Download, Upload } from "lucide-react";

export function KanbanBoard() {
  const { leads, moveLead, getUserById, exportToCsv, importFromCsv } = useCrmStore();
  const { currentUser, isAdmin } = useAuth();
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [repFilter, setRepFilter] = useState<string | null>(null);
  const [serviceFilter, setServiceFilter] = useState<ServiceType | "all">("all");
  const [showClosedLost, setShowClosedLost] = useState(false);
  const [filters, setFilters] = useState<BoardFilterState>(defaultFilters);
  const [showAddLead, setShowAddLead] = useState(false);
  const [pendingMove, setPendingMove] = useState<{ id: string; stage: LeadStage } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const filteredLeads = useMemo(() => {
    let result = filterLeadsForUser(leads.filter(isLeadVisible), currentUser?.id, isAdmin);
    // Inbox owns unassigned leads — keep them off the pipeline board
    result = result.filter((l) => Boolean(l.assignedToId));

    if (isAdmin && repFilter) result = result.filter((l) => l.assignedToId === repFilter);
    if (serviceFilter !== "all") result = result.filter((l) => l.serviceType === serviceFilter);
    if (filters.priorityFilter !== "all") result = result.filter((l) => l.priority === filters.priorityFilter);
    if (filters.zoneFilter !== "all") result = result.filter((l) => l.serviceZone === filters.zoneFilter);
    if (filters.coverageFilter !== "all") result = result.filter((l) => l.coverageStatus === filters.coverageFilter);
    if (filters.temperatureFilter !== "all") result = result.filter((l) => l.temperature === filters.temperatureFilter);
    if (filters.dueTodayOnly) result = result.filter(isFollowUpDueToday);
    if (filters.overdueOnly) result = result.filter((l) => isOverdue(l) || isFollowUpOverdue(l));
    result = searchLeads(result, filters.search);
    return sortLeads(result, filters.sortField);
  }, [leads, isAdmin, currentUser, repFilter, serviceFilter, filters]);

  const leadsByStage = useMemo(() => {
    const map = Object.fromEntries(STAGES.map((s) => [s.id, [] as Lead[]])) as Record<
      LeadStage,
      Lead[]
    >;
    filteredLeads.forEach((lead) => {
      map[lead.stage]?.push(lead);
    });
    return map;
  }, [filteredLeads]);

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveLead(null);
    const { active, over } = event;
    if (!over) return;
    const leadId = String(active.id);
    const newStage = parseStageDroppableId(over.id);
    if (!newStage) return;
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.stage === newStage) return;
    if (!isAdmin && lead.assignedToId !== currentUser?.id) return;
    if (newStage === "closed_lost") {
      setPendingMove({ id: leadId, stage: newStage });
      return;
    }
    moveLead(leadId, newStage);
  };

  const handleLostConfirm = (reason: LostReason) => {
    if (pendingMove) moveLead(pendingMove.id, pendingMove.stage, reason);
    setPendingMove(null);
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => importFromCsv(ev.target?.result as string);
      reader.readAsText(file);
    };
    input.click();
  };

  // Derive once from STAGES so stage ids never appear twice as React keys
  const visibleStages = useMemo(() => {
    const active = new Set<LeadStage>(ACTIVE_STAGES);
    return STAGES.map((s) => s.id).filter((id) => {
      if (active.has(id)) return true;
      if (id === "closed_won") return true;
      if (id === "closed_lost" && showClosedLost) return true;
      return false;
    });
  }, [showClosedLost]);

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2.5 border-b border-border bg-surface-elevated px-4 py-3 lg:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => setShowAddLead(true)}
          >
            <Plus className="mr-1 h-4 w-4" /> Add Lead
          </Button>
          {isAdmin ? <RepFilter selected={repFilter} onSelect={setRepFilter} /> : null}
          <Select
            value={serviceFilter}
            onValueChange={(v) => {
              if (typeof v === "string") setServiceFilter(v as ServiceType | "all");
            }}
          >
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Service" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All services</SelectItem>
              <SelectItem value="fiber">Fiber</SelectItem>
              <SelectItem value="wireless">Wireless</SelectItem>
              <SelectItem value="both">Both</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant={filters.dueTodayOnly ? "default" : "outline"}
            size="sm"
            onClick={() =>
              setFilters({
                ...filters,
                dueTodayOnly: !filters.dueTodayOnly,
                overdueOnly: false,
              })
            }
            className={filters.dueTodayOnly ? "bg-primary hover:bg-primary/90" : ""}
          >
            Due Today
          </Button>
          <Button
            variant={filters.overdueOnly ? "default" : "outline"}
            size="sm"
            onClick={() =>
              setFilters({
                ...filters,
                overdueOnly: !filters.overdueOnly,
                dueTodayOnly: false,
              })
            }
            className={filters.overdueOnly ? "bg-primary hover:bg-primary/90" : ""}
          >
            Overdue
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowClosedLost(!showClosedLost)}>
            {showClosedLost ? "Hide" : "Show"} Lost
          </Button>
          {isAdmin ? (
            <>
              <Button variant="ghost" size="sm" onClick={exportToCsv} title="Export CSV">
                <Download className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={handleImport} title="Import CSV">
                <Upload className="h-4 w-4" />
              </Button>
            </>
          ) : null}
        </div>
        <BoardFilters filters={filters} onChange={setFilters} zones={[...SERVICE_ZONES]} />
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={(e) =>
          setActiveLead(leads.find((l) => l.id === e.active.id) ?? null)
        }
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 snap-x snap-mandatory overflow-x-auto bg-surface p-4 lg:p-5">
          <div className="flex gap-3">
            {visibleStages.map((stageId) => {
              const stage = STAGES.find((s) => s.id === stageId);
              if (!stage) return null;
              return (
                <KanbanColumn
                  key={`stage-col-${stageId}`}
                  stage={stageId}
                  label={stage.label}
                  headerColor={stage.headerColor}
                  leads={leadsByStage[stageId] ?? []}
                  getUserById={getUserById}
                  showRep={isAdmin}
                />
              );
            })}
          </div>
        </div>
        <DragOverlay>
          {activeLead ? (
            <LeadCard
              lead={activeLead}
              rep={
                activeLead.assignedToId
                  ? getUserById(activeLead.assignedToId)
                  : undefined
              }
              showRep={isAdmin}
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      <LeadFormDialog open={showAddLead} onOpenChange={setShowAddLead} />
      <LostReasonDialog
        open={!!pendingMove}
        onConfirm={handleLostConfirm}
        onCancel={() => setPendingMove(null)}
      />

      <Button
        size="icon-lg"
        className="fixed bottom-20 right-4 z-40 rounded-full bg-primary shadow-lg hover:bg-primary/90 lg:hidden"
        onClick={() => setShowAddLead(true)}
      >
        <Plus className="h-5 w-5" />
      </Button>
    </div>
  );
}
