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
import type { User } from "@/lib/types";

interface AuthContextValue {
  currentUser: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  isOwner: boolean;
  isAdmin: boolean;
  canCreateAccounts: boolean;
  accessToken: string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchTeamMember(authUserId: string): Promise<User | null> {
  const supabase = getSupabaseAuthClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("team_members")
    .select("*")
    .eq("id", authUserId)
    .maybeSingle();

  if (error || !data) return null;
  return userFromRow(data);
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
