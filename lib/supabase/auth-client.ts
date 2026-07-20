import { createClient } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseUrl, isSupabaseEnabled } from "@/lib/supabase/config";
import type { Database } from "@/lib/supabase/database.types";

let authClient: ReturnType<typeof createClient<Database>> | null = null;

export function getSupabaseAuthClient() {
  if (!isSupabaseEnabled()) return null;

  if (!authClient) {
    authClient = createClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  return authClient;
}
