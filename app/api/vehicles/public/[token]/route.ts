import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Public vehicle QR lookup.
 *
 * Printed vehicle labels encode /v/{token}; a phone camera opens that URL in a
 * browser with no session, so this endpoint is deliberately anonymous and
 * returns only what is already painted on the vehicle: make and number plate.
 * The driver, fuel history and bookings need a signed-in surface.
 */

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token?.trim()) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data: vehicle, error } = await supabase
      .from("vehicles")
      .select("brand, number_plate, active")
      .eq("qr_token", token.trim())
      .maybeSingle();
    if (error) throw error;
    if (!vehicle || vehicle.active === false) {
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }

    return NextResponse.json(
      { vehicle: { brand: vehicle.brand ?? "", numberPlate: vehicle.number_plate } },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lookup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
