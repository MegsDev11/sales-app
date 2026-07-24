/**
 * Probe live Supabase schema vs expected tables/columns from migrations.
 * Usage: node scripts/audit-schema.mjs
 * Requires .env.local with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 */
import { readFileSync, readdirSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnv() {
  const raw = readFileSync(resolve(root, ".env.local"), "utf8");
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

function expectedFromMigrations() {
  const dir = join(root, "supabase/migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const cols = {};
  const ensure = (t) => {
    if (!cols[t]) cols[t] = new Set();
    return cols[t];
  };

  for (const f of files) {
    const sql = readFileSync(join(dir, f), "utf8");
    for (const m of sql.matchAll(/create table if not exists public\.(\w+)\s*\(([\s\S]*?)\);/gi)) {
      const table = m[1];
      for (const line of m[2].split("\n")) {
        const col = line.trim().match(/^([a-z_][a-z0-9_]*)\s+/i);
        if (
          col &&
          !["constraint", "primary", "unique", "check", "foreign"].includes(col[1].toLowerCase())
        ) {
          ensure(table).add(col[1]);
        }
      }
    }
    for (const m of sql.matchAll(
      /alter table public\.(\w+)[\s\S]*?;/gi
    )) {
      const table = m[1];
      for (const a of m[0].matchAll(/add column if not exists ([a-z_][a-z0-9_]*)/gi)) {
        ensure(table).add(a[1]);
      }
    }
  }
  return { files, cols };
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  Accept: "application/openapi+json",
};

const { files, cols: expected } = expectedFromMigrations();
const openapi = await (await fetch(`${url}/rest/v1/`, { headers })).json();
const defs = openapi.definitions || {};

let missing = 0;
const report = [];

for (const [table, set] of Object.entries(expected)) {
  const live = defs[table]?.properties ? Object.keys(defs[table].properties) : null;
  if (!live) {
    report.push(`MISSING TABLE  ${table}`);
    missing++;
    continue;
  }
  for (const c of [...set].sort()) {
    // Ignore false positives from multi-table alter blocks (e.g. tower_id on wrong table)
    if (table === "team_members" && c === "tower_id") continue;
    if (!live.includes(c)) {
      report.push(`MISSING COLUMN ${table}.${c}`);
      missing++;
    }
  }
}

console.log(`Migrations scanned: ${files.length} (${files[0]} … ${files[files.length - 1]})`);
console.log(`OpenAPI tables: ${Object.keys(defs).length}`);
if (report.length === 0) {
  console.log("OK — all expected tables/columns present");
  process.exit(0);
}
console.log(`\nGaps (${missing}):`);
for (const line of report) console.log(`  ${line}`);
process.exit(missing > 0 ? 2 : 0);
