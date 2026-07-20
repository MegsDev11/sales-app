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
import { AUTH_STORAGE_KEY } from "@/lib/constants";
import { useCrmStore } from "@/lib/store/crm-store";
import type { User } from "@/lib/types";

interface AuthContextValue {
  currentUser: User | null;
  isLoading: boolean;
  login: (userId: string) => void;
  logout: () => void;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { users } = useCrmStore();
  const router = useRouter();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    if (stored) setCurrentUserId(stored);
    setIsLoading(false);
  }, []);

  const currentUser = useMemo(
    () => users.find((u) => u.id === currentUserId) ?? null,
    [users, currentUserId]
  );

  const login = useCallback(
    (userId: string) => {
      localStorage.setItem(AUTH_STORAGE_KEY, userId);
      setCurrentUserId(userId);
      router.push("/dashboard");
    },
    [router]
  );

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setCurrentUserId(null);
    router.push("/");
  }, [router]);

  const value = useMemo(
    () => ({
      currentUser,
      isLoading,
      login,
      logout,
      isAdmin: currentUser?.role === "admin",
    }),
    [currentUser, isLoading, login, logout]
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
