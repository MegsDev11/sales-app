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

/**
 * Tool palette — a horizontal strip above the canvas.
 *
 * It used to be a 224px column down the left. On a property aerial that column was
 * costing the map a fifth of its width for a list that is read once and then only
 * clicked, so it moved to a single row: the two mode buttons keep their labels
 * because they are what you switch between all day, and the eleven placement tools
 * go icon-only with tooltips. Same information, roughly a tenth of the footprint.
 */

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

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="shrink-0 pr-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </span>
  );
}

function Divider() {
  return <span aria-hidden className="mx-1 h-7 w-px shrink-0 bg-border" />;
}

/** Icon-only tool. The name lives in the tooltip and the accessible label. */
function IconTool({
  active,
  title,
  onClick,
  children,
}: {
  active: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition-colors",
        active
          ? "border-primary/40 bg-primary/10 ring-1 ring-primary/40"
          : "border-border bg-background hover:bg-muted"
      )}
    >
      {children}
    </button>
  );
}

/** Icon plus text, for the two tools you switch between rather than pick from. */
function ModeTool({
  active,
  label,
  hint,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  hint: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={`${label} — ${hint}`}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex shrink-0 items-center gap-2 rounded-lg py-1 pl-1 pr-2.5 text-left text-xs font-medium transition-colors",
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
        {children}
      </span>
      <span className="flex flex-col leading-tight">
        <span>{label}</span>
        <span className="text-[10px] font-normal text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}

export function DevicePalette({
  selected,
  onSelect,
}: {
  selected: PaletteTool | null;
  onSelect: (kind: PaletteTool) => void;
}) {
  return (
    <div
      // Scrolls rather than wraps on a narrow screen: a wrapping palette changes
      // height, which would resize the canvas underneath it as the window moves.
      className="flex items-center gap-1.5 overflow-x-auto rounded-xl border border-border bg-surface-elevated px-2.5 py-2 shadow-sm"
    >
      <ModeTool
        active={selected === "select"}
        label="Select & move"
        hint="Click to edit"
        onClick={() => onSelect("select")}
      >
        <MousePointer2
          className={cn(
            "h-4 w-4",
            selected === "select" ? "text-primary" : "text-muted-foreground"
          )}
        />
      </ModeTool>

      <Divider />

      <ModeTool
        active={selected === "site_marker"}
        label={NODE_KIND_LABELS.site_marker}
        hint="A building, with photos"
        onClick={() => onSelect("site_marker")}
      >
        <DeviceKindIcon kind="site_marker" size={28} />
      </ModeTool>

      <Divider />

      <GroupLabel>Devices</GroupLabel>
      {DEVICE_KINDS.map((kind) => (
        <IconTool
          key={kind}
          active={selected === kind}
          title={NODE_KIND_LABELS[kind]}
          onClick={() => onSelect(kind)}
        >
          <DeviceKindIcon kind={kind} size={26} />
        </IconTool>
      ))}

      <Divider />

      <GroupLabel>Draw</GroupLabel>
      {DRAW_TOOLS.map((item) => {
        const Icon = item.icon;
        const active = selected === item.kind;
        return (
          <IconTool
            key={item.kind}
            active={active}
            title={`${item.label} — ${item.hint}`}
            onClick={() => onSelect(item.kind)}
          >
            <Icon className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground")} />
          </IconTool>
        );
      })}
    </div>
  );
}
