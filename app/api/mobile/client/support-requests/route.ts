import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getClientAccountFromRequest } from "@/lib/mobile/client-auth";
import { makeId, migrationHint } from "@/lib/mobile/field-mappers";
import { clientSupportRequestToRow, appNotificationToRow } from "@/lib/supabase/mappers";
import type { ClientSupportRequest } from "@/lib/types";
import type {
  ClientSupportRequestCategoryDto,
  ClientSupportRequestDto,
} from "@megs/shared";

const CATEGORIES: ClientSupportRequestCategoryDto[] = [
  "slow_internet",
  "no_internet",
  "quote",
  "other",
];

async function resolveItemIds(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  accountId: string,
  leadId: string
) {
  const { data: links } = await supabase
    .from("client_account_installations")
    .select("stock_item_id")
    .eq("client_account_id", accountId);
  let itemIds = (links ?? []).map((l) => l.stock_item_id);
  if (!itemIds.length) {
    const { data: lead } = await supabase
      .from("leads")
      .select("client_name")
      .eq("id", leadId)
      .maybeSingle();
    if (lead?.client_name) {
      const { data: byName } = await supabase
        .from("stock_items")
        .select("id")
        .ilike("client_name", lead.client_name);
      if (byName?.length) itemIds = byName.map((i) => i.id);
    }
  }
  return itemIds;
}

export async function GET(request: Request) {
  const account = await getClientAccountFromRequest(request);
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const supabase = createSupabaseAdminClient();
  try {
    const itemIds = await resolveItemIds(supabase, account.id, account.lead_id);
    if (!itemIds.length) {
      return NextResponse.json({ requests: [] as ClientSupportRequestDto[] });
    }

    const { data: rows, error } = await supabase
      .from("client_support_requests")
      .select("*")
      .in("item_id", itemIds)
      .order("created_at", { ascending: false });
    if (error) throw new Error(migrationHint(error.message, "013_client_qr_portal.sql"));

    const { data: items } = await supabase
      .from("stock_items")
      .select("id, brand, device_name, product_id")
      .in("id", itemIds);
    const productIds = [...new Set((items ?? []).map((i) => i.product_id))];
    const { data: products } = productIds.length
      ? await supabase.from("stock_products").select("id, name").in("id", productIds)
      : { data: [] };
    const productMap = new Map((products ?? []).map((p) => [p.id, p.name]));
    const itemMap = new Map((items ?? []).map((i) => [i.id, i]));

    const requests: ClientSupportRequestDto[] = (rows ?? []).map((row) => {
      const item = itemMap.get(row.item_id);
      return {
        id: row.id,
        itemId: row.item_id,
        category: row.category as ClientSupportRequestCategoryDto,
        description: row.description,
        status: row.status as ClientSupportRequestDto["status"],
        createdAt: row.created_at,
        productName: item ? productMap.get(item.product_id) ?? "Device" : "Device",
        deviceLabel: item
          ? [item.brand, item.device_name].filter(Boolean).join(" ") || "—"
          : "—",
      };
    });

    return NextResponse.json({ requests });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const account = await getClientAccountFromRequest(request);
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = (await request.json()) as Record<string, unknown>;
  const category = String(body.category ?? "other") as ClientSupportRequestCategoryDto;
  const description = String(body.description ?? "").trim();
  let itemId = String(body.itemId ?? "").trim();

  if (!description) {
    return NextResponse.json({ error: "Please describe your issue" }, { status: 400 });
  }
  if (!CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();

  try {
    const allowedIds = await resolveItemIds(supabase, account.id, account.lead_id);
    if (!allowedIds.length) {
      return NextResponse.json(
        { error: "No installation linked to your account yet" },
        { status: 400 }
      );
    }
    if (!itemId) itemId = allowedIds[0];
    if (!allowedIds.includes(itemId)) {
      return NextResponse.json({ error: "Invalid installation" }, { status: 400 });
    }

    const supportRequest: ClientSupportRequest = {
      id: makeId("csreq"),
      itemId,
      category,
      description,
      status: "new",
      createdAt: now,
      updatedAt: now,
    };

    const { error } = await supabase
      .from("client_support_requests")
      .insert(clientSupportRequestToRow(supportRequest));
    if (error) throw new Error(migrationHint(error.message, "013_client_qr_portal.sql"));

    const { data: item } = await supabase
      .from("stock_items")
      .select("client_name")
      .eq("id", itemId)
      .maybeSingle();

    try {
      await supabase.from("app_notifications").insert(
        appNotificationToRow({
          id: makeId("ntf"),
          department: "support",
          type: "client_support_request",
          title: "New client support request",
          body: `${item?.client_name || "Client"} — ${description.slice(0, 120)}`,
          link: "/support/requests",
          requestId: supportRequest.id,
          createdAt: now,
        })
      );
    } catch {
      /* notifications optional */
    }

    return NextResponse.json({ ok: true, requestId: supportRequest.id });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
