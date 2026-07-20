import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { userToRow } from "@/lib/supabase/mappers";

/**
 * One-time bootstrap: creates the owner account from env vars when no owner exists.
 * Set OWNER_EMAIL and OWNER_PASSWORD in .env.local, call POST once, then remove password from env.
 */
export async function POST() {
  const email = (
    process.env.OWNER_EMAIL ?? process.env.ADMIN_EMAIL
  )?.trim().toLowerCase();
  const password = process.env.OWNER_PASSWORD ?? process.env.ADMIN_PASSWORD;
  const name = (
    process.env.OWNER_NAME ?? process.env.ADMIN_NAME
  )?.trim() || "Wesley Horak";

  if (!email || !password) {
    return NextResponse.json(
      { error: "Set OWNER_EMAIL and OWNER_PASSWORD in environment variables" },
      { status: 400 }
    );
  }

  try {
    const supabase = createSupabaseAdminClient();

    const { data: existingOwner } = await supabase
      .from("team_members")
      .select("id")
      .eq("role", "owner")
      .limit(1)
      .maybeSingle();

    if (existingOwner) {
      return NextResponse.json({ ok: true, message: "Owner already exists", skipped: true });
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
      if (!authData.user) throw new Error("Failed to create owner auth user");
      authUserId = authData.user.id;
      createdAuthUser = true;
    }

    const { data: existingMember } = await supabase
      .from("team_members")
      .select("id")
      .eq("id", authUserId)
      .maybeSingle();

    if (existingMember) {
      return NextResponse.json({ ok: true, email, message: "Owner team member already exists", skipped: true });
    }

    const owner = {
      id: authUserId,
      name,
      email,
      authUserId,
      role: "owner" as const,
      department: null,
      color: "#C83733",
      avatarInitials: name
        .split(/\s+/)
        .map((p) => p[0])
        .join("")
        .slice(0, 2)
        .toUpperCase() || "WH",
      title: "Megs Owner",
      monthlyRevenueTarget: 0,
      monthlyDealsTarget: 0,
    };

    const { error: insertError } = await supabase.from("team_members").insert(userToRow(owner));
    if (insertError) {
      if (createdAuthUser) await supabase.auth.admin.deleteUser(authUserId);
      throw insertError;
    }

    return NextResponse.json({ ok: true, email, message: "Owner account created" });
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
