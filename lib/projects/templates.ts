import type { WorkStatus } from "@/lib/projects/constants";

/**
 * Delivery templates — the two shapes of job this business actually runs.
 *
 * Taken from the fibre project sheet. A new build and a maintenance sweep are run
 * the same WAY (a grid of blocks against a run of stages) but with entirely different
 * stages, so the choice is made once when the plan is set up and everything after
 * that is identical.
 *
 * Spelling is normalised against the sheet ("Tensioning", "Allocated"); the terms are
 * otherwise left exactly as the teams say them, because a stage nobody recognises is
 * a stage nobody updates.
 */

export interface StageTemplate {
  name: string;
  /**
   * Whether the stage feeds the completion percentage.
   *
   * Tree cutting and CAC are tracked but excluded, matching the sheet: tree cutting
   * only applies to some blocks, and CAC is a customer-acceptance step that trails
   * the build and would otherwise hold every project short of 100% indefinitely.
   */
  countsToProgress?: boolean;
}

export interface DeliveryTemplate {
  key: string;
  label: string;
  description: string;
  /** What a row of the grid is called here. */
  blockNoun: string;
  blockNounPlural: string;
  stages: StageTemplate[];
  milestones: string[];
  resources: string[];
}

export const DELIVERY_TEMPLATES: DeliveryTemplate[] = [
  {
    key: "network_build",
    label: "Fibre network build",
    description:
      "A new network cut into phases — plan, trench, string, splice, test, patch, hand over.",
    blockNoun: "Phase",
    blockNounPlural: "Phases",
    stages: [
      { name: "Tree cutting", countsToProgress: false },
      { name: "Planning" },
      { name: "Poles / Trenching" },
      { name: "Stringing / installing" },
      { name: "Splicing" },
      { name: "Testing" },
      { name: "Patching" },
      { name: "CAC", countsToProgress: false },
    ],
    milestones: [
      "Quote accepted",
      "Stock ordered",
      "Main uplinks",
      "Feeder",
      "Distribution",
      "Unit installs",
      "Megs config",
    ],
    resources: ["Allocated bakkie", "Trencher", "Running fuel", "Basic tools"],
  },
  {
    key: "network_maintenance",
    label: "Network cleanup / maintenance",
    description:
      "An existing network swept block by block — foliage, slack, tensioning, hardware.",
    blockNoun: "Block",
    blockNounPlural: "Blocks",
    stages: [
      { name: "Planning", countsToProgress: false },
      { name: "Clearing foliage around electrical cables" },
      { name: "Clearing foliage around fibre cables" },
      { name: "Slack management on enclosures" },
      { name: "Clearing around Megs poles" },
      { name: "Tensioning ADSS cables" },
      { name: "Tensioning drop cables" },
      { name: "Inspect banded straps and hooks" },
      { name: "CAC", countsToProgress: false },
    ],
    milestones: [
      "Clearing foliage around electrical cables",
      "Clearing foliage around fibre cables",
      "Slack management on enclosures",
      "Clearing around Megs poles",
      "Tensioning ADSS cables",
      "Tensioning drop cables",
      "Inspect banded straps and hooks",
    ],
    resources: ["Allocated bakkie", "Cherry picker", "Chainsaw", "Running fuel"],
  },
  {
    key: "client_install",
    label: "Client site install",
    description:
      "A single site or building — survey, install, splice, test, sign off.",
    blockNoun: "Area",
    blockNounPlural: "Areas",
    stages: [
      { name: "Site survey" },
      { name: "Planning" },
      { name: "Cable run" },
      { name: "Installing" },
      { name: "Splicing" },
      { name: "Testing" },
      { name: "Handover", countsToProgress: false },
    ],
    milestones: ["Quote accepted", "Stock ordered", "Install complete", "Client signed off"],
    resources: ["Allocated bakkie", "Basic tools", "Running fuel"],
  },
];

export function templateByKey(key: string | null | undefined): DeliveryTemplate | null {
  if (!key) return null;
  return DELIVERY_TEMPLATES.find((t) => t.key === key) ?? null;
}

/**
 * What to call the rows of this project's grid.
 *
 * The rows themselves are the best evidence: a project whose blocks are named
 * "Phase 1…7" should say Phases whatever template seeded it, and imported projects
 * routinely mix the two — the same fibre workbook has "Block 1…31" on a cleanup and
 * "Phase 1…7" on a build, both running build stages. The template is only the
 * fallback for a plan with no rows yet.
 */
export function blockNoun(
  templateKey: string | null | undefined,
  blocks?: { name: string }[]
): { one: string; many: string } {
  const first = blocks?.[0]?.name?.trim();
  if (first) {
    // "Phase 12" -> "Phase". A name with no trailing number ("North wing") tells us
    // nothing generalisable, so it falls through to the template.
    const prefix = first.replace(/[\s_-]*\d+\s*$/, "").trim();
    if (prefix && prefix !== first) {
      return { one: prefix, many: `${prefix}s` };
    }
  }
  const t = templateByKey(templateKey);
  return { one: t?.blockNoun ?? "Block", many: t?.blockNounPlural ?? "Blocks" };
}

/** Sensible starting state for a freshly seeded plan. */
export const SEED_STATUS: WorkStatus = "not_started";
