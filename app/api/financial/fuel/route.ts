import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAuthUserFromRequest } from "@/lib/supabase/server-auth";
import { canAccessFinancial, isOwner } from "@/lib/permissions";
import { migrationHint } from "@/lib/mobile/field-mappers";
import { fuelEntryFromRow } from "@/lib/mobile/vehicle-mappers";

async function requireFinancial(request: Request) {
  const user = await getAuthUserFromRequest(request);
  if (!user || (!canAccessFinancial(user) && !isOwner(user))) return null;
  return user;
}

export async function GET(request: Request) {
  const user = await requireFinancial(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const supabase = createSupabaseAdminClient();

  try {
    const { data: rows, error } = await supabase
      .from("fuel_entries")
      .select("*")
      .order("recorded_at", { ascending: false });
    if (error) throw new Error(migrationHint(error.message, "032_vehicles_fuel.sql"));

    const list = rows ?? [];
    if (!list.length) {
      return NextResponse.json({ entries: [], totalPrice: 0, totalLitres: 0 });
    }

    const vehicleIds = [...new Set(list.map((r) => r.vehicle_id))];
    const techIds = [...new Set(list.map((r) => r.technician_id))];

    const [{ data: vehicles }, { data: techs }] = await Promise.all([
      supabase
        .from("vehicles")
        .select("id, brand, number_plate")
        .in("id", vehicleIds),
      supabase.from("team_members").select("id, name").in("id", techIds),
    ]);

    const vehicleById = new Map((vehicles ?? []).map((v) => [v.id, v]));
    const techById = new Map((techs ?? []).map((t) => [t.id, t]));

    let totalPrice = 0;
    let totalLitres = 0;
    const entries = list.map((row) => {
      const vehicle = vehicleById.get(row.vehicle_id);
      const tech = techById.get(row.technician_id);
      const entry = fuelEntryFromRow(row, {
        vehicleBrand: vehicle?.brand,
        vehicleNumberPlate: vehicle?.number_plate,
        technicianName: tech?.name,
      });
      totalPrice += entry.price;
      totalLitres += entry.litres;
      return entry;
    });

    return NextResponse.json({ entries, totalPrice, totalLitres });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
