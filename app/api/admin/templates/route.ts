import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAccess } from "@/lib/supabase/server-auth";
import { isAccessLevel } from "@/lib/access";
import { isModuleKey } from "@/lib/modules";
import type { AccessLevel } from "@/lib/types";

/**
 * Administration → Role Templates.
 *
 * A template is a reusable bundle of module levels ("Field Technician",
 * "Finance Manager") that an admin applies to a user in one click on the Access
 * Control screen. This route manages the bundles themselves.
 *
 * GET  -> templates, their module levels, usage counts, and the module registry
 * POST -> create / update / delete a template, or replace its module levels
 *
 * Guarded by the admin module at `manage`, matching /api/admin/access.
 */

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

function newId(): string {
  return `tpl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

const MIGRATION_HINT =
  "run supabase/migrations/040_module_access.sql and 041_backfill_module_access.sql in Supabase.";

export async function GET(request: Request) {
  const actor = await requireAccess(request, "admin", "manage");
  if (!actor) {
    return NextResponse.json(
      { error: "Unauthorized — administration access required" },
      { status: 403 }
    );
  }

  try {
    const supabase = admin();
    const [templates, templateModules, members, modules] = await Promise.all([
      supabase.from("access_templates").select("*").order("name"),
      supabase.from("access_template_modules").select("template_id, module_key, level"),
      supabase.from("team_members").select("template_id"),
      supabase.from("modules").select("*").eq("active", true).order("sort_order"),
    ]);
    if (templates.error) throw new Error(`${templates.error.message} — ${MIGRATION_HINT}`);

    const usage = new Map<string, number>();
    for (const m of members.data ?? []) {
      const id = m.template_id as string | null;
      if (id) usage.set(id, (usage.get(id) ?? 0) + 1);
    }

    return NextResponse.json(
      {
        templates: (templates.data ?? []).map((t) => ({
          ...t,
          userCount: usage.get(t.id as string) ?? 0,
        })),
        templateModules: templateModules.data ?? [],
        modules: modules.data ?? [],
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

interface Body {
  action?: "create" | "update" | "delete" | "setModules";
  id?: string;
  name?: string;
  description?: string;
  modules?: { moduleKey: string; level: AccessLevel }[];
}

export async function POST(request: Request) {
  const actor = await requireAccess(request, "admin", "manage");
  if (!actor) {
    return NextResponse.json(
      { error: "Unauthorized — administration access required" },
      { status: 403 }
    );
  }

  try {
    const body = (await request.json()) as Body;
    const supabase = admin();

    switch (body.action) {
      case "create": {
        if (!body.name?.trim()) {
          return NextResponse.json({ error: "Give the template a name" }, { status: 400 });
        }
        const id = newId();
        const { error } = await supabase.from("access_templates").insert({
          id,
          name: body.name.trim(),
          description: body.description?.trim() ?? "",
        });
        if (error) throw new Error(`${error.message} — ${MIGRATION_HINT}`);
        return NextResponse.json({ ok: true, id });
      }

      case "update": {
        if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
        if (!body.name?.trim()) {
          return NextResponse.json({ error: "Give the template a name" }, { status: 400 });
        }
        const { error } = await supabase
          .from("access_templates")
          .update({ name: body.name.trim(), description: body.description?.trim() ?? "" })
          .eq("id", body.id);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      case "delete": {
        if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
        // team_members.template_id is ON DELETE SET NULL; template modules cascade.
        const { error } = await supabase.from("access_templates").delete().eq("id", body.id);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      case "setModules": {
        if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
        const incoming = (body.modules ?? []).filter(
          (m) => isModuleKey(m.moduleKey) && isAccessLevel(m.level) && m.level !== "none"
        );
        const { error: delErr } = await supabase
          .from("access_template_modules")
          .delete()
          .eq("template_id", body.id);
        if (delErr) throw delErr;
        if (incoming.length) {
          const { error: insErr } = await supabase.from("access_template_modules").insert(
            incoming.map((m) => ({
              template_id: body.id,
              module_key: m.moduleKey,
              level: m.level,
            }))
          );
          if (insErr) throw insErr;
        }
        return NextResponse.json({ ok: true, modules: incoming.length });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
