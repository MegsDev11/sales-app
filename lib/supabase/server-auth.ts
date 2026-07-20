import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/config";
import { createClient } from "@supabase/supabase-js";
import type { User } from "@/lib/types";
import { userFromRow } from "@/lib/supabase/mappers";
import {
  canAccessCoordination,
  canAccessStock,
  canAccessStockRequests,
  canAccessSupport,
  isOwner,
} from "@/lib/permissions";

export async function getAuthUserFromRequest(request: Request): Promise<User | null> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;

  const supabase = createClient(getSupabaseUrl(), getSupabaseAnonKey());
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) return null;

  const admin = createSupabaseAdminClient();
  const { data: memberById } = await admin
    .from("team_members")
    .select("*")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (memberById) return userFromRow(memberById);

  const { data: memberByAuth, error } = await admin
    .from("team_members")
    .select("*")
    .eq("auth_user_id", authData.user.id)
    .maybeSingle();

  if (error || !memberByAuth) return null;
  return userFromRow(memberByAuth);
}

export async function requireOwner(request: Request): Promise<User | null> {
  const user = await getAuthUserFromRequest(request);
  if (!user || !isOwner(user)) return null;
  return user;
}

export async function requireAuthenticated(request: Request): Promise<User | null> {
  return getAuthUserFromRequest(request);
}

export async function requireSupportAccess(request: Request): Promise<User | null> {
  const user = await getAuthUserFromRequest(request);
  if (!user || !canAccessSupport(user)) return null;
  return user;
}

export async function requireStockAccess(request: Request): Promise<User | null> {
  const user = await getAuthUserFromRequest(request);
  if (!user || !canAccessStock(user)) return null;
  return user;
}

export async function requireStockRequestsAccess(request: Request): Promise<User | null> {
  const user = await getAuthUserFromRequest(request);
  if (!user || !canAccessStockRequests(user)) return null;
  return user;
}

export async function requireCoordinationAccess(request: Request): Promise<User | null> {
  const user = await getAuthUserFromRequest(request);
  if (!user || !canAccessCoordination(user)) return null;
  return user;
}

/** @deprecated Use requireOwner for account creation */
export async function requireAdmin(request: Request): Promise<User | null> {
  return requireOwner(request);
}
