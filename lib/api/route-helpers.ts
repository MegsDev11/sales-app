import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * The four helpers every API route was declaring for itself.
 *
 * Before this file there were 22 copies of `errorMessage`, 17 of `admin`, 13 of
 * `newId` and 6 of `withHint`. They had drifted: the dunning route's copy handled
 * only `Error`, so a Supabase failure there reported "Request failed" instead of
 * the real message and never reached the migration hint. The clients route's
 * regex omitted `column .* does not exist`, so a missing column skipped the hint
 * too. Copy-paste is fine until the copies stop agreeing, which is exactly when
 * the difference is invisible and the message is wrong.
 */

/**
 * Supabase returns PostgrestError — a plain object with `.message`, NOT an Error
 * instance — so the `instanceof` branch alone is never enough.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const m = (error as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return "Request failed";
}

/**
 * Whether a database error means "the migration has not been run yet" rather than
 * "the request was wrong". Modules ship their SQL for the user to apply by hand,
 * so this state is expected and deserves a pointer, not a stack trace.
 */
export function isMissingSchemaError(message: string): boolean {
  return /relation .* does not exist|column .* does not exist|schema cache|could not find/i.test(
    message
  );
}

/** Append the module's migration hint, but only to errors that are about schema. */
export function withHint(message: string, hint: string): string {
  return isMissingSchemaError(message) ? `${message} — ${hint}` : message;
}

/** App-generated primary key. The new tables use `text` ids, not uuid defaults. */
export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Service-role client, untyped.
 *
 * lib/supabase/database.types.ts is not regenerated for new tables, so the typed
 * client resolves every column on them to `never`. Casting once here beats the
 * same cast inlined at seventeen call sites.
 */
export function adminClient(): SupabaseClient {
  return createSupabaseAdminClient() as unknown as SupabaseClient;
}

/** JSON error response, with the migration hint attached when `hint` is given. */
export function fail(error: unknown, status = 500, hint?: string) {
  const message = errorMessage(error);
  return NextResponse.json(
    { error: hint ? withHint(message, hint) : message },
    { status }
  );
}
