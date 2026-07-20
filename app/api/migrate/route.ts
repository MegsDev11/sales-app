import { readFileSync } from "fs";
import { resolve } from "path";
import { NextResponse } from "next/server";
import pg from "pg";

export async function POST() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return NextResponse.json(
      {
        error:
          "Missing DATABASE_URL. Add it to .env.local from Supabase → Project Settings → Database → Connection string (URI).",
      },
      { status: 400 }
    );
  }

  const sqlPath = resolve(process.cwd(), "supabase/migrations/001_initial_schema.sql");
  const query = readFileSync(sqlPath, "utf8");

  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    await client.query(query);
    await client.end();

    return NextResponse.json({ ok: true, message: "Migration applied successfully" });
  } catch (error) {
    try {
      await client.end();
    } catch {
      // ignore
    }

    const message = error instanceof Error ? error.message : "Migration failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
