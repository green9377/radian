import type { ApiCategoryNode } from "./api";

/*
  Category demo + sample data.

  Two exports, two different jobs:

  1. DEMO_CATEGORIES — a rich, deliberately-uneven Bangladesh flower & gift
     taxonomy (mixed active / inactive / empty categories). Shown ONLY when the
     API (:4000) is UNREACHABLE, so every state on the Categories screen stays
     explorable. Flat list of nodes (parents + children as separate rows), the
     same shape GET /categories returns — the screen builds the tree the same
     way for demo and real data.

  2. SAMPLE_TAXONOMY — a clean starter set. When the API is UP but the DB has no
     categories yet, the "Load samples" button POSTs these as real records.

  ⇄ SWAP HERE: delete this file once the DB is seeded and demo is no longer wanted.
*/

type DemoLeaf = { name: string; products: number; active?: boolean };
type DemoParent = { name: string; products?: number; active?: boolean; children: DemoLeaf[] };

/** the master demo tree — edit here, both exports derive from it */
const TREE: DemoParent[] = [
  {
    name: "Flowers",
    children: [
      { name: "Roses", products: 24 },
      { name: "Tulips", products: 9 },
      { name: "Lilies", products: 11 },
      { name: "Orchids", products: 6 },
      { name: "Mixed Bouquets", products: 18 },
    ],
  },
  {
    name: "Cakes",
    children: [
      { name: "Chocolate Cakes", products: 14 },
      { name: "Fruit Cakes", products: 8 },
      { name: "Cheesecakes", products: 5 },
      { name: "Photo Cakes", products: 7 },
    ],
  },
  {
    name: "Gifts",
    products: 3,
    children: [
      { name: "Chocolates", products: 12 },
      { name: "Perfumes", products: 6 },
      { name: "Soft Toys", products: 9 },
      { name: "Mugs", products: 4 },
    ],
  },
  {
    name: "Combos",
    children: [
      { name: "Flower + Cake", products: 10 },
      { name: "Flower + Chocolate", products: 7 },
      { name: "Gift Hampers", products: 5 },
    ],
  },
  {
    name: "Plants",
    children: [
      { name: "Indoor Plants", products: 6 },
      { name: "Succulents", products: 4, active: false },
    ],
  },
  {
    name: "Personalized",
    children: [
      { name: "Photo Frames", products: 5 },
      { name: "Custom Mugs", products: 3 },
      { name: "Cushions", products: 0 },
    ],
  },
  {
    name: "Seasonal — Valentine",
    products: 0,
    active: false,
    children: [],
  },
];

export function demoSlug(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** flat node list (parents + children), same shape as GET /categories */
export const DEMO_CATEGORIES: ApiCategoryNode[] = (() => {
  const out: ApiCategoryNode[] = [];
  TREE.forEach((p, pi) => {
    const pid = "demo-cat-" + demoSlug(p.name);
    out.push({
      id: pid,
      slug: demoSlug(p.name),
      name: p.name,
      parentId: null,
      sortOrder: pi,
      isActive: p.active ?? true,
      _count: { products: p.products ?? 0 },
    });
    p.children.forEach((c, ci) => {
      out.push({
        id: pid + "-" + demoSlug(c.name),
        slug: demoSlug(p.name + "-" + c.name),
        name: c.name,
        parentId: pid,
        sortOrder: ci,
        isActive: c.active ?? true,
        _count: { products: c.products },
      });
    });
  });
  return out;
})();

/** clean starter set for seeding a real (empty) database */
export const SAMPLE_TAXONOMY: { name: string; children: string[] }[] = TREE.filter(
  (p) => p.children.length > 0,
).map((p) => ({ name: p.name, children: p.children.map((c) => c.name) }));
