import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractVehicleQrToken } from "@megs/shared";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAuthenticated } from "@/lib/supabase/server-auth";
import { makeId, migrationHint } from "@/lib/mobile/field-mappers";
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

      // Who has it right now, and the last odometer reading we know of — the
      // scan screen prefills the next reading from it (migration 069).
      const { data: open } = await (supabase as unknown as SupabaseClient)
        .from("vehicle_bookings")
        .select("id, technician_id, booked_out_at, odometer_start")
        .eq("vehicle_id", data.id)
        .is("returned_at", null)
        .maybeSingle();
      let holderName: string | null = null;
      if (open?.technician_id) {
        const { data: holder } = await supabase
          .from("team_members")
          .select("name")
          .eq("id", open.technician_id as string)
          .maybeSingle();
        holderName = holder?.name ?? null;
      }
      const { data: lastReading } = await (supabase as unknown as SupabaseClient)
        .from("vehicle_bookings")
        .select("odometer_end")
        .eq("vehicle_id", data.id)
        .not("odometer_end", "is", null)
        .order("returned_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return NextResponse.json({
        vehicle: vehicleFromRow(data, tech?.name),
        booking: open
          ? {
              id: String(open.id),
              technicianId: String(open.technician_id),
              technicianName: holderName,
              bookedOutAt: String(open.booked_out_at),
              odometerStart: open.odometer_start ?? null,
              isMine: techIds.includes(String(open.technician_id)),
            }
          : null,
        lastOdometer: lastReading?.odometer_end ?? open?.odometer_start ?? null,
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

/**
 * Vehicle custody (migration 069).
 *
 * bookOut takes the key: one open booking per vehicle is enforced by a partial
 * unique index, so two technicians cannot both hold the same bakkie.
 * bookIn hands it back with the closing odometer, which is what turns litres
 * into km/L on the fuel tracker.
 */
export async function POST(request: Request) {
  const user = await requireAuthenticated(request);
  if (!user || !isFieldTech(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      action?: string;
      vehicleId?: string;
      odometer?: number;
      notes?: string;
    };
    const db = createSupabaseAdminClient() as unknown as SupabaseClient;
    const now = new Date().toISOString();

    if (!body.vehicleId) {
      return NextResponse.json({ error: "vehicleId required" }, { status: 400 });
    }

    const { data: vehicle } = await db
      .from("vehicles")
      .select("id, active")
      .eq("id", body.vehicleId)
      .maybeSingle();
    if (!vehicle || vehicle.active === false) {
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }

    const odometer =
      body.odometer == null || !Number.isFinite(Number(body.odometer))
        ? null
        : Math.round(Number(body.odometer));

    if (body.action === "bookOut") {
      const { error } = await db.from("vehicle_bookings").insert({
        id: makeId("vbk"),
        vehicle_id: body.vehicleId,
        technician_id: user.id,
        booked_out_at: now,
        booked_out_by: user.id,
        odometer_start: odometer,
        notes: body.notes?.trim() ?? "",
      });
      if (error) {
        if (/vehicle_bookings_open_key|duplicate key/i.test(error.message)) {
          return NextResponse.json(
            { error: "Someone already has this vehicle booked out" },
            { status: 409 }
          );
        }
        throw new Error(
          migrationHint(error.message, "069_client_qr_vehicles_ppe.sql")
        );
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === "bookIn") {
      const { data: open } = await db
        .from("vehicle_bookings")
        .select("id, technician_id, odometer_start")
        .eq("vehicle_id", body.vehicleId)
        .is("returned_at", null)
        .maybeSingle();
      if (!open) {
        return NextResponse.json(
          { error: "This vehicle is not booked out" },
          { status: 400 }
        );
      }
      // A closing reading below the opening one is a typo, not a trip.
      if (
        odometer != null &&
        open.odometer_start != null &&
        odometer < Number(open.odometer_start)
      ) {
        return NextResponse.json(
          {
            error: `The closing reading is below the opening one (${open.odometer_start} km)`,
          },
          { status: 400 }
        );
      }
      const { error } = await db
        .from("vehicle_bookings")
        .update({ returned_at: now, odometer_end: odometer })
        .eq("id", open.id as string);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json(
      { error: `Unknown action: ${body.action ?? ""}` },
      { status: 400 }
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
