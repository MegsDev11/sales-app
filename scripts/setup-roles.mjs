/**
 * Applies role migration + bootstraps owner when possible.
 * Usage: node scripts/setup-roles.mjs
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env.local");

for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: deptError } = await supabase.from("team_members").select("department").limit(1);
  if (deptError?.message.includes("department")) {
    console.error("Run supabase/migrations/003_roles_departments.sql in Supabase SQL Editor first.");
    process.exit(1);
  }

  const { data: members } = await supabase.from("team_members").select("id, role, email");
  for (const m of members ?? []) {
    if (m.role === "admin") {
      await supabase.from("team_members").update({ role: "manager", department: "sales" }).eq("id", m.id);
      console.log("Migrated admin to sales manager:", m.email ?? m.id);
    } else if (m.role === "sales") {
      await supabase.from("team_members").update({ role: "staff", department: "sales" }).eq("id", m.id);
      console.log("Migrated sales rep to staff:", m.email ?? m.id);
    }
  }

  const res = await fetch("http://localhost:3000/api/admin/bootstrap", { method: "POST" });
  const body = await res.json();
  console.log("Bootstrap:", res.status, body);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
