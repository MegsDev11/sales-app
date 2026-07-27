"use client";

import { cn } from "@/lib/utils";
import {
  NODE_KIND_LABELS,
  STRUCTURE_KIND_LABELS,
  type NetworkNodeKind,
  type PaletteTool,
} from "@/lib/wireless/layout-types";
import { DeviceKindIcon } from "@/components/wireless/device-icons";
import { BrickWall, Cable, Fence, MousePointer2 } from "lucide-react";

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

const DRAW_TOOLS: { kind: PaletteTool; label: string; icon: typeof Cable; hint: string }[] = [
  { kind: "cable", label: "Cable", icon: Cable, hint: "Link two devices" },
  { kind: "wall", label: STRUCTURE_KIND_LABELS.wall, icon: BrickWall, hint: "Trace a solid wall" },
  { kind: "fence", label: STRUCTURE_KIND_LABELS.fence, icon: Fence, hint: "Trace a boundary" },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground first:pt-0">
      {children}
    </p>
  );
}

export function DevicePalette({
  selected,
  onSelect,
}: {
  selected: PaletteTool | null;
  onSelect: (kind: PaletteTool) => void;
}) {
  const selectActive = selected === "select";
  return (
    <div className="flex flex-col rounded-xl border border-border bg-surface-elevated p-2 shadow-sm">
      <SectionLabel>Tool</SectionLabel>
      <button
        type="button"
        onClick={() => onSelect("select")}
        className={cn(
          "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-xs font-medium transition-colors",
          selectActive
            ? "bg-primary/10 text-primary ring-1 ring-primary/40"
            : "text-foreground/80 hover:bg-muted"
        )}
      >
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-background",
            selectActive ? "border-primary/40" : "border-border"
          )}
        >
          <MousePointer2
            className={cn("h-4 w-4", selectActive ? "text-primary" : "text-muted-foreground")}
          />
        </span>
        <span className="flex flex-col">
          <span>Select &amp; move</span>
          <span className="text-[10px] font-normal text-muted-foreground">Click to edit</span>
        </span>
      </button>

      <SectionLabel>Devices</SectionLabel>
      {DEVICE_KINDS.map((kind) => {
        const active = selected === kind;
        return (
          <button
            key={kind}
            type="button"
            onClick={() => onSelect(kind)}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-xs font-medium transition-colors",
              active
                ? "bg-primary/10 text-primary ring-1 ring-primary/40"
                : "text-foreground/80 hover:bg-muted"
            )}
          >
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-background",
                active ? "border-primary/40" : "border-border"
              )}
            >
              <DeviceKindIcon kind={kind} size={28} />
            </span>
            {NODE_KIND_LABELS[kind]}
          </button>
        );
      })}

      <SectionLabel>Draw</SectionLabel>
      {DRAW_TOOLS.map((item) => {
        const Icon = item.icon;
        const active = selected === item.kind;
        return (
          <button
            key={item.kind}
            type="button"
            onClick={() => onSelect(item.kind)}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-xs font-medium transition-colors",
              active
                ? "bg-primary/10 text-primary ring-1 ring-primary/40"
                : "text-foreground/80 hover:bg-muted"
            )}
          >
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-background",
                active ? "border-primary/40" : "border-border"
              )}
            >
              <Icon className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground")} />
            </span>
            <span className="flex flex-col">
              <span>{item.label}</span>
              <span className="text-[10px] font-normal text-muted-foreground">{item.hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
