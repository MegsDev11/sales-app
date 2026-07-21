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
      });
    }
    return NextResponse.json(
      { technicians: techs },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load technicians";
    return NextResponse.json({ error: message }, { status: 500 });
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
        | "revokeAccessCode";
      name?: string;
      title?: string;
      technicianLevel?: "junior" | "senior";
      phone?: string;
      email?: string;
      idNumber?: string;
      technicianId?: string;
    };

    const supabase = createSupabaseAdminClient();

    if (body.action === "create") {
      const name = body.name?.trim();
      if (!name) {
        return NextResponse.json({ error: "Name is required" }, { status: 400 });
      }

      const id = `tech-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const tech: User = {
        id,
        name,
        email: body.email?.trim() ?? "",
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
      };

      const { error } = await supabase.from("team_members").insert({
        id: tech.id,
        name: tech.name,
        email: body.email?.trim() || null,
        auth_user_id: null,
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
      });
      if (error) {
        // Fallback if migration 008 (active column) not applied yet
        if (/active/i.test(error.message)) {
          const { error: retryError } = await supabase.from("team_members").insert({
            id: tech.id,
            name: tech.name,
            email: null,
            auth_user_id: null,
            role: tech.role,
            department: tech.department,
            color: tech.color,
            avatar_initials: tech.avatarInitials,
            title: tech.title,
            monthly_revenue_target: 0,
            monthly_deals_target: 0,
          });
          if (retryError) throw retryError;
        } else {
          throw error;
        }
      }

      return NextResponse.json({ ok: true, technician: tech });
    }

    if (body.action === "update") {
      if (!body.technicianId) {
        return NextResponse.json({ error: "technicianId required" }, { status: 400 });
      }
      const name = body.name?.trim();
      if (!name) {
        return NextResponse.json({ error: "Name is required" }, { status: 400 });
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

      const { error } = await supabase
        .from("team_members")
        .update({
          name,
          title: body.title?.trim() || existing.title || "Field technician",
          avatar_initials: initialsFromName(name),
          technician_level: body.technicianLevel ?? existing.technician_level ?? "junior",
          phone: body.phone?.trim() || null,
          email: body.email?.trim() || null,
          id_number: body.idNumber?.trim() || null,
        })
        .eq("id", body.technicianId);
      if (error) throw error;

      return NextResponse.json({ ok: true });
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
      if (existing.auth_user_id && body.action === "deactivate") {
        // Allow deactivating login users from coordination roster view too
      }

      const { error } = await supabase
        .from("team_members")
        .update({ active: body.action === "reactivate" })
        .eq("id", body.technicianId);
      if (error) throw error;

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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
