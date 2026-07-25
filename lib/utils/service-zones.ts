import type { Tower, TowerSite } from "@/lib/types";

export type ServiceZoneOption = {
  /** Unique select value */
  value: string;
  /** Stored on lead.serviceZone */
  label: string;
  /** Linked coverage area (towers.id) */
  towerId: string;
  kind: "area" | "town" | "site";
  group: string;
};

/** Build zone options from coverage areas, their service towns, and tower sites. */
export function buildServiceZoneOptions(
  towers: Tower[],
  towerSites: TowerSite[]
): ServiceZoneOption[] {
  const options: ServiceZoneOption[] = [];
  const sortedTowers = [...towers].sort((a, b) => a.name.localeCompare(b.name));

  for (const area of sortedTowers) {
    options.push({
      value: `area:${area.id}`,
      label: area.name,
      towerId: area.id,
      kind: "area",
      group: area.name,
    });

    const towns = [...new Set(area.serviceAreas.map((t) => t.trim()).filter(Boolean))].sort(
      (a, b) => a.localeCompare(b)
    );
    for (const town of towns) {
      if (town.toLowerCase() === area.name.toLowerCase()) continue;
      options.push({
        value: `town:${area.id}:${town}`,
        label: town,
        towerId: area.id,
        kind: "town",
        group: area.name,
      });
    }

    const sites = towerSites
      .filter((s) => s.areaId === area.id)
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const site of sites) {
      options.push({
        value: `site:${site.id}`,
        label: site.name,
        towerId: area.id,
        kind: "site",
        group: area.name,
      });
    }
  }

  return options;
}

export function resolveServiceZoneSelectValue(
  serviceZone: string,
  towerId: string | null | undefined,
  options: ServiceZoneOption[]
): string {
  const zone = serviceZone.trim();
  if (!zone) return "";

  if (towerId) {
    const siteMatch = options.find(
      (o) => o.kind === "site" && o.towerId === towerId && o.label === zone
    );
    if (siteMatch) return siteMatch.value;

    const townMatch = options.find(
      (o) => o.kind === "town" && o.towerId === towerId && o.label === zone
    );
    if (townMatch) return townMatch.value;

    const areaMatch = options.find(
      (o) => o.kind === "area" && o.towerId === towerId && o.label === zone
    );
    if (areaMatch) return areaMatch.value;

    const areaOnly = options.find((o) => o.kind === "area" && o.towerId === towerId);
    if (areaOnly && zone === areaOnly.label) return areaOnly.value;
  }

  const byLabel = options.find((o) => o.label === zone);
  return byLabel?.value ?? zone;
}

/** Flat unique labels for board filters (areas + towns + sites). */
export function serviceZoneFilterLabels(
  towers: Tower[],
  towerSites: TowerSite[],
  existingLeadZones: string[] = []
): string[] {
  const fromCoverage = buildServiceZoneOptions(towers, towerSites).map((o) => o.label);
  const set = new Set<string>([...fromCoverage, ...existingLeadZones.filter(Boolean)]);
  return [...set].sort((a, b) => a.localeCompare(b));
}
