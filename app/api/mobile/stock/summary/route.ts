import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireStockAccess } from "@/lib/supabase/server-auth";

export async function GET(request: Request) {
  const user = await requireStockAccess(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const supabase = createSupabaseAdminClient();
  try {
    const [itemsRes, requestsRes] = await Promise.all([
      supabase.from("stock_items").select("id, status"),
      supabase.from("stock_requests").select("id, status").in("status", ["open", "partial"]),
    ]);

    if (itemsRes.error) throw itemsRes.error;
    const items = itemsRes.data ?? [];
    const available = items.filter((i) => i.status === "available").length;
    const bookedOut = items.filter((i) => i.status === "booked_out").length;

    return NextResponse.json({
      available,
      bookedOut,
      total: items.length,
      openRequests: (requestsRes.data ?? []).length,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
