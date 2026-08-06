import { NextResponse } from "next/server";
import { requireAccess } from "@/lib/supabase/server-auth";
import { can } from "@/lib/access";
import { adminClient, errorMessage, newId } from "@/lib/api/route-helpers";

/**
 * The supplier price list (migration 071).
 *
 * Before this, "who is cheapest for 400m of ADSS" could only be answered
 * backwards — by comparing purchase orders already raised, which requires
 * having bought the same item from two suppliers at least once. This is the
 * forward-looking version: the prices you have been quoted, per supplier, per
 * item, with the date each was last confirmed.
 *
 * GET  -> every priced item grouped for comparison, plus what is stale
 * POST -> set / remove a price (history is written by a database trigger, so
 *         movement is recorded even if a price is changed outside this route)
 */

export const runtime = "nodejs";

const MIGRATION_HINT = "run supabase/migrations/071_todos_supplier_prices_market.sql in Supabase.";

const withHint = (message: string) =>
  /does not exist|schema cache/i.test(message) ? `${message} — ${MIGRATION_HINT}` : message;

/** A price older than this is reported as unconfirmed rather than current. */
const STALE_DAYS = 90;

export async function GET(request: Request) {
  const user = await requireAccess(request, "procurement", "view");
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized — procurement access required" },
      { status: 403 }
    );
  }

  try {
    const db = adminClient();
    const [pricesRes, suppliersRes, productsRes, sundriesRes] = await Promise.all([
      db.from("supplier_products").select("*").order("updated_at", { ascending: false }),
      db.from("suppliers").select("id, name, lead_time_days, active").order("name"),
      db.from("stock_products").select("id, name, unit_cost, preferred_supplier_id").order("name"),
      db.from("stock_sundries").select("id, name, unit_label, unit_cost").order("name"),
    ]);
    if (pricesRes.error) throw new Error(withHint(pricesRes.error.message));

    const suppliers = (suppliersRes.data ?? []) as Record<string, unknown>[];
    const supplierById = new Map(suppliers.map((s) => [String(s.id), s]));
    const productName = new Map(
      ((productsRes.data ?? []) as Record<string, unknown>[]).map((p) => [
        String(p.id),
        String(p.name),
      ])
    );
    const sundryName = new Map(
      ((sundriesRes.data ?? []) as Record<string, unknown>[]).map((s) => [
        String(s.id),
        String(s.name),
      ])
    );

    const staleBefore = Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000;

    // Group by item so the screen can show "these three suppliers, these three
    // prices" — which is the only view that answers the question being asked.
    const groups = new Map<
      string,
      {
        key: string;
        itemKind: "product" | "sundry";
        itemId: string;
        itemName: string;
        offers: {
          id: string;
          supplierId: string;
          supplierName: string;
          leadTimeDays: number;
          unitPrice: number | null;
          supplierSku: string;
          url: string;
          lastPriceAt: string | null;
          stale: boolean;
        }[];
      }
    >();

    for (const row of (pricesRes.data ?? []) as Record<string, unknown>[]) {
      const kind: "product" | "sundry" = row.product_id ? "product" : "sundry";
      const itemId = String(row.product_id ?? row.sundry_id ?? "");
      if (!itemId) continue;
      const key = `${kind}:${itemId}`;
      const supplier = supplierById.get(String(row.supplier_id));
      const lastPriceAt = (row.last_price_at as string | null) ?? null;

      const group =
        groups.get(key) ??
        {
          key,
          itemKind: kind,
          itemId,
          itemName:
            (kind === "product" ? productName.get(itemId) : sundryName.get(itemId)) ??
            "Unknown item",
          offers: [],
        };
      group.offers.push({
        id: String(row.id),
        supplierId: String(row.supplier_id),
        supplierName: String(supplier?.name ?? "Unknown supplier"),
        leadTimeDays: Number(supplier?.lead_time_days ?? 0),
        unitPrice: row.unit_price == null ? null : Number(row.unit_price),
        supplierSku: String(row.supplier_sku ?? ""),
        url: String(row.url ?? ""),
        lastPriceAt,
        stale: !lastPriceAt || new Date(lastPriceAt).getTime() < staleBefore,
      });
      groups.set(key, group);
    }

    // Cheapest first within each item; items with a real spread first overall,
    // because those are where money is actually being left on the table.
    const items = [...groups.values()].map((g) => {
      const priced = g.offers.filter((o) => o.unitPrice != null);
      priced.sort((a, b) => (a.unitPrice ?? 0) - (b.unitPrice ?? 0));
      const cheapest = priced[0]?.unitPrice ?? null;
      const dearest = priced[priced.length - 1]?.unitPrice ?? null;
      return {
        ...g,
        offers: [...priced, ...g.offers.filter((o) => o.unitPrice == null)],
        cheapest,
        dearest,
        spread: cheapest != null && dearest != null ? dearest - cheapest : 0,
        staleCount: g.offers.filter((o) => o.stale).length,
      };
    });
    items.sort((a, b) => b.spread - a.spread || a.itemName.localeCompare(b.itemName));

    return NextResponse.json(
      {
        items,
        suppliers: suppliers
          .filter((s) => s.active !== false)
          .map((s) => ({ id: String(s.id), name: String(s.name) })),
        products: ((productsRes.data ?? []) as Record<string, unknown>[]).map((p) => ({
          id: String(p.id),
          name: String(p.name),
        })),
        sundries: ((sundriesRes.data ?? []) as Record<string, unknown>[]).map((s) => ({
          id: String(s.id),
          name: String(s.name),
        })),
        staleDays: STALE_DAYS,
        canEdit: can(user, "procurement", "edit"),
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

interface Body {
  action?: string;
  id?: string;
  supplierId?: string;
  itemKind?: "product" | "sundry";
  itemId?: string;
  unitPrice?: number | null;
  supplierSku?: string;
  url?: string;
  notes?: string;
}

export async function POST(request: Request) {
  const user = await requireAccess(request, "procurement", "edit");
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized — procurement edit access required" },
      { status: 403 }
    );
  }

  try {
    const db = adminClient();
    const body = (await request.json()) as Body;

    if (body.action === "remove") {
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const { error } = await db.from("supplier_products").delete().eq("id", body.id);
      if (error) throw new Error(withHint(error.message));
      return NextResponse.json({ ok: true });
    }

    if (body.action !== "setPrice") {
      return NextResponse.json({ error: `Unknown action: ${body.action ?? ""}` }, { status: 400 });
    }

    if (!body.supplierId || !body.itemId || !body.itemKind) {
      return NextResponse.json(
        { error: "supplierId, itemKind and itemId are required" },
        { status: 400 }
      );
    }
    const price =
      body.unitPrice == null || !Number.isFinite(Number(body.unitPrice))
        ? null
        : Number(body.unitPrice);
    if (price != null && price < 0) {
      return NextResponse.json({ error: "A price cannot be negative" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const productId = body.itemKind === "product" ? body.itemId : null;
    const sundryId = body.itemKind === "sundry" ? body.itemId : null;

    // One row per supplier per item — re-quoting updates rather than stacking.
    let query = db.from("supplier_products").select("id").eq("supplier_id", body.supplierId);
    query = productId ? query.eq("product_id", productId) : query.eq("sundry_id", sundryId!);
    const { data: existing } = await query.maybeSingle();

    const patch = {
      supplier_sku: body.supplierSku?.trim() ?? "",
      unit_price: price,
      url: body.url?.trim() ?? "",
      notes: body.notes?.trim() ?? "",
      // Setting a price IS confirming it — that is what makes staleness mean
      // something later.
      last_price_at: price == null ? null : now,
      updated_by: user.id,
      updated_at: now,
    };

    if (existing) {
      const { error } = await db
        .from("supplier_products")
        .update(patch)
        .eq("id", existing.id as string);
      if (error) throw new Error(withHint(error.message));
      return NextResponse.json({ ok: true, id: existing.id });
    }

    const id = newId("sprd");
    const { error } = await db.from("supplier_products").insert({
      id,
      supplier_id: body.supplierId,
      product_id: productId,
      sundry_id: sundryId,
      ...patch,
    });
    if (error) throw new Error(withHint(error.message));
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
