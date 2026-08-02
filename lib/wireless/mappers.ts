import type {
  NetworkAssetKind,
  NetworkCanvasDocument,
  NetworkDevice,
  NetworkDeviceStatus,
  NetworkLayout,
  NetworkLayoutAsset,
  NetworkLayoutStatus,
  NetworkLayoutSubmission,
  NetworkSubmissionStatus,
} from "@/lib/wireless/layout-types";
import { EMPTY_CANVAS } from "@/lib/wireless/layout-types";

export interface NetworkLayoutSubmissionRow {
  id: string;
  lead_id: string | null;
  notes: string;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface NetworkLayoutRow {
  id: string;
  lead_id: string | null;
  title: string;
  status: string;
  canvas_json: NetworkCanvasDocument | null;
  submission_id: string | null;
  created_by: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  // Migration 050. Optional so a layout read back before the migration is applied
  // still maps rather than throwing.
  location_lat?: number | null;
  location_lng?: number | null;
  location_label?: string | null;
}

export interface NetworkLayoutAssetRow {
  id: string;
  submission_id: string | null;
  layout_id: string | null;
  kind: string;
  storage_path: string;
  public_url: string | null;
  caption: string;
  created_at: string;
  // Migration 050.
  node_id?: string | null;
  sort_order?: number | null;
}

export interface NetworkDeviceRow {
  id: string;
  layout_id: string;
  node_id: string;
  vendor: string;
  external_id: string | null;
  serial_number: string | null;
  mac_address: string | null;
  label: string;
  status: string;
  last_seen_at: string | null;
  manual_override: boolean;
  created_at: string;
  updated_at: string;
}

function parseCanvas(raw: unknown): NetworkCanvasDocument {
  if (!raw || typeof raw !== "object") return { ...EMPTY_CANVAS, nodes: [], edges: [], structures: [] };
  const doc = raw as Partial<NetworkCanvasDocument>;
  return {
    nodes: Array.isArray(doc.nodes) ? doc.nodes : [],
    edges: Array.isArray(doc.edges) ? doc.edges : [],
    structures: Array.isArray(doc.structures) ? doc.structures : [],
    viewport: doc.viewport ?? { x: 0, y: 0, zoom: 1 },
    backdrop: doc.backdrop ?? null,
    backgroundAssetId: doc.backgroundAssetId ?? null,
  };
}

export function networkSubmissionFromRow(
  row: NetworkLayoutSubmissionRow,
  assets: NetworkLayoutAsset[] = [],
  clientName?: string
): NetworkLayoutSubmission {
  return {
    id: row.id,
    leadId: row.lead_id,
    notes: row.notes ?? "",
    status: row.status as NetworkSubmissionStatus,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    assets,
    clientName,
  };
}

export function networkLayoutFromRow(
  row: NetworkLayoutRow,
  devices: NetworkDevice[] = [],
  assets: NetworkLayoutAsset[] = [],
  clientName?: string
): NetworkLayout {
  return {
    id: row.id,
    leadId: row.lead_id,
    title: row.title ?? "Network layout",
    status: row.status as NetworkLayoutStatus,
    canvas: parseCanvas(row.canvas_json),
    submissionId: row.submission_id,
    createdBy: row.created_by,
    publishedAt: row.published_at,
    location:
      typeof row.location_lat === "number" && typeof row.location_lng === "number"
        ? {
            lat: row.location_lat,
            lng: row.location_lng,
            label: row.location_label ?? "",
          }
        : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    devices,
    assets,
    clientName,
  };
}

export function networkAssetFromRow(row: NetworkLayoutAssetRow): NetworkLayoutAsset {
  return {
    id: row.id,
    submissionId: row.submission_id,
    layoutId: row.layout_id,
    nodeId: row.node_id ?? null,
    kind: row.kind as NetworkAssetKind,
    storagePath: row.storage_path,
    publicUrl: row.public_url,
    caption: row.caption ?? "",
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at,
  };
}

export function networkDeviceFromRow(row: NetworkDeviceRow): NetworkDevice {
  return {
    id: row.id,
    layoutId: row.layout_id,
    nodeId: row.node_id,
    vendor: row.vendor ?? "ruijie",
    externalId: row.external_id,
    serialNumber: row.serial_number,
    macAddress: row.mac_address,
    label: row.label ?? "",
    status: row.status as NetworkDeviceStatus,
    lastSeenAt: row.last_seen_at,
    manualOverride: Boolean(row.manual_override),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
