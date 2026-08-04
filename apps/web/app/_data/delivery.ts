import type { Zone } from "../_store/useZoneStore";
import type { IconName } from "./productDetails";
import { promisePhrase } from "./deliveryClaims";
import type { DeliveryOption, DeliveryOptionSlot, DeliveryTiming } from "./shop";

/*
  ═══════════════════════════════════════════════════════════════════
  DELIVERY MODULE config — Operations-এর rule, এখন static।

  ★ চারটা method (Inside Dhaka)      ★ একটা (All Bangladesh)
  · Express          — slot নেই, আজ; কত ঘণ্টা সেটা admin-এর promiseMinutes
  · Same Day         — আজ + time slot
  · Midnight         — slot নেই, ১২টা; আজকের জন্য সন্ধ্যা ৬টা পর্যন্ত order
  · Scheduled        — যেকোনো দিন + time slot
  · Nationwide Courier — 1–3 দিন, slot নেই

  ★ Slot = capacity-driven (locked, 14 July — সোবুজ)
  Slot শুরু হওয়ার **আগ পর্যন্ত** order নেওয়া যাবে — কোনো lead time নেই।
  বন্ধ হয় শুধু দুই কারণে: (১) সময় পেরিয়ে গেছে, (২) capacity ভরে গেছে।
  Capacity admin panel থেকে বসবে — নিচের `booked` আপাতত mock।

  ⇄ SWAP HERE — Operations lock হলে METHODS/SLOTS/capacity সব API থেকে।
  সংখ্যা কোনো component-এ লেখা নেই, শুধু এখানে (D23/D24)।
  ═══════════════════════════════════════════════════════════════════
*/

/* ─────────────────── METHOD ─────────────────── */

export type MethodId = "express" | "sameday" | "midnight" | "scheduled" | "courier";

export interface DeliveryMethod {
  id: MethodId;
  /**
   * DEC-DLV-009 — কোন **ছাঁচের** delivery। live method-এ delivery module
   * থেকে আসে; নিচের হাতে-লেখা `METHODS`-এ থাকে না (ওখানে `id`-ই ছাঁচ)।
   *
   * ⚠️ আচরণের প্রতিটা নিয়ম এখন এটার উপর লেখা, `id`-র উপর নয়। `id` এখন
   * database-এর সারির id (cuid) — `id === "express"` মিলিয়ে দেখা মানে live
   * data-য় কোনোদিনই না মেলা, আর চুপচাপ ভুল আচরণ করা।
   */
  timing?: DeliveryTiming;
  /**
   * `FROM_CONFIRM` হলে কত মিনিটের প্রতিশ্রুতি — ১৮০ = ৩ ঘণ্টা।
   *
   * ⚠️ পর্দায় "২ ঘণ্টা" জাতীয় কোনো সংখ্যা লেখা যাবে না; সবগুলো এই ঘর থেকে
   * বানাতে হবে। মালিক admin-এ ধরনটার সময় বদলালে checkout-এর বাক্যও বদলাবে।
   */
  promiseMinutes?: number | null;
  label: string;
  sub: string;
  icon: IconName;
  feePaisa: number;
  /** midnight-এর বাড়তি চার্জ (promo-তে মাফ হতে পারে — D25) */
  surchargePaisa: number;
  zone: Zone;
  /** time slot লাগবে কি না */
  slots: boolean;
  /** তারিখ বাছাই করা যাবে কি না */
  datePick: boolean;
  /** শুধু আজ */
  todayOnly?: boolean;
  midnight?: boolean;
}

export const METHODS: DeliveryMethod[] = [
  {
    id: "express",
    label: "Express Delivery",
    sub: "At their door as fast as we can arrange it",
    icon: "bolt",
    feePaisa: 15000, // ৳150
    surchargePaisa: 0,
    zone: "dhaka",
    slots: false,
    datePick: false,
    todayOnly: true,
  },
  {
    id: "sameday",
    label: "Same Day",
    sub: "Today — pick a time slot",
    icon: "sun",
    feePaisa: 6000, // ৳60
    surchargePaisa: 0,
    zone: "dhaka",
    slots: true,
    datePick: false,
    todayOnly: true,
  },
  {
    id: "midnight",
    label: "Midnight Surprise",
    sub: "Lands at 12:00 AM sharp",
    icon: "moon",
    feePaisa: 6000, // ৳60
    surchargePaisa: 20000, // ৳200
    zone: "dhaka",
    slots: false,
    datePick: true,
    midnight: true,
  },
  {
    id: "scheduled",
    label: "Schedule It",
    sub: "Pick any date & time slot",
    icon: "clock",
    feePaisa: 6000, // ৳60
    surchargePaisa: 0,
    zone: "dhaka",
    slots: true,
    datePick: true,
  },
  {
    id: "courier",
    label: "Nationwide Courier",
    sub: "Delivered in 1–3 days",
    icon: "truck",
    feePaisa: 12000, // ৳120
    surchargePaisa: 0,
    zone: "bangladesh",
    slots: false,
    datePick: false,
  },
];

/* ═══════════════════════════════════════════════════════════════════════════
   LIVE — delivery module থেকে আসা মেনু · DEC-DLV-009 / DEC-DLV-010

   মালিক, ১ আগস্ট ২০২৬: *"delivery module-এ যা edit বা change করা হয়, তা যেন
   auto পুরা system-এ কাজ করে — frontend, product upload page, আর যেখানে
   দরকার সব জায়গায়।"*

   ⚠️ উপরের `METHODS` তালিকাটা এখন **শুধু গঠনের নমুনা** — কোন ঘরগুলো লাগে
   তা বলার জন্য। checkout আর ওটা পড়ে না। ওখানে ৳৬০ লেখা ছিল আর মালিকের
   module-এ ৳২০০ — একই জিনিসের দুই দাম, দুই জায়গায়। এখন একটাই।

   ছাঁচ থেকে আচরণ, নাম থেকে নয় — এটাই পুরো কাজটার মূল কথা।
─────────────────────────────────────────────────────────────────────────── */
export interface LiveMethod extends DeliveryMethod {
  /** delivery module-এর নামের id — product এর সাথেই যুক্ত */
  typeId: string | null;
  timing: DeliveryTiming;
  promiseMinutes: number | null;
  /** আজ এই মুহূর্তে দিনের জানালার বাইরে কি না */
  closedNow: boolean;
  closedReason: string | null;
  liveSlots: DeliverySlot[];
}

/**
 * API-র উত্তর → পর্দা যে আকার চেনে।
 *
 * ⚠️ `datePick` / `slots` / `todayOnly` — তিনটাই `timing` থেকে আসে, নাম দেখে
 * আন্দাজ করে নয়। মালিক "3 Hours" নামে নতুন একটা ধরন বানালে সেটা নিজে থেকেই
 * ঠিক আচরণ করে, কারণ ছাঁচটা তিনিই বেছে দিয়েছেন।
 */
export function toLiveMethods(opts: DeliveryOption[]): LiveMethod[] {
  return opts.map((o, i) => {
    const t = o.timing;
    return {
      /*  ⚠️ `rateId`, `typeId` নয় — একই নামের দুই এলাকায় দুই দাম থাকতে পারে,
          আর পর্দা যেটা দেখাচ্ছে সেটাই বাছা হচ্ছে।  */
      id: o.rateId as MethodId,
      typeId: o.typeId,
      timing: t,
      promiseMinutes: o.promiseMinutes,
      label: o.name,
      sub:
        /*  ⚠️ `Math.round` was here, and it rounded DOWN. A 90-minute promise
            printed as "Within 2 hours"… then as "Within 1 hours" for 89. The
            shared `promisePhrase` ceils — the only safe direction to be wrong
            about a delivery time is later — and says minutes below the hour.  */
        t === "FROM_CONFIRM" && promisePhrase(o.promiseMinutes)
          ? `${promisePhrase(o.promiseMinutes)!.replace(/^within/i, "Within")} of confirming`
          : t === "TODAY_SLOT"
            ? "Today — pick a time slot"
            : t === "PICK_DATE_SLOT"
              ? "Pick any date & time slot"
              : t === "PICK_DATE_FIXED"
                ? (o.slots[0] ? `Lands ${slotWindowText(o.slots[0])}` : "Pick a date")
                : o.eta ?? "Delivered in a few days",
      icon:
        t === "FROM_CONFIRM" ? "bolt"
        : t === "TODAY_SLOT" ? "sun"
        : t === "PICK_DATE_FIXED" ? "moon"
        : t === "LEAD_DAYS" ? "truck"
        : "clock",
      feePaisa: o.feePaisa,
      /*  ⚠️ সবসময় ০। "surcharge" বলে আলাদা কিছু delivery module-এ নেই —
          একটা delivery-র একটাই দাম। পুরনো midnight-এর ৳৬০+৳২০০ ভাগটা
          web app-এর নিজের বানানো ছিল।  */
      surchargePaisa: 0,
      zone: o.kind === "COURIER" ? "bangladesh" : "dhaka",
      slots: t === "TODAY_SLOT" || t === "PICK_DATE_SLOT",
      datePick: t === "PICK_DATE_SLOT" || t === "PICK_DATE_FIXED",
      todayOnly: t === "FROM_CONFIRM" || t === "TODAY_SLOT",
      midnight: t === "PICK_DATE_FIXED",
      closedNow: o.closedNow,
      closedReason: o.closedReason,
      liveSlots: o.slots.map((sl) => ({
        id: sl.id,
        label: slotLabelText(sl),
        /*  পুরনো আকারে `startHour` ছিল; মিনিট থেকে বানানো হয়। শূন্য হলে
            slot-টা সারাদিন খোলা ধরা হয়।  */
        startHour: sl.startMin != null ? Math.floor(sl.startMin / 60) : 0,
        capacity: sl.capacityPerDay ?? 0,
        booked: 0,
        minutesLeft: sl.minutesLeft,
      })),
      sortOrder: i,
    } as LiveMethod;
  });
}

/**
 * "11:30 PM – 12:30 AM".
 *
 * ⚠️ শেষ সময় শুরুর চেয়ে ছোট হলে slot মধ্যরাত পেরিয়েছে — Midnight Surprise-এ
 * ঠিক এটাই হয় (1410 → 30)। সংখ্যা দুটো বিয়োগ করলে উত্তর আসে ঋণাত্মক, তাই
 * এখানে শুধু লেখা বানানো হয় আর তুলনা করা হয় না।
 */
export function slotWindowText(sl: DeliveryOptionSlot): string {
  if (sl.startMin == null || sl.endMin == null) return "";
  return `${minLabel(sl.startMin)} – ${minLabel(sl.endMin)}`;
}
const slotLabelText = (sl: DeliveryOptionSlot) => {
  const w = slotWindowText(sl);
  return w ? `${sl.label} · ${w}` : sl.label;
};
function minLabel(m: number): string {
  const h = Math.floor(m / 60) % 24;
  const mm = m % 60;
  const ap = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(mm).padStart(2, "0")} ${ap}`;
}

export function methodsForZone(zone: Zone | null): DeliveryMethod[] {
  return METHODS.filter(
    (m) => m.zone === (zone === "bangladesh" ? "bangladesh" : "dhaka"),
  );
}

/**
 * হাতে-লেখা তালিকায় খোঁজে — **না পেলে `null`**।
 *
 * ⚠️ আগে না পেলে চুপচাপ `METHODS[1]` (Same Day) ফিরত। DEC-DLV-009-এর পর
 * `id` হলো database-এর সারির id, তাই checkout-এর প্রতিটা খোঁজ ব্যর্থ হতো আর
 * সবাই "Same Day, ৳৬০" পেয়ে যেত: validation ভুল slot চাইত, রসিদে ভুল নাম
 * বসত, ETA ভুল হতো। একটা fallback পাঁচ জায়গায় মিথ্যা বলছিল।
 *
 * এখন না পাওয়া মানে না পাওয়া। live তালিকা যাদের আছে তারা সেখানেই খোঁজে;
 * এটা শুধু পুরনো seed/demo data-র জন্য রইল।
 */
export function getMethod(id: MethodId): DeliveryMethod | null {
  return METHODS.find((m) => m.id === id) ?? null;
}

export function defaultMethod(zone: Zone | null): MethodId {
  return zone === "bangladesh" ? "courier" : "sameday";
}

/* ─────────────────── ছাঁচ চেনা · নাম নয় ───────────────────
   live method-এর `id` cuid, তাই নাম মিলিয়ে আচরণ ঠিক করা যায় না। `timing`
   থাকলে সেটাই সত্যি; না থাকলে (হাতে-লেখা METHODS) পুরনো `id`-ই ছাঁচ।
*/

const shape = (m: DeliveryMethod, live: DeliveryTiming, legacy: MethodId) =>
  m.timing ? m.timing === live : m.id === legacy;

/** ২ ঘণ্টার মতো — confirm হওয়ার পর থেকে গোনা, slot নেই */
export const isExpress = (m: DeliveryMethod) => shape(m, "FROM_CONFIRM", "express");
/** আজ + slot */
export const isSameDay = (m: DeliveryMethod) => shape(m, "TODAY_SLOT", "sameday");
/** nationwide courier — দিন গোনা, তারিখ বাছা যায় না */
export const isCourier = (m: DeliveryMethod) => shape(m, "LEAD_DAYS", "courier");

/**
 * Cart-এর speed flag-গুলোর কোনটা এই method-কে আটকায়।
 *
 * ⚠️ আগে `speeds[method.id]` লেখা ছিল। live id cuid, আর `CartSpeeds`-এর চাবি
 * "express" | "sameday" | "midnight" — তাই কোনোদিন মিলত না, আর **product-এর
 * delivery restriction checkout-এ একেবারেই কাজ করত না**। যে cake midnight-এ
 * যেতে পারে না, সেটাও midnight-এ বিক্রি হয়ে যেত।
 *
 * `null` = এই ছাঁচ কখনো আটকানো হয় না (Schedule It আর courier — শেষ ভরসা,
 * সবকিছু এখানে নামতে পারে)।
 */
export function speedKeyFor(m: DeliveryMethod): keyof CartSpeeds | null {
  if (isExpress(m)) return "express";
  if (isSameDay(m)) return "sameday";
  if (m.midnight) return "midnight";
  return null;
}

/**
 * এই method-এর নিজের slot। live হলে delivery module-এর, নাহলে পুরনো তিনটা।
 *
 * ⚠️ পুরো checkout-এ slot খোঁজার একটাই জায়গা। আগে `getSlot()` সবসময় হাতে-লেখা
 * `SLOTS`-এ খুঁজত, তাই live slot বাছলে `null` আসত আর validation বলত
 * "That slot is gone" — order কখনো place-ই হতে পারত না।
 */
export function slotsOf(m: DeliveryMethod): DeliverySlot[] {
  return "liveSlots" in m ? (m as LiveMethod).liveSlots : SLOTS;
}

export function findSlot(m: DeliveryMethod, id: string | null): DeliverySlot | null {
  if (!id) return null;
  return slotsOf(m).find((s) => s.id === id) ?? null;
}

/** Cart-এর "From ৳60" — METHODS থেকেই derive, আলাদা সংখ্যা নয় (D24) */
export const DELIVERY_FROM_PAISA: Record<"dhaka" | "bangladesh", number> = {
  dhaka: Math.min(...METHODS.filter((m) => m.zone === "dhaka").map((m) => m.feePaisa)),
  bangladesh: Math.min(
    ...METHODS.filter((m) => m.zone === "bangladesh").map((m) => m.feePaisa),
  ),
};

/* ─────────────────── CUT-OFF (Operations, locked 14 July) ─────────────────── */

/** Express শুধু এই সময়ের মধ্যে order নেওয়া যায় */
export const EXPRESS_WINDOW = { startHour: 10, endHour: 17 }; // 10 AM – 5 PM

/** আজ রাতের midnight-এর জন্য শেষ order */
export const MIDNIGHT_CUTOFF_HOUR = 18; // সন্ধ্যা ৬টা

export const COURIER_DAYS = { min: 1, max: 3 };

/* ─────────────────── SLOT + CAPACITY ─────────────────── */

export interface DeliverySlot {
  id: string;
  label: string;
  /** ২৪ ঘণ্টার হিসাবে slot শুরু — এর আগ পর্যন্ত order নেওয়া যায় */
  startHour: number;
  /** admin panel থেকে — slot-এ কতটা order নেওয়া যাবে */
  capacity: number;
  /** ⇄ SWAP HERE — এখন mock, API এলে আজকের আসল booking count */
  booked: number;
  /**
   * DEC-DLV-010 — আজকের জন্য এই slot-এ আর কত মিনিট order নেওয়া যাবে।
   * server-এ ঢাকার সময়ে হিসাব করা; ≤0 মানে আজ শেষ। `null` = কোনো
   * শেষ-সময় বসানো নেই।
   *
   * ⚠️ browser-এর ঘড়ি নয়। বিদেশ থেকে যিনি উপহার পাঠাচ্ছেন, তাঁর ঘড়ি
   * ঢাকার থেকে ছয় ঘণ্টা আলাদা — আগে `startHour` দিয়ে হিসাব হতো, আর
   * তাতে দুবাই থেকে অর্ডার করলে ভুল slot খোলা দেখাত।
   */
  minutesLeft?: number | null;
}

export const SLOTS: DeliverySlot[] = [
  { id: "morning", label: "10 AM – 1 PM", startHour: 10, capacity: 40, booked: 12 },
  { id: "afternoon", label: "3 PM – 6 PM", startHour: 15, capacity: 40, booked: 40 }, // ভরা — demo
  { id: "evening", label: "6 PM – 9 PM", startHour: 18, capacity: 30, booked: 22 },
];

export function getSlot(id: string): DeliverySlot | null {
  return SLOTS.find((s) => s.id === id) ?? null;
}

export function slotLeft(slot: DeliverySlot): number {
  return Math.max(0, slot.capacity - slot.booked);
}

export type SlotState =
  | { ok: true; left: number }
  | { ok: false; reason: "passed" | "full" };

/**
 * Slot ধরা যাবে কি না।
 * · আজ হলে — slot শুরু হয়ে গেলে আর নয় (lead time নেই, সোবুজ 14 July)
 * · capacity ভরে গেলে আর নয়, তখন পরেরটা দেখাবে
 */
export function slotState(
  slot: DeliverySlot,
  isToday: boolean,
  now = new Date(),
): SlotState {
  /*  DEC-DLV-010 — server যদি ঢাকার সময়ে হিসাব করে পাঠিয়ে থাকে, সেটাই
      সত্যি। browser-এর ঘড়ি শুধু তখনই ব্যবহার হয় যখন আর কিছু জানা নেই।  */
  if (isToday && typeof slot.minutesLeft === "number")
    return slot.minutesLeft <= 0 ? { ok: false, reason: "passed" } : okOrFull(slot);
  if (isToday && slot.minutesLeft === null && slot.startHour === 0) return okOrFull(slot);
  if (isToday && now.getHours() >= slot.startHour) return { ok: false, reason: "passed" };
  return okOrFull(slot);
}

function okOrFull(slot: DeliverySlot): SlotState {
  /*  capacity ০ মানে "সীমা বসানো হয়নি", "ভরে গেছে" নয় — admin-এ ঘরটা
      খালি রাখলে ঠিক এটাই হয়। শূন্যকে ভরা ধরলে প্রতিটা নতুন slot জন্মের
      সাথে সাথেই বন্ধ দেখাত।  */
  if (slot.capacity > 0 && slotLeft(slot) <= 0) return { ok: false, reason: "full" };
  return { ok: true, left: slot.capacity > 0 ? slotLeft(slot) : 999 };
}

/**
 * এই method-এর আজকের জন্য একটাও slot খোলা আছে কি না — Same Day-র শর্ত।
 *
 * ⚠️ method-এর **নিজের** slot দেখে। আগে সবসময় হাতে-লেখা `SLOTS` দেখত, তাই
 * মালিক admin-এ যে slot বানাতেন তার সাথে checkout-এর "সব slot শেষ" বার্তার
 * কোনো সম্পর্কই ছিল না।
 */
export function anySlotToday(m: DeliveryMethod, now = new Date()): boolean {
  return slotsOf(m).some((s) => slotState(s, true, now).ok);
}

/* ─────────────────── METHOD AVAILABILITY ───────────────────
   বন্ধ card লুকাই না — ধূসর করে **কারণ** লিখি। লুকিয়ে দিলে customer
   ভাববে Radian midnight করেই না, আর কেউ কখনো জানবে না কেন বিক্রি কমল।
*/

export type MethodState = { ok: true } | { ok: false; reason: string };

/* ─────────────────── LEAD TIME ───────────────────
   "Days before it can go out" — `Product.leadTimeDays`, typed by the shop per
   product.

   ⚠️ IT WAS SENT AND NEVER READ. Found 1 Aug 2026 while answering the owner's
   question about which admin fields reach the website: the API had been
   publishing `leadTimeDays` all along and NOTHING in `apps/web` looked at it.
   A bouquet marked "3 days to make" was offered express delivery and a delivery
   date of tomorrow. The admin even labelled the field "Moves the date" in
   green, so the shop had every reason to believe it worked.

   The rule is one line: nothing can leave before today + lead days. Everything
   below is that line applied to the two places a customer picks a time.

   ⚠️ THE CART'S LEAD TIME IS THE LARGEST ONE IN IT, not the sum. Three items
   that each take two days are made in parallel by different hands; they do not
   take six. Adding them would push every mixed basket weeks out.
*/
export function cartLeadDays(items: { leadTimeDays?: number | null }[]): number {
  return items.reduce((max, i) => Math.max(max, i.leadTimeDays ?? 0), 0);
}

/* ─────────────────── WHAT SPEEDS THIS BASKET CAN TAKE ───────────────────
   Owner's ruling, 1 Aug 2026, asked and answered in his own words:
   *"যতগুলা product cart-এ থাকুক, যে নিয়ম সবগুলা product-এ আছে সেটাই win হবে"*.

   INTERSECTION, not union. One address, one rider, one journey — so a cream
   cake that cannot travel at midnight stops the whole order travelling at
   midnight, roses in the same bag or not. The slowest thing sets the pace.

   ⚠️ WHO BLOCKED IT IS CARRIED ALONG. "Midnight not available" makes a customer
   delete things at random to find the culprit; "Chocolate Fudge Cake can't go
   at midnight" lets them decide in one read whether to drop the cake or the
   midnight. Naming it costs one string and saves the order.

   ⚠️ A PRODUCT WITH NOTHING TICKED BLOCKS ALL THREE, and that is correct, not
   a bug to work around: the shop said this thing takes none of the fast
   options, so it goes on a scheduled day. Schedule It is never gated here —
   it is the floor everything can always fall back to.

   The three flags have been in the API since the endpoint was written. Until
   today the only thing reading them was the listing card, deciding which
   delivery-filter page a product showed up on.
*/
export interface SpeedBlock {
  ok: boolean;
  /** the product that made it not-ok — null when nothing did */
  blockedBy: string | null;
}
export type CartSpeeds = Record<"express" | "sameday" | "midnight", SpeedBlock>;

export const ALL_SPEEDS_OK: CartSpeeds = {
  express: { ok: true, blockedBy: null },
  sameday: { ok: true, blockedBy: null },
  midnight: { ok: true, blockedBy: null },
};

export function cartSpeeds(
  items: {
    name: string;
    speeds?: { express: boolean; sameDay: boolean; midnight: boolean };
  }[],
): CartSpeeds {
  const out: CartSpeeds = {
    express: { ok: true, blockedBy: null },
    sameday: { ok: true, blockedBy: null },
    midnight: { ok: true, blockedBy: null },
  };
  for (const i of items) {
    /*  Absent means the mock is feeding this, and the mock has no opinion.
        Treating "we were not told" as "allowed" keeps the demo working; the
        real catalogue always sends all three.  */
    if (!i.speeds) continue;
    const pairs = [
      ["express", i.speeds.express],
      ["sameday", i.speeds.sameDay],
      ["midnight", i.speeds.midnight],
    ] as const;
    for (const [key, allowed] of pairs) {
      if (!allowed && out[key].ok) out[key] = { ok: false, blockedBy: i.name };
    }
  }
  return out;
}

export function methodState(
  method: DeliveryMethod,
  now = new Date(),
  /** largest "days to make" in the cart. 0 = everything is on the shelf. */
  leadDays = 0,
  /** which fast options every item in the cart allows */
  speeds: CartSpeeds = ALL_SPEEDS_OK,
): MethodState {
  const h = now.getHours();

  /*  ⚠️ BEFORE THE CLOCK RULES AND BEFORE THE LEAD-TIME RULE, because this is
      the reason a customer can act on. "Today's express window closed at 5 PM"
      invites them back tomorrow morning for something that will never be
      allowed express at all.

      ⚠️ `speedKeyFor()`, `speeds[method.id]` নয় — ছাঁচ থেকে, নাম থেকে নয়।
      দেখুন speedKeyFor()-এর নোট: id দিয়ে খুঁজলে live data-য় এই পুরো
      restriction-টাই নিঃশব্দে বন্ধ ছিল।  */
  const key = speedKeyFor(method);
  const gate = key ? speeds[key] : null;
  if (gate && !gate.ok) {
    return {
      ok: false,
      reason: gate.blockedBy
        ? `${gate.blockedBy} can't go this way`
        : "Not available for what's in your cart",
    };
  }

  /*  ⚠️ CHECKED BEFORE THE CLOCK RULES, and that order is deliberate. "Today's
      express window closed at 8 PM" invites the customer back tomorrow morning
      for something that still will not be ready. The truthful reason is the
      making time, so it must be the one printed.

      ⚠️ COURIER IS EXEMPT. It has no date picker either, but it is the ONLY
      way to reach an address outside Dhaka — refusing it and saying "use
      Schedule It" would send a customer to a method their zone does not offer,
      which is a dead end, not an answer. Courier keeps selling; what changes is
      its promise, and `courierWindow` shifts by the same days.  */
  if (leadDays > 0 && !method.datePick && !isCourier(method)) {
    return {
      ok: false,
      reason: `Needs ${leadDays} day${leadDays === 1 ? "" : "s"} to make — use Schedule It`,
    };
  }

  /*  ── DEC-DLV-010 · দিনের জানালা ─────────────────────────────────────────
      live method-এ খোলা-বন্ধের হিসাব **server** করে, ঢাকার ঘড়িতে (`closedNow`
      / `closedReason`)। browser-এর ঘড়ি নয় — দুবাই থেকে উপহার পাঠালে সেটা ছয়
      ঘণ্টা আলাদা।

      ⚠️ এই যাচাই card আঁকার সময় হতো, কিন্তু `methodState()`-এ ছিল না। ফলে
      "Closed for today" লেখা ধূসর card-ও validateStep(4) পার করে দিত।  */
  const live = method as Partial<LiveMethod>;
  if (live.closedNow)
    return { ok: false, reason: live.closedReason ?? "Not available right now" };

  /*  হাতে-লেখা express-এর জানালা। live method-এ এই সংখ্যা delivery module-এ
      বসে (openFromMin / openToMin) আর উপরের `closedNow`-ই তার উত্তর — তাই
      `timing` থাকলে এখানে আর কিছু করার নেই।  */
  if (!method.timing && method.id === "express") {
    if (h < EXPRESS_WINDOW.startHour)
      return { ok: false, reason: `Opens at ${hourLabel(EXPRESS_WINDOW.startHour)}` };
    if (h >= EXPRESS_WINDOW.endHour)
      return {
        ok: false,
        reason: `Today's express window closed at ${hourLabel(EXPRESS_WINDOW.endHour)}`,
      };
    return { ok: true };
  }

  if (isSameDay(method) && !anySlotToday(method, now))
    return { ok: false, reason: "All of today's slots are gone — try Schedule It" };

  return { ok: true };
}

function hourLabel(h: number): string {
  const suffix = h >= 12 ? "PM" : "AM";
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve} ${suffix}`;
}

/* ─────────────────── DATE ─────────────────── */

export interface DateOption {
  /** YYYY-MM-DD */
  id: string;
  day: string;
  date: string;
  label: string;
  isToday: boolean;
  disabled: boolean;
}

/**
 * Method অনুযায়ী তারিখের strip।
 * · midnight — আজকেরটা শুধু সন্ধ্যা ৬টার আগে (MIDNIGHT_CUTOFF_HOUR)
 * · scheduled — আজকেরটা তখনই, যখন আজ একটা slot অন্তত খোলা
 */
export function dateOptions(
  method: DeliveryMethod,
  now = new Date(),
  days = 8,
  /** largest "days to make" in the cart — nothing before today + this */
  leadDays = 0,
): DateOption[] {
  const out: DateOption[] = [];

  /*  ⚠️ THE STRIP GROWS WITH THE LEAD TIME. Eight chips starting today means a
      5-day product would show three usable dates and five dead ones — a strip
      that is mostly grey reads as a broken page rather than a busy workshop.
      Adding the lead days keeps the same number of REAL choices on offer.  */
  const total = days + leadDays;

  for (let i = 0; i < total; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    const isToday = i === 0;

    let disabled = false;
    if (isToday) {
      if (method.midnight) disabled = now.getHours() >= MIDNIGHT_CUTOFF_HOUR;
      else if (method.slots) disabled = !anySlotToday(method, now);
    }
    /*  DEC-PDP-10 — nothing leaves before it exists. Kept as a separate `if`
        rather than folded into the clause above: that one is about today's
        clock, this one is about the workshop, and a future reader must be able
        to change one without touching the other.  */
    if (i < leadDays) disabled = true;

    out.push({
      id: toISODate(d),
      day: d.toLocaleDateString("en-US", { weekday: "short" }),
      date: String(d.getDate()),
      label:
        i === 0
          ? "Tonight"
          : i === 1
            ? "Tomorrow"
            : d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      isToday,
      disabled,
    });
  }

  // midnight ছাড়া বাকিদের জন্য "Tonight" শব্দটা ভুল
  if (!method.midnight && out[0]) out[0].label = "Today";

  return out;
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** "Delivered in 1–3 days" — courier zone-এ তারিখের সীমা */
export function courierWindow(now = new Date(), leadDays = 0): string {
  const fmt = (n: number) => {
    const d = new Date(now);
    /*  Making time is added to BOTH ends, not just the far one. The courier
        still takes 1–3 days; it simply cannot collect a parcel that is not
        made yet, so the whole window slides.  */
    d.setDate(now.getDate() + n + leadDays);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  return `${fmt(COURIER_DAYS.min)} – ${fmt(COURIER_DAYS.max)}`;
}

/* ─────────────────── FEE ───────────────────

   ★ Free-midnight promo (D25)
   promo.ts: ৳3,000-এর উপরে free midnight delivery।
   ছুঁলে midnight-এর **fee + surcharge দুটোই মাফ** (৳60 + ৳200 → FREE)।
   অন্য method-এ কিছু মাফ নয় — offer-এর কথাই "free MIDNIGHT delivery"।
*/

export interface DeliveryQuote {
  methodFeePaisa: number;
  surchargePaisa: number;
  waivedPaisa: number;
  totalPaisa: number;
  grossPaisa: number;
  freeByPromo: boolean;
}

export function quoteDelivery(args: {
  zone: Zone | null;
  methodId: MethodId;
  /** deliverable subtotal — held item বাদ (D21) */
  subtotalPaisa: number;
  /**
   * DEC-DLV-009 — delivery module থেকে আসা আসল সারি।
   *
   * ⚠️ এটা না দিলে নিচে `getMethod()` হাতে-লেখা তালিকায় খোঁজে, আর তখন
   * মালিকের ৳২০০-র বদলে সেই পুরনো ৳৬০ বেরিয়ে আসে। checkout সবসময় এটা
   * পাঠায়; পুরনো caller-দের জন্য fallback রাখা আছে।
   */
  method?: DeliveryMethod;
}): DeliveryQuote {
  /*  ⚠️ `?? METHODS[1]` — খোঁজ ব্যর্থ হলে শূন্য দাম দেখানোর চেয়ে পুরনো
      fallback-ই কম ক্ষতিকর, কারণ checkout সবসময় `method` পাঠায় (উপরের নোট)।
      এটা শুধু seed/demo caller-দের জন্য।  */
  const method = args.method ?? getMethod(args.methodId) ?? METHODS[1];
  const grossPaisa = method.feePaisa + method.surchargePaisa;

  /*
    ⚠️ THE WAIVER USED TO BE DECIDED HERE, AND IT GAVE AWAY ৳1,000 — 3 Aug 2026.

    The rule was: midnight delivery is free once the subtotal passes
    `FREE_DELIVERY_PROMO.thresholdPaisa`, a ৳3,000 constant in `_data/promo.ts`.
    No such offer existed in the shop. On a ৳3,600 cart with Midnight Surprise
    the screen struck out ৳1,000 and showed a total of ৳3,600; the order would
    have been ৳4,600. The whole midnight fee, promised away by a number nobody
    could change and no order would honour.

    A waiver is a Marketing decision (DEC-OFR — FREE_DELIVERY offers), and only
    the offer engine can make it. This function now answers the one question it
    is actually qualified to answer: what does this delivery cost. The waiver,
    if any, arrives with the server's quote and is applied in `checkoutTotals`.
  */
  return {
    methodFeePaisa: method.feePaisa,
    surchargePaisa: method.surchargePaisa,
    waivedPaisa: 0,
    totalPaisa: grossPaisa,
    grossPaisa,
    freeByPromo: false,
  };
}
