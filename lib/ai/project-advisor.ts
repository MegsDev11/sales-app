import type { SupabaseClient } from "@supabase/supabase-js";
import { issueOpenDays, totalDelayDays } from "@/lib/projects/progress";
import type { ProjectIssue } from "@/lib/projects/constants";

/**
 * The project advisor: what the model is shown, and what it is asked for.
 *
 * The whole value of this feature is that the advice is argued from THIS company's
 * record rather than from what a language model knows about fibre projects in general.
 * Generic advice is a search away and does not know that the cherry picker cost 22 days
 * last year; this does, because the delay log says so.
 *
 * So the model gets no free rein. It is handed a brief built entirely from these
 * tables — finished projects and how late they ran, every logged issue grouped by what
 * caused it, quoted-versus-actual cost on jobs that closed, and the real spread of unit
 * prices paid to different suppliers for the same item — and it is told, in the system
 * prompt, that a claim it cannot tie back to one of those figures does not belong in
 * the answer.
 *
 * Nothing here trains anything. What improves with each finished project is the size of
 * the brief, which is the honest version of "it learns from every project".
 */

// ---------------------------------------------------------------------------
// The evidence
// ---------------------------------------------------------------------------

export interface DelayCause {
  cause: string;
  occurrences: number;
  totalDays: number;
  /** The worst single instance, so the model can cite a concrete example. */
  worst: { project: string; days: number; description: string } | null;
}

export interface PastProject {
  name: string;
  type: string;
  status: string;
  startDate: string | null;
  targetDate: string | null;
  revisedDate: string | null;
  daysLost: number;
  blocks: number;
  units: number;
  quoteAmount: number | null;
  stockCost: number;
  labourCost: number;
  totalCost: number;
}

export interface PriceSpread {
  item: string;
  /** Cheapest and dearest unit price actually paid, and who charged them. */
  low: { price: number; supplier: string };
  high: { price: number; supplier: string };
  timesBought: number;
  /** What buying every past unit at the low price would have saved. */
  potentialSaving: number;
}

export interface PlantTrouble {
  name: string;
  projectsUsedOn: number;
  timesNotWorking: number;
}

export interface Evidence {
  projectCount: number;
  finishedCount: number;
  issueCount: number;
  supplierCount: number;
  purchaseLineCount: number;
  totalDaysLost: number;
  delayCauses: DelayCause[];
  pastProjects: PastProject[];
  priceSpreads: PriceSpread[];
  plantTrouble: PlantTrouble[];
  /** Stage names in use, so suggestions match the vocabulary the crews already say. */
  knownStages: string[];
}

/** Rows we read but do not model precisely — the shapes are local to this file. */
type Row = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Read the company's track record.
 *
 * Deliberately one pass over everything rather than a query per project: the corpus is
 * small (tens of projects, hundreds of issues) and the alternative is an N+1 that grows
 * with success. Everything is aggregated here so the model receives figures rather than
 * raw rows — a delay log of 400 issues would crowd out the reasoning it is meant to
 * fund.
 */
export async function gatherEvidence(
  db: SupabaseClient,
  excludeProjectId: string,
  now: number
): Promise<Evidence> {
  const [projects, issues, blocks, stages, costs, resources, poLines, pos, suppliers] =
    await Promise.all([
      db.from("projects").select("id, name, type, status, start_date, target_date, quote_amount"),
      db.from("project_issues").select("project_id, issue_type, description, logged_at, resolved_at"),
      db.from("project_blocks").select("project_id, units"),
      db.from("project_stages").select("name"),
      db.from("project_costs").select("project_id, amount, category"),
      db.from("project_resources").select("project_id, name, acquired, working_order"),
      db.from("purchase_order_lines").select("po_id, product_id, description, qty_ordered, unit_price"),
      db.from("purchase_orders").select("id, supplier_id, status"),
      db.from("suppliers").select("id, name"),
    ]);

  const projectRows = (projects.data ?? []) as Row[];
  const issueRows = (issues.data ?? []) as Row[];
  const byId = new Map(projectRows.map((p) => [str(p.id), p]));

  // ---- delay causes -------------------------------------------------------
  const causes = new Map<string, DelayCause>();
  for (const row of issueRows) {
    const issue = {
      logged_at: str(row.logged_at),
      resolved_at: (row.resolved_at as string | null) ?? null,
    } as ProjectIssue;
    const days = issueOpenDays(issue, now);
    const cause = str(row.issue_type) || "Other";
    const existing = causes.get(cause) ?? {
      cause,
      occurrences: 0,
      totalDays: 0,
      worst: null,
    };
    existing.occurrences += 1;
    existing.totalDays += days;
    if (!existing.worst || days > existing.worst.days) {
      existing.worst = {
        project: str(byId.get(str(row.project_id))?.name) || "a project",
        days: Math.round(days),
        description: str(row.description).slice(0, 200),
      };
    }
    causes.set(cause, existing);
  }

  // ---- per-project outcomes ----------------------------------------------
  const issuesByProject = new Map<string, ProjectIssue[]>();
  for (const row of issueRows) {
    const key = str(row.project_id);
    if (!issuesByProject.has(key)) issuesByProject.set(key, []);
    issuesByProject.get(key)!.push({
      logged_at: str(row.logged_at),
      resolved_at: (row.resolved_at as string | null) ?? null,
    } as ProjectIssue);
  }

  const blocksByProject = new Map<string, { count: number; units: number }>();
  for (const row of (blocks.data ?? []) as Row[]) {
    const key = str(row.project_id);
    const entry = blocksByProject.get(key) ?? { count: 0, units: 0 };
    entry.count += 1;
    entry.units += num(row.units);
    blocksByProject.set(key, entry);
  }

  const costByProject = new Map<string, { stock: number; labour: number; total: number }>();
  for (const row of (costs.data ?? []) as Row[]) {
    const key = str(row.project_id);
    const entry = costByProject.get(key) ?? { stock: 0, labour: 0, total: 0 };
    const amount = num(row.amount);
    entry.total += amount;
    if (str(row.category) === "stock") entry.stock += amount;
    if (str(row.category) === "labour") entry.labour += amount;
    costByProject.set(key, entry);
  }

  const pastProjects: PastProject[] = projectRows
    .filter((p) => str(p.id) !== excludeProjectId)
    .map((p) => {
      const id = str(p.id);
      const projectIssues = issuesByProject.get(id) ?? [];
      const daysLost = totalDelayDays(projectIssues, now);
      const b = blocksByProject.get(id) ?? { count: 0, units: 0 };
      const c = costByProject.get(id) ?? { stock: 0, labour: 0, total: 0 };
      const target = (p.target_date as string | null) ?? null;
      return {
        name: str(p.name),
        type: str(p.type),
        status: str(p.status),
        startDate: (p.start_date as string | null) ?? null,
        targetDate: target,
        revisedDate:
          target && daysLost >= 1
            ? new Date(
                Date.parse(`${target}T00:00:00Z`) + Math.round(daysLost) * 86_400_000
              )
                .toISOString()
                .slice(0, 10)
            : target,
        daysLost: Math.round(daysLost),
        blocks: b.count,
        units: b.units,
        quoteAmount: p.quote_amount == null ? null : num(p.quote_amount),
        stockCost: c.stock,
        labourCost: c.labour,
        totalCost: c.total,
      };
    })
    // Jobs that actually ran teach something; empty placeholders do not.
    .filter((p) => p.blocks > 0 || p.daysLost > 0 || p.totalCost > 0)
    .sort((a, b) => b.daysLost - a.daysLost);

  // ---- what was really paid, per item, per supplier ------------------------
  //
  // The one place the advisor can say something about price that is neither a guess
  // nor a quote: two POs for the same item at different unit prices is a fact, and
  // the gap between them is money that was available and not taken.
  const supplierNames = new Map(
    ((suppliers.data ?? []) as Row[]).map((s) => [str(s.id), str(s.name)])
  );
  const poSupplier = new Map(
    ((pos.data ?? []) as Row[])
      // Draft and cancelled orders were never really priced.
      .filter((p) => !["draft", "cancelled"].includes(str(p.status)))
      .map((p) => [str(p.id), str(p.supplier_id)])
  );

  const byItem = new Map<
    string,
    { prices: { price: number; supplier: string; qty: number }[] }
  >();
  for (const line of (poLines.data ?? []) as Row[]) {
    const supplierId = poSupplier.get(str(line.po_id));
    if (!supplierId) continue;
    const price = num(line.unit_price);
    if (price <= 0) continue;
    // product_id groups the same catalogue item across suppliers; description is the
    // fallback for sundries and free-text lines.
    const key = str(line.product_id) || str(line.description).toLowerCase().trim();
    if (!key) continue;
    const entry = byItem.get(key) ?? { prices: [] };
    entry.prices.push({
      price,
      supplier: supplierNames.get(supplierId) ?? "unknown supplier",
      qty: num(line.qty_ordered) || 1,
    });
    byItem.set(key, entry);
  }

  const priceSpreads: PriceSpread[] = [];
  for (const [, entry] of byItem) {
    if (entry.prices.length < 2) continue;
    const sorted = [...entry.prices].sort((a, b) => a.price - b.price);
    const low = sorted[0];
    const high = sorted[sorted.length - 1];
    if (low.supplier === high.supplier || high.price <= low.price) continue;
    const totalQty = entry.prices.reduce((s, p) => s + p.qty, 0);
    const spent = entry.prices.reduce((s, p) => s + p.price * p.qty, 0);
    priceSpreads.push({
      // The dearest line's own wording is the most recognisable label available.
      item: (
        ((poLines.data ?? []) as Row[]).find(
          (l) => num(l.unit_price) === high.price
        )?.description as string | undefined
      )?.slice(0, 80) ?? "an item",
      low: { price: low.price, supplier: low.supplier },
      high: { price: high.price, supplier: high.supplier },
      timesBought: entry.prices.length,
      potentialSaving: Math.max(0, spent - low.price * totalQty),
    });
  }
  priceSpreads.sort((a, b) => b.potentialSaving - a.potentialSaving);

  // ---- plant that keeps breaking -----------------------------------------
  //
  // Two things this has to get right, both learned from the imported data.
  //
  // Grouping is by normalised name: the sheet says "Alocated Bakkie" and the template
  // says "Allocated bakkie", and counted separately they read as two vehicles that each
  // failed occasionally rather than one that fails half the time. The first spelling
  // seen is kept for display, since it is what the crews actually type.
  //
  // And "not in working order" means the thing was ACQUIRED and did not work. A row
  // still sitting at not-started means nobody has answered the question — counting that
  // as a breakdown turns every untouched template row into evidence, which is how a
  // register of six blank "Category" rows ends up looking like a fleet in pieces.
  const plant = new Map<string, PlantTrouble>();
  for (const row of (resources.data ?? []) as Row[]) {
    const name = str(row.name).trim();
    if (!name || name.toLowerCase() === "n/a") continue;
    const key = name.toLowerCase().replace(/\s+/g, " ");
    const entry = plant.get(key) ?? { name, projectsUsedOn: 0, timesNotWorking: 0 };
    entry.projectsUsedOn += 1;
    if (str(row.acquired) === "complete" && str(row.working_order) !== "complete") {
      entry.timesNotWorking += 1;
    }
    plant.set(key, entry);
  }

  return {
    projectCount: projectRows.length,
    finishedCount: projectRows.filter((p) => str(p.status) === "completed").length,
    issueCount: issueRows.length,
    supplierCount: supplierNames.size,
    purchaseLineCount: ((poLines.data ?? []) as Row[]).length,
    totalDaysLost: Math.round(
      totalDelayDays(
        issueRows.map(
          (r) =>
            ({
              logged_at: str(r.logged_at),
              resolved_at: (r.resolved_at as string | null) ?? null,
            }) as ProjectIssue
        ),
        now
      )
    ),
    delayCauses: Array.from(causes.values()).sort((a, b) => b.totalDays - a.totalDays),
    pastProjects: pastProjects.slice(0, 25),
    priceSpreads: priceSpreads.slice(0, 15),
    plantTrouble: Array.from(plant.values())
      .filter((p) => p.timesNotWorking > 0)
      .sort((a, b) => b.timesNotWorking - a.timesNotWorking),
    knownStages: Array.from(
      new Set(((stages.data ?? []) as Row[]).map((s) => str(s.name)).filter(Boolean))
    ).slice(0, 40),
  };
}

// ---------------------------------------------------------------------------
// The brief
// ---------------------------------------------------------------------------

const money = (n: number) => `R${Math.round(n).toLocaleString("en-ZA")}`;

/** Render the evidence as the plain-language brief the model reasons over. */
export function renderEvidence(e: Evidence): string {
  const lines: string[] = [];

  lines.push(
    `TRACK RECORD: ${e.projectCount} projects on record, ${e.issueCount} logged issues ` +
      `accounting for ${e.totalDaysLost} days lost, ${e.purchaseLineCount} purchase lines ` +
      `across ${e.supplierCount} suppliers.`
  );

  if (e.delayCauses.length) {
    lines.push("\nWHAT HAS ACTUALLY HELD JOBS UP (worst first):");
    for (const c of e.delayCauses) {
      lines.push(
        `- ${c.cause}: ${c.occurrences} time${c.occurrences === 1 ? "" : "s"}, ` +
          `${Math.round(c.totalDays)} days lost in total.` +
          (c.worst
            ? ` Worst: ${c.worst.days} days on ${c.worst.project}${
                c.worst.description ? ` — "${c.worst.description}"` : ""
              }`
            : "")
      );
    }
  }

  if (e.plantTrouble.length) {
    lines.push("\nPLANT THAT HAS NOT BEEN IN WORKING ORDER:");
    for (const p of e.plantTrouble) {
      lines.push(
        `- ${p.name}: not working on ${p.timesNotWorking} of ${p.projectsUsedOn} projects it was allocated to.`
      );
    }
  }

  if (e.pastProjects.length) {
    lines.push("\nPAST PROJECTS:");
    for (const p of e.pastProjects) {
      const bits = [
        `${p.name} (${p.type}, ${p.status})`,
        p.blocks ? `${p.blocks} blocks${p.units ? `, ${p.units} units` : ""}` : null,
        p.targetDate ? `due ${p.targetDate}` : null,
        p.daysLost >= 1 ? `ran ${p.daysLost} days late (revised ${p.revisedDate})` : "on time",
        p.quoteAmount ? `quoted ${money(p.quoteAmount)}` : null,
        p.stockCost ? `stock ${money(p.stockCost)}` : null,
        p.labourCost ? `teams ${money(p.labourCost)}` : null,
      ].filter(Boolean);
      lines.push(`- ${bits.join(" · ")}`);
    }
  }

  if (e.priceSpreads.length) {
    lines.push("\nSAME ITEM, DIFFERENT PRICE (what was actually paid):");
    for (const s of e.priceSpreads) {
      lines.push(
        `- ${s.item}: ${money(s.low.price)} from ${s.low.supplier} vs ` +
          `${money(s.high.price)} from ${s.high.supplier}, bought ${s.timesBought} times. ` +
          `Buying at the lower price throughout would have saved about ${money(s.potentialSaving)}.`
      );
    }
  }

  if (e.knownStages.length) {
    lines.push(`\nSTAGE NAMES THE CREWS USE: ${e.knownStages.join(", ")}`);
  }

  if (e.pastProjects.length === 0 && e.delayCauses.length === 0) {
    lines.push(
      "\nNOTE: there is no delivery history on record yet. Say so plainly rather than " +
        "inventing precedent — advice here can only be general, and should be labelled as such."
    );
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// The ask
// ---------------------------------------------------------------------------

export const ADVISOR_SYSTEM_PROMPT = `You advise a South African fibre and wireless network company on projects they are considering or running. You are talking to the owner and the project leads — people who have built networks for years. They do not need fibre explained to them.

Your entire value is that you can see their own record and they cannot hold all of it in their head. A point they could have got from a search engine is worth nothing here.

THE RULE THAT MATTERS: every claim you make about their business must trace back to a figure in the brief. When you say a risk is real, name the project and the number of days it cost. When you say they can buy something cheaper, name the two suppliers and the two prices. If the brief does not support a point, either leave it out or mark it clearly as a general observation rather than something their data shows.

Do not invent projects, suppliers, prices, dates or quantities. If the record is thin, say so — "you have only two comparable jobs on record, so treat this as a starting point" is a useful sentence. A confident answer built on nothing is worse than an honest one.

Write the way a good site manager talks: direct, concrete, no hedging, no filler. Money in rands. No preamble, no "great question", no restating the project back to them.

Be specific about what to DO. "Watch the cherry picker" is useless; "book the cherry picker for the 3 weeks of overhead work and get the second pole pruner serviced before you start, because that combination cost 22 days on Fibre Network Cleanup" is advice.`;

/**
 * The response shape.
 *
 * Structured rather than prose because the page renders these as separate sections and
 * because `evidence` being a required field on every item is what stops the model
 * drifting into plausible generalities — it has to name the figure it is standing on,
 * or leave the point out.
 */
export const ADVICE_SCHEMA = {
  type: "object",
  properties: {
    headline: {
      type: "string",
      description:
        "One sentence: the single most useful thing to say about this project. No preamble.",
    },
    verdict: {
      type: "string",
      description:
        "Two or three sentences on whether this looks like a good job to take on and why, based on their record.",
    },
    watchOuts: {
      type: "array",
      description: "Risks this specific project faces, worst first. At most 5.",
      items: {
        type: "object",
        properties: {
          risk: { type: "string", description: "The risk, in one line." },
          evidence: {
            type: "string",
            description:
              "The figure from their own record that supports it — project name, days, cause. Say 'general industry point, not from your data' if there is none.",
          },
          mitigation: { type: "string", description: "What to do about it, concretely." },
        },
        required: ["risk", "evidence", "mitigation"],
        additionalProperties: false,
      },
    },
    sourcing: {
      type: "array",
      description:
        "Stock and buying opportunities drawn from what they actually paid. Empty array if the purchase record does not support any.",
      items: {
        type: "object",
        properties: {
          opportunity: { type: "string" },
          evidence: { type: "string", description: "The suppliers and prices involved." },
          estimatedSaving: {
            type: "string",
            description: "Rough rand figure, or 'unknown' if the data will not support one.",
          },
        },
        required: ["opportunity", "evidence", "estimatedSaving"],
        additionalProperties: false,
      },
    },
    doThis: {
      type: "array",
      description: "Concrete actions to take, in order. At most 6.",
      items: { type: "string" },
    },
    avoidThis: {
      type: "array",
      description: "Specific things not to repeat, drawn from what went wrong before. At most 5.",
      items: { type: "string" },
    },
    improve: {
      type: "array",
      description:
        "Process or record-keeping improvements that would make the next answer better or the next job cheaper. At most 4.",
      items: { type: "string" },
    },
    suggestedPlan: {
      type: "object",
      description: "A starting delivery plan, using stage names the crews already use.",
      properties: {
        template: {
          type: "string",
          enum: ["network_build", "network_maintenance", "client_install", "unknown"],
        },
        blockNoun: { type: "string", description: "Phase or Block." },
        estimatedBlocks: { type: "integer" },
        stages: { type: "array", items: { type: "string" } },
        plant: { type: "array", items: { type: "string" } },
      },
      required: ["template", "blockNoun", "estimatedBlocks", "stages", "plant"],
      additionalProperties: false,
    },
    dataGaps: {
      type: "array",
      description:
        "What was missing from the record that would have made this advice better. At most 4.",
      items: { type: "string" },
    },
  },
  required: [
    "headline",
    "verdict",
    "watchOuts",
    "sourcing",
    "doThis",
    "avoidThis",
    "improve",
    "suggestedPlan",
    "dataGaps",
  ],
  additionalProperties: false,
} as const;

/**
 * Two shapes of answer, discriminated inside the stored payload.
 *
 * The opening question deserves the full structured report — that is where the
 * evidence-per-risk discipline earns its keep. A follow-up ("what about the trencher?")
 * does not; forcing eight sections onto a one-line question produces padding, and
 * padding is how a useful tool becomes one nobody reads. So follow-ups come back as
 * prose and are rendered as prose.
 *
 * The discriminator lives in the jsonb rather than a column because the shape of the
 * advice is a prompt-level decision that will keep being tuned — the same reasoning
 * migration 061 gives for storing the payload as jsonb in the first place.
 */
export type AdvisorAnswer =
  | ({ kind: "report" } & ProjectAdvice)
  | { kind: "reply"; text: string };

/** A stored report, flattened back to text so it can be replayed as conversation. */
export function reportToText(a: ProjectAdvice): string {
  const parts: string[] = [a.headline, a.verdict];
  if (a.watchOuts?.length) {
    parts.push(
      "Watch out for:\n" +
        a.watchOuts.map((w) => `- ${w.risk} (${w.evidence}) → ${w.mitigation}`).join("\n")
    );
  }
  if (a.sourcing?.length) {
    parts.push(
      "Buying cheaper:\n" +
        a.sourcing.map((s) => `- ${s.opportunity} (${s.evidence}, ${s.estimatedSaving})`).join("\n")
    );
  }
  if (a.doThis?.length) parts.push("Do:\n" + a.doThis.map((t) => `- ${t}`).join("\n"));
  if (a.avoidThis?.length) parts.push("Avoid:\n" + a.avoidThis.map((t) => `- ${t}`).join("\n"));
  if (a.improve?.length) parts.push("Improve:\n" + a.improve.map((t) => `- ${t}`).join("\n"));
  return parts.filter(Boolean).join("\n\n");
}

export interface ProjectAdvice {
  headline: string;
  verdict: string;
  watchOuts: { risk: string; evidence: string; mitigation: string }[];
  sourcing: { opportunity: string; evidence: string; estimatedSaving: string }[];
  doThis: string[];
  avoidThis: string[];
  improve: string[];
  suggestedPlan: {
    template: string;
    blockNoun: string;
    estimatedBlocks: number;
    stages: string[];
    plant: string[];
  };
  dataGaps: string[];
}

/** The subject of the advice — the project as it stands today. */
export interface AdvisorSubject {
  name: string;
  description: string;
  type: string;
  status: string;
  startDate: string | null;
  targetDate: string | null;
  budgetAmount: number | null;
  quoteAmount: number | null;
  /** Set once a plan exists, so advice on a running job is not advice on a blank one. */
  stages: string[];
  blocks: number;
  units: number;
  openIssues: string[];
}

export function renderSubject(s: AdvisorSubject, question: string): string {
  const facts = [
    `Name: ${s.name}`,
    s.description ? `Description: ${s.description}` : null,
    `Type: ${s.type}`,
    `Stage in the funnel: ${s.status}`,
    s.startDate ? `Planned start: ${s.startDate}` : "No start date set",
    s.targetDate ? `Target completion: ${s.targetDate}` : "No target date set",
    s.budgetAmount ? `Budget: ${money(s.budgetAmount)}` : null,
    s.quoteAmount ? `Quoted to the client: ${money(s.quoteAmount)}` : null,
    s.blocks
      ? `Plan so far: ${s.blocks} blocks${s.units ? `, ${s.units} units` : ""}, stages: ${s.stages.join(", ")}`
      : "No delivery plan set up yet.",
    s.openIssues.length ? `Currently open issues: ${s.openIssues.join("; ")}` : null,
  ].filter(Boolean);

  return [
    "THE PROJECT IN QUESTION:",
    facts.join("\n"),
    "",
    question.trim()
      ? `THEY ASKED SPECIFICALLY: ${question.trim()}`
      : "They have not asked anything specific — give them your read on this project.",
  ].join("\n");
}
