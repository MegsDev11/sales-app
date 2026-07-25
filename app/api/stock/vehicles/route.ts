import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAuthUserFromRequest } from "@/lib/supabase/server-auth";
import { canAccessStock, isOwner } from "@/lib/permissions";
import { makeId, migrationHint } from "@/lib/mobile/field-mappers";
import { vehicleFromRow } from "@/lib/mobile/vehicle-mappers";

async function requireStock(request: Request) {
  const user = await getAuthUserFromRequest(request);
  if (!user || (!canAccessStock(user) && !isOwner(user))) return null;
  return user;
}

function makeQrToken() {
  return `v_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export async function GET(request: Request) {
  const user = await requireStock(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const supabase = createSupabaseAdminClient();
  try {
    const { data: rows, error } = await supabase
      .from("vehicles")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(migrationHint(error.message, "032_vehicles_fuel.sql"));

    const techIds = [...new Set((rows ?? []).map((r) => r.technician_id))];
    const { data: techs } = techIds.length
      ? await supabase.from("team_members").select("id, name").in("id", techIds)
      : { data: [] as { id: string; name: string }[] };
    const nameById = new Map((techs ?? []).map((t) => [t.id, t.name]));

    return NextResponse.json({
      vehicles: (rows ?? []).map((r) =>
        vehicleFromRow(r, nameById.get(r.technician_id))
      ),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const user = await requireStock(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = (await request.json()) as Record<string, unknown>;
  const brand = String(body.brand ?? "").trim();
  const numberPlate = String(body.numberPlate ?? "").trim().toUpperCase();
  const technicianId = String(body.technicianId ?? "").trim();

  if (!numberPlate) {
    return NextResponse.json({ error: "Number plate is required" }, { status: 400 });
  }
  if (!technicianId) {
    return NextResponse.json({ error: "Technician is required" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();

  try {
    const { data: tech } = await supabase
      .from("team_members")
      .select("id, name")
      .eq("id", technicianId)
      .maybeSingle();
    if (!tech) {
      return NextResponse.json({ error: "Technician not found" }, { status: 400 });
    }

    const id = makeId("veh");
    const qrToken = makeQrToken();
    const { data, error } = await supabase
      .from("vehicles")
      .insert({
        id,
        brand,
        number_plate: numberPlate,
        technician_id: technicianId,
        qr_token: qrToken,
        active: true,
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();
    if (error) throw new Error(migrationHint(error.message, "032_vehicles_fuel.sql"));

    return NextResponse.json({
      ok: true,
      vehicle: vehicleFromRow(data, tech.name),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
