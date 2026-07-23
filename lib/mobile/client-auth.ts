import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/config";
import type { User } from "@/lib/types";
import { userFromRow } from "@/lib/supabase/mappers";

export type ClientAccountRow = {
  id: string;
  auth_user_id: string | null;
  lead_id: string;
  email: string | null;
  phone: string | null;
  active: boolean;
};

export async function getClientAccountFromRequest(
  request: Request
): Promise<ClientAccountRow | null> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;

  const supabase = createClient(getSupabaseUrl(), getSupabaseAnonKey());
  const { data: authData, error } = await supabase.auth.getUser(token);
  if (error || !authData.user) return null;

  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("client_accounts")
    .select("id, auth_user_id, lead_id, email, phone, active")
    .eq("auth_user_id", authData.user.id)
    .eq("active", true)
    .maybeSingle();

  return data as ClientAccountRow | null;
}

export async function getStaffOrNull(request: Request): Promise<User | null> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const supabase = createClient(getSupabaseUrl(), getSupabaseAnonKey());
  const { data: authData, error } = await supabase.auth.getUser(token);
  if (error || !authData.user) return null;
  const admin = createSupabaseAdminClient();
  const { data: byId } = await admin
    .from("team_members")
    .select("*")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (byId) return userFromRow(byId);
  const { data: byAuth } = await admin
    .from("team_members")
    .select("*")
    .eq("auth_user_id", authData.user.id)
    .maybeSingle();
  return byAuth ? userFromRow(byAuth) : null;
}
