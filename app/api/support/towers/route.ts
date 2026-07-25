import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAuthenticated, requireSupportAccess } from "@/lib/supabase/server-auth";
import {
  towerFromRow,
  towerOutageFromRow,
  towerOutageToRow,
  towerOutageUpdatesToRow,
  towerSiteFromRow,
  towerSiteToRow,
  towerSiteUpdatesToRow,
  towerToRow,
  towerUpdatesToRow,
} from "@/lib/supabase/mappers";
import { migrationHint } from "@/lib/mobile/field-mappers";
import { deriveAreaStatus } from "@/lib/utils/tower-status";
import type { Tower, TowerOutage, TowerSite, TowerStatus } from "@/lib/types";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

async function syncAreaStatusFromSites(
  supabase: AdminClient,
  areaId: string,
  updatedById: string | null,
  now: string,
  opts?: { resolveOutagesIfClear?: boolean }
) {
  const [{ data: area }, { data: sites }, { data: active }] = await Promise.all([
    supabase.from("towers").select("status").eq("id", areaId).maybeSingle(),
    supabase.from("tower_sites").select("status").eq("area_id", areaId),
    supabase
      .from("tower_outages")
      .select("id")
      .eq("tower_id", areaId)
      .is("resolved_at", null),
  ]);

  const siteStatuses = (sites ?? []).map((s) => s.status as TowerStatus);
  const anySiteOffline = siteStatuses.some((s) => s === "offline");

  if (opts?.resolveOutagesIfClear && !anySiteOffline && active?.length) {
    await Promise.all(
      active.map((row) =>
        supabase
          .from("tower_outages")
          .update(towerOutageUpdatesToRow({ resolvedAt: now }))
          .eq("id", row.id)
      )
    );
  }

  const hasActiveOutage =
    opts?.resolveOutagesIfClear && !anySiteOffline
      ? false
      : (active?.length ?? 0) > 0;

  const nextStatus = deriveAreaStatus(
    (area?.status as TowerStatus) ?? "online",
    siteStatuses,
    hasActiveOutage
  );

  await supabase
    .from("towers")
    .update(
      towerUpdatesToRow({
        status: nextStatus,
        updatedAt: now,
        updatedById,
      })
    )
    .eq("id", areaId);

  return nextStatus;
}

/** Load coverage areas + outages + private sites via service role. */
export async function GET(request: Request) {
  const user = await requireAuthenticated(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const [towersRes, outagesRes, sitesRes] = await Promise.all([
      supabase.from("towers").select("*").order("name"),
      supabase.from("tower_outages").select("*").order("started_at", { ascending: false }),
      supabase.from("tower_sites").select("*").order("name"),
    ]);

    if (towersRes.error) throw towersRes.error;
    if (outagesRes.error) throw outagesRes.error;
    if (sitesRes.error) {
      throw new Error(migrationHint(sitesRes.error.message, "027_tower_sites.sql"));
    }

    return NextResponse.json({
      towers: (towersRes.data ?? []).map(towerFromRow),
      towerOutages: (outagesRes.data ?? []).map(towerOutageFromRow),
      towerSites: (sitesRes.data ?? []).map(towerSiteFromRow),
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
      action: "setSiteStatus";
      siteId: string;
      status: Exclude<TowerStatus, "offline">;
      updatedById: string;
    }
  | {
      action: "createOutage";
      outage: TowerOutage;
      siteId?: string;
    }
  | {
      action: "resolveOutage";
      outageId: string;
      towerId: string;
    }
  | {
      action: "createTower";
      tower: Tower;
    }
  | {
      action: "patchTower";
      towerId: string;
      updates: Partial<Tower>;
    }
  | {
      action: "createSite";
      site: TowerSite;
    }
  | {
      action: "patchSite";
      siteId: string;
      updates: Partial<TowerSite>;
    }
  | {
      action: "deleteSite";
      siteId: string;
    };

/** Mutate area status / outages / sites via service role. */
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

    if (body.action === "setSiteStatus") {
      const { data: site, error: siteLoadError } = await supabase
        .from("tower_sites")
        .select("id, area_id")
        .eq("id", body.siteId)
        .maybeSingle();
      if (siteLoadError) {
        throw new Error(migrationHint(siteLoadError.message, "027_tower_sites.sql"));
      }
      if (!site) {
        return NextResponse.json({ error: "Site not found" }, { status: 404 });
      }

      const { error: siteError } = await supabase
        .from("tower_sites")
        .update(
          towerSiteUpdatesToRow({
            status: body.status,
            updatedAt: now,
            updatedById: body.updatedById,
          })
        )
        .eq("id", body.siteId);
      if (siteError) {
        throw new Error(migrationHint(siteError.message, "027_tower_sites.sql"));
      }

      const areaStatus = await syncAreaStatusFromSites(
        supabase,
        site.area_id,
        body.updatedById,
        now,
        { resolveOutagesIfClear: true }
      );

      return NextResponse.json({ ok: true, areaStatus });
    }

    if (body.action === "createOutage") {
      const { error: outageError } = await supabase
        .from("tower_outages")
        .insert(towerOutageToRow(body.outage));
      if (outageError) throw outageError;

      if (body.siteId) {
        const { error: siteError } = await supabase
          .from("tower_sites")
          .update(
            towerSiteUpdatesToRow({
              status: "offline",
              updatedAt: body.outage.startedAt,
              updatedById: body.outage.createdById ?? null,
            })
          )
          .eq("id", body.siteId);
        if (siteError) {
          throw new Error(migrationHint(siteError.message, "027_tower_sites.sql"));
        }
      }

      await syncAreaStatusFromSites(
        supabase,
        body.outage.towerId,
        body.outage.createdById ?? null,
        body.outage.startedAt
      );

      return NextResponse.json({ ok: true });
    }

    if (body.action === "resolveOutage") {
      const { error: outageError } = await supabase
        .from("tower_outages")
        .update(towerOutageUpdatesToRow({ resolvedAt: now }))
        .eq("id", body.outageId);
      if (outageError) throw outageError;

      await syncAreaStatusFromSites(supabase, body.towerId, null, now);

      return NextResponse.json({ ok: true });
    }

    if (body.action === "createTower") {
      const { error } = await supabase.from("towers").insert(towerToRow(body.tower));
      if (error) throw error;
      return NextResponse.json({ ok: true, tower: body.tower });
    }

    if (body.action === "patchTower") {
      const { error } = await supabase
        .from("towers")
        .update(towerUpdatesToRow(body.updates))
        .eq("id", body.towerId);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (body.action === "createSite") {
      const { error } = await supabase.from("tower_sites").insert(towerSiteToRow(body.site));
      if (error) {
        throw new Error(migrationHint(error.message, "027_tower_sites.sql"));
      }
      await syncAreaStatusFromSites(
        supabase,
        body.site.areaId,
        body.site.updatedById ?? null,
        now
      );
      return NextResponse.json({ ok: true, site: body.site });
    }

    if (body.action === "patchSite") {
      const { error } = await supabase
        .from("tower_sites")
        .update(towerSiteUpdatesToRow(body.updates))
        .eq("id", body.siteId);
      if (error) {
        throw new Error(migrationHint(error.message, "027_tower_sites.sql"));
      }
      if (body.updates.status !== undefined || body.updates.areaId !== undefined) {
        const { data: site } = await supabase
          .from("tower_sites")
          .select("area_id")
          .eq("id", body.siteId)
          .maybeSingle();
        if (site) {
          await syncAreaStatusFromSites(
            supabase,
            site.area_id,
            body.updates.updatedById ?? null,
            now,
            { resolveOutagesIfClear: body.updates.status !== "offline" }
          );
        }
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === "deleteSite") {
      const { data: site } = await supabase
        .from("tower_sites")
        .select("area_id")
        .eq("id", body.siteId)
        .maybeSingle();
      const { error } = await supabase.from("tower_sites").delete().eq("id", body.siteId);
      if (error) {
        throw new Error(migrationHint(error.message, "027_tower_sites.sql"));
      }
      if (site) {
        await syncAreaStatusFromSites(supabase, site.area_id, null, now, {
          resolveOutagesIfClear: true,
        });
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tower update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
