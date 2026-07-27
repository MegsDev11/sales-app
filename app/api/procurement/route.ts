import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAccess } from "@/lib/supabase/server-auth";
import { can } from "@/lib/access";

/**
 * The generated Database types don't yet know about the procurement tables,
 * columns and RPC added in migration 047, so the strongly-typed admin client
 * resolves them to `never`. Until the types are regenerated, this route talks to
 * an untyped view of the same client — the SQL is still validated by RLS and the
 * migration, and the response shapes are pinned by lib/procurement/constants.
 */
function admin(): SupabaseClient {
  return createSupabaseAdminClient() as unknown as SupabaseClient;
}

/**
 * Procurement API.
 *
 * GET ?id=<po>  -> one purchase order with its supplier and lines
 * GET           -> suppliers (with stats), purchase orders, and computed reorder alerts
 * POST          -> supplier CRUD, PO create / workflow / receiving, and reorder points
 *
 * Reads of the stock tables go through the service-role client so a procurement user
 * who is not also granted stock can still see what needs reordering. RLS (migration
 * 047) enforces procurement access independently; these guards exist so a rejection
 * is a clean 403 rather than a silently empty list, matching the projects route.
 */

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const m = (error as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return "Request failed";
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

const MIGRATION_HINT = "run supabase/migrations/047_procurement.sql in Supabase.";

const OPEN_PO_STATUSES = ["ordered", "partially_received"];

export async function GET(request: Request) {
  const user = await requireAccess(request, "procurement", "view");
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized — procurement access required" },
      { status: 403 }
    );
  }

  try {
    const supabase = admin();
    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (id) {
      const { data: po, error } = await supabase
        .from("purchase_orders")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(`${error.message} — ${MIGRATION_HINT}`);
      if (!po) return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });

      const [lines, supplier] = await Promise.all([
        supabase
          .from("purchase_order_lines")
          .select("*")
          .eq("po_id", id)
          .order("order_index"),
        supabase.from("suppliers").select("*").eq("id", po.supplier_id).maybeSingle(),
      ]);

      return NextResponse.json(
        { po, lines: lines.data ?? [], supplier: supplier.data ?? null },
        { headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }

    const [suppliers, orders, lines, products, sundries, items] = await Promise.all([
      supabase.from("suppliers").select("*").order("name"),
      supabase.from("purchase_orders").select("*").order("created_at", { ascending: false }),
      supabase.from("purchase_order_lines").select("*"),
      supabase
        .from("stock_products")
        .select("id, name, reorder_point, reorder_qty, unit_cost, preferred_supplier_id"),
      supabase
        .from("stock_sundries")
        .select("id, name, quantity, reorder_point, reorder_qty, unit_cost, preferred_supplier_id"),
      supabase.from("stock_items").select("product_id, status"),
    ]);
    if (suppliers.error) throw new Error(`${suppliers.error.message} — ${MIGRATION_HINT}`);

    const orderRows = orders.data ?? [];
    const lineRows = lines.data ?? [];

    // Supplier directory stats.
    const openBySupplier = new Map<string, number>();
    const spendBySupplier = new Map<string, number>();
    for (const o of orderRows) {
      const sid = o.supplier_id as string;
      if (OPEN_PO_STATUSES.includes(o.status as string) || o.status === "draft") {
        openBySupplier.set(sid, (openBySupplier.get(sid) ?? 0) + 1);
      }
      if (o.status !== "cancelled") {
        spendBySupplier.set(sid, (spendBySupplier.get(sid) ?? 0) + Number(o.total ?? 0));
      }
    }
    const supplierRows = (suppliers.data ?? []).map((s) => ({
      ...s,
      open_pos: openBySupplier.get(s.id as string) ?? 0,
      total_spend: spendBySupplier.get(s.id as string) ?? 0,
    }));

    // On-order quantity per product / sundry (open POs only).
    const onOrderProduct = new Map<string, number>();
    const onOrderSundry = new Map<string, number>();
    const openPoIds = new Set(
      orderRows.filter((o) => OPEN_PO_STATUSES.includes(o.status as string)).map((o) => o.id as string)
    );
    for (const l of lineRows) {
      if (!openPoIds.has(l.po_id as string)) continue;
      const outstanding = Math.max(0, Number(l.qty_ordered) - Number(l.qty_received));
      if (l.product_id) {
        onOrderProduct.set(
          l.product_id as string,
          (onOrderProduct.get(l.product_id as string) ?? 0) + outstanding
        );
      } else if (l.sundry_id) {
        onOrderSundry.set(
          l.sundry_id as string,
          (onOrderSundry.get(l.sundry_id as string) ?? 0) + outstanding
        );
      }
    }

    // On-hand per product = available serialized items.
    const availableByProduct = new Map<string, number>();
    for (const it of items.data ?? []) {
      if (it.status !== "available") continue;
      const pid = it.product_id as string;
      availableByProduct.set(pid, (availableByProduct.get(pid) ?? 0) + 1);
    }

    const alerts = [];
    for (const p of products.data ?? []) {
      const point = Number(p.reorder_point ?? 0);
      if (point <= 0) continue;
      const onHand = availableByProduct.get(p.id as string) ?? 0;
      if (onHand > point) continue;
      alerts.push({
        kind: "product" as const,
        id: p.id,
        name: p.name,
        on_hand: onHand,
        reorder_point: point,
        reorder_qty: Number(p.reorder_qty ?? 0),
        unit_cost: p.unit_cost != null ? Number(p.unit_cost) : null,
        preferred_supplier_id: p.preferred_supplier_id ?? null,
        on_order: onOrderProduct.get(p.id as string) ?? 0,
      });
    }
    for (const s of sundries.data ?? []) {
      const point = Number(s.reorder_point ?? 0);
      if (point <= 0) continue;
      const onHand = Number(s.quantity ?? 0);
      if (onHand > point) continue;
      alerts.push({
        kind: "sundry" as const,
        id: s.id,
        name: s.name,
        on_hand: onHand,
        reorder_point: point,
        reorder_qty: Number(s.reorder_qty ?? 0),
        unit_cost: s.unit_cost != null ? Number(s.unit_cost) : null,
        preferred_supplier_id: s.preferred_supplier_id ?? null,
        on_order: onOrderSundry.get(s.id as string) ?? 0,
      });
    }
    alerts.sort((a, b) => a.on_hand - a.reorder_point - (b.on_hand - b.reorder_point));

    return NextResponse.json(
      {
        suppliers: supplierRows,
        purchaseOrders: orderRows,
        lines: lineRows,
        alerts,
        canEdit: can(user, "procurement", "edit"),
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

interface LineInput {
  productId?: string | null;
  sundryId?: string | null;
  description?: string;
  qtyOrdered?: number;
  unitPrice?: number;
}

interface Body {
  action?: string;
  // supplier
  supplierId?: string;
  name?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  leadTimeDays?: number;
  paymentTerms?: string;
  category?: string;
  active?: boolean;
  notes?: string;
  // purchase order
  poId?: string;
  status?: string;
  expectedAt?: string | null;
  lines?: LineInput[];
  // line ops
  lineId?: string;
  qtyReceived?: number;
  qtyOrdered?: number;
  unitPrice?: number;
  description?: string;
  // reorder point
  itemKind?: "product" | "sundry";
  itemId?: string;
  reorderPoint?: number;
  reorderQty?: number;
  unitCost?: number | null;
  preferredSupplierId?: string | null;
}

const VALID_STATUS = new Set(["draft", "ordered", "partially_received", "received", "cancelled"]);

type Supa = SupabaseClient;

/** Re-derive PO status + received_at from its line receipts. */
async function reconcilePoStatus(supabase: Supa, poId: string) {
  const { data: lines } = await supabase
    .from("purchase_order_lines")
    .select("qty_ordered, qty_received")
    .eq("po_id", poId);
  const { data: po } = await supabase
    .from("purchase_orders")
    .select("status")
    .eq("id", poId)
    .maybeSingle();
  if (!po || po.status === "cancelled" || po.status === "draft") return;

  const rows = lines ?? [];
  const total = rows.reduce((n, l) => n + Number(l.qty_received), 0);
  const fullyReceived =
    rows.length > 0 && rows.every((l) => Number(l.qty_received) >= Number(l.qty_ordered));

  let status = "ordered";
  let receivedAt: string | null = null;
  if (fullyReceived) {
    status = "received";
    receivedAt = new Date().toISOString();
  } else if (total > 0) {
    status = "partially_received";
  }
  await supabase
    .from("purchase_orders")
    .update({ status, received_at: receivedAt, updated_at: new Date().toISOString() })
    .eq("id", poId);
}

export async function POST(request: Request) {
  const user = await requireAccess(request, "procurement", "view");
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized — procurement access required" },
      { status: 403 }
    );
  }
  if (!can(user, "procurement", "edit")) {
    return NextResponse.json(
      { error: "You have view-only access to procurement" },
      { status: 403 }
    );
  }

  try {
    const body = (await request.json()) as Body;
    const action = body.action ?? "";
    const supabase = admin();
    const now = new Date().toISOString();

    switch (action) {
      // ---- suppliers ------------------------------------------------------
      case "createSupplier":
      case "updateSupplier": {
        if (!body.name?.trim()) {
          return NextResponse.json({ error: "Give the supplier a name" }, { status: 400 });
        }
        const patch = {
          name: body.name.trim(),
          contact_name: body.contactName ?? "",
          email: body.email ?? "",
          phone: body.phone ?? "",
          website: body.website ?? "",
          address: body.address ?? "",
          lead_time_days: Math.max(0, Math.round(body.leadTimeDays ?? 7)),
          payment_terms: body.paymentTerms ?? "",
          category: body.category ?? "",
          active: body.active ?? true,
          notes: body.notes ?? "",
          updated_at: now,
        };
        if (action === "updateSupplier") {
          if (!body.supplierId) {
            return NextResponse.json({ error: "supplierId required" }, { status: 400 });
          }
          const { error } = await supabase
            .from("suppliers")
            .update(patch)
            .eq("id", body.supplierId);
          if (error) throw error;
          return NextResponse.json({ ok: true, id: body.supplierId });
        }
        const id = newId("sup");
        const { error } = await supabase
          .from("suppliers")
          .insert({ id, created_by: user.id, ...patch });
        if (error) throw error;
        return NextResponse.json({ ok: true, id });
      }

      case "deleteSupplier": {
        if (!can(user, "procurement", "manage")) {
          return NextResponse.json(
            { error: "Only a procurement manager can delete suppliers" },
            { status: 403 }
          );
        }
        if (!body.supplierId) {
          return NextResponse.json({ error: "supplierId required" }, { status: 400 });
        }
        const { count } = await supabase
          .from("purchase_orders")
          .select("id", { count: "exact", head: true })
          .eq("supplier_id", body.supplierId);
        if ((count ?? 0) > 0) {
          return NextResponse.json(
            { error: "This supplier has purchase orders. Mark it inactive instead." },
            { status: 400 }
          );
        }
        const { error } = await supabase.from("suppliers").delete().eq("id", body.supplierId);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      // ---- purchase orders ------------------------------------------------
      case "createPO": {
        if (!body.supplierId) {
          return NextResponse.json({ error: "Pick a supplier" }, { status: 400 });
        }
        const { data: numberRow } = await supabase.rpc("next_po_number");
        const id = newId("po");
        const { error } = await supabase.from("purchase_orders").insert({
          id,
          po_number: (numberRow as string) ?? id.toUpperCase(),
          supplier_id: body.supplierId,
          status: "draft",
          expected_at: body.expectedAt || null,
          notes: body.notes ?? "",
          created_by: user.id,
        });
        if (error) throw new Error(`${error.message} — ${MIGRATION_HINT}`);

        const lines = (body.lines ?? []).filter(
          (l) => (l.qtyOrdered ?? 0) > 0 && (l.description?.trim() || l.productId || l.sundryId)
        );
        if (lines.length) {
          const { error: lineErr } = await supabase.from("purchase_order_lines").insert(
            lines.map((l, i) => ({
              id: newId("pol"),
              po_id: id,
              product_id: l.productId ?? null,
              sundry_id: l.productId ? null : l.sundryId ?? null,
              description: l.description?.trim() ?? "",
              qty_ordered: Math.max(1, Math.round(l.qtyOrdered ?? 1)),
              unit_price: Number(l.unitPrice ?? 0),
              order_index: i,
            }))
          );
          if (lineErr) throw lineErr;
        }
        return NextResponse.json({ ok: true, id });
      }

      case "updatePO": {
        if (!body.poId) return NextResponse.json({ error: "poId required" }, { status: 400 });
        const patch: Record<string, unknown> = { updated_at: now };
        if (body.supplierId !== undefined) patch.supplier_id = body.supplierId;
        if (body.expectedAt !== undefined) patch.expected_at = body.expectedAt || null;
        if (body.notes !== undefined) patch.notes = body.notes;
        const { error } = await supabase
          .from("purchase_orders")
          .update(patch)
          .eq("id", body.poId);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      case "setPOStatus": {
        if (!body.poId || !body.status || !VALID_STATUS.has(body.status)) {
          return NextResponse.json({ error: "poId and a valid status are required" }, { status: 400 });
        }
        const patch: Record<string, unknown> = { status: body.status, updated_at: now };
        if (body.status === "ordered") patch.ordered_at = now;
        if (body.status === "received") patch.received_at = now;
        if (body.status === "draft" || body.status === "cancelled") patch.received_at = null;
        const { error } = await supabase
          .from("purchase_orders")
          .update(patch)
          .eq("id", body.poId);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      // ---- lines ----------------------------------------------------------
      case "addLine": {
        if (!body.poId) return NextResponse.json({ error: "poId required" }, { status: 400 });
        const { data: last } = await supabase
          .from("purchase_order_lines")
          .select("order_index")
          .eq("po_id", body.poId)
          .order("order_index", { ascending: false })
          .limit(1)
          .maybeSingle();
        const { error } = await supabase.from("purchase_order_lines").insert({
          id: newId("pol"),
          po_id: body.poId,
          product_id: body.itemKind === "product" ? body.itemId ?? null : null,
          sundry_id: body.itemKind === "sundry" ? body.itemId ?? null : null,
          description: body.description?.trim() ?? "",
          qty_ordered: Math.max(1, Math.round(body.qtyOrdered ?? 1)),
          unit_price: Number(body.unitPrice ?? 0),
          order_index: ((last?.order_index as number) ?? -1) + 1,
        });
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      case "updateLine": {
        if (!body.lineId) return NextResponse.json({ error: "lineId required" }, { status: 400 });
        const patch: Record<string, unknown> = {};
        if (body.description !== undefined) patch.description = body.description.trim();
        if (body.qtyOrdered !== undefined) patch.qty_ordered = Math.max(1, Math.round(body.qtyOrdered));
        if (body.unitPrice !== undefined) patch.unit_price = Number(body.unitPrice);
        const { error } = await supabase
          .from("purchase_order_lines")
          .update(patch)
          .eq("id", body.lineId);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      case "deleteLine": {
        if (!body.lineId) return NextResponse.json({ error: "lineId required" }, { status: 400 });
        const { error } = await supabase
          .from("purchase_order_lines")
          .delete()
          .eq("id", body.lineId);
        if (error) throw error;
        if (body.poId) await reconcilePoStatus(supabase, body.poId);
        return NextResponse.json({ ok: true });
      }

      // ---- receiving ------------------------------------------------------
      case "receiveLine": {
        if (!body.lineId || body.qtyReceived == null) {
          return NextResponse.json({ error: "lineId and qtyReceived required" }, { status: 400 });
        }
        const { data: line } = await supabase
          .from("purchase_order_lines")
          .select("po_id, qty_ordered")
          .eq("id", body.lineId)
          .maybeSingle();
        if (!line) return NextResponse.json({ error: "Line not found" }, { status: 404 });
        const clamped = Math.max(0, Math.min(Number(body.qtyReceived), Number(line.qty_ordered)));
        const { error } = await supabase
          .from("purchase_order_lines")
          .update({ qty_received: clamped })
          .eq("id", body.lineId);
        if (error) throw error;
        await reconcilePoStatus(supabase, line.po_id as string);
        return NextResponse.json({ ok: true });
      }

      case "receiveAll": {
        if (!body.poId) return NextResponse.json({ error: "poId required" }, { status: 400 });
        const { data: lines } = await supabase
          .from("purchase_order_lines")
          .select("id, qty_ordered")
          .eq("po_id", body.poId);
        for (const l of lines ?? []) {
          await supabase
            .from("purchase_order_lines")
            .update({ qty_received: l.qty_ordered })
            .eq("id", l.id as string);
        }
        await reconcilePoStatus(supabase, body.poId);
        return NextResponse.json({ ok: true });
      }

      // ---- reorder points -------------------------------------------------
      case "setReorder": {
        if (!body.itemKind || !body.itemId) {
          return NextResponse.json({ error: "itemKind and itemId required" }, { status: 400 });
        }
        const table = body.itemKind === "product" ? "stock_products" : "stock_sundries";
        const patch: Record<string, unknown> = {};
        if (body.reorderPoint !== undefined) patch.reorder_point = Math.max(0, Math.round(body.reorderPoint));
        if (body.reorderQty !== undefined) patch.reorder_qty = Math.max(0, Math.round(body.reorderQty));
        if (body.unitCost !== undefined) patch.unit_cost = body.unitCost;
        if (body.preferredSupplierId !== undefined) patch.preferred_supplier_id = body.preferredSupplierId;
        const { error } = await supabase.from(table).update(patch).eq("id", body.itemId);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
