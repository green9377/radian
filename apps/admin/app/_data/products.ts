// Admin app self-contained — Zone type inlined (web-এ এটা useZoneStore থেকে আসত)।
// ⇄ SWAP HERE: Product API এলে এই mock সরবে, দুই app-ই :4000 থেকে পড়বে।
export type Zone = "dhaka" | "bangladesh";

/*
  Mock product data — simulates what the API will return later.
  Constitution rules applied:
  - Money stored as integers in PAISA (1 taka = 100 paisa)
  - zone: "dhaka" = Inside-Dhaka-only, "both" = ships nationwide
  Flags: best = Best Sellers, exp = 2-hour express, sd = same day, mn = midnight,
         neu = new arrival
*/

export type ProductCategory =
  | "flowers"
  | "cakes"
  | "balloons"
  | "chocolates"
  | "giftboxes"
  | "combos"
  | "plants"
  | "personalised";

export type ProductBadge = "express" | "midnight" | "courier";

export interface Product {
  slug: string;
  name: string;
  pricePaisa: number;
  cat: ProductCategory;
  /** Sub-category slug (e.g. "roses"). API-তে এটা Category FK হবে. */
  sub?: string;
  zone: "dhaka" | "both";
  badge: ProductBadge;
  stars: string;
  meta: string;
  bg: string;
  best?: boolean;
  exp?: boolean;
  sd?: boolean;
  mn?: boolean;
  /** New arrival — category page-এর rail rule-এ ব্যবহৃত */
  neu?: boolean;
  /** Gift Finder tag — occasion. API-তে এটা Product↔Occasion relation হবে. */
  occ?: Occasion[];
  /** Gift Finder tag — recipient. API-তে এটা Product↔Recipient relation হবে. */
  rec?: Recipient[];
  /**
   * ★ Advance payment required — COD বন্ধ (checkout, `_data/payment.ts`)।
   * Made-to-order জিনিস: engrave/print হয়ে গেলে বাতিল হলে ক্ষতি পুরোটা দোকানের।
   * Admin panel থেকে product-এ on/off হবে — Ecommerce schema-তে `prepaidOnly`।
   */
  prepaidOnly?: boolean;
}

export type Occasion =
  | "birthday"
  | "anniversary"
  | "love"
  | "congratulations"
  | "get-well"
  | "sorry"
  | "corporate"
  | "just-because";

export type Recipient = "her" | "him" | "parents" | "friend" | "colleague";

/** Format paisa as taka for display: 129000 → "৳ 1,290" */
export function formatTaka(paisa: number): string {
  return "৳ " + (paisa / 100).toLocaleString("en-IN");
}

/** Zone filter: All Bangladesh shows courier-safe (zone "both") products only */
export function zoneFilter(product: Product, zone: Zone | null): boolean {
  return zone === "bangladesh" ? product.zone === "both" : true;
}

export const PRODUCTS: Product[] = [
  {
    slug: "blush-romance-12-pink-roses",
    name: "Blush Romance — 12 Pink Roses",
    pricePaisa: 129000,
    cat: "flowers",
    sub: "roses",
    zone: "dhaka",
    badge: "express",
    stars: "★★★★★",
    meta: "214 orders this month",
    bg: "linear-gradient(160deg,var(--o-solid),var(--o-solid))",
    best: true,
    exp: true,
    sd: true,
    occ: ["love", "anniversary", "just-because"],
    rec: ["her"],
  },
  {
    slug: "velvet-red-24-premium-roses",
    name: "Velvet Red — 24 Premium Roses",
    pricePaisa: 245000,
    cat: "flowers",
    sub: "roses",
    zone: "dhaka",
    badge: "express",
    stars: "★★★★★",
    meta: "Bestseller",
    bg: "linear-gradient(160deg,var(--f-bad),var(--f-bad))",
    best: true,
    exp: true,
    sd: true,
    mn: true,
    occ: ["love", "anniversary"],
    rec: ["her", "him"],
  },
  {
    slug: "white-orchid-elegance",
    name: "White Orchid Elegance",
    pricePaisa: 165000,
    cat: "flowers",
    sub: "orchids",
    zone: "dhaka",
    badge: "express",
    stars: "★★★★★",
    meta: "88 orders this month",
    bg: "linear-gradient(160deg,var(--a-solid),var(--a-solid))",
    best: true,
    sd: true,
    occ: ["congratulations", "corporate", "just-because"],
    rec: ["her", "colleague", "parents"],
  },
  {
    slug: "soft-peony-dream",
    name: "Soft Peony Dream",
    pricePaisa: 198000,
    cat: "flowers",
    sub: "mixed",
    zone: "dhaka",
    badge: "express",
    stars: "★★★★★",
    meta: "61 orders this month",
    bg: "linear-gradient(160deg,var(--a-solid),var(--a-solid))",
    best: true,
    sd: true,
    occ: ["birthday", "just-because", "love"],
    rec: ["her"],
  },
  {
    slug: "chocolate-fudge-celebration-cake",
    name: "Chocolate Fudge Celebration Cake",
    pricePaisa: 145000,
    cat: "cakes",
    sub: "chocolate",
    zone: "dhaka",
    badge: "express",
    stars: "★★★★☆",
    meta: "Baked this morning",
    bg: "linear-gradient(160deg,var(--f-warn),var(--f-warn))",
    best: true,
    exp: true,
    sd: true,
    occ: ["birthday", "congratulations", "just-because"],
    rec: ["friend", "him", "her"],
  },
  {
    slug: "rose-pink-birthday-cake",
    name: "Rose Pink Birthday Cake",
    pricePaisa: 129000,
    cat: "cakes",
    sub: "red-velvet",
    zone: "dhaka",
    badge: "express",
    stars: "★★★★★",
    meta: "Birthday favourite",
    bg: "linear-gradient(160deg,var(--o-solid),var(--o-solid))",
    best: true,
    sd: true,
    mn: true,
    occ: ["birthday"],
    rec: ["her", "friend"],
  },
  {
    slug: "birthday-balloon-bouquet",
    name: "Birthday Balloon Bouquet",
    pricePaisa: 99000,
    cat: "balloons",
    zone: "dhaka",
    badge: "express",
    stars: "★★★★★",
    meta: "Party ready",
    bg: "linear-gradient(160deg,var(--o-solid),var(--o-solid))",
    best: true,
    exp: true,
    sd: true,
    occ: ["birthday"],
    rec: ["friend", "her", "him"],
  },
  {
    slug: "love-balloon-surprise-box",
    name: "Love Balloon Surprise Box",
    pricePaisa: 139000,
    cat: "balloons",
    zone: "dhaka",
    badge: "midnight",
    stars: "★★★★★",
    meta: "Midnight favourite",
    bg: "linear-gradient(160deg,var(--o-solid),var(--a-solid))",
    best: true,
    mn: true,
    occ: ["love", "anniversary"],
    rec: ["her", "him"],
  },
  {
    slug: "ferrero-bloom-chocolate-bouquet",
    name: "Ferrero Bloom Chocolate Bouquet",
    pricePaisa: 185000,
    cat: "chocolates",
    zone: "both",
    badge: "courier",
    stars: "★★★★★",
    meta: "Ships nationwide",
    bg: "linear-gradient(160deg,var(--f-warn),var(--f-warn))",
    best: true,
    occ: ["love", "birthday", "just-because"],
    rec: ["her"],
  },
  {
    slug: "choco-crunch-gift-basket",
    name: "Choco Crunch Gift Basket",
    pricePaisa: 125000,
    cat: "chocolates",
    zone: "both",
    badge: "courier",
    stars: "★★★★☆",
    meta: "Courier-safe",
    bg: "linear-gradient(160deg,var(--f-warn),var(--f-warn))",
    best: true,
    occ: ["birthday", "just-because", "corporate"],
    rec: ["friend", "colleague", "him"],
  },
  {
    slug: "signature-radian-gift-box",
    name: "Signature Radian Gift Box",
    pricePaisa: 220000,
    cat: "giftboxes",
    zone: "both",
    badge: "courier",
    stars: "★★★★★",
    meta: "Ships nationwide",
    bg: "linear-gradient(160deg,var(--a-solid),var(--a-solid))",
    best: true,
    occ: ["birthday", "congratulations", "corporate"],
    rec: ["her", "him", "colleague"],
  },
  {
    slug: "rose-gold-premium-hamper",
    name: "Rose Gold Premium Hamper",
    pricePaisa: 385000,
    cat: "giftboxes",
    zone: "both",
    badge: "courier",
    stars: "★★★★★",
    meta: "Premium pick",
    bg: "linear-gradient(160deg,var(--f-warn),var(--f-warn))",
    best: true,
    occ: ["anniversary", "birthday", "love"],
    rec: ["her"],
  },
  {
    slug: "midnight-surprise-combo",
    name: "Midnight Surprise Combo",
    pricePaisa: 189000,
    cat: "giftboxes",
    zone: "dhaka",
    badge: "midnight",
    stars: "★★★★★",
    meta: "96 orders this month",
    bg: "linear-gradient(160deg,var(--a-solid),var(--a-solid))",
    best: true,
    exp: true,
    mn: true,
    occ: ["love", "anniversary", "birthday"],
    rec: ["her", "him"],
  },
  {
    slug: "classic-red-6-roses-wrapped",
    name: "Classic Red — 6 Roses Wrapped",
    pricePaisa: 75000,
    cat: "flowers",
    sub: "roses",
    zone: "dhaka",
    badge: "express",
    stars: "★★★★★",
    meta: "Most gifted",
    bg: "linear-gradient(160deg,var(--o-solid),var(--o-solid))",
    exp: true,
    sd: true,
    occ: ["love", "just-because"],
    rec: ["her", "him"],
  },

  /* ---- Category page-এর জন্য বাড়ানো flowers (API এলে সব DB থেকে আসবে) ---- */
  {
    slug: "rajanigandha-serenity-vase",
    name: "Rajanigandha Serenity Vase",
    pricePaisa: 189000,
    cat: "flowers",
    sub: "tuberose",
    zone: "dhaka",
    badge: "express",
    stars: "★★★★★",
    meta: "Calm & fragrant",
    bg: "linear-gradient(160deg,var(--a-solid),var(--a-solid))",
    best: true,
    exp: true,
    sd: true,
    occ: ["get-well", "sorry", "just-because"],
    rec: ["parents", "her"],
  },
  {
    slug: "sunrise-gerbera-basket",
    name: "Sunrise Gerbera Basket",
    pricePaisa: 165000,
    cat: "flowers",
    sub: "gerbera",
    zone: "dhaka",
    badge: "express",
    stars: "★★★★☆",
    meta: "Bright & cheerful",
    bg: "linear-gradient(160deg,var(--f-warn),var(--f-warn))",
    best: true,
    exp: true,
    sd: true,
    occ: ["birthday", "get-well", "congratulations"],
    rec: ["friend", "her", "colleague"],
  },
  {
    slug: "blush-lily-and-rose-box",
    name: "Blush Lily & Rose Box",
    pricePaisa: 325000,
    cat: "flowers",
    sub: "mixed",
    zone: "both",
    badge: "courier",
    stars: "★★★★★",
    meta: "Signature box",
    bg: "linear-gradient(160deg,var(--o-solid),var(--o-solid))",
    best: true,
    sd: true,
    occ: ["anniversary", "birthday", "love"],
    rec: ["her"],
  },
  {
    slug: "midnight-rose-heart",
    name: "Midnight Rose Heart",
    pricePaisa: 299000,
    cat: "flowers",
    sub: "roses",
    zone: "dhaka",
    badge: "midnight",
    stars: "★★★★★",
    meta: "Pre-book for 12 AM",
    bg: "linear-gradient(160deg,var(--o-solid),var(--o-solid))",
    best: true,
    mn: true,
    occ: ["love", "anniversary"],
    rec: ["her", "him"],
  },
  {
    slug: "golden-sunflower-cheer",
    name: "Golden Sunflower Cheer",
    pricePaisa: 175000,
    cat: "flowers",
    sub: "sunflower",
    zone: "both",
    badge: "courier",
    stars: "★★★★★",
    meta: "Get well soon favourite",
    bg: "linear-gradient(160deg,var(--f-warn),var(--f-warn))",
    best: true,
    sd: true,
    occ: ["get-well", "congratulations", "just-because"],
    rec: ["friend", "colleague", "parents"],
  },
  {
    slug: "pastel-mixed-bloom-box",
    name: "Pastel Mixed Bloom Box",
    pricePaisa: 235000,
    cat: "flowers",
    sub: "mixed",
    zone: "both",
    badge: "courier",
    stars: "★★★★★",
    meta: "Courier-safe",
    bg: "linear-gradient(160deg,var(--a-solid),var(--a-solid))",
    best: true,
    exp: true,
    sd: true,
    occ: ["birthday", "just-because", "congratulations"],
    rec: ["her", "friend"],
  },
  {
    slug: "white-lily-peace-vase",
    name: "White Lily Peace Vase",
    pricePaisa: 275000,
    cat: "flowers",
    sub: "lilies",
    zone: "dhaka",
    badge: "express",
    stars: "★★★★★",
    meta: "Sympathy & respect",
    bg: "linear-gradient(160deg,var(--a-solid),var(--a-solid))",
    exp: true,
    sd: true,
    occ: ["sorry", "get-well", "just-because"],
    rec: ["parents", "colleague"],
  },
  {
    slug: "carnation-charm-24-stems",
    name: "Carnation Charm — 24 Stems",
    pricePaisa: 145000,
    cat: "flowers",
    sub: "carnation",
    zone: "both",
    badge: "courier",
    stars: "★★★★☆",
    meta: "New this week",
    bg: "linear-gradient(160deg,var(--o-solid),var(--o-solid))",
    neu: true,
    sd: true,
    occ: ["birthday", "just-because"],
    rec: ["her", "parents", "friend"],
  },
  {
    slug: "grand-rose-standing-spray",
    name: "Grand Rose Standing Spray",
    pricePaisa: 690000,
    cat: "flowers",
    sub: "roses",
    zone: "dhaka",
    badge: "express",
    stars: "★★★★★",
    meta: "Corporate & events",
    bg: "linear-gradient(160deg,var(--o-solid),var(--o-solid))",
    neu: true,
    sd: true,
    occ: ["corporate", "congratulations"],
    rec: ["colleague", "him"],
  },
  {
    slug: "pink-rose-and-chocolate-duo",
    name: "Pink Rose & Chocolate Duo",
    pricePaisa: 219000,
    cat: "flowers",
    sub: "roses",
    zone: "both",
    badge: "courier",
    stars: "★★★★★",
    meta: "Most gifted combo",
    bg: "linear-gradient(160deg,var(--o-solid),var(--o-solid))",
    exp: true,
    sd: true,
    occ: ["love", "birthday", "anniversary"],
    rec: ["her"],
  },

  /* ═══════════ CAKES ═══════════ */
  { slug: "black-forest-classic", name: "Black Forest Classic", pricePaisa: 135000, cat: "cakes", sub: "chocolate", zone: "dhaka", badge: "express", stars: "★★★★★", meta: "Always safe", bg: "linear-gradient(160deg,var(--f-warn),var(--f-warn))", best: true, exp: true, sd: true, occ: ["birthday", "just-because"], rec: ["friend", "him", "parents"],},
  { slug: "red-velvet-cream-cheese", name: "Red Velvet Cream Cheese", pricePaisa: 165000, cat: "cakes", sub: "red-velvet", zone: "dhaka", badge: "express", stars: "★★★★★", meta: "Crowd favourite", bg: "linear-gradient(160deg,var(--f-bad),var(--f-bad))", best: true, exp: true, sd: true, occ: ["birthday", "anniversary", "love"], rec: ["her", "him"],},
  { slug: "vanilla-butter-cream-1kg", name: "Vanilla Butter Cream — 1kg", pricePaisa: 119000, cat: "cakes", sub: "vanilla", zone: "dhaka", badge: "express", stars: "★★★★☆", meta: "Light & classic", bg: "linear-gradient(160deg,var(--f-warn),var(--f-warn))", best: true, sd: true, occ: ["birthday", "just-because"], rec: ["parents", "friend"],},
  { slug: "fresh-fruit-gateau", name: "Fresh Fruit Gateau", pricePaisa: 175000, cat: "cakes", sub: "fruit", zone: "dhaka", badge: "express", stars: "★★★★★", meta: "Fresh & light", bg: "linear-gradient(160deg,var(--f-warn),var(--f-warn))", best: true, sd: true, occ: ["birthday", "get-well", "just-because"], rec: ["parents", "her"],},
  { slug: "photo-print-birthday-cake", name: "Photo Print Birthday Cake", pricePaisa: 189000, cat: "cakes", sub: "photo", zone: "dhaka", badge: "express", stars: "★★★★★", meta: "Upload your photo", bg: "linear-gradient(160deg,var(--a-solid),var(--a-solid))", best: true, sd: true, mn: true, occ: ["birthday", "anniversary"], rec: ["her", "him", "friend"],},
  { slug: "bento-mini-celebration", name: "Bento Mini Celebration", pricePaisa: 79000, cat: "cakes", sub: "bento", zone: "dhaka", badge: "express", stars: "★★★★★", meta: "Just for one", bg: "linear-gradient(160deg,var(--o-solid),var(--o-solid))", best: true, exp: true, neu: true, occ: ["birthday", "just-because", "sorry"], rec: ["friend", "her"],},

  /* ═══════════ BALLOONS ═══════════ */
  { slug: "rose-gold-number-balloons", name: "Rose Gold Number Balloons", pricePaisa: 89000, cat: "balloons", sub: "number", zone: "dhaka", badge: "express", stars: "★★★★★", meta: "Any age", bg: "linear-gradient(160deg,var(--f-warn),var(--f-warn))", best: true, exp: true, sd: true, occ: ["birthday"], rec: ["her", "friend"],},
  { slug: "heart-love-balloon-cluster", name: "Heart Love Balloon Cluster", pricePaisa: 109000, cat: "balloons", sub: "love", zone: "dhaka", badge: "midnight", stars: "★★★★★", meta: "Midnight ready", bg: "linear-gradient(160deg,var(--o-solid),var(--o-solid))", best: true, mn: true, occ: ["love", "anniversary"], rec: ["her", "him"],},
  { slug: "congratulations-balloon-set", name: "Congratulations Balloon Set", pricePaisa: 95000, cat: "balloons", sub: "congrats", zone: "dhaka", badge: "express", stars: "★★★★☆", meta: "Promotion & wins", bg: "linear-gradient(160deg,var(--f-ok),var(--f-ok))", best: true, exp: true, sd: true, occ: ["congratulations", "corporate"], rec: ["friend", "colleague"],},
  { slug: "pastel-birthday-arch", name: "Pastel Birthday Arch", pricePaisa: 249000, cat: "balloons", sub: "birthday", zone: "dhaka", badge: "express", stars: "★★★★★", meta: "Room decoration", bg: "linear-gradient(160deg,var(--o-solid),var(--o-solid))", best: true, sd: true, occ: ["birthday"], rec: ["her", "friend"],},
  { slug: "letter-balloon-name-set", name: "Letter Balloon Name Set", pricePaisa: 119000, cat: "balloons", sub: "letter", zone: "dhaka", badge: "express", stars: "★★★★★", meta: "Spell their name", bg: "linear-gradient(160deg,var(--a-solid),var(--a-solid))", best: true, exp: true, neu: true, occ: ["birthday", "congratulations"], rec: ["friend", "her", "him"],},
  { slug: "chrome-party-balloon-bundle", name: "Chrome Party Balloon Bundle", pricePaisa: 75000, cat: "balloons", sub: "birthday", zone: "dhaka", badge: "express", stars: "★★★★☆", meta: "Party ready", bg: "linear-gradient(160deg,var(--f-info),var(--f-info))", best: true, exp: true, sd: true, occ: ["birthday", "congratulations"], rec: ["friend", "him"],},

  /* ═══════════ CHOCOLATES ═══════════ */
  { slug: "lindt-luxury-selection", name: "Lindt Luxury Selection", pricePaisa: 245000, cat: "chocolates", sub: "imported", zone: "both", badge: "courier", stars: "★★★★★", meta: "Ships nationwide", bg: "linear-gradient(160deg,var(--f-warn),var(--f-warn))", best: true, occ: ["anniversary", "corporate", "love"], rec: ["her", "colleague", "parents"],},
  { slug: "toblerone-gift-tower", name: "Toblerone Gift Tower", pricePaisa: 165000, cat: "chocolates", sub: "imported", zone: "both", badge: "courier", stars: "★★★★☆", meta: "Courier-safe", bg: "linear-gradient(160deg,var(--f-warn),var(--f-warn))", best: true, occ: ["birthday", "congratulations", "corporate"], rec: ["him", "colleague", "friend"],},
  { slug: "handmade-truffle-box-16", name: "Handmade Truffle Box — 16", pricePaisa: 135000, cat: "chocolates", sub: "handmade", zone: "both", badge: "courier", stars: "★★★★★", meta: "Made in Dhaka", bg: "linear-gradient(160deg,var(--f-warn),var(--f-warn))", best: true, neu: true, occ: ["love", "anniversary", "sorry"], rec: ["her"],},
  { slug: "dairy-milk-celebration-hamper", name: "Dairy Milk Celebration Hamper", pricePaisa: 99000, cat: "chocolates", sub: "hamper", zone: "both", badge: "courier", stars: "★★★★☆", meta: "Everyone loves it", bg: "linear-gradient(160deg,var(--o-solid),var(--o-solid))", best: true, occ: ["birthday", "just-because"], rec: ["friend", "him", "her"],},
  { slug: "dark-chocolate-connoisseur", name: "Dark Chocolate Connoisseur", pricePaisa: 189000, cat: "chocolates", sub: "handmade", zone: "both", badge: "courier", stars: "★★★★★", meta: "70% cocoa", bg: "linear-gradient(160deg,var(--f-warn),var(--f-warn))", best: true, occ: ["corporate", "anniversary", "just-because"], rec: ["him", "parents", "colleague"],},
  { slug: "chocolate-bouquet-deluxe", name: "Chocolate Bouquet Deluxe", pricePaisa: 219000, cat: "chocolates", sub: "bouquet", zone: "both", badge: "courier", stars: "★★★★★", meta: "Flowers, but edible", bg: "linear-gradient(160deg,var(--f-warn),var(--f-warn))", best: true, neu: true, occ: ["love", "birthday", "sorry"], rec: ["her"],},

  /* ═══════════ GIFT BOXES ═══════════ */
  { slug: "for-her-pamper-box", name: "For Her — Pamper Box", pricePaisa: 295000, cat: "giftboxes", sub: "for-her", zone: "both", badge: "courier", stars: "★★★★★", meta: "Self-care set", bg: "linear-gradient(160deg,var(--o-solid),var(--o-solid))", best: true, occ: ["birthday", "just-because", "get-well"], rec: ["her", "parents"],},
  { slug: "for-him-essentials-box", name: "For Him — Essentials Box", pricePaisa: 275000, cat: "giftboxes", sub: "for-him", zone: "both", badge: "courier", stars: "★★★★☆", meta: "Grooming & snacks", bg: "linear-gradient(160deg,var(--f-info),var(--f-info))", best: true, occ: ["birthday", "congratulations", "just-because"], rec: ["him", "colleague"],},
  { slug: "corporate-appreciation-hamper", name: "Corporate Appreciation Hamper", pricePaisa: 450000, cat: "giftboxes", sub: "corporate", zone: "both", badge: "courier", stars: "★★★★★", meta: "Bulk orders welcome", bg: "linear-gradient(160deg,var(--f-warn),var(--f-warn))", best: true, occ: ["corporate", "congratulations"], rec: ["colleague"],},
  { slug: "new-baby-welcome-box", name: "New Baby Welcome Box", pricePaisa: 235000, cat: "giftboxes", sub: "for-her", zone: "both", badge: "courier", stars: "★★★★★", meta: "Congratulations gift", bg: "linear-gradient(160deg,var(--f-ok),var(--f-ok))", best: true, neu: true, occ: ["congratulations"], rec: ["her", "friend", "parents"],},
  { slug: "self-care-candle-box", name: "Self-Care Candle Box", pricePaisa: 185000, cat: "giftboxes", sub: "self-care", zone: "both", badge: "courier", stars: "★★★★☆", meta: "Calm & unwind", bg: "linear-gradient(160deg,var(--f-warn),var(--f-warn))", best: true, occ: ["get-well", "sorry", "just-because"], rec: ["her", "friend", "parents"],},

  /* ═══════════ COMBOS ═══════════ */
  { slug: "roses-and-chocolate-cake-combo", name: "Roses & Chocolate Cake Combo", pricePaisa: 289000, cat: "combos", sub: "flowers-cake", zone: "dhaka", badge: "express", stars: "★★★★★", meta: "Most ordered combo", bg: "linear-gradient(160deg,var(--o-solid),var(--o-solid))", best: true, exp: true, sd: true, occ: ["birthday", "anniversary", "love"], rec: ["her", "him"],},
  { slug: "flowers-and-ferrero-duo", name: "Flowers & Ferrero Duo", pricePaisa: 245000, cat: "combos", sub: "flowers-chocolate", zone: "both", badge: "courier", stars: "★★★★★", meta: "Courier-safe", bg: "linear-gradient(160deg,var(--f-warn),var(--f-warn))", best: true, sd: true, occ: ["love", "just-because", "sorry"], rec: ["her"],},
  { slug: "birthday-triple-surprise", name: "Birthday Triple Surprise", pricePaisa: 349000, cat: "combos", sub: "flowers-cake", zone: "dhaka", badge: "express", stars: "★★★★★", meta: "Flowers + cake + balloons", bg: "linear-gradient(160deg,var(--o-solid),var(--o-solid))", best: true, exp: true, sd: true, occ: ["birthday"], rec: ["her", "him", "friend"],},
  { slug: "midnight-anniversary-combo", name: "Midnight Anniversary Combo", pricePaisa: 395000, cat: "combos", sub: "flowers-cake", zone: "dhaka", badge: "midnight", stars: "★★★★★", meta: "Pre-book for 12 AM", bg: "linear-gradient(160deg,var(--o-solid),var(--o-solid))", best: true, mn: true, occ: ["anniversary", "love"], rec: ["her", "him"],},
  { slug: "flowers-and-balloon-cheer", name: "Flowers & Balloon Cheer", pricePaisa: 219000, cat: "combos", sub: "flowers-balloon", zone: "dhaka", badge: "express", stars: "★★★★☆", meta: "Bright & loud", bg: "linear-gradient(160deg,var(--o-solid),var(--o-solid))", best: true, exp: true, sd: true, occ: ["birthday", "congratulations"], rec: ["her", "friend"],},
  { slug: "cake-and-teddy-bundle", name: "Cake & Teddy Bundle", pricePaisa: 235000, cat: "combos", sub: "cake-teddy", zone: "dhaka", badge: "express", stars: "★★★★★", meta: "Kids favourite", bg: "linear-gradient(160deg,var(--f-warn),var(--f-warn))", best: true, sd: true, occ: ["birthday", "just-because"], rec: ["friend", "her"],},
  { slug: "grand-celebration-hamper", name: "Grand Celebration Hamper", pricePaisa: 590000, cat: "combos", sub: "luxury", zone: "both", badge: "courier", stars: "★★★★★", meta: "The full surprise", bg: "linear-gradient(160deg,var(--a-solid),var(--a-solid))", best: true, neu: true, occ: ["anniversary", "corporate", "congratulations"], rec: ["her", "him", "colleague"],},
  { slug: "sorry-and-make-up-combo", name: "Sorry & Make-Up Combo", pricePaisa: 199000, cat: "combos", sub: "flowers-chocolate", zone: "dhaka", badge: "express", stars: "★★★★★", meta: "White lilies + truffles", bg: "linear-gradient(160deg,var(--a-solid),var(--a-solid))", best: true, exp: true, sd: true, neu: true, occ: ["sorry", "love"], rec: ["her", "him"],},

  /* ═══════════ PLANTS ═══════════ */
  { slug: "money-plant-ceramic-pot", name: "Money Plant in Ceramic Pot", pricePaisa: 89000, cat: "plants", sub: "indoor", zone: "both", badge: "courier", stars: "★★★★★", meta: "Hard to kill", bg: "linear-gradient(160deg,var(--f-ok),var(--f-ok))", best: true, sd: true, occ: ["congratulations", "just-because", "corporate"], rec: ["parents", "colleague", "friend"],},
  { slug: "snake-plant-air-purifier", name: "Snake Plant — Air Purifier", pricePaisa: 125000, cat: "plants", sub: "air-purifying", zone: "both", badge: "courier", stars: "★★★★★", meta: "Cleans the air", bg: "linear-gradient(160deg,var(--f-ok),var(--f-ok))", best: true, sd: true, occ: ["congratulations", "corporate", "just-because"], rec: ["him", "colleague", "parents"],},
  { slug: "peace-lily-desk-plant", name: "Peace Lily Desk Plant", pricePaisa: 145000, cat: "plants", sub: "flowering", zone: "both", badge: "courier", stars: "★★★★★", meta: "Office favourite", bg: "linear-gradient(160deg,var(--f-ok),var(--f-ok))", best: true, sd: true, occ: ["congratulations", "corporate", "get-well"], rec: ["colleague", "parents"],},
  { slug: "succulent-trio-set", name: "Succulent Trio Set", pricePaisa: 99000, cat: "plants", sub: "succulents", zone: "both", badge: "courier", stars: "★★★★☆", meta: "Almost no care", bg: "linear-gradient(160deg,var(--f-ok),var(--f-ok))", best: true, neu: true, occ: ["just-because", "birthday", "congratulations"], rec: ["friend", "her", "colleague"],},
  { slug: "lucky-bamboo-2-layer", name: "Lucky Bamboo — 2 Layer", pricePaisa: 79000, cat: "plants", sub: "lucky-bamboo", zone: "both", badge: "courier", stars: "★★★★★", meta: "Housewarming gift", bg: "linear-gradient(160deg,var(--f-ok),var(--f-ok))", best: true, sd: true, occ: ["congratulations", "just-because"], rec: ["parents", "friend", "colleague"],},
  { slug: "ficus-bonsai-premium", name: "Ficus Bonsai — Premium", pricePaisa: 385000, cat: "plants", sub: "bonsai", zone: "dhaka", badge: "express", stars: "★★★★★", meta: "Statement piece", bg: "linear-gradient(160deg,var(--f-ok),var(--f-ok))", best: true, sd: true, occ: ["corporate", "congratulations", "anniversary"], rec: ["parents", "him", "colleague"],},
  { slug: "aloe-vera-terracotta", name: "Aloe Vera in Terracotta", pricePaisa: 69000, cat: "plants", sub: "indoor", zone: "both", badge: "courier", stars: "★★★★☆", meta: "Useful & pretty", bg: "linear-gradient(160deg,var(--f-ok),var(--f-ok))", best: true, sd: true, occ: ["get-well", "just-because"], rec: ["friend", "parents", "her"],},
  { slug: "areca-palm-floor-plant", name: "Areca Palm Floor Plant", pricePaisa: 295000, cat: "plants", sub: "air-purifying", zone: "dhaka", badge: "express", stars: "★★★★★", meta: "Fills a corner", bg: "linear-gradient(160deg,var(--f-ok),var(--f-ok))", best: true, neu: true, sd: true, occ: ["congratulations", "corporate"], rec: ["parents", "colleague"],},

  /* ═══════════ PERSONALISED ═══════════ */
  { slug: "photo-mug-custom", name: "Photo Mug — Custom Print", pricePaisa: 59000, cat: "personalised", sub: "mugs", zone: "both", badge: "courier", stars: "★★★★★", meta: "Upload any photo", bg: "linear-gradient(160deg,var(--a-solid),var(--a-solid))", best: true, sd: true, occ: ["birthday", "just-because", "love"], rec: ["friend", "him", "her"],},
  { slug: "engraved-wooden-photo-frame", name: "Engraved Wooden Photo Frame", pricePaisa: 129000, cat: "personalised", sub: "frames", zone: "both", badge: "courier", stars: "★★★★★", meta: "Name + date engraved", bg: "linear-gradient(160deg,var(--f-warn),var(--f-warn))", best: true, sd: true, occ: ["anniversary", "birthday", "love"], rec: ["parents", "her", "him"], prepaidOnly: true,},
  { slug: "name-led-night-lamp", name: "Name LED Night Lamp", pricePaisa: 165000, cat: "personalised", sub: "lamps", zone: "both", badge: "courier", stars: "★★★★★", meta: "Glows their name", bg: "linear-gradient(160deg,var(--a-solid),var(--a-solid))", best: true, neu: true, occ: ["birthday", "love", "just-because"], rec: ["her", "friend"], prepaidOnly: true,},
  { slug: "photo-cushion-couple", name: "Photo Cushion — Couple", pricePaisa: 89000, cat: "personalised", sub: "cushions", zone: "both", badge: "courier", stars: "★★★★☆", meta: "Anniversary favourite", bg: "linear-gradient(160deg,var(--o-solid),var(--o-solid))", best: true, sd: true, occ: ["anniversary", "love"], rec: ["her", "him"],},
  { slug: "custom-photo-album-hardcover", name: "Custom Photo Album", pricePaisa: 245000, cat: "personalised", sub: "albums", zone: "both", badge: "courier", stars: "★★★★★", meta: "Up to 40 photos", bg: "linear-gradient(160deg,var(--a-solid),var(--a-solid))", best: true, occ: ["anniversary", "birthday", "love"], rec: ["her", "parents"],},
  { slug: "engraved-metal-keychain-pair", name: "Engraved Keychain Pair", pricePaisa: 49000, cat: "personalised", sub: "engraved", zone: "both", badge: "courier", stars: "★★★★☆", meta: "Small but personal", bg: "linear-gradient(160deg,var(--f-info),var(--f-info))", best: true, sd: true, occ: ["love", "just-because", "anniversary"], rec: ["him", "her"],},
  { slug: "spotify-code-plaque", name: "Spotify Code Plaque", pricePaisa: 145000, cat: "personalised", sub: "engraved", zone: "both", badge: "courier", stars: "★★★★★", meta: "Your song, framed", bg: "linear-gradient(160deg,var(--f-ok),var(--f-ok))", best: true, neu: true, occ: ["love", "anniversary", "birthday"], rec: ["her", "him", "friend"], prepaidOnly: true,},
  { slug: "personalised-message-jar", name: "Personalised Message Jar", pricePaisa: 79000, cat: "personalised", sub: "engraved", zone: "both", badge: "courier", stars: "★★★★★", meta: "365 handwritten notes", bg: "linear-gradient(160deg,var(--a-solid),var(--a-solid))", best: true, sd: true, occ: ["love", "birthday", "sorry"], rec: ["her", "him"],},
];
