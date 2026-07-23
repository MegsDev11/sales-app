import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { decryptPortalCode, encryptPortalCode } from "@/lib/portal-auth";
import type { CreateUserPayload, Department, UserRole } from "@/lib/types";
import { requireOwner } from "@/lib/supabase/server-auth";
import { getDefaultTitle } from "@/lib/permissions";

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "Failed to create user";
}

/** Owner-only: return decrypted staff login passwords. */
export async function GET(request: Request) {
  const ownerUser = await requireOwner(request);
  if (!ownerUser) {
    return NextResponse.json({ error: "Unauthorized — owner access required" }, { status: 403 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("team_members")
      .select("id, login_password_ciphertext")
      .neq("role", "owner");
    if (error) {
      if (/login_password_ciphertext/i.test(error.message)) {
        return NextResponse.json(
          {
            credentials: [],
            error:
              "Run supabase/migrations/019_staff_login_password.sql in Supabase to enable stored passwords.",
          },
          { status: 200 }
        );
      }
      throw error;
    }

    const credentials = (data ?? []).map((row) => ({
      id: row.id as string,
      loginPassword: decryptPortalCode(row.login_password_ciphertext) ?? null,
    }));

    return NextResponse.json(
      { credentials },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
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

      const supabase = createSupabaseAdminClient();
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

      const ciphertext = encryptPortalCode(body.password);
      const { error: updateError } = await supabase
        .from("team_members")
        .update({ login_password_ciphertext: ciphertext })
        .eq("id", member.id);
      if (updateError) {
        if (/login_password_ciphertext/i.test(updateError.message)) {
          throw new Error(
            `${updateError.message} — run supabase/migrations/019_staff_login_password.sql in Supabase SQL Editor.`
          );
        }
        throw updateError;
      }

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

    if (createBody.role !== "manager" && createBody.role !== "staff") {
      return NextResponse.json({ error: "Role must be manager or staff" }, { status: 400 });
    }

    if (!createBody.department) {
      return NextResponse.json({ error: "Department is required" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
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

    let { error: insertError } = await supabase.from("team_members").insert({
      ...baseRow,
      login_password_ciphertext: encryptPortalCode(createBody.password),
    });
    if (insertError && /login_password_ciphertext/i.test(insertError.message)) {
      const retry = await supabase.from("team_members").insert(baseRow);
      insertError = retry.error;
    }
    if (insertError) {
      await supabase.auth.admin.deleteUser(authData.user.id);
      const detail = insertError.message || "";
      if (/department|check constraint/i.test(detail)) {
        throw new Error(
          `${detail} — run supabase/migrations/018_new_departments.sql in Supabase SQL Editor, then try again.`
        );
      }
      throw insertError;
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
