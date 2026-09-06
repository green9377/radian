import type { Product } from "./products";

/*
  ═══════════════════════════════════════════════════════════════════
  Category page config — one template; every category runs on this config,
  and every config comes from the API (`toCategoryConfig` in categoryApi.ts).

  The mock configs that used to live here — eight categories, their
  sub-pages and eight occasions, written by hand — are gone (owner, 6 Sep
  2026): the shop shows real data or a clean error state, never invented
  content. What stays is the shape, and the one rule below.

  Rule: section ORDER is written ONCE, in SLOTS. No category may change it —
  only switch sections on/off and change content. Fourteen sections in any
  order would be countless combinations, impossible to QA.
  ═══════════════════════════════════════════════════════════════════
*/

export type SectionKey =
  | "banner"
  | "subCategoryRail"
  | "productRail"
  | "attributeGrid"
  | "occasionGrid"
  | "colourGrid"
  | "budgetRail"
  | "productGrid"
  | "comboRail"
  | "deliveryBand"
  | "crossSellRail"
  | "giftFinder"
  | "faq"
  | "story";

/** Product rail rule — mapped onto the flags in products.ts */
export type ProductRule =
  | "bestseller" // best
  | "express" // exp
  | "same_day" // sd
  | "midnight" // mn
  | "new_arrival" // neu
  | "manual"; // productSlugs

export interface CategorySection {
  key: SectionKey;
  /**
   * Which of the fourteen slots this is — "bestsellers", "colourGrid"…
   *
   * `key` cannot answer that: two slots both render a `productRail`. The admin
   * addresses sections by slot, so anything matched against admin data (an
   * added block's placement, a section's icon) matches on this.
   */
  slot?: SlotKey;
  /** a built-in icon name, shown above the heading. From the admin. */
  icon?: string | null;
  /** or an uploaded one — `iconUrl` wins, same rule as the trust badges */
  iconUrl?: string | null;
  /** an image behind this section, if the shop wants one there */
  bgImageUrl?: string | null;
  /** the section's own settings from the admin (the story card reads its words from here) */
  config?: Record<string, unknown>;
  enabled: boolean;
  eyebrow?: string;
  heading?: string;
  subheading?: string;
  rule?: ProductRule;
  productSlugs?: string[];
  count?: number;
  viewAllHref?: string;
  tone?: "plain" | "alt";
}

export interface Tile {
  label: string;
  sub?: string;
  href: string;
  /** the admin's picture; null = the shared placeholder (never a random tint) */
  imageUrl?: string | null;
}

export interface ColourTile {
  label: string;
  sub: string;
  swatch: string;
  href: string;
}

export interface BudgetTile {
  kicker: string;
  label: string;
  sub?: string;
  imageUrl?: string | null;
  accent?: boolean;
  href: string;
}

export interface Faq {
  q: string;
  a: string;
}

export interface CategoryConfig {
  slug: string;
  parent?: { label: string; slug: string };
  label: string;
  h1: string;
  lead: string;
  /** the soft panel behind the words — a tint, never a photograph */
  bannerBg: string;
  /**
   * The uploaded category banner, shown in the arch on the RIGHT (31 Jul 2026).
   *
   * Deliberately NOT `bannerBg`. Painting the photo across the whole panel puts
   * the h1, the lead and the delivery line on top of somebody's photograph,
   * where they are unreadable — and where readability changes with every new
   * upload. The design has always been: tinted panel, words left, picture in
   * the arch.
   */
  bannerImageUrl?: string | null;
  /**
   * The chips under the banner. From the shop's trust badges, so the promise
   * on a category page and the promise on the homepage can never disagree.
   * Empty → no chips; the page never invents a promise.
   */
  promises: string[];
  totalProducts: number;
  seo: { title: string; description: string };
  sections: CategorySection[];
  subCategories: Tile[];
  attributes: Tile[];
  occasions: Tile[];
  colours: ColourTile[];
  budgets: BudgetTile[];
  /** Better together — the owner's related products for this category */
  combos: Product[];
  /** Keep exploring — other categories */
  crossSell: Tile[];
  faqs: Faq[];
}

/* ═══════════════ SECTION ORDER — once, for everyone ═══════════════ */

export type SlotKey =
  | "banner"
  | "subCategoryRail"
  | "bestsellers"
  | "attributeGrid"
  | "occasionGrid"
  | "readyToday"
  | "colourGrid"
  | "budgetRail"
  | "productGrid"
  | "comboRail"
  | "deliveryBand"
  | "crossSellRail"
  | "giftFinder"
  | "faq"
  | "story";

export const SLOTS: { slot: SlotKey; base: CategorySection }[] = [
  { slot: "banner", base: { key: "banner", enabled: true } },
  {
    slot: "subCategoryRail",
    base: { key: "subCategoryRail", enabled: true, eyebrow: "Shop by type" },
  },
  {
    slot: "bestsellers",
    base: {
      key: "productRail",
      enabled: true,
      tone: "alt",
      eyebrow: "Most ordered",
      rule: "bestseller",
      count: 8,
      viewAllHref: "#all-products",
    },
  },
  { slot: "attributeGrid", base: { key: "attributeGrid", enabled: true, eyebrow: "Shop by style" } },
  {
    slot: "occasionGrid",
    base: { key: "occasionGrid", enabled: true, eyebrow: "Shop by occasion", viewAllHref: "/occasions" },
  },
  {
    slot: "readyToday",
    base: {
      key: "productRail",
      enabled: true,
      eyebrow: "Leaving the studio today",
      heading: "Ready To Send Right Now",
      subheading: "In stock, packed, and out the door within the hour.",
      rule: "express",
      count: 4,
    },
  },
  { slot: "colourGrid", base: { key: "colourGrid", enabled: true, eyebrow: "Shop by colour" } },
  {
    slot: "budgetRail",
    base: {
      key: "budgetRail",
      enabled: true,
      eyebrow: "Shop by budget",
      heading: "Beautiful At Every Price",
      subheading: "Honest pricing. No surprise charges at checkout.",
    },
  },
  { slot: "productGrid", base: { key: "productGrid", enabled: true, eyebrow: "The full collection", count: 8 } },
  { slot: "comboRail", base: { key: "comboRail", enabled: true, tone: "alt", eyebrow: "Better together" } },
  { slot: "deliveryBand", base: { key: "deliveryBand", enabled: true } },
  {
    slot: "crossSellRail",
    base: { key: "crossSellRail", enabled: true, eyebrow: "Keep exploring", heading: "You Might Also Love" },
  },
  { slot: "giftFinder", base: { key: "giftFinder", enabled: true, eyebrow: "Still deciding?" } },
  { slot: "faq", base: { key: "faq", enabled: true, eyebrow: "Good to know" } },
  { slot: "story", base: { key: "story", enabled: true } },
];
