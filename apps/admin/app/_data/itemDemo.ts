import type { ApiItem, ApiItemComponent, ItemType, AssemblyMode, ApiItemAttribute } from "./api";

/*
  Item module demo + sample data.
  Architecture: RADIAN_ITEM_MODULE_ARCHITECTURE.md (locked 21 Jul 2026, sobuj).

  1. DEMO_ITEMS — a small but COMPLETE Radian shop: raw flowers, packaging,
     a consumable, a service, a bought-in teddy, and two assembled bouquets with
     real recipes. Shown ONLY when the API (:4000) is unreachable, so the model can
     be understood on screen before a single migration has run.
  2. SAMPLE_ITEMS — the same set, POSTed into an empty-but-reachable DB by
     "Load samples".

  The two bouquets are deliberately different so both DEC-ITM-004 modes are visible:
    Romantic Red Rose Bouquet  → MAKE_TO_ORDER (fresh, built when the order lands)
    Everlasting Gift Box       → MAKE_TO_STOCK (artificial, assembled ahead)

  ⇄ SWAP HERE: delete once the DB is seeded and demo is no longer wanted.
*/

type Line = { sku: string; qty: number; wastagePct?: number; optional?: boolean };
type Seed = {
  sku: string;
  name: string;
  itemType: ItemType;
  unit: string; // Unit.shortCode
  costPaisa: number; // manual/reference cost
  perishable?: boolean;
  shelfLifeDays?: number;
  assembly?: AssemblyMode;
  products?: number; // how many Products point at it (demo only)
  recipe?: Line[];
  weightGram?: number; // DEC-ITM-014 — couriers charge by weight
  note?: string;
};

/* ---- the shop, in the order a person would explain it ---- */
export const SAMPLE_ITEMS: Seed[] = [
  // ingredients
  { sku: "ROSE-RED-STEM", name: "Red Rose (fresh cut)", itemType: "RAW", unit: "stem", costPaisa: 1500, perishable: true, shelfLifeDays: 4, weightGram: 25, note: "The workhorse. Bought per stem from the Shahbagh market." },
  { sku: "LILY-WHITE-STEM", name: "White Lily", itemType: "RAW", unit: "stem", costPaisa: 3500, perishable: true, shelfLifeDays: 5, weightGram: 40 },
  { sku: "BABYS-BREATH", name: "Baby's Breath (filler)", itemType: "RAW", unit: "bunch", costPaisa: 8000, perishable: true, shelfLifeDays: 6, weightGram: 120 },
  { sku: "ROSE-ARTIFICIAL", name: "Artificial Rose (silk)", itemType: "RAW", unit: "stem", costPaisa: 4500, weightGram: 18, note: "Never wilts — used in the make-ahead gift boxes." },

  // packaging
  { sku: "RIBBON-SATIN-GOLD", name: "Satin Ribbon — Rose Gold", itemType: "PACKAGING", unit: "pcs", costPaisa: 2000, weightGram: 15 },
  { sku: "WRAP-KRAFT", name: "Kraft Wrapping Paper", itemType: "PACKAGING", unit: "pcs", costPaisa: 3000, weightGram: 60 },
  { sku: "BOX-GIFT-MED", name: "Premium Gift Box — Medium", itemType: "PACKAGING", unit: "pcs", costPaisa: 12000, weightGram: 240 },
  { sku: "CARD-GREETING", name: "Radian Greeting Card", itemType: "PACKAGING", unit: "pcs", costPaisa: 2500, weightGram: 10 },

  // consumable + service — neither is ever "in stock" in the shopper's sense
  { sku: "FLORAL-TAPE", name: "Floral Tape", itemType: "CONSUMABLE", unit: "pcs", costPaisa: 1800, note: "Used up while building. Never sold, never on the storefront." },
  { sku: "SVC-GIFT-WRAP", name: "Gift Wrapping Service", itemType: "SERVICE", unit: "pcs", costPaisa: 5000, note: "Nothing physical to store — but it is still sold, so it is still an Item." },

  // bought in, sold as-is
  { sku: "TEDDY-BROWN-12", name: "Teddy Bear — Brown 12in", itemType: "FINISHED", unit: "pcs", costPaisa: 55000, weightGram: 400, products: 2, note: "One Item, two Products: sold on its own AND inside the combo listing." },
  { sku: "CHOC-FERRERO-16", name: "Ferrero Rocher — 16 pcs", itemType: "FINISHED", unit: "box", costPaisa: 78000, weightGram: 200, products: 1 },

  // assembled — the whole point of the module
  {
    sku: "BQT-ROMANTIC-RED", name: "Romantic Red Rose Bouquet", itemType: "FINISHED", unit: "pcs",
    costPaisa: 0, perishable: true, shelfLifeDays: 3, assembly: "MAKE_TO_ORDER", weightGram: 900, products: 3,
    note: "Built when the order arrives. Has no stock of its own — how many we can make comes from the roses.",
    recipe: [
      { sku: "ROSE-RED-STEM", qty: 24, wastagePct: 8 },
      { sku: "BABYS-BREATH", qty: 0.5 },
      { sku: "WRAP-KRAFT", qty: 1 },
      { sku: "RIBBON-SATIN-GOLD", qty: 1 },
      { sku: "FLORAL-TAPE", qty: 1 },
      { sku: "CARD-GREETING", qty: 1, optional: true },
    ],
  },
  {
    sku: "GIFT-EVERLASTING", name: "Everlasting Gift Box", itemType: "FINISHED", unit: "pcs",
    costPaisa: 0, assembly: "MAKE_TO_STOCK", weightGram: 750, products: 1,
    note: "Artificial flowers — the team assembles a batch on a quiet day, so this one DOES hold its own stock.",
    recipe: [
      { sku: "ROSE-ARTIFICIAL", qty: 12 },
      { sku: "BOX-GIFT-MED", qty: 1 },
      { sku: "RIBBON-SATIN-GOLD", qty: 1 },
      { sku: "CHOC-FERRERO-16", qty: 1 },
    ],
  },
];

/* ---- build the demo rows, including the rolled-up cost (DEC-ITM-008) ---- */

const bySku = new Map(SAMPLE_ITEMS.map((s) => [s.sku, s]));
const idOf = (sku: string) => "demo-item-" + sku.toLowerCase();
const unitOf = (code: string) => ({
  // baseQty 1 = a root unit (the Unit master carries its own conversion tree)
  id: "demo-unit-" + code, name: code, shortCode: code, baseQty: 1, sortOrder: 0, isActive: true,
});

/** same maths the API runs: Σ cost × qty × (1 + wastage), optional lines excluded */
function rollUp(s: Seed): number {
  if (!s.recipe) return s.costPaisa;
  let total = 0;
  for (const l of s.recipe) {
    if (l.optional) continue;
    const child = bySku.get(l.sku);
    if (!child) continue;
    const childCost = child.recipe ? rollUp(child) : child.costPaisa;
    total += childCost * l.qty * (1 + (l.wastagePct ?? 0) / 100);
  }
  return Math.round(total);
}

function componentsOf(s: Seed): ApiItemComponent[] {
  return (s.recipe ?? []).map((l, i) => {
    const child = bySku.get(l.sku)!;
    const childCost = child.recipe ? rollUp(child) : child.costPaisa;
    return {
      id: `demo-line-${s.sku}-${i}`,
      componentItemId: idOf(l.sku),
      qtyMilli: Math.round(l.qty * 1000),
      unitId: "demo-unit-" + child.unit,
      wastageBp: Math.round((l.wastagePct ?? 0) * 100),
      isOptional: l.optional ?? false,
      displayText: null,
      sortOrder: i,
      unit: unitOf(child.unit),
      componentItem: {
        id: idOf(l.sku),
        sku: child.sku,
        name: child.name,
        itemType: child.itemType,
        costMode: child.recipe ? "AUTO" : "MANUAL",
        standardCostPaisa: child.costPaisa,
        computedCostPaisa: child.recipe ? childCost : null,
        unit: unitOf(child.unit),
      },
    };
  });
}

export const DEMO_ITEMS: ApiItem[] = SAMPLE_ITEMS.map((s) => {
  const computed = s.recipe ? rollUp(s) : null;
  const auto = !!s.recipe;
  return {
    id: idOf(s.sku),
    sku: s.sku,
    name: s.name,
    itemType: s.itemType,
    itemCategoryId: null,
    itemCategory: null,
    brandId: null,
    brand: null,
    unitId: "demo-unit-" + s.unit,
    unit: unitOf(s.unit),
    imageUrl: null, // no photo yet → the screen falls back to a stable colour tile
    isStockTracked: s.itemType !== "SERVICE",
    assemblyMode: s.assembly ?? "NONE",
    // DEC-ITM-013 — the realistic combinations, so the flags are worth looking at
    isSaleable: s.itemType === "FINISHED" || s.itemType === "SERVICE",
    isPurchasable: s.itemType !== "SERVICE" && !s.recipe,
    isReturnable: !(s.perishable ?? false) && s.itemType !== "CONSUMABLE",
    weightGram: s.weightGram ?? null,
    costMode: auto ? "AUTO" : "MANUAL",
    standardCostPaisa: s.costPaisa,
    computedCostPaisa: computed,
    effectiveCostPaisa: auto ? (computed ?? 0) : s.costPaisa,
    isPerishable: s.perishable ?? false,
    shelfLifeDays: s.shelfLifeDays ?? null,
    reorderLevel: null,
    description: s.note ?? null,
    isActive: true,
    components: componentsOf(s),
    _count: {
      products: s.products ?? 0,
      components: s.recipe?.length ?? 0,
      usedIn: SAMPLE_ITEMS.filter((o) => o.recipe?.some((l) => l.sku === s.sku)).length,
    },
  };
});

/** the one-line "why does this exist" note, keyed by sku — shown under the name */
export const ITEM_NOTES: Record<string, string> = Object.fromEntries(
  SAMPLE_ITEMS.filter((s) => s.note).map((s) => [s.sku, s.note!]),
);

/* ---- Item groups (DEC-ITM-007) — the WAREHOUSE tree ----------------------------
   Deliberately different vocabulary from the storefront Category tree: this one is
   about where a thing sits in the stockroom, not how a shopper browses.
   Two levels, same as Category.
-------------------------------------------------------------------------------- */
export const SAMPLE_ITEM_GROUPS: { name: string; children?: string[] }[] = [
  { name: "Fresh Flowers", children: ["Roses", "Lilies", "Fillers & Foliage", "Seasonal"] },
  { name: "Artificial Flowers", children: ["Silk", "Foam", "Dried"] },
  { name: "Packaging", children: ["Wrapping", "Ribbon", "Boxes", "Cards"] },
  { name: "Gift Items", children: ["Soft Toys", "Chocolate", "Candles", "Accessories"] },
  { name: "Workshop Supplies", children: ["Tape & Glue", "Tools"] },
  { name: "Services" },
];

export const DEMO_ITEM_GROUPS = (() => {
  const out: { id: string; name: string; parentId: string | null; sortOrder: number; isActive: boolean; _count: { items: number; children: number } }[] = [];
  let i = 0;
  for (const top of SAMPLE_ITEM_GROUPS) {
    const id = "demo-grp-" + top.name.toLowerCase().replace(/[^a-z]+/g, "-");
    out.push({
      id, name: top.name, parentId: null, sortOrder: i++, isActive: true,
      _count: { items: 0, children: top.children?.length ?? 0 },
    });
    for (const c of top.children ?? []) {
      out.push({
        id: id + "-" + c.toLowerCase().replace(/[^a-z]+/g, "-"),
        name: c, parentId: id, sortOrder: i++, isActive: true,
        _count: { items: Math.floor(Math.random() * 0), children: 0 },
      });
    }
  }
  return out;
})();


/* ---- Colour / Size (DEC-ITM-015) — the STOCKROOM's own labels ------------------
   Not the storefront's. Marketing may call a colour "Passion Red" on the website;
   the warehouse still calls it Red, and neither renames the other.
------------------------------------------------------------------------------- */
export const SAMPLE_ITEM_ATTRIBUTES: { name: string; values: { label: string; swatch?: string }[] }[] = [
  {
    name: "Colour",
    values: [
      { label: "Red", swatch: "#c62828" },
      { label: "White", swatch: "#fafafa" },
      { label: "Yellow", swatch: "#f9c623" },
      { label: "Pink", swatch: "#e87ba4" },
      { label: "Orange", swatch: "#ef7028" },
      { label: "Purple", swatch: "#7a2ea8" },
      { label: "Blue", swatch: "#2563a8" },
      { label: "Mixed", swatch: "linear-gradient(135deg,#c62828,#f9c623,#2563a8)" },
    ],
  },
  {
    name: "Size",
    values: [
      { label: "Small" }, { label: "Medium" }, { label: "Large" }, { label: "Extra Large" },
    ],
  },
  {
    name: "Grade",
    values: [
      { label: "A — export" }, { label: "B — local" }, { label: "C — filler" },
    ],
  },
];

export const DEMO_ITEM_ATTRIBUTES: ApiItemAttribute[] = SAMPLE_ITEM_ATTRIBUTES.map((a, i) => ({
  id: "demo-attr-" + a.name.toLowerCase(),
  name: a.name,
  sortOrder: i,
  isActive: true,
  values: a.values.map((v, k) => ({
    id: `demo-attrval-${a.name.toLowerCase()}-${k}`,
    attributeId: "demo-attr-" + a.name.toLowerCase(),
    label: v.label,
    swatch: v.swatch ?? null,
    sortOrder: k,
    isActive: true,
    _count: { items: 0 },
  })),
}));
