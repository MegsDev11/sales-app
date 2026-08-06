import { SERIES, STATUS } from "@/components/charts/tokens";

/**
 * Shared procurement vocabulary.
 *
 * PO status colour is by IDENTITY (which stage of the buying flow), with the two
 * genuine good/bad states — received and cancelled — using the status palette.
 */

export const PO_STATUSES = [
  { value: "draft", label: "Draft", color: "#94a3b8" },
  { value: "ordered", label: "Ordered", color: SERIES[0] },
  { value: "partially_received", label: "Part received", color: SERIES[3] },
  { value: "received", label: "Received", color: STATUS.good },
  { value: "cancelled", label: "Cancelled", color: "#cbd5e1" },
] as const;

export type PurchaseOrderStatus = (typeof PO_STATUSES)[number]["value"];

/** Stages a PO moves through, in workflow order (cancel is out-of-band). */
export const PO_FLOW: PurchaseOrderStatus[] = [
  "draft",
  "ordered",
  "partially_received",
  "received",
];

export const SUPPLIER_CATEGORIES = [
  "hardware",
  "cabling",
  "fibre",
  "networking",
  "services",
  "other",
] as const;

export function poStatusMeta(value: string) {
  return PO_STATUSES.find((s) => s.value === value) ?? PO_STATUSES[0];
}

export function categoryLabel(value: string) {
  if (!value) return "Uncategorised";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/* ---------- Shapes returned by /api/procurement ---------- */

export interface Supplier {
  id: string;
  name: string;
  contact_name: string;
  email: string;
  phone: string;
  website: string;
  address: string;
  lead_time_days: number;
  payment_terms: string;
  category: string;
  active: boolean;
  notes: string;
  created_at: string;
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_id: string;
  status: string;
  currency: string;
  vat_rate: number;
  subtotal: number;
  vat: number;
  total: number;
  expected_at: string | null;
  ordered_at: string | null;
  received_at: string | null;
  notes: string;
  created_by: string | null;
  approved_by: string | null;
  created_at: string;
}

export interface PurchaseOrderLine {
  id: string;
  po_id: string;
  product_id: string | null;
  sundry_id: string | null;
  description: string;
  qty_ordered: number;
  qty_received: number;
  unit_price: number;
  order_index: number;
}

/** A low-stock signal computed by the API from on-hand vs reorder point. */
export interface ReorderAlert {
  kind: "product" | "sundry";
  id: string;
  name: string;
  on_hand: number;
  reorder_point: number;
  reorder_qty: number;
  unit_cost: number | null;
  preferred_supplier_id: string | null;
  /** Whether an open (non-received, non-cancelled) PO already covers this item. */
  on_order: number;
  /**
   * Serialised units received on a PO but not yet QR-claimed into inventory
   * (migration 065). Always 0 for sundries — their quantity rises on receipt.
   */
  awaiting_intake?: number;
}

/** A supplier row decorated with counts for the directory. */
export interface SupplierWithStats extends Supplier {
  open_pos: number;
  total_spend: number;
}

export function poLineTotal(line: Pick<PurchaseOrderLine, "qty_ordered" | "unit_price">) {
  return line.qty_ordered * line.unit_price;
}

export function fmtMoney(value: number, currency = "ZAR") {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}
