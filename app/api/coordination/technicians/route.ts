import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCoordinationAccess } from "@/lib/supabase/server-auth";
import { userFromRow } from "@/lib/supabase/mappers";
import type { User } from "@/lib/types";

const TECH_COLORS = ["#0EA5E9", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#14B8A6"];

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "T";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
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

    const techs = (data ?? []).map(userFromRow);
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
      action: "create" | "deactivate" | "reactivate";
      name?: string;
      title?: string;
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
        email: "",
        role: "staff",
        department: "coordination",
        color: TECH_COLORS[Math.floor(Math.random() * TECH_COLORS.length)],
        avatarInitials: initialsFromName(name),
        title: body.title?.trim() || "Field technician",
        monthlyRevenueTarget: 0,
        monthlyDealsTarget: 0,
        active: true,
      };

      const { error } = await supabase.from("team_members").insert({
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
        active: true,
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

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Technician action failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
