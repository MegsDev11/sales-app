import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/config";
import { createClient } from "@supabase/supabase-js";
import type { AccessLevel, ModuleKey, User } from "@/lib/types";
import { userFromRow, type RawGrantRow } from "@/lib/supabase/mappers";
import { can, canAny } from "@/lib/access";

/**
 * Resolve the bearer token to a staff member, with their module grants attached.
 *
 * Grants are loaded with the service-role client so this works regardless of RLS,
 * and so a route can make an authorisation decision before touching any data.
 * Since migration 042 the database enforces the same rules independently — these
 * guards exist to return a clean 403 rather than a confusing empty result.
 */
export async function getAuthUserFromRequest(request: Request): Promise<User | null> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;

  const supabase = createClient(getSupabaseUrl(), getSupabaseAnonKey());
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) return null;

  const admin = createSupabaseAdminClient();

  const { data: member } = await admin
    .from("team_members")
    .select("*")
    .or(`id.eq.${authData.user.id},auth_user_id.eq.${authData.user.id}`)
    .limit(1)
    .maybeSingle();

  if (!member) return null;
  if ((member as { active?: boolean }).active === false) return null;

  const templateId = (member as { template_id?: string | null }).template_id ?? null;

  const [grantsResult, templateResult] = await Promise.all([
    admin
      .from("user_module_access")
      .select("module_key, level, expires_at")
      .eq("user_id", member.id as string),
    templateId
      ? admin
          .from("access_template_modules")
          .select("module_key, level")
          .eq("template_id", templateId)
      : Promise.resolve({ data: [], error: null }),
  ]);

  // Missing tables => migration 040 not applied yet. Degrade to no grants rather
  // than throwing; owners still resolve to full access via their role.
  const grants = (grantsResult.error ? [] : (grantsResult.data ?? [])) as RawGrantRow[];
  const templateGrants = (
    templateResult.error ? [] : (templateResult.data ?? [])
  ) as RawGrantRow[];

  return userFromRow(member, grants, templateGrants);
}

/**
 * The one guard. Everything below is a thin wrapper kept for existing call sites.
 *
 *   const user = await requireAccess(request, "stock", "edit");
 *   if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
 */
export async function requireAccess(
  request: Request,
  moduleKey: ModuleKey,
  level: AccessLevel = "view"
): Promise<User | null> {
  const user = await getAuthUserFromRequest(request);
  if (!user || !can(user, moduleKey, level)) return null;
  return user;
}

/** Access to any one of several modules — for endpoints two teams share. */
export async function requireAnyAccess(
  request: Request,
  moduleKeys: ModuleKey[],
  level: AccessLevel = "view"
): Promise<User | null> {
  const user = await getAuthUserFromRequest(request);
  if (!user || !canAny(user, moduleKeys, level)) return null;
  return user;
}

export async function requireAuthenticated(request: Request): Promise<User | null> {
  return getAuthUserFromRequest(request);
}

/**
 * Owner OR anyone holding the admin module at `manage`.
 * Named requireOwner for compatibility; it now also admits delegated admins, which
 * is what makes it possible to have a second administrator at all.
 */
export async function requireOwner(request: Request): Promise<User | null> {
  const user = await getAuthUserFromRequest(request);
  if (!user) return null;
  if (user.role === "owner") return user;
  if (can(user, "admin", "manage")) return user;
  return null;
}

// ---------------------------------------------------------------------------
// Compatibility wrappers — prefer requireAccess(request, module, level) in new code
// ---------------------------------------------------------------------------

export async function requireSupportAccess(request: Request): Promise<User | null> {
  return requireAccess(request, "support");
}

export async function requireStockAccess(request: Request): Promise<User | null> {
  return requireAccess(request, "stock");
}

export async function requireStockRequestsAccess(request: Request): Promise<User | null> {
  return requireAnyAccess(request, ["stock", "coordination"]);
}

export async function requireCoordinationAccess(request: Request): Promise<User | null> {
  return requireAccess(request, "coordination");
}

export async function requireWirelessAccess(request: Request): Promise<User | null> {
  return requireAccess(request, "wireless");
}

export async function requireFinancialAccess(request: Request): Promise<User | null> {
  return requireAccess(request, "financial");
}

/** @deprecated Use requireAccess(request, "admin", "manage") */
export async function requireAdmin(request: Request): Promise<User | null> {
  return requireOwner(request);
}
