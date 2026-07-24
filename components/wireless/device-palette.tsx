"use client";

import { cn } from "@/lib/utils";
import {
  NODE_KIND_LABELS,
  STRUCTURE_KIND_LABELS,
  type NetworkNodeKind,
  type PaletteTool,
} from "@/lib/wireless/layout-types";
import { DeviceKindIcon } from "@/components/wireless/device-icons";
import { BrickWall, Cable, Fence } from "lucide-react";

const DEVICE_KINDS: NetworkNodeKind[] = [
  "network_point",
  "server_rack",
  "switch",
  "ptz_camera",
  "printer",
  "nec_phone",
  "ruijie_router",
  "label",
];

const DRAW_TOOLS: { kind: PaletteTool; label: string; icon: typeof Cable }[] = [
  { kind: "cable", label: "Cable", icon: Cable },
  { kind: "wall", label: STRUCTURE_KIND_LABELS.wall, icon: BrickWall },
  { kind: "fence", label: STRUCTURE_KIND_LABELS.fence, icon: Fence },
];

export function DevicePalette({
  selected,
  onSelect,
}: {
  selected: PaletteTool | null;
  onSelect: (kind: PaletteTool) => void;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-white p-2">
      <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Devices
      </p>
      {DEVICE_KINDS.map((kind) => {
        const active = selected === kind;
        return (
          <button
            key={kind}
            type="button"
            onClick={() => onSelect(kind)}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-xs font-medium transition-colors",
              active ? "bg-primary/10 ring-1 ring-primary text-primary" : "text-gray-700 hover:bg-gray-100"
            )}
          >
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-white",
                active ? "border-primary/40" : "border-gray-200"
              )}
            >
              <DeviceKindIcon kind={kind} size={28} />
            </span>
            {NODE_KIND_LABELS[kind]}
          </button>
        );
      })}
      <p className="mt-2 px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Draw
      </p>
      {DRAW_TOOLS.map((item) => {
        const Icon = item.icon;
        const active = selected === item.kind;
        return (
          <button
            key={item.kind}
            type="button"
            onClick={() => onSelect(item.kind)}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-xs font-medium transition-colors",
              active ? "bg-primary/10 ring-1 ring-primary text-primary" : "text-gray-700 hover:bg-gray-100"
            )}
          >
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-white",
                active ? "border-primary/40" : "border-gray-200"
              )}
            >
              <Icon
                className={cn("h-4 w-4", active ? "text-primary" : "text-gray-600")}
              />
            </span>
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
