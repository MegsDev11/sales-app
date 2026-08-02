"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  NetworkCanvasBackdrop,
  NetworkCanvasDocument,
  NetworkCanvasNode,
  NetworkCanvasPoint,
  NetworkCanvasStructure,
  NetworkDevice,
  NetworkLayoutAsset,
  NetworkNodeKind,
  NetworkStructureKind,
  PaletteTool,
} from "@/lib/wireless/layout-types";
import {
  isSiteMarker,
  NODE_KIND_ACCENT,
  NODE_KIND_LABELS,
} from "@/lib/wireless/layout-types";
import { DeviceStatusBadge } from "@/components/wireless/device-status-badge";
import { DevicePalette } from "@/components/wireless/device-palette";
import { DeviceKindIcon } from "@/components/wireless/device-icons";
import { SitePhotoDialog } from "@/components/wireless/site-photo-gallery";
import { cn } from "@/lib/utils";
import {
  Expand,
  Grid3x3,
  Image as ImageIcon,
  Images,
  Lock,
  LockOpen,
  Magnet,
  Maximize2,
  Minimize2,
  MousePointerClick,
  Redo2,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

const GRID = 20;
const MAJOR = GRID * 5;
/**
 * Node footprint.
 *
 * Every node is one small map annotation now — a pin, not a card. The old 72x78
 * (and 108x96 for markers) was sized for a schematic on an empty grid; dropped onto
 * a property aerial those covered whole buildings, which defeats the point of
 * having the aerial. The box is the hit target and the label anchor; the glyph
 * itself is drawn centred in the top of it.
 */
const NODE_W = 34;
const NODE_H = 46;
/** Centre of the glyph within the box — everything anchors and connects here. */
const ICON_CX = NODE_W / 2;
const ICON_CY = 15;
const ICON_R = 13;
/**
 * Wide enough to hold a whole farm and still get down to one chalet roof. The old
 * 0.4–2.5 band was sized for a schematic on a grid; a 1400-unit-wide aerial needs
 * to come well below that to fit, and well above it to place a device precisely.
 */
const MIN_ZOOM = 0.08;
const MAX_ZOOM = 8;
const HISTORY_LIMIT = 60;

type Selection =
  | { type: "node"; id: string }
  | { type: "structure"; id: string }
  | { type: "edge"; id: string }
  | { type: "backdrop" }
  | null;

/** Grab area for the backdrop's bottom-right resize corner, in canvas units. */
const HANDLE = 14;

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
    case "site_marker":
      // A marker's label is read by a human in an office, so it starts as a word
      // they can edit rather than an abbreviation they have to decode.
      return "New building";
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
  layoutId,
  assets = [],
  onChange,
}: {
  canvas: NetworkCanvasDocument;
  devices?: NetworkDevice[];
  readOnly?: boolean;
  /** Legacy: a layout whose image predates positioned backdrops. */
  backgroundUrl?: string | null;
  /** Required for site-marker photos — without it markers are name-only. */
  layoutId?: string;
  assets?: NetworkLayoutAsset[];
  onChange?: (next: NetworkCanvasDocument) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tool, setTool] = useState<PaletteTool>("select");
  const [selection, setSelection] = useState<Selection>(null);
  const [cableFrom, setCableFrom] = useState<string | null>(null);
  const [draftPoints, setDraftPoints] = useState<NetworkCanvasPoint[]>([]);
  const [cursorWorld, setCursorWorld] = useState<NetworkCanvasPoint | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [photoNodeId, setPhotoNodeId] = useState<string | null>(null);
  const backdropStart = useRef({ px: 0, py: 0, x: 0, y: 0, w: 0, h: 0 });
  const [pan, setPan] = useState({ x: canvas.viewport?.x ?? 0, y: canvas.viewport?.y ?? 0 });
  const [zoom, setZoom] = useState(canvas.viewport?.zoom ?? 1);
  /** Mirrors `zoom` so rapid wheel events compose instead of racing a re-render. */
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const [panning, setPanning] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [showBackground, setShowBackground] = useState(true);
  /** Full-screen canvas — a property aerial needs the room. */
  const [expanded, setExpanded] = useState(false);
  // Snapping off when there is an aerial to work against: a device belongs on the
  // chalet it serves, not on the nearest 20px gridline.
  const [snapEnabled, setSnapEnabled] = useState(!canvas.backdrop);
  const [past, setPast] = useState<NetworkCanvasDocument[]>([]);
  const [future, setFuture] = useState<NetworkCanvasDocument[]>([]);

  const panStart = useRef({ x: 0, y: 0, px: 0, py: 0 });
  const dragStart = useRef<NetworkCanvasDocument | null>(null);
  const dragHistoryPushed = useRef(false);
  const dragMoved = useRef(false);
  /** Distinguishes a pan from a click, so dragging the map never drops a device. */
  const panMoved = useRef(false);
  /**
   * Gesture flags mirrored into refs.
   *
   * pointerdown and pointermove can both land inside one React batch, so a move
   * handler that reads `panning`/`dragId`/`backdropDrag` from state sees the value
   * from BEFORE the gesture started and does nothing. On a quick flick that meant
   * the drag was dropped and the closing click placed a device instead of moving
   * the map. The state copies still exist — they drive the cursor — but every
   * decision inside the move handler reads these.
   */
  const panningRef = useRef(false);
  const dragIdRef = useRef<string | null>(null);
  /** null = not dragging the backdrop; "move" or "resize" while we are. */
  const backdropDragRef = useRef<"move" | "resize" | null>(null);
  /**
   * Backdrop the view has already been framed against.
   *
   * Seeded with whatever the layout opened with, so reopening a plan keeps the
   * viewport someone saved. It only differs once a NEW image is uploaded — and
   * that is the moment the view should jump to it, since a 1400-unit aerial
   * dropped onto a 100%-zoom canvas otherwise lands mostly off screen.
   */
  const fittedAsset = useRef<string | null>(canvas.backdrop?.assetId ?? null);

  const structures = canvas.structures ?? [];
  const backdrop = canvas.backdrop ?? null;
  const deviceByNode = useMemo(
    () => new Map(devices.map((d) => [d.nodeId, d])),
    [devices]
  );
  const nodeMap = useMemo(
    () => new Map(canvas.nodes.map((n) => [n.id, n])),
    [canvas.nodes]
  );

  /** Photos grouped by the marker they hang off, in display order. */
  const photosByNode = useMemo(() => {
    const map = new Map<string, NetworkLayoutAsset[]>();
    for (const asset of assets) {
      if (!asset.nodeId || asset.kind === "backdrop") continue;
      const list = map.get(asset.nodeId) ?? [];
      list.push(asset);
      map.set(asset.nodeId, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
    }
    return map;
  }, [assets]);

  const backdropUrl = useMemo(() => {
    if (backdrop) {
      return assets.find((a) => a.id === backdrop.assetId)?.publicUrl ?? null;
    }
    return backgroundUrl;
  }, [assets, backdrop, backgroundUrl]);

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

  /**
   * Remove a node from the canvas.
   *
   * Its photos are deliberately NOT deleted here. Deleting a node is an unsaved,
   * undoable canvas edit; deleting its photos was an immediate, irreversible write
   * to storage. Ctrl+Z or simply closing without saving brought the marker back
   * with its gallery permanently emptied. The server prunes photos whose marker is
   * gone when the canvas is actually saved — see save_layout in /api/wireless.
   */
  function deleteNode(nodeId: string) {
    emit({
      nodes: canvas.nodes.filter((n) => n.id !== nodeId),
      edges: canvas.edges.filter((ed) => ed.from !== nodeId && ed.to !== nodeId),
    });
  }

  function deleteSelection() {
    if (readOnly || !selection) return;
    if (selection.type === "node") {
      deleteNode(selection.id);
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

  function patchBackdrop(patch: Partial<NetworkCanvasBackdrop>, history = true) {
    if (!backdrop) return;
    emit({ backdrop: { ...backdrop, ...patch } }, { history });
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
        // Full screen first — Escape has to be the way out of it before it is the
        // way to clear a selection, or there is no way out without the mouse.
        if (expanded) {
          setExpanded(false);
          return;
        }
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
  }, [tool, draftPoints, readOnly, structures, selection, past, future, canvas, expanded]);

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
    // The click that ends a pan is not a placement. Checked before anything else,
    // since dragging across the property is now the primary gesture.
    if (panMoved.current) {
      panMoved.current = false;
      return;
    }
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
      id: newId(isSiteMarker(tool) ? "site" : "n"),
      kind: tool,
      x: snap(x - ICON_CX),
      y: snap(y - ICON_CY),
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
    const node = nodeMap.get(nodeId);

    // A marker on a published plan is a link to its photos — that is the whole
    // reason someone in the office opens one of these.
    if (readOnly) {
      if (node && isSiteMarker(node.kind) && (photosByNode.get(nodeId)?.length ?? 0) > 0) {
        setPhotoNodeId(nodeId);
      }
      return;
    }
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
    dragIdRef.current = nodeId;
    setDragId(nodeId);
    dragStart.current = canvas;
    dragHistoryPushed.current = false;
    dragMoved.current = false;
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (backdropDragRef.current) {
      handleBackdropPointerMove(e);
      return;
    }
    if (isStructureTool(tool)) {
      const { x, y } = clientToWorld(e.clientX, e.clientY);
      setCursorWorld({ x: snap(x), y: snap(y) });
    }
    if (panningRef.current) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      // A few pixels of travel while clicking is a click, not a drag — without the
      // slop a slightly shaky click on the map would swallow the placement.
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) panMoved.current = true;
      setPan({ x: panStart.current.px + dx, y: panStart.current.py + dy });
      return;
    }
    const dragging = dragIdRef.current;
    if (!dragging || readOnly) return;
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
          n.id === dragging
            ? { ...n, x: snap(x - ICON_CX), y: snap(y - ICON_CY) }
            : n
        ),
      },
      { history: false }
    );
  }

  function handlePointerUp() {
    if (panningRef.current) applyDoc(canvas); // persist viewport
    panningRef.current = false;
    dragIdRef.current = null;
    backdropDragRef.current = null;
    setDragId(null);
    setPanning(false);
  }

  /**
   * Backdrop move / resize.
   *
   * Kept separate from node dragging because the constraints differ: the image
   * resizes from one corner with its aspect ratio held, and it never snaps to the
   * grid — an aerial lines up with the ground, not with 20px increments.
   */
  function handleBackdropPointerDown(e: React.PointerEvent, mode: "move" | "resize") {
    if (readOnly || !backdrop || backdrop.locked) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setSelection({ type: "backdrop" });
    backdropDragRef.current = mode;
    const world = clientToWorld(e.clientX, e.clientY);
    backdropStart.current = {
      px: world.x,
      py: world.y,
      x: backdrop.x,
      y: backdrop.y,
      w: backdrop.width,
      h: backdrop.height,
    };
    setPast((p) => [...p.slice(-(HISTORY_LIMIT - 1)), canvas]);
    setFuture([]);
  }

  function handleBackdropPointerMove(e: React.PointerEvent) {
    if (!backdropDragRef.current || !backdrop) return;
    const world = clientToWorld(e.clientX, e.clientY);
    const start = backdropStart.current;
    const dx = world.x - start.px;
    const dy = world.y - start.py;

    if (backdropDragRef.current === "move") {
      patchBackdrop({ x: Math.round(start.x + dx), y: Math.round(start.y + dy) }, false);
      return;
    }
    // Aspect ratio is locked to the width the pointer asks for. Free resize would
    // stretch a photograph, and a stretched aerial silently misplaces every marker.
    const ratio = start.h / (start.w || 1);
    const width = Math.max(80, Math.round(start.w + dx));
    patchBackdrop({ width, height: Math.max(60, Math.round(width * ratio)) }, false);
  }

  /**
   * Zoom about a fixed screen point, the way every map does it.
   *
   * The old version just changed `zoom`, which pulls the view toward the canvas
   * origin — on a property aerial that means the thing you were looking at slides
   * off screen every time you scroll. Holding the world point under the cursor
   * still is what makes it feel like Google Earth rather than a diagram tool.
   */
  const zoomAt = useCallback(
    (factor: number, clientX?: number, clientY?: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const sx = (clientX ?? rect.left + rect.width / 2) - rect.left;
      const sy = (clientY ?? rect.top + rect.height / 2) - rect.top;

      // Read and advance through a ref, not through state. A trackpad emits wheel
      // events faster than React re-renders, and two reading the same stale `zoom`
      // would each compute the same step — the view would stall mid-gesture.
      const prev = zoomRef.current;
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev * factor));
      if (next === prev) return;
      zoomRef.current = next;
      setZoom(next);

      // Screen point = world * zoom + pan, so holding it fixed means
      // pan' = screen - (screen - pan) * next / prev.
      setPan((p) => ({
        x: sx - ((sx - p.x) * next) / prev,
        y: sy - ((sy - p.y) * next) / prev,
      }));
    },
    []
  );

  /**
   * Wheel-to-zoom, bound natively rather than through React's `onWheel`.
   *
   * React attaches wheel listeners at the root as PASSIVE, which makes
   * `e.preventDefault()` inside a synthetic handler a silent no-op — the canvas
   * zoomed and the page scrolled underneath it at the same time. A listener bound
   * straight to the svg with `{ passive: false }` is the only way to cancel the
   * scroll. `zoomAt` is a stable useCallback, so this binds once.
   */
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      // Multiplicative, so one notch covers the same visual distance whether you
      // are looking at the whole farm or at one chalet roof. Trackpad pinch
      // arrives as ctrl+wheel with much finer deltas, hence the softer exponent.
      const intensity = e.ctrlKey ? 0.01 : 0.0022;
      zoomAt(Math.exp(-e.deltaY * intensity), e.clientX, e.clientY);
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  function startPan(e: React.PointerEvent) {
    const target = e.target as Element;
    // Anything the pointer can grab and move runs its own drag. An UNLOCKED
    // backdrop is in that set and stops propagation before this ever fires; a
    // locked one lets the event through, so the image behaves as ground you drag
    // across. That is why backdrops default to locked.
    const onItem =
      target.closest("[data-node]") ||
      target.closest("[data-structure]") ||
      target.closest("[data-edge]");

    // Left-drag on open ground pans, like a map. Middle-drag and alt-drag pan from
    // anywhere, which is how you get out from under a node that fills the screen.
    const grab = e.button === 1 || e.altKey || (e.button === 0 && !onItem);
    if (!grab) return;

    panningRef.current = true;
    setPanning(true);
    panMoved.current = false;
    panStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
  }

  function zoomBy(factor: number) {
    zoomAt(factor);
  }

  function resetView() {
    zoomRef.current = 1;
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
    // The backdrop counts as content — on a property plan it is usually the
    // largest thing on the canvas, and fitting to the markers alone would crop it.
    if (backdrop && showBackground) {
      xs.push(backdrop.x, backdrop.x + backdrop.width);
      ys.push(backdrop.y, backdrop.y + backdrop.height);
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
    zoomRef.current = nextZoom;
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
    "Click the map to place it. Drag the map to move around, scroll to zoom.";
  if (tool === "select")
    hint =
      "Drag the map to move around, scroll to zoom. Click a device to edit it, drag it to reposition.";
  if (tool === "site_marker")
    hint = "Click the building on the map, then name it and add photos.";
  if (tool === "cable") hint = cableFrom ? "Click the second device to finish the cable." : "Click the first device to start a cable.";
  if (isStructureTool(tool)) {
    hint =
      draftPoints.length > 0
        ? `${tool === "wall" ? "Wall" : "Fence"}: ${draftPoints.length} point(s) — click the next corner, double-click / Enter to finish, Esc to cancel.`
        : `Click each corner to trace a ${tool}. Double-click or press Enter to finish.`;
  }

  return (
    <div
      className={cn(
        // A two-column grid with the palette spanning both, rather than three
        // columns side by side. The palette used to be a 224px column down the
        // left; moving it to a full-width row hands that back to the map, which is
        // the only element here that benefits from every pixel. Grid rather than
        // nested flex rows so the canvas stays a direct child and keeps its
        // min-width-0 shrink behaviour.
        "grid gap-3",
        // The second track only exists when there is an inspector to put in it.
        // Read-only viewers (the client profile) render the canvas alone, and a
        // fixed 18rem column there would reserve 288px for nothing.
        !readOnly && "xl:grid-cols-[minmax(0,1fr)_18rem]",
        // Full screen is the whole point on a property this size — the palette and
        // inspector come along so you can keep placing devices while zoomed in.
        expanded && "fixed inset-0 z-50 gap-2 overflow-auto bg-background p-3"
      )}
    >
      {/* Palette */}
      {!readOnly && (
        // min-w-0 is load-bearing. The palette's overflow-x-auto is on the element
        // INSIDE this wrapper, so it does not zero the grid item's automatic
        // minimum size — without this the item's ~800px min-content width becomes
        // the track width below xl, stretching the canvas card off screen instead
        // of letting the palette scroll.
        <div className="min-w-0 xl:col-span-2">
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
              <ToolbarButton label="Zoom out" onClick={() => zoomBy(1 / 1.35)} disabled={zoom <= MIN_ZOOM}>
                <ZoomOut />
              </ToolbarButton>
              <span className="w-11 text-center text-xs font-medium tabular-nums text-muted-foreground">
                {(zoom * 100).toFixed(0)}%
              </span>
              <ToolbarButton label="Zoom in" onClick={() => zoomBy(1.35)} disabled={zoom >= MAX_ZOOM}>
                <ZoomIn />
              </ToolbarButton>
              <ToolbarButton label="Fit the whole property in view" onClick={fitToContent}>
                <Maximize2 />
              </ToolbarButton>
              <ToolbarButton label="Reset view (100%)" onClick={resetView}>
                <MousePointerClick />
              </ToolbarButton>
              <ToolbarButton
                label={expanded ? "Exit full screen" : "Full screen"}
                active={expanded}
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? <Minimize2 /> : <Expand />}
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
              {backdropUrl && (
                <ToolbarButton
                  label="Show / hide the property image"
                  active={showBackground}
                  onClick={() => setShowBackground((v) => !v)}
                >
                  <ImageIcon />
                </ToolbarButton>
              )}
            </ToolbarGroup>

            {/* Backdrop controls only appear once there is one to control. */}
            {backdrop && showBackground && (
              <>
                <ToolbarDivider />
                <ToolbarGroup>
                  <ToolbarButton
                    label={
                      backdrop.locked
                        ? "Unlock the property image so it can be moved"
                        : "Lock the property image in place"
                    }
                    active={backdrop.locked}
                    onClick={() => patchBackdrop({ locked: !backdrop.locked })}
                  >
                    {backdrop.locked ? <Lock /> : <LockOpen />}
                  </ToolbarButton>
                  <label className="flex items-center gap-1.5 pl-1 pr-1 text-[11px] text-muted-foreground">
                    <span className="hidden sm:inline">Fade</span>
                    <input
                      type="range"
                      min={20}
                      max={100}
                      step={5}
                      value={Math.round(backdrop.opacity * 100)}
                      aria-label="Property image opacity"
                      onChange={(e) =>
                        patchBackdrop({ opacity: Number(e.target.value) / 100 }, false)
                      }
                      className="h-1 w-16 cursor-pointer accent-primary"
                    />
                  </label>
                </ToolbarGroup>
              </>
            )}
            <div className="ml-auto hidden max-w-[46%] truncate pr-1 text-[11px] text-muted-foreground sm:block">
              {hint}
            </div>
          </div>
        )}

        <div className="relative min-h-[420px] flex-1 overflow-hidden bg-[#f8fafc]">
          <svg
            ref={svgRef}
            className={cn(
              "w-full touch-none",
              // 10rem is the measured full-screen chrome: 12px container padding
              // top and bottom, a 62px palette row, an 8px gap, and the 62px view
              // toolbar. Under-reserving made the container scroll, which is the
              // one thing full screen exists to avoid.
              expanded ? "h-[calc(100vh-10rem)]" : "h-[560px] xl:h-[660px]",
              // Open ground reads as draggable, because now it is.
              tool === "select" && !dragId ? "cursor-grab" : "cursor-crosshair",
              panning && "cursor-grabbing"
            )}
            onClick={handleCanvasClick}
            onDoubleClick={handleCanvasDoubleClick}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onPointerDown={startPan}
            // No onWheel here on purpose — see the non-passive listener above.
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
              {/* Property backdrop — the aerial or site plan everything is drawn on. */}
              {backdropUrl && showBackground && (
                <g>
                  <image
                    href={backdropUrl}
                    x={backdrop?.x ?? 0}
                    y={backdrop?.y ?? 0}
                    width={backdrop?.width ?? 900}
                    height={backdrop?.height ?? 600}
                    opacity={backdrop?.opacity ?? 0.35}
                    preserveAspectRatio={backdrop ? "none" : "xMidYMid meet"}
                    // Framing on load, not in an effect: this is exactly when the
                    // image exists and its box is known.
                    onLoad={() => {
                      const id = backdrop?.assetId ?? null;
                      if (id && id !== fittedAsset.current) {
                        fittedAsset.current = id;
                        fitToContent();
                      }
                    }}
                    style={{
                      cursor:
                        readOnly || !backdrop || backdrop.locked ? "inherit" : "move",
                    }}
                    onPointerDown={(e) => handleBackdropPointerDown(e, "move")}
                    onClick={(e) => {
                      // A LOCKED backdrop is ground, not an object: the click falls
                      // through to the canvas so devices land ON the property image.
                      // Swallowing it here is what made the image un-droppable while
                      // the bare grid beside it worked fine. Unlock the image and it
                      // becomes selectable again, which is when you actually want to
                      // grab it rather than draw on it.
                      if (readOnly || !backdrop || backdrop.locked) return;
                      e.stopPropagation();
                      setSelection({ type: "backdrop" });
                    }}
                  />
                  {backdrop && selection?.type === "backdrop" && !readOnly && (
                    <g>
                      <rect
                        x={backdrop.x}
                        y={backdrop.y}
                        width={backdrop.width}
                        height={backdrop.height}
                        fill="none"
                        stroke="#c83733"
                        strokeWidth={2}
                        strokeDasharray="8 5"
                        pointerEvents="none"
                      />
                      {!backdrop.locked && (
                        <rect
                          x={backdrop.x + backdrop.width - HANDLE / 2}
                          y={backdrop.y + backdrop.height - HANDLE / 2}
                          width={HANDLE}
                          height={HANDLE}
                          rx={3}
                          fill="#ffffff"
                          stroke="#c83733"
                          strokeWidth={2}
                          style={{ cursor: "nwse-resize" }}
                          onPointerDown={(e) => handleBackdropPointerDown(e, "resize")}
                        />
                      )}
                    </g>
                  )}
                </g>
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
                const x1 = a.x + ICON_CX;
                const y1 = a.y + ICON_CY;
                const x2 = b.x + ICON_CX;
                const y2 = b.y + ICON_CY;
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
                const marker = isSiteMarker(node.kind);
                
                const photos = marker ? photosByNode.get(node.id) ?? [] : [];

                return (
                  <g
                    key={node.id}
                    data-node
                    transform={`translate(${node.x} ${node.y})`}
                    onClick={(e) => handleNodeClick(e, node.id)}
                    onPointerDown={(e) => handleNodePointerDown(e, node.id)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      if (readOnly) return;
                      // Double-click opens the gallery on a marker; on a device it
                      // is still the quick delete it has always been.
                      if (marker) {
                        setPhotoNodeId(node.id);
                        return;
                      }
                      deleteNode(node.id);
                      setSelection(null);
                    }}
                    style={{
                      cursor: readOnly
                        ? marker && photos.length > 0
                          ? "pointer"
                          : "default"
                        : tool === "cable"
                          ? "pointer"
                          : "grab",
                    }}
                  >
                    {/* Selection halo — a ring around the glyph, not a box. */}
                    {highlight && (
                      <circle
                        cx={ICON_CX}
                        cy={ICON_CY}
                        r={ICON_R + 5}
                        fill="none"
                        stroke="#c83733"
                        strokeWidth={2}
                        strokeOpacity={0.9}
                      />
                    )}

                    {marker ? (
                      // A site marker is just the placemark. The pin already carries
                      // its own white fill and orange outline, so it reads over an
                      // aerial without a card behind it.
                      <foreignObject x={ICON_CX - 17} y={0} width={34} height={34}>
                        <div className="flex h-[34px] w-[34px] items-center justify-center">
                          <DeviceKindIcon kind={node.kind} size={34} />
                        </div>
                      </foreignObject>
                    ) : (
                      <>
                        {/* A disc, never a square: it separates the device artwork
                            from whatever is underneath without becoming a box on
                            the map. */}
                        <circle
                          cx={ICON_CX}
                          cy={ICON_CY}
                          r={ICON_R}
                          fill="#ffffff"
                          stroke={highlight ? "#c83733" : accent}
                          strokeWidth={highlight ? 2 : 1.75}
                          filter="url(#node-shadow)"
                        />
                        <foreignObject x={ICON_CX - 9} y={ICON_CY - 9} width={18} height={18}>
                          <div className="flex h-[18px] w-[18px] items-center justify-center">
                            <DeviceKindIcon kind={node.kind} size={18} />
                          </div>
                        </foreignObject>
                      </>
                    )}

                    {/* Photo count, pinned to the marker's shoulder. */}
                    {marker && photos.length > 0 && (
                      <>
                        <circle cx={ICON_CX + 12} cy={6} r={7} fill="#0f172a" opacity={0.85} />
                        <text
                          x={ICON_CX + 12}
                          y={9}
                          textAnchor="middle"
                          fill="#ffffff"
                          fontSize={8}
                          fontWeight={700}
                          pointerEvents="none"
                        >
                          {photos.length > 9 ? "9+" : photos.length}
                        </text>
                      </>
                    )}

                    {/*
                      Labels sit on the aerial itself, so they get the standard map
                      treatment: the same text painted as a fat white stroke first,
                      then filled. Without it a dark name over a dark tree line is
                      unreadable, and a solid label chip would put the box back.
                    */}
                    <text
                      x={ICON_CX}
                      y={NODE_H - 8}
                      textAnchor="middle"
                      fontSize={marker ? 11 : 9}
                      fontWeight={700}
                      stroke="#ffffff"
                      strokeWidth={3}
                      strokeLinejoin="round"
                      paintOrder="stroke"
                      fill="#0f172a"
                      pointerEvents="none"
                    >
                      {(node.label || shortLabel(node.kind)).slice(0, 18)}
                    </text>

                    {device && (
                      <foreignObject x={ICON_CX + 6} y={-14} width={58} height={20}>
                        <DeviceStatusBadge status={device.status} />
                      </foreignObject>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>

          {/*
            Empty state — only on a bare canvas.

            Once there is a property image it comes off entirely, even with nothing
            placed yet. Sitting it over the aerial obscures the very thing you are
            reading to decide where the markers go, and by then the toolbar hint and
            the palette are already saying the same thing without covering anything.
          */}
          {isEmpty && !readOnly && !backdropUrl && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/70">
                <Grid3x3 className="h-6 w-6 text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-600">
                Start with the property image
              </p>
              <p className="max-w-xs text-xs text-slate-400">
                Upload an aerial or site plan in the Property panel above, then drop
                markers and devices onto it.
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

      {/* Inspector — the grid gives it its 18rem track, so no width of its own. */}
      {!readOnly && (
        <div className="min-w-0">
          <Inspector
            selection={selection}
            selectedNode={selectedNode}
            selectedStructure={selectedStructure}
            device={selectedNode ? deviceByNode.get(selectedNode.id) ?? null : null}
            backdrop={backdrop}
            nodes={canvas.nodes}
            structures={structures}
            photoCount={selectedNode ? photosByNode.get(selectedNode.id)?.length ?? 0 : 0}
            canManagePhotos={Boolean(layoutId)}
            onRename={renameNode}
            onDelete={deleteSelection}
            onOpenPhotos={() => selectedNode && setPhotoNodeId(selectedNode.id)}
            onPatchBackdrop={patchBackdrop}
          />
        </div>
      )}

      {/* Marker gallery — available in read-only mode too, which is the point of it. */}
      {photoNodeId && layoutId && (
        <SitePhotoDialog
          open
          layoutId={layoutId}
          nodeId={photoNodeId}
          title={nodeMap.get(photoNodeId)?.label || "Site marker"}
          assets={photosByNode.get(photoNodeId) ?? []}
          canEdit={!readOnly}
          onClose={() => setPhotoNodeId(null)}
        />
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
  backdrop,
  nodes,
  structures,
  photoCount,
  canManagePhotos,
  onRename,
  onDelete,
  onOpenPhotos,
  onPatchBackdrop,
}: {
  selection: Selection;
  selectedNode: NetworkCanvasNode | null;
  selectedStructure: NetworkCanvasStructure | null;
  device: NetworkDevice | null;
  backdrop: NetworkCanvasBackdrop | null;
  nodes: NetworkCanvasNode[];
  structures: NetworkCanvasStructure[];
  photoCount: number;
  canManagePhotos: boolean;
  onRename: (id: string, label: string) => void;
  onDelete: () => void;
  onOpenPhotos: () => void;
  onPatchBackdrop: (patch: Partial<NetworkCanvasBackdrop>, history?: boolean) => void;
}) {
  if (selection?.type === "backdrop" && backdrop) {
    return (
      <div className="rounded-xl border border-border bg-surface-elevated p-3 shadow-sm">
        <p className="border-b border-border pb-3 text-sm font-semibold">Property image</p>

        <label className="mt-3 flex items-center justify-between text-[11px] font-medium text-muted-foreground">
          Opacity
          <span className="tabular-nums text-foreground">
            {Math.round(backdrop.opacity * 100)}%
          </span>
        </label>
        <input
          type="range"
          min={20}
          max={100}
          step={5}
          value={Math.round(backdrop.opacity * 100)}
          onChange={(e) => onPatchBackdrop({ opacity: Number(e.target.value) / 100 }, false)}
          className="mt-1 h-1 w-full cursor-pointer accent-primary"
        />

        <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-md bg-muted/50 px-2 py-1.5">
            <dt className="text-muted-foreground">Width</dt>
            <dd className="font-medium tabular-nums">{Math.round(backdrop.width)}</dd>
          </div>
          <div className="rounded-md bg-muted/50 px-2 py-1.5">
            <dt className="text-muted-foreground">Height</dt>
            <dd className="font-medium tabular-nums">{Math.round(backdrop.height)}</dd>
          </div>
        </dl>

        <button
          type="button"
          onClick={() => onPatchBackdrop({ locked: !backdrop.locked })}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
        >
          {backdrop.locked ? (
            <>
              <LockOpen className="h-3.5 w-3.5" /> Unlock to move &amp; resize
            </>
          ) : (
            <>
              <Lock className="h-3.5 w-3.5" /> Lock in place
            </>
          )}
        </button>

        <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
          {backdrop.locked
            ? "Locked, so dragging moves the view rather than the image. Unlock only to reposition or resize it."
            : "Unlocked — dragging now moves the image, and that shifts every marker relative to the ground. Lock it again when it lines up."}
        </p>

        {/*
          No remove button here on purpose. The Property panel above owns removal
          and deletes the stored file with it. A second "remove" that only detached
          the image left the file behind, and the editor then re-adopted that
          orphan on the next load — so the image came back after being removed.
        */}
      </div>
    );
  }

  if (selectedNode) {
    const marker = isSiteMarker(selectedNode.kind);
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

        <label className="mt-3 block text-[11px] font-medium text-muted-foreground">
          {marker ? "Name" : "Label"}
        </label>
        <input
          value={selectedNode.label}
          onChange={(e) => onRename(selectedNode.id, e.target.value)}
          placeholder={marker ? "Chalet 1, Reception, Pump house…" : "Name this device"}
          className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />

        {marker && (
          <>
            {canManagePhotos ? (
              <button
                type="button"
                onClick={onOpenPhotos}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
              >
                <Images className="h-3.5 w-3.5" />
                {photoCount === 0
                  ? "Add photos"
                  : `${photoCount} photo${photoCount === 1 ? "" : "s"} — manage`}
              </button>
            ) : (
              <p className="mt-3 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
                Save this layout once before adding photos.
              </p>
            )}
            <p className="mt-2 text-[11px] text-muted-foreground">
              Double-click the marker on the canvas to open its photos.
            </p>
          </>
        )}

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
          <Trash2 className="h-3.5 w-3.5" />{" "}
          {marker
            ? photoCount > 0
              ? `Delete marker and ${photoCount} photo${photoCount === 1 ? "" : "s"}`
              : "Delete marker"
            : "Delete device"}
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
  // Places and equipment are different things to count — nine chalets and nine
  // switches say very different things about a site.
  const markerCount = nodes.filter((n) => isSiteMarker(n.kind)).length;

  return (
    <div className="rounded-xl border border-border bg-surface-elevated p-3 shadow-sm">
      <p className="text-sm font-semibold">Layout overview</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        Select any item on the canvas to edit it.
      </p>

      {/*
        Places and devices only. Cables and walls still exist as tools and still
        appear in the legend when a layout uses them — but on a property plan they
        are almost always zero, and two permanent zeroes in the headline row read as
        "nothing here" rather than as counts worth checking.
      */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <SummaryStat value={markerCount} label="Places" />
        <SummaryStat value={nodes.length - markerCount} label="Devices" />
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
