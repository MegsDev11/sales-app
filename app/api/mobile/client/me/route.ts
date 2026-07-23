import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getClientAccountFromRequest } from "@/lib/mobile/client-auth";
import { migrationHint } from "@/lib/mobile/field-mappers";
import type { ClientInstallationDto } from "@megs/shared";

export async function GET(request: Request) {
  const account = await getClientAccountFromRequest(request);
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const supabase = createSupabaseAdminClient();
  try {
    const { data: lead } = await supabase
      .from("leads")
      .select("id, client_name, address, package_tier, phone, email")
      .eq("id", account.lead_id)
      .maybeSingle();

    const { data: links } = await supabase
      .from("client_account_installations")
      .select("stock_item_id")
      .eq("client_account_id", account.id);

    let itemIds = (links ?? []).map((l) => l.stock_item_id);
    if (!itemIds.length && lead?.client_name) {
      const { data: byName } = await supabase
        .from("stock_items")
        .select("id")
        .ilike("client_name", lead.client_name);
      if (byName?.length) itemIds = byName.map((i) => i.id);
    }

    let installations: ClientInstallationDto[] = [];
    if (itemIds.length) {
      const { data: items, error } = await supabase
        .from("stock_items")
        .select(
          "id, serial_number, wifi_name, wifi_password, client_pppoe, client_address, product_id"
        )
        .in("id", itemIds);
      if (error) throw new Error(error.message);

      const productIds = [...new Set((items ?? []).map((i) => i.product_id).filter(Boolean))];
      const { data: products } = productIds.length
        ? await supabase.from("stock_products").select("id, name").in("id", productIds)
        : { data: [] };
      const productNames = new Map((products ?? []).map((p) => [p.id, p.name]));

      installations = (items ?? []).map((i) => ({
        itemId: i.id,
        productName: productNames.get(i.product_id) ?? "Device",
        serialNumber: i.serial_number ?? "",
        wifiName: i.wifi_name,
        wifiPassword: i.wifi_password,
        clientPppoe: i.client_pppoe,
        clientAddress: i.client_address,
      }));
    }

    return NextResponse.json({
      account: {
        id: account.id,
        leadId: account.lead_id,
        email: account.email,
        phone: account.phone,
      },
      clientName: lead?.client_name ?? "Client",
      address: lead?.address ?? "",
      packageTier: lead?.package_tier ?? null,
      installations,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json(
      { error: migrationHint(msg, "022_client_accounts.sql") },
      { status: 500 }
    );
  }
}
