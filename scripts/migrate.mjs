/**
 * Applies CRM schema via Supabase Management API database/query or direct postgres.
 * Usage: node scripts/migrate.mjs
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = "tcvygjrnjythhktvmqrq";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? `https://${PROJECT_REF}.supabase.co`;
const SECRET_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

const sqlPath = resolve(__dirname, "../supabase/migrations/001_initial_schema.sql");
const query = readFileSync(sqlPath, "utf8");

async function tryManagementQuery() {
  if (!SECRET_KEY) return null;
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    }
  );
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

async function tryDirectPostgres() {
  if (!DATABASE_URL) return null;
  const client = new pg.Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query(query);
    return { ok: true, status: 200, text: "Migration applied via postgres" };
  } finally {
    await client.end();
  }
}

async function verifyTables() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/team_members?select=id&limit=1`, {
    headers: {
      apikey: SECRET_KEY ?? "",
      Authorization: `Bearer ${SECRET_KEY ?? ""}`,
    },
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

console.log("Running Supabase migration...\n");

const attempts = [
  ["Direct postgres (DATABASE_URL)", tryDirectPostgres],
  ["Management API database/query", tryManagementQuery],
];

for (const [name, fn] of attempts) {
  console.log(`Trying ${name}...`);
  try {
    const result = await fn();
    if (!result) {
      console.log("  Skipped (missing credentials)\n");
      continue;
    }
    console.log(`  Status: ${result.status}`);
    console.log(`  Response: ${result.text.slice(0, 800)}`);
    if (result.ok) {
      console.log("\nWaiting for schema cache refresh...");
      await new Promise((r) => setTimeout(r, 2000));
      const verify = await verifyTables();
      console.log(`Verify team_members: ${verify.status} ${verify.text}`);
      if (verify.ok) {
        console.log("\nMigration complete!");
        process.exit(0);
      }
    }
  } catch (err) {
    console.log(`  Error: ${err.message}`);
  }
  console.log("");
}

const verify = await verifyTables();
if (verify.ok) {
  console.log("Tables already exist.");
  process.exit(0);
}

console.error("Migration failed. Add DATABASE_URL to .env.local from Supabase → Settings → Database → URI");
console.error("Verify:", verify.status, verify.text);
process.exit(1);
