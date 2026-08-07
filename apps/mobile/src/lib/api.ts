import Constants from "expo-constants";
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
  // Avoid duplicate GoTrue clients under Fast Refresh / Metro double-eval.
  // `var` is required here: `let`/`const` in a global declaration do not attach to
  // globalThis, so the cache would not survive a reload.
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

const DEFAULT_API_PORT = "3000";

function isLanHost(host: string) {
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  );
}

/** Host serving this bundle, e.g. "192.168.0.198". Only set by the Expo CLI in dev. */
function getMetroHost() {
  const hostUri = Constants.expoConfig?.hostUri ?? "";
  return hostUri.split("/")[0].split(":")[0];
}

export function getApiBaseUrl() {
  const configured = (process.env.EXPO_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");
  // Browser Expo web cannot call a LAN IP reliably; use localhost for the Next API.
  if (Platform.OS === "web") {
    return "http://localhost:3000";
  }

  const [, scheme = "http", host = "", port = DEFAULT_API_PORT] =
    /^(https?):\/\/([^:/]+)(?::(\d+))?$/.exec(configured) ?? [];

  // A LAN address in .env goes stale whenever DHCP hands the dev machine a new IP,
  // so trust the host Metro is actually serving this bundle from.
  const metroHost = getMetroHost();
  if (metroHost && (!host || isLanHost(host))) {
    return `${scheme}://${metroHost}:${port}`;
  }

  return configured || `http://localhost:${DEFAULT_API_PORT}`;
}

export async function apiFetch(
  path: string,
  init: RequestInit = {},
  opts?: { timeoutMs?: number }
) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const headers = new Headers(init.headers);
  const isFormData =
    typeof FormData !== "undefined" && init.body instanceof FormData;
  if (!headers.has("Content-Type") && init.body && !isFormData) {
    headers.set("Content-Type", "application/json");
  }
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    opts?.timeoutMs ?? (isFormData ? 60000 : 20000)
  );
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
        `Request timed out — is the web Operations app running at ${getApiBaseUrl()}?`
      );
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}
