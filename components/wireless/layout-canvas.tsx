"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  NetworkCanvasDocument,
  NetworkCanvasNode,
  NetworkCanvasPoint,
  NetworkCanvasStructure,
  NetworkDevice,
  NetworkNodeKind,
  NetworkStructureKind,
  PaletteTool,
} from "@/lib/wireless/layout-types";
import { DeviceStatusBadge } from "@/components/wireless/device-status-badge";
import { DevicePalette } from "@/components/wireless/device-palette";
import { DeviceKindIcon } from "@/components/wireless/device-icons";

const GRID = 20;
const NODE_W = 72;
const NODE_H = 78;

function snap(n: number) {
  return Math.round(n / GRID) * GRID;
}

function isStructureTool(tool: PaletteTool | null): tool is NetworkStructureKind {
  return tool === "wall" || tool === "fence";
}

function nodeFill(kind: NetworkNodeKind): string {
  switch (kind) {
    case "label":
      return "#f8fafc";
    default:
      return "#ffffff";
  }
}

function shortLabel(kind: NetworkNodeKind): string {
  switch (kind) {
    case "network_point":
      return "NP";
    case "server_rack":
      return "SK";
    case "switch":
      return "SW";
    case "ptz_camera":
      return "PTZ";
    case "printer":
      return "PRN";
    case "nec_phone":
      return "NEC";
    case "ruijie_router":
      return "RG";
    default:
      return "TXT";
  }
}

function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function pointsToPath(points: NetworkCanvasPoint[]): string {
  if (points.length === 0) return "";
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

export function LayoutCanvas({
  canvas,
  devices = [],
  readOnly = false,
  backgroundUrl = null,
  onChange,
}: {
  canvas: NetworkCanvasDocument;
  devices?: NetworkDevice[];
  readOnly?: boolean;
  backgroundUrl?: string | null;
  onChange?: (next: NetworkCanvasDocument) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tool, setTool] = useState<PaletteTool | null>("network_point");
  const [cableFrom, setCableFrom] = useState<string | null>(null);
  const [draftPoints, setDraftPoints] = useState<NetworkCanvasPoint[]>([]);
  const [cursorWorld, setCursorWorld] = useState<NetworkCanvasPoint | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [pan, setPan] = useState({ x: canvas.viewport?.x ?? 0, y: canvas.viewport?.y ?? 0 });
  const [zoom, setZoom] = useState(canvas.viewport?.zoom ?? 1);
  const [panning, setPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, px: 0, py: 0 });
  const structures = canvas.structures ?? [];

  const deviceByNode = new Map(devices.map((d) => [d.nodeId, d]));

  const emit = useCallback(
    (partial: Partial<NetworkCanvasDocument>) => {
      if (!onChange || readOnly) return;
      onChange({
        ...canvas,
        structures: canvas.structures ?? [],
        ...partial,
        viewport: { x: pan.x, y: pan.y, zoom },
      });
    },
    [canvas, onChange, pan.x, pan.y, readOnly, zoom]
  );

  function finishStructure() {
    if (!isStructureTool(tool) || draftPoints.length < 2) {
      setDraftPoints([]);
      return;
    }
    const structure: NetworkCanvasStructure = {
      id: newId(tool === "wall" ? "wall" : "fence"),
      kind: tool,
      points: draftPoints,
    };
    emit({ structures: [...structures, structure] });
    setDraftPoints([]);
  }

  useEffect(() => {
    if (readOnly) return;
    function onKey(e: KeyboardEvent) {
      if (!isStructureTool(tool)) return;
      if (e.key === "Enter") {
        e.preventDefault();
        finishStructure();
      } else if (e.key === "Escape") {
        setDraftPoints([]);
      } else if (e.key === "Backspace" && draftPoints.length > 0) {
        e.preventDefault();
        setDraftPoints((pts) => pts.slice(0, -1));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- finish uses latest draft/tool via closure on each render
  }, [tool, draftPoints, readOnly, structures]);

  function clientToWorld(clientX: number, clientY: number) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - pan.x) / zoom,
      y: (clientY - rect.top - pan.y) / zoom,
    };
  }

  function handleToolSelect(next: PaletteTool) {
    if (isStructureTool(tool) && draftPoints.length >= 2) {
      finishStructure();
    } else {
      setDraftPoints([]);
    }
    setCableFrom(null);
    setTool(next);
  }

  function handleCanvasClick(e: React.MouseEvent) {
    if (readOnly || !tool) return;
    if ((e.target as Element).closest("[data-node]")) return;
    if ((e.target as Element).closest("[data-structure]")) return;

    if (isStructureTool(tool)) {
      const { x, y } = clientToWorld(e.clientX, e.clientY);
      setDraftPoints((pts) => [...pts, { x: snap(x), y: snap(y) }]);
      return;
    }

    if (tool === "cable") return;

    const { x, y } = clientToWorld(e.clientX, e.clientY);
    const node: NetworkCanvasNode = {
      id: newId("n"),
      kind: tool,
      x: snap(x - NODE_W / 2),
      y: snap(y - NODE_H / 2),
      label: shortLabel(tool),
    };
    emit({ nodes: [...canvas.nodes, node] });
  }

  function handleCanvasDoubleClick(e: React.MouseEvent) {
    if (readOnly || !isStructureTool(tool)) return;
    e.preventDefault();
    finishStructure();
  }

  function handleNodeClick(e: React.MouseEvent, nodeId: string) {
    e.stopPropagation();
    if (readOnly || tool !== "cable") return;
    if (!cableFrom) {
      setCableFrom(nodeId);
      return;
    }
    if (cableFrom === nodeId) {
      setCableFrom(null);
      return;
    }
    const edge = {
      id: newId("e"),
      from: cableFrom,
      to: nodeId,
    };
    emit({ edges: [...canvas.edges, edge] });
    setCableFrom(null);
  }

  function handleNodePointerDown(e: React.PointerEvent, nodeId: string) {
    if (readOnly || tool === "cable" || isStructureTool(tool)) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDragId(nodeId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (isStructureTool(tool)) {
      const { x, y } = clientToWorld(e.clientX, e.clientY);
      setCursorWorld({ x: snap(x), y: snap(y) });
    }
    if (panning) {
      setPan({
        x: panStart.current.px + (e.clientX - panStart.current.x),
        y: panStart.current.py + (e.clientY - panStart.current.y),
      });
      return;
    }
    if (!dragId || readOnly) return;
    const { x, y } = clientToWorld(e.clientX, e.clientY);
    emit({
      nodes: canvas.nodes.map((n) =>
        n.id === dragId
          ? { ...n, x: snap(x - NODE_W / 2), y: snap(y - NODE_H / 2) }
          : n
      ),
    });
  }

  function handlePointerUp() {
    setDragId(null);
    setPanning(false);
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const next = Math.min(2.5, Math.max(0.4, zoom + (e.deltaY > 0 ? -0.08 : 0.08)));
    setZoom(next);
  }

  function startPan(e: React.PointerEvent) {
    if (e.button === 1 || e.altKey || (readOnly && e.button === 0)) {
      setPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    }
  }

  function deleteSelectedEdgeOrNode(nodeId: string) {
    if (readOnly) return;
    emit({
      nodes: canvas.nodes.filter((n) => n.id !== nodeId),
      edges: canvas.edges.filter((ed) => ed.from !== nodeId && ed.to !== nodeId),
    });
  }

  function deleteStructure(structureId: string) {
    if (readOnly) return;
    emit({ structures: structures.filter((s) => s.id !== structureId) });
  }

  const nodeMap = new Map(canvas.nodes.map((n) => [n.id, n]));
  const previewPoints =
    isStructureTool(tool) && draftPoints.length > 0 && cursorWorld
      ? [...draftPoints, cursorWorld]
      : draftPoints;

  let hint =
    "Click canvas to place. Cable: click two nodes. Wall/Fence: click corners, double-click or Enter to finish. Drag to move. Alt-drag to pan.";
  if (cableFrom) hint = "Pick cable end…";
  if (isStructureTool(tool) && draftPoints.length > 0) {
    hint = `${tool === "wall" ? "Wall" : "Fence"}: ${draftPoints.length} point(s) — click next corner, double-click / Enter to finish, Esc to cancel.`;
  }

  return (
    <div className="flex flex-col gap-3 lg:flex-row">
      {!readOnly && (
        <div className="w-full shrink-0 lg:w-56">
          <DevicePalette selected={tool} onSelect={handleToolSelect} />
          <p className="mt-2 text-[11px] text-muted-foreground">{hint}</p>
          {isStructureTool(tool) && draftPoints.length >= 2 && (
            <button
              type="button"
              className="mt-2 w-full rounded-md border px-2 py-1.5 text-xs font-medium hover:bg-gray-50"
              onClick={() => finishStructure()}
            >
              Finish {tool}
            </button>
          )}
        </div>
      )}
      <div className="relative min-h-[420px] flex-1 overflow-hidden rounded-lg border bg-[#e8eef5]">
        <svg
          ref={svgRef}
          className="h-[520px] w-full touch-none"
          onClick={handleCanvasClick}
          onDoubleClick={handleCanvasDoubleClick}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onPointerDown={startPan}
          onWheel={handleWheel}
        >
          <defs>
            <pattern id="grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
              <path
                d={`M ${GRID} 0 L 0 0 0 ${GRID}`}
                fill="none"
                stroke="#cbd5e1"
                strokeWidth="0.5"
              />
            </pattern>
          </defs>
          <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
            <rect x={-2000} y={-2000} width={6000} height={6000} fill="url(#grid)" />
            {backgroundUrl && (
              <image
                href={backgroundUrl}
                x={0}
                y={0}
                width={900}
                height={600}
                opacity={0.35}
                preserveAspectRatio="xMidYMid meet"
              />
            )}
            {structures.map((s) => (
              <g key={s.id} data-structure>
                <path
                  d={pointsToPath(s.points)}
                  fill="none"
                  stroke={s.kind === "wall" ? "#1e293b" : "#78716c"}
                  strokeWidth={s.kind === "wall" ? 6 : 3}
                  strokeDasharray={s.kind === "fence" ? "10 6" : undefined}
                  strokeLinecap="square"
                  strokeLinejoin="miter"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    deleteStructure(s.id);
                  }}
                  style={{ cursor: readOnly ? "default" : "pointer" }}
                />
              </g>
            ))}
            {previewPoints.length > 0 && (
              <g>
                <path
                  d={pointsToPath(previewPoints)}
                  fill="none"
                  stroke={tool === "wall" ? "#1e293b" : "#78716c"}
                  strokeWidth={tool === "wall" ? 6 : 3}
                  strokeDasharray={tool === "fence" ? "10 6" : undefined}
                  strokeOpacity={0.55}
                  strokeLinecap="square"
                />
                {draftPoints.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={4} fill="#C83733" />
                ))}
              </g>
            )}
            {canvas.edges.map((edge) => {
              const a = nodeMap.get(edge.from);
              const b = nodeMap.get(edge.to);
              if (!a || !b) return null;
              return (
                <line
                  key={edge.id}
                  x1={a.x + NODE_W / 2}
                  y1={a.y + NODE_H / 2}
                  x2={b.x + NODE_W / 2}
                  y2={b.y + NODE_H / 2}
                  stroke="#16a34a"
                  strokeWidth={2.5}
                />
              );
            })}
            {canvas.nodes.map((node) => {
              const device = deviceByNode.get(node.id);
              const fill = nodeFill(node.kind);
              const selected = cableFrom === node.id;
              return (
                <g
                  key={node.id}
                  data-node
                  transform={`translate(${node.x} ${node.y})`}
                  onClick={(e) => handleNodeClick(e, node.id)}
                  onPointerDown={(e) => handleNodePointerDown(e, node.id)}
                  onDoubleClick={() => deleteSelectedEdgeOrNode(node.id)}
                  style={{ cursor: readOnly ? "default" : "grab" }}
                >
                  <rect
                    width={NODE_W}
                    height={NODE_H}
                    rx={8}
                    fill={fill}
                    stroke={selected ? "#C83733" : "#cbd5e1"}
                    strokeWidth={selected ? 2.5 : 1.5}
                  />
                  <foreignObject x={12} y={6} width={48} height={48}>
                    <div className="flex h-12 w-12 items-center justify-center">
                      <DeviceKindIcon kind={node.kind} size={40} />
                    </div>
                  </foreignObject>
                  <text
                    x={NODE_W / 2}
                    y={66}
                    textAnchor="middle"
                    fill="#0f172a"
                    fontSize={10}
                    fontWeight={700}
                  >
                    {(node.label || shortLabel(node.kind)).slice(0, 14)}
                  </text>
                  {device && (
                    <foreignObject x={NODE_W - 10} y={-10} width={56} height={20}>
                      <DeviceStatusBadge status={device.status} />
                    </foreignObject>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
        <div className="absolute bottom-2 right-2 rounded bg-white/90 px-2 py-1 text-[10px] text-muted-foreground">
          zoom {(zoom * 100).toFixed(0)}%
        </div>
      </div>
    </div>
  );
}
