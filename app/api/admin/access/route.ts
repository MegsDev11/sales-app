import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAccess } from "@/lib/supabase/server-auth";
import { isAccessLevel } from "@/lib/access";
import { isModuleKey } from "@/lib/modules";
import type { AccessLevel } from "@/lib/types";

/**
 * The API behind Administration → Access Control.
 *
 * GET  -> every user with their grants, plus the module and template registries
 * POST -> set grants for one user (the checkbox matrix save), or apply a template
 *
 * Guarded by the admin module at `manage`. The owner passes automatically; a
 * delegated administrator passes via an explicit admin grant, which is what makes a
 * second administrator possible at all.
 */

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "Request failed";
}

export async function GET(request: Request) {
  const admin = await requireAccess(request, "admin", "manage");
  if (!admin) {
    return NextResponse.json(
      { error: "Unauthorized — administration access required" },
      { status: 403 }
    );
  }

  try {
    const supabase = createSupabaseAdminClient() as unknown as SupabaseClient;

    const [members, grants, modules, templates, templateModules, departments] =
      await Promise.all([
        supabase
          .from("team_members")
          .select("id, name, email, role, department, title, active, template_id")
          .order("name"),
        supabase.from("user_module_access").select("user_id, module_key, level, expires_at"),
        supabase.from("modules").select("*").eq("active", true).order("sort_order"),
        supabase.from("access_templates").select("*").order("name"),
        supabase.from("access_template_modules").select("template_id, module_key, level"),
        supabase.from("departments").select("*").eq("active", true).order("sort_order"),
      ]);

    if (members.error) throw members.error;
    if (grants.error) {
      // The most likely cause by far is that migration 040 has not been run.
      throw new Error(
        `${grants.error.message} — run supabase/migrations/040_module_access.sql and 041_backfill_module_access.sql in Supabase.`
      );
    }

    return NextResponse.json(
      {
        users: members.data ?? [],
        grants: grants.data ?? [],
        modules: modules.data ?? [],
        templates: templates.data ?? [],
        templateModules: templateModules.data ?? [],
        departments: departments.data ?? [],
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

interface SetAccessBody {
  action?: "setAccess" | "applyTemplate" | "setActive";
  userId: string;
  modules?: { moduleKey: string; level: AccessLevel; expiresAt?: string | null }[];
  templateId?: string | null;
  active?: boolean;
}

export async function POST(request: Request) {
  const admin = await requireAccess(request, "admin", "manage");
  if (!admin) {
    return NextResponse.json(
      { error: "Unauthorized — administration access required" },
      { status: 403 }
    );
  }

  try {
    const body = (await request.json()) as SetAccessBody;
    if (!body.userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient() as unknown as SupabaseClient;

    const { data: target, error: targetError } = await supabase
      .from("team_members")
      .select("id, role, name")
      .eq("id", body.userId)
      .maybeSingle();
    if (targetError) throw targetError;
    if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // The owner's access is implicit and absolute; editing grant rows for them would
    // imply they can be locked out, which they cannot. Refuse rather than mislead.
    if (target.role === "owner") {
      return NextResponse.json(
        { error: "The owner already has full access to every module; grants do not apply." },
        { status: 400 }
      );
    }

    const action = body.action ?? "setAccess";

    if (action === "setActive") {
      const { error } = await supabase
        .from("team_members")
        .update({ active: body.active !== false })
        .eq("id", body.userId);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === "applyTemplate") {
      const { error } = await supabase
        .from("team_members")
        .update({ template_id: body.templateId ?? null })
        .eq("id", body.userId);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    // setAccess: replace this user's direct grants with exactly what was submitted.
    const incoming = body.modules ?? [];

    for (const entry of incoming) {
      if (!isModuleKey(entry.moduleKey)) {
        return NextResponse.json(
          { error: `Unknown module: ${entry.moduleKey}` },
          { status: 400 }
        );
      }
      if (!isAccessLevel(entry.level)) {
        return NextResponse.json(
          { error: `Invalid access level: ${entry.level}` },
          { status: 400 }
        );
      }
    }

    // Guard against an admin removing their own admin rights and locking the
    // company out. The owner is always a way back in, but only if one exists.
    if (body.userId === admin.id) {
      const keepsAdmin = incoming.some(
        (m) => m.moduleKey === "admin" && m.level === "manage"
      );
      if (!keepsAdmin) {
        const { count } = await supabase
          .from("team_members")
          .select("id", { count: "exact", head: true })
          .eq("role", "owner")
          .eq("active", true);
        if (!count) {
          return NextResponse.json(
            {
              error:
                "You would remove your own administration access and there is no active owner account to restore it. Grant another user administration first.",
            },
            { status: 400 }
          );
        }
      }
    }

    const { error: deleteError } = await supabase
      .from("user_module_access")
      .delete()
      .eq("user_id", body.userId);
    if (deleteError) throw deleteError;

    const rows = incoming
      .filter((m) => m.level !== "none")
      .map((m) => ({
        user_id: body.userId,
        module_key: m.moduleKey,
        level: m.level,
        expires_at: m.expiresAt ?? null,
        granted_by: admin.id,
      }));

    if (rows.length > 0) {
      const { error: insertError } = await supabase
        .from("user_module_access")
        .insert(rows);
      if (insertError) throw insertError;
    }

    return NextResponse.json({ ok: true, granted: rows.length });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
