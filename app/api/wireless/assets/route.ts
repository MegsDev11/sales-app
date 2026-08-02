import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireWirelessAccess } from "@/lib/supabase/server-auth";
import { ensureWirelessBucket } from "@/lib/wireless/create-submission";
import { makeId } from "@/lib/mobile/field-mappers";
import { networkAssetFromRow, type NetworkLayoutAssetRow } from "@/lib/wireless/mappers";

/**
 * Photos and backdrops attached to a layout.
 *
 * Split out from /api/wireless because that route speaks JSON and this one has to
 * take multipart uploads. Submissions already had an upload path; this is the
 * office-side equivalent, and unlike submissions it can pin an image to a specific
 * canvas node — which is what makes a chalet marker's gallery possible.
 *
 * `node_id` and `sort_order` arrive in migration 050 and are not in the generated
 * Database types yet, so this route talks to an untyped view of the admin client.
 * RLS still applies; the wireless guard above is what returns a clean 403.
 */
function admin(): SupabaseClient {
  return createSupabaseAdminClient() as unknown as SupabaseClient;
}

const BUCKET = "wireless-assets";
const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Request failed";
}

/**
 * `node_id` and `sort_order` are what this route is built on, and both arrive in
 * migration 050. Point at that file specifically — the shared wireless hint names
 * migration 020, which is already applied and would send someone in circles.
 */
function migrationHint(message: string): string {
  if (/node_id|sort_order|schema cache|does not exist/i.test(message)) {
    return `${message}. Run supabase/migrations/050_site_plans.sql in Supabase.`;
  }
  return message;
}

/**
 * Photos for one layout, in display order.
 *
 * Ordering happens in JS rather than SQL on purpose: `sort_order` arrives with
 * migration 050, and an `.order("sort_order")` against a database that has not run
 * it yet fails with "column does not exist" — burying the real, fixable problem
 * under a query error.
 */
async function listAssets(supabase: SupabaseClient, layoutId: string) {
  const { data, error } = await supabase
    .from("network_layout_assets")
    .select("*")
    .eq("layout_id", layoutId);
  if (error) throw new Error(migrationHint(error.message));

  return ((data ?? []) as NetworkLayoutAssetRow[])
    .map(networkAssetFromRow)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
}

export async function GET(request: Request) {
  const user = await requireWirelessAccess(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const layoutId = new URL(request.url).searchParams.get("layoutId");
  if (!layoutId) return NextResponse.json({ error: "layoutId required" }, { status: 400 });

  try {
    return NextResponse.json({ assets: await listAssets(admin(), layoutId) });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await requireWirelessAccess(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const contentType = request.headers.get("content-type") ?? "";
  const supabase = admin();

  try {
    // ---- Upload -------------------------------------------------------------
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const layoutId = String(form.get("layoutId") ?? "").trim();
      if (!layoutId) return NextResponse.json({ error: "layoutId required" }, { status: 400 });

      // Empty string means "belongs to the layout, not to any one marker".
      const nodeId = String(form.get("nodeId") ?? "").trim() || null;
      const rawKind = String(form.get("kind") ?? "photo");
      const kind = rawKind === "backdrop" || rawKind === "sketch" ? rawKind : "photo";
      const captions = form.getAll("captions").map((c) => String(c));

      const files = form.getAll("files").filter((f): f is File => {
        return typeof File !== "undefined" && f instanceof File && f.size > 0;
      });
      if (files.length === 0) {
        return NextResponse.json({ error: "No files received" }, { status: 400 });
      }

      for (const file of files) {
        if (file.size > MAX_BYTES) {
          return NextResponse.json(
            {
              error: `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)}MB — the limit is ${MAX_BYTES / 1024 / 1024}MB. Export the image at a lower resolution and try again.`,
            },
            { status: 413 }
          );
        }
        if (file.type && !ALLOWED.includes(file.type)) {
          return NextResponse.json(
            { error: `${file.name} is ${file.type}, which is not an image format we accept.` },
            { status: 415 }
          );
        }
      }

      await ensureWirelessBucket(createSupabaseAdminClient());

      // New photos land after whatever is already on this layout.
      const existing = await listAssets(supabase, layoutId);
      let nextOrder = existing.reduce((max, a) => Math.max(max, a.sortOrder), -1) + 1;

      const now = new Date().toISOString();
      const rows = [];

      for (const [i, file] of files.entries()) {
        const assetId = makeId("nla");
        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `layouts/${layoutId}/${assetId}.${ext}`;
        const buffer = Buffer.from(await file.arrayBuffer());

        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, buffer, {
          contentType: file.type || "image/jpeg",
          upsert: false,
        });
        if (upErr) throw new Error(upErr.message);

        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
        rows.push({
          id: assetId,
          submission_id: null,
          layout_id: layoutId,
          node_id: nodeId,
          kind,
          storage_path: path,
          public_url: pub.publicUrl,
          caption: captions[i] ?? "",
          sort_order: nextOrder++,
          created_at: now,
        });
      }

      const { error: insErr } = await supabase.from("network_layout_assets").insert(rows);
      if (insErr) throw new Error(migrationHint(insErr.message));

      return NextResponse.json({ ok: true, assets: await listAssets(supabase, layoutId) });
    }

    // ---- Edit / delete ------------------------------------------------------
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");

    if (action === "update_asset") {
      const assetId = String(body.assetId ?? "");
      const updates: Record<string, unknown> = {};
      if ("caption" in body) updates.caption = String(body.caption ?? "");
      // Moving a photo between markers is a re-tag, not a re-upload.
      if ("nodeId" in body) updates.node_id = (body.nodeId as string) || null;
      if ("sortOrder" in body) updates.sort_order = Number(body.sortOrder) || 0;

      const { error } = await supabase
        .from("network_layout_assets")
        .update(updates)
        .eq("id", assetId);
      if (error) throw new Error(migrationHint(error.message));
      return NextResponse.json({ ok: true });
    }

    if (action === "delete_asset") {
      const assetId = String(body.assetId ?? "");
      const { data: asset } = await supabase
        .from("network_layout_assets")
        .select("storage_path")
        .eq("id", assetId)
        .maybeSingle();

      const { error } = await supabase
        .from("network_layout_assets")
        .delete()
        .eq("id", assetId);
      if (error) throw new Error(migrationHint(error.message));

      // Row first, then the file: an orphaned object costs storage, an orphaned
      // row renders as a broken image on the plan.
      const path = (asset as { storage_path?: string } | null)?.storage_path;
      if (path) await supabase.storage.from(BUCKET).remove([path]);

      return NextResponse.json({ ok: true });
    }

    /**
     * Deleting a marker takes its photos with it. Called by the canvas rather than
     * left to a cascade, because node ids live inside canvas_json where the
     * database cannot see them.
     */
    if (action === "delete_node_assets") {
      const layoutId = String(body.layoutId ?? "");
      const nodeId = String(body.nodeId ?? "");
      if (!layoutId || !nodeId) {
        return NextResponse.json({ error: "layoutId and nodeId required" }, { status: 400 });
      }

      const { data: assets } = await supabase
        .from("network_layout_assets")
        .select("storage_path")
        .eq("layout_id", layoutId)
        .eq("node_id", nodeId);

      const { error } = await supabase
        .from("network_layout_assets")
        .delete()
        .eq("layout_id", layoutId)
        .eq("node_id", nodeId);
      if (error) throw new Error(migrationHint(error.message));

      const paths = ((assets ?? []) as { storage_path: string }[]).map((a) => a.storage_path);
      if (paths.length) await supabase.storage.from(BUCKET).remove(paths);

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
