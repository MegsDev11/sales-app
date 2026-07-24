/**
 * Apply one SQL migration file via DATABASE_URL (preferred) or print instructions.
 * Usage: node scripts/apply-migration.mjs [filename]
 * Default: 025_ops_harden_rls_and_inbox.sql
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const fileName = process.argv[2] ?? "025_ops_harden_rls_and_inbox.sql";
const sqlPath = join(root, "supabase/migrations", fileName);

function loadEnv() {
  const path = resolve(root, ".env.local");
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, "utf8");
  return Object.fromEntries(
    raw
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      })
  );
}

const env = { ...loadEnv(), ...process.env };
const sql = readFileSync(sqlPath, "utf8");
const databaseUrl = env.DATABASE_URL;

if (!databaseUrl) {
  console.log(`No DATABASE_URL in .env.local — cannot apply automatically.`);
  console.log(`Open Supabase Dashboard → SQL Editor and run:\n  supabase/migrations/${fileName}`);
  console.log(`Or add DATABASE_URL (pooler connection string) and re-run:`);
  console.log(`  node scripts/apply-migration.mjs ${fileName}`);
  process.exit(1);
}

const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
try {
  await client.query(sql);
  console.log(`Applied ${fileName}`);
} finally {
  await client.end();
}
