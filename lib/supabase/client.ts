import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseUrl, isSupabaseEnabled } from "@/lib/supabase/config";
import type { Database } from "@/lib/supabase/database.types";

let browserClient: SupabaseClient<Database> | null = null;

export function getSupabaseBrowserClient(): SupabaseClient<Database> | null {
  if (!isSupabaseEnabled()) return null;

  if (!browserClient) {
    browserClient = createClient<Database>(
      getSupabaseUrl(),
      getSupabaseAnonKey()
    );
  }

  return browserClient;
}
