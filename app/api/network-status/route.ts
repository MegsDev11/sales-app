import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { PublicNetworkOutage, TowerStatus } from "@/lib/types";

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
      .select("id, name, status");

    if (outagesError || towersError) {
      return NextResponse.json(
        { outages: [], towers: [] },
        { headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }

    const towerNames = new Map((towers ?? []).map((t) => [t.id, t.name]));
    const offlineTowerIds = new Set((outages ?? []).map((o) => o.tower_id));

    const result: PublicNetworkOutage[] = (outages ?? []).map((row) => ({
      id: row.id,
      towerId: row.tower_id,
      towerName: towerNames.get(row.tower_id) ?? "Unknown tower",
      title: row.title,
      message: row.message,
      affectedAreas: row.affected_areas ?? [],
      startedAt: row.started_at,
    }));

    const publicTowers = (towers ?? []).map((row) => {
      let status = row.status as TowerStatus;
      if (offlineTowerIds.has(row.id)) status = "offline";
      return { id: row.id, name: row.name, status };
    });

    return NextResponse.json(
      { outages: result, towers: publicTowers },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch {
    return NextResponse.json(
      { outages: [], towers: [] },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
}
