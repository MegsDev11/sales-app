/**
 * One-time: run auth migration + bootstrap admin from .env.local
 * Usage: node scripts/bootstrap-admin.mjs
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env.local");

for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME?.trim() || "Herman Booysen";

async function runAuthMigration() {
  const sql = readFileSync(
    resolve(__dirname, "../supabase/migrations/002_auth.sql"),
    "utf8"
  );

  if (process.env.DATABASE_URL) {
    const client = new pg.Client({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    await client.connect();
    await client.query(sql);
    await client.end();
    console.log("Auth migration applied via DATABASE_URL");
    return;
  }

  const probe = createClient(url, serviceKey);
  const { error } = await probe.from("team_members").select("email").limit(1);
  if (!error) {
    console.log("Auth columns already present");
    return;
  }
  if (error.message.includes("email")) {
    throw new Error(
      "Missing email column. Run supabase/migrations/002_auth.sql in Supabase SQL Editor, or set DATABASE_URL."
    );
  }
  throw error;
}

async function bootstrap() {
  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: existingAdmin } = await supabase
    .from("team_members")
    .select("id")
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();

  if (existingAdmin) {
    console.log("Admin already exists:", existingAdmin.id);
    return;
  }

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError) throw authError;
  if (!authData.user) throw new Error("No auth user returned");

  const row = {
    id: authData.user.id,
    name,
    email,
    auth_user_id: authData.user.id,
    role: "admin",
    color: "#C83733",
    avatar_initials: "HB",
    title: "Sales Manager",
    monthly_revenue_target: 500000,
    monthly_deals_target: 20,
  };

  const { error: insertError } = await supabase.from("team_members").insert(row);
  if (insertError) {
    await supabase.auth.admin.deleteUser(authData.user.id);
    throw insertError;
  }

  console.log("Admin created:", email);
}

try {
  await runAuthMigration();
  await bootstrap();
} catch (err) {
  console.error("Failed:", err.message ?? err);
  process.exit(1);
}
