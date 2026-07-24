import { NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/supabase/server-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { MobileMeResponse, MobileRole } from "@megs/shared";

function staffMobileRole(user: {
  role: string;
  department: string | null;
}): MobileRole {
  if (user.department === "stock") return "stock";
  if (user.department === "coordination" && user.role === "staff") return "tech";
  if (user.department === "coordination" && user.role === "manager") return "tech";
  return "unsupported";
}

export async function GET(request: Request) {
  const staff = await getAuthUserFromRequest(request);
  if (staff) {
    const mobileRole = staffMobileRole(staff);
    const body: MobileMeResponse = {
      mobileRole,
      user: {
        id: staff.id,
        name: staff.name,
        email: staff.email,
        role: staff.role,
        department: staff.department,
        technicianLevel: staff.technicianLevel ?? null,
        phone: staff.phone ?? null,
      },
      client: null,
      message:
        mobileRole === "unsupported"
          ? "This account uses web Operations. Mobile is for field techs, stock, and clients."
          : undefined,
    };
    return NextResponse.json(body, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  }

  // Client account path (Phase 3)
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { createClient } = await import("@supabase/supabase-js");
    const { getSupabaseUrl, getSupabaseAnonKey } = await import("@/lib/supabase/config");
    const supabase = createClient(getSupabaseUrl(), getSupabaseAnonKey());
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const admin = createSupabaseAdminClient();
    const { data: account } = await admin
      .from("client_accounts")
      .select("id, lead_id, email, phone, active")
      .eq("auth_user_id", authData.user.id)
      .eq("active", true)
      .maybeSingle();

    if (!account) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { data: lead } = await admin
      .from("leads")
      .select("client_name")
      .eq("id", account.lead_id)
      .maybeSingle();

    const body: MobileMeResponse = {
      mobileRole: "client",
      user: null,
      client: {
        id: account.id,
        leadId: account.lead_id,
        email: account.email,
        phone: account.phone,
        clientName: lead?.client_name ?? "Client",
      },
    };
    return NextResponse.json(body, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
}
