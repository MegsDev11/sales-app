import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { PublicNetworkOutage, TowerStatus } from "@/lib/types";
import { deriveAreaStatus } from "@/lib/utils/tower-status";

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

    const { data: sites, error: sitesError } = await supabase
      .from("tower_sites")
      .select("area_id, status");

    if (outagesError || towersError) {
      return NextResponse.json(
        { outages: [], towers: [] },
        { headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }

    // Sites optional until migration 027 is applied — fall back to stored area status
    const sitesByArea = new Map<string, TowerStatus[]>();
    if (!sitesError) {
      for (const row of sites ?? []) {
        const list = sitesByArea.get(row.area_id) ?? [];
        list.push(row.status as TowerStatus);
        sitesByArea.set(row.area_id, list);
      }
    }

    const towerNames = new Map((towers ?? []).map((t) => [t.id, t.name]));
    const offlineTowerIds = new Set((outages ?? []).map((o) => o.tower_id));

    const result: PublicNetworkOutage[] = (outages ?? []).map((row) => ({
      id: row.id,
      towerId: row.tower_id,
      towerName: towerNames.get(row.tower_id) ?? "Unknown area",
      title: row.title,
      message: row.message,
      affectedAreas: row.affected_areas ?? [],
      startedAt: row.started_at,
    }));

    const publicTowers = (towers ?? []).map((row) => {
      const status = deriveAreaStatus(
        row.status as TowerStatus,
        sitesByArea.get(row.id) ?? [],
        offlineTowerIds.has(row.id)
      );
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
