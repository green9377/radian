/*
  Occasions & Tags — GROUPED demo data (visual mockup).

  This powers the new group-driven Tags screen BEFORE the schema/backend land.
  It models the shape we intend to build:

    TagGroup  — a named, reorderable, on/off group. Occasion & Recipient are
                "system" groups (can't be deleted) because storefront occasion
                pages + Gift Finder depend on them. Any other group (Bouquet
                Style, Theme & Colour…) is user-created.
    displayStyle — how the group renders on the storefront: CHIP (pill row) or
                CARD (image tiles like the occasion cards on the category page).
    Tag       — belongs to one group, can carry an image, many-to-many w/ Product.

  ⇄ MOCKUP: everything here is local/in-memory. Nothing is saved until the real
  TagGroup + Tag(imageUrl, groupId) migration + API are built and approved.
*/

export type DisplayStyle = "CHIP" | "CARD";

export interface DemoGroup {
  id: string;
  slug: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean; // Occasion / Recipient — cannot be deleted
  displayStyle: DisplayStyle;
}

export interface DemoTagRow {
  id: string;
  slug: string;
  name: string;
  groupId: string;
  sortOrder: number;
  isActive: boolean;
  bg: string; // gradient fallback shown until a real image is uploaded
  img?: string; // uploaded image (data URL in this mockup; real upload lands with the migration)
  products: number;
}

export function tagGroupSlug(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** deterministic soft brand-tinted gradient (image placeholder until real uploads) */
export function placeholderBg(seed: string): string {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const a = 270 + (h % 70); // purple–pink band
  const b = 300 + ((h >> 4) % 60);
  return `linear-gradient(150deg,hsl(${a} 62% 90%),hsl(${b} 56% 82%))`;
}

type Seed = { name: string; products: number; active?: boolean };

const GROUPS: { name: string; system?: boolean; style: DisplayStyle; tags: Seed[] }[] = [
  {
    name: "Occasions",
    system: true,
    style: "CHIP",
    tags: [
      { name: "Birthday", products: 32 },
      { name: "Anniversary", products: 24 },
      { name: "Love & Romance", products: 19 },
      { name: "Wedding", products: 12 },
      { name: "Mother's Day", products: 15 },
      { name: "Eid", products: 10 },
      { name: "Congratulations", products: 8 },
      { name: "Get Well Soon", products: 5 },
      { name: "Sympathy", products: 3, active: false },
      { name: "New Baby", products: 0 },
    ],
  },
  {
    name: "Recipients",
    system: true,
    style: "CARD",
    tags: [
      { name: "For Her", products: 41 },
      { name: "For Him", products: 22 },
      { name: "For Wife", products: 18 },
      { name: "For Husband", products: 11 },
      { name: "For Mother", products: 14 },
      { name: "For Father", products: 6 },
      { name: "For Friend", products: 9 },
      { name: "For Kids", products: 7 },
      { name: "For Couple", products: 4, active: false },
    ],
  },
  {
    name: "Bouquet Style",
    style: "CARD",
    tags: [
      { name: "Romantic Bouquet", products: 16 },
      { name: "Premium Bouquet", products: 12 },
      { name: "Beautiful Bouquet", products: 9 },
      { name: "Luxury Hamper", products: 6 },
      { name: "Hand-tied", products: 8 },
      { name: "Basket Arrangement", products: 5 },
      { name: "Box Arrangement", products: 0 },
    ],
  },
  {
    name: "Theme & Colour",
    style: "CHIP",
    tags: [
      { name: "Red", products: 22 },
      { name: "Pink", products: 18 },
      { name: "White", products: 14 },
      { name: "Mixed", products: 11 },
      { name: "Yellow", products: 7 },
      { name: "Pastel", products: 6 },
      { name: "Purple", products: 4, active: false },
    ],
  },
];

export const DEMO_GROUPS: DemoGroup[] = GROUPS.map((g, i) => ({
  id: "grp-" + tagGroupSlug(g.name),
  slug: tagGroupSlug(g.name),
  name: g.name,
  sortOrder: i,
  isActive: true,
  isSystem: !!g.system,
  displayStyle: g.style,
}));

export const DEMO_GROUP_TAGS: DemoTagRow[] = GROUPS.flatMap((g) => {
  const gid = "grp-" + tagGroupSlug(g.name);
  return g.tags.map((t, i) => ({
    id: "tag-" + tagGroupSlug(g.name) + "-" + tagGroupSlug(t.name),
    slug: tagGroupSlug(t.name),
    name: t.name,
    groupId: gid,
    sortOrder: i,
    isActive: t.active ?? true,
    bg: placeholderBg(g.name + t.name),
    products: t.products,
  }));
});
