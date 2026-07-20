import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  stockBookingFromRow,
  stockItemFromRow,
  stockProductFromRow,
} from "@/lib/supabase/mappers";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    const supabase = createSupabaseAdminClient();

    const { data: itemRow, error } = await supabase
      .from("stock_items")
      .select("*")
      .eq("qr_token", token)
      .maybeSingle();

    if (error) throw error;
    if (!itemRow) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const [{ data: productRow }, { data: bookingRow }] = await Promise.all([
      supabase.from("stock_products").select("*").eq("id", itemRow.product_id).maybeSingle(),
      supabase
        .from("stock_bookings")
        .select("*")
        .eq("item_id", itemRow.id)
        .is("returned_at", null)
        .maybeSingle(),
    ]);

    let technicianName: string | null = null;
    let clientName: string | null = null;

    if (bookingRow) {
      const [{ data: tech }, { data: lead }] = await Promise.all([
        supabase
          .from("team_members")
          .select("id, name")
          .eq("id", bookingRow.technician_id)
          .maybeSingle(),
        bookingRow.lead_id
          ? supabase
              .from("leads")
              .select("id, client_name")
              .eq("id", bookingRow.lead_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      technicianName = tech?.name ?? null;
      clientName = lead?.client_name ?? null;
    }

    return NextResponse.json(
      {
        item: stockItemFromRow(itemRow),
        product: productRow ? stockProductFromRow(productRow) : null,
        booking: bookingRow ? stockBookingFromRow(bookingRow) : null,
        technicianName,
        clientName,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load item";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
