import { KanbanBoard } from "@/components/board/kanban-board";
import { PageHeader } from "@/components/layout/page-shell";

export default function BoardPage() {
  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      {/* The header is its own card now, so this no longer needs the hand-rolled
          full-bleed band it used to fake one with. */}
      <div className="p-4 lg:px-6 lg:pb-4 lg:pt-6">
        <PageHeader
          title="Pipeline Board"
          description="Drag leads between stages to update their status"
        />
      </div>
      <KanbanBoard />
    </div>
  );
}
