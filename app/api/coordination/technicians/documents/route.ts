import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAccess } from "@/lib/supabase/server-auth";

/**
 * Technician documents API — qualifications, certificates, licences, ID copies.
 *
 * GET                    -> lightweight metadata for every doc (for roster counts)
 * GET ?technicianId=<id> -> that technician's docs, each with a short-lived signed URL
 * POST multipart         -> add a doc (optional file upload)
 * POST json {action}     -> update metadata / delete
 *
 * The generated Database types don't know this table yet (migration 048), so we use
 * an untyped admin client here, same as the procurement route. Files go to a PRIVATE
 * bucket — these are personal documents, never world-readable.
 */

const BUCKET = "technician-docs";
const MIGRATION_HINT = "run supabase/migrations/048_technician_documents.sql in Supabase.";
const SIGNED_URL_TTL = 60 * 60; // 1 hour

function admin(): SupabaseClient {
  return createSupabaseAdminClient() as unknown as SupabaseClient;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const m = (error as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return "Request failed";
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

async function ensureBucket(supabase: SupabaseClient) {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (buckets?.some((b) => b.id === BUCKET || b.name === BUCKET)) return;
  await supabase.storage.createBucket(BUCKET, { public: false });
}

export async function GET(request: Request) {
  const user = await requireAccess(request, "coordination", "view");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  try {
    const supabase = admin();
    const url = new URL(request.url);
    const technicianId = url.searchParams.get("technicianId");

    if (technicianId) {
      const { data, error } = await supabase
        .from("technician_documents")
        .select("*")
        .eq("technician_id", technicianId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(`${error.message} — ${MIGRATION_HINT}`);

      const documents = [];
      for (const doc of data ?? []) {
        let fileUrl: string | null = null;
        if (doc.storage_path) {
          const { data: signed } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(doc.storage_path as string, SIGNED_URL_TTL);
          fileUrl = signed?.signedUrl ?? null;
        }
        documents.push({ ...doc, fileUrl });
      }
      return NextResponse.json(
        { documents },
        { headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }

    // Lightweight list for counts / expiry badges across the roster.
    const { data, error } = await supabase
      .from("technician_documents")
      .select("id, technician_id, category, title, expires_on");
    if (error) throw new Error(`${error.message} — ${MIGRATION_HINT}`);
    return NextResponse.json(
      { documents: data ?? [] },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await requireAccess(request, "coordination", "edit");
  if (!user) {
    return NextResponse.json(
      { error: "Coordination edit access required" },
      { status: 403 }
    );
  }

  try {
    const supabase = admin();
    const contentType = request.headers.get("content-type") ?? "";

    // ---- multipart: add a document (optionally with a file) -----------------
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const technicianId = String(form.get("technicianId") ?? "");
      const title = String(form.get("title") ?? "").trim();
      if (!technicianId) {
        return NextResponse.json({ error: "technicianId required" }, { status: 400 });
      }
      if (!title) {
        return NextResponse.json({ error: "Give the document a title" }, { status: 400 });
      }

      const id = newId("doc");
      let storagePath: string | null = null;
      let fileName = "";

      const file = form.get("file");
      const isFile =
        (typeof File !== "undefined" && file instanceof File && file.size > 0) ||
        (typeof Blob !== "undefined" && file instanceof Blob && (file as Blob).size > 0);
      if (isFile) {
        const blob = file as File;
        fileName = blob instanceof File && blob.name ? blob.name : `document-${id}`;
        const ext = fileName.includes(".") ? fileName.split(".").pop() : "bin";
        const path = `technicians/${technicianId}/${id}.${ext}`;
        await ensureBucket(supabase);
        const buffer = Buffer.from(await blob.arrayBuffer());
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, buffer, {
          contentType: blob.type || "application/octet-stream",
          upsert: false,
        });
        if (upErr) throw new Error(upErr.message);
        storagePath = path;
      }

      const { error } = await supabase.from("technician_documents").insert({
        id,
        technician_id: technicianId,
        category: String(form.get("category") ?? "other") || "other",
        title,
        reference: String(form.get("reference") ?? ""),
        issued_on: (String(form.get("issuedOn") ?? "") || null) as string | null,
        expires_on: (String(form.get("expiresOn") ?? "") || null) as string | null,
        notes: String(form.get("notes") ?? ""),
        file_name: fileName,
        storage_path: storagePath,
        created_by: user.id,
      });
      if (error) {
        if (storagePath) await supabase.storage.from(BUCKET).remove([storagePath]);
        throw new Error(`${error.message} — ${MIGRATION_HINT}`);
      }
      return NextResponse.json({ ok: true, id });
    }

    // ---- JSON: update metadata / delete -------------------------------------
    const body = (await request.json()) as {
      action?: string;
      id?: string;
      category?: string;
      title?: string;
      reference?: string;
      issuedOn?: string | null;
      expiresOn?: string | null;
      notes?: string;
    };

    if (body.action === "delete") {
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const { data: doc } = await supabase
        .from("technician_documents")
        .select("storage_path")
        .eq("id", body.id)
        .maybeSingle();
      const { error } = await supabase.from("technician_documents").delete().eq("id", body.id);
      if (error) throw error;
      if (doc?.storage_path) {
        await supabase.storage.from(BUCKET).remove([doc.storage_path as string]);
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === "update") {
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.category !== undefined) patch.category = body.category || "other";
      if (body.title !== undefined) patch.title = body.title.trim();
      if (body.reference !== undefined) patch.reference = body.reference;
      if (body.issuedOn !== undefined) patch.issued_on = body.issuedOn || null;
      if (body.expiresOn !== undefined) patch.expires_on = body.expiresOn || null;
      if (body.notes !== undefined) patch.notes = body.notes;
      const { error } = await supabase
        .from("technician_documents")
        .update(patch)
        .eq("id", body.id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
