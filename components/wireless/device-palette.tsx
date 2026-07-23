"use client";

import { cn } from "@/lib/utils";
import {
  NODE_KIND_LABELS,
  STRUCTURE_KIND_LABELS,
  type PaletteTool,
} from "@/lib/wireless/layout-types";
import {
  BrickWall,
  Camera,
  Cable,
  Fence,
  HardDrive,
  Network,
  Phone,
  Printer,
  Router,
  Type,
} from "lucide-react";

const PALETTE: { kind: PaletteTool; icon: typeof Network; label: string }[] = [
  { kind: "network_point", icon: Network, label: NODE_KIND_LABELS.network_point },
  { kind: "server_rack", icon: HardDrive, label: NODE_KIND_LABELS.server_rack },
  { kind: "switch", icon: HardDrive, label: NODE_KIND_LABELS.switch },
  { kind: "ptz_camera", icon: Camera, label: NODE_KIND_LABELS.ptz_camera },
  { kind: "printer", icon: Printer, label: NODE_KIND_LABELS.printer },
  { kind: "nec_phone", icon: Phone, label: NODE_KIND_LABELS.nec_phone },
  { kind: "ruijie_router", icon: Router, label: NODE_KIND_LABELS.ruijie_router },
  { kind: "label", icon: Type, label: NODE_KIND_LABELS.label },
  { kind: "cable", icon: Cable, label: "Cable" },
  { kind: "wall", icon: BrickWall, label: STRUCTURE_KIND_LABELS.wall },
  { kind: "fence", icon: Fence, label: STRUCTURE_KIND_LABELS.fence },
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
        Palette
      </p>
      {PALETTE.map((item) => {
        const Icon = item.icon;
        const active = selected === item.kind;
        return (
          <button
            key={item.kind}
            type="button"
            onClick={() => onSelect(item.kind)}
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium transition-colors",
              active ? "bg-[#C83733] text-white" : "text-gray-700 hover:bg-gray-100"
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
