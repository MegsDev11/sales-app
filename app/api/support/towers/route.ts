import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAuthenticated, requireSupportAccess } from "@/lib/supabase/server-auth";
import {
  towerFromRow,
  towerOutageFromRow,
  towerOutageToRow,
  towerOutageUpdatesToRow,
  towerUpdatesToRow,
} from "@/lib/supabase/mappers";
import type { Tower, TowerOutage, TowerStatus } from "@/lib/types";

/** Load towers + outages via service role (bypasses RLS). */
export async function GET(request: Request) {
  const user = await requireAuthenticated(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const [towersRes, outagesRes] = await Promise.all([
      supabase.from("towers").select("*").order("name"),
      supabase.from("tower_outages").select("*").order("started_at", { ascending: false }),
    ]);

    if (towersRes.error) throw towersRes.error;
    if (outagesRes.error) throw outagesRes.error;

    return NextResponse.json({
      towers: (towersRes.data ?? []).map(towerFromRow),
      towerOutages: (outagesRes.data ?? []).map(towerOutageFromRow),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load towers";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type PatchBody =
  | {
      action: "setStatus";
      towerId: string;
      status: Exclude<TowerStatus, "offline">;
      updatedById: string;
    }
  | {
      action: "createOutage";
      outage: TowerOutage;
    }
  | {
      action: "resolveOutage";
      outageId: string;
      towerId: string;
    }
  | {
      action: "patchTower";
      towerId: string;
      updates: Partial<Tower>;
    };

/** Mutate tower status / outages via service role. */
export async function POST(request: Request) {
  const user = await requireSupportAccess(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = (await request.json()) as PatchBody;
    const supabase = createSupabaseAdminClient();
    const now = new Date().toISOString();

    if (body.action === "setStatus") {
      const { data: active } = await supabase
        .from("tower_outages")
        .select("id")
        .eq("tower_id", body.towerId)
        .is("resolved_at", null);

      if (active?.length) {
        await Promise.all(
          active.map((row) =>
            supabase
              .from("tower_outages")
              .update(towerOutageUpdatesToRow({ resolvedAt: now }))
              .eq("id", row.id)
          )
        );
      }

      const { error } = await supabase
        .from("towers")
        .update(
          towerUpdatesToRow({
            status: body.status,
            updatedAt: now,
            updatedById: body.updatedById,
          })
        )
        .eq("id", body.towerId);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (body.action === "createOutage") {
      const { error: outageError } = await supabase
        .from("tower_outages")
        .insert(towerOutageToRow(body.outage));
      if (outageError) throw outageError;

      const { error: towerError } = await supabase
        .from("towers")
        .update(
          towerUpdatesToRow({
            status: "offline",
            updatedAt: body.outage.startedAt,
            updatedById: body.outage.createdById ?? null,
          })
        )
        .eq("id", body.outage.towerId);
      if (towerError) throw towerError;
      return NextResponse.json({ ok: true });
    }

    if (body.action === "resolveOutage") {
      const { error: outageError } = await supabase
        .from("tower_outages")
        .update(towerOutageUpdatesToRow({ resolvedAt: now }))
        .eq("id", body.outageId);
      if (outageError) throw outageError;

      const { error: towerError } = await supabase
        .from("towers")
        .update(towerUpdatesToRow({ status: "online", updatedAt: now }))
        .eq("id", body.towerId);
      if (towerError) throw towerError;
      return NextResponse.json({ ok: true });
    }

    if (body.action === "patchTower") {
      const { error } = await supabase
        .from("towers")
        .update(towerUpdatesToRow(body.updates))
        .eq("id", body.towerId);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tower update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
