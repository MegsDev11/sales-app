import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAuthUserFromRequest } from "@/lib/supabase/server-auth";
import { isOwner, canAccessSupport } from "@/lib/permissions";
import { makeId, migrationHint } from "@/lib/mobile/field-mappers";

async function requireIssuer(request: Request) {
  const user = await getAuthUserFromRequest(request);
  if (!user) return null;
  if (isOwner(user) || canAccessSupport(user)) return user;
  return null;
}

export async function GET(request: Request) {
  const user = await requireIssuer(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const supabase = createSupabaseAdminClient();
  try {
    const { data, error } = await supabase
      .from("client_accounts")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(migrationHint(error.message, "022_client_accounts.sql"));

    const leadIds = [...new Set((data ?? []).map((a) => a.lead_id))];
    const { data: leads } = leadIds.length
      ? await supabase.from("leads").select("id, client_name").in("id", leadIds)
      : { data: [] };
    const names = new Map((leads ?? []).map((l) => [l.id, l.client_name]));

    return NextResponse.json({
      accounts: (data ?? []).map((a) => ({
        id: a.id,
        leadId: a.lead_id,
        email: a.email,
        phone: a.phone,
        active: a.active,
        clientName: names.get(a.lead_id) ?? "Client",
        createdAt: a.created_at,
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const user = await requireIssuer(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = (await request.json()) as Record<string, unknown>;
  const action = String(body.action ?? "issue");
  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();

  try {
    if (action === "issue") {
      const leadId = String(body.leadId ?? "");
      const email = String(body.email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      if (!leadId || !email || password.length < 8) {
        return NextResponse.json(
          { error: "leadId, email, and password (8+) required" },
          { status: 400 }
        );
      }

      const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (authErr || !authUser.user) {
        return NextResponse.json(
          { error: authErr?.message ?? "Failed to create auth user" },
          { status: 400 }
        );
      }

      const id = makeId("cac");
      const { error } = await supabase.from("client_accounts").insert({
        id,
        auth_user_id: authUser.user.id,
        lead_id: leadId,
        email,
        phone: (body.phone as string) || null,
        active: true,
        issued_by: user.id,
        created_at: now,
        updated_at: now,
      });
      if (error) {
        await supabase.auth.admin.deleteUser(authUser.user.id);
        throw new Error(migrationHint(error.message, "022_client_accounts.sql"));
      }

      const itemIds = Array.isArray(body.stockItemIds) ? (body.stockItemIds as string[]) : [];
      if (itemIds.length) {
        await supabase.from("client_account_installations").insert(
          itemIds.map((stockItemId) => ({
            id: makeId("cai"),
            client_account_id: id,
            stock_item_id: stockItemId,
            created_at: now,
          }))
        );
      }

      return NextResponse.json({ ok: true, accountId: id });
    }

    if (action === "deactivate") {
      await supabase
        .from("client_accounts")
        .update({ active: false, updated_at: now })
        .eq("id", String(body.accountId));
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
