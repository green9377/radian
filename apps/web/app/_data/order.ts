import type { ResolvedCart, ResolvedLine } from "./cart";
import {
  courierWindow,
  findSlot,
  isCourier,
  isExpress,
  quoteDelivery,
  toISODate,
  type LiveMethod,
  type MethodId,
  type DeliveryMethod,
} from "./delivery";
import { PAYMENT_METHODS, type PaymentId } from "./payment";
import type { Zone } from "../_store/useZoneStore";
import {
  normalizeBdPhone,
  normalizePhone,
  type CheckoutState,
} from "../_store/useCheckoutStore";

/*
  ═══════════════════════════════════════════════════════════════════
  ORDER — cart + checkout → একটা জমাট record।

  ⚠️ এখানে দাম STORE হয় — আর সেটাই ঠিক।
  D20 বলে cart-এ দাম রাখা যাবে না, কারণ cart জীবন্ত: admin দাম বদালে
  cart-এর দামও বদলানো উচিত। Order উল্টো — order হলো **চুক্তি**। যে দামে
  customer কিনেছে, সেই দামই চিরকাল থাকবে। কাল দাম বাড়লে পুরনো order-এর
  রসিদ বদলে গেলে সেটা জালিয়াতি।

  তাই: cart = config (দাম নেই), order = snapshot (দাম আছে)।

  ⇄ SWAP HERE — Ecommerce module lock হলে placeOrder() হবে
  POST /orders, আর order id server দেবে। shape একই থাকবে।
  ═══════════════════════════════════════════════════════════════════
*/

export interface OrderLineSnapshot {
  slug: string;
  name: string;
  bg: string;
  /**
   * DEC-PRD-012 — কোন রঙ / ফ্লেভার / মাপ কেনা হয়েছিল। `null` = এই
   * product-এর variant নেই।
   *
   * ⚠️ order = snapshot। মালিক কাল রঙটার নাম বদলালে বা তুলে দিলে পুরনো
   * order-এ যা কেনা হয়েছিল সেটাই লেখা থাকবে — DEC-DLV-002-এর একই নিয়ম।
   */
  variantLabel: string | null;
  sizeLabel: string;
  /**
   * DEC-PRD-013 — যে যে bundle নেওয়া হয়েছিল। খালি array = কিছুই না।
   *
   * ⚠️ আগে একটামাত্র নাম ছিল (`bundleLabel`), কারণ একটার বেশি নেওয়াই
   * যেত না। order = snapshot, তাই পুরনো order-এর নামগুলো যেমন ছিল তেমনই
   * থাকে — মালিক আজ bundle-টা তুলে দিলেও।
   */
  bundleLabels: string[];
  addonLabels: string[];
  persoText?: string;
  qty: number;
  unitPaisa: number;
  linePaisa: number;
}

/* ─────────────────── STATUS + TIMELINE ───────────────────
   Order = চুক্তি, কিন্তু জীবন্ত — placed → delivered পর্যন্ত এগোয়।
   status = এখন কোথায়; timeline = কবে কোন ধাপে গেল (history/detail-এ দেখাই)।

   ⚠️ এই lifecycle keys DeliveryTimeline-এর 7-stage-এর সাবসেট — যাতে
   detail page-এ ঐ একই tracker reuse করা যায়। photo ধাপ দুটো informational,
   তাই lifecycle status নয়।

   ⇄ SWAP HERE — Ecommerce/Delivery module lock হলে status ও timeline
   server (Delivery Management) থেকে আসবে; frontend শুধু render করবে।
*/

export type OrderStatus =
  | "placed"
  | "confirmed"
  | "preparing"
  | "out_for_delivery"
  | "delivered"
  | "cancelled";

export interface OrderEvent {
  status: OrderStatus;
  /** UTC ms */
  at: number;
  note?: string;
}

export interface Order {
  id: string; // RAD-XXXXX (Constitution)
  /** UTC ms — display-এ Asia/Dhaka */
  placedAt: number;

  status: OrderStatus;
  /** সময়ানুক্রমে ঘটে যাওয়া ধাপ — সবচেয়ে পুরনো আগে */
  timeline: OrderEvent[];

  sender: { name: string; phone: string; email: string };
  isGift: boolean;
  recipient: { name: string; phone: string } | null;
  giftMessage: string;
  anonymousGift: boolean;
  photoUpdates: boolean;

  zone: Zone;
  address: string;
  deliveryNotes: string;
  method: MethodId;
  methodLabel: string;
  date: string | null;
  slotLabel: string | null;

  payment: PaymentId;
  paymentLabel: string;

  lines: OrderLineSnapshot[];

  subtotalPaisa: number;
  couponCode: string | null;
  discountPaisa: number;
  deliveryPaisa: number;
  /** promo-তে মাফ হওয়া delivery — রসিদে দেখানোর জন্য */
  deliveryWaivedPaisa: number;
  totalPaisa: number;

  etaOut: string;
  etaDone: string;
}

/* ─────────────────── TOTALS ───────────────────
   Checkout-এর প্রতিটা সংখ্যা এখান থেকে আসে — summary, sticky bar,
   Place Order button, সবাই একই function ডাকে। দুই জায়গায় দুই যোগ
   করলে একদিন ৳১ পার্থক্য হবে, আর trust শেষ।
*/

export interface CheckoutTotals {
  subtotalPaisa: number;
  discountPaisa: number;
  couponCode: string | null;
  deliveryPaisa: number;
  deliveryGrossPaisa: number;
  deliveryWaivedPaisa: number;
  freeDelivery: boolean;
  totalPaisa: number;
}

export function checkoutTotals(args: {
  cart: ResolvedCart;
  zone: Zone | null;
  method: MethodId;
  couponCode: string | null;
  /**
   * DEC-DLV-009 — delivery module থেকে আসা আসল সারি, দাম সহ।
   *
   * ⚠️ শুধু `method` (একটা id) দিয়ে দাম বের করা যেত না, কারণ id এখন
   * database-এর সারির id — হাতে-লেখা তালিকায় সেটা খুঁজে পাওয়া যাবে না,
   * আর না পেলে সে চুপচাপ প্রথম সারির দাম ধরে নিত। মালিক admin-এ ৳২০০
   * লিখতেন, গ্রাহক ৳৬০ দিত, আর কেউ টের পেত না।
   */
  methodOverride?: DeliveryMethod;
  /**
   * offer engine যা বলেছে — `POST /shop/checkout/quote`-এর উত্তর।
   *
   * ⚠️ এখানে `applyCoupon()` চলত, `_data/promo.ts`-এর তিনটা লেখা কোডের
   * বিরুদ্ধে। ৩ আগস্ট ২০২৬-এ browser-এ ধরা পড়ে: দুটো তোড়ার cart-এ এই পাতা
   * দেখাচ্ছিল **"Coupon NEW15 − ৳540", মোট ৳3,210**, আর server বলছিল *"code
   * NEW15 does not exist"* — আসল দাম **৳3,750**। ছাড়টা দোকান কোনোদিন দেয়নি,
   * দেওয়ার কথাও ছিল না।
   *
   * `null` = উত্তর এখনো আসেনি বা আসেনি-ই। তখন ছাড় **শূন্য**, আন্দাজ নয় —
   * বেশি দাম দেখিয়ে কম নেওয়া যায়, উল্টোটা যায় না।
   */
  serverDiscount?: {
    discountPaisa: number;
    couponCode: string | null;
    /** DEC-OFR — FREE_DELIVERY offer। শূন্য = কোনো ছাড় নেই, আর সেটাই ডিফল্ট। */
    deliveryWaivedPaisa: number;
  } | null;
}): CheckoutTotals {
  // ⚠️ শুধু deliverable lines — held item order-এ যায় না (D21)
  const subtotalPaisa = args.cart.totals.activePaisa;

  const discountPaisa = Math.min(
    Math.max(0, args.serverDiscount?.discountPaisa ?? 0),
    subtotalPaisa,
  );
  const appliedCode = args.serverDiscount?.couponCode ?? null;

  const quote = quoteDelivery({
    zone: args.zone,
    methodId: args.method,
    subtotalPaisa,
    method: args.methodOverride,
  });

  /*  ছাড় কখনো delivery-র দামের চেয়ে বড় নয় — নইলে "FREE" লেখার পাশে
      ঋণাত্মক টাকা বসত।  */
  const deliveryWaivedPaisa = Math.min(
    Math.max(0, args.serverDiscount?.deliveryWaivedPaisa ?? 0),
    quote.grossPaisa,
  );
  const deliveryPaisa = quote.grossPaisa - deliveryWaivedPaisa;

  return {
    subtotalPaisa,
    discountPaisa,
    couponCode: appliedCode,
    deliveryPaisa,
    deliveryGrossPaisa: quote.grossPaisa,
    deliveryWaivedPaisa,
    freeDelivery: deliveryWaivedPaisa > 0,
    totalPaisa: Math.max(0, subtotalPaisa - discountPaisa) + deliveryPaisa,
  };
}

/* ─────────────────── ETA ─────────────────── */

export function etaText(args: {
  /**
   * DEC-DLV-009 — যে সারিটা বাছা হয়েছে, পুরোটা।
   *
   * ⚠️ আগে শুধু `MethodId` নিত আর `getMethod()` দিয়ে খুঁজত। live id cuid, তাই
   * খোঁজ ব্যর্থ হয়ে চুপচাপ Same Day ধরত — **প্রতিটা order-এ ভুল ETA**, আর
   * নিচের `method.id === "courier"` জাতীয় তুলনাগুলো কোনোদিন সত্যি হতো না।
   */
  method: DeliveryMethod;
  date: string | null;
  slotId: string | null;
  now?: Date;
}): { out: string; done: string } {
  const now = args.now ?? new Date();
  const method = args.method;
  const day = dayLabel(args.date, now);

  if (isCourier(method)) {
    return { out: "Within 24 hours", done: courierWindow(now) };
  }

  if (isExpress(method)) {
    /*  ঘণ্টার সংখ্যাটা delivery module-এর (`promiseMinutes`) — "2 hours" আর
        হাতে লেখা নেই। মালিক 3-Hour Express বানালে এখানে ৩-ই লেখা হবে।  */
    const live = method as Partial<LiveMethod>;
    const hrs = live.promiseMinutes ? Math.round(live.promiseMinutes / 60) : 2;
    return { out: "Within minutes", done: `Today, within ${hrs} hours` };
  }

  if (method.midnight) {
    return { out: `${day}, 11 PM`, done: `${day}, 12:00 AM sharp` };
  }

  const slot = findSlot(method, args.slotId);

  return {
    out: `${day}, before your slot`,
    done: slot ? `${day}, ${slot.label}` : day,
  };
}

function dayLabel(date: string | null, now: Date): string {
  if (!date) return "Soon";

  /* ⚠️ toISOString() নয় — সেটা UTC। ঢাকায় সন্ধ্যা ৭টা মানে UTC-তে পরদিন
     হতে পারে, আর "আজ" লেখা তখন "কাল" হয়ে যেত। toISODate() local। */
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  if (date === toISODate(now)) return "Today";
  if (date === toISODate(tomorrow)) return "Tomorrow";

  return new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/* ─────────────────── BUILD ─────────────────── */

function snapshot(line: ResolvedLine): OrderLineSnapshot {
  return {
    slug: line.product.slug,
    name: line.product.name,
    bg: line.variant?.imageUrl
      ? `url(${line.variant.imageUrl}) center/cover`
      : line.product.bg,
    variantLabel: line.variant?.label ?? null,
    sizeLabel: line.size.label,
    bundleLabels: line.bundles.map((b) => b.label),
    addonLabels: line.addons.map((a) => a.name),
    persoText: line.item.persoText,
    qty: line.item.qty,
    unitPaisa: line.unitPaisa,
    linePaisa: line.linePaisa,
  };
}

/** RAD-XXXXX — Constitution। Server এলে এই id backend দেবে। */
export function makeOrderId(): string {
  return "RAD-" + Math.floor(10000 + Math.random() * 90000);
}

export function buildOrder(args: {
  cart: ResolvedCart;
  checkout: CheckoutState;
  zone: Zone;
  totals: CheckoutTotals;
  payment: PaymentId;
  /**
   * DEC-DLV-009 — যে সারিতে দাম নেওয়া হয়েছে, ঠিক সেটাই।
   *
   * ⚠️ আগে `getMethod(c.method)` দিয়ে খুঁজত আর না পেয়ে Same Day ধরত। ফল:
   * `checkoutTotals()` (যেটা আসল সারি পায়) গ্রাহকের কাছ থেকে ৳২০০ নিত, আর
   * রসিদে লেখা হতো *"Same Day"*। **যা নেওয়া হলো আর যা লেখা হলো — দুটো আলাদা।**
   * অর্ডারের snapshot-ই চুক্তি, তাই এটা আন্দাজ করার জিনিস নয়।
   */
  method: DeliveryMethod;
  /**
   * server যে নম্বরটা দিয়েছে — `POST /shop/checkout`-এর `orderNo`।
   *
   * ⚠️ না দিলে `makeOrderId()` **এখানেই একটা বানিয়ে ফেলে**, আর সেটা browser-এর
   * নিজের বানানো — database-এ ওই নামে কিছু নেই। গ্রাহক success page থেকে
   * নম্বরটা তুলে "Track Order"-এ বসাতেন আর কিছুই পেতেন না; support-কে বলা
   * নম্বরটাও admin খুঁজে পেত না। রসিদের নম্বর দোকানের, browser-এর নয়।
   */
  orderNo?: string;
}): Order {
  const { checkout: c } = args;
  const method = args.method;
  const slot = findSlot(method, c.slotId);
  const eta = etaText({ method, date: c.date, slotId: c.slotId });

  const now = Date.now();

  return {
    id: args.orderNo ?? makeOrderId(),
    placedAt: now,

    /* সদ্য placed order — প্রথম ধাপে (order-success stage=1)। */
    status: "placed",
    timeline: [{ status: "placed", at: now }],

    /* Constitution: phone সবসময় +8801XXXXXXXXX ফরম্যাটে — বিদেশি হলে +<dial> */
    sender: {
      name: c.senderName,
      phone: normalizePhone(c.senderDial, c.senderPhone) ?? `${c.senderDial}${c.senderPhone}`,
      email: c.senderEmail,
    },
    isGift: c.isGift,
    recipient: c.isGift
      ? {
          name: c.recipientName,
          phone: normalizeBdPhone(c.recipientPhone) ?? c.recipientPhone,
        }
      : null,
    giftMessage: c.isGift ? c.giftMessage : "",
    anonymousGift: c.isGift && c.anonymousGift,
    photoUpdates: c.photoUpdates,

    zone: args.zone,
    address: c.address,
    deliveryNotes: c.deliveryNotes,
    method: c.method,
    methodLabel: method.label,
    date: c.date,
    slotLabel: slot?.label ?? null,

    payment: args.payment,
    paymentLabel:
      PAYMENT_METHODS.find((p) => p.id === args.payment)?.label ?? "Payment",

    lines: args.cart.lines.map(snapshot),

    subtotalPaisa: args.totals.subtotalPaisa,
    couponCode: args.totals.couponCode,
    discountPaisa: args.totals.discountPaisa,
    deliveryPaisa: args.totals.deliveryPaisa,
    deliveryWaivedPaisa: args.totals.deliveryWaivedPaisa,
    totalPaisa: args.totals.totalPaisa,

    etaOut: eta.out,
    etaDone: eta.done,
  };
}

/* ─────────────────── STATUS META + STAGE MAP ───────────────────
   একটাই source — chip রং, label, tracker stage সব এখান থেকে। দুই
   জায়গায় দুই রকম status দেখালে trust শেষ।
*/

export interface StatusMeta {
  label: string;
  /* Tailwind arbitrary — chip bg / text / border */
  chip: string;
  dot: string;
}

export const ORDER_STATUS_META: Record<OrderStatus, StatusMeta> = {
  placed: {
    label: "Placed",
    chip: "bg-lavender text-purple border-lavender-deep",
    dot: "bg-orchid",
  },
  confirmed: {
    label: "Confirmed",
    chip: "bg-[#EEF2FF] text-[#4338CA] border-[#DDE3FF]",
    dot: "bg-[#4338CA]",
  },
  preparing: {
    label: "Preparing",
    chip: "bg-[#FFF4E6] text-[#B45309] border-[#FCE4C4]",
    dot: "bg-[#B45309]",
  },
  out_for_delivery: {
    label: "Out for delivery",
    chip: "bg-[#EAF6FF] text-[#0369A1] border-[#CDE9FB]",
    dot: "bg-[#0369A1]",
  },
  delivered: {
    label: "Delivered",
    chip: "bg-[#E8F9EE] text-[#0E7A3D] border-[#C4EED4]",
    dot: "bg-[#0E7A3D]",
  },
  cancelled: {
    label: "Cancelled",
    chip: "bg-[#FBECEC] text-[#B42318] border-[#F5D5D2]",
    dot: "bg-[#B42318]",
  },
};

/** true = order আর এগোবে না (terminal) */
export function isTerminal(status: OrderStatus): boolean {
  return status === "delivered" || status === "cancelled";
}

/* DeliveryTimeline-এর filtered stage-list-এ কয়টা ধাপ "done" —
   status → সেই count। photo toggle অনুযায়ী list বদলায়, তাই এখানেই হিসাব। */
const STAGE_KEYS_ALL = [
  "placed",
  "confirmed",
  "ready",
  "prep-photo",
  "out",
  "delivered",
  "delivery-photo",
] as const;

type StageKey = (typeof STAGE_KEYS_ALL)[number];

const STATUS_STAGE_KEY: Record<Exclude<OrderStatus, "cancelled">, StageKey> = {
  placed: "placed",
  confirmed: "confirmed",
  preparing: "ready",
  out_for_delivery: "out",
  delivered: "delivery-photo",
};

/* photo ধাপ ছাড়া version — explicit, যাতে filter-এর inferred type
   predicate element type সংকুচিত না করে (TS 5.5+)। */
const STAGE_KEYS_NO_PHOTO: readonly StageKey[] = [
  "placed",
  "confirmed",
  "ready",
  "out",
  "delivered",
];

export function statusStage(status: OrderStatus, photos: boolean): number {
  if (status === "cancelled") return 0;
  const keys: readonly StageKey[] = photos ? STAGE_KEYS_ALL : STAGE_KEYS_NO_PHOTO;
  return keys.indexOf(STATUS_STAGE_KEY[status]) + 1;
}
