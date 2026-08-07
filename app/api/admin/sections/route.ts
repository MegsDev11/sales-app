import { NextResponse } from "next/server";
import { requireAccess, requireAuthenticated } from "@/lib/supabase/server-auth";
import { adminClient, errorMessage, withHint } from "@/lib/api/route-helpers";
import { isModuleKey } from "@/lib/modules";
import { sectionByHref } from "@/lib/nav/sections";
import { moduleForDepartment } from "@/lib/modules";
import type { ModuleKey } from "@/lib/types";

/**
 * Administration → Sections.
 *
 * GET  -> the whole arrangement, for any signed-in user, because the sidebar is
 *         rendered on the client and needs it to draw itself
 * POST -> add or remove a section from a department (admin/manage)
 *
 * Lending a section also lends the grant that opens it. /stock/inventory is
 * guarded as Stock wherever it appears, so putting it in Financial's sidebar
 * without a Stock grant would produce a link that refuses everyone who clicks it.
 * So an `add` also gives that department's active staff Stock at `view` — a real
 * row in user_module_access, showing up in Staff & Access like any other grant
 * and revocable there. It is never an upgrade: anyone already at edit or manage
 * is left alone.
 */

const MIGRATION_HINT = "run supabase/migrations/063_module_sections.sql in Supabase.";

interface SectionRow {
  module_key: string;
  section_href: string;
  enabled: boolean;
  sort_order: number | null;
}

const RANK = { none: 0, view: 1, edit: 2, manage: 3 } as const;

export async function GET(request: Request) {
  // Readable by anyone signed in — it is a list of route strings, and knowing a
  // route exists is not access to it.
  const user = await requireAuthenticated(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const db = adminClient();
    const { data, error } = await db
      .from("module_sections")
      .select("module_key, section_href, enabled, sort_order");
    if (error) throw error;

    return NextResponse.json(
      {
        overrides: ((data ?? []) as SectionRow[]).map((r) => ({
          moduleKey: r.module_key,
          href: r.section_href,
          enabled: r.enabled,
          sortOrder: r.sort_order,
        })),
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (e) {
    const message = errorMessage(e);
    // The sidebar must still draw if the migration has not been applied yet, so
    // this degrades to "no overrides" rather than failing the whole layout.
    if (/relation .* does not exist|schema cache|could not find/i.test(message)) {
      return NextResponse.json({ overrides: [], pendingMigration: true });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Give a department's active staff the grant a borrowed section needs.
 * Returns the names that were changed, so the UI can say what it just did.
 */
async function grantImpliedModule(
  db: ReturnType<typeof adminClient>,
  departmentModule: ModuleKey,
  ownerModule: ModuleKey,
  actorId: string
): Promise<string[]> {
  if (ownerModule === departmentModule) return [];

  const { data: staff, error: staffError } = await db
    .from("team_members")
    .select("id, name, role, department, active");
  if (staffError) throw staffError;

  // Who counts as "in" this department: the org department maps onto the module,
  // which is only a rename for sales -> crm.
  const members = (staff ?? []).filter(
    (m) =>
      m.active !== false &&
      moduleForDepartment(m.department as string | null) === departmentModule
  );
  if (members.length === 0) return [];

  const ids = members.map((m) => String(m.id));
  const { data: existing, error: grantError } = await db
    .from("user_module_access")
    .select("user_id, level")
    .eq("module_key", ownerModule)
    .in("user_id", ids);
  if (grantError) throw grantError;

  const held = new Map(
    (existing ?? []).map((g) => [String(g.user_id), String(g.level)])
  );

  const needing = members.filter((m) => {
    // Owners already resolve to manage everywhere; granting them anything is noise.
    if (m.role === "owner") return false;
    const level = held.get(String(m.id));
    return !level || RANK[level as keyof typeof RANK] < RANK.view;
  });
  if (needing.length === 0) return [];

  const { error: upsertError } = await db.from("user_module_access").upsert(
    needing.map((m) => ({
      user_id: String(m.id),
      module_key: ownerModule,
      level: "view",
      granted_by: actorId,
    })),
    { onConflict: "user_id,module_key" }
  );
  if (upsertError) throw upsertError;

  return needing.map((m) => String(m.name));
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
    const body = (await request.json()) as {
      action?: string;
      moduleKey?: string;
      href?: string;
    };

    const moduleKey = body.moduleKey ?? "";
    if (!isModuleKey(moduleKey)) {
      return NextResponse.json({ error: "Unknown department" }, { status: 400 });
    }

    const db = adminClient();

    if (body.action === "reset") {
      const { error } = await db
        .from("module_sections")
        .delete()
        .eq("module_key", moduleKey);
      if (error) throw error;
      return NextResponse.json({ ok: true, granted: [] });
    }

    const href = body.href ?? "";
    const section = sectionByHref(href);
    if (!section) {
      return NextResponse.json({ error: "Unknown section" }, { status: 400 });
    }

    if (body.action === "add") {
      const { error } = await db.from("module_sections").upsert(
        {
          module_key: moduleKey,
          section_href: href,
          enabled: true,
          added_by: actor.id,
        },
        { onConflict: "module_key,section_href" }
      );
      if (error) throw error;

      const granted = await grantImpliedModule(
        db,
        moduleKey,
        section.ownerKey,
        actor.id
      );
      return NextResponse.json({ ok: true, granted });
    }

    if (body.action === "remove") {
      // Hiding is navigation only, so the grant that was handed out when the
      // section was lent is deliberately left in place — it may be the reason
      // somebody can still open a page they were sent a link to, and taking
      // access away is a decision for Staff & Access, not a side effect of
      // tidying a sidebar.
      const { error } = await db.from("module_sections").upsert(
        {
          module_key: moduleKey,
          section_href: href,
          enabled: false,
          added_by: actor.id,
        },
        { onConflict: "module_key,section_href" }
      );
      if (error) throw error;
      return NextResponse.json({ ok: true, granted: [] });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: withHint(errorMessage(e), MIGRATION_HINT) },
      { status: 500 }
    );
  }
}
