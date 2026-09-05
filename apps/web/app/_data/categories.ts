import type { Product, ProductCategory, Occasion } from "./products";
import { PRODUCTS, zoneFilter } from "./products";
import type { Zone } from "../_store/useZoneStore";

/*
  ═══════════════════════════════════════════════════════════════════
  Category page config — one template; every category runs on this config.

  ⚠️ TEMPORARY HOME — once the Ecommerce module locks, this moves to the DB
     (CategoryPageConfig table). Only the inside of getCategoryConfig()
     becomes a fetch() — no component gets touched.

  Rules (important):
   - Section ORDER is written ONCE, in the SLOTS array below. No category
     may change it — only switch sections on/off and change content.
     Why: 14 sections in any order = countless combinations, impossible to
     QA, and one bad order kills the whole page's conversion.
   - Content (heading, eyebrow, tiles, FAQ) differs per category — normal.
   - Don't need a section → `false` in that slot.
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
  bg: string;
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
  bg: string;
}

export interface Faq {
  q: string;
  a: string;
}

export interface CategoryConfig {
  slug: string;
  cat: ProductCategory;
  sub?: string;
  /** On an occasion page this tag filters ACROSS categories, ignoring cat */
  occ?: Occasion;
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
   * Empty/absent → the component keeps its own zone-aware pair.
   */
  promises?: string[];
  totalProducts: number;
  seo: { title: string; description: string };
  sections: CategorySection[];
  subCategories: Tile[];
  attributes: Tile[];
  occasions: Tile[];
  colours: ColourTile[];
  budgets: BudgetTile[];
  combos: Tile[];
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

type SlotOverrides = Partial<Record<SlotKey, Partial<CategorySection> | false>>;

/** Order is fixed. A category only supplies content, or turns a section off with `false`. */
function makeSections(overrides: SlotOverrides): CategorySection[] {
  return SLOTS.map(({ slot, base }) => {
    const o = overrides[slot];
    if (o === false) return { ...base, enabled: false };
    return { ...base, ...(o ?? {}) };
  });
}

/* ═══════════════ shared content ═══════════════ */

const OCCASIONS: Tile[] = [
  { label: "Birthday", sub: "Bright & joyful", href: "/occasions/birthday", bg: "linear-gradient(160deg,#FBEFDD,#F2D9AE)" },
  { label: "Anniversary", sub: "Romantic classics", href: "/occasions/anniversary", bg: "linear-gradient(160deg,#F3DCE3,#E0B4C4)" },
  { label: "Love & Romance", sub: "Say it properly", href: "/occasions/love", bg: "linear-gradient(160deg,#F8E4E8,#EFC5CF)" },
  { label: "Get Well Soon", sub: "Gentle & calming", href: "/occasions/get-well-soon", bg: "linear-gradient(160deg,#E9F2EC,#CBE0D2)" },
];

const budgets = (slug: string): BudgetTile[] => [
  { kicker: "Thoughtful", label: "Under ৳1,500", href: `/${slug}?max=1500`, bg: "linear-gradient(160deg,#F4E9F7,#DFC9EC)" },
  { kicker: "Most loved", label: "৳1,500 – ৳3,000", href: `/${slug}?min=1500&max=3000`, bg: "linear-gradient(160deg,#F7E7F1,#E7C6DE)" },
  { kicker: "Premium", label: "৳3,000 – ৳6,000", href: `/${slug}?min=3000&max=6000`, bg: "linear-gradient(160deg,#F1E4F8,#DFC5F0)" },
  { kicker: "Luxury", label: "৳6,000 +", href: `/${slug}?min=6000`, bg: "linear-gradient(160deg,#F1DFE6,#DDB8C6)" },
];

const ALL_CATEGORIES: Record<string, Tile> = {
  "fresh-flowers": { label: "Fresh Flowers", sub: "Hand-arranged daily", href: "/fresh-flowers", bg: "linear-gradient(160deg,#F6E3F3,#EAC3E6)" },
  cakes: { label: "Cakes", sub: "Baked fresh daily", href: "/cakes", bg: "linear-gradient(160deg,#FBEDE4,#F2D3C0)" },
  "flower-combos": { label: "Flower Combos", sub: "Flowers + cake + card", href: "/flower-combos", bg: "linear-gradient(160deg,#F1E4F8,#DFC5F0)" },
  chocolates: { label: "Chocolates", sub: "Premium boxes", href: "/chocolates", bg: "linear-gradient(160deg,#F4E6DE,#E5CBBB)" },
  plants: { label: "Plants", sub: "Gifts that grow", href: "/plants", bg: "linear-gradient(160deg,#E7F2E7,#CBE3CE)" },
  personalised: { label: "Personalised", sub: "Made only for them", href: "/personalised", bg: "linear-gradient(160deg,#F3E7F8,#E1C9F1)" },
  "balloon-bouquets": { label: "Balloon Bouquets", sub: "Float their heart", href: "/balloon-bouquets", bg: "linear-gradient(160deg,#FBEAF0,#F2CBDD)" },
  "gift-boxes": { label: "Gift Boxes", sub: "Curated with love", href: "/gift-boxes", bg: "linear-gradient(160deg,#F1E6F6,#DFC8ED)" },
};

/** Four cross-sell tiles, its own category excluded */
const crossSell = (self: string, picks: string[]): Tile[] =>
  picks.filter((p) => p !== self).slice(0, 4).map((p) => ALL_CATEGORIES[p]);

const FLOWER_COMBOS: Tile[] = [
  { label: "Flowers + Cake", sub: "From ৳2,890", href: "/flower-combos", bg: "linear-gradient(160deg,#FBEDE4,#F2D3C0)" },
  { label: "Flowers + Chocolates", sub: "From ৳2,450", href: "/flower-combos", bg: "linear-gradient(160deg,#F4E6DE,#E5CBBB)" },
  { label: "Flowers + Balloons", sub: "From ৳2,190", href: "/flower-combos", bg: "linear-gradient(160deg,#FBEAF0,#F2CBDD)" },
  { label: "All Combos", sub: "8 hampers", href: "/flower-combos", bg: "linear-gradient(160deg,#F1E4F8,#DFC5F0)" },
];

const DELIVERY_FAQ: Faq[] = [
  {
    q: "How fast can you deliver in Dhaka?",
    a: "Pick Express delivery at checkout and you'll see the exact promise and the live cut-off timer for it on the product page — the times come straight from what our studio can do that day.",
  },
  {
    q: "Do you deliver outside Dhaka?",
    a: "We deliver nationwide. Outside Dhaka we ship courier-safe items only, with 1–3 day delivery. Switch to All Bangladesh at the top and you'll only see what travels safely.",
  },
  {
    q: "Can I add a gift message or send anonymously?",
    a: "Both. Add a free handwritten message card at checkout, and toggle Anonymous Gift if you don't want your name on the card.",
  },
  {
    q: "What if nobody is home at delivery time?",
    a: "Our rider calls the recipient, then you. We can leave it with a guard or neighbour with your approval, or re-attempt the same day at no extra cost.",
  },
];

/* ═══════════════ CONFIGS ═══════════════ */

export const CATEGORY_CONFIGS: Record<string, CategoryConfig> = {
  /* ─────────── FRESH FLOWERS ─────────── */
  "fresh-flowers": {
    slug: "fresh-flowers",
    cat: "flowers",
    label: "Fresh Flowers",
    h1: "Fresh Flowers, Arranged This Morning",
    lead: "Every bouquet, box and vase here is built the day it's delivered — never pre-made, never left waiting. Choose the bloom, we'll handle the moment.",
    bannerBg: "linear-gradient(135deg,#FDF9FF 0%,#F7F1FB 46%,#F9E9FD 100%)",
    totalProducts: 108,
    seo: {
      title: "Fresh Flowers — Same Day & Express Flower Delivery in Dhaka | Radian",
      description:
        "Send fresh flowers in Dhaka with express, same day and midnight delivery. Hand-arranged the same morning. Nationwide delivery across Bangladesh.",
    },
    sections: makeSections({
      subCategoryRail: { eyebrow: "Shop by flower", heading: "Every Bloom We Carry", subheading: "Know the flower you want? Start here." },
      bestsellers: { heading: "Dhaka's Favourite Flowers", subheading: "The eight arrangements our customers reorder most — all ready to send today." },
      attributeGrid: { heading: "How Would You Like It Presented?", subheading: "Same flowers, very different moments." },
      occasionGrid: { heading: "Flowers For The Moment", subheading: "Not sure which bloom fits? Let the occasion decide." },
      colourGrid: { heading: "Say It In The Right Shade", subheading: "Colour carries meaning. Pick the one that matches your message." },
      productGrid: { heading: "All Flowers" },
      comboRail: { heading: "Flowers, Plus Something Sweet", subheading: "The most-ordered pairings in Dhaka — delivered as one gift, in one box." },
      deliveryBand: { heading: "Flowers That Arrive While It Still Matters" },
      giftFinder: {
        heading: "Not Sure Which Flowers To Send?",
        subheading: "Answer three quick questions — who it's for, the occasion, your budget — and we'll shortlist the arrangements that actually fit.",
      },
      faq: { heading: "Flowers — Frequently Asked" },
    }),
    subCategories: [
      { label: "Roses", sub: "24 designs", href: "/fresh-flowers/roses", bg: "linear-gradient(160deg,#F8E4E8,#EFC5CF)" },
      { label: "Tuberose", sub: "9 designs", href: "/fresh-flowers/tuberose", bg: "linear-gradient(160deg,#F2ECF6,#DED2EA)" },
      { label: "Gerbera", sub: "12 designs", href: "/fresh-flowers/gerbera", bg: "linear-gradient(160deg,#FBEFDD,#F2D9AE)" },
      { label: "Lilies", sub: "11 designs", href: "/fresh-flowers/lilies", bg: "linear-gradient(160deg,#F6F2FA,#E3DCEC)" },
      { label: "Orchids", sub: "8 designs", href: "/fresh-flowers/orchids", bg: "linear-gradient(160deg,#F1E4F8,#DFC5F0)" },
      { label: "Carnation", sub: "10 designs", href: "/fresh-flowers/carnation", bg: "linear-gradient(160deg,#FBE7EE,#EFC5D4)" },
      { label: "Sunflower", sub: "6 designs", href: "/fresh-flowers/sunflower", bg: "linear-gradient(160deg,#FCF0D6,#F0DA9C)" },
      { label: "Mixed Blooms", sub: "18 designs", href: "/fresh-flowers/mixed", bg: "linear-gradient(160deg,#F4E9F7,#DFC9EC)" },
    ],
    attributes: [
      { label: "Bouquet", sub: "Classic wrap", href: "/fresh-flowers?style=bouquet", bg: "linear-gradient(160deg,#F8E7F5,#EDC7E6)" },
      { label: "Flower Box", sub: "Signature", href: "/fresh-flowers?style=box", bg: "linear-gradient(160deg,#F7E7F1,#E7C6DE)" },
      { label: "Vase", sub: "Ready to place", href: "/fresh-flowers?style=vase", bg: "linear-gradient(160deg,#F2ECF6,#DED2EA)" },
      { label: "Basket", sub: "Grand gesture", href: "/fresh-flowers?style=basket", bg: "linear-gradient(160deg,#FBEFDD,#F2D9AE)" },
      { label: "Heart Shape", sub: "Romantic", href: "/fresh-flowers?style=heart", bg: "linear-gradient(160deg,#F3DCE3,#E0B4C4)" },
      { label: "Standing Spray", sub: "Corporate", href: "/fresh-flowers?style=standing", bg: "linear-gradient(160deg,#F1DFE6,#DDB8C6)" },
    ],
    occasions: OCCASIONS,
    colours: [
      { label: "Red", sub: "Love & passion", swatch: "#C7263C", href: "/fresh-flowers?colour=red" },
      { label: "Pink", sub: "Admiration", swatch: "#E88BB4", href: "/fresh-flowers?colour=pink" },
      { label: "White", sub: "Purity & peace", swatch: "#F2ECF6", href: "/fresh-flowers?colour=white" },
      { label: "Yellow", sub: "Joy & friendship", swatch: "#E9B93A", href: "/fresh-flowers?colour=yellow" },
      { label: "Purple", sub: "Grace & luxury", swatch: "#8A45B8", href: "/fresh-flowers?colour=purple" },
      { label: "Mixed", sub: "A bit of everything", swatch: "linear-gradient(135deg,#C7263C,#E9B93A 45%,#8A45B8)", href: "/fresh-flowers?colour=mixed" },
    ],
    budgets: budgets("fresh-flowers"),
    combos: FLOWER_COMBOS,
    crossSell: crossSell("fresh-flowers", ["cakes", "chocolates", "plants", "gift-boxes"]),
    faqs: [
      { q: "How fresh are Radian flowers?", a: "Every arrangement is built the same morning it ships. We buy daily — nothing is pre-made and left sitting in a cold room." },
      ...DELIVERY_FAQ,
      { q: "Will the flowers look exactly like the photo?", a: "Yes — same size, same colour story, same wrap. If a specific bloom is unavailable that day we substitute with an equal or higher-value flower and message you first." },
      { q: "Which flowers last the longest?", a: "Orchids, carnations and lilies typically stay fresh 6–8 days. Roses and gerberas last 4–6 days with a daily water change and a cool spot away from direct sun." },
    ],
  },

  /* ─────────── CAKES ─────────── */
  cakes: {
    slug: "cakes",
    cat: "cakes",
    label: "Cakes",
    h1: "Cakes, Baked The Same Morning",
    lead: "No frozen shelf, no day-old sponge. Every cake is baked the day it reaches the table.",
    bannerBg: "linear-gradient(135deg,#FFFBF7 0%,#FBEDE4 46%,#F2D3C0 100%)",
    totalProducts: 62,
    seo: {
      title: "Cake Delivery in Dhaka — Same Day & Midnight Cakes | Radian",
      description: "Order fresh cakes in Dhaka. Same day and midnight cake delivery, baked the same morning.",
    },
    sections: makeSections({
      subCategoryRail: { eyebrow: "Shop by flavour", heading: "Every Flavour We Bake", subheading: "Pick the flavour — we'll handle the rest." },
      bestsellers: { heading: "Dhaka's Favourite Cakes", subheading: "The eight cakes our customers reorder most." },
      attributeGrid: { eyebrow: "Shop by size", heading: "What Size Do You Need?", subheading: "Count the people, then pick." },
      occasionGrid: { heading: "Cakes For The Moment" },
      readyToday: { subheading: "Baked, boxed, and out the door within the hour." },
      colourGrid: false, // ← colour is meaningless on a cake
      productGrid: { heading: "All Cakes" },
      comboRail: { heading: "Cakes, Plus Flowers", subheading: "One gift, one delivery, one very good surprise." },
      deliveryBand: { heading: "Cakes That Arrive While It Still Matters" },
      giftFinder: { heading: "Not Sure Which Cake To Send?", subheading: "Tell us who it's for, the occasion and your budget — we'll shortlist the right ones." },
      faq: { heading: "Cakes — Frequently Asked" },
    }),
    subCategories: [
      { label: "Chocolate", sub: "Always safe", href: "/cakes/chocolate", bg: "linear-gradient(160deg,#F0E2D8,#DCC0AC)" },
      { label: "Red Velvet", sub: "Crowd favourite", href: "/cakes/red-velvet", bg: "linear-gradient(160deg,#F7E0E4,#E7BAC3)" },
      { label: "Vanilla", sub: "Light & classic", href: "/cakes/vanilla", bg: "linear-gradient(160deg,#FBF3E4,#EFDFBE)" },
      { label: "Fruit Cake", sub: "Fresh & light", href: "/cakes/fruit", bg: "linear-gradient(160deg,#F2F0DC,#DCD9A8)" },
      { label: "Photo Cake", sub: "Personalised", href: "/cakes/photo", bg: "linear-gradient(160deg,#F1E4F8,#DFC5F0)" },
      { label: "Bento Cake", sub: "Small & cute", href: "/cakes/bento", bg: "linear-gradient(160deg,#FBEAF0,#F2CBDD)" },
    ],
    attributes: [
      { label: "0.5 kg", sub: "2–4 people", href: "/cakes?size=0.5", bg: "linear-gradient(160deg,#FBF3E4,#EFDFBE)" },
      { label: "1 kg", sub: "5–8 people", href: "/cakes?size=1", bg: "linear-gradient(160deg,#FBEDE4,#F2D3C0)" },
      { label: "1.5 kg", sub: "10–12 people", href: "/cakes?size=1.5", bg: "linear-gradient(160deg,#F0E2D8,#DCC0AC)" },
      { label: "2 kg", sub: "15+ people", href: "/cakes?size=2", bg: "linear-gradient(160deg,#F7E0E4,#E7BAC3)" },
      { label: "Tiered", sub: "Big celebrations", href: "/cakes?size=tiered", bg: "linear-gradient(160deg,#F1E4F8,#DFC5F0)" },
      { label: "Bento", sub: "Just for one", href: "/cakes?size=bento", bg: "linear-gradient(160deg,#FBEAF0,#F2CBDD)" },
    ],
    occasions: OCCASIONS,
    colours: [],
    budgets: budgets("cakes"),
    combos: [
      { label: "Cake + Flowers", sub: "From ৳2,890", href: "/flower-combos", bg: "linear-gradient(160deg,#F8E7F5,#EDC7E6)" },
      { label: "Cake + Balloons", sub: "From ৳2,190", href: "/flower-combos", bg: "linear-gradient(160deg,#FBEAF0,#F2CBDD)" },
      { label: "Cake + Teddy", sub: "From ৳2,350", href: "/flower-combos", bg: "linear-gradient(160deg,#F4E6DE,#E5CBBB)" },
      { label: "All Combos", sub: "8 hampers", href: "/flower-combos", bg: "linear-gradient(160deg,#F1E4F8,#DFC5F0)" },
    ],
    crossSell: crossSell("cakes", ["fresh-flowers", "balloon-bouquets", "chocolates", "gift-boxes"]),
    faqs: [
      { q: "Are cakes baked fresh?", a: "Yes. Every cake is baked the morning it is delivered — nothing frozen, nothing from yesterday." },
      { q: "Can I get midnight cake delivery?", a: "Inside Dhaka, yes. Pre-book before 6 PM and we deliver between 12:00 and 12:30 AM." },
      { q: "Do you deliver cakes outside Dhaka?", a: "Fresh cream cakes are Dhaka-only — they don't survive the courier journey. Outside Dhaka we suggest chocolates or hampers instead." },
      { q: "Can I put a photo or name on the cake?", a: "Yes. Choose a Photo Cake and upload the image at checkout. Name printing is free on every cake." },
      { q: "Is eggless available?", a: "Most flavours have an eggless version. Select it on the product page before adding to cart." },
      ...DELIVERY_FAQ.slice(2),
    ],
  },

  /* ─────────── FLOWER COMBOS ─────────── */
  "flower-combos": {
    slug: "flower-combos",
    cat: "combos",
    label: "Flower Combos",
    h1: "Two Gifts. One Delivery. Twice The Surprise.",
    lead: "Flowers with a cake. Flowers with chocolate. Packed together, delivered together — so nothing arrives half-finished.",
    bannerBg: "linear-gradient(135deg,#FDF9FF 0%,#F1E4F8 46%,#DFC5F0 100%)",
    totalProducts: 34,
    seo: {
      title: "Flower & Gift Combos in Dhaka — Flowers with Cake, Chocolate | Radian",
      description: "Send flower combos in Dhaka. Flowers with cake, chocolate or balloons — one gift, one delivery. Same day and midnight available.",
    },
    sections: makeSections({
      subCategoryRail: { eyebrow: "Shop by pairing", heading: "What's Inside The Box?", subheading: "Pick the pairing, we'll build it." },
      bestsellers: { heading: "The Combos Dhaka Reorders", subheading: "Tested pairings — not random items thrown in a box." },
      attributeGrid: { eyebrow: "Shop by scale", heading: "How Big Should It Be?", subheading: "From a quiet gesture to a full surprise." },
      occasionGrid: { heading: "Combos For The Moment" },
      readyToday: { subheading: "Built and boxed, out the door within the hour." },
      colourGrid: false,
      productGrid: { heading: "All Combos" },
      comboRail: false, // ← this IS the combo page; showing combos again is pointless
      deliveryBand: { heading: "Combos That Arrive While It Still Matters" },
      giftFinder: { heading: "Not Sure Which Combo To Send?", subheading: "Tell us who it's for and your budget — we'll pick the pairing that lands." },
      faq: { heading: "Combos — Frequently Asked" },
    }),
    subCategories: [
      { label: "Flowers + Cake", sub: "Most ordered", href: "/flower-combos/flowers-cake", bg: "linear-gradient(160deg,#FBEDE4,#F2D3C0)" },
      { label: "Flowers + Chocolate", sub: "Courier-safe", href: "/flower-combos/flowers-chocolate", bg: "linear-gradient(160deg,#F4E6DE,#E5CBBB)" },
      { label: "Flowers + Balloons", sub: "Bright & loud", href: "/flower-combos/flowers-balloon", bg: "linear-gradient(160deg,#FBEAF0,#F2CBDD)" },
      { label: "Cake + Teddy", sub: "Kids favourite", href: "/flower-combos/cake-teddy", bg: "linear-gradient(160deg,#F6EBE2,#E9D2BE)" },
      { label: "Luxury Hampers", sub: "The full surprise", href: "/flower-combos/luxury", bg: "linear-gradient(160deg,#F1E4F8,#DFC5F0)" },
    ],
    attributes: [
      { label: "Petite", sub: "Under ৳2,000", href: "/flower-combos?scale=petite", bg: "linear-gradient(160deg,#F8E7F5,#EDC7E6)" },
      { label: "Classic", sub: "৳2,000–3,500", href: "/flower-combos?scale=classic", bg: "linear-gradient(160deg,#F7E7F1,#E7C6DE)" },
      { label: "Grand", sub: "৳3,500–6,000", href: "/flower-combos?scale=grand", bg: "linear-gradient(160deg,#F1E4F8,#DFC5F0)" },
      { label: "Luxury", sub: "৳6,000 +", href: "/flower-combos?scale=luxury", bg: "linear-gradient(160deg,#F1DFE6,#DDB8C6)" },
    ],
    occasions: OCCASIONS,
    colours: [],
    budgets: budgets("flower-combos"),
    combos: [],
    crossSell: crossSell("flower-combos", ["fresh-flowers", "cakes", "chocolates", "gift-boxes"]),
    faqs: [
      { q: "Does everything arrive together?", a: "Yes. A combo is packed as one gift and delivered in one trip — you never get the flowers today and the cake tomorrow." },
      { q: "Can I swap an item inside a combo?", a: "Not on the website. Message us on WhatsApp before ordering and we'll build a custom pairing for you." },
      { q: "Are combos available outside Dhaka?", a: "Only the courier-safe ones — flowers with chocolate, or hampers. Fresh cream cake combos are Dhaka-only." },
      ...DELIVERY_FAQ.slice(2),
    ],
  },

  /* ─────────── CHOCOLATES ─────────── */
  chocolates: {
    slug: "chocolates",
    cat: "chocolates",
    label: "Chocolates",
    h1: "Chocolate That Survives The Journey",
    lead: "Imported classics and handmade truffles, packed to travel. The one gift that reaches every district of Bangladesh intact.",
    bannerBg: "linear-gradient(135deg,#FFFCF8 0%,#F4E6DE 46%,#E5CBBB 100%)",
    totalProducts: 46,
    seo: {
      title: "Chocolate Gifts in Dhaka — Chocolate Bouquets & Hampers | Radian",
      description: "Send chocolate gifts across Bangladesh. Imported and handmade chocolate boxes, bouquets and hampers. Courier-safe, nationwide delivery.",
    },
    sections: makeSections({
      subCategoryRail: { eyebrow: "Shop by kind", heading: "Every Chocolate We Carry", subheading: "Imported classics or handmade — your call." },
      bestsellers: { heading: "Dhaka's Favourite Chocolates", subheading: "The eight boxes our customers reorder most." },
      attributeGrid: { eyebrow: "Shop by size", heading: "How Big A Gesture?", subheading: "From a small thank-you to a proper hamper." },
      occasionGrid: { heading: "Chocolates For The Moment" },
      readyToday: { subheading: "In stock, packed, out the door within the hour." },
      colourGrid: false,
      productGrid: { heading: "All Chocolates" },
      comboRail: { heading: "Chocolate, Plus Flowers", subheading: "The pairing that never fails." },
      deliveryBand: { heading: "Chocolates That Arrive Anywhere In Bangladesh" },
      giftFinder: { heading: "Not Sure Which Box To Send?", subheading: "Tell us who it's for and your budget — we'll shortlist the right ones." },
      faq: { heading: "Chocolates — Frequently Asked" },
    }),
    subCategories: [
      { label: "Imported", sub: "Lindt, Ferrero", href: "/chocolates/imported", bg: "linear-gradient(160deg,#EFE1D4,#D9BFA6)" },
      { label: "Handmade", sub: "Made in Dhaka", href: "/chocolates/handmade", bg: "linear-gradient(160deg,#F2E6DE,#DCC3B0)" },
      { label: "Chocolate Bouquet", sub: "Flowers, but edible", href: "/chocolates/bouquet", bg: "linear-gradient(160deg,#F4E8E2,#E0C7B8)" },
      { label: "Hampers", sub: "The big one", href: "/chocolates/hamper", bg: "linear-gradient(160deg,#EFE3EC,#D5BFD2)" },
    ],
    attributes: [
      { label: "Small Box", sub: "Under ৳1,000", href: "/chocolates?size=small", bg: "linear-gradient(160deg,#F6EEDD,#E5D2AC)" },
      { label: "Medium Box", sub: "৳1,000–2,000", href: "/chocolates?size=medium", bg: "linear-gradient(160deg,#F3E7DD,#E3CBB6)" },
      { label: "Large Box", sub: "৳2,000–3,500", href: "/chocolates?size=large", bg: "linear-gradient(160deg,#EFE1D4,#D9BFA6)" },
      { label: "Hamper", sub: "৳3,500 +", href: "/chocolates?size=hamper", bg: "linear-gradient(160deg,#E8DDD5,#CBB29E)" },
    ],
    occasions: OCCASIONS,
    colours: [],
    budgets: budgets("chocolates"),
    combos: FLOWER_COMBOS,
    crossSell: crossSell("chocolates", ["fresh-flowers", "cakes", "gift-boxes", "personalised"]),
    faqs: [
      { q: "Will chocolate melt on the way?", a: "We ship chocolate in insulated packing and avoid the hottest hours. In peak summer we recommend same-day Dhaka delivery over long-distance courier." },
      { q: "Are the imported chocolates genuine?", a: "Yes — sourced through authorised importers, with batch and expiry printed on every box." },
      { q: "Can I send chocolate anywhere in Bangladesh?", a: "Yes. Chocolate is our most courier-safe category — it reaches all 64 districts in 1–3 days." },
      ...DELIVERY_FAQ.slice(2),
    ],
  },

  /* ─────────── PLANTS ─────────── */
  plants: {
    slug: "plants",
    cat: "plants",
    label: "Plants",
    h1: "A Gift That's Still Alive Next Year",
    lead: "Flowers last a week. A plant outlives the occasion, the argument, and probably the relationship that caused it. Hand-potted in Dhaka.",
    bannerBg: "linear-gradient(135deg,#FBFDFA 0%,#E7F2E7 46%,#CBE3CE 100%)",
    totalProducts: 38,
    seo: {
      title: "Indoor Plants Delivery in Dhaka — Gift Plants Online | Radian",
      description: "Send indoor plants, succulents and bonsai across Bangladesh. Hand-potted, courier-safe, delivered alive.",
    },
    sections: makeSections({
      subCategoryRail: { eyebrow: "Shop by plant", heading: "Every Plant We Grow", subheading: "From no-effort to full green thumb." },
      bestsellers: { heading: "The Plants Dhaka Keeps Alive", subheading: "Hardy, forgiving, and hard to kill — our eight most gifted." },
      attributeGrid: { eyebrow: "Shop by pot", heading: "Which Pot Suits Their Space?", subheading: "Desk, corner, or windowsill." },
      occasionGrid: { heading: "Plants For The Moment" },
      readyToday: { heading: "Potted And Ready Today", subheading: "In stock, potted, and out the door within the hour." },
      colourGrid: false,
      productGrid: { heading: "All Plants" },
      comboRail: { heading: "Plants, Plus Something Sweet", subheading: "Pair it with chocolate or a card." },
      deliveryBand: { heading: "Plants That Arrive Alive" },
      giftFinder: { heading: "Not Sure Which Plant To Send?", subheading: "Tell us the space and how much care they'll actually give it — we'll pick honestly." },
      faq: { heading: "Plants — Frequently Asked" },
    }),
    subCategories: [
      { label: "Indoor", sub: "Low light, low effort", href: "/plants/indoor", bg: "linear-gradient(160deg,#E7F2E7,#CBE3CE)" },
      { label: "Air Purifying", sub: "Cleans the air", href: "/plants/air-purifying", bg: "linear-gradient(160deg,#E3EEE4,#C3DCC7)" },
      { label: "Succulents", sub: "Almost no care", href: "/plants/succulents", bg: "linear-gradient(160deg,#EAF1E6,#CBDCC2)" },
      { label: "Flowering", sub: "Green + colour", href: "/plants/flowering", bg: "linear-gradient(160deg,#EDF3EC,#CFE0CE)" },
      { label: "Bonsai", sub: "Statement piece", href: "/plants/bonsai", bg: "linear-gradient(160deg,#E5EDE3,#C2D4BF)" },
      { label: "Lucky Bamboo", sub: "Housewarming", href: "/plants/lucky-bamboo", bg: "linear-gradient(160deg,#E9F2EE,#C7DED4)" },
    ],
    attributes: [
      { label: "Ceramic Pot", sub: "Clean & modern", href: "/plants?pot=ceramic", bg: "linear-gradient(160deg,#F1F4F6,#D4DCE2)" },
      { label: "Terracotta", sub: "Warm & classic", href: "/plants?pot=terracotta", bg: "linear-gradient(160deg,#F4E5DC,#E0BFA9)" },
      { label: "Desk Size", sub: "Office friendly", href: "/plants?pot=desk", bg: "linear-gradient(160deg,#EDF1E4,#D2DBBE)" },
      { label: "Floor Plant", sub: "Fills a corner", href: "/plants?pot=floor", bg: "linear-gradient(160deg,#E4EFE6,#C0D8C6)" },
    ],
    occasions: OCCASIONS,
    colours: [],
    budgets: budgets("plants"),
    combos: [
      { label: "Plant + Chocolates", sub: "From ৳1,890", href: "/flower-combos", bg: "linear-gradient(160deg,#F4E6DE,#E5CBBB)" },
      { label: "Plant + Card", sub: "From ৳990", href: "/flower-combos", bg: "linear-gradient(160deg,#F1E6F6,#DFC8ED)" },
      { label: "Plant + Cake", sub: "From ৳2,390", href: "/flower-combos", bg: "linear-gradient(160deg,#FBEDE4,#F2D3C0)" },
      { label: "All Combos", sub: "8 hampers", href: "/flower-combos", bg: "linear-gradient(160deg,#F1E4F8,#DFC5F0)" },
    ],
    crossSell: crossSell("plants", ["fresh-flowers", "gift-boxes", "personalised", "chocolates"]),
    faqs: [
      { q: "Will the plant survive the courier journey?", a: "Yes. We pack the soil tight, brace the stem, and ship in a vented box. If a plant arrives damaged, send a photo within 24 hours and we replace it free." },
      { q: "Which plant is best for someone who forgets to water?", a: "Snake Plant or a succulent. Both survive weeks of neglect — that's genuinely why we stock them." },
      { q: "Do you deliver plants outside Dhaka?", a: "Yes, courier-safe plants ship to all 64 districts. Large floor plants (like the Areca Palm) are Dhaka-only." },
      ...DELIVERY_FAQ.slice(2),
    ],
  },

  /* ─────────── PERSONALISED ─────────── */
  personalised: {
    slug: "personalised",
    cat: "personalised",
    label: "Personalised",
    h1: "Their Name On It. Nobody Else Has One.",
    lead: "A photo, a name, a date, a song. Printed and engraved in our Dhaka studio — the kind of gift that never gets re-gifted.",
    bannerBg: "linear-gradient(135deg,#FDFAFF 0%,#F3E7F8 46%,#E1C9F1 100%)",
    totalProducts: 52,
    seo: {
      title: "Personalised Gifts in Dhaka — Photo Mugs, Frames, Name Lamps | Radian",
      description: "Send personalised gifts across Bangladesh. Photo mugs, engraved frames, name lamps and custom albums. Printed in Dhaka.",
    },
    sections: makeSections({
      subCategoryRail: { eyebrow: "Shop by gift", heading: "Everything We Can Personalise", subheading: "Pick the object — you supply the memory." },
      bestsellers: { heading: "Most Personalised This Month", subheading: "The eight our customers keep coming back for." },
      attributeGrid: { eyebrow: "Personalise with", heading: "What Goes On It?", subheading: "A photo, a name, a date, or all three." },
      occasionGrid: { heading: "Personalised For The Moment" },
      readyToday: { heading: "Printed And Ready Today", subheading: "Order before 2 PM inside Dhaka and it goes out the same day." },
      colourGrid: false,
      productGrid: { heading: "All Personalised Gifts" },
      comboRail: { heading: "Personalised, Plus Flowers", subheading: "The keepsake and the moment, together." },
      deliveryBand: { heading: "Personalised Gifts, Delivered Nationwide" },
      giftFinder: { heading: "Not Sure What To Personalise?", subheading: "Tell us the relationship and the occasion — we'll shortlist what actually gets kept." },
      faq: { heading: "Personalised — Frequently Asked" },
    }),
    subCategories: [
      { label: "Photo Mugs", sub: "From ৳590", href: "/personalised/mugs", bg: "linear-gradient(160deg,#F1E6F6,#DFC8ED)" },
      { label: "Photo Frames", sub: "Engraved wood", href: "/personalised/frames", bg: "linear-gradient(160deg,#F2E9DF,#DCC9B4)" },
      { label: "Name Lamps", sub: "Glows their name", href: "/personalised/lamps", bg: "linear-gradient(160deg,#EFE7F8,#D6C2EE)" },
      { label: "Cushions", sub: "Photo printed", href: "/personalised/cushions", bg: "linear-gradient(160deg,#F8E7EE,#EBC6D6)" },
      { label: "Photo Albums", sub: "Up to 40 photos", href: "/personalised/albums", bg: "linear-gradient(160deg,#EDE8F5,#CFC5E8)" },
      { label: "Engraved", sub: "Keychains & plaques", href: "/personalised/engraved", bg: "linear-gradient(160deg,#EEF0F5,#CCD2E0)" },
    ],
    attributes: [
      { label: "A Photo", sub: "Upload any image", href: "/personalised?with=photo", bg: "linear-gradient(160deg,#F1E6F6,#DFC8ED)" },
      { label: "Their Name", sub: "Printed or engraved", href: "/personalised?with=name", bg: "linear-gradient(160deg,#EFE7F8,#D6C2EE)" },
      { label: "A Message", sub: "Your words, kept", href: "/personalised?with=message", bg: "linear-gradient(160deg,#F5EDF8,#DFCCEC)" },
      { label: "A Date", sub: "The day it happened", href: "/personalised?with=date", bg: "linear-gradient(160deg,#EEF0F5,#CCD2E0)" },
    ],
    occasions: OCCASIONS,
    colours: [],
    budgets: budgets("personalised"),
    combos: FLOWER_COMBOS,
    crossSell: crossSell("personalised", ["fresh-flowers", "gift-boxes", "chocolates", "cakes"]),
    faqs: [
      { q: "How long does personalisation take?", a: "Mugs, keychains and frames print same-day inside Dhaka if ordered before 2 PM. Albums and engraved plaques need 2–3 days." },
      { q: "What photo quality do I need?", a: "Anything above 1000×1000 pixels prints cleanly. If your photo is too small we'll message you before printing — we never print something that will look bad." },
      { q: "Can I see a preview before it's printed?", a: "Yes. We send a digital mock-up on WhatsApp for approval before anything goes to print." },
      { q: "Can personalised gifts be returned?", a: "Personalised items can't be resold, so they're non-returnable — unless there's a print defect or damage, which we replace free." },
      ...DELIVERY_FAQ.slice(1, 3),
    ],
  },

  /* ─────────── BALLOON BOUQUETS ─────────── */
  "balloon-bouquets": {
    slug: "balloon-bouquets",
    cat: "balloons",
    label: "Balloon Bouquets",
    h1: "Walk In With Balloons. Watch The Room Change.",
    lead: "Numbers, letters, hearts and full arches — inflated at our studio and delivered standing up, not in a flat bag.",
    bannerBg: "linear-gradient(135deg,#FFFAFC 0%,#FBEAF0 46%,#F2CBDD 100%)",
    totalProducts: 41,
    seo: {
      title: "Balloon Delivery in Dhaka — Birthday & Party Balloon Bouquets | Radian",
      description: "Send balloon bouquets in Dhaka. Number, letter and heart balloons, party arches. Inflated and delivered ready.",
    },
    sections: makeSections({
      subCategoryRail: { eyebrow: "Shop by set", heading: "Every Balloon Set We Make", subheading: "Pick the moment — we'll inflate it." },
      bestsellers: { heading: "Dhaka's Favourite Balloon Sets", subheading: "The eight our customers reorder most." },
      attributeGrid: { eyebrow: "Shop by scale", heading: "How Loud Should It Be?", subheading: "One bunch, or the whole room." },
      occasionGrid: { heading: "Balloons For The Moment" },
      readyToday: { heading: "Inflated And Ready Now", subheading: "Filled, tied, and out the door within the hour." },
      colourGrid: { heading: "Pick Your Palette", subheading: "The colour sets the mood before anyone says a word." },
      productGrid: { heading: "All Balloon Bouquets" },
      comboRail: { heading: "Balloons, Plus Cake", subheading: "The full birthday, in one delivery." },
      deliveryBand: { heading: "Balloons That Arrive Standing Up" },
      giftFinder: { heading: "Not Sure Which Set To Send?", subheading: "Tell us the occasion and the room — we'll pick the right scale." },
      faq: { heading: "Balloons — Frequently Asked" },
    }),
    subCategories: [
      { label: "Birthday", sub: "Party ready", href: "/balloon-bouquets/birthday", bg: "linear-gradient(160deg,#F9EAF3,#F0CBE2)" },
      { label: "Number", sub: "Any age", href: "/balloon-bouquets/number", bg: "linear-gradient(160deg,#F8EDE6,#EACFBE)" },
      { label: "Letter", sub: "Spell their name", href: "/balloon-bouquets/letter", bg: "linear-gradient(160deg,#F3EAF9,#D9C6EE)" },
      { label: "Love & Hearts", sub: "Midnight ready", href: "/balloon-bouquets/love", bg: "linear-gradient(160deg,#F8E0E7,#EEBECB)" },
      { label: "Congratulations", sub: "Promotions & wins", href: "/balloon-bouquets/congrats", bg: "linear-gradient(160deg,#EDF3E8,#CFE0C6)" },
    ],
    attributes: [
      { label: "Small Bunch", sub: "5–7 balloons", href: "/balloon-bouquets?scale=small", bg: "linear-gradient(160deg,#FBEAF0,#F2CBDD)" },
      { label: "Bouquet", sub: "10–15 balloons", href: "/balloon-bouquets?scale=bouquet", bg: "linear-gradient(160deg,#F9EAF3,#F0CBE2)" },
      { label: "Room Set", sub: "25+ balloons", href: "/balloon-bouquets?scale=room", bg: "linear-gradient(160deg,#F6EBF6,#E1C7E4)" },
      { label: "Full Arch", sub: "Photo-wall scale", href: "/balloon-bouquets?scale=arch", bg: "linear-gradient(160deg,#F3EAF9,#D9C6EE)" },
    ],
    occasions: OCCASIONS,
    colours: [
      { label: "Rose Gold", sub: "Elegant & warm", swatch: "#B76E79", href: "/balloon-bouquets?colour=rose-gold" },
      { label: "Red", sub: "Love & drama", swatch: "#C7263C", href: "/balloon-bouquets?colour=red" },
      { label: "Pink", sub: "Soft & sweet", swatch: "#E88BB4", href: "/balloon-bouquets?colour=pink" },
      { label: "Blue", sub: "Cool & calm", swatch: "#5B8AC7", href: "/balloon-bouquets?colour=blue" },
      { label: "Chrome", sub: "Modern & shiny", swatch: "linear-gradient(135deg,#C9CFD8,#8E97A6)", href: "/balloon-bouquets?colour=chrome" },
      { label: "Pastel Mix", sub: "Soft rainbow", swatch: "linear-gradient(135deg,#F2CBDD,#E9B93A 50%,#9FD3C7)", href: "/balloon-bouquets?colour=pastel" },
    ],
    budgets: budgets("balloon-bouquets"),
    combos: [
      { label: "Balloons + Cake", sub: "From ৳2,190", href: "/flower-combos", bg: "linear-gradient(160deg,#FBEDE4,#F2D3C0)" },
      { label: "Balloons + Flowers", sub: "From ৳2,190", href: "/flower-combos", bg: "linear-gradient(160deg,#F8E7F5,#EDC7E6)" },
      { label: "Birthday Triple", sub: "From ৳3,490", href: "/flower-combos", bg: "linear-gradient(160deg,#FAE9F1,#F0CBDE)" },
      { label: "All Combos", sub: "8 hampers", href: "/flower-combos", bg: "linear-gradient(160deg,#F1E4F8,#DFC5F0)" },
    ],
    crossSell: crossSell("balloon-bouquets", ["cakes", "fresh-flowers", "personalised", "gift-boxes"]),
    faqs: [
      { q: "Do balloons arrive inflated?", a: "Yes. We inflate at the studio and deliver them standing — you never get a flat bag and a pump." },
      { q: "How long do the balloons stay up?", a: "Foil balloons hold for 5–7 days. Latex holds 12–24 hours, so we inflate those as late as possible before delivery." },
      { q: "Do you deliver balloons outside Dhaka?", a: "No — inflated balloons don't survive courier. Balloons are Inside Dhaka only." },
      { q: "Can you set up the decoration at the venue?", a: "For arches and room sets, yes. Message us on WhatsApp to book a setup slot." },
      ...DELIVERY_FAQ.slice(2, 3),
    ],
  },

  /* ─────────── GIFT BOXES ─────────── */
  "gift-boxes": {
    slug: "gift-boxes",
    cat: "giftboxes",
    label: "Gift Boxes",
    h1: "When One Gift Isn't Enough",
    lead: "Curated boxes for the moments where a single item would feel thin. Packed in Dhaka, shipped to all 64 districts.",
    bannerBg: "linear-gradient(135deg,#FDFAFF 0%,#F1E6F6 46%,#DFC8ED 100%)",
    totalProducts: 44,
    seo: {
      title: "Gift Hampers & Boxes in Dhaka — Curated Gift Sets | Radian",
      description: "Send curated gift boxes across Bangladesh. Boxes for him, for her, corporate hampers and luxury sets. Courier-safe nationwide.",
    },
    sections: makeSections({
      subCategoryRail: { eyebrow: "Shop by recipient", heading: "Who Is It For?", subheading: "We packed it with them in mind." },
      bestsellers: { heading: "Dhaka's Favourite Gift Boxes", subheading: "The eight our customers reorder most." },
      attributeGrid: { eyebrow: "Shop by scale", heading: "How Generous Are You Feeling?", subheading: "From a thank-you to a statement." },
      occasionGrid: { heading: "Gift Boxes For The Moment" },
      readyToday: { heading: "Packed And Ready Today", subheading: "In stock, sealed, out the door within the hour." },
      colourGrid: false,
      productGrid: { heading: "All Gift Boxes" },
      comboRail: { heading: "Boxes, Plus Flowers", subheading: "Add the moment to the keepsake." },
      deliveryBand: { heading: "Gift Boxes, Delivered Nationwide" },
      giftFinder: { heading: "Not Sure Which Box To Send?", subheading: "Tell us the relationship and your budget — we'll shortlist honestly." },
      faq: { heading: "Gift Boxes — Frequently Asked" },
    }),
    subCategories: [
      { label: "For Her", sub: "Self-care sets", href: "/gift-boxes/for-her", bg: "linear-gradient(160deg,#F7E9F2,#E4C6DA)" },
      { label: "For Him", sub: "Grooming & snacks", href: "/gift-boxes/for-him", bg: "linear-gradient(160deg,#E9EDF3,#C8D0DE)" },
      { label: "Corporate", sub: "Bulk welcome", href: "/gift-boxes/corporate", bg: "linear-gradient(160deg,#F0EBE2,#D5CBB6)" },
      { label: "Self-Care", sub: "Calm & unwind", href: "/gift-boxes/self-care", bg: "linear-gradient(160deg,#F3EEE6,#DCD1BE)" },
    ],
    attributes: [
      { label: "Thank You", sub: "Under ৳2,000", href: "/gift-boxes?scale=thanks", bg: "linear-gradient(160deg,#F1E6F6,#DFC8ED)" },
      { label: "Classic", sub: "৳2,000–3,500", href: "/gift-boxes?scale=classic", bg: "linear-gradient(160deg,#F7E9F2,#E4C6DA)" },
      { label: "Premium", sub: "৳3,500–6,000", href: "/gift-boxes?scale=premium", bg: "linear-gradient(160deg,#F0EBE2,#D5CBB6)" },
      { label: "Luxury", sub: "৳6,000 +", href: "/gift-boxes?scale=luxury", bg: "linear-gradient(160deg,#F1DFE6,#DDB8C6)" },
    ],
    occasions: OCCASIONS,
    colours: [],
    budgets: budgets("gift-boxes"),
    combos: FLOWER_COMBOS,
    crossSell: crossSell("gift-boxes", ["fresh-flowers", "chocolates", "personalised", "plants"]),
    faqs: [
      { q: "Can I see what's inside before ordering?", a: "Yes — every box lists its full contents on the product page. No surprises for you, only for them." },
      { q: "Do you do corporate gifting in bulk?", a: "Yes. For 10+ boxes we offer branded packing and a dedicated coordinator. Message us on WhatsApp with your headcount." },
      { q: "Can I customise what goes in the box?", a: "Not on the website. For custom boxes, message us on WhatsApp and we'll build one to your budget." },
      ...DELIVERY_FAQ.slice(1),
    ],
  },
};

export const CATEGORY_SLUGS = Object.keys(CATEGORY_CONFIGS);

/* ═══════════════ SUB-CATEGORY — derived from the parent ═══════════════
   A new sub is never written by hand — it is built from the parent's
   subCategories tiles. categoryProducts() already filters by config.sub.
   Section order + content inherit from the parent; only a few headings are
   sub-specific. One template, zero new components (D1). */
function subCategoryConfig(
  parent: CategoryConfig,
  subKey: string,
  subLabel: string
): CategoryConfig {
  const count = PRODUCTS.filter((p) => p.cat === parent.cat && p.sub === subKey).length;

  // Lean page — a sub-category is not a copy of the parent's browse page.
  // Just the banner + every product of this sub. All discovery rails OFF.
  // (GBE: Reviews → VisitStore live on the route, Footer in the layout)
  const sections = makeSections({
    banner: false,
    subCategoryRail: false,
    bestsellers: false,
    attributeGrid: false,
    occasionGrid: false,
    readyToday: false,
    colourGrid: false,
    budgetRail: false,
    productGrid: { eyebrow: "The full collection", heading: `All ${subLabel}` },
    comboRail: false,
    deliveryBand: false,
    crossSellRail: false,
    giftFinder: false,
    faq: false,
  });

  return {
    ...parent,
    slug: `${parent.slug}/${subKey}`,
    sub: subKey,
    parent: { label: parent.label, slug: parent.slug },
    label: subLabel,
    h1: subLabel,
    totalProducts: count,
    seo: {
      title: `${subLabel} — ${parent.label} Delivery in Dhaka | Radian`,
      description: parent.seo.description,
    },
    // sibling rail — its own tile excluded
    subCategories: parent.subCategories.filter(
      (t) => !t.href.split("?")[0].endsWith(`/${subKey}`)
    ),
    sections,
  };
}

/** Auto-generate every sub-config from each parent's subCategories tiles.
    Key = "parentSlug/subKey" — the same subKey under two parents cannot collide. */
function buildSubCategoryConfigs(): Record<string, CategoryConfig> {
  const out: Record<string, CategoryConfig> = {};
  for (const parent of Object.values(CATEGORY_CONFIGS)) {
    for (const tile of parent.subCategories) {
      /*  Flat URLs (22 Aug 2026): a sub tile links to /parentSlug/subKey.
          The old shape ["categories", parentSlug, subKey] would silently
          produce ZERO sub-configs after the prefix went away — this parser
          must always match whatever the tiles' hrefs actually are.  */
      const path = tile.href.split("?")[0].split("/").filter(Boolean); // [parentSlug, subKey]
      if (path.length < 2 || path[0] !== parent.slug) continue;
      const subKey = path[1];
      out[`${parent.slug}/${subKey}`] = subCategoryConfig(parent, subKey, tile.label);
    }
  }
  return out;
}

export const SUBCATEGORY_CONFIGS = buildSubCategoryConfigs();

export const SUBCATEGORY_PARAMS = Object.keys(SUBCATEGORY_CONFIGS).map((k) => {
  const [slug, sub] = k.split("/");
  return { slug, sub };
});

/* ═══════════════ OCCASIONS — cross-category, filtered by occ tag ═══════════════
   Only the 8 occasions that HAVE data (products carrying the tag).
   subCategoryRail = "Shop by category", occasionGrid = the other occasions.
   attribute/colour/combo/crossSell OFF — meaningless on a cross-category page. */
type OccasionDef = {
  slug: string; // canonical URL slug
  occ: Occasion; // the tag in products.ts
  label: string;
  h1: string;
  lead: string;
  bannerBg: string;
  bg: string; // occasion tile gradient
};

const OCCASION_DEFS: OccasionDef[] = [
  {
    slug: "birthday",
    occ: "birthday",
    label: "Birthday Gifts",
    h1: "Make Their Birthday Unforgettable",
    lead: "Flowers, cakes, balloons and personalised keepsakes — everything to turn an ordinary day into the one they remember. Delivered right on time.",
    bannerBg: "linear-gradient(135deg,#FFFBF7 0%,#FBEFDD 46%,#F2D9AE 100%)",
    bg: "linear-gradient(160deg,#FBEFDD,#F2D9AE)",
  },
  {
    slug: "anniversary",
    occ: "anniversary",
    label: "Anniversary Gifts",
    h1: "Celebrate Every Year Together",
    lead: "Romantic classics and thoughtful surprises for the day that started it all. Send it before midnight and make the date.",
    bannerBg: "linear-gradient(135deg,#FFF9FB 0%,#F3DCE3 46%,#E0B4C4 100%)",
    bg: "linear-gradient(160deg,#F3DCE3,#E0B4C4)",
  },
  {
    slug: "love",
    occ: "love",
    label: "Love & Romance",
    h1: "Say It Properly",
    lead: "When words aren't enough — roses, romantic hampers and midnight surprises for the person who has your whole heart.",
    bannerBg: "linear-gradient(135deg,#FFF8FA 0%,#F8E4E8 46%,#EFC5CF 100%)",
    bg: "linear-gradient(160deg,#F8E4E8,#EFC5CF)",
  },
  {
    slug: "congratulations",
    occ: "congratulations",
    label: "Congratulations Gifts",
    h1: "Celebrate Their Big Win",
    lead: "New job, new home, new baby, a promotion earned — mark the moment with a gift that says you noticed.",
    bannerBg: "linear-gradient(135deg,#FBFDFA 0%,#EDF3E8 46%,#CFE0C6 100%)",
    bg: "linear-gradient(160deg,#EDF3E8,#CFE0C6)",
  },
  {
    slug: "corporate",
    occ: "corporate",
    label: "Corporate Gifts",
    h1: "Gifting That Reflects Well On You",
    lead: "Client hampers, team rewards and welcome boxes — tasteful, on-brand, and delivered on schedule across Bangladesh.",
    bannerBg: "linear-gradient(135deg,#FBFCFF 0%,#E7E9F5 46%,#C9CFEB 100%)",
    bg: "linear-gradient(160deg,#E7E9F5,#C9CFEB)",
  },
  {
    slug: "get-well-soon",
    occ: "get-well",
    label: "Get Well Soon",
    h1: "Send A Little Get-Well Warmth",
    lead: "Gentle, calming arrangements and cheer-them-up gifts to say you're thinking of them — delivered fast, when it matters most.",
    bannerBg: "linear-gradient(135deg,#FAFDFB 0%,#E9F2EC 46%,#CBE0D2 100%)",
    bg: "linear-gradient(160deg,#E9F2EC,#CBE0D2)",
  },
  {
    slug: "sorry",
    occ: "sorry",
    label: "Sorry Gifts",
    h1: "Make It Right",
    lead: "The apology that arrives beautifully. Flowers and thoughtful gifts to open the conversation you need to have.",
    bannerBg: "linear-gradient(135deg,#FFFBFC 0%,#F6E1E6 46%,#EBC0CB 100%)",
    bg: "linear-gradient(160deg,#F6E1E6,#EBC0CB)",
  },
  {
    slug: "just-because",
    occ: "just-because",
    label: "Just Because",
    h1: "No Reason Needed",
    lead: "The best surprises come on ordinary days. Send something lovely for no reason at all — those are the ones people remember.",
    bannerBg: "linear-gradient(135deg,#FDFAFF 0%,#EFE4F8 46%,#DBC2F0 100%)",
    bg: "linear-gradient(160deg,#EFE4F8,#DBC2F0)",
  },
];

const occasionBudgets = (slug: string): BudgetTile[] => [
  { kicker: "Thoughtful", label: "Under ৳1,500", href: `/occasions/${slug}?max=1500`, bg: "linear-gradient(160deg,#F4E9F7,#DFC9EC)" },
  { kicker: "Most loved", label: "৳1,500 – ৳3,000", href: `/occasions/${slug}?min=1500&max=3000`, bg: "linear-gradient(160deg,#F7E7F1,#E7C6DE)" },
  { kicker: "Premium", label: "৳3,000 – ৳6,000", href: `/occasions/${slug}?min=3000&max=6000`, bg: "linear-gradient(160deg,#F1E4F8,#DFC5F0)" },
  { kicker: "Luxury", label: "৳6,000 +", href: `/occasions/${slug}?min=6000`, bg: "linear-gradient(160deg,#F1DFE6,#DDB8C6)" },
];

function occasionConfig(def: OccasionDef): CategoryConfig {
  const count = PRODUCTS.filter((p) => Boolean(p.occ?.includes(def.occ))).length;

  const otherOccasions: Tile[] = OCCASION_DEFS.filter((o) => o.slug !== def.slug).map((o) => ({
    label: o.label,
    href: `/occasions/${o.slug}`,
    bg: o.bg,
  }));

  // The short name minus the "…Gifts"/"…Gift" suffix — for the Gift Finder heading
  const shortName = def.label.replace(/ Gifts?$/, "");

  return {
    slug: def.slug,
    cat: "flowers", // placeholder — the occ branch does the filtering; cat is never used
    occ: def.occ,
    label: def.label,
    h1: def.h1,
    lead: def.lead,
    bannerBg: def.bannerBg,
    totalProducts: count,
    seo: {
      title: `${def.label} Delivery in Dhaka & Bangladesh | Radian`,
      description: `Send ${def.label.toLowerCase()} across Bangladesh. Flowers, cakes and gifts with same day, express and midnight delivery in Dhaka.`,
    },
    sections: makeSections({
      subCategoryRail: { eyebrow: "Shop by category", heading: `${def.label} By Type`, subheading: "Every kind of gift, one occasion." },
      bestsellers: { heading: `Most Loved For ${def.label}`, subheading: "The gifts our customers reorder most for this moment." },
      attributeGrid: false,
      occasionGrid: { heading: "More Occasions", subheading: "Something else to celebrate?", viewAllHref: undefined },
      readyToday: { heading: "Ready To Send Today", subheading: "In stock, packed, and out the door within the hour." },
      colourGrid: false,
      budgetRail: { heading: "Gifts At Every Budget" },
      productGrid: { heading: `All ${def.label}` },
      comboRail: false,
      crossSellRail: false,
      giftFinder: { heading: `Still Deciding On A ${shortName} Gift?`, subheading: "Answer three quick questions and we'll shortlist the ones that fit." },
      faq: { heading: `${def.label} — Frequently Asked` },
    }),
    subCategories: Object.values(ALL_CATEGORIES),
    attributes: [],
    occasions: otherOccasions,
    colours: [],
    budgets: occasionBudgets(def.slug),
    combos: [],
    crossSell: [],
    faqs: DELIVERY_FAQ,
  };
}

const OCCASION_CONFIGS: Record<string, CategoryConfig> = Object.fromEntries(
  OCCASION_DEFS.map((d) => [d.slug, occasionConfig(d)])
);

/** Old/alternative slug → canonical. No link ever 404s because of a rename. */
const OCCASION_ALIASES: Record<string, string> = {
  "love-romance": "love",
  "get-well": "get-well-soon",
  congrats: "congratulations",
};

export const OCCASION_PARAMS = Object.keys(OCCASION_CONFIGS).map((slug) => ({ slug }));

/* ═══════════════ /occasions index — every canonical occasion, with product count ═══════════════
   ⇄ SWAP HERE — once Ecommerce locks, this list comes from the server.
   Only occasions WITH data (OCCASION_DEFS) — an empty occasion is never shown. */
export interface OccasionListItem {
  slug: string;
  label: string;
  lead: string;
  bg: string;
  count: number;
}

export const OCCASION_LIST: OccasionListItem[] = OCCASION_DEFS.map((d) => ({
  slug: d.slug,
  label: d.label,
  lead: d.lead,
  bg: d.bg,
  count: PRODUCTS.filter((p) => Boolean(p.occ?.includes(d.occ))).length,
}));

/* ═══════════════ data access ═══════════════ */

/**
 * ⇄ SWAP HERE — when the Ecommerce module locks, ONLY this function changes:
 *
 *   const res = await fetch(`${API_URL}/storefront/category/${slug}`, {
 *     next: { revalidate: 300 },
 *   });
 *   return res.ok ? res.json() : null;
 *
 * The components never learn that anything changed.
 */
export function getCategoryConfig(slug: string): CategoryConfig | null {
  return CATEGORY_CONFIGS[slug] ?? null;
}

/** ⇄ SWAP HERE — becomes a fetch() once Ecommerce locks */
export function getSubCategoryConfig(slug: string, sub: string): CategoryConfig | null {
  return SUBCATEGORY_CONFIGS[`${slug}/${sub}`] ?? null;
}

/** ⇄ SWAP HERE — resolves the alias and returns the canonical occasion config */
export function getOccasionConfig(slug: string): CategoryConfig | null {
  const canonical = OCCASION_ALIASES[slug] ?? slug;
  return OCCASION_CONFIGS[canonical] ?? null;
}

/** Every product of this page (zone filter applied).
    On an occasion page: filter across ALL categories by the occ tag;
    otherwise by cat (+ sub when present) — as before. */
export function categoryProducts(config: CategoryConfig, zone: Zone | null): Product[] {
  if (config.occ) {
    const occ = config.occ;
    return PRODUCTS.filter((p) => Boolean(p.occ?.includes(occ)) && zoneFilter(p, zone));
  }
  return PRODUCTS.filter(
    (p) => p.cat === config.cat && (config.sub ? p.sub === config.sub : true) && zoneFilter(p, zone)
  );
}

/** Which product goes on which rail — every rule in one place */
export function selectProducts(
  products: Product[],
  opts: { rule?: ProductRule; productSlugs?: string[]; count?: number }
): Product[] {
  const { rule = "bestseller", productSlugs, count } = opts;

  let list: Product[];

  if (rule === "manual" && productSlugs?.length) {
    const order = new Map(productSlugs.map((s, i) => [s, i]));
    list = products
      .filter((p) => order.has(p.slug))
      .sort((a, b) => (order.get(a.slug) ?? 0) - (order.get(b.slug) ?? 0));
  } else {
    const flag: Record<Exclude<ProductRule, "manual">, keyof Product> = {
      bestseller: "best",
      express: "exp",
      same_day: "sd",
      midnight: "mn",
      new_arrival: "neu",
    };
    list = products.filter((p) => Boolean(p[flag[rule as Exclude<ProductRule, "manual">]]));
  }

  return count ? list.slice(0, count) : list;
}
