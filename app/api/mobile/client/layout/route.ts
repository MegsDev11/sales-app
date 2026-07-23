import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getClientAccountFromRequest } from "@/lib/mobile/client-auth";
import { migrationHint } from "@/lib/mobile/field-mappers";
import { networkDeviceFromRow, networkLayoutFromRow } from "@/lib/wireless/mappers";

export async function GET(request: Request) {
  const account = await getClientAccountFromRequest(request);
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const supabase = createSupabaseAdminClient();
  try {
    const { data: layout, error } = await supabase
      .from("network_layouts")
      .select("*")
      .eq("lead_id", account.lead_id)
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(migrationHint(error.message, "020_wireless_network_layouts.sql"));
    if (!layout) {
      return NextResponse.json({ layout: null, devices: [] });
    }

    const { data: devices } = await supabase
      .from("network_devices")
      .select("*")
      .eq("layout_id", layout.id);

    const mapped = networkLayoutFromRow(
      {
        ...layout,
        canvas_json: layout.canvas_json as never,
      },
      (devices ?? []).map(networkDeviceFromRow),
      []
    );

    return NextResponse.json({
      layout: mapped,
      devices: mapped.devices ?? [],
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
