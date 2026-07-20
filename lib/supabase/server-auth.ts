import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/config";
import { createClient } from "@supabase/supabase-js";
import type { User } from "@/lib/types";
import { userFromRow } from "@/lib/supabase/mappers";

export async function getAuthUserFromRequest(request: Request): Promise<User | null> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;

  const supabase = createClient(getSupabaseUrl(), getSupabaseAnonKey());
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) return null;

  const admin = createSupabaseAdminClient();
  const { data: member, error } = await admin
    .from("team_members")
    .select("*")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (error || !member) return null;
  return userFromRow(member);
}

export async function requireAdmin(request: Request): Promise<User | null> {
  const user = await getAuthUserFromRequest(request);
  if (!user || user.role !== "admin") return null;
  return user;
}
