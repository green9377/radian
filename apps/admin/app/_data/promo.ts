import { formatTaka } from "./products";

/*
  ═══════════════════════════════════════════════════════════════════
  PROMO + COUPON config

  Marketing module এখনো locked নয় (Open Question #4)। Threshold, reward,
  coupon — সবই admin generate করবে, fixed business rule নয়।

  ⚠️ কেন এই ফাইল আলাদা:
  Cart board-এ free-midnight goal ছিল ৳8,000, আর PDP-র OFFERS-এ ৳3,000।
  একই offer, দুই সংখ্যা — trust ভাঙার সবচেয়ে সহজ উপায়। এখন দুই page-ই
  এখান থেকে পড়ে, তাই আর কখনো আলাদা হতে পারবে না।

  ⇄ SWAP HERE — Marketing module lock হলে এই function গুলোর ভেতরটা
  fetch() হবে। কোনো component-এ হাত পড়বে না।
  ═══════════════════════════════════════════════════════════════════
*/

/* ─────────────────── FREE DELIVERY PROMO ─────────────────── */

export interface FreeDeliveryPromo {
  id: string;
  /** কত টাকার উপরে unlock — integer paisa */
  thresholdPaisa: number;
  /** কত বাঁচল — integer paisa */
  savePaisa: number;
  /** "free midnight delivery" — progress bar-এ বসে */
  rewardLabel: string;
  /** কোন zone-এ চলে। "dhaka" = All Bangladesh-এ progress bar লুকাবে */
  zone: "dhaka" | "both";
  active: boolean;
}

export const FREE_DELIVERY_PROMO: FreeDeliveryPromo = {
  id: "free-midnight",
  thresholdPaisa: 300000, // ৳3,000
  savePaisa: 30000, // ৳300
  rewardLabel: "free midnight delivery",
  zone: "dhaka",
  active: true,
};

/** PDP-র OFFERS dropdown-এর midnight line — একই config থেকে লেখা হয় */
export function freeDeliveryOfferText(): string {
  const p = FREE_DELIVERY_PROMO;
  return `Free midnight delivery on orders over ${formatTaka(
    p.thresholdPaisa,
  )} · Dhaka only`;
}

/* ─────────────────── DELIVERY FEE ───────────────────
   ⚠️ এখানে নেই — ইচ্ছে করে।

   Delivery fee = **Operations** module, promo = **Marketing**। দুটো এক
   ফাইলে রাখলে module lock করার দিন আলাদা করতে গিয়ে ব্যথা হবে।

   → `_data/delivery.ts` : METHODS · SLOTS · DELIVERY_FROM_PAISA · quoteDelivery()
   Cart-এর "From ৳60" আর checkout-এর আসল fee — দুটোই সেখান থেকেই আসে।
*/

/* ─────────────────── COUPONS ─────────────────── */

export type CouponKind = "percent" | "flat";

export interface Coupon {
  code: string;
  kind: CouponKind;
  /** percent হলে % (15), flat হলে integer paisa */
  value: number;
  minPaisa: number;
  /** percent coupon-এ সর্বোচ্চ ছাড়ের ছাদ */
  maxDiscountPaisa?: number;
  label: string;
}

export const COUPONS: Coupon[] = [
  {
    code: "NEW15",
    kind: "percent",
    value: 15,
    minPaisa: 149900, // ৳1,499
    maxDiscountPaisa: 100000, // ৳1,000 ছাদ
    label: "15% off — first-time customers",
  },
  {
    code: "RADIAN100",
    kind: "flat",
    value: 10000, // ৳100
    minPaisa: 100000, // ৳1,000
    label: "৳100 off your order",
  },
  {
    code: "BLOOM500",
    kind: "flat",
    value: 50000, // ৳500
    minPaisa: 500000, // ৳5,000
    label: "৳500 off orders over ৳5,000",
  },
];

export type CouponResult =
  | { ok: true; coupon: Coupon; discountPaisa: number }
  | { ok: false; reason: string };

/** ⇄ SWAP HERE — Marketing lock হলে এটা POST /coupons/validate হবে */
export function applyCoupon(code: string, subtotalPaisa: number): CouponResult {
  const c = COUPONS.find((x) => x.code === code.trim().toUpperCase());
  if (!c) return { ok: false, reason: "This code isn't valid." };

  if (subtotalPaisa < c.minPaisa) {
    return {
      ok: false,
      reason: `${c.code} needs a subtotal of ${formatTaka(c.minPaisa)} or more.`,
    };
  }

  const raw =
    c.kind === "percent" ? Math.round((subtotalPaisa * c.value) / 100) : c.value;

  // ছাদ + subtotal — কোনো অবস্থাতেই negative total হতে পারবে না
  const discountPaisa = Math.min(raw, c.maxDiscountPaisa ?? raw, subtotalPaisa);

  return { ok: true, coupon: c, discountPaisa };
}
