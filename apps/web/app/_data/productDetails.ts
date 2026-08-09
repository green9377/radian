import { type BundleList } from "./bundlePricing";
import { PRODUCTS, type Product, type ProductCategory } from "./products";
import { freeDeliveryOfferText } from "./promo";

/*
  ═══════════════════════════════════════════════════════════════════
  PDP config — Category template + per-product override.

  ── VARIANT MODEL (locked) ──────────────────────────────────────
  PDP-তে তিনটা আলাদা স্তর, প্রতিটা আলাদা প্রশ্নের উত্তর দেয়:

    1. COLOUR  → আলাদা product (নিজস্ব slug, ছবি, stock)।
                 PDP-তে গোল swatch, click করলে sibling PDP-তে যায়।
                 কারণ: প্রতিটা রঙের নিজের ছবি লাগে (মানুষ চোখে দেখে কেনে),
                 আর সাদা গোলাপ শেষ হলে লাল গোলাপের বিক্রি থামা উচিত নয়।
    2. SIZE    → একই product-এর দাম বদলায় (12/24/50 stems · 1/2/3 lb)।
                 ছোট pill row — ছবি বদলায় না, শুধু দাম।
    3. BUNDLE  → অন্য product যোগ হয় (+ Chocolates / + Cake)।
                 Photo card — কারণ এখানে নতুন জিনিস দেখাতে হয়।

  দাম = (রঙ/মাপের দাম + বাছা bundle জিনিস) − তালিকার ছাড় + add-ons
        হিসাবটা এক জায়গায়: `bundlePricing.ts` (DEC-PRD-018)

  ⚠️ TEMPORARY HOME — Ecommerce module lock হলে getProductDetail() এর
     ভেতরটা fetch() হবে। কোনো component-এ হাত পড়বে না। ⇄ SWAP HERE
  ═══════════════════════════════════════════════════════════════════
*/

export type IconName =
  | "bolt" | "sun" | "moon" | "truck" | "shield" | "star" | "leaf"
  | "sparkle" | "gift" | "store" | "clock" | "pen" | "check" | "chev"
  | "cart" | "heart" | "tag" | "play" | "upload" | "wa" | "search"
  /* Checkout-এ যোগ হলো */
  | "user" | "pin" | "camera" | "lock" | "phone" | "eye-off";

/**
 * The same names, as a runtime list.
 *
 * ⚠️ NEEDED BECAUSE THE ADMIN CAN TYPE ANYTHING. `ProductTrustBadge.icon` is a
 * plain String column, so a trust badge can arrive carrying "rocket" — a name
 * `PdpIcons` has no drawing for, which renders an empty square where the
 * shop's largest promise should be. `asIconName()` turns an unknown name into
 * a visible-but-neutral one instead of a hole.
 *
 * Add an icon to the union above and it must be added here too, in the same
 * commit — the same "add it in both" note the shop icon set already carries.
 */
export const ICON_NAMES: readonly IconName[] = [
  "bolt", "sun", "moon", "truck", "shield", "star", "leaf",
  "sparkle", "gift", "store", "clock", "pen", "check", "chev",
  "cart", "heart", "tag", "play", "upload", "wa", "search",
  "user", "pin", "camera", "lock", "phone", "eye-off",
];

export const asIconName = (v: string | null | undefined): IconName =>
  ICON_NAMES.includes(v as IconName) ? (v as IconName) : "check";

export interface TrustItem {
  icon: IconName;
  /**
   * DEC-PRD-023 — দোকানের নিজের আপলোড করা icon। ভরা থাকলে এটাই আঁকা হয়,
   * `icon` তখন ছোঁয়াই হয় না।
   *
   * ⚠️ মালিক, ২ আগস্ট: *"trust badge-এ তো আমি কোন icon কিছুই custom করে
   * বানাতে পারছি না"* — আগে কেবল বিশটা built-in নামের একটা বাছা যেত।
   */
  iconUrl?: string | null;
  label: string;
  sub: string;
}

/*
  ১. VARIANT — একই জিনিস, একটা attribute আলাদা → আলাদা product।
     Colour আর Flavour একই জিনিস: নিজস্ব ছবি, নিজস্ব stock, নিজস্ব SEO page।
     পার্থক্য শুধু দেখানোয় — colour = রঙের swatch, flavour = ছবির pill.
     ⚠️ Ecommerce module lock হলে এটা Product.variantGroupId FK হবে।
*/
export type VariantKind = "colour" | "flavour";

export interface VariantOption {
  slug: string;
  label: string;
  /** colour হলে hex, flavour হলে gradient (ছবি না আসা পর্যন্ত) */
  swatch: string;
  active: boolean;
}

export interface VariantGroup {
  kind: VariantKind;
  label: string;
  options: VariantOption[];
}

/**
 * DEC-PRD-012 — এক page-এর ভেতরের একটা variant।
 *
 * ⚠️ উপরের `VariantGroup`-এর সাথে গুলিয়ে ফেলা চলবে না। ওটা পুরনো নকশা:
 * প্রতিটা রঙ আলাদা product, swatch-এ click করলে অন্য page। এখানে click
 * করলে **কোথাও যাওয়া হয় না** — একই page-এ ছবি, দাম আর মজুদ বদলায়।
 *
 * মালিক, ১ আগস্ট ২০২৬: *"যখন তার multi variant থাকবে তখন তা show করাব, আর
 * তা একটা product page-এ হবে। প্রতিটার আলাদা image আর stock।"*
 */
export interface PickedVariant {
  /** ProductVariant row-এর id — cart-এ এটাই যায় */
  id: string;
  label: string;
  /** "Colour" / "Flavour" / "Weight" — শিরোনামে বসে */
  attribute: string;
  /** master কী দেখাতে বলেছে — SWATCH | PHOTO | TEXT */
  displayMode: string;
  swatch: string | null;
  imageUrl: string | null;
  /** গ্রাহক যা দেবে — offer থাকলে সেটাই */
  pricePaisa: number;
  /** DEC-PRD-032 — offer চললে কাটা দামটা, নাহলে null */
  wasPaisa?: number | null;
  /** ০ = এই রঙটা শেষ, বাকিগুলো চলছে */
  stockQty: number;
}

/** ২. SIZE — একই product, দাম বদলায় */
export interface SizeOption {
  id: string;
  label: string;
  sub?: string;
  pricePaisa: number;
}

/**
 * ৩. BUNDLE — অন্য product যোগ হয়। DEC-PRD-018।
 *
 * ⚠️ এটা তালিকার **একটা জিনিস**, একটা প্যাকেজ নয়। মালিক তালিকায় ৩-৪টা
 * রাখেন, গ্রাহক যা খুশি নেয়। ছাড়টা এখানে নেই — সেটা গোটা তালিকার একটাই,
 * আর সেটা `ProductDetail.bundle`-এ।
 *
 * ⚠️ `addPaisa` আর নেই। ছিল "এটা নিলে কত বাড়বে", কিন্তু ছাড় বসে main
 * সহ মোট দামের উপর — তাই "কত বাড়বে" নির্ভর করে গ্রাহক আর কী কী নিয়েছেন
 * তার উপর। একটা ধ্রুব সংখ্যা রাখলে সেটা প্রায়ই মিথ্যা হতো।
 */
export interface BundleOption {
  /** যোগ হওয়া product-এর id — cart-এ এটাই যায় */
  id: string;
  label: string;
  /** এটা একা কিনলে আজ যত পড়ত */
  pricePaisa: number;
  bg: string;
  tag?: string;
  best?: boolean;
}

export interface PersoField {
  type: "text" | "upload";
  label: string;
  placeholder?: string;
  max?: number;
  hint: string;
}

export interface Perso {
  title: string;
  fields: PersoField[];
}

export interface SpecRow {
  item: string;
  qty: string;
}

export interface CraftPoint {
  icon: IconName;
  title: string;
  text: string;
}

export interface Faq {
  q: string;
  a: string;
}

export interface ProductDetail {
  product: Product;
  crumb: { catLabel: string; catSlug: string; subLabel: string; short: string };
  nature: { type: "fresh" | "artificial"; label: string };
  /** DEC-PRD-031 — title-এর নিচের এক লাইন। মালিক কিছু না লিখলে line-টাই বসে না। */
  shortDesc: string | null;
  /**
   * The green line above the price — "30–120 Min Delivery".
   *
   * ⚠️ NULLABLE since 1 Aug 2026. A product that can take none of the fast
   * options has nothing true to say here, and an empty chip is better than a
   * confident wrong one.
   */
  deliveryChip: string | null;
  gallery: string[];
  videoId?: string;
  trust: TrustItem[];
  variant: VariantGroup | null;
  /**
   * DEC-PRD-012 — এই product যে রঙ / ফ্লেভার / মাপে আসে।
   *
   * খালি বা absent = এই product-এর কোনো variant নেই, আর তখন page-এ ওই
   * অংশটাই আঁকা হয় না — মালিকের নিয়ম, "না থাকলে দেখাবই না"।
   *
   * ⚠️ optional, কারণ mock-এ এটা নেই। Absent আর খালি একই মানে বহন করে
   * এখানে — দুটোই "দেখানোর কিছু নেই"।
   */
  variants?: PickedVariant[];
  sizes: SizeOption[];
  sizeLabel: string;
  bundles: BundleOption[];
  /**
   * DEC-PRD-018 — গোটা তালিকার একটাই ছাড়। `null` = ছাড় নেই।
   *
   * ⚠️ ছাড়টা প্রতিটা card-এ নেই, তালিকার নিচে একটাই — মালিকের নিয়ম।
   * এটা ছাড়া `bundles` শুধু নামের তালিকা, দাম হিসাব করা যায় না।
   */
  bundle?: BundleList | null;
  /**
   * DEC-PRD-020 — এটার বড় সংস্করণ। মালিক, ২ আগস্ট ২০২৬: *"upgrade
   * product-এ click করলে price change হবে, কিন্তু অন্য page-এ যেন না নেয়।"*
   *
   * ⚠️ প্রতিটা একটা **সত্যিকারের product** — নিজের দাম, নিজের মজুদ, নিজের
   * page। তাই বাছলে cart-এ ওরই slug যায়; page শুধু দাম আর ছবি বদলায়।
   */
  upgrades?: { slug: string; name: string; pricePaisa: number; bg: string }[];
  /**
   * DEC-PRD-024 — Search & sharing tab-এ মালিক যা লেখেন।
   *
   * ⚠️ ২ আগস্ট ২০২৬ পর্যন্ত এই ছয়টা ঘর **কোথাও পৌঁছাত না**। Admin-এ লেখা
   * যেত, API পাঠাতও, কিন্তু product page-এর `generateMetadata` সেগুলো
   * পড়তই না — নিজে নাম আর একটা বাঁধা বাক্য দিয়ে title বানাত। মালিকের
   * প্রশ্ন: *"এই page-এ কি Google-এর সাথে connect করা? যেভাবে লিখব সেভাবে
   * Google-এ published হবে?"* — উত্তর ছিল না। এখন হ্যাঁ।
   *
   * খালি রাখলে নিচে fallback আছে, তাই কোনো ঘর বাধ্যতামূলক নয়।
   */
  seo?: {
    title: string | null;
    description: string | null;
    ogTitle: string | null;
    ogDescription: string | null;
    ogImageUrl: string | null;
    noIndex: boolean;
  };
  bundleHint: string;
  addonTabs: string[];
  perso: Perso | null;
  /**
   * DEC-PRD-027 — "Want this customised?" সবুজ বাক্স। `null`/absent = দেখাবে না।
   *
   * ⚠️ আগে এটা ছিল `custom` — category template-এর হাতে লেখা কপি, আর
   * **সব** product-এ দেখাত। নম্বরটাও ছিল বানানো। এখন product-প্রতি switch,
   * আর নম্বর Company settings থেকে।
   */
  customise?: { title: string; sub: string; whatsapp: string | null } | null;
  spec: SpecRow[];
  craft: CraftPoint[];
  faqs: Faq[];
  custom: { title: string; sub: string };
  crossSlugs: string[];
  ozReason: string;
  /**
   * ⚠️ THREE FIELDS TURNED NULLABLE, 31 Jul 2026 — they were never optional in
   * the mock because the mock always had an answer. The database does not.
   *
   * `rating` / `live`: every one of the 71 products carried a hard-coded
   * "4.9 · 412 reviews". A product nobody has reviewed now says nothing at all
   * rather than borrowing someone else's stars.
   */
  reviews: { rating: string | null; count: number; live: string | null };
  /**
   * The struck-through price, from the owner's real discount. `null` or absent
   * means nothing is off and the page draws no strike-through.
   *
   * ⚠️ It replaces `unitPaisa / 0.81`, which printed "19% OFF" on all 71
   * products whether or not anything had ever been discounted.
   */
  mrpPaisa?: number | null;
  /** DEC-PRD-035 — the headline is the cheapest variant, so the page writes
   *  "from ৳450" until a colour is picked. */
  priceFrom?: boolean;
  /**
   * "stick", "kg" — printed small after the price: "৳2,400 / stick".
   *
   * Absent on most products, and that is right: a bouquet sold "per piece"
   * says nothing, a rose sold "per stick" explains the price.
   */
  unitSuffix?: string | null;
  /**
   * "Days before it can go out" — how long the shop needs to make this.
   *
   * ⚠️ ADDED 1 Aug 2026 BECAUSE IT WAS MISSING AND NOBODY KNEW. The API had
   * been sending `leadTimeDays` since the product endpoint was written, but it
   * stopped here — the web's own type never carried it, so no component could
   * have used it even by accident. A 3-day bouquet was offered 2-hour express.
   *
   * Read at checkout only: it decides the earliest date and which delivery
   * methods are possible. `0`/absent means it is on a shelf and can go today.
   */
  leadTimeDays?: number | null;
  /**
   * Which fast-delivery options this product can actually take, inside Dhaka.
   * Straight from the three tick-boxes on the admin's Delivery tab.
   *
   * ⚠️ ADDED 1 Aug 2026 — SAME STORY AS `leadTimeDays`. The API had been
   * sending `supportsExpress` / `supportsSameDay` / `supportsMidnight` since
   * the endpoint was written, and the ONLY thing reading them was the listing
   * card, to decide which delivery-filter page a product appears on. The
   * product page ignored them and printed "30–120 Min Delivery" on every Dhaka
   * product; checkout ignored them too, so a cream cake with midnight
   * deliberately unticked could still be ordered for midnight.
   *
   * Absent → treat as all allowed. Only the mock omits it.
   */
  speeds?: { express: boolean; sameDay: boolean; midnight: boolean };
  /**
   * How many are left — but ONLY when the shop chose to publish it.
   *
   * `null` means either "we are not telling" or "nothing is counted". The page
   * cannot tell those apart and does not need to: both mean say nothing.
   */
  stockLeft?: number | null;
  /**
   * DEC-PDP-09 — may they buy it at all, and in what words. Decided on the
   * server; the page only renders the answer.
   *
   * ⚠️ NOT DERIVED FROM `stockLeft`. That number is a selling line the shop is
   * free to make up (see "Show a different number" in the admin), and a
   * made-up figure must never be able to open or close the till. The server
   * works this out from the real count.
   *
   * Absent → treat as in stock. Only the mock omits it, and the mock has no
   * stock to run out of.
   */
  availability?:
    | { state: "IN_STOCK" }
    | { state: "OUT_OF_STOCK" }
    /** buyable, but they are told. `backOn` null = no date was promised. */
    | { state: "PRE_ORDER"; backOn: string | null };
  /**
   * Minutes to today's order cut-off, per zone. Worked out on the server in
   * Bangladesh time — the browser only ticks down from it.
   *
   * ⚠️ It replaces `setHours(18, 0, 0, 0)` in `PdpView`: a 6 PM cut-off
   * invented in the component, counted on the VISITOR'S clock. Wrong for every
   * delivery mode that does not close at six, and wrong by six hours for
   * anyone reading the page from outside Bangladesh.
   *
   * `null` for a zone = nothing left to close today, so no countdown is drawn.
   */
  cutoffMinutesLeft?: { dhaka: number | null; nationwide: number | null };
  /**
   * The "Offers Available" strip, from the Marketing module's live offers.
   *
   * ⚠️ DISPLAY ONLY. Nothing here changes a price on this page — which offer
   * wins, whether they stack and what is actually taken off is decided once,
   * at checkout. Absent means nothing is running, and the strip does not draw.
   */
  offers?: Offer[];
  /**
   * "Pairs beautifully with" — full cards, built by the same code as the
   * category grid, so a product looks identical wherever it appears.
   *
   * ⚠️ Present-but-empty is meaningful. It says "the shop has nothing to
   * suggest", and `RelatedRail` must then draw nothing rather than fall back
   * to `crossSlugs` and go looking through the mock catalogue.
   */
  crossProducts?: Product[];
  /**
   * "Make It Extra Special" — the tabs, with their add-ons already in them.
   *
   * ⚠️ `addonTabs` above is a list of tab IDS, looked up in this file's
   * `ADDON_TABS` constant. That works for the mock and cannot work for the
   * database, where an add-on belongs to whichever group the owner's rules put
   * it in and has an id nothing in this file has ever heard of.
   *
   * Both exist during the changeover: this one wins when it is present.
   */
  addonGroups?: AddonGroup[];
}

export interface AddonGroup {
  id: string;
  label: string;
  items: AddonItem[];
}

/* ─────────────────── ADD-ONS ─────────────────── */
export interface AddonItem {
  key: string;
  name: string;
  pricePaisa: number;
  bg: string;
  fromCatalog: boolean;
}

const INLINE_ADDONS: Record<string, { name: string; pricePaisa: number; bg: string }> = {
  "svc-premium-card": {
    name: "Premium Card",
    pricePaisa: 15000,
    bg: "linear-gradient(150deg,#EFD9F8,#DFC0F2)",
  },
  "svc-luxury-wrap": {
    name: "Luxury Wrap",
    pricePaisa: 10000,
    bg: "linear-gradient(150deg,#EBDDF4,#D6BEEB)",
  },
  "svc-delivery-video": {
    name: "Delivery Video",
    pricePaisa: 20000,
    bg: "linear-gradient(150deg,#E9E4F4,#D3C9EC)",
  },
  "svc-glass-vase": {
    name: "Glass Vase",
    pricePaisa: 45000,
    bg: "linear-gradient(150deg,#E9E4F4,#D3C9EC)",
  },
};

export function getAddon(key: string): AddonItem | null {
  const p = PRODUCTS.find((x) => x.slug === key);
  if (p) {
    return { key, name: p.name, pricePaisa: p.pricePaisa, bg: p.bg, fromCatalog: true };
  }
  const inline = INLINE_ADDONS[key];
  if (!inline) return null;
  return { key, ...inline, fromCatalog: false };
}

export const ADDON_TABS: { id: string; label: string; items: string[] }[] = [
  {
    id: "popular",
    label: "Most Added",
    items: [
      "handmade-truffle-box-16",
      "svc-premium-card",
      "svc-delivery-video",
      "svc-luxury-wrap",
    ],
  },
  {
    id: "chocolates",
    label: "Chocolates",
    items: [
      "handmade-truffle-box-16",
      "lindt-luxury-selection",
      "toblerone-gift-tower",
      "dairy-milk-celebration-hamper",
    ],
  },
  {
    id: "birthday",
    label: "Birthday",
    items: [
      "bento-mini-celebration",
      "rose-gold-number-balloons",
      "chrome-party-balloon-bundle",
      "svc-premium-card",
    ],
  },
  {
    id: "anniversary",
    label: "Anniversary",
    items: [
      "classic-red-6-roses-wrapped",
      "self-care-candle-box",
      "heart-love-balloon-cluster",
      "handmade-truffle-box-16",
    ],
  },
  {
    id: "keepsakes",
    label: "Keepsakes",
    items: [
      "photo-mug-custom",
      "engraved-wooden-photo-frame",
      "name-led-night-lamp",
      "svc-glass-vase",
    ],
  },
];

/* ─────────────────── OFFERS (Marketing module locked নয় — static) ─────────────────── */
export interface Offer {
  logo: string;
  color: string;
  text: string;
  code?: string;
  note?: string;
}

export const OFFERS: Offer[] = [
  { logo: "bKash", color: "#E2136E", text: "Assured cashback up to ৳300 paying with bKash", note: "T&C*" },
  { logo: "Nagad", color: "#F5811F", text: "Get up to ৳150 cashback on Nagad payment", note: "T&C*" },
  { logo: "RAD", color: "#470066", text: "Flat 15% off on orders above ৳1,499 — first-time customers", code: "NEW15" },
  // ⚠️ সংখ্যা এখানে লিখো না — _data/promo.ts থেকে আসে, নইলে Cart-এর
  // progress bar আর এই লাইন আলাদা সংখ্যা দেখাবে।
  { logo: "🌙", color: "#CF43EA", text: freeDeliveryOfferText(), note: "Auto-applied" },
];

/* ─────────────────── VARIANT GROUPS ───────────────────
   Colour আর Flavour — একই মেকানিজম, একই admin screen পরে।
   Admin-এ এটাই হবে: group বানাও → product গুলো ঢোকাও → label + swatch দাও।
*/
const VARIANT_GROUPS: Record<
  string,
  { kind: VariantKind; label: string; items: { slug: string; label: string; swatch: string }[] }
> = {
  roses: {
    kind: "colour",
    label: "Colour",
    items: [
      { slug: "velvet-red-24-premium-roses", label: "Red", swatch: "#C4172B" },
      { slug: "blush-romance-12-pink-roses", label: "Pink", swatch: "#E8A0C0" },
      { slug: "midnight-rose-heart", label: "Deep Red", swatch: "#7A0C2E" },
      { slug: "classic-red-6-roses-wrapped", label: "Classic Red", swatch: "#D93A4A" },
    ],
  },
  lilies: {
    kind: "colour",
    label: "Colour",
    items: [
      { slug: "blush-lily-and-rose-box", label: "Blush", swatch: "#EEC3D2" },
      { slug: "white-lily-peace-vase", label: "White", swatch: "#F4F1EC" },
    ],
  },
  seasonal: {
    kind: "colour",
    label: "Colour",
    items: [
      { slug: "pastel-mixed-bloom-box", label: "Pastel", swatch: "#E7D3F2" },
      { slug: "sunrise-gerbera-basket", label: "Sunrise", swatch: "#F2A03D" },
      { slug: "golden-sunflower-cheer", label: "Golden", swatch: "#E9B923" },
    ],
  },
  /* Flavour — colour-এর মতোই আলাদা product, শুধু pill-এ ছবি দেখায় */
  cakeFlavour: {
    kind: "flavour",
    label: "Flavour",
    items: [
      { slug: "black-forest-classic", label: "Black Forest", swatch: "linear-gradient(160deg,#F0E2D8,#DCC0AC)" },
      { slug: "red-velvet-cream-cheese", label: "Red Velvet", swatch: "linear-gradient(160deg,#F7E0E4,#E7BAC3)" },
      { slug: "vanilla-butter-cream-1kg", label: "Vanilla", swatch: "linear-gradient(160deg,#FBF3E4,#EFDFBE)" },
      { slug: "fresh-fruit-gateau", label: "Fresh Fruit", swatch: "linear-gradient(160deg,#F2F0DC,#DCD9A8)" },
      { slug: "chocolate-fudge-celebration-cake", label: "Chocolate Fudge", swatch: "linear-gradient(160deg,#E8D8CE,#D3B49E)" },
    ],
  },
};

function variantGroupFor(slug: string): VariantGroup | null {
  for (const g of Object.values(VARIANT_GROUPS)) {
    if (g.items.some((i) => i.slug === slug)) {
      return {
        kind: g.kind,
        label: g.label,
        options: g.items.map((i) => ({ ...i, active: i.slug === slug })),
      };
    }
  }
  return null;
}

/* ─────────────────── CATEGORY LABELS ─────────────────── */
/** exported for `productApi.ts` — it needs the slug↔template mapping too */
export const CAT_META: Record<ProductCategory, { label: string; slug: string }> = {
  flowers: { label: "Fresh Flowers", slug: "fresh-flowers" },
  cakes: { label: "Cakes", slug: "cakes" },
  combos: { label: "Flower Combos", slug: "flower-combos" },
  chocolates: { label: "Chocolates", slug: "chocolates" },
  plants: { label: "Plants", slug: "plants" },
  personalised: { label: "Personalised", slug: "personalised" },
  balloons: { label: "Balloon Bouquets", slug: "balloon-bouquets" },
  giftboxes: { label: "Gift Boxes", slug: "gift-boxes" },
};

const GREY = "linear-gradient(150deg,#EFE4F7,#DDC9EC)";

/** ৫০ টাকার ঘরে round — display-only, Ecommerce lock হলে API দেবে */
function round50(paisa: number): number {
  return Math.round(paisa / 5000) * 5000;
}

function priceOf(slug: string, fallback: number): number {
  return PRODUCTS.find((p) => p.slug === slug)?.pricePaisa ?? fallback;
}

const CHOCO = priceOf("handmade-truffle-box-16", 135000);
const CAKE = priceOf("bento-mini-celebration", 79000);
const ROSES6 = priceOf("classic-red-6-roses-wrapped", 89000);
const BALLOONS = priceOf("chrome-party-balloon-bundle", 75000);
const TEDDY = 55000;

/* ─────────────────── CATEGORY TEMPLATES ─────────────────── */
interface DetailTemplate {
  nature: (p: Product) => ProductDetail["nature"];
  trust: (p: Product) => TrustItem[];
  sizeLabel: string;
  sizes: (p: Product) => SizeOption[];
  bundles: (p: Product) => BundleOption[];
  bundleHint: string;
  addonTabs: string[];
  perso: (p: Product) => Perso | null;
  spec: (p: Product) => SpecRow[];
  craft: CraftPoint[];
  faqs: (p: Product) => Faq[];
  custom: { title: string; sub: string };
  ozReason: string;
}

const FRESH_TRUST = (p: Product): TrustItem[] => [
  p.zone === "dhaka"
    ? { icon: "bolt", label: "2-Hour Delivery", sub: "inside Dhaka" }
    : { icon: "truck", label: "Nationwide Delivery", sub: "64 districts" },
  { icon: "shield", label: "Freshness Guarantee", sub: "replace or refund" },
  { icon: "star", label: "4.9 on Google", sub: "412 real reviews" },
];

/** সব category-তে bundle-এর গঠন এক — শুধু কী যোগ হচ্ছে সেটা বদলায় */
function bundleSet(
  base: string,
  items: { id: string; label: string; add: number; bg: string; best?: boolean }[],
): BundleOption[] {
  /*  ⚠️ `base` ("Just Flowers") আর তালিকায় বসে না — DEC-PRD-013-এ কিছুই
      না বাছাই ফেরার পথ। নামটা signature-এ রয়ে গেছে যাতে প্রতিটা
      category-র ডাকা জায়গা বদলাতে না হয়; ওটা কেবল পড়ার জন্য।  */
  void base;
  /*  ⚠️ mock-এ ছাড় নেই — `add` সংখ্যাটাই এখন জিনিসটার নিজের দাম। Mock
      শুধু নকশা দেখার জন্য; আসল দাম আর ছাড় API থেকে।  */
  return items.map((i) => ({
    id: i.id,
    label: i.label,
    pricePaisa: i.add,
    bg: i.bg,
    tag: i.best ? "Most loved" : undefined,
    best: i.best,
  }));
}

/**
 * ⚠️ Exported for `productApi.ts`, which still reads FOUR things from here on
 * the live path: the size heading, the "why us" cards, the customisation
 * invitation and the out-of-zone sentence. All four are shop copy with an open
 * audit row (§3) — none of them is a price or a stock claim. They leave this
 * file when those rows close.
 */
export const TEMPLATES: Record<ProductCategory, DetailTemplate> = {
  /* ---------------- FLOWERS ---------------- */
  flowers: {
    nature: () => ({ type: "fresh", label: "100% Fresh Flowers" }),
    trust: FRESH_TRUST,
    sizeLabel: "Bouquet Size",
    sizes: (p) => [
      { id: "std", label: "Standard", sub: "as shown", pricePaisa: p.pricePaisa },
      { id: "large", label: "Large", sub: "+50% blooms", pricePaisa: round50(p.pricePaisa * 1.5) },
      { id: "grand", label: "Grand", sub: "double blooms", pricePaisa: round50(p.pricePaisa * 2) },
    ],
    bundles: () =>
      bundleSet("Just Flowers", [
        { id: "choco", label: "+ Chocolates", add: CHOCO, bg: "linear-gradient(150deg,#F1E0D5,#E5C4AE)", best: true },
        { id: "cake", label: "+ Cake", add: CAKE, bg: "linear-gradient(150deg,#F3DCE4,#E7BFD0)" },
        { id: "teddy", label: "+ Teddy", add: TEDDY, bg: "linear-gradient(150deg,#F6E9D8,#EDD4B0)" },
      ]),
    bundleHint: "most people add chocolates",
    addonTabs: ["popular", "chocolates", "anniversary", "keepsakes"],
    perso: () => null,
    spec: (p) => [
      { item: "Fresh cut flowers", qty: "As shown in photo" },
      { item: "Seasonal greens & filler", qty: "Included" },
      { item: "Signature matte wrap", qty: "1 piece" },
      { item: "Satin ribbon", qty: "1 piece" },
      { item: "Flower food sachet", qty: "1 piece" },
      { item: "Handwritten greeting card", qty: "1 piece" },
      { item: "Vase", qty: "Not included — add one below" },
      { item: "Expected freshness", qty: p.zone === "dhaka" ? "5–8 days" : "4–6 days" },
    ],
    craft: [
      { icon: "sun", title: "Cut this morning", text: "Market run before sunrise — no warehouse stock, no cold-storage roses." },
      { icon: "store", title: "Made in our own studio", text: "Our florists arrange it by hand in Dhanmondi. Walk in and watch." },
      { icon: "bolt", title: "Never sits waiting", text: "Arranged after you order, delivered within 2 hours. That's why it looks alive." },
    ],
    faqs: () => [
      {
        q: "Is this a real fresh flower or artificial?",
        a: "100% fresh, natural flowers — cut at the market this morning and arranged in our studio the same day. Nothing here is artificial. Any artificial arrangement we sell is clearly marked “Premium Artificial” at the top of the page and in the specification table.",
      },
      {
        q: "Can I get a different colour?",
        a: "Yes — the colour swatches at the top of this page take you to the same bouquet in another colour, each with its own photo. If you want a colour you don't see, message us on WhatsApp.",
      },
      {
        q: "How do I keep it fresh?",
        a: "Trim the stems at an angle, use the flower food we include, change the water daily and keep it out of direct sun. Expect 5–8 beautiful days.",
      },
    ],
    custom: {
      title: "Want this bouquet customized?",
      sub: "Different colours, sizes or a theme — chat with our floral experts.",
    },
    ozReason: "Cut flowers don't survive a 1–3 day courier journey — so we don't ship what we can't deliver perfectly.",
  },

  /* ---------------- CAKES ---------------- */
  cakes: {
    nature: () => ({ type: "fresh", label: "Freshly Baked — Same Morning" }),
    trust: () => [
      { icon: "sun", label: "Baked Today", sub: "never frozen" },
      { icon: "shield", label: "Taste Guarantee", sub: "replace or refund" },
      { icon: "star", label: "4.9 on Google", sub: "412 real reviews" },
    ],
    sizeLabel: "Weight",
    sizes: (p) => [
      { id: "1lb", label: "1 lb", sub: "serves 6–8", pricePaisa: p.pricePaisa },
      { id: "2lb", label: "2 lb", sub: "serves 12–15", pricePaisa: round50(p.pricePaisa * 1.85) },
      { id: "3lb", label: "3 lb", sub: "serves 18–22", pricePaisa: round50(p.pricePaisa * 2.6) },
    ],
    bundles: () =>
      bundleSet("Just Cake", [
        { id: "roses", label: "+ 6 Roses", add: ROSES6, bg: "linear-gradient(150deg,#F3DCE4,#E7BFD0)", best: true },
        { id: "balloons", label: "+ Balloons", add: BALLOONS, bg: "linear-gradient(150deg,#F6E9D8,#EDD4B0)" },
        { id: "choco", label: "+ Chocolates", add: CHOCO, bg: "linear-gradient(150deg,#F1E0D5,#E5C4AE)" },
      ]),
    bundleHint: "cake + roses is the classic combo",
    addonTabs: ["popular", "birthday", "chocolates", "keepsakes"],
    perso: (p) =>
      p.sub === "photo"
        ? {
            title: "Your Photo On The Cake",
            fields: [
              { type: "upload", label: "Upload the photo", hint: "JPG or PNG · minimum 1000px wide" },
              { type: "text", label: "Message on the cake", placeholder: "e.g. Happy Birthday Ammu ❤", max: 40, hint: "Piped in chocolate · 40 characters" },
            ],
          }
        : {
            title: "Message On The Cake",
            fields: [
              { type: "text", label: "What should we pipe on top?", placeholder: "e.g. Happy Birthday Ammu ❤", max: 40, hint: "Piped in chocolate · 40 characters" },
            ],
          },
    spec: () => [
      { item: "Freshly baked cake", qty: "1 lb" },
      { item: "Frosting", qty: "Made in-house" },
      { item: "Chocolate message piping", qty: "Up to 40 characters" },
      { item: "Candle set", qty: "1 set" },
      { item: "Cake knife", qty: "1 piece" },
      { item: "Insulated cake box", qty: "1 piece" },
      { item: "Serves", qty: "6–8 people" },
    ],
    craft: [
      { icon: "sun", title: "Baked the morning it arrives", text: "No freezer racks, no day-old sponge. Oven to door, same day." },
      { icon: "store", title: "Our own bakers", text: "Finished by hand in our Dhanmondi kitchen — not bought in and resold." },
      { icon: "shield", title: "Taste guarantee", text: "Not happy with the first bite? Replaced or refunded — one photo." },
    ],
    faqs: () => [
      {
        q: "Is the cake freshly baked or frozen?",
        a: "Freshly baked the same morning as your delivery — never frozen, never day-old. The frosting is made in-house, which is why it tastes like a bakery instead of a fridge.",
      },
      {
        q: "Can I get it eggless?",
        a: "Yes — leave a note at checkout or message us on WhatsApp and our bakers will make it eggless at no extra cost.",
      },
    ],
    custom: { title: "Need a custom cake design?", sub: "Photo cakes, themes and tiers — chat with our bakers." },
    ozReason: "Fresh frosting doesn't survive a 1–3 day courier journey — so we don't ship what we can't deliver perfectly.",
  },

  /* ---------------- BALLOONS ---------------- */
  balloons: {
    nature: () => ({ type: "artificial", label: "Helium Balloons — Arrives Inflated" }),
    trust: () => [
      { icon: "bolt", label: "2-Hour Delivery", sub: "inside Dhaka" },
      { icon: "gift", label: "Arrives Inflated", sub: "we carry it in" },
      { icon: "star", label: "4.9 on Google", sub: "412 real reviews" },
    ],
    sizeLabel: "How Many Balloons",
    sizes: (p) => [
      { id: "12", label: "12 pcs", sub: "classic", pricePaisa: p.pricePaisa },
      { id: "24", label: "24 pcs", sub: "fills the room", pricePaisa: round50(p.pricePaisa * 1.7) },
      { id: "36", label: "36 pcs", sub: "full décor", pricePaisa: round50(p.pricePaisa * 2.4) },
    ],
    bundles: () =>
      bundleSet("Just Balloons", [
        { id: "cake", label: "+ Cake", add: CAKE, bg: "linear-gradient(150deg,#F3DCE4,#E7BFD0)", best: true },
        { id: "roses", label: "+ 6 Roses", add: ROSES6, bg: "linear-gradient(150deg,#F3DCE4,#E7BFD0)" },
        { id: "choco", label: "+ Chocolates", add: CHOCO, bg: "linear-gradient(150deg,#F1E0D5,#E5C4AE)" },
      ]),
    bundleHint: "balloons + cake = the whole birthday",
    addonTabs: ["popular", "birthday", "chocolates", "keepsakes"],
    perso: () => ({
      title: "Colours & Message Balloon",
      fields: [
        { type: "text", label: "Text on the centre balloon", placeholder: "e.g. Happy 25th Priya!", max: 25, hint: "Printed on the centre balloon · 25 characters" },
        { type: "upload", label: "Reference photo (optional)", hint: "A theme or setup you love — we'll match it" },
      ],
    }),
    spec: () => [
      { item: "Helium latex balloons", qty: "12 pieces" },
      { item: "Printed message balloon", qty: "1 piece" },
      { item: "Decorative weight", qty: "1 piece" },
      { item: "Ribbon tails", qty: "12 pieces" },
      { item: "Greeting card", qty: "1 piece" },
      { item: "Float time", qty: "2–3 days indoors" },
    ],
    craft: [
      { icon: "bolt", title: "Inflated at your door", text: "We carry it in ready — you never touch a pump or a tank." },
      { icon: "gift", title: "Fills the whole room", text: "Flowers sit on a table. Balloons take over the ceiling." },
      { icon: "shield", title: "Arrive-perfect promise", text: "Deflated or damaged on arrival? Replaced the same day." },
    ],
    faqs: () => [
      {
        q: "Will the balloons arrive already inflated?",
        a: "Yes — fully inflated with premium helium and hand-delivered by our own rider. You do nothing. They stay floating 2–3 days indoors at room temperature.",
      },
    ],
    custom: { title: "Planning a bigger surprise?", sub: "Room décor, arches and themes — chat with our team." },
    ozReason: "Helium doesn't survive a courier van — inflated balloons only work when we hand-deliver them ourselves.",
  },

  /* ---------------- CHOCOLATES ---------------- */
  chocolates: {
    nature: () => ({ type: "fresh", label: "Sealed & Fresh — Original Stock" }),
    trust: () => [
      { icon: "truck", label: "Ships Nationwide", sub: "64 districts" },
      { icon: "shield", label: "100% Original", sub: "sealed, in-date" },
      { icon: "star", label: "4.9 on Google", sub: "412 real reviews" },
    ],
    sizeLabel: "Box Size",
    sizes: (p) => [
      { id: "std", label: "Standard", sub: "as shown", pricePaisa: p.pricePaisa },
      { id: "double", label: "Double Box", sub: "twice the pieces", pricePaisa: round50(p.pricePaisa * 1.8) },
    ],
    bundles: () =>
      bundleSet("Just Chocolates", [
        { id: "roses", label: "+ 6 Roses", add: ROSES6, bg: "linear-gradient(150deg,#F3DCE4,#E7BFD0)", best: true },
        { id: "teddy", label: "+ Teddy", add: TEDDY, bg: "linear-gradient(150deg,#F6E9D8,#EDD4B0)" },
        { id: "card", label: "+ Premium Card", add: 15000, bg: "linear-gradient(150deg,#EFD9F8,#DFC0F2)" },
      ]),
    bundleHint: "chocolates + roses is the classic pairing",
    addonTabs: ["popular", "chocolates", "anniversary", "keepsakes"],
    perso: () => null,
    spec: () => [
      { item: "Chocolate assortment", qty: "As shown in photo" },
      { item: "Gift box & inner tray", qty: "1 set" },
      { item: "Ribbon", qty: "1 piece" },
      { item: "Greeting card", qty: "1 piece" },
      { item: "Storage", qty: "Cool, dry place" },
    ],
    craft: [
      { icon: "shield", title: "Original, sealed, in-date", text: "We buy through authorised channels only. No grey-market stock, ever." },
      { icon: "truck", title: "Courier-safe packing", text: "Insulated and cushioned, so it arrives looking like a gift — not a parcel." },
      { icon: "gift", title: "Gift-ready out of the box", text: "Nothing to re-wrap. Hand it over exactly as it arrives." },
    ],
    faqs: () => [
      {
        q: "Are the chocolates original and in-date?",
        a: "Yes — sealed, original stock bought through authorised channels, with a clear expiry date on every box. If anything arrives damaged or out of date, one photo gets it replaced.",
      },
    ],
    custom: { title: "Want a bigger chocolate hamper?", sub: "Corporate boxes and custom hampers — chat with our team." },
    ozReason: "This item is currently Dhaka-only.",
  },

  /* ---------------- GIFT BOXES ---------------- */
  giftboxes: {
    nature: () => ({ type: "fresh", label: "Curated Gift Box — Ready to Give" }),
    trust: () => [
      { icon: "truck", label: "Ships Nationwide", sub: "64 districts" },
      { icon: "gift", label: "Gift-Ready", sub: "nothing to re-wrap" },
      { icon: "star", label: "4.9 on Google", sub: "412 real reviews" },
    ],
    sizeLabel: "Box Size",
    sizes: (p) => [
      { id: "std", label: "Standard", sub: "as shown", pricePaisa: p.pricePaisa },
      { id: "grand", label: "Grand", sub: "more items", pricePaisa: round50(p.pricePaisa * 1.6) },
    ],
    bundles: () =>
      bundleSet("Just the Box", [
        { id: "flowers", label: "+ Flowers", add: ROSES6, bg: "linear-gradient(150deg,#F3DCE4,#E7BFD0)", best: true },
        { id: "choco", label: "+ Chocolates", add: CHOCO, bg: "linear-gradient(150deg,#F1E0D5,#E5C4AE)" },
        { id: "card", label: "+ Premium Card", add: 15000, bg: "linear-gradient(150deg,#EFD9F8,#DFC0F2)" },
      ]),
    bundleHint: "adding flowers doubles the reaction",
    addonTabs: ["popular", "chocolates", "keepsakes", "anniversary"],
    perso: () => null,
    spec: () => [
      { item: "Curated items", qty: "As listed in photo" },
      { item: "Keepsake gift box", qty: "1 piece" },
      { item: "Tissue & filler", qty: "Included" },
      { item: "Ribbon", qty: "1 piece" },
      { item: "Greeting card", qty: "1 piece" },
    ],
    craft: [
      { icon: "pen", title: "Curated, not random", text: "Every item is chosen to work together — no filler to make the box look full." },
      { icon: "gift", title: "Arrives gift-ready", text: "Boxed, ribboned and carded. Hand it over exactly as it arrives." },
      { icon: "truck", title: "Travels safely", text: "Cushioned packing built for a 1–3 day courier journey." },
    ],
    faqs: () => [
      {
        q: "Can I change what's inside the box?",
        a: "Yes — message us on WhatsApp before you order and we'll swap items or build a custom box for you.",
      },
    ],
    custom: { title: "Want a custom gift box?", sub: "Corporate and bulk boxes too — chat with our team." },
    ozReason: "This item is currently Dhaka-only.",
  },

  /* ---------------- COMBOS ---------------- */
  combos: {
    nature: () => ({ type: "fresh", label: "Fresh Flowers + Fresh Cake" }),
    trust: FRESH_TRUST,
    sizeLabel: "Combo Size",
    sizes: (p) => [
      { id: "std", label: "Standard", sub: "as shown", pricePaisa: p.pricePaisa },
      { id: "big", label: "Bigger Cake", sub: "2 lb cake", pricePaisa: round50(p.pricePaisa * 1.3) },
      { id: "grand", label: "Grand", sub: "double everything", pricePaisa: round50(p.pricePaisa * 1.8) },
    ],
    bundles: () =>
      bundleSet("Standard Combo", [
        { id: "balloons", label: "+ Balloons", add: BALLOONS, bg: "linear-gradient(150deg,#F6E9D8,#EDD4B0)", best: true },
        { id: "choco", label: "+ Chocolates", add: CHOCO, bg: "linear-gradient(150deg,#F1E0D5,#E5C4AE)" },
        { id: "teddy", label: "+ Teddy", add: TEDDY, bg: "linear-gradient(150deg,#F3DCE4,#E7BFD0)" },
      ]),
    bundleHint: "balloons turn it into a full surprise",
    addonTabs: ["popular", "birthday", "chocolates", "keepsakes"],
    perso: () => ({
      title: "Message On The Cake",
      fields: [
        { type: "text", label: "What should we pipe on top?", placeholder: "e.g. Happy Anniversary ❤", max: 40, hint: "Piped in chocolate · 40 characters" },
      ],
    }),
    spec: () => [
      { item: "Fresh flower bouquet", qty: "As shown in photo" },
      { item: "Freshly baked cake", qty: "1 lb" },
      { item: "Chocolate message piping", qty: "Up to 40 characters" },
      { item: "Candle & knife set", qty: "1 set" },
      { item: "Signature wrap & ribbon", qty: "1 set" },
      { item: "Handwritten greeting card", qty: "1 piece" },
    ],
    craft: [
      { icon: "bolt", title: "One delivery, one moment", text: "Flowers and cake arrive together, at the same minute — not in two trips." },
      { icon: "sun", title: "Both made the same day", text: "Cut this morning, baked this morning. Nothing is pulled off a shelf." },
      { icon: "shield", title: "One guarantee, both items", text: "Anything less than perfect? One photo replaces the whole combo." },
    ],
    faqs: () => [
      {
        q: "Do the flowers and cake arrive together?",
        a: "Yes — one rider, one delivery, one moment. The cake is boxed separately so nothing gets crushed.",
      },
    ],
    custom: { title: "Want a custom combo?", sub: "Mix any flower, cake and add-on — chat with our team." },
    ozReason: "Fresh cake and cut flowers don't survive a courier journey — this combo is Dhaka-only.",
  },

  /* ---------------- PLANTS ---------------- */
  plants: {
    nature: () => ({ type: "fresh", label: "Live Plant — Not Artificial" }),
    trust: () => [
      { icon: "truck", label: "Ships Nationwide", sub: "64 districts" },
      { icon: "leaf", label: "Live & Healthy", sub: "or replaced free" },
      { icon: "star", label: "4.9 on Google", sub: "412 real reviews" },
    ],
    sizeLabel: "Plant Size",
    sizes: (p) => [
      { id: "small", label: "Desk Size", sub: "as shown", pricePaisa: p.pricePaisa },
      { id: "medium", label: "Medium", sub: "taller plant", pricePaisa: round50(p.pricePaisa * 1.5) },
      { id: "large", label: "Floor Size", sub: "fills a corner", pricePaisa: round50(p.pricePaisa * 2.3) },
    ],
    bundles: () =>
      bundleSet("Standard Pot", [
        { id: "ceramic", label: "+ Ceramic Pot", add: 40000, bg: "linear-gradient(150deg,#E9E4F4,#D3C9EC)", best: true },
        { id: "card", label: "+ Premium Card", add: 15000, bg: "linear-gradient(150deg,#EFD9F8,#DFC0F2)" },
        { id: "choco", label: "+ Chocolates", add: CHOCO, bg: "linear-gradient(150deg,#F1E0D5,#E5C4AE)" },
      ]),
    bundleHint: "the ceramic pot is what makes it a gift",
    addonTabs: ["popular", "keepsakes", "chocolates", "anniversary"],
    perso: () => null,
    spec: () => [
      { item: "Live plant", qty: "1 piece" },
      { item: "Pot", qty: "1 piece" },
      { item: "Potting soil", qty: "Included" },
      { item: "Care instruction card", qty: "1 piece" },
      { item: "Greeting card", qty: "1 piece" },
      { item: "Light needed", qty: "Indirect, indoor" },
    ],
    craft: [
      { icon: "leaf", title: "A gift that's alive next year", text: "Flowers last a week. This one is still on their desk in twelve months." },
      { icon: "shield", title: "Arrives healthy — guaranteed", text: "Wilted or damaged on arrival? Replaced free, one photo." },
      { icon: "pen", title: "Care card included", text: "Water schedule and light needs written on the card. Nobody has to google it." },
    ],
    faqs: () => [
      {
        q: "Is this a live plant or artificial?",
        a: "A real, live plant — grown, potted and hardened off before it ships. It arrives healthy or we replace it free.",
      },
    ],
    custom: { title: "Want a bigger plant or a custom pot?", sub: "Office greening and bulk orders too — chat with our team." },
    ozReason: "This plant is too large to courier safely — Dhaka-only for now.",
  },

  /* ---------------- PERSONALISED ---------------- */
  personalised: {
    nature: () => ({ type: "artificial", label: "Made To Order — Your Photo & Words" }),
    trust: () => [
      { icon: "truck", label: "Ships Nationwide", sub: "64 districts" },
      { icon: "pen", label: "Made In Our Studio", sub: "printed in Dhaka" },
      { icon: "star", label: "4.9 on Google", sub: "412 real reviews" },
    ],
    sizeLabel: "How Many",
    sizes: (p) => [
      { id: "single", label: "Single", sub: "one piece", pricePaisa: p.pricePaisa },
      { id: "pair", label: "Couple Pair", sub: "two matching", pricePaisa: round50(p.pricePaisa * 1.8) },
    ],
    bundles: () =>
      bundleSet("Just the Gift", [
        { id: "choco", label: "+ Chocolates", add: CHOCO, bg: "linear-gradient(150deg,#F1E0D5,#E5C4AE)", best: true },
        { id: "roses", label: "+ 6 Roses", add: ROSES6, bg: "linear-gradient(150deg,#F3DCE4,#E7BFD0)" },
        { id: "wrap", label: "+ Luxury Wrap", add: 10000, bg: "linear-gradient(150deg,#EBDDF4,#D6BEEB)" },
      ]),
    bundleHint: "chocolates make it feel complete",
    addonTabs: ["popular", "keepsakes", "chocolates", "birthday"],
    perso: () => ({
      title: "Your Photo & Your Words",
      fields: [
        { type: "upload", label: "Upload the photo", hint: "JPG or PNG · minimum 1000px wide" },
        { type: "text", label: "Text to print", placeholder: "e.g. World's Okayest Brother", max: 30, hint: "Printed in our studio · 30 characters" },
      ],
    }),
    spec: () => [
      { item: "Personalised item", qty: "1 piece" },
      { item: "Full-colour print", qty: "Heat-set, fade-resistant" },
      { item: "Custom text", qty: "Up to 30 characters" },
      { item: "Gift box & protective wrap", qty: "1 set" },
      { item: "Greeting card", qty: "1 piece" },
      { item: "Production time", qty: "Same day (order before 2 PM)" },
    ],
    craft: [
      { icon: "pen", title: "Printed in our studio, not a factory", text: "Printed, heat-set and checked by our own team in Dhaka — a photo taken at breakfast is a gift by dinner." },
      { icon: "shield", title: "Print guarantee", text: "Print flaw or wrong photo? Reprinted free, no questions." },
      { icon: "gift", title: "A keepsake, not a bouquet", text: "Years later it's still on the shelf. That's the whole point." },
    ],
    faqs: () => [
      {
        q: "What photo quality do you need?",
        a: "JPG or PNG, at least 1000px wide. If your photo is too small we'll message you before printing — we never print something that will look blurry.",
      },
      { q: "Is the print durable?", a: "Yes — heat-set and fade-resistant. Dishwasher-safe on mugs, wipe-clean on frames and lamps." },
    ],
    custom: { title: "Want a fully custom design?", sub: "Collages, quotes, anything — send us the idea." },
    ozReason: "This item is currently Dhaka-only.",
  },
};

/* ─────────────────── PER-PRODUCT OVERRIDES ─────────────────── */
type Override = Partial<Omit<ProductDetail, "product">>;

const DETAIL_OVERRIDES: Record<string, Override> = {
  "velvet-red-24-premium-roses": {
    sizeLabel: "Stem Count",
    sizes: [
      { id: "12", label: "12 Stems", sub: "classic", pricePaisa: 129000 },
      { id: "24", label: "24 Stems", sub: "as shown", pricePaisa: 245000 },
      { id: "50", label: "50 Stems", sub: "the grand gesture", pricePaisa: 490000 },
      { id: "100", label: "100 Stems", sub: "unforgettable", pricePaisa: 890000 },
    ],
    spec: [
      { item: "Red Rose (fresh cut)", qty: "24 sticks" },
      { item: "Gypsophila (Gypsy)", qty: "3 sticks" },
      { item: "Eucalyptus greens", qty: "4 sticks" },
      { item: "Signature matte wrap", qty: "1 piece" },
      { item: "Satin ribbon", qty: "1 piece" },
      { item: "Flower food sachet", qty: "1 piece" },
      { item: "Handwritten greeting card", qty: "1 piece" },
      { item: "Vase", qty: "Not included — add one below" },
      { item: "Expected freshness", qty: "5–8 days" },
    ],
    craft: [
      { icon: "sun", title: "Cut this morning, in her hands tonight", text: "Every Velvet Red starts before sunrise at the market — only stems that pass the 5-day freshness test make it in." },
      { icon: "store", title: "Arranged in our Dhanmondi studio", text: "Conditioned, hand-tied and wrapped by our own florists. Nothing sits in a warehouse." },
      { icon: "bolt", title: "Two hours, door to door", text: "No hot van, no waiting. That's why it arrives looking like it was picked for one person." },
    ],
  },
};

/* ─────────────────── ⇄ SWAP HERE ─────────────────── */
export function getProductDetail(slug: string): ProductDetail | null {
  const product = PRODUCTS.find((p) => p.slug === slug);
  if (!product) return null;

  const t = TEMPLATES[product.cat];
  const meta = CAT_META[product.cat];

  const base: ProductDetail = {
    product,
    crumb: {
      catLabel: meta.label,
      catSlug: meta.slug,
      subLabel: product.sub
        ? product.sub.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
        : meta.label,
      short: product.name.split("—")[0].trim(),
    },
    nature: t.nature(product),
    shortDesc: null,
    /*  ⚠️ mock-only path (the live one is productApi.ts) — but the mock must
        not lie either, or a dev screenshot ships the wrong promise.  */
    deliveryChip: product.zone === "dhaka" ? "Express Delivery" : "Delivered Nationwide",
    gallery: [product.bg, GREY, product.bg, GREY],
    videoId: "ScMzIvxBSi4",
    trust: t.trust(product),
    variant: variantGroupFor(product.slug),
    sizes: t.sizes(product),
    sizeLabel: t.sizeLabel,
    bundles: t.bundles(product),
    bundleHint: t.bundleHint,
    addonTabs: t.addonTabs,
    perso: t.perso(product),
    spec: t.spec(product),
    craft: t.craft,
    faqs: t.faqs(product),
    custom: t.custom,
    crossSlugs: crossSellFor(product),
    ozReason: t.ozReason,
    reviews: { rating: "4.9", count: 412, live: product.meta },
  };

  return guard({ ...base, ...(DETAIL_OVERRIDES[slug] ?? {}) });
}

/*
  ── দুটো invariant, এখানেই — component-এ নয় ──────────────────────────────

  `PdpView` খোলে `useState(detail.sizes[0].id)` দিয়ে, আর `cart.ts` লেখে
  `size.pricePaisa` — দুটোই ধরে নিয়েছে অন্তত একটা row আছে। TEMPLATES-এ
  সবসময় ছিল, তাই কখনো ধরা পড়েনি। Database-এ size ছাড়া product **প্রথম
  দিনেই** থাকবে (admin-এ Sizes card খালি রেখে save করলেই), আর তখন
  `[0].id` = crash — খালি section নয়, **সাদা পর্দা**।

  ⚠️ EXPORTED, 1 Aug 2026 — এবং এই শব্দটাই আসল সংশোধন। প্রথমবার guard-টা
  শুধু নিচের mock function-এ বসানো হয়েছিল, তাই database থেকে আসা পথে
  কিছুই বদলায়নি। মালিক admin-এ size ছাড়া একটা product publish করলেন আর
  তার page **"Something went wrong"** দেখাল — ঠিক যে জিনিসটা ঠেকানোর জন্য
  এটা লেখা, সেটাই ঘটল, কারণ দুটো পথের একটাতে বসানো হয়েছিল।

  Mock আর API — দুটোই এখন এর ভেতর দিয়ে যায়। Invariant একটাই, তাই বসানোর
  জায়গাও একটাই হওয়া উচিত ছিল।

  ঠিক করা হয়েছে seam-এ, component-এ নয়। দুটো কারণে:

  1. Component-এ `size?.pricePaisa ?? …` বসালে `ResolvedLine.size`-কে
     nullable করতে হত, আর সেটা cart-এর প্রতিটা component-এ ছড়াত — money
     page, যেটা এই pass-এর বাইরে।
  2. API যখন বসবে তখনো ঠিক এই নিয়মটাই লাগবে। Component নয়, seam-ই এর
     জায়গা — তাই আজ mock, কাল fetch, নিয়ম এক।

  Fallback দুটোই সত্য, বানানো নয়: size না থাকলে product-এর নিজের দামই
  একমাত্র দাম, আর bundle না থাকলে "শুধু এই জিনিসটা" ছাড়া কিছু যোগ হয় না।
  একটামাত্র option থাকলে UI সেটা লুকিয়ে দেয় (`PdpView`) — data থাকা আর
  chooser দেখানো আলাদা প্রশ্ন।
*/
export function guard(d: ProductDetail): ProductDetail {
  if (d.sizes.length === 0) {
    d.sizes = [{ id: "std", label: "Standard", pricePaisa: d.product.pricePaisa }];
  }
  /*
    ⚠️ খালি bundle তালিকা আর ভরাট করা হয় না — DEC-PRD-013, ২ আগস্ট ২০২৬।

    আগে এখানে "Just this · No extra" নামে একটা card বসানো হতো, কারণ
    card-গুলো ছিল "এর মধ্যে একটা বাছুন" আর একটা না বাছলে চলত না। এখন
    কয়েকটা একসাথে বাছা যায়, তাই কিছুই না বাছাই স্বাভাবিক — আর খালি
    তালিকা মানে PdpView পুরো অংশটাই আঁকে না।
  */
  return d;
}

/** Cross-sell — একই occasion, অন্য category */
function crossSellFor(p: Product): string[] {
  const occ = p.occ ?? [];
  return PRODUCTS.filter(
    (x) =>
      x.slug !== p.slug &&
      x.cat !== p.cat &&
      x.best &&
      (occ.length === 0 || (x.occ ?? []).some((o) => occ.includes(o))),
  )
    .slice(0, 6)
    .map((x) => x.slug);
}

export const PRODUCT_SLUGS = PRODUCTS.map((p) => p.slug);
