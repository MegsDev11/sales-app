import { readFileSync } from "fs";
import { resolve } from "path";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import pg from "pg";

async function runSqlFiles(databaseUrl: string, files: string[]) {
  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    for (const file of files) {
      const query = readFileSync(resolve(process.cwd(), file), "utf8");
      await client.query(query);
    }
  } finally {
    await client.end();
  }
}

export async function POST() {
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl) {
    try {
      await runSqlFiles(databaseUrl, [
        "supabase/migrations/002_auth.sql",
        "supabase/migrations/003_roles_departments.sql",
        "supabase/migrations/005_support_towers.sql",
        "supabase/migrations/007_stock_inventory.sql",
        "supabase/migrations/008_coordination_techs_alerts.sql",
        "supabase/migrations/009_stock_item_client_fields.sql",
        "supabase/migrations/010_stock_item_client_name.sql",
        "supabase/migrations/011_stock_qr_labels.sql",
        "supabase/migrations/012_stock_item_client_address.sql",
        "supabase/migrations/013_client_qr_portal.sql",
        "supabase/migrations/014_stock_sundries.sql",
        "supabase/migrations/015_four_digit_portal_codes.sql",
        "supabase/migrations/016_technician_profiles.sql",
        "supabase/migrations/017_pick_list_sundries.sql",
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Migration failed";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  } else {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("team_members").select("department").limit(1);
    if (error?.message.includes("department")) {
      return NextResponse.json(
        {
          error:
            "Run supabase/migrations/002_auth.sql and 003_roles_departments.sql in Supabase SQL Editor, or set DATABASE_URL.",
        },
        { status: 400 }
      );
    }
  }

  return NextResponse.json({ ok: true, message: "Auth and roles migrations applied" });
}
