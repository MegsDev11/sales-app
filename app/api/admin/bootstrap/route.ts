import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { userToRow } from "@/lib/supabase/mappers";

/**
 * One-time bootstrap: creates the admin account from env vars when no admin exists.
 * Set ADMIN_EMAIL and ADMIN_PASSWORD in .env.local, call POST once, then remove password from env.
 */
export async function POST() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim() || "Herman Booysen";

  if (!email || !password) {
    return NextResponse.json(
      { error: "Set ADMIN_EMAIL and ADMIN_PASSWORD in environment variables" },
      { status: 400 }
    );
  }

  try {
    const supabase = createSupabaseAdminClient();

    const { data: existingAdmin } = await supabase
      .from("team_members")
      .select("id")
      .eq("role", "admin")
      .limit(1)
      .maybeSingle();

    if (existingAdmin) {
      return NextResponse.json({ ok: true, message: "Admin already exists", skipped: true });
    }

    let authUserId: string;
    let createdAuthUser = false;

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      if (!authError.message.toLowerCase().includes("already")) throw authError;
      const { data: listed, error: listError } = await supabase.auth.admin.listUsers();
      if (listError) throw listError;
      const existing = listed.users.find((u) => u.email?.toLowerCase() === email);
      if (!existing) throw authError;
      authUserId = existing.id;
    } else {
      if (!authData.user) throw new Error("Failed to create admin auth user");
      authUserId = authData.user.id;
      createdAuthUser = true;
    }

    const { data: existingMember } = await supabase
      .from("team_members")
      .select("id")
      .eq("id", authUserId)
      .maybeSingle();

    if (existingMember) {
      return NextResponse.json({ ok: true, email, message: "Admin team member already exists", skipped: true });
    }

    const admin = {
      id: authUserId,
      name,
      email,
      authUserId,
      role: "admin" as const,
      color: "#C83733",
      avatarInitials: "HB",
      title: "Sales Manager",
      monthlyRevenueTarget: 500000,
      monthlyDealsTarget: 20,
    };

    const row = userToRow(admin);
    const { email: _email, auth_user_id: _auth, ...legacyRow } = row;
    const { error: insertError } = await supabase.from("team_members").insert(legacyRow);
    if (insertError) {
      if (createdAuthUser) await supabase.auth.admin.deleteUser(authUserId);
      throw insertError;
    }

    return NextResponse.json({ ok: true, email, message: "Admin account created" });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error && "message" in error
          ? String((error as { message: unknown }).message)
          : "Bootstrap failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
