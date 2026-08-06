import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAuthenticated } from "@/lib/supabase/server-auth";
import { makeId, migrationHint } from "@/lib/mobile/field-mappers";
import { fuelEntryFromRow } from "@/lib/mobile/vehicle-mappers";

function isFieldTech(user: { role: string; department: string | null }) {
  return (
    user.department === "coordination" ||
    (user.department === "stock" && user.role === "staff")
  );
}

export async function POST(request: Request) {
  const user = await requireAuthenticated(request);
  if (!user || !isFieldTech(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = (await request.json()) as Record<string, unknown>;
  const vehicleId = String(body.vehicleId ?? "").trim();
  const litres = Number(body.litres);
  const price = Number(body.price);
  const location = String(body.location ?? "").trim();
  // Optional: a fill without a reading is still a fill worth recording.
  const odometerKm =
    body.odometerKm == null || !Number.isFinite(Number(body.odometerKm))
      ? null
      : Math.round(Number(body.odometerKm));

  if (!vehicleId) {
    return NextResponse.json({ error: "vehicleId required" }, { status: 400 });
  }
  if (!Number.isFinite(litres) || litres <= 0) {
    return NextResponse.json({ error: "Litres must be greater than 0" }, { status: 400 });
  }
  if (!Number.isFinite(price) || price < 0) {
    return NextResponse.json({ error: "Price is required" }, { status: 400 });
  }
  if (!location) {
    return NextResponse.json({ error: "Location / where is required" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();

  try {
    const { data: vehicle, error: vErr } = await supabase
      .from("vehicles")
      .select("id, brand, number_plate, active")
      .eq("id", vehicleId)
      .maybeSingle();
    if (vErr) throw new Error(migrationHint(vErr.message, "032_vehicles_fuel.sql"));
    if (!vehicle || !vehicle.active) {
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }

    const id = makeId("fuel");
    const row: Record<string, unknown> = {
      id,
      vehicle_id: vehicleId,
      technician_id: user.id,
      litres,
      location,
      price,
      recorded_at: now,
      created_at: now,
      odometer_km: odometerKm,
    };
    const untyped = supabase as unknown as SupabaseClient;
    let { data, error } = await untyped.from("fuel_entries").insert(row).select("*").single();

    // Migration 069 tolerance: log the fill even if the odometer column is
    // not there yet — a lost reading beats a lost fuel entry.
    if (error && /odometer_km/.test(error.message)) {
      delete row.odometer_km;
      ({ data, error } = await untyped.from("fuel_entries").insert(row).select("*").single());
    }
    if (error) throw new Error(migrationHint(error.message, "032_vehicles_fuel.sql"));

    return NextResponse.json({
      ok: true,
      entry: fuelEntryFromRow(data, {
        vehicleBrand: vehicle.brand,
        vehicleNumberPlate: vehicle.number_plate,
        technicianName: user.name ?? undefined,
      }),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
