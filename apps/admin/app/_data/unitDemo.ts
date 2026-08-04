import type { ApiUnit } from "./api";

/*
  Unit demo + sample data (DEC-PRD-009).

  1. DEMO_UNITS — shown ONLY when the API (:4000) is UNREACHABLE. Covers every state the
     screen can show: base units, one-level conversions, a two-level chain
     (Lily Bunch → Lily Stick → Papri = 40 papri), an unused unit and a hidden one.
  2. SAMPLE_UNITS — the starter set "Load samples" POSTs into an empty real DB, seeded
     in dependency order.

  NAMING RULE (locked): the name must be SPECIFIC enough that its conversion is always
  true — "Lily Stick", never a bare "Stick", because a gypsy stick is 2 papri not 4.
  The quantity still never goes in the name; it goes in baseQty.

  ⇄ SWAP HERE: delete once the DB is seeded and demo is no longer wanted.
*/
type Raw = {
  name: string;
  shortCode: string;
  /** shortCode of the smaller unit this breaks down into; undefined = base unit */
  baseCode?: string;
  baseQty?: number;
  products: number;
  items?: number;
  active?: boolean;
};

const RAW: Raw[] = [
  // ---- base units (nothing smaller) ----
  { name: "Piece", shortCode: "pcs", products: 42, items: 12 },
  { name: "Papri", shortCode: "papri", products: 4, items: 6 },
  { name: "Gram", shortCode: "gram", products: 0, items: 9 },

  // ---- one level down ----
  { name: "Lily Stick", shortCode: "lilystick", baseCode: "papri", baseQty: 4, products: 9, items: 3 },
  { name: "Gypsy Stick", shortCode: "gypsystick", baseCode: "papri", baseQty: 2, products: 3, items: 2 },
  { name: "Kg", shortCode: "kg", baseCode: "gram", baseQty: 1000, products: 6, items: 7 },
  { name: "Dozen", shortCode: "dozen", baseCode: "pcs", baseQty: 12, products: 2, items: 1 },
  { name: "Box", shortCode: "box", baseCode: "pcs", baseQty: 24, products: 14, items: 4 },

  // ---- two levels: resolves to 40 papri ----
  { name: "Lily Bunch", shortCode: "lilybunch", baseCode: "lilystick", baseQty: 10, products: 18, items: 2 },

  // ---- edge states worth seeing on screen ----
  { name: "Pair", shortCode: "pair", baseCode: "pcs", baseQty: 2, products: 0, items: 0 },
  { name: "Bundle", shortCode: "bundle", baseCode: "pcs", baseQty: 6, products: 0, items: 0, active: false },
];

const idOf = (code: string) => "demo-unit-" + code;

export const DEMO_UNITS: ApiUnit[] = RAW.map((u, i) => {
  const base = u.baseCode ? RAW.find((r) => r.shortCode === u.baseCode) : undefined;
  return {
    id: idOf(u.shortCode),
    name: u.name,
    shortCode: u.shortCode,
    baseUnitId: base ? idOf(base.shortCode) : null,
    baseUnit: base ? { id: idOf(base.shortCode), name: base.name, shortCode: base.shortCode } : null,
    baseQty: u.baseQty ?? 1,
    sortOrder: i,
    isActive: u.active ?? true,
    _count: {
      products: u.products,
      items: u.items ?? 0,
      itemLines: 0,
      derivedUnits: RAW.filter((r) => r.baseCode === u.shortCode).length,
    },
  };
});

/** clean starter set for seeding a real (empty) database */
export const SAMPLE_UNITS: {
  name: string;
  shortCode: string;
  baseCode?: string;
  baseQty?: number;
}[] = RAW.filter((u) => u.active !== false).map((u) => ({
  name: u.name,
  shortCode: u.shortCode,
  baseCode: u.baseCode,
  baseQty: u.baseQty,
}));
