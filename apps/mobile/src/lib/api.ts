import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => {
    if (Platform.OS === "web") {
      return Promise.resolve(
        typeof localStorage !== "undefined" ? localStorage.getItem(key) : null
      );
    }
    return SecureStore.getItemAsync(key);
  },
  setItem: (key: string, value: string) => {
    if (Platform.OS === "web") {
      if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
      return Promise.resolve();
    }
    return SecureStore.setItemAsync(key, value);
  },
  removeItem: (key: string) => {
    if (Platform.OS === "web") {
      if (typeof localStorage !== "undefined") localStorage.removeItem(key);
      return Promise.resolve();
    }
    return SecureStore.deleteItemAsync(key);
  },
};

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

declare global {
  // Avoid duplicate GoTrue clients under Fast Refresh / Metro double-eval
  // eslint-disable-next-line no-var
  var __megsSupabase: SupabaseClient | undefined;
}

function createSupabase() {
  return createClient(url, anon, {
    auth: {
      storage: ExpoSecureStoreAdapter as never,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      storageKey: "megs-field-auth",
    },
  });
}

export const supabase: SupabaseClient =
  globalThis.__megsSupabase ?? (globalThis.__megsSupabase = createSupabase());

export function getApiBaseUrl() {
  const configured = (process.env.EXPO_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");
  // Browser Expo web cannot call a LAN IP reliably; use localhost for the Next API.
  if (Platform.OS === "web") {
    return "http://localhost:3000";
  }
  return configured || "http://localhost:3000";
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(`${getApiBaseUrl()}${path}`, {
      ...init,
      headers,
      signal: init.signal ?? controller.signal,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.error || `Request failed (${res.status})`);
    }
    return json;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(
        `Request timed out — is the web CRM running at ${getApiBaseUrl()}?`
      );
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}
