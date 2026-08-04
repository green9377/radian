/*
  Offers & Promotions — MOCK data (frontend-only, §9 UI-first pass).
  Renamed from "Pricing & Offers": Price Lists → POS, Budget Bands → Merchandising.
  Core entity = Offer (a coupon is an Offer with mechanism="coupon"). Named "Offer"
  (not "Campaign") to avoid clash with the Marketing domain's Campaign entity.
  ⇄ SWAP HERE: replace with :4000 /offers endpoints in the unified schema pass.

  Conventions: money = paisa integer · One Data One Owner (targets/channels are
  references) · soft-delete + audit · redemption = referenced event on Sales Order.
*/

export type Mechanism = "automatic" | "coupon";
export type Shape =
  | "category"
  | "sitewide"
  | "product"
  | "bundle"
  | "tiered"
  | "free_gift"
  | "bogo"
  | "payment"
  | "free_delivery"
  | "first_order"
  | "corporate";
export type OfferStatus = "active" | "scheduled" | "paused" | "draft" | "expired";

export type BundleItem = { name: string; image: string; pricePaisa: number };
export type Tier = { minSpendPaisa: number; benefit: string };

export type Offer = {
  id: string;
  name: string;
  internalNote: string;
  mechanism: Mechanism;
  shape: Shape;
  status: OfferStatus;
  benefitText: string;
  wasText?: string;
  code?: string;
  eligibility: string[];
  scheduleText: string;
  scheduleTone: "on" | "sched" | "paused";
  priority: number;
  redeemed?: number;
  live: boolean;
  // editor fields
  publicTitle: string;
  benefitLine: string;
  description: string;
  discountType: "Percent %" | "Flat ৳" | "Free delivery" | "Bundle price";
  discountValue: string;
  maxDiscountText: string;
  bonusLines: string[];
  guaranteeText: string;
  combinable: boolean;
  scarcity: boolean;
  // Phase B — shape-specific
  bundleItems?: BundleItem[];
  comboPricePaisa?: number;
  tiers?: Tier[];
  giftThresholdPaisa?: number;
  giftItem?: { name: string; image: string };
  marginWarn?: string; // demo: below-cost warning (perishable allowed, flag margin)
};

export const SHAPE_LABEL: Record<Shape, string> = {
  category: "Category",
  sitewide: "Sitewide",
  product: "Product",
  bundle: "Bundle",
  tiered: "Tiered",
  free_gift: "Free gift",
  bogo: "BOGO",
  payment: "Payment",
  free_delivery: "Free delivery",
  first_order: "First order",
  corporate: "Corporate",
};

/* festival presets — pre-schedule seasonal offers (Asia/Dhaka). Dates are demo strings. */
export const FESTIVALS: { key: string; label: string; window: string }[] = [
  { key: "eid", label: "Eid", window: "Eid week" },
  { key: "valentine", label: "Valentine's", window: "10–14 Feb" },
  { key: "boishakh", label: "Pohela Boishakh", window: "10–14 Apr" },
  { key: "mothers", label: "Mother's Day", window: "2nd Sun May" },
  { key: "independence", label: "Independence Day", window: "26 Mar" },
];

export const OFFERS: Offer[] = [
  {
    id: "off_roses12",
    name: "Anniversary Roses Week",
    internalNote: "Seasonal · rose category push",
    mechanism: "coupon",
    shape: "category",
    status: "scheduled",
    benefitText: "12% off · max ৳400",
    code: "ROSES12",
    eligibility: ["Roses", "Once/customer"],
    scheduleText: "Ends 18 Jul · 6d",
    scheduleTone: "sched",
    priority: 20,
    redeemed: 63,
    live: true,
    publicTitle: "Anniversary Roses Week",
    benefitLine: "12% off all rose arrangements",
    description: "Our rose collection, honestly discounted for anniversary season — one week only.",
    discountType: "Percent %",
    discountValue: "12",
    maxDiscountText: "400",
    bonusLines: ["Free greeting card", "Priority same-day slot"],
    guaranteeText: "Fresh-on-arrival or we re-deliver free",
    combinable: false,
    scarcity: false,
  },
  {
    id: "off_combo",
    name: "Combo Saver — Teddy + Bouquet",
    internalNote: "Bundle price · auto-applied",
    mechanism: "automatic",
    shape: "bundle",
    status: "active",
    benefitText: "Combo price ৳1,890",
    wasText: "৳2,180",
    eligibility: ["Combo SKUs", "Inside Dhaka"],
    scheduleText: "Ongoing",
    scheduleTone: "on",
    priority: 30,
    live: true,
    publicTitle: "Combo Saver — Teddy + Bouquet",
    benefitLine: "Save ৳290 on the combo",
    description: "Built into combo pricing — no code needed.",
    discountType: "Bundle price",
    discountValue: "1890",
    maxDiscountText: "—",
    bonusLines: [],
    guaranteeText: "",
    combinable: false,
    scarcity: false,
    bundleItems: [
      { name: "Red Rose Bouquet", image: "https://images.unsplash.com/photo-1563241527-3004b7be0ffd?w=90&q=60", pricePaisa: 120000 },
      { name: "Teddy Bear 12\"", image: "https://images.unsplash.com/photo-1519689680058-324335c77eba?w=90&q=60", pricePaisa: 65000 },
      { name: "Greeting Card", image: "https://images.unsplash.com/photo-1607344645866-009c320b63e0?w=90&q=60", pricePaisa: 12000 },
    ],
    comboPricePaisa: 189000,
  },
  {
    id: "off_tier",
    name: "Spend & Save",
    internalNote: "Tiered · raises AOV",
    mechanism: "automatic",
    shape: "tiered",
    status: "active",
    benefitText: "Up to 15% off",
    eligibility: ["Sitewide", "Auto"],
    scheduleText: "Ongoing",
    scheduleTone: "on",
    priority: 45,
    redeemed: 51,
    live: true,
    publicTitle: "The More You Send, The More You Save",
    benefitLine: "Save up to 15% on bigger orders",
    description: "Spend more in one order and unlock a bigger saving — automatically at checkout.",
    discountType: "Percent %",
    discountValue: "—",
    maxDiscountText: "—",
    bonusLines: [],
    guaranteeText: "",
    combinable: false,
    scarcity: false,
    tiers: [
      { minSpendPaisa: 150000, benefit: "5% off" },
      { minSpendPaisa: 300000, benefit: "10% off" },
      { minSpendPaisa: 500000, benefit: "15% off" },
    ],
  },
  {
    id: "off_gift",
    name: "Free Chocolate over ৳2,000",
    internalNote: "Gift-with-purchase · gifting lever",
    mechanism: "automatic",
    shape: "free_gift",
    status: "active",
    benefitText: "Free chocolate box",
    eligibility: ["Cart ≥ ৳2,000", "While stocks last"],
    scheduleText: "Ongoing",
    scheduleTone: "on",
    priority: 55,
    redeemed: 44,
    live: true,
    publicTitle: "A Sweet Little Extra",
    benefitLine: "Free chocolate box on orders ৳2,000+",
    description: "Spend ৳2,000 and we tuck in a chocolate box — our little thank-you.",
    discountType: "Flat ৳",
    discountValue: "0",
    maxDiscountText: "—",
    bonusLines: [],
    guaranteeText: "",
    combinable: true,
    scarcity: false,
    giftThresholdPaisa: 200000,
    giftItem: { name: "Chocolate Box (৳450)", image: "https://images.unsplash.com/photo-1548907040-4baa42d10919?w=90&q=60" },
  },
  {
    id: "off_bkash",
    name: "bKash Cashback",
    internalNote: "Payment-method incentive",
    mechanism: "automatic",
    shape: "payment",
    status: "scheduled",
    benefitText: "5% cashback · max ৳150",
    eligibility: ["bKash", "Min ৳800"],
    scheduleText: "Ends 31 Jul",
    scheduleTone: "sched",
    priority: 40,
    redeemed: 129,
    live: true,
    publicTitle: "bKash Cashback",
    benefitLine: "5% cashback paying with bKash",
    description: "Pay with bKash and get instant cashback on eligible orders.",
    discountType: "Percent %",
    discountValue: "5",
    maxDiscountText: "150",
    bonusLines: [],
    guaranteeText: "",
    combinable: true,
    scarcity: false,
  },
  {
    id: "off_welcome",
    name: "Welcome — First Order",
    internalNote: "New customer acquisition",
    mechanism: "coupon",
    shape: "first_order",
    status: "active",
    benefitText: "৳100 off · min ৳600",
    code: "WELCOME",
    eligibility: ["1st order only", "1 use"],
    scheduleText: "Ongoing",
    scheduleTone: "on",
    priority: 60,
    redeemed: 39,
    live: true,
    publicTitle: "Welcome to Radian",
    benefitLine: "৳100 off your first order",
    description: "A little welcome — ৳100 off when you order for the first time.",
    discountType: "Flat ৳",
    discountValue: "100",
    maxDiscountText: "100",
    bonusLines: [],
    guaranteeText: "",
    combinable: false,
    scarcity: false,
  },
  {
    id: "off_eid",
    name: "Eid Special 2026",
    internalNote: "Festival · draft, pre-scheduled",
    mechanism: "coupon",
    shape: "sitewide",
    status: "draft",
    benefitText: "15% off · max ৳600",
    code: "EID15",
    eligibility: ["Sitewide"],
    scheduleText: "Draft",
    scheduleTone: "paused",
    priority: 10,
    live: false,
    publicTitle: "Eid Special 2026",
    benefitLine: "15% off sitewide for Eid",
    description: "Celebrate Eid with 15% off across the store.",
    discountType: "Percent %",
    discountValue: "15",
    maxDiscountText: "600",
    bonusLines: [],
    guaranteeText: "",
    combinable: false,
    scarcity: true,
    marginWarn: "2 clearance items would sell below cost (margin −৳40). Allowed for perishable stock — flag for approval.",
  },
];

/* paisa → ৳ with grouping */
export function taka(paisa: number): string {
  const n = Math.round(paisa / 100);
  return "৳ " + n.toLocaleString("en-IN");
}

/* short money for KPI tiles: ৳1.64L / ৳12.3k */
export function takaShort(paisa: number): string {
  const n = Math.round(paisa / 100);
  if (n >= 100000) return "৳ " + (n / 100000).toFixed(2).replace(/\.00$/, "") + "L";
  if (n >= 1000) return "৳ " + (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return "৳ " + n;
}

/* ---------- Overview / analytics (MOCK, read-only rollups from Sales Order) ---------- */
export type LeaderRow = {
  id: string;
  name: string;
  shape: Shape;
  redemptions: number;
  revenuePaisa: number; // revenue influenced
  discountPaisa: number; // discount cost
  newCustomers: number;
  marginTone: "ok" | "warn" | "bad"; // healthy / thin / below-cost
};

export const LEADERBOARD: LeaderRow[] = [
  { id: "off_welcome", name: "Welcome — First Order", shape: "first_order", redemptions: 39, revenuePaisa: 4680000, discountPaisa: 390000, newCustomers: 39, marginTone: "ok" },
  { id: "off_bkash", name: "bKash Cashback", shape: "payment", redemptions: 129, revenuePaisa: 9210000, discountPaisa: 645000, newCustomers: 22, marginTone: "ok" },
  { id: "off_gift", name: "Free Chocolate over ৳2,000", shape: "free_gift", redemptions: 44, revenuePaisa: 5060000, discountPaisa: 198000, newCustomers: 9, marginTone: "warn" },
  { id: "off_roses12", name: "Anniversary Roses Week", shape: "category", redemptions: 63, revenuePaisa: 5290000, discountPaisa: 604000, newCustomers: 14, marginTone: "ok" },
  { id: "off_tier", name: "Spend & Save", shape: "tiered", redemptions: 51, revenuePaisa: 8840000, discountPaisa: 512000, newCustomers: 6, marginTone: "ok" },
  { id: "off_combo", name: "Combo Saver — Teddy + Bouquet", shape: "bundle", redemptions: 28, revenuePaisa: 3210000, discountPaisa: 290000, newCustomers: 5, marginTone: "warn" },
  { id: "off_eid", name: "Eid Clearance", shape: "sitewide", redemptions: 18, revenuePaisa: 990000, discountPaisa: 430000, newCustomers: 3, marginTone: "bad" },
];

/* per-offer detail — redeemer sample + approvals + picker lists (MOCK) */
export const REDEEMERS: { name: string; phone: string; when: string; amountPaisa: number }[] = [
  { name: "Rafiul Islam", phone: "+8801710-000001", when: "2h ago", amountPaisa: 189000 },
  { name: "Tania Ahmed", phone: "+8801710-000002", when: "5h ago", amountPaisa: 235000 },
  { name: "Sadia Karim", phone: "+8801710-000003", when: "Yesterday", amountPaisa: 142000 },
  { name: "Imran Hossain", phone: "+8801710-000004", when: "Yesterday", amountPaisa: 305000 },
  { name: "Nabila Rahman", phone: "+8801710-000005", when: "2 days ago", amountPaisa: 168000 },
];

export type Approval = { id: string; offer: string; requestedBy: string; ask: string; reason: string };
export const APPROVALS: Approval[] = [
  { id: "ap1", offer: "Eid Clearance", requestedBy: "Sales · Rima", ask: "40% off (below cost)", reason: "Clear aging fresh stock before Eid" },
  { id: "ap2", offer: "Corporate — Grameenphone", requestedBy: "Corporate · Sabbir", ask: "28% volume rate", reason: "500-unit corporate gifting order" },
  { id: "ap3", offer: "Flash — Rainy Day", requestedBy: "Marketing · Tanvir", ask: "30% sitewide 6h", reason: "Slow afternoon, push same-day orders" },
];

export const PICK_PRODUCTS = ["Red Rose Bouquet", "Birthday Combo — Cake + Flowers", "Premium Orchid Box", "Teddy + Bouquet Combo", "Chocolate Hamper", "Mixed Tulip Bunch"];
export const PICK_CATEGORIES = ["Roses", "Bouquets", "Cakes", "Chocolates", "Combos", "Plants", "Gift Hampers"];

export function roi(r: LeaderRow): number {
  return r.discountPaisa ? r.revenuePaisa / r.discountPaisa : 0;
}

/* 12-week redemption trend (single series) */
export const REDEMPTION_TREND: { label: string; value: number }[] = [
  { label: "W1", value: 18 }, { label: "W2", value: 22 }, { label: "W3", value: 31 },
  { label: "W4", value: 27 }, { label: "W5", value: 34 }, { label: "W6", value: 41 },
  { label: "W7", value: 38 }, { label: "W8", value: 52 }, { label: "W9", value: 47 },
  { label: "W10", value: 58 }, { label: "W11", value: 63 }, { label: "W12", value: 71 },
];

/* ---------- Coupons (MOCK) ---------- */
export type CouponRow = {
  code: string;
  offer: string;
  kind: "public" | "unique" | "affiliate" | "referral";
  issued: number;
  redeemed: number;
  status: "active" | "scheduled" | "expired";
};
export const COUPON_CODES: CouponRow[] = [
  { code: "ROSES12", offer: "Anniversary Roses Week", kind: "public", issued: 1, redeemed: 63, status: "scheduled" },
  { code: "WELCOME", offer: "Welcome — First Order", kind: "public", issued: 1, redeemed: 39, status: "active" },
  { code: "EID15", offer: "Eid Special 2026", kind: "public", issued: 1, redeemed: 0, status: "expired" },
  { code: "RUMANA-500", offer: "Influencer — Rumana", kind: "affiliate", issued: 1, redeemed: 27, status: "active" },
  { code: "REF-8KX2QP", offer: "Referral reward", kind: "referral", issued: 210, redeemed: 88, status: "active" },
  { code: "VIP-A1B2C3", offer: "VIP single-use batch", kind: "unique", issued: 500, redeemed: 143, status: "active" },
];

/* ---------- Templates / Playbook (Hormozi-style, MOCK) ---------- */
export type TemplateSeed = { shape: Shape; mechanism: Mechanism; publicTitle: string; benefitLine: string; name: string };
export type Template = { key: string; name: string; family: string; desc: string; icon: string; hint: string; seed: TemplateSeed };
export const TEMPLATES: Template[] = [
  { key: "welcome", name: "First-Order Welcome", family: "Acquisition", icon: "user", desc: "৳100 off the first order to convert new visitors.", hint: "Coupon · first-order", seed: { shape: "first_order", mechanism: "coupon", name: "First-Order Welcome", publicTitle: "Welcome to Radian", benefitLine: "৳100 off your first order" } },
  { key: "freegift", name: "Free Gift over ৳X", family: "Gift", icon: "heart", desc: "Auto-add a free chocolate/card above a cart threshold.", hint: "Automatic · free-gift", seed: { shape: "free_gift", mechanism: "automatic", name: "Free Gift over ৳X", publicTitle: "A Sweet Little Extra", benefitLine: "Free gift on orders over ৳2,000" } },
  { key: "tiered", name: "Spend & Save (Tiered)", family: "Threshold", icon: "layers", desc: "Bigger cart → bigger % off. Raises average order value.", hint: "Automatic · tiered", seed: { shape: "tiered", mechanism: "automatic", name: "Spend & Save", publicTitle: "The More You Send, The More You Save", benefitLine: "Save up to 15% on bigger orders" } },
  { key: "grandslam", name: "Grand Slam Combo", family: "Hormozi", icon: "sparkle", desc: "Core discount + bonus stack + guarantee + urgency, named to sell.", hint: "Value-stacked offer", seed: { shape: "bundle", mechanism: "automatic", name: "Grand Slam Combo", publicTitle: "The Unbeatable Gift Box", benefitLine: "Everything they'll love, one irresistible price" } },
  { key: "flash", name: "Flash Sale (24h)", family: "Urgency", icon: "bolt", desc: "Time-boxed deal with a real countdown.", hint: "Automatic · time-window", seed: { shape: "sitewide", mechanism: "automatic", name: "Flash Sale", publicTitle: "24-Hour Flash Sale", benefitLine: "Today only — extra 15% off" } },
  { key: "bogo", name: "BOGO / Buy X Get Y", family: "Quantity", icon: "box", desc: "Buy one get one, or buy 2 get 1 free.", hint: "Automatic · quantity", seed: { shape: "bogo", mechanism: "automatic", name: "Buy 2 Get 1", publicTitle: "Buy 2, Get 1 Free", benefitLine: "Add 3, pay for 2" } },
  { key: "bundle", name: "Bundle / Combo", family: "Bundle", icon: "box", desc: "Curated set (teddy + bouquet + cake) at one price.", hint: "Automatic · bundle", seed: { shape: "bundle", mechanism: "automatic", name: "Combo Saver", publicTitle: "Combo Saver", benefitLine: "The set, for less" } },
  { key: "freedelivery", name: "Free / Express Delivery", family: "Delivery", icon: "truck", desc: "Free or upgraded delivery over a threshold or on occasion.", hint: "Automatic · free-delivery", seed: { shape: "free_delivery", mechanism: "automatic", name: "Free Delivery over ৳2,000", publicTitle: "Free Delivery", benefitLine: "Free delivery on orders ৳2,000+" } },
  { key: "payment", name: "Payment Cashback", family: "Payment", icon: "cash", desc: "bKash / Nagad / card cashback on eligible orders.", hint: "Automatic · payment", seed: { shape: "payment", mechanism: "automatic", name: "bKash Cashback", publicTitle: "bKash Cashback", benefitLine: "5% cashback paying with bKash" } },
  { key: "festival", name: "Festival Campaign", family: "Seasonal", icon: "star", desc: "Pre-scheduled Eid / Valentine / Boishakh sitewide offer.", hint: "Coupon · seasonal", seed: { shape: "sitewide", mechanism: "coupon", name: "Festival Special", publicTitle: "Festival Special", benefitLine: "15% off sitewide" } },
  { key: "winback", name: "Win-Back Lapsed", family: "Retention", icon: "clock", desc: "Targeted code to re-activate customers who stopped ordering.", hint: "Coupon · segment", seed: { shape: "sitewide", mechanism: "coupon", name: "We Miss You", publicTitle: "We Miss You", benefitLine: "৳150 off — come back to us" } },
  { key: "birthday", name: "Birthday / Anniversary", family: "Lifecycle", icon: "heart", desc: "Auto offer on a recipient's occasion (reads Customer occasions).", hint: "Coupon · occasion", seed: { shape: "category", mechanism: "coupon", name: "Birthday Treat", publicTitle: "Happy Birthday from Radian", benefitLine: "A little birthday treat — 12% off" } },
];

/* mock products for the bundle/gift visual picker */
export const MOCK_PRODUCTS: BundleItem[] = [
  { name: "Red Rose Bouquet", image: "https://images.unsplash.com/photo-1563241527-3004b7be0ffd?w=90&q=60", pricePaisa: 120000 },
  { name: "Teddy Bear 12\"", image: "https://images.unsplash.com/photo-1519689680058-324335c77eba?w=90&q=60", pricePaisa: 65000 },
  { name: "Chocolate Box", image: "https://images.unsplash.com/photo-1548907040-4baa42d10919?w=90&q=60", pricePaisa: 45000 },
  { name: "Greeting Card", image: "https://images.unsplash.com/photo-1607344645866-009c320b63e0?w=90&q=60", pricePaisa: 12000 },
  { name: "Scented Candle", image: "https://images.unsplash.com/photo-1602874801007-bd458bb1b8b6?w=90&q=60", pricePaisa: 38000 },
];

/* ---------- Grand Slam libraries (MOCK) ---------- */
export const BONUS_LIBRARY: { name: string; valuePaisa: number }[] = [
  { name: "Free greeting card", valuePaisa: 12000 },
  { name: "Free chocolate box", valuePaisa: 45000 },
  { name: "Priority same-day slot", valuePaisa: 20000 },
  { name: "Premium gift wrapping", valuePaisa: 15000 },
  { name: "Handwritten message", valuePaisa: 8000 },
];
export const GUARANTEE_LIBRARY: { name: string; type: string; text: string }[] = [
  { name: "Fresh on arrival", type: "Conditional", text: "Fresh on arrival or we re-deliver free." },
  { name: "On-time or free", type: "Conditional", text: "Delivered in your slot or delivery is on us." },
  { name: "Money-back", type: "Unconditional", text: "Not happy? Full refund, no questions." },
  { name: "Photo before dispatch", type: "Trust", text: "We send a photo of your arrangement before it leaves." },
];

/* ---------- Overview meta: deltas, AOV, dependency, sparklines (MOCK) ---------- */
export const OVERVIEW = {
  revenuePrevPaisa: 31600000, // for ▲ vs last period
  redemptionsPrev: 328,
  newCustPrev: 71,
  storeRevenuePaisa: 58200000, // whole-store revenue (offer-attributed = revenue influenced ÷ this)
  aovWithPaisa: 218000,
  aovWithoutPaisa: 168000,
  couponIssued: 712,
  couponRedeemed: 360,
  giftBonusCostPaisa: 356000, // value of free gifts/bonuses given
  expiringSoon: 2,
  repeatRatePct: 31,
  storeOrders: 928, // all orders in period (for offer penetration)
  ordersWithOffer: 372,
  offerCustomerLtvPaisa: 620000, // avg lifetime value of an offer-acquired customer
  scheduledCount: 2,
  draftCount: 1,
};

/* offer performance by sales channel (categorical) */
export const CHANNEL_PERF: { name: string; redemptions: number; revenuePaisa: number }[] = [
  { name: "Website", redemptions: 198, revenuePaisa: 20800000 },
  { name: "WhatsApp", redemptions: 74, revenuePaisa: 7200000 },
  { name: "Facebook", redemptions: 58, revenuePaisa: 5400000 },
  { name: "Instagram", redemptions: 24, revenuePaisa: 2100000 },
  { name: "POS", redemptions: 18, revenuePaisa: 1780000 },
];

/* offer-driven revenue by occasion (categorical) */
export const OCCASION_PERF: { name: string; revenuePaisa: number }[] = [
  { name: "Anniversary", revenuePaisa: 9800000 },
  { name: "Birthday", revenuePaisa: 8600000 },
  { name: "Eid", revenuePaisa: 5200000 },
  { name: "Valentine's", revenuePaisa: 4100000 },
  { name: "Just because", revenuePaisa: 3300000 },
];

/* automatic vs coupon revenue split */
export const AUTO_VS_COUPON = { automaticPaisa: 26100000, couponPaisa: 11180000 };

/* share of redemptions by offer family (identity — shown as single-hue bars, not a pie) */
export const TYPE_MIX: { family: string; count: number }[] = [
  { family: "Payment cashback", count: 129 },
  { family: "Category discount", count: 63 },
  { family: "Tiered spend-save", count: 51 },
  { family: "Free gift", count: 44 },
  { family: "First order", count: 39 },
  { family: "Bundle", count: 28 },
  { family: "Seasonal", count: 18 },
];

/* 8-point mini sparklines for hero tiles */
export const SPARK_REVENUE = [30, 34, 33, 38, 42, 40, 47, 52];
export const SPARK_REDEEM = [18, 22, 31, 27, 34, 41, 38, 52];
export const SPARK_NEWCUST = [6, 8, 7, 9, 11, 10, 13, 16];

export function pct(cur: number, prev: number): number {
  return prev ? Math.round(((cur - prev) / prev) * 100) : 0;
}
