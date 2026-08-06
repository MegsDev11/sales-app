import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { CreateUserPayload, Department, UserRole } from "@/lib/types";
import { requireOwner } from "@/lib/supabase/server-auth";
import { getDefaultTitle } from "@/lib/permissions";
import { moduleForDepartment } from "@/lib/modules";
import { errorMessage } from "@/lib/api/route-helpers";

/**
 * Staff credentials endpoint.
 *
 * REMOVED: this used to decrypt and return every staff member's login password in
 * one response. Passwords were stored with reversible encryption
 * (login_password_ciphertext), so a single leaked encryption key or one compromised
 * owner account exposed every staff password — and people reuse passwords.
 *
 * Passwords are now write-only: an admin can SET a new one (POST action
 * "setPassword"), which returns it once so it can be handed over, and it is never
 * stored in a recoverable form. Migration 044 drops the column.
 *
 * This endpoint is kept so the Staff page keeps working; it simply reports that
 * retrieval is no longer possible.
 */
export async function GET(request: Request) {
  const adminUser = await requireOwner(request);
  if (!adminUser) {
    return NextResponse.json({ error: "Unauthorized — admin access required" }, { status: 403 });
  }

  return NextResponse.json(
    {
      credentials: [],
      retrievalDisabled: true,
      message:
        "Stored passwords are no longer retrievable. Use 'Set password' to issue a new one — it is shown once and never saved.",
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

export async function POST(request: Request) {
  const ownerUser = await requireOwner(request);
  if (!ownerUser) {
    return NextResponse.json({ error: "Unauthorized — owner access required" }, { status: 403 });
  }

  try {
    const body = (await request.json()) as
      | CreateUserPayload
      | {
          action: "setPassword";
          userId: string;
          password: string;
        };

    if ("action" in body && body.action === "setPassword") {
      if (!body.userId || !body.password || body.password.length < 8) {
        return NextResponse.json(
          { error: "userId and password (min 8 characters) are required" },
          { status: 400 }
        );
      }

      const supabase = createSupabaseAdminClient() as unknown as SupabaseClient;
      const { data: member, error: findError } = await supabase
        .from("team_members")
        .select("id, auth_user_id, role")
        .eq("id", body.userId)
        .maybeSingle();
      if (findError) throw findError;
      if (!member) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      if (member.role === "owner") {
        return NextResponse.json({ error: "Cannot change owner password here" }, { status: 400 });
      }
      if (!member.auth_user_id) {
        return NextResponse.json({ error: "This account has no login" }, { status: 400 });
      }

      const { error: authError } = await supabase.auth.admin.updateUserById(member.auth_user_id, {
        password: body.password,
      });
      if (authError) throw authError;

      // Deliberately NOT stored. Supabase Auth holds the hash; we return the
      // plaintext once here so the admin can hand it over, then forget it.
      return NextResponse.json({ ok: true, loginPassword: body.password });
    }

    const createBody = body as CreateUserPayload;

    if (!createBody.email?.trim() || !createBody.password || createBody.password.length < 8) {
      return NextResponse.json(
        { error: "Email and password (min 8 characters) are required" },
        { status: 400 }
      );
    }

    if (!createBody.name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    if (createBody.role === "owner") {
      return NextResponse.json({ error: "Cannot create owner accounts via API" }, { status: 400 });
    }

    // This route is already owner-only (requireOwner above), which is exactly
    // who should be appointing a general or financial manager (migration 070).
    const CREATABLE: UserRole[] = ["general_manager", "financial_manager", "manager", "staff"];
    if (!CREATABLE.includes(createBody.role as UserRole)) {
      return NextResponse.json(
        { error: "Role must be general manager, financial manager, manager or staff" },
        { status: 400 }
      );
    }

    // A company-wide position does not sit in one department.
    if (
      !createBody.department &&
      createBody.role !== "general_manager" &&
      createBody.role !== "financial_manager"
    ) {
      return NextResponse.json({ error: "Department is required" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient() as unknown as SupabaseClient;
    const email = createBody.email.trim().toLowerCase();
    const department = createBody.department as Department;
    const role = createBody.role as UserRole;

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: createBody.password,
      email_confirm: true,
    });

    if (authError) throw authError;
    if (!authData.user) throw new Error("Failed to create auth user");

    const memberId = authData.user.id;
    const baseRow = {
      id: memberId,
      name: createBody.name.trim(),
      email,
      auth_user_id: authData.user.id,
      role,
      department,
      color: createBody.color,
      avatar_initials: createBody.avatarInitials.trim() || createBody.name.slice(0, 2).toUpperCase(),
      title: createBody.title.trim() || getDefaultTitle(role, department),
      monthly_revenue_target: createBody.monthlyRevenueTarget,
      monthly_deals_target: createBody.monthlyDealsTarget,
      active: true,
    };

    const templateId = (createBody as { templateId?: string | null }).templateId ?? null;

    const { error: insertError } = await supabase
      .from("team_members")
      .insert({ ...baseRow, template_id: templateId });
    if (insertError) {
      await supabase.auth.admin.deleteUser(authData.user.id);
      const detail = insertError.message || "";
      if (/department|check constraint|foreign key/i.test(detail)) {
        throw new Error(
          `${detail} — run supabase/migrations/040_module_access.sql in Supabase SQL Editor, then try again.`
        );
      }
      throw insertError;
    }

    // Seed module grants. Without this a new account would land with no access at
    // all, because access no longer follows from the department column.
    //
    // Explicit grants win; otherwise a template; otherwise a sensible default
    // derived from the department they were created in.
    const explicitModules = (createBody as {
      modules?: { moduleKey: string; level: string }[];
    }).modules;

    const grantRows =
      explicitModules && explicitModules.length > 0
        ? explicitModules
            .filter((m) => m.level !== "none")
            .map((m) => ({
              user_id: memberId,
              module_key: m.moduleKey,
              level: m.level,
              granted_by: ownerUser.id,
            }))
        : templateId
          ? []
          : [
              {
                user_id: memberId,
                module_key: moduleForDepartment(department) ?? "staff",
                level: role === "manager" ? "manage" : "edit",
                granted_by: ownerUser.id,
              },
              {
                user_id: memberId,
                module_key: "staff",
                level: "view",
                granted_by: ownerUser.id,
              },
            ];

    if (grantRows.length > 0) {
      const { error: grantError } = await supabase
        .from("user_module_access")
        .upsert(grantRows, { onConflict: "user_id,module_key" });
      // Don't fail account creation over this — surface it so the admin can fix
      // access in the console rather than being left with a half-created user.
      if (grantError) {
        return NextResponse.json({
          ok: true,
          id: memberId,
          email,
          loginPassword: createBody.password,
          warning: `Account created, but module access could not be set (${grantError.message}). Grant it in Administration → Access Control.`,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      id: memberId,
      email,
      loginPassword: createBody.password,
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
