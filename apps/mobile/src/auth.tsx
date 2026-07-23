import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { MobileMeResponse, MobileRole } from "@megs/shared";
import { API_PATHS } from "@megs/shared";
import { apiFetch, supabase } from "./lib/api";
import type { Session } from "@supabase/supabase-js";

type AuthState = {
  session: Session | null;
  me: MobileMeResponse | null;
  loading: boolean;
  meError: string | null;
  refreshMe: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  mobileRole: MobileRole | null;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<MobileMeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [meLoading, setMeLoading] = useState(false);
  const [meError, setMeError] = useState<string | null>(null);

  const refreshMe = useCallback(async () => {
    setMeLoading(true);
    setMeError(null);
    try {
      const data = (await apiFetch(API_PATHS.mobileMe)) as MobileMeResponse;
      setMe(data);
    } catch (e) {
      setMe(null);
      setMeError(e instanceof Error ? e.message : "Failed to load profile");
    } finally {
      setMeLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) {
      setMe(null);
      setMeError(null);
      setMeLoading(false);
      return;
    }
    void refreshMe();
  }, [session?.access_token, refreshMe]);

  const value = useMemo<AuthState>(
    () => ({
      session,
      me,
      loading: loading || (!!session && meLoading && !me && !meError),
      meError,
      refreshMe,
      mobileRole: me?.mobileRole ?? null,
      signIn: async (email, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        // Set session immediately so routing does not race onAuthStateChange
        setSession(data.session);
        if (data.session) {
          setMeLoading(true);
          setMeError(null);
          try {
            const profile = (await apiFetch(API_PATHS.mobileMe)) as MobileMeResponse;
            setMe(profile);
          } catch (e) {
            setMe(null);
            setMeError(e instanceof Error ? e.message : "Failed to load profile");
          } finally {
            setMeLoading(false);
          }
        }
      },
      signOut: async () => {
        await supabase.auth.signOut();
        setSession(null);
        setMe(null);
        setMeError(null);
      },
    }),
    [session, me, loading, meLoading, meError, refreshMe]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside provider");
  return ctx;
}
