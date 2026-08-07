/**
 * Import the fibre project workbook into the Projects module.
 *
 *   npx tsx scripts/import-project-sheet.ts                     # dry run — prints a report, writes nothing
 *   npx tsx scripts/import-project-sheet.ts --apply             # actually import
 *   npx tsx scripts/import-project-sheet.ts --only "Die Oog"    # one project (repeatable)
 *   npx tsx scripts/import-project-sheet.ts --apply --replace    # re-import over projects already imported
 *   npx tsx scripts/import-project-sheet.ts --file "path.xlsx"  # a different workbook
 *   npx tsx scripts/import-project-sheet.ts --map "Rocky=Wesley Horak"   # name the crew (repeatable)
 *
 * DRY RUN IS THE DEFAULT. Read the report before passing --apply; this writes into
 * the live database.
 *
 * ---------------------------------------------------------------------------
 * What the workbook looks like, and why the parser reads headers rather than
 * fixed columns
 * ---------------------------------------------------------------------------
 * Every "Project N" tab shares a skeleton — header block at the top left, milestone
 * strip on rows 19/20, plant register from row 22, the block grid from row 30, the
 * issue log in columns Q:Z — but the COLUMNS INSIDE those regions drift from tab to
 * tab. Column F of the block grid is "Actual End Date" on seven tabs and "Planner" on
 * three. One tab's stages are the cleanup sweep, another's are trenching and ducting,
 * and Rust de Winter's plant register was repurposed into Quote/Stock/Teams/Vehicle
 * columns entirely. Reading by header label survives all of that; reading by column
 * letter would silently file a planner's name as a completion date.
 *
 * Progress and delay are NOT imported — they are recomputed by lib/projects/progress
 * from the cells, milestones, plant and issues, exactly as the sheet recomputed them
 * from COUNTIFS. The report prints the sheet's own figure beside the app's so any
 * difference is visible before anything is written.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import ExcelJS from "exceljs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  overallProgress,
  totalDelayDays,
  percentLabel,
  delayLabel,
  revisedTargetDate,
} from "../lib/projects/progress";
import { canonicalIssueType, type WorkStatus } from "../lib/projects/constants";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

for (const line of readFileSync(resolve(__dirname, "../.env.local"), "utf8").split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const opt = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const opts = (name: string) =>
  argv.reduce<string[]>((acc, a, i) => (a === `--${name}` ? [...acc, argv[i + 1]] : acc), []);

const APPLY = flag("apply");
const REPLACE = flag("replace");
const ONLY = opts("only").filter(Boolean).map((s) => s.toLowerCase());

/**
 * Hand-supplied "sheet name = staff name" pairs.
 *
 * The workbook records who ran a job as a nickname — Rocky, Andrey, "Bruce & Team" —
 * and guessing which staff member that is would quietly hand somebody else's project
 * to the wrong person. The matcher below refuses ambiguous cases on purpose; this is
 * how you tell it the answer without editing anything.
 */
const OWNER_MAP = new Map<string, string>(
  opts("map")
    .filter(Boolean)
    .map((pair): [string, string] => {
      const [from, to] = pair.split("=");
      return [from?.trim().toLowerCase() ?? "", to?.trim().toLowerCase() ?? ""];
    })
    .filter(([from, to]) => Boolean(from) && Boolean(to))
);
const FILE =
  opt("file") ?? "C:/Users/User/Desktop/Main Fibre Project management sheet.xlsx";

// ---------------------------------------------------------------------------
// Cell reading
// ---------------------------------------------------------------------------

type Cell = ExcelJS.Cell;

/**
 * The underlying value, whatever wrapper ExcelJS put around it.
 *
 * Formula cells arrive as `{formula, result}` and hyperlinks as `{text, hyperlink}`.
 * The issue log is entirely formula-driven (its timestamps are `IF(...NOW()...)`),
 * so without unwrapping, every delay in the workbook would import as zero.
 */
function raw(cell: Cell): unknown {
  const v = cell?.value as unknown;
  if (v && typeof v === "object") {
    if ("result" in (v as Record<string, unknown>)) return (v as { result: unknown }).result;
    if ("hyperlink" in (v as Record<string, unknown>)) {
      return (v as { hyperlink: string }).hyperlink;
    }
    if ("text" in (v as Record<string, unknown>)) return (v as { text: string }).text;
    if ("richText" in (v as Record<string, unknown>)) {
      return (v as { richText: { text: string }[] }).richText.map((r) => r.text).join("");
    }
  }
  return v;
}

function text(cell: Cell): string {
  const v = raw(cell);
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  // A shared formula with no cached result unwraps to an object with nothing usable
  // in it. Stringifying that yields "[object Object]", which then reads as a real
  // value — the issue-log formulas are filled down entire columns, so this would
  // invent a stage named "[object Object]" on every tab.
  if (typeof v === "object") return "";
  return String(v).trim();
}

/** Nothing here, as far as the sheet is concerned. */
function isBlank(cell: Cell): boolean {
  return text(cell) === "";
}

/**
 * True unless this is a continuation cell of a merged range.
 *
 * The milestone strip is built from merged pairs (B:C, D:E, …) and ExcelJS reports
 * the master's value on every cell of the range, where openpyxl reports it once.
 * Without this every milestone is counted twice — and since the last one is usually
 * unmerged, the double-counting also skews the completion percentage rather than
 * merely inflating a total.
 */
function isMaster(cell: Cell): boolean {
  return !cell.isMerged || cell.master?.address === cell.address;
}

/** "N/A" and "-" are how the sheet writes "nothing here". Both mean null. */
function meaningful(value: string): string | null {
  const t = value.trim();
  if (!t) return null;
  if (/^(n\/?a|-|–|none)$/i.test(t)) return null;
  return t;
}

/**
 * Dates arrive either as real Excel dates or as text the user typed.
 *
 * Typed dates are day-first ("28/10/2024"), and reading them month-first would move
 * a project by months without erroring — so the text branch is explicit rather than
 * handed to `new Date()`.
 */
function asDate(cell: Cell): string | null {
  const v = raw(cell);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const t = meaningful(text(cell));
  if (!t) return null;
  const dmy = t.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

/** Timestamps for the issue log keep their time of day. */
function asTimestamp(cell: Cell): string | null {
  const v = raw(cell);
  if (v instanceof Date) return v.toISOString();
  const d = asDate(cell);
  return d ? `${d}T00:00:00.000Z` : null;
}

/** "R 2,337,173.72" -> 2337173.72 */
function asMoney(cell: Cell): number | null {
  const v = raw(cell);
  if (typeof v === "number") return v;
  const t = meaningful(text(cell));
  if (!t) return null;
  const n = Number(t.replace(/[Rr\s,]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function asNumber(cell: Cell): number | null {
  const v = raw(cell);
  if (typeof v === "number") return Math.round(v);
  const t = meaningful(text(cell));
  if (!t) return null;
  const n = Number(t.replace(/[\s,]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** The Data-sheet dropdown, plus the hand-typed "N/A" rows. */
function asStatus(cell: Cell): WorkStatus {
  const t = text(cell).toLowerCase().trim();
  if (t.startsWith("complete")) return "complete";
  if (t.startsWith("in progress")) return "in_progress";
  if (t === "n/a" || t === "na") return "na";
  return "not_started";
}

// ---------------------------------------------------------------------------
// Sheet geometry
// ---------------------------------------------------------------------------

const ROW = {
  header: 2, // project name, allocated to, issue-log headers
  milestoneLabels: 19,
  milestoneStatus: 20,
  resourceHeader: 22,
  resourceFirst: 23,
  resourceLast: 28,
  blockHeader: 30,
  blockFirst: 31,
  docFirst: 8,
  docLast: 16,
  issueFirst: 3,
} as const;

/** Block-grid columns that describe the block itself rather than a stage of work. */
const BLOCK_META = new Set(
  [
    "scope / block",
    "units",
    "start date",
    "end date",
    "actual end date",
    "planner",
    "comment",
  ].map((s) => s)
);

/**
 * Stages the sheet tracked but kept out of its completion figure.
 *
 * Tree cutting only applies to some blocks and CAC is customer acceptance trailing
 * the build, so counting either would hold every project short of 100% for reasons
 * that are not the crew's doing.
 */
function countsToProgress(stageName: string): boolean {
  const n = stageName.toLowerCase();
  return !(n === "cac" || n.includes("tree cutting"));
}

/**
 * What kind of document the sheet's label is describing.
 *
 * The workbook names them consistently enough to read — BOQ, KMZ, Live KMZ, Quote,
 * Preposal, Photo Folders, Layout Plan — and filing them all as "Other" would waste
 * the one piece of structure the labels already carry. Order matters: "Live KMZ"
 * must not be caught by a looser rule first.
 */
function documentKindFor(label: string): string {
  const n = label.toLowerCase();
  if (n.includes("boq")) return "boq";
  if (n.includes("kmz") || n.includes("google earth") || n.includes("visio")) return "kmz";
  if (n.includes("quote")) return "quote";
  if (n.includes("invoice")) return "invoice";
  if (n.includes("prepos") || n.includes("propos")) return "proposal";
  if (n.includes("photo") || n.includes("picture")) return "photo";
  if (n.includes("plan") || n.includes("layout") || n.includes("location")) return "plan";
  return "other";
}

interface ParsedBlock {
  name: string;
  units: number | null;
  startDate: string | null;
  endDate: string | null;
  actualEndDate: string | null;
  plannerName: string | null;
  notes: string;
  statuses: Record<string, WorkStatus>; // stage name -> status
}

interface ParsedProject {
  tab: string;
  name: string;
  allocatedTo: string | null;
  startDate: string | null;
  targetDate: string | null;
  quoteNumber: string | null;
  quoteAmount: number | null;
  stockCost: number | null;
  teamCost: number | null;
  stages: { name: string; countsToProgress: boolean }[];
  blocks: ParsedBlock[];
  milestones: { title: string; status: WorkStatus }[];
  resources: {
    name: string;
    priority: number | null;
    startDate: string | null;
    endDate: string | null;
    acquired: WorkStatus;
    workingOrder: WorkStatus;
    notes: string;
  }[];
  issues: {
    issueType: string;
    description: string;
    loggedAt: string;
    resolvedAt: string | null;
    blockName: string | null;
  }[];
  documents: { label: string; url: string; kind: string }[];
  /** The sheet's own C16, for comparison against what the app works out. */
  sheetPercent: number | null;
  warnings: string[];
}

function parseSheet(ws: ExcelJS.Worksheet): ParsedProject | null {
  const name = meaningful(text(ws.getCell(ROW.header, 5))); // E2
  if (!name) return null;

  const warnings: string[] = [];
  const cell = (r: number, c: number) => ws.getCell(r, c);

  // ---- stages, from the block-grid header ---------------------------------
  //
  // Scanning stops at column O. The issue-log formulas in S and T are filled down
  // every row of the sheet, so a wider scan picks them up as if they were stages.
  const stageCols: { col: number; name: string }[] = [];
  const metaCols: Record<string, number> = {};
  for (let c = 2; c <= 15; c += 1) {
    const label = isMaster(cell(ROW.blockHeader, c))
      ? meaningful(text(cell(ROW.blockHeader, c)))
      : null;
    if (!label) continue;
    const key = label.toLowerCase().replace(/\s+/g, " ").trim();
    if (BLOCK_META.has(key)) {
      metaCols[key] = c;
    } else {
      stageCols.push({ col: c, name: label.replace(/\s+/g, " ").trim() });
    }
  }
  if (stageCols.length === 0) warnings.push("no stage columns found on row 30");

  // ---- blocks -------------------------------------------------------------
  const blocks: ParsedBlock[] = [];
  const seenBlockNames = new Set<string>();
  let placeholders = 0;

  for (let r = ROW.blockFirst; r <= ROW.blockFirst + 400; r += 1) {
    const blockName = meaningful(text(cell(r, metaCols["scope / block"] ?? 2)));
    if (!blockName) {
      // Tolerate a single blank row inside the run; stop at the second.
      const next = meaningful(text(cell(r + 1, metaCols["scope / block"] ?? 2)));
      if (!next) break;
      continue;
    }
    if (seenBlockNames.has(blockName)) {
      warnings.push(`duplicate block "${blockName}" on row ${r} — skipped`);
      continue;
    }

    const startDate = metaCols["start date"] ? asDate(cell(r, metaCols["start date"])) : null;
    const endDate = metaCols["end date"] ? asDate(cell(r, metaCols["end date"])) : null;
    const units = metaCols.units ? asNumber(cell(r, metaCols.units)) : null;
    const actualEndDate = metaCols["actual end date"]
      ? asDate(cell(r, metaCols["actual end date"]))
      : null;
    const plannerName = metaCols.planner ? meaningful(text(cell(r, metaCols.planner))) : null;
    const notes = metaCols.comment ? text(cell(r, metaCols.comment)) : "";

    /**
     * A named row with nothing in it is scaffolding, not a block.
     *
     * Settlers High School carries "Block 5" through "Block 30" as empty rows left
     * over from the template; the sheet's own COUNTIFS ignores them because they are
     * blank, which is how it reports 100% on four finished phases. Importing them as
     * real blocks would take the same project to 28% — the crew would have finished
     * the job and the app would say they were a quarter done.
     *
     * A row that says "Not Started" in so many words is a different thing: somebody
     * laid the plan out, and that is worth keeping.
     */
    const hasStatus = stageCols.some((s) => !isBlank(cell(r, s.col)));
    const hasDetail = Boolean(units || startDate || endDate || actualEndDate || plannerName || notes);
    if (!hasStatus && !hasDetail) {
      placeholders += 1;
      continue;
    }

    seenBlockNames.add(blockName);

    const statuses: Record<string, WorkStatus> = {};
    for (const s of stageCols) statuses[s.name] = asStatus(cell(r, s.col));

    if (startDate && endDate && endDate < startDate) {
      warnings.push(
        `${blockName}: end date ${endDate} is before start ${startDate} — imported as-is`
      );
    }

    blocks.push({
      name: blockName,
      units,
      startDate,
      endDate,
      actualEndDate,
      plannerName,
      notes,
      statuses,
    });
  }
  if (placeholders > 0) {
    warnings.push(`${placeholders} empty template rows below the last real block — not imported`);
  }

  // ---- milestones ---------------------------------------------------------
  //
  // Labels and statuses are paired BY COLUMN. Settlers High School has a stray
  // comment sitting under a milestone slot that has no label; pairing by position
  // would import "Megs installed a cambium as temp uplink…" as a milestone title.
  const milestones: ParsedProject["milestones"] = [];
  for (let c = 2; c <= 15; c += 1) {
    if (!isMaster(cell(ROW.milestoneLabels, c))) continue;
    const title = meaningful(text(cell(ROW.milestoneLabels, c)));
    if (!title || title.toLowerCase() === "comment") continue;
    milestones.push({ title, status: asStatus(cell(ROW.milestoneStatus, c)) });
  }

  // ---- plant register -----------------------------------------------------
  const resourceHeaders: Record<string, number> = {};
  for (let c = 2; c <= 15; c += 1) {
    if (!isMaster(cell(ROW.resourceHeader, c))) continue;
    const label = meaningful(text(cell(ROW.resourceHeader, c)));
    if (label) resourceHeaders[label.toLowerCase().trim()] = c;
  }
  const acquireCol = resourceHeaders["acquire"];
  const workingCol = resourceHeaders["working order"];
  if (!acquireCol) {
    warnings.push(
      "plant register has no Acquire/Working order columns — equipment imported without statuses"
    );
  }

  const resources: ParsedProject["resources"] = [];
  for (let r = ROW.resourceFirst; r <= ROW.resourceLast; r += 1) {
    const rName = meaningful(text(cell(r, resourceHeaders["scope / block"] ?? 2)));
    if (!rName) continue;
    resources.push({
      name: rName,
      priority: asNumber(cell(r, resourceHeaders["priority"] ?? 3)),
      startDate: asDate(cell(r, resourceHeaders["start date"] ?? 4)),
      endDate: asDate(cell(r, resourceHeaders["end date"] ?? 5)),
      acquired: acquireCol ? asStatus(cell(r, acquireCol)) : "not_started",
      workingOrder: workingCol ? asStatus(cell(r, workingCol)) : "not_started",
      notes: text(cell(r, resourceHeaders["comment"] ?? 10)),
    });
  }

  // ---- issue log ----------------------------------------------------------
  //
  // Columns come from row 2's own headers. The day count the sheet reported is
  // `End Date - Start Date`, so those two columns are the ones that matter; the
  // separate time columns only refine a figure already carried by the timestamps.
  // Starts at Q — column O on row 2 holds the "Allocated to" value, not a header.
  const issueCols: Record<string, number> = {};
  for (let c = 17; c <= 30; c += 1) {
    if (!isMaster(cell(ROW.header, c))) continue;
    const label = meaningful(text(cell(ROW.header, c)));
    if (label) issueCols[label.toLowerCase().replace(/"/g, "").trim()] = c;
  }

  const issues: ParsedProject["issues"] = [];
  const cStart = issueCols["start date"];
  const cEnd = issueCols["end date"];
  const cComment = issueCols["comment"];
  const cType = issueCols["issue type"];
  const cResolved = issueCols["issue resolved"];

  if (cStart && cComment) {
    for (let r = ROW.issueFirst; r <= ROW.issueFirst + 200; r += 1) {
      const description = meaningful(text(cell(r, cComment)));
      const loggedAt = asTimestamp(cell(r, cStart));
      if (!description && !loggedAt) continue;
      if (!loggedAt) {
        warnings.push(`issue on row ${r} has no start date — skipped`);
        continue;
      }
      const resolvedFlag = cResolved ? /^y/i.test(text(cell(r, cResolved))) : false;
      const resolvedAt = resolvedFlag && cEnd ? asTimestamp(cell(r, cEnd)) : null;
      // "Act Of God" is stored as "Act of God" so the type is one value everywhere,
      // not two that only Excel's case-blind COUNTIF ever treated as one.
      const typeAsWritten = (cType ? meaningful(text(cell(r, cType))) : null) ?? "Other";
      issues.push({
        issueType: canonicalIssueType(typeAsWritten) ?? typeAsWritten,
        description: description ?? "(no description in the sheet)",
        loggedAt,
        resolvedAt: resolvedAt && resolvedAt > loggedAt ? resolvedAt : null,
        blockName: null,
      });
    }
  }

  // ---- documents ----------------------------------------------------------
  const documents: ParsedProject["documents"] = [];
  for (let r = ROW.docFirst; r <= ROW.docLast; r += 1) {
    const label = meaningful(text(cell(r, 13))); // M
    const url = meaningful(text(cell(r, 15))); // O
    if (!label || !url) continue;
    if (!/^https?:\/\//i.test(url)) {
      warnings.push(`document "${label}" is not an http link — skipped`);
      continue;
    }
    documents.push({ label, url, kind: documentKindFor(label) });
  }

  const sheetPercentRaw = raw(cell(16, 3)); // C16
  const sheetPercent =
    typeof sheetPercentRaw === "number" && Number.isFinite(sheetPercentRaw)
      ? sheetPercentRaw
      : null;

  return {
    tab: ws.name,
    name,
    allocatedTo: meaningful(text(cell(ROW.header, 15))), // O2
    startDate: asDate(cell(4, 3)), // C4
    targetDate: asDate(cell(5, 3)), // C5
    quoteNumber: meaningful(text(cell(4, 6))), // F4
    quoteAmount: asMoney(cell(5, 6)), // F5
    stockCost: asMoney(cell(4, 9)), // I4
    teamCost: asMoney(cell(5, 9)), // I5
    stages: stageCols.map((s) => ({ name: s.name, countsToProgress: countsToProgress(s.name) })),
    blocks,
    milestones,
    resources,
    issues,
    documents,
    sheetPercent,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// What the app will say about a parsed project
// ---------------------------------------------------------------------------

function preview(p: ParsedProject, now: number) {
  const stages = p.stages.map((s, i) => ({
    id: s.name,
    project_id: "",
    name: s.name,
    order_index: i,
    counts_to_progress: s.countsToProgress,
  }));
  const blocks = p.blocks.map((b, i) => ({
    id: b.name,
    project_id: "",
    name: b.name,
    units: b.units,
    start_date: b.startDate,
    end_date: b.endDate,
    actual_end_date: b.actualEndDate,
    planner_id: null,
    notes: b.notes,
    order_index: i,
  }));
  const cells = p.blocks.flatMap((b) =>
    Object.entries(b.statuses).map(([stage, status]) => ({
      block_id: b.name,
      stage_id: stage,
      project_id: "",
      status,
      note: "",
      updated_at: "",
    }))
  );
  const milestones = p.milestones.map((m, i) => ({
    id: m.title,
    project_id: "",
    title: m.title,
    status: m.status,
    note: "",
    due_date: null,
    completed_at: null,
    order_index: i,
  }));
  const resources = p.resources.map((r, i) => ({
    id: r.name,
    project_id: "",
    name: r.name,
    priority: r.priority,
    start_date: r.startDate,
    end_date: r.endDate,
    acquired: r.acquired,
    working_order: r.workingOrder,
    vehicle_id: null,
    notes: r.notes,
    order_index: i,
  }));
  const issues = p.issues.map((i, n) => ({
    id: String(n),
    project_id: "",
    block_id: null,
    issue_type: i.issueType,
    description: i.description,
    logged_at: i.loggedAt,
    resolved_at: i.resolvedAt,
    logged_by: null,
    resolved_by: null,
  }));

  const delay = totalDelayDays(issues, now);
  return {
    percent: overallProgress(stages, blocks, cells, milestones, resources),
    delay,
    openIssues: issues.filter((i) => !i.resolved_at).length,
    revised: revisedTargetDate(p.targetDate, delay),
  };
}

// ---------------------------------------------------------------------------
// Owner matching
// ---------------------------------------------------------------------------

/**
 * Match "Marchand" to the Marchant on staff without matching "Rocky" to anybody.
 *
 * Exact, then prefix, then first-name. Anything looser starts assigning other
 * people's projects to the wrong person, so an unmatched name is reported and the
 * project is imported with no owner rather than a guessed one. "Bruce & Team" is
 * never one person and is meant to fail here.
 */
function matchOwner(
  sheetName: string | null,
  staff: { id: string; name: string }[]
): { id: string; name: string } | null {
  if (!sheetName) return null;
  const asWritten = sheetName.toLowerCase().trim();

  // An explicit --map wins over every rule below, including the team guard: if you
  // say "Bruce & Team" is Dylan, it is Dylan.
  const mapped = OWNER_MAP.get(asWritten);
  const want = mapped ?? asWritten;
  if (!mapped && /&|\band\b|team/i.test(sheetName)) return null;

  const exact = staff.find((s) => s.name.toLowerCase().trim() === want);
  if (exact) return exact;

  const firstOf = (s: string) => s.toLowerCase().trim().split(/\s+/)[0];
  const byFirst = staff.filter((s) => firstOf(s.name) === want);
  if (byFirst.length === 1) return byFirst[0];

  // "Marchand" vs "Marchant" — same first five letters and within one character.
  const near = staff.filter((s) => {
    const f = firstOf(s.name);
    return (
      f.length >= 4 &&
      want.length >= 4 &&
      Math.abs(f.length - want.length) <= 1 &&
      f.slice(0, 5) === want.slice(0, 5)
    );
  });
  return near.length === 1 ? near[0] : null;
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

async function importProject(
  db: SupabaseClient,
  p: ParsedProject,
  ownerId: string | null,
  staff: { id: string; name: string }[],
  existingId: string | null
): Promise<string> {
  let projectId = existingId;

  // The sheet's "Allocated to" is kept verbatim when it could not be matched to a
  // person — losing "Bruce & Team" would lose the only record of who did the job.
  const ownerNote =
    p.allocatedTo && !ownerId ? `Allocated to ${p.allocatedTo} in the project sheet.` : "";
  const description = [`Imported from the project sheet (${p.tab}).`, ownerNote]
    .filter(Boolean)
    .join(" ");

  const isBuild = p.stages.some((s) => /poles|trenching|splicing|ducting/i.test(s.name));
  const header = {
    name: p.name,
    description,
    type: isBuild ? "infrastructure" : "maintenance",
    status: "active",
    priority: "medium",
    owner_id: ownerId,
    start_date: p.startDate,
    target_date: p.targetDate,
    quote_number: p.quoteNumber,
    quote_amount: p.quoteAmount,
    delivery_template: isBuild ? "network_build" : "network_maintenance",
    updated_at: new Date().toISOString(),
  };

  if (projectId) {
    // --replace: the delivery plane is rebuilt, but members, updates, tasks and
    // linked records stay — those were never in the sheet and must not be collateral.
    await db.from("projects").update(header).eq("id", projectId);
    for (const t of [
      "project_stages",
      "project_blocks",
      "project_milestones",
      "project_resources",
      "project_issues",
      "project_documents",
    ]) {
      await db.from(t).delete().eq("project_id", projectId);
    }
    await db.from("project_costs").delete().eq("project_id", projectId).eq("ref_type", "sheet");
  } else {
    const { data: codeRow } = await db.rpc("next_project_code");
    projectId = newId("prj");
    const { error } = await db
      .from("projects")
      .insert({ id: projectId, code: (codeRow as string) ?? projectId, ...header });
    if (error) throw new Error(`${p.name}: ${error.message}`);

    if (ownerId) {
      await db
        .from("project_members")
        .insert({ project_id: projectId, user_id: ownerId, role: "lead" });
    }
  }

  // ---- stages -------------------------------------------------------------
  const stageIds = new Map<string, string>();
  const stageRows = p.stages.map((s, i) => {
    const id = newId("stg");
    stageIds.set(s.name, id);
    return {
      id,
      project_id: projectId,
      name: s.name,
      order_index: i,
      counts_to_progress: s.countsToProgress,
    };
  });
  if (stageRows.length) {
    const { error } = await db.from("project_stages").insert(stageRows);
    if (error) throw new Error(`${p.name} stages: ${error.message}`);
  }

  // ---- blocks -------------------------------------------------------------
  const blockIds = new Map<string, string>();
  const blockRows = p.blocks.map((b, i) => {
    const id = newId("blk");
    blockIds.set(b.name, id);
    const planner = matchOwner(b.plannerName, staff);
    return {
      id,
      project_id: projectId,
      name: b.name,
      units: b.units,
      start_date: b.startDate,
      end_date: b.endDate,
      actual_end_date: b.actualEndDate,
      planner_id: planner?.id ?? null,
      // A planner the app does not know still belongs in the record.
      notes: [b.notes, b.plannerName && !planner ? `Planner: ${b.plannerName}` : ""]
        .filter(Boolean)
        .join(" — "),
      order_index: i,
    };
  });
  for (let i = 0; i < blockRows.length; i += 100) {
    const { error } = await db.from("project_blocks").insert(blockRows.slice(i, i + 100));
    if (error) throw new Error(`${p.name} blocks: ${error.message}`);
  }

  // ---- grid cells ---------------------------------------------------------
  //
  // Only cells that differ from the default are written. A 30-block untouched plan
  // is 240 "not started" cells that say nothing the empty grid does not already say.
  const cellRows = p.blocks.flatMap((b) =>
    Object.entries(b.statuses)
      .filter(([, status]) => status !== "not_started")
      .map(([stage, status]) => ({
        block_id: blockIds.get(b.name)!,
        stage_id: stageIds.get(stage)!,
        project_id: projectId,
        status,
      }))
  );
  for (let i = 0; i < cellRows.length; i += 500) {
    const { error } = await db.from("project_block_stages").insert(cellRows.slice(i, i + 500));
    if (error) throw new Error(`${p.name} grid: ${error.message}`);
  }

  // ---- milestones, plant, issues, documents -------------------------------
  if (p.milestones.length) {
    const { error } = await db.from("project_milestones").insert(
      p.milestones.map((m, i) => ({
        id: newId("mls"),
        project_id: projectId,
        title: m.title,
        status: m.status,
        completed_at: m.status === "complete" ? new Date().toISOString() : null,
        order_index: i,
      }))
    );
    if (error) throw new Error(`${p.name} milestones: ${error.message}`);
  }

  if (p.resources.length) {
    const { error } = await db.from("project_resources").insert(
      p.resources.map((r, i) => ({
        id: newId("res"),
        project_id: projectId,
        name: r.name,
        priority: r.priority,
        start_date: r.startDate,
        end_date: r.endDate,
        acquired: r.acquired,
        working_order: r.workingOrder,
        notes: r.notes,
        order_index: i,
      }))
    );
    if (error) throw new Error(`${p.name} plant: ${error.message}`);
  }

  if (p.issues.length) {
    const { error } = await db.from("project_issues").insert(
      p.issues.map((i) => ({
        id: newId("iss"),
        project_id: projectId,
        issue_type: i.issueType,
        description: i.description,
        logged_at: i.loggedAt,
        resolved_at: i.resolvedAt,
        logged_by: ownerId,
        resolved_by: i.resolvedAt ? ownerId : null,
      }))
    );
    if (error) throw new Error(`${p.name} issues: ${error.message}`);
  }

  if (p.documents.length) {
    const { error } = await db.from("project_documents").insert(
      p.documents.map((d, i) => ({
        id: newId("doc"),
        project_id: projectId,
        label: d.label,
        kind: d.kind,
        url: d.url,
        order_index: i,
        added_by: ownerId,
      }))
    );
    if (error) throw new Error(`${p.name} documents: ${error.message}`);
  }

  // ---- costs --------------------------------------------------------------
  // ref_type 'sheet' marks these as import-owned so --replace can clear exactly the
  // rows it created and leave anything entered in the app alone.
  const costs = [
    p.stockCost != null && p.stockCost > 0
      ? { description: "Stock cost (from the project sheet)", amount: p.stockCost, category: "stock" }
      : null,
    p.teamCost != null && p.teamCost > 0
      ? { description: "Teams cost (from the project sheet)", amount: p.teamCost, category: "labour" }
      : null,
  ].filter(Boolean) as { description: string; amount: number; category: string }[];

  if (costs.length) {
    const { error } = await db.from("project_costs").insert(
      costs.map((c) => ({
        id: newId("cst"),
        project_id: projectId,
        description: c.description,
        amount: c.amount,
        category: c.category,
        incurred_on: p.startDate ?? new Date().toISOString().slice(0, 10),
        ref_type: "sheet",
        ref_id: p.tab,
      }))
    );
    if (error) throw new Error(`${p.name} costs: ${error.message}`);
  }

  return projectId!;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be in .env.local");
    process.exit(1);
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);

  const parsed: ParsedProject[] = [];
  for (const ws of wb.worksheets) {
    if (!/^Project \d+$/i.test(ws.name)) continue;
    const p = parseSheet(ws);
    if (!p) continue;
    if (ONLY.length && !ONLY.some((o) => p.name.toLowerCase().includes(o))) continue;
    parsed.push(p);
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: staffRows, error: staffError } = await db
    .from("team_members")
    .select("id, name");
  if (staffError) {
    console.error(`Could not read team_members: ${staffError.message}`);
    process.exit(1);
  }
  const staff = (staffRows ?? []) as { id: string; name: string }[];

  const { data: existingRows } = await db.from("projects").select("id, name, code");
  const existing = new Map(
    ((existingRows ?? []) as { id: string; name: string; code: string }[]).map((r) => [
      r.name.toLowerCase().trim(),
      r,
    ])
  );

  const now = Date.now();

  console.log(`\n${APPLY ? "IMPORTING" : "DRY RUN — nothing will be written"}`);
  console.log(`Workbook: ${FILE}`);
  console.log(`Tabs with a project name: ${parsed.length}\n`);
  console.log("".padEnd(96, "="));

  let willWrite = 0;
  let willSkip = 0;

  for (const p of parsed) {
    const pv = preview(p, now);
    const owner = matchOwner(p.allocatedTo, staff);
    const already = existing.get(p.name.toLowerCase().trim());
    const skip = Boolean(already) && !REPLACE;
    if (skip) willSkip += 1;
    else willWrite += 1;

    const cellsWritten = p.blocks.reduce(
      (n, b) => n + Object.values(b.statuses).filter((s) => s !== "not_started").length,
      0
    );

    console.log(`\n${p.name}   [${p.tab}]`);
    console.log(
      `  ${p.startDate ?? "no start"} → ${p.targetDate ?? "no target date"}` +
        (pv.revised && pv.revised !== p.targetDate ? `  (revised: ${pv.revised})` : "")
    );
    console.log(
      `  allocated to: ${p.allocatedTo ?? "—"}` +
        (owner ? `  ->  ${owner.name}` : p.allocatedTo ? "  ->  NO MATCH, kept in the description" : "")
    );
    console.log(
      `  ${p.stages.length} stages · ${p.blocks.length} blocks · ${cellsWritten} ticked cells · ` +
        `${p.milestones.length} milestones · ${p.resources.length} plant · ` +
        `${p.issues.length} issues · ${p.documents.length} documents`
    );
    console.log(
      `  complete: sheet ${percentLabel(p.sheetPercent)}  ->  app ${percentLabel(pv.percent)}` +
        `   |   delay: ${delayLabel(pv.delay)} (${pv.openIssues} still open)`
    );
    if (p.quoteNumber || p.quoteAmount || p.stockCost || p.teamCost) {
      console.log(
        `  quote ${p.quoteNumber ?? "—"} ${p.quoteAmount ? `R${p.quoteAmount.toLocaleString("en-ZA")}` : ""}` +
          `${p.stockCost ? ` · stock R${p.stockCost.toLocaleString("en-ZA")}` : ""}` +
          `${p.teamCost ? ` · teams R${p.teamCost.toLocaleString("en-ZA")}` : ""}`
      );
    }
    console.log(`  stages: ${p.stages.map((s) => s.name + (s.countsToProgress ? "" : "*")).join(", ")}`);
    for (const w of p.warnings.slice(0, 6)) console.log(`  ! ${w}`);
    if (p.warnings.length > 6) console.log(`  ! …and ${p.warnings.length - 6} more warnings`);
    if (already) {
      console.log(
        skip
          ? `  SKIP — "${p.name}" already exists as ${already.code}. Pass --replace to rebuild it.`
          : `  REPLACE — rebuilding the delivery plan on ${already.code}`
      );
    }
  }

  console.log(`\n${"".padEnd(96, "=")}`);
  console.log(`${willWrite} to import, ${willSkip} skipped as already present.`);
  console.log("* = stage tracked but outside the completion figure.\n");

  if (!APPLY) {
    console.log("Dry run. Re-run with --apply to write these to the database.\n");
    return;
  }

  for (const p of parsed) {
    const already = existing.get(p.name.toLowerCase().trim());
    if (already && !REPLACE) continue;
    const owner = matchOwner(p.allocatedTo, staff);
    try {
      const id = await importProject(db, p, owner?.id ?? null, staff, already?.id ?? null);
      console.log(`  imported ${p.name}  ->  /projects/${id}`);
    } catch (err) {
      console.error(`  FAILED ${p.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log("\nDone.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
