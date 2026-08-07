import { MODULES, MODULE_LIST } from "@/lib/modules";
import type { NavItem } from "@/lib/nav/department-nav";
import type { ModuleKey } from "@/lib/types";

/**
 * Every section the sidebar can show, and which department owns it.
 *
 * A "section" is one entry in a department's sidebar — Technicians, Inventory,
 * Layouts. Which department SHOWS it is arranged in Administration → Sections and
 * stored in module_sections (migration 063). Which department OWNS it is fixed by
 * its URL: /stock/inventory belongs to Stock no matter whose sidebar it appears
 * in, because that is what the route guard, the API routes and the RLS policies
 * all key on.
 *
 * That ownership is the whole reason this file exists. Lending a section to
 * another department means lending the grant that opens it, and the admin screen
 * has to be able to say which grant that is.
 */

export interface SectionDef extends NavItem {
  /** The module whose grant actually opens this page. */
  ownerKey: ModuleKey;
  ownerLabel: string;
}

/**
 * Built from the module registry rather than listed again here, so a section
 * added to a department's nav is assignable the moment it exists.
 *
 * `staffNav` is folded in as well: Sales' below-manager list carries My Stats,
 * which is a real page and should be lendable even though managers never see it.
 */
function buildCatalogue(): SectionDef[] {
  const byHref = new Map<string, SectionDef>();
  for (const mod of MODULE_LIST) {
    const items = [...mod.nav, ...(mod.staffNav ?? [])];
    for (const item of items) {
      // First module to claim an href owns it; MODULE_LIST is sorted, so this is
      // stable rather than dependent on object key order.
      if (byHref.has(item.href)) continue;
      byHref.set(item.href, {
        ...item,
        ownerKey: mod.key,
        ownerLabel: mod.label,
      });
    }
  }
  return [...byHref.values()];
}

export const SECTION_CATALOGUE: SectionDef[] = buildCatalogue();

const SECTION_BY_HREF = new Map(SECTION_CATALOGUE.map((s) => [s.href, s]));

export function sectionByHref(href: string): SectionDef | null {
  return SECTION_BY_HREF.get(href) ?? null;
}

/** The catalogue grouped by owning department, for the admin picker. */
export function sectionsByOwner(): { module: (typeof MODULE_LIST)[number]; sections: SectionDef[] }[] {
  return MODULE_LIST.map((mod) => ({
    module: mod,
    sections: SECTION_CATALOGUE.filter((s) => s.ownerKey === mod.key),
  })).filter((g) => g.sections.length > 0);
}

/** One row of module_sections. */
export interface SectionOverride {
  moduleKey: string;
  href: string;
  enabled: boolean;
  sortOrder: number | null;
}

/**
 * Apply a department's overrides to its default sidebar.
 *
 * `base` is what the code says the department shows — already narrowed for the
 * user's level by navItemsFor, so a read-only Stock user's list is narrowed
 * before anything here is added to it.
 *
 * Borrowed sections are appended after the defaults unless they carry a
 * sort_order. A department's own pages keep their authored order, which is a
 * workflow order (Jobs before Job cards before Timesheets) and not alphabetical.
 */
export function applySectionOverrides(
  base: NavItem[],
  overrides: SectionOverride[],
  moduleKey: ModuleKey
): NavItem[] {
  const mine = overrides.filter((o) => o.moduleKey === moduleKey);
  if (mine.length === 0) return base;

  const hidden = new Set(mine.filter((o) => !o.enabled).map((o) => o.href));
  const kept = base.filter((item) => !hidden.has(item.href));
  const present = new Set(kept.map((item) => item.href));

  const added = mine
    .filter((o) => o.enabled && !present.has(o.href))
    .map((o) => ({ override: o, section: sectionByHref(o.href) }))
    // A row for a route that no longer exists is ignored rather than crashing
    // the sidebar — see the note on section_href in migration 063.
    .filter((x): x is { override: SectionOverride; section: SectionDef } => Boolean(x.section))
    .sort((a, b) => (a.override.sortOrder ?? 1e9) - (b.override.sortOrder ?? 1e9))
    .map((x) => x.section);

  return [...kept, ...added];
}

/**
 * The modules a department has borrowed a section from — i.e. the grants its
 * staff need before those sections open. Used to decide what to grant when a
 * section is lent, and to warn in the admin screen when somebody lacks it.
 */
export function impliedModulesFor(
  moduleKey: ModuleKey,
  overrides: SectionOverride[]
): ModuleKey[] {
  const implied = new Set<ModuleKey>();
  for (const o of overrides) {
    if (o.moduleKey !== moduleKey || !o.enabled) continue;
    const section = sectionByHref(o.href);
    if (!section) continue;
    if (section.ownerKey === moduleKey) continue; // its own page, already granted
    implied.add(section.ownerKey);
  }
  return [...implied];
}

/** Whether a department shows this section by default, before any override. */
export function isDefaultSection(moduleKey: ModuleKey, href: string): boolean {
  const mod = MODULES[moduleKey];
  if (!mod) return false;
  return [...mod.nav, ...(mod.staffNav ?? [])].some((item) => item.href === href);
}
