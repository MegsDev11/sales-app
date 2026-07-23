export type NetworkNodeKind =
  | "network_point"
  | "server_rack"
  | "switch"
  | "ptz_camera"
  | "printer"
  | "nec_phone"
  | "ruijie_router"
  | "label";

export type NetworkDeviceStatus = "online" | "offline" | "unknown";

export type NetworkSubmissionStatus = "new" | "in_progress" | "used" | "archived";

export type NetworkLayoutStatus = "draft" | "published";

export type NetworkAssetKind = "sketch" | "photo" | "reference";

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

export interface NetworkCanvasDocument {
  nodes: NetworkCanvasNode[];
  edges: NetworkCanvasEdge[];
  structures: NetworkCanvasStructure[];
  viewport: NetworkCanvasViewport;
  backgroundAssetId?: string | null;
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
  kind: NetworkAssetKind;
  storagePath: string;
  publicUrl: string | null;
  caption: string;
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
  backgroundAssetId: null,
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
};

export const STRUCTURE_KIND_LABELS: Record<NetworkStructureKind, string> = {
  wall: "Wall",
  fence: "Fence",
};

export type PaletteTool = NetworkNodeKind | "cable" | NetworkStructureKind;
