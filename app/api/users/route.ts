import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { userToRow } from "@/lib/supabase/mappers";
import type { CreateUserPayload } from "@/lib/types";
import { requireAdmin } from "@/lib/supabase/server-auth";
import type { TeamMemberRow } from "@/lib/supabase/database.types";

function stripOptionalAuthColumns(row: TeamMemberRow): Omit<TeamMemberRow, "email" | "auth_user_id"> {
  const { email: _email, auth_user_id: _auth, ...legacyRow } = row;
  return legacyRow;
}

export async function POST(request: Request) {
  const adminUser = await requireAdmin(request);
  if (!adminUser) {
    return NextResponse.json({ error: "Unauthorized — admin access required" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as CreateUserPayload;

    if (!body.email?.trim() || !body.password || body.password.length < 8) {
      return NextResponse.json(
        { error: "Email and password (min 8 characters) are required" },
        { status: 400 }
      );
    }

    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    if (body.role === "admin") {
      return NextResponse.json({ error: "Cannot create additional admin accounts via API" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const email = body.email.trim().toLowerCase();

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: body.password,
      email_confirm: true,
    });

    if (authError) throw authError;
    if (!authData.user) throw new Error("Failed to create auth user");

    const memberId = authData.user.id;
    const member = {
      id: memberId,
      name: body.name.trim(),
      email,
      authUserId: authData.user.id,
      role: "sales" as const,
      color: body.color,
      avatarInitials: body.avatarInitials.trim() || body.name.slice(0, 2).toUpperCase(),
      title: body.title.trim() || "Sales Representative",
      monthlyRevenueTarget: body.monthlyRevenueTarget,
      monthlyDealsTarget: body.monthlyDealsTarget,
    };

    const { error: insertError } = await supabase
      .from("team_members")
      .insert(stripOptionalAuthColumns(userToRow(member)));
    if (insertError) {
      await supabase.auth.admin.deleteUser(authData.user.id);
      throw insertError;
    }

    return NextResponse.json({ ok: true, id: memberId, email });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create user";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
