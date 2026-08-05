import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireStockAccess } from "@/lib/supabase/server-auth";

/**
 * Open pick lists for the mobile book-out screen.
 *
 * fulfillScan requires a requestId — a unit is always booked out against a
 * pick-list line — but the mobile screen had no way to choose one, which left
 * scan-to-book-out dead on mobile. This returns the open/partial requests with
 * enough context to pick the right one at the shelf.
 */

export async function GET(request: Request) {
  const user = await requireStockAccess(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const supabase = createSupabaseAdminClient();
  try {
    const { data: requests, error } = await supabase
      .from("stock_requests")
      .select("id, title, technician_id, lead_id, status, created_at")
      .in("status", ["open", "partial"])
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;

    const rows = requests ?? [];
    const requestIds = rows.map((r) => r.id);
    const technicianIds = [...new Set(rows.map((r) => r.technician_id))];
    const leadIds = [...new Set(rows.map((r) => r.lead_id).filter(Boolean))] as string[];

    const [linesRes, techsRes, leadsRes] = await Promise.all([
      supabase
        .from("stock_request_lines")
        .select("request_id, qty_needed, qty_fulfilled")
        .in("request_id", requestIds.length ? requestIds : ["__none__"]),
      supabase
        .from("team_members")
        .select("id, name")
        .in("id", technicianIds.length ? technicianIds : ["__none__"]),
      supabase
        .from("leads")
        .select("id, client_name")
        .in("id", leadIds.length ? leadIds : ["__none__"]),
    ]);

    const outstanding = new Map<string, number>();
    for (const line of linesRes.data ?? []) {
      const open = Math.max(0, Number(line.qty_needed) - Number(line.qty_fulfilled));
      outstanding.set(line.request_id, (outstanding.get(line.request_id) ?? 0) + open);
    }
    const techName = new Map((techsRes.data ?? []).map((t) => [t.id, t.name]));
    const leadName = new Map((leadsRes.data ?? []).map((l) => [l.id, l.client_name]));

    return NextResponse.json(
      {
        requests: rows.map((r) => ({
          id: r.id,
          title: r.title,
          status: r.status,
          technicianName: techName.get(r.technician_id) ?? "Unknown",
          clientName: r.lead_id ? leadName.get(r.lead_id) ?? "" : "",
          outstanding: outstanding.get(r.id) ?? 0,
          createdAt: r.created_at,
        })),
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
