import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAccess } from "@/lib/supabase/server-auth";
import {
  canEditProject,
  canSeeProject,
  type ProjectAuthRow,
} from "@/lib/projects/visibility";
import { DOCUMENT_KINDS } from "@/lib/projects/constants";
import { adminClient, errorMessage, newId } from "@/lib/api/route-helpers";

/**
 * Project documents — uploaded files, links, and quotes.
 *
 * GET  ?projectId=<id>  -> every document, uploads carrying a short-lived signed URL
 * POST multipart        -> add a document, with a file or a link
 * POST json {action}    -> update metadata / delete
 *
 * Files go to a PRIVATE bucket, same as technician documents: a project's BOQ names
 * the client's site and quantities, and its quote names the price. Neither should be
 * world-readable because somebody guessed a URL. Access is re-checked per request and
 * the signed URL expires, so a link pasted into a chat stops working rather than
 * becoming a permanent back door.
 *
 * Separate from /api/projects/delivery because that route is JSON-only and this one
 * has to handle multipart bodies and storage cleanup — folding them together would
 * put a file parser in the path of every grid click.
 */

const BUCKET = "project-docs";
const MIGRATION_HINT = "run supabase/migrations/060_project_document_uploads.sql in Supabase.";
const SIGNED_URL_TTL = 60 * 60; // 1 hour

/**
 * 25 MB.
 *
 * A BOQ spreadsheet or a signed quote PDF is comfortably under this; a raw site
 * photo dump is not, and belongs in the photo folder link rather than here.
 */
const MAX_BYTES = 25 * 1024 * 1024;

const VALID_KINDS = new Set<string>(DOCUMENT_KINDS.map((k) => k.value));

async function ensureBucket(supabase: SupabaseClient) {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (buckets?.some((b) => b.id === BUCKET || b.name === BUCKET)) return;
  await supabase.storage.createBucket(BUCKET, { public: false });
}

/** Load the project plus the member sets an authorisation decision needs. */
async function loadAuth(supabase: SupabaseClient, projectId: string) {
  const { data: project } = await supabase
    .from("projects")
    .select("id, owner_id, is_private")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return null;

  const { data: members } = await supabase
    .from("project_members")
    .select("user_id, role")
    .eq("project_id", projectId);

  return {
    project: project as unknown as ProjectAuthRow,
    memberIds: new Set((members ?? []).map((m) => m.user_id as string)),
    leadIds: new Set(
      (members ?? []).filter((m) => m.role === "lead").map((m) => m.user_id as string)
    ),
  };
}

/**
 * A storage-safe file name that still reads like the file somebody uploaded.
 *
 * The original is kept in file_name for display; this only shapes the path. Slashes
 * and traversal sequences would let a crafted name write outside the project's own
 * folder, so the whole thing is reduced to a conservative character set.
 */
function safeExtension(fileName: string): string {
  const ext = fileName.includes(".") ? fileName.split(".").pop() ?? "" : "";
  const clean = ext.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
  return clean || "bin";
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const user = await requireAccess(request, "projects", "view");
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized — projects access required" },
      { status: 403 }
    );
  }

  try {
    const supabase = adminClient();
    const projectId = new URL(request.url).searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    const auth = await loadAuth(supabase, projectId);
    if (!auth) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    if (!canSeeProject(user, auth.project, auth.memberIds)) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("project_documents")
      .select("*")
      .eq("project_id", projectId)
      .order("order_index");
    if (error) throw new Error(`${error.message} — ${MIGRATION_HINT}`);

    // Signed per request, and short-lived. An upload has no usable URL until someone
    // with access asks for one.
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
      { documents, canEdit: canEditProject(user, auth.project, auth.leadIds) },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const user = await requireAccess(request, "projects", "view");
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized — projects access required" },
      { status: 403 }
    );
  }

  try {
    const supabase = adminClient();
    const contentType = request.headers.get("content-type") ?? "";

    // ---- multipart: add a document, as a file or a link --------------------
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const projectId = String(form.get("projectId") ?? "");
      const label = String(form.get("label") ?? "").trim();
      const kind = String(form.get("kind") ?? "other");
      const linkUrl = String(form.get("url") ?? "").trim();

      if (!projectId) {
        return NextResponse.json({ error: "projectId is required" }, { status: 400 });
      }
      if (!label) {
        return NextResponse.json({ error: "Give the document a name" }, { status: 400 });
      }
      if (!VALID_KINDS.has(kind)) {
        return NextResponse.json({ error: `Unknown document kind: ${kind}` }, { status: 400 });
      }

      const auth = await loadAuth(supabase, projectId);
      if (!auth) return NextResponse.json({ error: "Project not found" }, { status: 404 });
      if (!canSeeProject(user, auth.project, auth.memberIds)) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
      }
      if (!canEditProject(user, auth.project, auth.leadIds)) {
        return NextResponse.json(
          { error: "Only the project owner, a project lead, or a projects manager can do that" },
          { status: 403 }
        );
      }

      const id = newId("doc");
      let storagePath: string | null = null;
      let fileName = "";
      let fileSize: number | null = null;
      let fileType: string | null = null;

      const file = form.get("file");
      const isFile =
        (typeof File !== "undefined" && file instanceof File && file.size > 0) ||
        (typeof Blob !== "undefined" && file instanceof Blob && (file as Blob).size > 0);

      if (isFile) {
        const blob = file as File;
        if (blob.size > MAX_BYTES) {
          return NextResponse.json(
            { error: `That file is over ${Math.round(MAX_BYTES / 1024 / 1024)} MB. Link to it instead.` },
            { status: 413 }
          );
        }
        fileName = blob instanceof File && blob.name ? blob.name : `document-${id}`;
        fileSize = blob.size;
        fileType = blob.type || "application/octet-stream";

        const path = `projects/${projectId}/${id}.${safeExtension(fileName)}`;
        await ensureBucket(supabase);
        const buffer = Buffer.from(await blob.arrayBuffer());
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, buffer, {
          contentType: fileType,
          upsert: false,
        });
        if (upErr) throw new Error(upErr.message);
        storagePath = path;
      }

      // A link instead of a file. Only http(s): a javascript: or data: URL here
      // would be rendered as a link for every member of the project.
      let url: string | null = null;
      if (!storagePath) {
        if (!linkUrl) {
          return NextResponse.json(
            { error: "Attach a file, or give a link to one" },
            { status: 400 }
          );
        }
        let parsed: URL;
        try {
          parsed = new URL(linkUrl);
        } catch {
          return NextResponse.json({ error: "That is not a valid link" }, { status: 400 });
        }
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          return NextResponse.json(
            { error: "Links must start with http or https" },
            { status: 400 }
          );
        }
        url = parsed.toString();
      }

      const rawAmount = String(form.get("amount") ?? "").trim();
      const amount = rawAmount ? Number(rawAmount.replace(/[Rr\s,]/g, "")) : null;

      const { data: last } = await supabase
        .from("project_documents")
        .select("order_index")
        .eq("project_id", projectId)
        .order("order_index", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { error } = await supabase.from("project_documents").insert({
        id,
        project_id: projectId,
        label,
        kind,
        url,
        storage_path: storagePath,
        file_name: fileName,
        file_size: fileSize,
        content_type: fileType,
        reference: String(form.get("reference") ?? "").trim(),
        amount: amount !== null && Number.isFinite(amount) ? amount : null,
        order_index: ((last?.order_index as number) ?? -1) + 1,
        added_by: user.id,
      });
      if (error) {
        // Do not leave an orphaned file in the bucket behind a failed row.
        if (storagePath) await supabase.storage.from(BUCKET).remove([storagePath]);
        throw new Error(`${error.message} — ${MIGRATION_HINT}`);
      }

      return NextResponse.json({ ok: true, id });
    }

    // ---- JSON: update metadata / delete -------------------------------------
    const body = (await request.json()) as {
      action?: string;
      projectId?: string;
      id?: string;
      label?: string;
      kind?: string;
      reference?: string;
      amount?: number | null;
    };

    if (!body.projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    const auth = await loadAuth(supabase, body.projectId);
    if (!auth) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    if (!canSeeProject(user, auth.project, auth.memberIds)) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if (!canEditProject(user, auth.project, auth.leadIds)) {
      return NextResponse.json(
        { error: "Only the project owner, a project lead, or a projects manager can do that" },
        { status: 403 }
      );
    }

    if (body.action === "delete") {
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const { data: doc } = await supabase
        .from("project_documents")
        .select("storage_path")
        .eq("id", body.id)
        .eq("project_id", body.projectId)
        .maybeSingle();
      if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

      const { error } = await supabase
        .from("project_documents")
        .delete()
        .eq("id", body.id)
        .eq("project_id", body.projectId);
      if (error) throw error;

      // Row first, file second: an orphaned file is invisible clutter, whereas a row
      // pointing at a file that is already gone is a broken link somebody will click.
      if (doc.storage_path) {
        await supabase.storage.from(BUCKET).remove([doc.storage_path as string]);
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === "update") {
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const patch: Record<string, unknown> = {};
      if (body.label !== undefined) patch.label = body.label.trim();
      if (body.kind !== undefined) {
        if (!VALID_KINDS.has(body.kind)) {
          return NextResponse.json({ error: `Unknown document kind: ${body.kind}` }, { status: 400 });
        }
        patch.kind = body.kind;
      }
      if (body.reference !== undefined) patch.reference = body.reference.trim();
      if (body.amount !== undefined) patch.amount = body.amount;
      if (Object.keys(patch).length === 0) {
        return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
      }
      const { error } = await supabase
        .from("project_documents")
        .update(patch)
        .eq("id", body.id)
        .eq("project_id", body.projectId);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
