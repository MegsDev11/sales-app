import { NextResponse } from "next/server";

/**
 * Blocks development-only endpoints in production.
 *
 * /api/migrate runs arbitrary SQL from disk, and /api/admin/bootstrap creates an
 * owner account straight from environment variables. Both are unauthenticated by
 * design because they must work before any account exists — which is exactly why
 * they must not be reachable on a deployed site.
 *
 * Set ALLOW_DEV_ENDPOINTS=true to re-enable temporarily (e.g. first deploy, to
 * bootstrap the owner), then remove it.
 *
 * Usage:
 *   const blocked = blockInProduction();
 *   if (blocked) return blocked;
 */
export function blockInProduction(): NextResponse | null {
  const allowed =
    process.env.NODE_ENV !== "production" || process.env.ALLOW_DEV_ENDPOINTS === "true";

  if (allowed) return null;

  return NextResponse.json(
    {
      error:
        "This endpoint is disabled in production. Set ALLOW_DEV_ENDPOINTS=true temporarily if you genuinely need it, then remove it.",
    },
    { status: 404 }
  );
}
