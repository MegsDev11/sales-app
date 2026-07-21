import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireSupportAccess } from "@/lib/supabase/server-auth";
import {
  clientSupportRequestFromRow,
  clientSupportRequestToRow,
} from "@/lib/supabase/mappers";
import type { ClientSupportRequest, ClientSupportRequestStatus } from "@/lib/types";

export async function GET(request: Request) {
  const user = await requireSupportAccess(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    let query = supabase
      .from("client_support_requests")
      .select("*")
      .order("created_at", { ascending: false });
    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    const { data: rows, error } = await query;
    if (error) throw error;

    const itemIds = [...new Set((rows ?? []).map((r) => r.item_id))];
    const { data: items } = await supabase
      .from("stock_items")
      .select("id, client_name, client_address, brand, device_name, qr_token, product_id")
      .in("id", itemIds.length ? itemIds : ["__none__"]);

    const productIds = [...new Set((items ?? []).map((i) => i.product_id))];
    const { data: products } = await supabase
      .from("stock_products")
      .select("id, name")
      .in("id", productIds.length ? productIds : ["__none__"]);

    const itemMap = new Map((items ?? []).map((i) => [i.id, i]));
    const productMap = new Map((products ?? []).map((p) => [p.id, p.name]));

    const requests = (rows ?? []).map((row) => {
      const item = itemMap.get(row.item_id);
      return clientSupportRequestFromRow(row, {
        clientName: item?.client_name ?? "",
        clientAddress: item?.client_address ?? "",
        productName: item ? productMap.get(item.product_id) ?? "" : "",
        deviceLabel: item
          ? [item.brand, item.device_name].filter(Boolean).join(" ") || "—"
          : "—",
        qrToken: item?.qr_token,
      });
    });

    return NextResponse.json(
      { requests },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load requests";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await requireSupportAccess(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      action: "updateStatus";
      requestId: string;
      status: ClientSupportRequestStatus;
    };

    if (body.action !== "updateStatus" || !body.requestId || !body.status) {
      return NextResponse.json({ error: "requestId and status required" }, { status: 400 });
    }

    const allowed: ClientSupportRequestStatus[] = [
      "new",
      "checked",
      "site_survey_needed",
      "resolved",
    ];
    if (!allowed.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const supabase = createSupabaseAdminClient();
    const { data: existing, error: findError } = await supabase
      .from("client_support_requests")
      .select("*")
      .eq("id", body.requestId)
      .maybeSingle();
    if (findError) throw findError;
    if (!existing) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const updated = clientSupportRequestFromRow(existing);
    updated.status = body.status;
    updated.updatedAt = now;
    updated.updatedById = user.id;
    if (body.status === "resolved") {
      updated.resolvedAt = now;
    }

    const { error } = await supabase
      .from("client_support_requests")
      .update(clientSupportRequestToRow(updated))
      .eq("id", body.requestId);
    if (error) throw error;

    return NextResponse.json({ ok: true, request: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
