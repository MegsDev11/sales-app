import { readFileSync } from "fs";
import { resolve } from "path";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import pg from "pg";

export async function POST() {
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl) {
    const sqlPath = resolve(process.cwd(), "supabase/migrations/002_auth.sql");
    const query = readFileSync(sqlPath, "utf8");
    const client = new pg.Client({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false },
    });

    try {
      await client.connect();
      await client.query(query);
      await client.end();
    } catch (error) {
      try {
        await client.end();
      } catch {
        // ignore
      }
      const message = error instanceof Error ? error.message : "Migration failed";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  } else {
    // Best-effort: columns may already exist from manual SQL run
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("team_members").select("email").limit(1);
    if (error?.message.includes("email")) {
      return NextResponse.json(
        {
          error:
            "Run supabase/migrations/002_auth.sql in Supabase SQL Editor, or set DATABASE_URL for automatic migration.",
        },
        { status: 400 }
      );
    }
  }

  return NextResponse.json({ ok: true, message: "Auth migration applied" });
}
