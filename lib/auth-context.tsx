"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { getSupabaseAuthClient } from "@/lib/supabase/auth-client";
import { userFromRow } from "@/lib/supabase/mappers";
import {
  canAccessSalesAdmin,
  canCreateAccounts,
  getHomeRoute,
  isOwner,
} from "@/lib/permissions";
import { accessLevel, can as canAccess, visibleModules } from "@/lib/access";
import type { ModuleDef } from "@/lib/modules";
import type { AccessLevel, ModuleKey, User } from "@/lib/types";

interface AuthContextValue {
  currentUser: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  isOwner: boolean;
  isAdmin: boolean;
  canCreateAccounts: boolean;
  accessToken: string | null;
  /** `can('wireless', 'edit')` — bound to the signed-in user. */
  can: (module: ModuleKey, level?: AccessLevel) => boolean;
  /** Resolved level for a module, for showing "View only" style hints. */
  levelFor: (module: ModuleKey) => AccessLevel;
  /** Modules this user may open, in display order — drives the sidebar. */
  modules: ModuleDef[];
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Load the signed-in staff member together with their module grants.
 *
 * The grants must come down with the session — the entire sidebar, every route
 * guard and every `can(...)` check reads them. RLS on `user_module_access` limits
 * this to the caller's own rows (migration 040), so no extra filtering is needed.
 */
async function fetchTeamMember(authUserId: string): Promise<User | null> {
  const supabase = getSupabaseAuthClient();
  if (!supabase) return null;

  // team_members.id normally holds the Auth UUID, but rows created before
  // migration 002 link through auth_user_id instead. Try both.
  const { data, error } = await supabase
    .from("team_members")
    .select("*")
    .or(`id.eq.${authUserId},auth_user_id.eq.${authUserId}`)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const memberId = data.id as string;
  const templateId = (data as { template_id?: string | null }).template_id ?? null;

  const [grantsResult, templateResult] = await Promise.all([
    supabase
      .from("user_module_access")
      .select("module_key, level, expires_at")
      .eq("user_id", memberId),
    templateId
      ? supabase
          .from("access_template_modules")
          .select("module_key, level")
          .eq("template_id", templateId)
      : Promise.resolve({ data: [], error: null }),
  ]);

  // A missing table means migration 040 has not been applied yet. Fall back to a
  // grant-less user rather than locking everyone out of the app.
  const grants = grantsResult.error ? [] : (grantsResult.data ?? []);
  const templateGrants = templateResult.error ? [] : (templateResult.data ?? []);

  return userFromRow(data, grants, templateGrants);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadSession = useCallback(async () => {
    const supabase = getSupabaseAuthClient();
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();

    if (session?.user) {
      const member = await fetchTeamMember(session.user.id);
      setCurrentUser(member);
      setAccessToken(session.access_token);
    } else {
      setCurrentUser(null);
      setAccessToken(null);
    }

    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadSession();

    const supabase = getSupabaseAuthClient();
    if (!supabase) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const member = await fetchTeamMember(session.user.id);
        setCurrentUser(member);
        setAccessToken(session.access_token);
      } else {
        setCurrentUser(null);
        setAccessToken(null);
      }
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [loadSession]);

  const login = useCallback(
    async (email: string, password: string) => {
      const supabase = getSupabaseAuthClient();
      if (!supabase) return { error: "Authentication is not configured" };

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) return { error: error.message };

      if (data.user) {
        const member = await fetchTeamMember(data.user.id);
        if (!member) {
          await supabase.auth.signOut();
          return { error: "No staff account linked to this login. Contact your manager." };
        }
        setCurrentUser(member);
        setAccessToken(data.session?.access_token ?? null);
        router.push(getHomeRoute(member));
      }

      return {};
    },
    [router]
  );

  const logout = useCallback(async () => {
    const supabase = getSupabaseAuthClient();
    if (supabase) await supabase.auth.signOut();
    setCurrentUser(null);
    setAccessToken(null);
    router.push("/");
  }, [router]);

  const value = useMemo(
    () => ({
      currentUser,
      isLoading,
      login,
      logout,
      isOwner: isOwner(currentUser),
      isAdmin: canAccessSalesAdmin(currentUser),
      canCreateAccounts: canCreateAccounts(currentUser),
      accessToken,
      can: (module: ModuleKey, level: AccessLevel = "view") =>
        canAccess(currentUser, module, level),
      levelFor: (module: ModuleKey) => accessLevel(currentUser, module),
      modules: visibleModules(currentUser),
    }),
    [currentUser, isLoading, login, logout, accessToken]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
