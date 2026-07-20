import { KanbanBoard } from "@/components/board/kanban-board";

export default function BoardPage() {
  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="border-b bg-white px-4 py-4 lg:px-6">
        <h1 className="text-xl font-bold">Pipeline Board</h1>
        <p className="text-sm text-muted-foreground">
          Drag leads between stages to update their status
        </p>
      </div>
      <KanbanBoard />
    </div>
  );
}
