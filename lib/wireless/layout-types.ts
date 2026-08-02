export type NetworkNodeKind =
  | "network_point"
  | "server_rack"
  | "switch"
  | "ptz_camera"
  | "printer"
  | "nec_phone"
  | "ruijie_router"
  | "label"
  /**
   * A place on the property rather than a piece of equipment — a chalet, the
   * reception block, a pump house. Carries a photo gallery instead of a serial
   * number, which is what turns a schematic into something the office can read
   * without having been to site.
   */
  | "site_marker";

export type NetworkDeviceStatus = "online" | "offline" | "unknown";

export type NetworkSubmissionStatus = "new" | "in_progress" | "used" | "archived";

export type NetworkLayoutStatus = "draft" | "published";

export type NetworkAssetKind = "sketch" | "photo" | "reference" | "backdrop";

export interface NetworkCanvasNode {
  id: string;
  kind: NetworkNodeKind;
  x: number;
  y: number;
  label: string;
  meta?: Record<string, string>;
}

export interface NetworkCanvasEdge {
  id: string;
  from: string;
  to: string;
}

export type NetworkStructureKind = "wall" | "fence";

export interface NetworkCanvasPoint {
  x: number;
  y: number;
}

/** Drawn building outline / boundary (polyline). */
export interface NetworkCanvasStructure {
  id: string;
  kind: NetworkStructureKind;
  points: NetworkCanvasPoint[];
}

export interface NetworkCanvasViewport {
  x: number;
  y: number;
  zoom: number;
}

/**
 * Where the property image sits on the canvas.
 *
 * Stored in canvas coordinates rather than as a CSS background, because the whole
 * point is that the plan is drawn ON the photo — a marker at (1420, 880) has to
 * stay on its chalet when someone zooms, and that only holds if the image is a
 * positioned object in the same space as the nodes.
 *
 * `locked` is on by default once placed. Nudging a 4000px aerial by accident while
 * dragging a marker would silently move every device relative to the ground.
 */
export interface NetworkCanvasBackdrop {
  assetId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** 0–1. Faded for schematics, near-opaque for aerials you're reading detail from. */
  opacity: number;
  locked: boolean;
}

export interface NetworkCanvasDocument {
  nodes: NetworkCanvasNode[];
  edges: NetworkCanvasEdge[];
  structures: NetworkCanvasStructure[];
  viewport: NetworkCanvasViewport;
  backdrop?: NetworkCanvasBackdrop | null;
  /**
   * Pre-backdrop layouts named a background asset but had nowhere to record its
   * placement, so it rendered at a fixed 900×600. Kept so those layouts still show
   * their image; the canvas upgrades it to a `backdrop` the first time one is
   * positioned.
   */
  backgroundAssetId?: string | null;
}

/** Where the property actually is, parsed from a pasted Google Maps / Earth link. */
export interface NetworkLayoutLocation {
  lat: number;
  lng: number;
  /** Place name as Google gave it — "Marula Lodge" reads better than decimals. */
  label: string;
}

export interface NetworkLayoutSubmission {
  id: string;
  leadId: string | null;
  notes: string;
  status: NetworkSubmissionStatus;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  assets?: NetworkLayoutAsset[];
  clientName?: string;
}

export interface NetworkLayoutAsset {
  id: string;
  submissionId: string | null;
  layoutId: string | null;
  /** The canvas node this photo belongs to — null for layout-wide assets. */
  nodeId: string | null;
  kind: NetworkAssetKind;
  storagePath: string;
  publicUrl: string | null;
  caption: string;
  sortOrder: number;
  createdAt: string;
}

export interface NetworkLayout {
  id: string;
  leadId: string | null;
  title: string;
  status: NetworkLayoutStatus;
  canvas: NetworkCanvasDocument;
  submissionId: string | null;
  createdBy: string | null;
  publishedAt: string | null;
  location: NetworkLayoutLocation | null;
  createdAt: string;
  updatedAt: string;
  devices?: NetworkDevice[];
  assets?: NetworkLayoutAsset[];
  clientName?: string;
}

export interface NetworkDevice {
  id: string;
  layoutId: string;
  nodeId: string;
  vendor: string;
  externalId: string | null;
  serialNumber: string | null;
  macAddress: string | null;
  label: string;
  status: NetworkDeviceStatus;
  lastSeenAt: string | null;
  manualOverride: boolean;
  createdAt: string;
  updatedAt: string;
}

export const EMPTY_CANVAS: NetworkCanvasDocument = {
  nodes: [],
  edges: [],
  structures: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  backdrop: null,
  backgroundAssetId: null,
};

/**
 * Default placement for a freshly uploaded backdrop, before anyone scales it.
 *
 * Locked and near-opaque from the start. The expected next move after uploading an
 * aerial is to drag around it and drop devices on buildings — and if the image were
 * loose, that first drag would slide the photograph instead of the view. Unlocking
 * is a deliberate act, from the toolbar, for the rare case where the image itself
 * needs repositioning.
 */
export const DEFAULT_BACKDROP: Omit<NetworkCanvasBackdrop, "assetId"> = {
  x: 0,
  y: 0,
  width: 1600,
  height: 1000,
  opacity: 1,
  locked: true,
};

export const NODE_KIND_LABELS: Record<NetworkNodeKind, string> = {
  network_point: "Network Point",
  server_rack: "Server Rack",
  switch: "Switch",
  ptz_camera: "PTZ Camera",
  printer: "Printer",
  nec_phone: "NEC Phone",
  ruijie_router: "Ruijie Router / AP",
  label: "Label",
  site_marker: "Site Marker",
};

/** Site markers are places, not gear — they never get a cable or a serial number. */
export function isSiteMarker(kind: NetworkNodeKind): boolean {
  return kind === "site_marker";
}

export const STRUCTURE_KIND_LABELS: Record<NetworkStructureKind, string> = {
  wall: "Wall",
  fence: "Fence",
};

export type PaletteTool =
  | "select"
  | NetworkNodeKind
  | "cable"
  | NetworkStructureKind;

/** Accent colour per device kind — used for node cards, palette, and the legend. */
export const NODE_KIND_ACCENT: Record<NetworkNodeKind, string> = {
  network_point: "#2563eb",
  server_rack: "#0f172a",
  switch: "#0891b2",
  ptz_camera: "#7c3aed",
  printer: "#475569",
  nec_phone: "#0d9488",
  ruijie_router: "#c83733",
  label: "#94a3b8",
  site_marker: "#ea580c",
};
