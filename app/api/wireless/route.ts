import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireWirelessAccess } from "@/lib/supabase/server-auth";
import {
  networkAssetFromRow,
  networkDeviceFromRow,
  networkLayoutFromRow,
  networkSubmissionFromRow,
  type NetworkDeviceRow,
  type NetworkLayoutAssetRow,
  type NetworkLayoutRow,
  type NetworkLayoutSubmissionRow,
} from "@/lib/wireless/mappers";
import type { NetworkCanvasDocument } from "@/lib/wireless/layout-types";
import { EMPTY_CANVAS } from "@/lib/wireless/layout-types";
import { isRuijieConfigured } from "@/lib/wireless/ruijie-client";
import type { Json } from "@/lib/supabase/database.types";
import type { Database } from "@/lib/supabase/database.types";

type SubmissionUpdate = Database["public"]["Tables"]["network_layout_submissions"]["Update"];
type LayoutUpdate = Database["public"]["Tables"]["network_layouts"]["Update"];

const WIRELESS_BUCKET = "wireless-assets";

function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

function migrationHint(message: string) {
  if (/does not exist|schema cache|network_layout/i.test(message)) {
    return `${message}. Run supabase/migrations/020_wireless_network_layouts.sql in Supabase.`;
  }
  return message;
}

async function ensureBucket(supabase: ReturnType<typeof createSupabaseAdminClient>) {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (buckets?.some((b) => b.id === WIRELESS_BUCKET || b.name === WIRELESS_BUCKET)) return;
  await supabase.storage.createBucket(WIRELESS_BUCKET, { public: true });
}

async function loadLeadNames(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  leadIds: string[]
) {
  const unique = [...new Set(leadIds.filter(Boolean))];
  if (unique.length === 0) return new Map<string, string>();
  const { data } = await supabase.from("leads").select("id, client_name").in("id", unique);
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    map.set(row.id, row.client_name);
  }
  return map;
}

async function loadWirelessBundle() {
  const supabase = createSupabaseAdminClient();
  const [submissionsRes, layoutsRes, assetsRes, devicesRes, wirelessLeadsRes] =
    await Promise.all([
      supabase
        .from("network_layout_submissions")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase.from("network_layouts").select("*").order("updated_at", { ascending: false }),
      supabase
        .from("network_layout_assets")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase.from("network_devices").select("*").order("updated_at", { ascending: false }),
      supabase
        .from("leads")
        .select("id, client_name, address, service_type, phone, email, stage")
        .in("service_type", ["wireless", "both"])
        .eq("deleted", false)
        .order("client_name"),
    ]);

  for (const res of [submissionsRes, layoutsRes, assetsRes, devicesRes]) {
    if (res.error) throw new Error(migrationHint(res.error.message));
  }

  const leadIds = [
    ...(submissionsRes.data ?? []).map((r) => r.lead_id as string | null),
    ...(layoutsRes.data ?? []).map((r) => r.lead_id as string | null),
  ].filter(Boolean) as string[];
  const names = await loadLeadNames(supabase, leadIds);

  const assetsBySubmission = new Map<string, ReturnType<typeof networkAssetFromRow>[]>();
  const assetsByLayout = new Map<string, ReturnType<typeof networkAssetFromRow>[]>();
  for (const row of (assetsRes.data ?? []) as NetworkLayoutAssetRow[]) {
    const asset = networkAssetFromRow(row);
    if (asset.submissionId) {
      const list = assetsBySubmission.get(asset.submissionId) ?? [];
      list.push(asset);
      assetsBySubmission.set(asset.submissionId, list);
    }
    if (asset.layoutId) {
      const list = assetsByLayout.get(asset.layoutId) ?? [];
      list.push(asset);
      assetsByLayout.set(asset.layoutId, list);
    }
  }

  const devicesByLayout = new Map<string, ReturnType<typeof networkDeviceFromRow>[]>();
  for (const row of (devicesRes.data ?? []) as NetworkDeviceRow[]) {
    const device = networkDeviceFromRow(row);
    const list = devicesByLayout.get(device.layoutId) ?? [];
    list.push(device);
    devicesByLayout.set(device.layoutId, list);
  }

  const submissions = ((submissionsRes.data ?? []) as NetworkLayoutSubmissionRow[]).map((row) =>
    networkSubmissionFromRow(
      row,
      assetsBySubmission.get(row.id) ?? [],
      row.lead_id ? names.get(row.lead_id) : undefined
    )
  );

  const layouts = ((layoutsRes.data ?? []) as NetworkLayoutRow[]).map((row) =>
    networkLayoutFromRow(
      row,
      devicesByLayout.get(row.id) ?? [],
      assetsByLayout.get(row.id) ?? [],
      row.lead_id ? names.get(row.lead_id) : undefined
    )
  );

  const layoutLeadIds = new Set(layouts.map((l) => l.leadId).filter(Boolean));
  const clients = (wirelessLeadsRes.error ? [] : wirelessLeadsRes.data ?? []).map((row) => ({
    id: row.id as string,
    clientName: row.client_name as string,
    address: (row.address as string) ?? "",
    serviceType: row.service_type as string,
    phone: (row.phone as string) ?? "",
    email: (row.email as string) ?? "",
    stage: row.stage as string,
    hasLayout: layoutLeadIds.has(row.id as string),
    publishedLayoutId:
      layouts.find((l) => l.leadId === row.id && l.status === "published")?.id ?? null,
  }));

  // Also include leads that have layouts but aren't wireless/both
  for (const layout of layouts) {
    if (!layout.leadId || clients.some((c) => c.id === layout.leadId)) continue;
    clients.push({
      id: layout.leadId,
      clientName: layout.clientName ?? "Client",
      address: "",
      serviceType: "wireless",
      phone: "",
      email: "",
      stage: "",
      hasLayout: true,
      publishedLayoutId:
        layouts.find((l) => l.leadId === layout.leadId && l.status === "published")?.id ?? null,
    });
  }

  const devices = layouts.flatMap((l) => l.devices ?? []);
  const overview = {
    openSubmissions: submissions.filter((s) => s.status === "new" || s.status === "in_progress")
      .length,
    draftLayouts: layouts.filter((l) => l.status === "draft").length,
    publishedLayouts: layouts.filter((l) => l.status === "published").length,
    routersOnline: devices.filter((d) => d.status === "online").length,
    routersOffline: devices.filter((d) => d.status === "offline").length,
    routersUnknown: devices.filter((d) => d.status === "unknown").length,
    ruijieConfigured: isRuijieConfigured(),
  };

  return { submissions, layouts, clients, overview };
}

export async function GET(request: Request) {
  const user = await requireWirelessAccess(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  try {
    const data = await loadWirelessBundle();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load wireless data";
    return NextResponse.json({ error: migrationHint(message) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await requireWirelessAccess(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const contentType = request.headers.get("content-type") ?? "";
  const supabase = createSupabaseAdminClient();

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const action = String(form.get("action") ?? "create_submission");
      if (action !== "create_submission") {
        return NextResponse.json({ error: "Unsupported multipart action" }, { status: 400 });
      }

      await ensureBucket(supabase);
      const leadId = String(form.get("leadId") ?? "").trim() || null;
      const notes = String(form.get("notes") ?? "").trim();
      const submissionId = id("nls");
      const now = new Date().toISOString();

      const { error: subErr } = await supabase.from("network_layout_submissions").insert({
        id: submissionId,
        lead_id: leadId,
        notes,
        status: "new",
        created_by: user.id,
        created_at: now,
        updated_at: now,
      });
      if (subErr) throw new Error(migrationHint(subErr.message));

      const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
      const kinds = form.getAll("kinds").map((k) => String(k));
      const captions = form.getAll("captions").map((c) => String(c));
      const assetRows = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const kind = (kinds[i] || "photo") as "sketch" | "photo" | "reference";
        const caption = captions[i] || "";
        const assetId = id("nla");
        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `submissions/${submissionId}/${assetId}.${ext}`;
        const buffer = Buffer.from(await file.arrayBuffer());
        const { error: upErr } = await supabase.storage
          .from(WIRELESS_BUCKET)
          .upload(path, buffer, { contentType: file.type || "image/jpeg", upsert: false });
        if (upErr) throw new Error(upErr.message);

        const { data: pub } = supabase.storage.from(WIRELESS_BUCKET).getPublicUrl(path);
        assetRows.push({
          id: assetId,
          submission_id: submissionId,
          layout_id: null,
          kind,
          storage_path: path,
          public_url: pub.publicUrl,
          caption,
          created_at: now,
        });
      }

      if (assetRows.length) {
        const { error: assetErr } = await supabase
          .from("network_layout_assets")
          .insert(assetRows);
        if (assetErr) throw new Error(migrationHint(assetErr.message));
      }

      const data = await loadWirelessBundle();
      return NextResponse.json({
        ok: true,
        submissionId,
        ...data,
      });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");

    if (action === "update_submission") {
      const submissionId = String(body.submissionId ?? "");
      const updates: SubmissionUpdate = { updated_at: new Date().toISOString() };
      if (body.status) updates.status = String(body.status);
      if ("leadId" in body) updates.lead_id = (body.leadId as string) || null;
      if ("notes" in body) updates.notes = String(body.notes ?? "");
      const { error } = await supabase
        .from("network_layout_submissions")
        .update(updates)
        .eq("id", submissionId);
      if (error) throw new Error(migrationHint(error.message));
    } else if (action === "create_layout") {
      const layoutId = id("nly");
      const now = new Date().toISOString();
      const submissionId = (body.submissionId as string) || null;
      const leadId = (body.leadId as string) || null;
      const title = String(body.title ?? "Network layout");
      const canvas = (body.canvas as NetworkCanvasDocument) ?? { ...EMPTY_CANVAS };

      const { error } = await supabase.from("network_layouts").insert({
        id: layoutId,
        lead_id: leadId,
        title,
        status: "draft",
        canvas_json: canvas as unknown as Json,
        submission_id: submissionId,
        created_by: user.id,
        published_at: null,
        created_at: now,
        updated_at: now,
      });
      if (error) throw new Error(migrationHint(error.message));

      if (submissionId) {
        await supabase
          .from("network_layout_submissions")
          .update({ status: "used", updated_at: now })
          .eq("id", submissionId);
        // Link submission assets to layout as references
        await supabase
          .from("network_layout_assets")
          .update({ layout_id: layoutId })
          .eq("submission_id", submissionId);
      }

      const data = await loadWirelessBundle();
      return NextResponse.json({ ok: true, layoutId, ...data });
    } else if (action === "save_layout") {
      const layoutId = String(body.layoutId ?? "");
      const now = new Date().toISOString();
      const updates: LayoutUpdate = { updated_at: now };
      if (body.title !== undefined) updates.title = String(body.title);
      if (body.canvas !== undefined) updates.canvas_json = body.canvas as unknown as Json;
      if ("leadId" in body) updates.lead_id = (body.leadId as string) || null;
      if (body.status === "published") {
        updates.status = "published";
        updates.published_at = now;
      } else if (body.status === "draft") {
        updates.status = "draft";
      }

      const { error } = await supabase
        .from("network_layouts")
        .update(updates)
        .eq("id", layoutId);
      if (error) throw new Error(migrationHint(error.message));

      // Upsert devices from body.devices
      if (Array.isArray(body.devices)) {
        for (const raw of body.devices as Record<string, unknown>[]) {
          const deviceId = String(raw.id || id("ndv"));
          const row = {
            id: deviceId,
            layout_id: layoutId,
            node_id: String(raw.nodeId ?? ""),
            vendor: String(raw.vendor ?? "ruijie"),
            external_id: (raw.externalId as string) || null,
            serial_number: (raw.serialNumber as string) || null,
            mac_address: (raw.macAddress as string) || null,
            label: String(raw.label ?? ""),
            status: String(raw.status ?? "unknown"),
            last_seen_at: (raw.lastSeenAt as string) || null,
            manual_override: Boolean(raw.manualOverride),
            created_at: (raw.createdAt as string) || now,
            updated_at: now,
          };
          const { error: dErr } = await supabase.from("network_devices").upsert(row);
          if (dErr) throw new Error(migrationHint(dErr.message));
        }
      }
    } else if (action === "override_device_status") {
      const deviceId = String(body.deviceId ?? "");
      const status = String(body.status ?? "unknown");
      const { error } = await supabase
        .from("network_devices")
        .update({
          status,
          manual_override: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", deviceId);
      if (error) throw new Error(migrationHint(error.message));
    } else if (action === "delete_layout") {
      const layoutId = String(body.layoutId ?? "");
      const { error } = await supabase.from("network_layouts").delete().eq("id", layoutId);
      if (error) throw new Error(migrationHint(error.message));
    } else {
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    const data = await loadWirelessBundle();
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Wireless action failed";
    return NextResponse.json({ error: migrationHint(message) }, { status: 500 });
  }
}
