/** Starter tower list — also seeded in 005_support_towers.sql */
export const TOWER_SEED = [
  {
    id: "tower-modimolle",
    name: "Modimolle",
    serviceAreas: ["Modimolle", "Naboom", "Settlers"],
  },
  {
    id: "tower-bela-bela",
    name: "Bela-Bela",
    serviceAreas: ["Bela-Bela", "Alma"],
  },
  {
    id: "tower-pienaars",
    name: "Pienaars Rivier",
    serviceAreas: ["Pienaars Rivier", "Rust de Winter"],
  },
  {
    id: "tower-melkrivier",
    name: "Melkrivier",
    serviceAreas: ["Melkrivier", "Overyssel", "Marken"],
  },
  {
    id: "tower-vaalwater",
    name: "Vaalwater",
    serviceAreas: ["Vaalwater", "Ellisras"],
  },
  {
    id: "tower-modimolle-fibre",
    name: "Modimolle Fibre",
    serviceAreas: ["Modimolle", "Kokanje", "Bosveldsig", "Die Oog"],
  },
] as const;
