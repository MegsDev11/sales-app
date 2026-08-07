import type {
  ProjectBlock,
  ProjectBlockStage,
  ProjectDeliverySummary,
  ProjectIssue,
  ProjectMilestone,
  ProjectResource,
  ProjectStage,
  WorkStatus,
} from "@/lib/projects/constants";

/**
 * Where a project's completion percentage and its revised date come from.
 *
 * Nothing here is stored. The fibre sheet derived both from COUNTIFS over the grid
 * rather than keeping a typed-in figure, and that is the property worth preserving:
 * a percentage nobody can type is a percentage nobody can flatter. Tick the cells and
 * the number follows; it cannot say 80% while half the grid is empty.
 *
 * These are pure functions so the API can roll up the whole portfolio server-side
 * with exactly the arithmetic the project page shows.
 */

/** A day in milliseconds. */
const DAY = 86_400_000;

/**
 * Complete over everything that could be complete.
 *
 * `na` is excluded from the denominator rather than counted as incomplete. A block
 * with no trees to cut is not 0% cut, it is out of scope, and counting it the other
 * way would cap the tree-cutting column below 100% forever.
 *
 * Returns null when there is nothing to measure, which is different from 0% and has
 * to stay different — an empty grid must not drag the project average down.
 */
export function ratio(statuses: WorkStatus[]): number | null {
  let done = 0;
  let counted = 0;
  for (const s of statuses) {
    if (s === "na") continue;
    counted += 1;
    if (s === "complete") done += 1;
  }
  return counted === 0 ? null : done / counted;
}

/** Mean of the values that exist, ignoring the ones that do not. */
function meanOf(values: (number | null)[]): number | null {
  const real = values.filter((v): v is number => v !== null);
  if (real.length === 0) return null;
  return real.reduce((sum, v) => sum + v, 0) / real.length;
}

/** Cells indexed by `${block_id}:${stage_id}` for O(1) grid lookup. */
export function indexCells(cells: ProjectBlockStage[]): Map<string, ProjectBlockStage> {
  const map = new Map<string, ProjectBlockStage>();
  for (const c of cells) map.set(`${c.block_id}:${c.stage_id}`, c);
  return map;
}

/**
 * A cell that has never been touched reads as not_started rather than absent.
 *
 * The grid is conceptually full the moment a block and a stage both exist; rows are
 * only written when someone moves one. Treating the gap as not_started is what makes
 * "add 31 blocks" cheap instead of 250 inserts.
 */
export function cellStatus(
  index: Map<string, ProjectBlockStage>,
  blockId: string,
  stageId: string
): WorkStatus {
  return index.get(`${blockId}:${stageId}`)?.status ?? "not_started";
}

/** Per-stage completion — one figure per column of the grid. */
export function stageProgress(
  stages: ProjectStage[],
  blocks: ProjectBlock[],
  cells: ProjectBlockStage[]
): { stage: ProjectStage; percent: number | null }[] {
  const index = indexCells(cells);
  return stages.map((stage) => ({
    stage,
    percent: ratio(blocks.map((b) => cellStatus(index, b.id, stage.id))),
  }));
}

/** A block is done when every stage that applies to it is complete. */
export function blockIsComplete(
  index: Map<string, ProjectBlockStage>,
  block: ProjectBlock,
  stages: ProjectStage[]
): boolean {
  const relevant = stages
    .map((s) => cellStatus(index, block.id, s.id))
    .filter((s) => s !== "na");
  return relevant.length > 0 && relevant.every((s) => s === "complete");
}

export function milestoneProgress(milestones: ProjectMilestone[]): number | null {
  return ratio(milestones.map((m) => m.status));
}

/**
 * Plant readiness, counting both questions.
 *
 * "Acquired" and "in working order" are averaged together exactly as the sheet did,
 * because a trencher that is allocated but broken is genuinely half of what the job
 * needs — the team can plan around it, they just cannot dig with it.
 */
export function resourceProgress(resources: ProjectResource[]): number | null {
  return ratio(resources.flatMap((r) => [r.acquired, r.working_order]));
}

/**
 * The headline percentage: an equal-weighted mean of every workstream.
 *
 * Equal weighting is the sheet's choice and it is defensible — the milestone strip,
 * the plant register and each stage of the grid are all things that have to reach
 * 100% before the project is finished, and none of them is optional. It does mean a
 * 400-unit stage counts the same as a 12-unit one; weighting by units instead would
 * make the number smoother and less honest about what is outstanding.
 *
 * Stages flagged `counts_to_progress = false` (CAC, tree cutting) are tracked on the
 * grid but stay out of this figure, which is how the sheet handled them.
 */
export function overallProgress(
  stages: ProjectStage[],
  blocks: ProjectBlock[],
  cells: ProjectBlockStage[],
  milestones: ProjectMilestone[],
  resources: ProjectResource[]
): number | null {
  const counting = stages.filter((s) => s.counts_to_progress);
  return meanOf([
    milestoneProgress(milestones),
    resourceProgress(resources),
    ...stageProgress(counting, blocks, cells).map((s) => s.percent),
  ]);
}

/** Mean of the grid columns alone — "how far through the physical build are we". */
export function distributionProgress(
  stages: ProjectStage[],
  blocks: ProjectBlock[],
  cells: ProjectBlockStage[]
): number | null {
  return meanOf(
    stageProgress(
      stages.filter((s) => s.counts_to_progress),
      blocks,
      cells
    ).map((s) => s.percent)
  );
}

/**
 * How long an issue has been holding the job up, in days.
 *
 * An unresolved issue is measured against now, so the figure grows while nobody
 * fixes it — which is the behaviour that made the sheet's live clock useful. Pass
 * `now` explicitly so a server roll-up and the page agree on the instant.
 */
export function issueOpenDays(issue: ProjectIssue, now: number): number {
  const start = Date.parse(issue.logged_at);
  if (Number.isNaN(start)) return 0;
  const end = issue.resolved_at ? Date.parse(issue.resolved_at) : now;
  if (Number.isNaN(end)) return 0;
  return Math.max(0, (end - start) / DAY);
}

/**
 * Total days lost: the straight sum of every issue's open time.
 *
 * Overlapping issues are counted twice, deliberately — this mirrors the sheet, and
 * the figure it produces is "days of disruption suffered", not "calendar days the
 * project stood still". Two things broken in the same week is worse than one, and
 * the number should say so. It is also what the revised date has always been built
 * from, so changing it here would silently move every date the team knows.
 */
export function totalDelayDays(issues: ProjectIssue[], now: number): number {
  return issues.reduce((sum, i) => sum + issueOpenDays(i, now), 0);
}

/** Issues per type, for the portfolio's "major issues" columns. */
export function issueCountsByType(issues: ProjectIssue[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const i of issues) {
    counts[i.issue_type] = (counts[i.issue_type] ?? 0) + 1;
  }
  return counts;
}

/**
 * The estimate plus the delay — the date the sheet actually planned against.
 *
 * Returns YYYY-MM-DD, and reads the target as UTC midnight so the result does not
 * wander by a day depending on where the browser thinks it is.
 */
export function revisedTargetDate(
  targetDate: string | null,
  delayDays: number
): string | null {
  if (!targetDate) return null;
  const base = Date.parse(`${targetDate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(base)) return null;
  return new Date(base + Math.round(delayDays) * DAY).toISOString().slice(0, 10);
}

/** Everything the portfolio table needs about one project, in one pass. */
export function summarise(
  projectId: string,
  targetDate: string | null,
  delivery: {
    stages: ProjectStage[];
    blocks: ProjectBlock[];
    cells: ProjectBlockStage[];
    milestones: ProjectMilestone[];
    resources: ProjectResource[];
    issues: ProjectIssue[];
  },
  now: number
): ProjectDeliverySummary {
  const { stages, blocks, cells, milestones, resources, issues } = delivery;
  const index = indexCells(cells);
  const delay = totalDelayDays(issues, now);

  return {
    project_id: projectId,
    percent_complete: overallProgress(stages, blocks, cells, milestones, resources),
    delay_days: delay,
    open_issues: issues.filter((i) => !i.resolved_at).length,
    total_issues: issues.length,
    revised_target_date: revisedTargetDate(targetDate, delay),
    blocks_total: blocks.length,
    blocks_done: blocks.filter((b) => blockIsComplete(index, b, stages)).length,
    units_total: blocks.reduce((sum, b) => sum + (b.units ?? 0), 0),
    issue_counts: issueCountsByType(issues),
  };
}

/** 0.8429 -> "84%". Null reads as an em dash, never as 0%. */
export function percentLabel(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

/** 152.9031676 -> "153 days". Sub-day delays keep their hours. */
export function delayLabel(days: number): string {
  if (days <= 0) return "On time";
  if (days < 1) return `${Math.round(days * 24)}h`;
  const whole = Math.round(days);
  return `${whole} day${whole === 1 ? "" : "s"}`;
}
