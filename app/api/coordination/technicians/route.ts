import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCoordinationAccess } from "@/lib/supabase/server-auth";
import { userFromRow } from "@/lib/supabase/mappers";
import {
  decryptPortalCode,
  encryptPortalCode,
  generateFourDigitCode,
  hashPortalCode,
} from "@/lib/portal-auth";
import type { User } from "@/lib/types";

const TECH_COLORS = ["#0EA5E9", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#14B8A6"];

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "T";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function migrationHint(message: string) {
  if (/login_password_ciphertext/i.test(message)) {
    return `${message} — run supabase/migrations/019_staff_login_password.sql in Supabase.`;
  }
  return message;
}

async function generateUniqueAccessCode(supabase: ReturnType<typeof createSupabaseAdminClient>) {
  for (let attempt = 0; attempt < 25; attempt++) {
    const code = generateFourDigitCode();
    const hash = hashPortalCode(code);
    const { data } = await supabase
      .from("team_members")
      .select("id")
      .eq("access_code_hash", hash)
      .maybeSingle();
    if (!data) return { code, hash };
  }
  throw new Error("Could not generate a unique access code");
}

export async function GET(request: Request) {
  const user = await requireCoordinationAccess(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("team_members")
      .select("*")
      .eq("role", "staff")
      .in("department", ["coordination", "stock"])
      .order("name");
    if (error) throw error;

    const techs: User[] = [];
    for (const row of data ?? []) {
      let accessCode = decryptPortalCode(row.access_code_ciphertext);
      if (!accessCode || !/^\d{4}$/.test(accessCode)) {
        const generated = await generateUniqueAccessCode(supabase);
        const updatedAt = new Date().toISOString();
        const { error: upgradeError } = await supabase
          .from("team_members")
          .update({
            access_code_hash: generated.hash,
            access_code_ciphertext: encryptPortalCode(generated.code),
            access_code_updated_at: updatedAt,
          })
          .eq("id", row.id);
        if (!upgradeError) accessCode = generated.code;
      }
      techs.push({
        ...userFromRow(row),
        hasAccessCode: Boolean(accessCode) || Boolean(row.access_code_hash),
        accessCode,
        loginPassword: decryptPortalCode(row.login_password_ciphertext) ?? undefined,
      });
    }
    return NextResponse.json(
      { technicians: techs },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load technicians";
    return NextResponse.json({ error: migrationHint(message) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const actor = await requireCoordinationAccess(request);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      action:
        | "create"
        | "update"
        | "deactivate"
        | "reactivate"
        | "generateAccessCode"
        | "revokeAccessCode"
        | "setAppPassword";
      name?: string;
      title?: string;
      technicianLevel?: "junior" | "senior";
      phone?: string;
      email?: string;
      idNumber?: string;
      password?: string;
      technicianId?: string;
    };

    const supabase = createSupabaseAdminClient();

    if (body.action === "create") {
      const name = body.name?.trim();
      const email = body.email?.trim().toLowerCase();
      const password = body.password ?? "";
      if (!name) {
        return NextResponse.json({ error: "Name is required" }, { status: 400 });
      }
      if (!email) {
        return NextResponse.json(
          { error: "Email is required — used as MEGS Field app login" },
          { status: 400 }
        );
      }
      if (password.length < 8) {
        return NextResponse.json(
          { error: "App password must be at least 8 characters" },
          { status: 400 }
        );
      }

      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (authError) throw authError;
      if (!authData.user) throw new Error("Failed to create login account");

      const id = authData.user.id;
      const tech: User = {
        id,
        name,
        email,
        role: "staff",
        department: "coordination",
        color: TECH_COLORS[Math.floor(Math.random() * TECH_COLORS.length)],
        avatarInitials: initialsFromName(name),
        title: body.title?.trim() || "Field technician",
        monthlyRevenueTarget: 0,
        monthlyDealsTarget: 0,
        active: true,
        technicianLevel: body.technicianLevel ?? "junior",
        phone: body.phone?.trim() ?? "",
        idNumber: body.idNumber?.trim() ?? "",
        authUserId: id,
        loginPassword: password,
      };

      const row = {
        id,
        name: tech.name,
        email,
        auth_user_id: id,
        role: tech.role,
        department: tech.department,
        color: tech.color,
        avatar_initials: tech.avatarInitials,
        title: tech.title,
        monthly_revenue_target: 0,
        monthly_deals_target: 0,
        active: true,
        technician_level: tech.technicianLevel,
        phone: tech.phone || null,
        id_number: tech.idNumber || null,
        login_password_ciphertext: encryptPortalCode(password),
      };

      const { error } = await supabase.from("team_members").insert(row);
      if (error) {
        await supabase.auth.admin.deleteUser(id);
        throw new Error(migrationHint(error.message));
      }

      return NextResponse.json({ ok: true, technician: tech, loginPassword: password });
    }

    if (body.action === "update" || body.action === "setAppPassword") {
      if (!body.technicianId) {
        return NextResponse.json({ error: "technicianId required" }, { status: 400 });
      }

      const { data: existing, error: findError } = await supabase
        .from("team_members")
        .select("*")
        .eq("id", body.technicianId)
        .maybeSingle();
      if (findError) throw findError;
      if (!existing) {
        return NextResponse.json({ error: "Technician not found" }, { status: 404 });
      }

      const name =
        body.action === "setAppPassword"
          ? existing.name
          : body.name?.trim() || existing.name;
      if (!name) {
        return NextResponse.json({ error: "Name is required" }, { status: 400 });
      }

      const nextEmail = (
        body.action === "setAppPassword"
          ? existing.email
          : body.email?.trim() || existing.email || ""
      )
        .toLowerCase()
        .trim();
      const password = body.password?.trim() || "";

      let authUserId = existing.auth_user_id as string | null;

      // Provision or update Supabase Auth so MEGS Field login stays in sync
      if (!authUserId) {
        if (!nextEmail) {
          return NextResponse.json(
            { error: "Email is required to enable app login" },
            { status: 400 }
          );
        }
        if (password.length < 8) {
          return NextResponse.json(
            { error: "Set an app password (min 8 characters) to enable mobile login" },
            { status: 400 }
          );
        }
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email: nextEmail,
          password,
          email_confirm: true,
        });
        if (authError) throw authError;
        if (!authData.user) throw new Error("Failed to create login account");
        authUserId = authData.user.id;
      } else {
        const authUpdates: { email?: string; password?: string } = {};
        if (nextEmail && nextEmail !== (existing.email ?? "").toLowerCase()) {
          authUpdates.email = nextEmail;
        }
        if (password.length >= 8) {
          authUpdates.password = password;
        }
        if (Object.keys(authUpdates).length) {
          const { error: authError } = await supabase.auth.admin.updateUserById(
            authUserId,
            authUpdates
          );
          if (authError) throw authError;
        }
      }

      const updates: Record<string, unknown> = {
        name,
        title:
          body.action === "setAppPassword"
            ? existing.title
            : body.title?.trim() || existing.title || "Field technician",
        avatar_initials: initialsFromName(name),
        technician_level:
          body.action === "setAppPassword"
            ? existing.technician_level
            : body.technicianLevel ?? existing.technician_level ?? "junior",
        phone:
          body.action === "setAppPassword"
            ? existing.phone
            : body.phone?.trim() || null,
        email: nextEmail || null,
        id_number:
          body.action === "setAppPassword"
            ? existing.id_number
            : body.idNumber?.trim() || null,
        auth_user_id: authUserId,
      };
      if (password.length >= 8) {
        updates.login_password_ciphertext = encryptPortalCode(password);
      }

      const { error } = await supabase
        .from("team_members")
        .update(updates)
        .eq("id", body.technicianId);
      if (error) throw new Error(migrationHint(error.message));

      return NextResponse.json({
        ok: true,
        loginPassword:
          password.length >= 8
            ? password
            : decryptPortalCode(existing.login_password_ciphertext) ?? null,
      });
    }

    if (body.action === "deactivate" || body.action === "reactivate") {
      if (!body.technicianId) {
        return NextResponse.json({ error: "technicianId required" }, { status: 400 });
      }

      const { data: existing, error: findError } = await supabase
        .from("team_members")
        .select("*")
        .eq("id", body.technicianId)
        .maybeSingle();
      if (findError) throw findError;
      if (!existing) {
        return NextResponse.json({ error: "Technician not found" }, { status: 404 });
      }

      const active = body.action === "reactivate";
      const { error } = await supabase
        .from("team_members")
        .update({ active })
        .eq("id", body.technicianId);
      if (error) throw error;

      if (existing.auth_user_id) {
        await supabase.auth.admin.updateUserById(existing.auth_user_id, {
          ban_duration: active ? "none" : "876000h",
        });
      }

      return NextResponse.json({ ok: true });
    }

    if (body.action === "generateAccessCode" || body.action === "revokeAccessCode") {
      if (!body.technicianId) {
        return NextResponse.json({ error: "technicianId required" }, { status: 400 });
      }

      const { data: existing, error: findError } = await supabase
        .from("team_members")
        .select("*")
        .eq("id", body.technicianId)
        .maybeSingle();
      if (findError) throw findError;
      if (!existing) {
        return NextResponse.json({ error: "Technician not found" }, { status: 404 });
      }

      const now = new Date().toISOString();
      if (body.action === "revokeAccessCode") {
        const { error } = await supabase
          .from("team_members")
          .update({
            access_code_hash: null,
            access_code_ciphertext: null,
            access_code_updated_at: now,
          })
          .eq("id", body.technicianId);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      const { code, hash } = await generateUniqueAccessCode(supabase);
      const { error } = await supabase
        .from("team_members")
        .update({
          access_code_hash: hash,
          access_code_ciphertext: encryptPortalCode(code),
          access_code_updated_at: now,
        })
        .eq("id", body.technicianId);
      if (error) throw error;
      return NextResponse.json({ ok: true, accessCode: code });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Technician action failed";
    return NextResponse.json({ error: migrationHint(message) }, { status: 500 });
  }
}
