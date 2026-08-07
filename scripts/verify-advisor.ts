/**
 * Prints the brief the project advisor would hand Claude, from live data.
 *
 * Run:  npx tsx scripts/verify-advisor.ts [projectId]
 *
 * The brief IS the feature — a model given a good brief writes useful advice and a
 * model given a vague one writes horoscopes. This makes the brief inspectable without
 * spending an API call, which is also how you check that a new data source (a finished
 * project, a batch of POs) actually reached it.
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { gatherEvidence, renderEvidence, renderSubject, type AdvisorSubject } from "../lib/ai/project-advisor";

const __dirname = dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(resolve(__dirname, "../.env.local"), "utf8").split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
) as unknown as SupabaseClient;

async function main() {
  const projectId = process.argv[2] ?? "";
  const now = Date.now();

  const { data: project } = projectId
    ? await db.from("projects").select("*").eq("id", projectId).maybeSingle()
    : await db.from("projects").select("*").limit(1).maybeSingle();

  const evidence = await gatherEvidence(db, (project?.id as string) ?? "", now);

  console.log("=".repeat(78));
  console.log("THE BRIEF CLAUDE WOULD BE GIVEN");
  console.log("=".repeat(78));
  console.log(renderEvidence(evidence));

  if (project) {
    const blocks = await db.from("project_blocks").select("units").eq("project_id", project.id);
    const stages = await db.from("project_stages").select("name").eq("project_id", project.id);
    const rows = (blocks.data ?? []) as { units: number | null }[];
    const subject: AdvisorSubject = {
      name: project.name, description: project.description ?? "", type: project.type,
      status: project.status, startDate: project.start_date, targetDate: project.target_date,
      budgetAmount: project.budget_amount == null ? null : Number(project.budget_amount),
      quoteAmount: project.quote_amount == null ? null : Number(project.quote_amount),
      stages: ((stages.data ?? []) as { name: string }[]).map((s) => s.name),
      blocks: rows.length, units: rows.reduce((s, b) => s + (Number(b.units) || 0), 0),
      openIssues: [],
    };
    console.log("\n" + "=".repeat(78));
    console.log(renderSubject(subject, ""));
  }

  console.log("\n" + "=".repeat(78));
  console.log("CORPUS:", JSON.stringify({
    projects: evidence.projectCount, issues: evidence.issueCount,
    daysLost: evidence.totalDaysLost, causes: evidence.delayCauses.length,
    priceComparisons: evidence.priceSpreads.length, plantTrouble: evidence.plantTrouble.length,
  }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
