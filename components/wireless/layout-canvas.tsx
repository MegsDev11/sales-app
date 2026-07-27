"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  NODE_KIND_ACCENT,
  NODE_KIND_LABELS,
} from "@/lib/wireless/layout-types";
import { DeviceStatusBadge } from "@/components/wireless/device-status-badge";
import { DevicePalette } from "@/components/wireless/device-palette";
import { DeviceKindIcon } from "@/components/wireless/device-icons";
import { cn } from "@/lib/utils";
import {
  Grid3x3,
  Image as ImageIcon,
  Magnet,
  Maximize2,
  MousePointerClick,
  Redo2,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

const GRID = 20;
const MAJOR = GRID * 5;
const NODE_W = 72;
const NODE_H = 78;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2.5;
const HISTORY_LIMIT = 60;

type Selection =
  | { type: "node"; id: string }
  | { type: "structure"; id: string }
  | { type: "edge"; id: string }
  | null;

function isStructureTool(tool: PaletteTool | null): tool is NetworkStructureKind {
  return tool === "wall" || tool === "fence";
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

/** Rounded-top-only rectangle path, for the node accent strip. */
function topStripPath(w: number, h: number, r: number): string {
  return `M0 ${r} a ${r} ${r} 0 0 1 ${r} ${-r} h ${w - 2 * r} a ${r} ${r} 0 0 1 ${r} ${r} v ${h - r} h ${-w} z`;
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
  const [tool, setTool] = useState<PaletteTool>("select");
  const [selection, setSelection] = useState<Selection>(null);
  const [cableFrom, setCableFrom] = useState<string | null>(null);
  const [draftPoints, setDraftPoints] = useState<NetworkCanvasPoint[]>([]);
  const [cursorWorld, setCursorWorld] = useState<NetworkCanvasPoint | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [pan, setPan] = useState({ x: canvas.viewport?.x ?? 0, y: canvas.viewport?.y ?? 0 });
  const [zoom, setZoom] = useState(canvas.viewport?.zoom ?? 1);
  const [panning, setPanning] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [showBackground, setShowBackground] = useState(true);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [past, setPast] = useState<NetworkCanvasDocument[]>([]);
  const [future, setFuture] = useState<NetworkCanvasDocument[]>([]);

  const panStart = useRef({ x: 0, y: 0, px: 0, py: 0 });
  const dragStart = useRef<NetworkCanvasDocument | null>(null);
  const dragHistoryPushed = useRef(false);
  const dragMoved = useRef(false);

  const structures = canvas.structures ?? [];
  const deviceByNode = useMemo(
    () => new Map(devices.map((d) => [d.nodeId, d])),
    [devices]
  );
  const nodeMap = useMemo(
    () => new Map(canvas.nodes.map((n) => [n.id, n])),
    [canvas.nodes]
  );

  const snap = useCallback(
    (n: number) => (snapEnabled ? Math.round(n / GRID) * GRID : Math.round(n)),
    [snapEnabled]
  );

  const applyDoc = useCallback(
    (doc: NetworkCanvasDocument) => {
      if (!onChange || readOnly) return;
      onChange({ ...doc, viewport: { x: pan.x, y: pan.y, zoom } });
    },
    [onChange, readOnly, pan.x, pan.y, zoom]
  );

  const emit = useCallback(
    (partial: Partial<NetworkCanvasDocument>, opts: { history?: boolean } = {}) => {
      if (!onChange || readOnly) return;
      const history = opts.history ?? true;
      if (history) {
        setPast((p) => [...p.slice(-(HISTORY_LIMIT - 1)), canvas]);
        setFuture([]);
      }
      onChange({
        ...canvas,
        structures: canvas.structures ?? [],
        ...partial,
        viewport: { x: pan.x, y: pan.y, zoom },
      });
    },
    [canvas, onChange, pan.x, pan.y, readOnly, zoom]
  );

  const undo = useCallback(() => {
    if (readOnly || past.length === 0) return;
    const prev = past[past.length - 1];
    setPast(past.slice(0, -1));
    setFuture((f) => [canvas, ...f].slice(0, HISTORY_LIMIT));
    setSelection(null);
    applyDoc(prev);
  }, [readOnly, past, canvas, applyDoc]);

  const redo = useCallback(() => {
    if (readOnly || future.length === 0) return;
    const next = future[0];
    setFuture(future.slice(1));
    setPast((p) => [...p.slice(-(HISTORY_LIMIT - 1)), canvas]);
    setSelection(null);
    applyDoc(next);
  }, [readOnly, future, canvas, applyDoc]);

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

  function deleteSelection() {
    if (readOnly || !selection) return;
    if (selection.type === "node") {
      emit({
        nodes: canvas.nodes.filter((n) => n.id !== selection.id),
        edges: canvas.edges.filter(
          (ed) => ed.from !== selection.id && ed.to !== selection.id
        ),
      });
    } else if (selection.type === "structure") {
      emit({ structures: structures.filter((s) => s.id !== selection.id) });
    } else if (selection.type === "edge") {
      emit({ edges: canvas.edges.filter((ed) => ed.id !== selection.id) });
    }
    setSelection(null);
  }

  function renameNode(nodeId: string, label: string) {
    emit(
      { nodes: canvas.nodes.map((n) => (n.id === nodeId ? { ...n, label } : n)) },
      { history: false }
    );
  }

  // Keyboard shortcuts
  useEffect(() => {
    if (readOnly) return;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (typing) return;

      const meta = e.ctrlKey || e.metaKey;
      if (meta && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (meta && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (e.key === "v" || e.key === "V") {
        handleToolSelect("select");
        return;
      }
      if (isStructureTool(tool)) {
        if (e.key === "Enter") {
          e.preventDefault();
          finishStructure();
          return;
        }
        if (e.key === "Backspace" && draftPoints.length > 0) {
          e.preventDefault();
          setDraftPoints((pts) => pts.slice(0, -1));
          return;
        }
      }
      if (e.key === "Escape") {
        setDraftPoints([]);
        setCableFrom(null);
        setSelection(null);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selection) {
        e.preventDefault();
        deleteSelection();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers read latest state via closure each render
  }, [tool, draftPoints, readOnly, structures, selection, past, future, canvas]);

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
    if (next !== "select") setSelection(null);
    setTool(next);
  }

  function handleCanvasClick(e: React.MouseEvent) {
    if (readOnly || !tool) return;
    if ((e.target as Element).closest("[data-node]")) return;
    if ((e.target as Element).closest("[data-structure]")) return;
    if ((e.target as Element).closest("[data-edge]")) return;

    if (tool === "select") {
      setSelection(null);
      return;
    }
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
    setSelection({ type: "node", id: node.id });
  }

  function handleCanvasDoubleClick(e: React.MouseEvent) {
    if (readOnly || !isStructureTool(tool)) return;
    e.preventDefault();
    finishStructure();
  }

  function handleNodeClick(e: React.MouseEvent, nodeId: string) {
    e.stopPropagation();
    if (readOnly) return;
    if (tool === "cable") {
      if (!cableFrom) {
        setCableFrom(nodeId);
        return;
      }
      if (cableFrom === nodeId) {
        setCableFrom(null);
        return;
      }
      const edge = { id: newId("e"), from: cableFrom, to: nodeId };
      emit({ edges: [...canvas.edges, edge] });
      setCableFrom(null);
      return;
    }
    if (!dragMoved.current) setSelection({ type: "node", id: nodeId });
  }

  function handleNodePointerDown(e: React.PointerEvent, nodeId: string) {
    if (readOnly || tool === "cable" || isStructureTool(tool)) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setSelection({ type: "node", id: nodeId });
    setDragId(nodeId);
    dragStart.current = canvas;
    dragHistoryPushed.current = false;
    dragMoved.current = false;
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
    dragMoved.current = true;
    if (!dragHistoryPushed.current && dragStart.current) {
      setPast((p) => [...p.slice(-(HISTORY_LIMIT - 1)), dragStart.current!]);
      setFuture([]);
      dragHistoryPushed.current = true;
    }
    const { x, y } = clientToWorld(e.clientX, e.clientY);
    emit(
      {
        nodes: canvas.nodes.map((n) =>
          n.id === dragId ? { ...n, x: snap(x - NODE_W / 2), y: snap(y - NODE_H / 2) } : n
        ),
      },
      { history: false }
    );
  }

  function handlePointerUp() {
    if (panning) applyDoc(canvas); // persist viewport
    setDragId(null);
    setPanning(false);
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom + (e.deltaY > 0 ? -0.08 : 0.08)));
    setZoom(next);
  }

  function startPan(e: React.PointerEvent) {
    if (e.button === 1 || e.altKey || (readOnly && e.button === 0)) {
      setPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    }
  }

  function zoomBy(delta: number) {
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +(z + delta).toFixed(2))));
  }

  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function fitToContent() {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const xs: number[] = [];
    const ys: number[] = [];
    for (const n of canvas.nodes) {
      xs.push(n.x, n.x + NODE_W);
      ys.push(n.y, n.y + NODE_H);
    }
    for (const s of structures) {
      for (const p of s.points) {
        xs.push(p.x);
        ys.push(p.y);
      }
    }
    if (xs.length === 0) {
      resetView();
      return;
    }
    const pad = 60;
    const minX = Math.min(...xs) - pad;
    const minY = Math.min(...ys) - pad;
    const maxX = Math.max(...xs) + pad;
    const maxY = Math.max(...ys) + pad;
    const cw = maxX - minX;
    const ch = maxY - minY;
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(rect.width / cw, rect.height / ch)));
    setZoom(nextZoom);
    setPan({
      x: (rect.width - cw * nextZoom) / 2 - minX * nextZoom,
      y: (rect.height - ch * nextZoom) / 2 - minY * nextZoom,
    });
  }

  const previewPoints =
    isStructureTool(tool) && draftPoints.length > 0 && cursorWorld
      ? [...draftPoints, cursorWorld]
      : draftPoints;

  const selectedNode =
    selection?.type === "node" ? nodeMap.get(selection.id) ?? null : null;
  const selectedStructure =
    selection?.type === "structure"
      ? structures.find((s) => s.id === selection.id) ?? null
      : null;

  const isEmpty = canvas.nodes.length === 0 && structures.length === 0;

  let hint =
    "Select a device on the left, then click the canvas to place it. Drag to reposition. Alt-drag to pan, scroll to zoom.";
  if (tool === "select") hint = "Click a device to select and edit it. Drag to move. Delete key removes it.";
  if (tool === "cable") hint = cableFrom ? "Click the second device to finish the cable." : "Click the first device to start a cable.";
  if (isStructureTool(tool)) {
    hint =
      draftPoints.length > 0
        ? `${tool === "wall" ? "Wall" : "Fence"}: ${draftPoints.length} point(s) — click the next corner, double-click / Enter to finish, Esc to cancel.`
        : `Click each corner to trace a ${tool}. Double-click or press Enter to finish.`;
  }

  return (
    <div className="flex flex-col gap-3 xl:flex-row">
      {/* Palette */}
      {!readOnly && (
        <div className="w-full shrink-0 xl:w-56">
          <DevicePalette selected={tool} onSelect={handleToolSelect} />
        </div>
      )}

      {/* Canvas + toolbar */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface-elevated shadow-sm">
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-1 border-b border-border bg-muted/40 px-2 py-1.5">
            <ToolbarGroup>
              <ToolbarButton label="Undo (Ctrl+Z)" onClick={undo} disabled={past.length === 0}>
                <Undo2 />
              </ToolbarButton>
              <ToolbarButton label="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={future.length === 0}>
                <Redo2 />
              </ToolbarButton>
            </ToolbarGroup>
            <ToolbarDivider />
            <ToolbarGroup>
              <ToolbarButton label="Zoom out" onClick={() => zoomBy(-0.1)} disabled={zoom <= MIN_ZOOM}>
                <ZoomOut />
              </ToolbarButton>
              <span className="w-11 text-center text-xs font-medium tabular-nums text-muted-foreground">
                {(zoom * 100).toFixed(0)}%
              </span>
              <ToolbarButton label="Zoom in" onClick={() => zoomBy(0.1)} disabled={zoom >= MAX_ZOOM}>
                <ZoomIn />
              </ToolbarButton>
              <ToolbarButton label="Fit to content" onClick={fitToContent}>
                <Maximize2 />
              </ToolbarButton>
              <ToolbarButton label="Reset view (100%)" onClick={resetView}>
                <MousePointerClick />
              </ToolbarButton>
            </ToolbarGroup>
            <ToolbarDivider />
            <ToolbarGroup>
              <ToolbarButton label="Toggle grid" active={showGrid} onClick={() => setShowGrid((v) => !v)}>
                <Grid3x3 />
              </ToolbarButton>
              <ToolbarButton label="Snap to grid" active={snapEnabled} onClick={() => setSnapEnabled((v) => !v)}>
                <Magnet />
              </ToolbarButton>
              {backgroundUrl && (
                <ToolbarButton
                  label="Toggle floor plan"
                  active={showBackground}
                  onClick={() => setShowBackground((v) => !v)}
                >
                  <ImageIcon />
                </ToolbarButton>
              )}
            </ToolbarGroup>
            <div className="ml-auto hidden max-w-[46%] truncate pr-1 text-[11px] text-muted-foreground sm:block">
              {hint}
            </div>
          </div>
        )}

        <div className="relative min-h-[420px] flex-1 overflow-hidden bg-[#f8fafc]">
          <svg
            ref={svgRef}
            className={cn(
              "h-[560px] w-full touch-none xl:h-[660px]",
              tool === "select" && !dragId ? "cursor-default" : "cursor-crosshair",
              panning && "cursor-grabbing"
            )}
            onClick={handleCanvasClick}
            onDoubleClick={handleCanvasDoubleClick}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onPointerDown={startPan}
            onWheel={handleWheel}
          >
            <defs>
              <pattern id="grid-minor" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
                <path d={`M ${GRID} 0 L 0 0 0 ${GRID}`} fill="none" stroke="#e2e8f0" strokeWidth="1" />
              </pattern>
              <pattern id="grid-major" width={MAJOR} height={MAJOR} patternUnits="userSpaceOnUse">
                <rect width={MAJOR} height={MAJOR} fill="url(#grid-minor)" />
                <path d={`M ${MAJOR} 0 L 0 0 0 ${MAJOR}`} fill="none" stroke="#cbd5e1" strokeWidth="1" />
              </pattern>
              <filter id="node-shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#0f172a" floodOpacity="0.14" />
              </filter>
            </defs>
            <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
              {showGrid && (
                <rect x={-4000} y={-4000} width={12000} height={12000} fill="url(#grid-major)" />
              )}
              {backgroundUrl && showBackground && (
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

              {/* Structures (walls / fences) */}
              {structures.map((s) => {
                const active = selection?.type === "structure" && selection.id === s.id;
                return (
                  <g key={s.id} data-structure>
                    {/* wide invisible hit target */}
                    <path
                      d={pointsToPath(s.points)}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={16}
                      style={{ cursor: readOnly ? "default" : "pointer" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!readOnly) setSelection({ type: "structure", id: s.id });
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        if (!readOnly) {
                          emit({ structures: structures.filter((x) => x.id !== s.id) });
                          setSelection(null);
                        }
                      }}
                    />
                    {active && (
                      <path
                        d={pointsToPath(s.points)}
                        fill="none"
                        stroke="#c83733"
                        strokeWidth={(s.kind === "wall" ? 6 : 3) + 6}
                        strokeOpacity={0.25}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}
                    <path
                      d={pointsToPath(s.points)}
                      fill="none"
                      stroke={s.kind === "wall" ? "#1e293b" : "#78716c"}
                      strokeWidth={s.kind === "wall" ? 6 : 3}
                      strokeDasharray={s.kind === "fence" ? "10 6" : undefined}
                      strokeLinecap="square"
                      strokeLinejoin="miter"
                      pointerEvents="none"
                    />
                  </g>
                );
              })}

              {/* Draft structure preview */}
              {previewPoints.length > 0 && (
                <g pointerEvents="none">
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
                    <circle key={i} cx={p.x} cy={p.y} r={4} fill="#c83733" />
                  ))}
                </g>
              )}

              {/* Cables */}
              {canvas.edges.map((edge) => {
                const a = nodeMap.get(edge.from);
                const b = nodeMap.get(edge.to);
                if (!a || !b) return null;
                const active = selection?.type === "edge" && selection.id === edge.id;
                const x1 = a.x + NODE_W / 2;
                const y1 = a.y + NODE_H / 2;
                const x2 = b.x + NODE_W / 2;
                const y2 = b.y + NODE_H / 2;
                return (
                  <g key={edge.id} data-edge>
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke="transparent"
                      strokeWidth={12}
                      style={{ cursor: readOnly ? "default" : "pointer" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!readOnly) setSelection({ type: "edge", id: edge.id });
                      }}
                    />
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={active ? "#c83733" : "#16a34a"}
                      strokeWidth={active ? 3.5 : 2.5}
                      strokeLinecap="round"
                      pointerEvents="none"
                    />
                  </g>
                );
              })}

              {/* Nodes */}
              {canvas.nodes.map((node) => {
                const device = deviceByNode.get(node.id);
                const accent = NODE_KIND_ACCENT[node.kind] ?? "#94a3b8";
                const isSelected = selection?.type === "node" && selection.id === node.id;
                const isCableSource = cableFrom === node.id;
                const highlight = isSelected || isCableSource;
                return (
                  <g
                    key={node.id}
                    data-node
                    transform={`translate(${node.x} ${node.y})`}
                    onClick={(e) => handleNodeClick(e, node.id)}
                    onPointerDown={(e) => handleNodePointerDown(e, node.id)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      if (!readOnly) {
                        emit({
                          nodes: canvas.nodes.filter((n) => n.id !== node.id),
                          edges: canvas.edges.filter(
                            (ed) => ed.from !== node.id && ed.to !== node.id
                          ),
                        });
                        setSelection(null);
                      }
                    }}
                    style={{
                      cursor: readOnly ? "default" : tool === "cable" ? "pointer" : "grab",
                    }}
                  >
                    {highlight && (
                      <rect
                        x={-4}
                        y={-4}
                        width={NODE_W + 8}
                        height={NODE_H + 8}
                        rx={12}
                        fill="none"
                        stroke="#c83733"
                        strokeWidth={2}
                        strokeOpacity={0.9}
                      />
                    )}
                    <rect
                      width={NODE_W}
                      height={NODE_H}
                      rx={10}
                      fill="#ffffff"
                      stroke={highlight ? "#c83733" : "#e2e8f0"}
                      strokeWidth={highlight ? 2 : 1.25}
                      filter="url(#node-shadow)"
                    />
                    <path d={topStripPath(NODE_W, 6, 10)} fill={accent} opacity={0.9} />
                    <foreignObject x={16} y={12} width={40} height={40}>
                      <div className="flex h-10 w-10 items-center justify-center">
                        <DeviceKindIcon kind={node.kind} size={36} />
                      </div>
                    </foreignObject>
                    <text
                      x={NODE_W / 2}
                      y={68}
                      textAnchor="middle"
                      fill="#0f172a"
                      fontSize={10}
                      fontWeight={700}
                    >
                      {(node.label || shortLabel(node.kind)).slice(0, 14)}
                    </text>
                    {device && (
                      <foreignObject x={NODE_W - 12} y={-11} width={58} height={20}>
                        <DeviceStatusBadge status={device.status} />
                      </foreignObject>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Empty state overlay */}
          {isEmpty && !readOnly && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/70">
                <Grid3x3 className="h-6 w-6 text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-600">Start your network layout</p>
              <p className="max-w-xs text-xs text-slate-400">
                Pick a device from the palette and click to place it. Trace walls and fences,
                then draw cables between devices.
              </p>
            </div>
          )}

          {/* Mobile hint */}
          {!readOnly && (
            <div className="pointer-events-none absolute bottom-2 left-2 right-2 rounded-md bg-white/90 px-2 py-1 text-[11px] text-muted-foreground shadow-sm sm:hidden">
              {hint}
            </div>
          )}
        </div>
      </div>

      {/* Inspector */}
      {!readOnly && (
        <div className="w-full shrink-0 xl:w-72">
          <Inspector
            selection={selection}
            selectedNode={selectedNode}
            selectedStructure={selectedStructure}
            device={selectedNode ? deviceByNode.get(selectedNode.id) ?? null : null}
            nodes={canvas.nodes}
            edges={canvas.edges}
            structures={structures}
            onRename={renameNode}
            onDelete={deleteSelection}
          />
        </div>
      )}
    </div>
  );
}

/* ---------- Toolbar primitives ---------- */

function ToolbarGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-0.5">{children}</div>;
}

function ToolbarDivider() {
  return <div className="mx-1 h-5 w-px bg-border" />;
}

function ToolbarButton({
  children,
  label,
  onClick,
  disabled,
  active,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md transition-colors disabled:opacity-40 [&_svg]:h-4 [&_svg]:w-4",
        active
          ? "bg-primary/10 text-primary ring-1 ring-primary/30"
          : "text-muted-foreground hover:bg-background hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

/* ---------- Inspector ---------- */

function Inspector({
  selection,
  selectedNode,
  selectedStructure,
  device,
  nodes,
  edges,
  structures,
  onRename,
  onDelete,
}: {
  selection: Selection;
  selectedNode: NetworkCanvasNode | null;
  selectedStructure: NetworkCanvasStructure | null;
  device: NetworkDevice | null;
  nodes: NetworkCanvasNode[];
  edges: { id: string }[];
  structures: NetworkCanvasStructure[];
  onRename: (id: string, label: string) => void;
  onDelete: () => void;
}) {
  if (selectedNode) {
    return (
      <div className="rounded-xl border border-border bg-surface-elevated p-3 shadow-sm">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background"
            style={{ boxShadow: `inset 0 2px 0 ${NODE_KIND_ACCENT[selectedNode.kind]}` }}
          >
            <DeviceKindIcon kind={selectedNode.kind} size={28} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{NODE_KIND_LABELS[selectedNode.kind]}</p>
            {device && <DeviceStatusBadge status={device.status} className="mt-0.5" />}
          </div>
        </div>

        <label className="mt-3 block text-[11px] font-medium text-muted-foreground">Label</label>
        <input
          value={selectedNode.label}
          onChange={(e) => onRename(selectedNode.id, e.target.value)}
          placeholder="Name this device"
          className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />

        <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-md bg-muted/50 px-2 py-1.5">
            <dt className="text-muted-foreground">X</dt>
            <dd className="font-medium tabular-nums">{Math.round(selectedNode.x)}</dd>
          </div>
          <div className="rounded-md bg-muted/50 px-2 py-1.5">
            <dt className="text-muted-foreground">Y</dt>
            <dd className="font-medium tabular-nums">{Math.round(selectedNode.y)}</dd>
          </div>
        </dl>

        {device && (device.serialNumber || device.externalId) && (
          <dl className="mt-2 space-y-1 text-[11px]">
            {device.serialNumber && (
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Serial</dt>
                <dd className="truncate font-medium">{device.serialNumber}</dd>
              </div>
            )}
            {device.externalId && (
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">External ID</dt>
                <dd className="truncate font-medium">{device.externalId}</dd>
              </div>
            )}
          </dl>
        )}
        {selectedNode.kind === "ruijie_router" && (
          <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
            Provision serial &amp; live status in the Ruijie devices panel below after saving.
          </p>
        )}

        <button
          type="button"
          onClick={onDelete}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete device
        </button>
      </div>
    );
  }

  if (selectedStructure) {
    const label = selectedStructure.kind === "wall" ? "Wall" : "Fence";
    return (
      <div className="rounded-xl border border-border bg-surface-elevated p-3 shadow-sm">
        <p className="border-b border-border pb-3 text-sm font-semibold">{label}</p>
        <dl className="mt-3 space-y-1 text-[11px]">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Corners</dt>
            <dd className="font-medium">{selectedStructure.points.length}</dd>
          </div>
        </dl>
        <button
          type="button"
          onClick={onDelete}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete {label.toLowerCase()}
        </button>
      </div>
    );
  }

  if (selection?.type === "edge") {
    return (
      <div className="rounded-xl border border-border bg-surface-elevated p-3 shadow-sm">
        <p className="border-b border-border pb-3 text-sm font-semibold">Cable</p>
        <p className="mt-3 text-[11px] text-muted-foreground">Connection between two devices.</p>
        <button
          type="button"
          onClick={onDelete}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete cable
        </button>
      </div>
    );
  }

  // Nothing selected → overview / legend
  const counts = new Map<NetworkNodeKind, number>();
  for (const n of nodes) counts.set(n.kind, (counts.get(n.kind) ?? 0) + 1);
  const wallCount = structures.filter((s) => s.kind === "wall").length;
  const fenceCount = structures.filter((s) => s.kind === "fence").length;

  return (
    <div className="rounded-xl border border-border bg-surface-elevated p-3 shadow-sm">
      <p className="text-sm font-semibold">Layout overview</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        Select any item on the canvas to edit it.
      </p>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <SummaryStat value={nodes.length} label="Devices" />
        <SummaryStat value={edges.length} label="Cables" />
        <SummaryStat value={wallCount + fenceCount} label="Structures" />
      </div>

      {counts.size > 0 ? (
        <div className="mt-3">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Legend
          </p>
          <ul className="space-y-1">
            {[...counts.entries()].map(([kind, count]) => (
              <li key={kind} className="flex items-center gap-2 text-xs">
                <span
                  className="flex h-6 w-6 items-center justify-center rounded border border-border bg-background"
                  style={{ boxShadow: `inset 0 2px 0 ${NODE_KIND_ACCENT[kind]}` }}
                >
                  <DeviceKindIcon kind={kind} size={18} />
                </span>
                <span className="flex-1 text-foreground/80">{NODE_KIND_LABELS[kind]}</span>
                <span className="font-semibold tabular-nums">{count}</span>
              </li>
            ))}
            {wallCount > 0 && <LegendLine swatch="wall" label="Wall" count={wallCount} />}
            {fenceCount > 0 && <LegendLine swatch="fence" label="Fence" count={fenceCount} />}
          </ul>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          No items yet — place devices from the palette to build the layout.
        </p>
      )}
    </div>
  );
}

function SummaryStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 px-2 py-2 text-center">
      <p className="text-lg font-semibold leading-none tabular-nums">{value}</p>
      <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

function LegendLine({
  swatch,
  label,
  count,
}: {
  swatch: "wall" | "fence";
  label: string;
  count: number;
}) {
  return (
    <li className="flex items-center gap-2 text-xs">
      <span className="flex h-6 w-6 items-center justify-center rounded border border-border bg-background">
        <svg width={18} height={18} viewBox="0 0 18 18">
          <line
            x1={2}
            y1={9}
            x2={16}
            y2={9}
            stroke={swatch === "wall" ? "#1e293b" : "#78716c"}
            strokeWidth={swatch === "wall" ? 3 : 2}
            strokeDasharray={swatch === "fence" ? "3 2" : undefined}
          />
        </svg>
      </span>
      <span className="flex-1 text-foreground/80">{label}</span>
      <span className="font-semibold tabular-nums">{count}</span>
    </li>
  );
}
