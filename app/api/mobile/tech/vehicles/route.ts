import { NextResponse } from "next/server";
import { extractVehicleQrToken } from "@megs/shared";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAuthenticated } from "@/lib/supabase/server-auth";
import { migrationHint } from "@/lib/mobile/field-mappers";
import { vehicleFromRow } from "@/lib/mobile/vehicle-mappers";

function isFieldTech(user: { role: string; department: string | null }) {
  return (
    user.department === "coordination" ||
    (user.department === "stock" && user.role === "staff")
  );
}

function techIdsFor(user: { id: string; authUserId?: string }) {
  const ids = [user.id];
  if (user.authUserId && user.authUserId !== user.id) {
    ids.push(user.authUserId);
  }
  return ids;
}

export async function GET(request: Request) {
  const user = await requireAuthenticated(request);
  if (!user || !isFieldTech(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const supabase = createSupabaseAdminClient();
  const techIds = techIdsFor(user);
  const tokenRaw = new URL(request.url).searchParams.get("token")?.trim() ?? "";
  const token = tokenRaw ? extractVehicleQrToken(tokenRaw) : "";

  try {
    if (token) {
      const { data, error } = await supabase
        .from("vehicles")
        .select("*")
        .eq("qr_token", token)
        .eq("active", true)
        .maybeSingle();
      if (error) throw new Error(migrationHint(error.message, "032_vehicles_fuel.sql"));
      if (!data) {
        return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
      }
      const { data: tech } = await supabase
        .from("team_members")
        .select("name")
        .eq("id", data.technician_id)
        .maybeSingle();
      return NextResponse.json({
        vehicle: vehicleFromRow(data, tech?.name),
      });
    }

    const { data: rows, error } = await supabase
      .from("vehicles")
      .select("*")
      .eq("active", true)
      .in("technician_id", techIds)
      .order("number_plate", { ascending: true });
    if (error) throw new Error(migrationHint(error.message, "032_vehicles_fuel.sql"));

    return NextResponse.json({
      vehicles: (rows ?? []).map((r) => vehicleFromRow(r, user.name ?? undefined)),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
