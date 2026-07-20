"use client";

import { getSalesStaff } from "@/lib/permissions";
import { useCrmStore } from "@/lib/store/crm-store";
import { cn } from "@/lib/utils";

interface RepFilterProps {
  selected: string | null;
  onSelect: (id: string | null) => void;
}

export function RepFilter({ selected, onSelect }: RepFilterProps) {
  const { users } = useCrmStore();
  const salesReps = getSalesStaff(users);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => onSelect(null)}
        className={cn(
          "rounded-full px-3 py-1 text-xs font-medium transition-colors",
          selected === null
            ? "bg-black text-white"
            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
        )}
      >
        All reps
      </button>
      {salesReps.map((rep) => (
        <button
          key={rep.id}
          onClick={() => onSelect(rep.id)}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium text-white transition-opacity",
            selected === rep.id ? "ring-2 ring-black ring-offset-1" : "opacity-80 hover:opacity-100"
          )}
          style={{ backgroundColor: rep.color }}
        >
          {rep.name.split(" ")[0]}
        </button>
      ))}
    </div>
  );
}
