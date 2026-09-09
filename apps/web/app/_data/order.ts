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
  ORDER — cart + checkout → one frozen record.

  ⚠️ Prices ARE stored here — and that is correct.
  D20 says a cart may not hold prices, because a cart is alive: if the admin
  changes a price, the cart's price should change with it. An order is the
  opposite — an order is a **contract**. The price the customer bought at is
  the price forever. If tomorrow's price rise changed an old order's receipt,
  that would be fraud.

  So: cart = config (no prices), order = snapshot (prices).

  ⇄ SWAP HERE — once the Ecommerce module is locked, placeOrder() becomes
  POST /orders and the server gives the order id. The shape stays the same.
  ═══════════════════════════════════════════════════════════════════
*/

export interface OrderLineSnapshot {
  slug: string;
  name: string;
  bg: string;
  /**
   * DEC-PRD-012 — which colour / flavour / size was bought. `null` = this
   * product has no variants.
   *
   * ⚠️ order = snapshot. If the owner renames or removes the colour tomorrow,
   * the old order still records what was actually bought — the same rule as
   * DEC-DLV-002.
   */
  variantLabel: string | null;
  sizeLabel: string;
  /**
   * DEC-PRD-013 — which bundles were taken. An empty array = none.
   *
   * ⚠️ This used to be a single name (`bundleLabel`), because more than one
   * could not be taken. order = snapshot, so an old order's names stay exactly
   * as they were — even if the owner removes the bundle today.
   */
  bundleLabels: string[];
  addonLabels: string[];
  persoText?: string;
  qty: number;
  unitPaisa: number;
  linePaisa: number;
}

/* ─────────────────── STATUS + TIMELINE ───────────────────
   An order is a contract, but a living one — it moves from placed → delivered.
   status = where it is now; timeline = when it reached each step (shown on
   history/detail).

   ⚠️ These lifecycle keys are a subset of DeliveryTimeline's 7 stages — so the
   detail page can reuse that same tracker. The two photo steps are
   informational, so they are not lifecycle statuses.

   ⇄ SWAP HERE — once the Ecommerce/Delivery module is locked, status and
   timeline come from the server (Delivery Management); the frontend only
   renders.
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
  /** UTC ms — displayed in Asia/Dhaka */
  placedAt: number;

  status: OrderStatus;
  /** the steps that happened, in time order — oldest first */
  timeline: OrderEvent[];

  sender: { name: string; phone: string; email: string };
  isGift: boolean;
  recipient: { name: string; phone: string } | null;
  giftMessage: string;
  anonymousGift: boolean;
  photoUpdates: boolean;

  /**
   * Was a verification code actually sent for this order (DEC-WA-010)?
   *
   * ⚠️ The success page used to show "Confirm your number — we sent a 6-digit
   * code" to EVERYONE. A returning customer whose number was already proved
   * gets no code, because checkout does not send one — so they sat waiting for
   * a message that was never going to arrive (9 Sep 2026).
   *
   * `undefined` on a receipt saved before this existed: shown, as it was.
   */
  needsPhoneVerify?: boolean;

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
  /** delivery waived by a promo — for showing on the receipt */
  deliveryWaivedPaisa: number;
  totalPaisa: number;

  etaOut: string;
  etaDone: string;
}

/* ─────────────────── TOTALS ───────────────────
   Every number in checkout comes from here — the summary, the sticky bar and
   the Place Order button all call the same function. Two sums in two places
   will differ by ৳1 one day, and that is the end of trust.
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
   * DEC-DLV-009 — the real row from the delivery module, price included.
   *
   * ⚠️ The price could not be found from `method` (an id) alone, because the
   * id is now a database row id — it will not be found in the hand-written
   * list, and on a miss it silently took the first row's price. The owner
   * would type ৳200 in the admin, the customer would pay ৳60, and nobody would
   * notice.
   */
  methodOverride?: DeliveryMethod;
  /**
   * What the offer engine said — the answer from `POST /shop/checkout/quote`.
   *
   * ⚠️ `applyCoupon()` used to run here, against three codes written in
   * `_data/promo.ts`. Caught in the browser on 3 Aug 2026: on a cart with two
   * bouquets this page showed **"Coupon NEW15 − ৳540", total ৳3,210**, while
   * the server said *"code NEW15 does not exist"* — the real price was
   * **৳3,750**. The shop had never offered that discount and never meant to.
   *
   * `null` = the answer has not arrived, or never will. The discount is then
   * **zero**, not a guess — showing a higher price and charging less is
   * survivable, the other way round is not.
   */
  serverDiscount?: {
    discountPaisa: number;
    couponCode: string | null;
    /** DEC-OFR — a FREE_DELIVERY offer. Zero = no waiver, and that is the default. */
    deliveryWaivedPaisa: number;
  } | null;
}): CheckoutTotals {
  // ⚠️ deliverable lines only — a held item does not go on the order (D21)
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

  /*  The waiver is never larger than the delivery price — otherwise a negative
      amount would sit next to the word "FREE".  */
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
   * DEC-DLV-009 — the whole row that was chosen.
   *
   * ⚠️ This used to take only a `MethodId` and look it up with `getMethod()`.
   * A live id is a cuid, so the lookup failed and it silently assumed Same Day
   * — **a wrong ETA on every order** — and comparisons below like
   * `method.id === "courier"` could never be true.
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
    /*  The number of hours belongs to the delivery module (`promiseMinutes`) —
        "2 hours" is no longer written by hand. If the owner creates a 3-Hour
        Express, this prints 3.  */
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

  /* ⚠️ Not toISOString() — that is UTC. 7 PM in Dhaka can be the next day in
     UTC, and "today" would then print as "tomorrow". toISODate() is local. */
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

/** RAD-XXXXX — Constitution. Once the server lands, the backend gives this id. */
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
   * DEC-DLV-009 — exactly the row the money was charged against.
   *
   * ⚠️ This used to look up `getMethod(c.method)` and fall back to Same Day on
   * a miss. The result: `checkoutTotals()` (which gets the real row) charged
   * the customer ৳200 while the receipt said *"Same Day"*. **What was charged
   * and what was written were two different things.** The order's snapshot is
   * the contract, so this is not something to guess at.
   */
  method: DeliveryMethod;
  /**
   * The number the server gave — `orderNo` from `POST /shop/checkout`.
   *
   * ⚠️ Without it, `makeOrderId()` **invents one right here**, and that one is
   * the browser's own — nothing by that name exists in the database. The
   * customer would copy the number off the success page into "Track Order" and
   * find nothing; the admin could not find the number they quoted to support
   * either. The number on a receipt belongs to the shop, not the browser.
   */
  orderNo?: string;
  /** the shop's answer: has this number still to be proved (DEC-WA-010) */
  needsPhoneVerify?: boolean;
}): Order {
  const { checkout: c } = args;
  const method = args.method;
  const slot = findSlot(method, c.slotId);
  const eta = etaText({ method, date: c.date, slotId: c.slotId });

  const now = Date.now();

  return {
    id: args.orderNo ?? makeOrderId(),
    placedAt: now,
    needsPhoneVerify: args.needsPhoneVerify,

    /* A freshly placed order — at the first step (order-success stage=1). */
    status: "placed",
    timeline: [{ status: "placed", at: now }],

    /* Constitution: phone is always +8801XXXXXXXXX — +<dial> when foreign */
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
   One source — chip colour, label and tracker stage all come from here.
   Showing a different status in two places is the end of trust.
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

/** true = the order will not move any further (terminal) */
export function isTerminal(status: OrderStatus): boolean {
  return status === "delivered" || status === "cancelled";
}

/* How many steps are "done" in DeliveryTimeline's filtered stage list —
   status → that count. The list changes with the photo toggle, so the sum
   belongs here. */
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

/* The version without the photo steps — written out explicitly so that
   filter's inferred type predicate does not narrow the element type
   (TS 5.5+). */
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
