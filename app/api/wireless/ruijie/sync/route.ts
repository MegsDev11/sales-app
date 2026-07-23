import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireWirelessAccess } from "@/lib/supabase/server-auth";
import { syncRuijieDevices, isRuijieConfigured } from "@/lib/wireless/ruijie-client";
import { networkDeviceFromRow, type NetworkDeviceRow } from "@/lib/wireless/mappers";

export async function GET(request: Request) {
  const user = await requireWirelessAccess(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  return NextResponse.json({
    configured: isRuijieConfigured(),
    message: isRuijieConfigured()
      ? "Ruijie credentials present — POST to sync"
      : "Ruijie not configured — set RUIJIE_APP_ID and RUIJIE_APP_SECRET",
  });
}

export async function POST(request: Request) {
  const user = await requireWirelessAccess(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const result = await syncRuijieDevices();
  if (!result.configured) {
    return NextResponse.json(result, { status: 200 });
  }
  if (!result.ok) {
    return NextResponse.json(result, { status: 502 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: devices, error } = await supabase.from("network_devices").select("*");
  if (error) {
    return NextResponse.json({ ...result, error: error.message }, { status: 500 });
  }

  const now = new Date().toISOString();
  let updated = 0;
  for (const row of (devices ?? []) as NetworkDeviceRow[]) {
    const device = networkDeviceFromRow(row);
    if (device.manualOverride) continue;
    if (device.vendor !== "ruijie") continue;

    const match = result.devices.find((d) => {
      if (device.externalId && d.externalId === device.externalId) return true;
      if (device.serialNumber && d.serialNumber && device.serialNumber === d.serialNumber)
        return true;
      if (device.macAddress && d.macAddress) {
        return (
          device.macAddress.replace(/[^a-fA-F0-9]/g, "").toLowerCase() ===
          d.macAddress.replace(/[^a-fA-F0-9]/g, "").toLowerCase()
        );
      }
      return false;
    });
    if (!match) continue;

    const { error: upErr } = await supabase
      .from("network_devices")
      .update({
        status: match.status,
        last_seen_at: match.lastSeenAt || now,
        updated_at: now,
        external_id: device.externalId || match.externalId,
      })
      .eq("id", device.id);
    if (!upErr) updated += 1;
  }

  return NextResponse.json({
    ...result,
    updated,
    message: `${result.message}; updated ${updated} mapped device(s)`,
  });
}
