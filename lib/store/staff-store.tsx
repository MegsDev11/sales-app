"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "@/lib/auth-context";
import {
  fetchStaffUsersFromSupabase,
  patchUser,
  subscribeToStaffChanges,
} from "@/lib/supabase/data";
import type { CreateUserPayload, User } from "@/lib/types";

interface StaffStoreValue {
  users: User[];
  isLoaded: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  updateUser: (id: string, updates: Partial<User>) => void;
  addUser: (data: CreateUserPayload, accessToken: string) => Promise<string>;
  getUserById: (id: string) => User | undefined;
}

const StaffStoreContext = createContext<StaffStoreValue | null>(null);

function normalizeUsers(users: User[]): User[] {
  return users.map((u) => ({
    ...u,
    email: u.email ?? "",
    department: u.department ?? null,
    monthlyRevenueTarget: u.monthlyRevenueTarget ?? 100000,
    monthlyDealsTarget: u.monthlyDealsTarget ?? 5,
  }));
}

export function StaffStoreProvider({ children }: { children: React.ReactNode }) {
  const { isLoading: authLoading } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchStaffUsersFromSupabase();
      setUsers(normalizeUsers(next));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load staff");
    } finally {
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    void refresh();
  }, [authLoading, refresh]);

  useEffect(() => {
    if (!isLoaded) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 2500);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") schedule();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const unsub = subscribeToStaffChanges(schedule);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [isLoaded, refresh]);

  const updateUser = useCallback(
    (id: string, updates: Partial<User>) => {
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...updates } : u)));
      void patchUser(id, updates).catch((err) => {
        setError(err instanceof Error ? err.message : "User update failed");
        void refresh();
      });
    },
    [refresh]
  );

  const addUser = useCallback(
    async (formData: CreateUserPayload, accessToken: string): Promise<string> => {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(formData),
      });
      const body = (await res.json()) as { error?: string; id?: string };
      if (!res.ok) throw new Error(body.error ?? "Failed to create user");
      await refresh();
      return body.id ?? "";
    },
    [refresh]
  );

  const getUserById = useCallback(
    (id: string) => users.find((u) => u.id === id),
    [users]
  );

  const value = useMemo(
    () => ({
      users,
      isLoaded,
      error,
      refresh,
      updateUser,
      addUser,
      getUserById,
    }),
    [users, isLoaded, error, refresh, updateUser, addUser, getUserById]
  );

  return (
    <StaffStoreContext.Provider value={value}>{children}</StaffStoreContext.Provider>
  );
}

export function useStaffStore() {
  const ctx = useContext(StaffStoreContext);
  if (!ctx) throw new Error("useStaffStore must be used within StaffStoreProvider");
  return ctx;
}
