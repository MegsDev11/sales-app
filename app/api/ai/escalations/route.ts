import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAccess } from "@/lib/supabase/server-auth";
import type { ModuleKey } from "@/lib/types";
import {
  SCOPE_CATEGORIES,
  type ChatbotCategory,
} from "@/lib/ai/settings";
import {
  adminDb,
  errorMessage,
  isMissingTableError,
  loadTranscript,
} from "@/lib/ai/session";

/**
 * The chatbot's escalations, sliced by desk.
 *
 * GET  ?scope=support|financial|sales|all&status=&id=
 * POST { id, status?, assignToMe? }
 *
 * The scope is not a filter the caller chooses freely — it decides which module is
 * checked, and the categories it may read are fixed in SCOPE_CATEGORIES. A financial
 * clerk asking for scope=support gets a 403 rather than a connectivity transcript.
 * The RLS policies in 057 enforce the same rule independently, so this guard failing
 * open would still not leak anything.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIGRATION_HINT =
  "run supabase/migrations/056_support_chat.sql and 057_ai_agents.sql in Supabase.";

/** Which module a scope is guarded by, and at what level for writes. */
const SCOPE_MODULE: Record<string, ModuleKey> = {
  support: "support",
  financial: "financial",
  sales: "crm",
  all: "ai",
};

function db(): SupabaseClient {
  return adminDb();
}

function hint(message: string): string {
  return isMissingTableError(message) ? `${message} — ${MIGRATION_HINT}` : message;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const scope = (url.searchParams.get("scope") ?? "all").trim();
  const moduleKey = SCOPE_MODULE[scope];
  if (!moduleKey) {
    return NextResponse.json({ error: `Unknown scope: ${scope}` }, { status: 400 });
  }

  const user = await requireAccess(request, moduleKey, moduleKey === "ai" ? "manage" : "view");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const categories = SCOPE_CATEGORIES[scope] as ChatbotCategory[];
  const status = (url.searchParams.get("status") ?? "").trim();
  const wantTranscript = url.searchParams.get("id")?.trim() ?? "";

  try {
    const supabase = db();

    // A single escalation, with its conversation. This is the handover view.
    if (wantTranscript) {
      const { data, error } = await supabase
        .from("support_chat_escalations")
        .select("*")
        .eq("id", wantTranscript)
        .maybeSingle();
      if (error) throw error;

      const row = data as Record<string, unknown> | null;
      if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (!categories.includes(String(row.category) as ChatbotCategory)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }

      const transcript = await loadTranscript(supabase, String(row.session_id));
      return NextResponse.json(
        { escalation: mapRow(row), transcript },
        { headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }

    let query = supabase
      .from("support_chat_escalations")
      .select("*")
      .in("category", categories)
      .order("created_at", { ascending: false })
      .limit(200);
    if (status && status !== "all") query = query.eq("status", status);

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data ?? []) as Array<Record<string, unknown>>;

    // Names for the assignee column, resolved in one query rather than per row.
    const assigneeIds = [
      ...new Set(rows.map((r) => r.assigned_to).filter((v): v is string => typeof v === "string")),
    ];
    const names = new Map<string, string>();
    if (assigneeIds.length) {
      const { data: members } = await supabase
        .from("team_members")
        .select("id, name")
        .in("id", assigneeIds);
      for (const m of (members ?? []) as Array<{ id: string; name: string }>) {
        names.set(m.id, m.name);
      }
    }

    return NextResponse.json(
      {
        escalations: rows.map((r) => ({
          ...mapRow(r),
          assignedToName: r.assigned_to ? names.get(String(r.assigned_to)) ?? "" : "",
        })),
        counts: {
          new: rows.filter((r) => r.status === "new").length,
          acknowledged: rows.filter((r) => r.status === "acknowledged").length,
          resolved: rows.filter((r) => r.status === "resolved").length,
        },
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (e) {
    return NextResponse.json({ error: hint(errorMessage(e)) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: { id?: unknown; scope?: unknown; status?: unknown; assignToMe?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const scope = typeof body.scope === "string" ? body.scope : "all";
  const moduleKey = SCOPE_MODULE[scope];
  if (!moduleKey) {
    return NextResponse.json({ error: `Unknown scope: ${scope}` }, { status: 400 });
  }

  // Writing needs `edit` on the desk's own module, or `manage` on AI.
  const user = await requireAccess(request, moduleKey, moduleKey === "ai" ? "manage" : "edit");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const status = typeof body.status === "string" ? body.status.trim() : "";
  const allowed = ["new", "acknowledged", "resolved"];
  if (status && !allowed.includes(status)) {
    return NextResponse.json({ error: `Invalid status: ${status}` }, { status: 400 });
  }

  try {
    const supabase = db();

    // Re-read the row to confirm its category is one this scope may touch. Without
    // this, an id from another desk would be updatable by passing your own scope.
    const { data, error: findError } = await supabase
      .from("support_chat_escalations")
      .select("id, category")
      .eq("id", id)
      .maybeSingle();
    if (findError) throw findError;

    const row = data as { id: string; category: string } | null;
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const categories = SCOPE_CATEGORIES[scope] as ChatbotCategory[];
    if (!categories.includes(row.category as ChatbotCategory)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const patch: Record<string, unknown> = {};
    if (status) {
      patch.status = status;
      patch.resolved_at = status === "resolved" ? new Date().toISOString() : null;
    }
    if (body.assignToMe === true) patch.assigned_to = user.id;
    if (body.assignToMe === false) patch.assigned_to = null;

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const { error } = await supabase
      .from("support_chat_escalations")
      .update(patch)
      .eq("id", id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: hint(errorMessage(e)) }, { status: 500 });
  }
}

function mapRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    reference: String(row.reference ?? ""),
    sessionId: String(row.session_id ?? ""),
    category: String(row.category ?? "general"),
    urgency: String(row.urgency ?? "normal"),
    summary: String(row.summary ?? ""),
    contactName: String(row.contact_name ?? ""),
    contactPhone: String(row.contact_phone ?? ""),
    contactEmail: String(row.contact_email ?? ""),
    accountsClientId: row.accounts_client_id ? String(row.accounts_client_id) : null,
    afterHours: row.after_hours === true,
    status: String(row.status ?? "new"),
    notifiedAt: row.notified_at ? String(row.notified_at) : null,
    notifyError: String(row.notify_error ?? ""),
    assignedTo: row.assigned_to ? String(row.assigned_to) : null,
    createdAt: String(row.created_at ?? ""),
  };
}
