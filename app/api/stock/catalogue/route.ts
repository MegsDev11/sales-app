import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAccess } from "@/lib/supabase/server-auth";
import { suggestDestination, suggestUnitLabel } from "@/lib/stock/catalogue-classify";
import { adminClient, errorMessage, newId } from "@/lib/api/route-helpers";

/**
 * Stock catalogue import.
 *
 * GET  -> the newest imported price list, every item in it, and whether each one is
 *         already carried as a tracked product or a sundry
 * POST -> create products or sundries from a set of catalogue codes
 *
 * The item list comes from the price list the commission module already imports
 * (migration 049), so the Sage export is loaded once and serves both. Those tables
 * are gated at crm/manage by RLS, so reads here go through the service-role client
 * and this route guards on `stock` independently — the same arrangement procurement
 * uses to read stock tables without holding stock access.
 *
 * Only item names, categories and costs are exposed. Nothing about commission,
 * margin or pay crosses over.
 */

export const runtime = "nodejs";

const CATALOGUE_HINT =
  "no price list has been imported yet — a sales manager loads it under Commission → Price lists.";

const noStore = { headers: { "Cache-Control": "no-store, max-age=0" } };

const upper = (value: string) => value.trim().toUpperCase();

interface CatalogueRow {
  code: string;
  description: string;
  category: string;
  avgCost: number;
  exclPrice: number;
}

async function loadSnapshot(supabase: SupabaseClient) {
  const { data: imports, error } = await supabase
    .from("commission_catalogue_imports")
    .select("id, source_filename, sheet_name, effective_from, item_count, created_at")
    .order("effective_from", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return imports?.[0] ?? null;
}

async function loadItems(supabase: SupabaseClient, importId: string) {
  const rows: CatalogueRow[] = [];
  const pageSize = 1000;
  // Supabase caps a select at 1000 rows; the price list is larger than that.
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("commission_catalogue_items")
      .select("code, description, category, avg_cost, excl_price")
      .eq("import_id", importId)
      .order("code")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const row of data) {
      rows.push({
        code: String(row.code),
        description: String(row.description ?? ""),
        category: String(row.category ?? ""),
        avgCost: Number(row.avg_cost ?? 0),
        exclPrice: Number(row.excl_price ?? 0),
      });
    }
    if (data.length < pageSize) break;
  }
  return rows;
}

/**
 * Keys already carried in inventory. Products are keyed by SKU and by name, sundries
 * by name, so an item imported under either identity is recognised and not duplicated.
 */
async function loadExisting(supabase: SupabaseClient) {
  const [products, sundries] = await Promise.all([
    supabase.from("stock_products").select("id, name, sku"),
    supabase.from("stock_sundries").select("id, name"),
  ]);
  // Key -> row id, so a re-import can refresh prices on carried items.
  const productIdByKey = new Map<string, string>();
  for (const row of products.data ?? []) {
    if (row.sku) productIdByKey.set(upper(String(row.sku)), String(row.id));
    if (row.name) productIdByKey.set(upper(String(row.name)), String(row.id));
  }
  const sundryIdByKey = new Map<string, string>();
  for (const row of sundries.data ?? []) {
    if (row.name) sundryIdByKey.set(upper(String(row.name)), String(row.id));
  }
  return {
    productIdByKey,
    sundryIdByKey,
    productKeys: new Set(productIdByKey.keys()),
    sundryKeys: new Set(sundryIdByKey.keys()),
  };
}

/**
 * A fresh price list should correct the cost on items already carried — the
 * import used to be create-only, which meant unit_cost silently went stale and
 * a weekly re-import would never fix a price. Updates are per-id and
 * best-effort; a failed one does not sink the import.
 */
async function refreshUnitCosts(
  supabase: SupabaseClient,
  table: "stock_products" | "stock_sundries",
  updates: Map<string, number>
) {
  let refreshed = 0;
  for (const [id, unitCost] of updates) {
    const { error } = await supabase.from(table).update({ unit_cost: unitCost }).eq("id", id);
    if (!error) refreshed += 1;
  }
  return refreshed;
}

export async function GET(request: Request) {
  const user = await requireAccess(request, "stock", "view");
  if (!user) {
    return NextResponse.json({ error: "Unauthorized — stock access required" }, { status: 403 });
  }

  try {
    const supabase = adminClient();
    const snapshot = await loadSnapshot(supabase);
    if (!snapshot) {
      return NextResponse.json({ snapshot: null, items: [], hint: CATALOGUE_HINT }, noStore);
    }

    const [items, existing] = await Promise.all([
      loadItems(supabase, String(snapshot.id)),
      loadExisting(supabase),
    ]);

    return NextResponse.json(
      {
        snapshot,
        items: items.map((item) => {
          const codeKey = upper(item.code);
          const nameKey = upper(item.description);
          const carried = existing.productKeys.has(codeKey) || existing.productKeys.has(nameKey)
            ? ("product" as const)
            : existing.sundryKeys.has(nameKey) || existing.sundryKeys.has(codeKey)
              ? ("sundry" as const)
              : null;
          return {
            ...item,
            carried,
            suggested: suggestDestination(item.code, item.category),
            unitLabel: suggestUnitLabel(item.description, item.category),
          };
        }),
      },
      noStore
    );
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  // Creating hundreds of inventory rows is an edit, not a read — deliberately
  // stricter than the rest of /api/stock, which admits view-level users.
  const user = await requireAccess(request, "stock", "edit");
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized — stock edit access required" },
      { status: 403 }
    );
  }

  try {
    const supabase = adminClient();
    const body = (await request.json()) as {
      codes?: unknown;
      destination?: unknown;
      unitLabel?: unknown;
    };

    const codes = Array.isArray(body.codes) ? body.codes.map((c) => String(c)) : [];
    const destination = body.destination === "sundry" ? "sundry" : "product";
    const unitLabelOverride =
      typeof body.unitLabel === "string" && body.unitLabel.trim()
        ? body.unitLabel.trim()
        : null;

    if (codes.length === 0) {
      return NextResponse.json({ error: "Select at least one item" }, { status: 400 });
    }
    if (codes.length > 2000) {
      return NextResponse.json({ error: "Too many items in one import" }, { status: 400 });
    }

    const snapshot = await loadSnapshot(supabase);
    if (!snapshot) {
      return NextResponse.json({ error: `Can't import — ${CATALOGUE_HINT}` }, { status: 400 });
    }

    const wanted = new Set(codes.map(upper));
    const items = (await loadItems(supabase, String(snapshot.id))).filter((item) =>
      wanted.has(upper(item.code))
    );
    if (items.length === 0) {
      return NextResponse.json(
        { error: "None of those codes are in the current price list" },
        { status: 400 }
      );
    }

    const existing = await loadExisting(supabase);
    const now = new Date().toISOString();
    const skipped: string[] = [];

    if (destination === "product") {
      const rows = [];
      const priceUpdates = new Map<string, number>();
      for (const item of items) {
        const codeKey = upper(item.code);
        const nameKey = upper(item.description);
        const existingId =
          existing.productIdByKey.get(codeKey) ?? existing.productIdByKey.get(nameKey);
        if (existingId) {
          skipped.push(item.code);
          if (item.avgCost > 0) priceUpdates.set(existingId, item.avgCost);
          continue;
        }
        existing.productKeys.add(codeKey);
        existing.productIdByKey.set(codeKey, "pending");
        rows.push({
          id: newId("prod"),
          // Sage's description is the human name; the code is the SKU.
          name: item.description || item.code,
          sku: item.code,
          brand_default: "",
          notes: item.category ? `Sage category: ${item.category}` : "",
          created_at: now,
          // Feeds procurement's reorder costing; 0 would read as free.
          unit_cost: item.avgCost > 0 ? item.avgCost : null,
        });
      }
      if (rows.length) {
        const { error } = await supabase.from("stock_products").insert(rows);
        if (error) throw new Error(error.message);
      }
      const refreshed = await refreshUnitCosts(supabase, "stock_products", priceUpdates);
      return NextResponse.json(
        { ok: true, created: rows.length, skipped, refreshed, destination },
        noStore
      );
    }

    const rows = [];
    const priceUpdates = new Map<string, number>();
    for (const item of items) {
      const nameKey = upper(item.description);
      const existingId =
        existing.sundryIdByKey.get(nameKey) ?? existing.sundryIdByKey.get(upper(item.code));
      if (existingId) {
        skipped.push(item.code);
        if (item.avgCost > 0) priceUpdates.set(existingId, item.avgCost);
        continue;
      }
      existing.sundryKeys.add(nameKey);
      existing.sundryIdByKey.set(nameKey, "pending");
      rows.push({
        id: newId("sundry"),
        name: item.description || item.code,
        unit_label: unitLabelOverride ?? suggestUnitLabel(item.description, item.category),
        // Imported at zero: the price list says what a thing costs, not how many are
        // on the shelf. Counting happens on the inventory page.
        quantity: 0,
        notes: item.category ? `Sage ${item.code} · ${item.category}` : `Sage ${item.code}`,
        created_at: now,
        updated_at: now,
        unit_cost: item.avgCost > 0 ? item.avgCost : null,
      });
    }
    if (rows.length) {
      const { error } = await supabase.from("stock_sundries").insert(rows);
      if (error) throw new Error(error.message);
    }
    const refreshed = await refreshUnitCosts(supabase, "stock_sundries", priceUpdates);
    return NextResponse.json(
      { ok: true, created: rows.length, skipped, refreshed, destination },
      noStore
    );
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
