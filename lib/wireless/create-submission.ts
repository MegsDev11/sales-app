import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { makeId } from "@/lib/mobile/field-mappers";

const WIRELESS_BUCKET = "wireless-assets";

export type LayoutAssetKind = "sketch" | "photo" | "reference";

export function wirelessMigrationHint(message: string) {
  if (/does not exist|schema cache|network_layout/i.test(message)) {
    return `${message}. Run supabase/migrations/020_wireless_network_layouts.sql in Supabase.`;
  }
  return message;
}

export async function ensureWirelessBucket(
  supabase: ReturnType<typeof createSupabaseAdminClient>
) {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (buckets?.some((b) => b.id === WIRELESS_BUCKET || b.name === WIRELESS_BUCKET)) return;
  await supabase.storage.createBucket(WIRELESS_BUCKET, { public: true });
}

type UploadableFile = {
  blob: Blob;
  fileName: string;
  contentType: string;
  kind: LayoutAssetKind;
  caption?: string;
};

/**
 * Creates a network_layout_submissions row + uploads assets to wireless-assets.
 * Used by wireless managers and field techs (same inbox).
 */
export async function createNetworkLayoutSubmission(opts: {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  leadId: string | null;
  notes: string;
  createdBy: string;
  files: UploadableFile[];
}) {
  const { supabase, leadId, notes, createdBy, files } = opts;
  await ensureWirelessBucket(supabase);

  const submissionId = makeId("nls");
  const now = new Date().toISOString();

  const { error: subErr } = await supabase.from("network_layout_submissions").insert({
    id: submissionId,
    lead_id: leadId,
    notes,
    status: "new",
    created_by: createdBy,
    created_at: now,
    updated_at: now,
  });
  if (subErr) throw new Error(wirelessMigrationHint(subErr.message));

  const assetRows = [];
  for (const file of files) {
    const assetId = makeId("nla");
    const ext = file.fileName.split(".").pop()?.toLowerCase() || "jpg";
    const path = `submissions/${submissionId}/${assetId}.${ext}`;
    const buffer = Buffer.from(await file.blob.arrayBuffer());
    const { error: upErr } = await supabase.storage
      .from(WIRELESS_BUCKET)
      .upload(path, buffer, {
        contentType: file.contentType || "image/jpeg",
        upsert: false,
      });
    if (upErr) throw new Error(upErr.message);

    const { data: pub } = supabase.storage.from(WIRELESS_BUCKET).getPublicUrl(path);
    assetRows.push({
      id: assetId,
      submission_id: submissionId,
      layout_id: null,
      kind: file.kind,
      storage_path: path,
      public_url: pub.publicUrl,
      caption: file.caption ?? "",
      created_at: now,
    });
  }

  if (assetRows.length) {
    const { error: assetErr } = await supabase
      .from("network_layout_assets")
      .insert(assetRows);
    if (assetErr) throw new Error(wirelessMigrationHint(assetErr.message));
  }

  return { submissionId };
}

/** Parse multipart files/kinds/captions from FormData (manager + tech upload). */
export function parseSubmissionFilesFromForm(form: FormData): UploadableFile[] {
  const raw = form.getAll("files").filter((f) => {
    if (typeof File !== "undefined" && f instanceof File) return f.size > 0;
    if (typeof Blob !== "undefined" && f instanceof Blob) return f.size > 0;
    return false;
  }) as Array<File | Blob>;
  const kinds = form.getAll("kinds").map((k) => String(k));
  const captions = form.getAll("captions").map((c) => String(c));

  return raw.map((file, i) => {
    const rawKind = kinds[i] || "photo";
    const kind: LayoutAssetKind =
      rawKind === "sketch" || rawKind === "reference" ? rawKind : "photo";
    const fileName =
      file instanceof File && file.name
        ? file.name
        : `upload-${i}.jpg`;
    return {
      blob: file,
      fileName,
      contentType: file.type || "image/jpeg",
      kind,
      caption: captions[i] || "",
    };
  });
}
