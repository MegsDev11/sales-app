import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { PublicNetworkOutage } from "@/lib/types";

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();
    const { data: outages, error: outagesError } = await supabase
      .from("tower_outages")
      .select("id, tower_id, title, message, affected_areas, started_at")
      .is("resolved_at", null)
      .eq("is_public", true)
      .order("started_at", { ascending: false });

    const { data: towers, error: towersError } = await supabase
      .from("towers")
      .select("id, name");

    if (outagesError || towersError) {
      return NextResponse.json({ outages: [] });
    }

    const towerNames = new Map((towers ?? []).map((t) => [t.id, t.name]));

    const result: PublicNetworkOutage[] = (outages ?? []).map((row) => ({
      id: row.id,
      towerId: row.tower_id,
      towerName: towerNames.get(row.tower_id) ?? "Unknown tower",
      title: row.title,
      message: row.message,
      affectedAreas: row.affected_areas ?? [],
      startedAt: row.started_at,
    }));

    return NextResponse.json({ outages: result });
  } catch {
    return NextResponse.json({ outages: [] });
  }
}
