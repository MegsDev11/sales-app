import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { userToRow } from "@/lib/supabase/mappers";
import type { CreateUserPayload, Department, UserRole } from "@/lib/types";
import { requireOwner } from "@/lib/supabase/server-auth";
import { getDefaultTitle } from "@/lib/permissions";

export async function POST(request: Request) {
  const ownerUser = await requireOwner(request);
  if (!ownerUser) {
    return NextResponse.json({ error: "Unauthorized — owner access required" }, { status: 403 });
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

    if (body.role === "owner") {
      return NextResponse.json({ error: "Cannot create owner accounts via API" }, { status: 400 });
    }

    if (body.role !== "manager" && body.role !== "staff") {
      return NextResponse.json({ error: "Role must be manager or staff" }, { status: 400 });
    }

    if (!body.department) {
      return NextResponse.json({ error: "Department is required" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const email = body.email.trim().toLowerCase();
    const department = body.department as Department;
    const role = body.role as UserRole;

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
      role,
      department,
      color: body.color,
      avatarInitials: body.avatarInitials.trim() || body.name.slice(0, 2).toUpperCase(),
      title: body.title.trim() || getDefaultTitle(role, department),
      monthlyRevenueTarget: body.monthlyRevenueTarget,
      monthlyDealsTarget: body.monthlyDealsTarget,
    };

    const { error: insertError } = await supabase.from("team_members").insert(userToRow(member));
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
