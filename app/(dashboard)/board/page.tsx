import { KanbanBoard } from "@/components/board/kanban-board";
import { PageHeader } from "@/components/layout/page-shell";

export default function BoardPage() {
  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      <div className="border-b border-border bg-surface-elevated px-4 py-3 lg:px-6">
        <PageHeader
          className="border-0 pb-0"
          title="Pipeline Board"
          description="Drag leads between stages to update their status"
        />
      </div>
      <KanbanBoard />
    </div>
  );
}
