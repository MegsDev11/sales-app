import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAuthClient } from "@/lib/supabase/auth-client";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Browser data access must use the same client as auth so requests run as
 * `authenticated` (JWT), not anonymous. Anon write policies are removed.
 */
export function getSupabaseBrowserClient(): SupabaseClient<Database> | null {
  return getSupabaseAuthClient();
}
