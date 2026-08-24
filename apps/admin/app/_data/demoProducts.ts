import type { ApiProduct, ApiVariantGroup } from "./api";

/*
  DEMO catalog — used automatically when the API (:4000) is down or empty,
  so every Product screen is alive and clickable for review.
  Deliberately messy: drafts, out-of-stock, missing cost, a loss-making item —
  so Stock / Margin / Health boards have something real to show.
*/

const cat = (id: string, name: string, slug: string) => ({
  id,
  name,
  slug,
  parentId: null,
});
const C = {
  flowers: cat("c1", "Fresh Flowers", "fresh-flowers"),
  cakes: cat("c2", "Cakes", "cakes"),
  choc: cat("c3", "Chocolates", "chocolates"),
  gift: cat("c4", "Gift Boxes", "gift-boxes"),
  plants: cat("c5", "Plants", "plants"),
  balloons: cat("c6", "Balloon Bouquets", "balloon-bouquets"),
  addon: cat("c9", "Add-ons & Services", "add-ons"),
};
const tag = (id: string, name: string, slug: string, type: "OCCASION" | "RECIPIENT") =>
  ({ id, name, slug, type }) as const;
const T = {
  love: tag("t1", "Love", "love", "OCCASION"),
  bday: tag("t2", "Birthday", "birthday", "OCCASION"),
  anniv: tag("t3", "Anniversary", "anniversary", "OCCASION"),
  congrats: tag("t4", "Congratulations", "congratulations", "OCCASION"),
  her: tag("t5", "Her", "her", "RECIPIENT"),
  him: tag("t6", "Him", "him", "RECIPIENT"),
  parents: tag("t7", "Parents", "parents", "RECIPIENT"),
};

type Seed = {
  id: string;
  name: string;
  slug: string;
  sku?: string;
  category: ApiProduct["category"];
  cost: number;
  sell: number;
  offer?: number;
  stock: number;
  sold: number;
  zone?: "DHAKA" | "NATIONWIDE";
  type?: "READYMADE" | "CRAFTED";
  nature?: "FRESH" | "ARTIFICIAL";
  draft?: boolean;
  showStock?: boolean;
  tags?: ApiProduct["tags"];
  vg?: string;
  vLabel?: string;
  vSwatch?: string;
};

function build(s: Seed): ApiProduct {
  const offer = s.offer ?? s.sell;
  const disc = offer < s.sell;
  return {
    id: s.id,
    slug: s.slug,
    sku: s.sku ?? null,
    name: s.name,
    costPaisa: s.cost * 100,
    sellingPricePaisa: s.sell * 100,
    offerPricePaisa: offer * 100,
    discountType: disc ? "FLAT" : "NONE",
    discountValue: disc ? (s.sell - offer) * 100 : 0,
    stockQty: s.stock,
    showStock: s.showStock ?? true,
    salesCount: s.sold,
    productType: s.type ?? "READYMADE",
    zone: s.zone ?? "DHAKA",
    natureType: s.nature ?? "FRESH",
    isPublished: !s.draft,
    isBestSeller: s.sold > 120,
    isNewArrival: s.sold < 20,
    category: s.category,
    tags: s.tags ?? [],
    variantGroupId: s.vg ?? null,
    variantLabel: s.vLabel ?? null,
    variantSwatch: s.vSwatch ?? null,
  };
}

export const DEMO_PRODUCTS: ApiProduct[] = [
  build({ id: "p1", sku: "ROSE-78", name: "Velvet Red — 24 Premium Roses", slug: "velvet-red-24-premium-roses", category: C.flowers, cost: 1180, sell: 2450, offer: 2200, stock: 18, sold: 214, tags: [T.love, T.anniv, T.her], vg: "g1", vLabel: "Red", vSwatch: "#C4172B" }),
  build({ id: "p2", sku: "ROSE-12", name: "Blush Romance — 12 Pink Roses", slug: "blush-romance-12-pink-roses", category: C.flowers, cost: 640, sell: 1290, stock: 24, sold: 168, tags: [T.love, T.her], vg: "g1", vLabel: "Pink", vSwatch: "#E8A0C0" }),
  build({ id: "p3", sku: "ROSE-99", name: "Midnight Rose Heart", slug: "midnight-rose-heart", category: C.flowers, cost: 1520, sell: 2990, offer: 2790, stock: 6, sold: 96, tags: [T.love, T.anniv, T.her], vg: "g1", vLabel: "Deep Red", vSwatch: "#7A0C2E" }),
  build({ id: "p4", sku: "ORCH-04", name: "White Orchid Elegance", slug: "white-orchid-elegance", category: C.flowers, cost: 900, sell: 1650, stock: 0, sold: 88, tags: [T.congrats, T.parents] }),
  build({ id: "p5", sku: "CAKE-31", name: "Chocolate Fudge Celebration Cake", slug: "chocolate-fudge-cake", category: C.cakes, cost: 700, sell: 1450, stock: 9, sold: 143, tags: [T.bday, T.him], vg: "g2", vLabel: "Chocolate Fudge", vSwatch: "linear-gradient(160deg,#E8D8CE,#D3B49E)" }),
  build({ id: "p6", sku: "CAKE-22", name: "Red Velvet Cream Cheese", slug: "red-velvet-cream-cheese", category: C.cakes, cost: 820, sell: 1650, offer: 1490, stock: 4, sold: 121, tags: [T.bday, T.anniv, T.her], vg: "g2", vLabel: "Red Velvet", vSwatch: "linear-gradient(160deg,#F7E0E4,#E7BAC3)" }),
  build({ id: "p7", sku: "CAKE-08", name: "Vanilla Butter Cream — 1kg", slug: "vanilla-butter-cream-1kg", category: C.cakes, cost: 640, sell: 1190, stock: 11, sold: 74, tags: [T.bday, T.parents], vg: "g2", vLabel: "Vanilla", vSwatch: "linear-gradient(160deg,#FBF3E4,#EFDFBE)" }),
  build({ id: "p8", sku: "CAKE-12", name: "Photo Print Birthday Cake", slug: "photo-print-birthday-cake", category: C.cakes, cost: 980, sell: 1890, stock: 3, sold: 57, type: "CRAFTED", tags: [T.bday] }),
  build({ id: "p9", sku: "CHOC-45", name: "Lindt Luxury Selection", slug: "lindt-luxury-selection", category: C.choc, cost: 1750, sell: 2450, stock: 21, sold: 64, zone: "NATIONWIDE", nature: "ARTIFICIAL", tags: [T.anniv, T.him] }),
  build({ id: "p10", sku: "CHOC-19", name: "Ferrero Bloom Chocolate Bouquet", slug: "ferrero-bloom-bouquet", category: C.choc, cost: 1400, sell: 1850, offer: 1350, stock: 8, sold: 39, zone: "NATIONWIDE", tags: [T.love, T.her] }),
  build({ id: "p11", sku: "GIFT-07", name: "Signature Radian Gift Box", slug: "signature-radian-gift-box", category: C.gift, cost: 0, sell: 2200, stock: 12, sold: 45, zone: "NATIONWIDE", tags: [T.congrats, T.him] }),
  build({ id: "p12", sku: "GIFT-21", name: "Rose Gold Premium Hamper", slug: "rose-gold-premium-hamper", category: C.gift, cost: 2100, sell: 3850, stock: 5, sold: 28, zone: "NATIONWIDE", tags: [T.anniv, T.her] }),
  build({ id: "p13", sku: "PLNT-03", name: "Money Plant in Ceramic Pot", slug: "money-plant-ceramic-pot", category: C.plants, cost: 380, sell: 890, stock: 31, sold: 52, zone: "NATIONWIDE", tags: [T.congrats, T.parents] }),
  build({ id: "p14", sku: "BALN-11", name: "Birthday Balloon Bouquet", slug: "birthday-balloon-bouquet", category: C.balloons, cost: 520, sell: 990, stock: 0, sold: 33, nature: "ARTIFICIAL", tags: [T.bday] }),
  build({ id: "p15", sku: "BALN-27", name: "Pastel Birthday Arch", slug: "pastel-birthday-arch", category: C.balloons, cost: 1600, sell: 2490, stock: 2, sold: 12, draft: true, nature: "ARTIFICIAL", tags: [T.bday] }),
  build({ id: "p16", sku: "GERB-04", name: "Sunrise Gerbera Basket", slug: "sunrise-gerbera-basket", category: C.flowers, cost: 0, sell: 1650, stock: 7, sold: 41, draft: true, tags: [] }),
];

export const DEMO_VARIANT_GROUPS: ApiVariantGroup[] = [
  {
    id: "g1",
    kind: "COLOUR",
    label: "Roses — Colour",
    products: DEMO_PRODUCTS.filter((p) => p.variantGroupId === "g1").map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      variantLabel: p.variantLabel ?? null,
      variantSwatch: p.variantSwatch ?? null,
    })),
  },
  {
    id: "g2",
    kind: "FLAVOUR",
    label: "Cake — Flavour",
    products: DEMO_PRODUCTS.filter((p) => p.variantGroupId === "g2").map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      variantLabel: p.variantLabel ?? null,
      variantSwatch: p.variantSwatch ?? null,
    })),
  },
];

/* ---- Upgrade products (premium version of a base product) ---- */
/*
  An upgrade is NOT "base price + extra". It is a different thing altogether
  (50 roses → 100 roses), so it carries its OWN cost, price, discount and
  margin — nothing is inherited from the product it upgrades.
*/
/*
  An upgrade IS a product (50 roses → 100 roses). It carries its OWN cost,
  price, discount, stock and margin — nothing is inherited from the product it
  upgrades. It can either be an existing catalog product linked in
  (`linkedProductId`), or a new one created here.

  Discount follows the SAME rule as everywhere else in Radian:
  NONE | FLAT (paisa) | PERCENT (whole %).
*/
export type DiscountKind = "NONE" | "FLAT" | "PERCENT";
export interface DemoUpgrade {
  id: string;
  baseProductId: string;
  /** set when an existing catalog product is used as the upgrade */
  linkedProductId?: string | null;
  name: string;
  costPaisa: number;
  pricePaisa: number;
  discountType: DiscountKind;
  discountValue: number; // FLAT = paisa · PERCENT = whole %
  stockQty: number;
  active: boolean;
}
export const DEMO_UPGRADES: DemoUpgrade[] = [
  { id: "u1", baseProductId: "p1", name: "Deluxe — 50 stems", costPaisa: 240000, pricePaisa: 490000, discountType: "PERCENT", discountValue: 10, stockQty: 8, active: true },
  { id: "u2", baseProductId: "p1", name: "Grand — 100 stems, hat box", costPaisa: 430000, pricePaisa: 890000, discountType: "NONE", discountValue: 0, stockQty: 4, active: true },
  { id: "u3", baseProductId: "p5", name: "2 lb — serves 12–15", costPaisa: 130000, pricePaisa: 268000, discountType: "FLAT", discountValue: 20000, stockQty: 6, active: true },
  { id: "u4", baseProductId: "p12", name: "Luxury edition — gold trim", costPaisa: 320000, pricePaisa: 590000, discountType: "PERCENT", discountValue: 15, stockQty: 2, active: false },
];

/* ---- Add-ons & services (ordinary products, flagged) ---- */
/*
  Add-on = ALWAYS additive. ৳500 bouquet + ৳50 card = ৳550. It never replaces
  the product (that is an Upgrade). Items live here as a template; groups bundle
  them by occasion; rules attach a group automatically when a product matches.
*/
/*
  An add-on is its OWN small thing — it is never a product on the website and is
  never sold on its own. Only what is actually needed:
  title · image · SKU · price · discount · stock.
  stockQty = null means unlimited (a service like gift wrap never runs out).
*/
export interface DemoAddon {
  id: string;
  name: string;
  sku: string;
  image?: string; // gradient placeholder until real upload
  pricePaisa: number;
  /**
   * DEC-PRD-049 — given away on purpose. A ৳0 add-on WITHOUT this is simply
   * unpriced, and the storefront does not offer it: a forgotten price should
   * cost a reminder, not stock.
   */
  isFree?: boolean;
  discountType: DiscountKind;
  discountValue: number; // FLAT = paisa · PERCENT = whole %
  stockQty: number | null; // null = unlimited
  /** DEC-PRD-039 — the stockroom Item counting this add-on. null = by hand. */
  itemId?: string | null;
  /** display only — never sent on save */
  itemLabel?: string | null;
  active: boolean;
}
export const DEMO_ADDONS: DemoAddon[] = [
  { id: "a1", name: "Premium greeting card", sku: "ADD-CARD", image: "linear-gradient(150deg,#EFD9F8,#DFC0F2)", pricePaisa: 15000, discountType: "NONE", discountValue: 0, stockQty: null, active: true },
  { id: "a2", name: "Luxury gift wrap", sku: "ADD-WRAP", image: "linear-gradient(150deg,#EBDDF4,#D6BEEB)", pricePaisa: 10000, discountType: "NONE", discountValue: 0, stockQty: null, active: true },
  { id: "a3", name: "Delivery video", sku: "ADD-VIDEO", image: "linear-gradient(150deg,#E9E4F4,#D3C9EC)", pricePaisa: 20000, discountType: "PERCENT", discountValue: 25, stockQty: null, active: true },
  { id: "a4", name: "Glass vase", sku: "ADD-VASE", image: "linear-gradient(150deg,#E8EEF0,#C4D3D8)", pricePaisa: 45000, discountType: "NONE", discountValue: 0, stockQty: 14, active: true },
  { id: "a5", name: "Teddy bear — 12 inch", sku: "ADD-TEDDY", image: "linear-gradient(150deg,#F6E9D8,#EDD4B0)", pricePaisa: 55000, discountType: "FLAT", discountValue: 5000, stockQty: 6, active: true },
  { id: "a6", name: "Scented candle", sku: "ADD-CANDLE", image: "linear-gradient(150deg,#F3EEE6,#DCD1BE)", pricePaisa: 35000, discountType: "NONE", discountValue: 0, stockQty: 0, active: false },
  { id: "a7", name: "Balloon set", sku: "ADD-BALN", image: "linear-gradient(150deg,#F9EAF3,#F0CBE2)", pricePaisa: 40000, discountType: "NONE", discountValue: 0, stockQty: 11, active: true },
  { id: "a8", name: "Chocolate box — 9 pcs", sku: "ADD-CHOC", image: "linear-gradient(150deg,#F1E0D5,#E5C4AE)", pricePaisa: 38000, discountType: "NONE", discountValue: 0, stockQty: 9, active: true },
];

/** a named set of add-ons — "Birthday add-ons", "Anniversary add-ons" */
export interface DemoAddonGroup {
  id: string;
  name: string;
  addonIds: string[];
}
export const DEMO_ADDON_GROUPS: DemoAddonGroup[] = [
  { id: "g-birthday", name: "Birthday add-ons", addonIds: ["a1", "a7", "a5", "a3"] },
  { id: "g-anniv", name: "Anniversary add-ons", addonIds: ["a1", "a2", "a4"] },
  { id: "g-everyday", name: "Everyday extras", addonIds: ["a1", "a2"] },
];

/** when a product matches ANY of the values, the group attaches automatically.
    A product can match several rules — the groups then stack up as tabs on the
    product page, and the same add-on appearing twice is shown only once. */
export type AddonRuleField = "CATEGORY" | "OCCASION" | "ZONE" | "PRODUCT_TYPE";
export interface DemoAddonRule {
  id: string;
  field: AddonRuleField;
  values: string[]; // OR — matches if the product has any one of these
  groupId: string;
  active: boolean;
}
export const DEMO_ADDON_RULES: DemoAddonRule[] = [
  { id: "r1", field: "OCCASION", values: ["birthday"], groupId: "g-birthday", active: true },
  { id: "r2", field: "OCCASION", values: ["anniversary", "love"], groupId: "g-anniv", active: true },
  { id: "r3", field: "CATEGORY", values: ["Fresh Flowers", "Bouquets", "Gift Hampers"], groupId: "g-everyday", active: true },
];

export const DEMO_PRODUCT_OPTIONS = DEMO_PRODUCTS.map((p) => ({
  id: p.id,
  name: p.name,
}));

/* ---------------------------------------------------------------------------
   Add-on performance (demo).
   Phase 1 policy: money + orders ALWAYS come from our own DB (OrderLine).
   "Times shown" needs storefront tracking and arrives in Funnel Phase 2, so it
   is null here and the column says so instead of faking a number.
--------------------------------------------------------------------------- */
/** the three places a customer can pick an add-on */
export type AddonPlacement = "PRODUCT" | "CART" | "CHECKOUT";
export const PLACEMENTS: AddonPlacement[] = ["PRODUCT", "CART", "CHECKOUT"];
export const PLACEMENT_LABEL: Record<AddonPlacement, string> = {
  PRODUCT: "Product page",
  CART: "Cart page",
  CHECKOUT: "Checkout",
};

export interface PlacementStat {
  page: AddonPlacement;
  ordersWith: number;
  units: number;
  revenuePaisa: number;
  shown: number | null; // null until storefront tracking lands
}

export interface AddonStat {
  addonId: string;
  ordersWith: number;   // orders that included this add-on
  units: number;        // pieces sold (someone can take 2 cards)
  revenuePaisa: number; // what customers actually paid for it
  shown: number | null; // null until tracking lands
  prevAttachPct: number; // previous period, for the trend arrow
  byPage: PlacementStat[]; // WHERE the customer decided — read from OrderLine
}

/** deterministic pseudo-random so the screen never jumps between renders */
function seeded(key: string, salt: number) {
  let h = salt;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 100000;
  return h / 100000;
}

/** total orders in the window — the denominator for attach rate */
export function demoOrderCount(days: number) {
  return Math.round(days * 11.4);
}

export function demoAddonStats(addons: DemoAddon[], days: number): AddonStat[] {
  const orders = demoOrderCount(days);
  return addons.map((a) => {
    const base = 0.05 + seeded(a.id, 7) * 0.4;          // 5% – 45% attach
    const price = a.pricePaisa || 10000;
    const cheapBoost = price < 20000 ? 1.5 : price > 45000 ? 0.55 : 1; // cheap things attach more
    const attach = Math.min(0.62, base * cheapBoost * (a.active ? 1 : 0.2));
    const ordersWith = Math.round(orders * attach);
    const units = Math.round(ordersWith * (1 + seeded(a.id, 13) * 0.35));
    const pays =
      a.discountType === "PERCENT"
        ? Math.round(price * (1 - Math.min(100, a.discountValue) / 100))
        : a.discountType === "FLAT"
          ? Math.max(0, price - a.discountValue)
          : price;
    /* where the decision happened. Cheap impulse things (card, wrap) get picked
       late at checkout; expensive considered things (vase, teddy) get picked on
       the product page while the customer is still choosing the gift. */
    const impulse = price < 20000;
    const w = impulse ? [0.34, 0.28, 0.38] : [0.68, 0.22, 0.1];
    const wobble = seeded(a.id, 41) * 0.12 - 0.06;
    const share = [w[0] + wobble, w[1], Math.max(0.02, w[2] - wobble)];
    const total = share.reduce((x, y) => x + y, 0);
    const byPage: PlacementStat[] = PLACEMENTS.map((page, i) => {
      const f = share[i] / total;
      const u = Math.round(units * f);
      return {
        page,
        ordersWith: Math.round(ordersWith * f),
        units: u,
        revenuePaisa: u * pays,
        shown: null,
      };
    });

    return {
      addonId: a.id,
      ordersWith,
      units,
      revenuePaisa: units * pays,
      shown: null,
      prevAttachPct: Math.round(attach * 100 * (0.75 + seeded(a.id, 29) * 0.5)),
      byPage,
    };
  });
}

/* ---------------------------------------------------------------------------
   Upgrade performance (demo).
   An upgrade REPLACES the base product, so the question is different from an
   add-on: not "how many extra taka" but "how many customers moved up, and how
   much bigger did the order get". Same Phase 1 policy — money and counts come
   from our own OrderLine; impressions wait for tracking.
--------------------------------------------------------------------------- */
export interface UpgradeStat {
  upgradeId: string;
  baseOrders: number;    // orders that took the standard version
  upgradeOrders: number; // orders that moved up to this one
  revenuePaisa: number;  // what the upgrade earned
  liftPaisa: number;     // extra taka vs. if they had taken the base
  shown: number | null;  // needs tracking
  prevTakePct: number;
}

export function demoUpgradeStats(
  ups: { id: string; pricePaisa: number; discountType: DiscountKind; discountValue: number }[],
  basePriceOf: (id: string) => number,
  days: number,
): UpgradeStat[] {
  const orders = demoOrderCount(days);
  return ups.map((u) => {
    let h = 3;
    for (let i = 0; i < u.id.length; i++) h = (h * 31 + u.id.charCodeAt(i)) % 100000;
    const r = h / 100000;
    const pays =
      u.discountType === "PERCENT"
        ? Math.round(u.pricePaisa * (1 - Math.min(100, u.discountValue) / 100))
        : u.discountType === "FLAT"
          ? Math.max(0, u.pricePaisa - u.discountValue)
          : u.pricePaisa;
    const basePrice = basePriceOf(u.id) || Math.round(pays * 0.6);
    const gap = basePrice > 0 ? (pays - basePrice) / basePrice : 1;
    /* the bigger the jump in price, the fewer people take it */
    const take = Math.max(0.03, Math.min(0.45, (0.34 - gap * 0.22) * (0.7 + r * 0.6)));
    const productOrders = Math.max(4, Math.round((orders / 9) * (0.5 + r)));
    const upgradeOrders = Math.round(productOrders * take);
    return {
      upgradeId: u.id,
      baseOrders: productOrders - upgradeOrders,
      upgradeOrders,
      revenuePaisa: upgradeOrders * pays,
      liftPaisa: upgradeOrders * Math.max(0, pays - basePrice),
      shown: null,
      prevTakePct: Math.round(take * 100 * (0.75 + r * 0.5)),
    };
  });
}
