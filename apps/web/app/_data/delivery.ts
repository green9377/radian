import type { Zone } from "../_store/useZoneStore";
import type { IconName } from "./productDetails";
import { promisePhrase } from "./deliveryClaims";
import type { DeliveryOption, DeliveryOptionSlot, DeliveryTiming } from "./shop";

/*
  ═══════════════════════════════════════════════════════════════════
  DELIVERY MODULE config — an Operations rule, static for now.

  ★ Four methods (Inside Dhaka)      ★ One (All Bangladesh)
  · Express          — no slot, today; how many hours comes from the admin's
                       promiseMinutes
  · Same Day         — today + time slot
  · Midnight         — no slot, 12 AM; ordered until 6 PM for tonight
  · Scheduled        — any day + time slot
  · Nationwide Courier — 1–3 days, no slot

  ★ Slot = capacity-driven (locked, 14 July — sobuj)
  An order can be taken right **up until** the slot starts — there is no lead
  time. It closes for two reasons only: (1) the time has passed, (2) capacity
  is full. Capacity will be set from the admin panel — `booked` below is a mock
  for now.

  ⇄ SWAP HERE — once Operations is locked, METHODS/SLOTS/capacity all come from
  the API. No number is written inside a component, only here (D23/D24).
  ═══════════════════════════════════════════════════════════════════
*/

/* ─────────────────── METHOD ─────────────────── */

export type MethodId = "express" | "sameday" | "midnight" | "scheduled" | "courier";

export interface DeliveryMethod {
  id: MethodId;
  /**
   * DEC-DLV-009 — which **shape** of delivery this is. On a live method it
   * comes from the delivery module; it is absent from the hand-written
   * `METHODS` below (there the `id` is the shape).
   *
   * ⚠️ Every behaviour rule is now written against this, not against `id`.
   * `id` is now the database row id (cuid) — matching `id === "express"` means
   * never matching on live data, and behaving wrongly in silence.
   */
  timing?: DeliveryTiming;
  /**
   * For `FROM_CONFIRM`, how many minutes are promised — 180 = 3 hours.
   *
   * ⚠️ No number like "2 hours" may be written on screen; every one of them
   * has to be built from this field. When the owner changes the type's time in
   * the admin, the sentence in checkout changes with it.
   */
  promiseMinutes?: number | null;
  label: string;
  sub: string;
  icon: IconName;
  feePaisa: number;
  /** midnight's extra charge (a promo may waive it — D25) */
  surchargePaisa: number;
  zone: Zone;
  /** whether a time slot is needed */
  slots: boolean;
  /** whether a date can be picked */
  datePick: boolean;
  /** today only */
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
   LIVE — the menu coming from the delivery module · DEC-DLV-009 / DEC-DLV-010

   Owner, 1 Aug 2026: *"whatever is edited or changed in the delivery module
   should work automatically across the whole system — frontend, product upload
   page, and everywhere else it is needed."*

   ⚠️ The `METHODS` list above is now **a shape sample only** — there to say
   which fields are required. Checkout no longer reads it. It said ৳60 while
   the owner's module said ৳200 — one thing with two prices in two places. Now
   there is one.

   Behaviour from the shape, not from the name — that is the whole point of
   this work.
─────────────────────────────────────────────────────────────────────────── */
export interface LiveMethod extends DeliveryMethod {
  /** id of the name in the delivery module — this is what a product is tied to */
  typeId: string | null;
  timing: DeliveryTiming;
  promiseMinutes: number | null;
  /** whether it is outside today's window at this moment */
  closedNow: boolean;
  closedReason: string | null;
  liveSlots: DeliverySlot[];
}

/**
 * The API's answer → the shape the screen knows.
 *
 * ⚠️ `datePick` / `slots` / `todayOnly` — all three come from `timing`, not
 * from guessing at the name. If the owner creates a new type called "3 Hours",
 * it behaves correctly by itself, because he already chose its shape.
 */
export function toLiveMethods(opts: DeliveryOption[]): LiveMethod[] {
  return opts.map((o, i) => {
    const t = o.timing;
    return {
      /*  ⚠️ `rateId`, not `typeId` — the same name can carry two prices in two
          areas, and what the screen is showing is what gets picked.  */
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
      /*  ⚠️ Always 0. There is no separate "surcharge" in the delivery module —
          a delivery has one price. The old midnight ৳60+৳200 split was
          something the web app invented for itself.  */
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
        /*  The old shape had `startHour`; it is built from minutes. When it is
            zero the slot is treated as open all day.  */
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
 * ⚠️ When the end time is smaller than the start, the slot has crossed
 * midnight — which is exactly what Midnight Surprise does (1410 → 30).
 * Subtracting the two gives a negative answer, so this only builds text and
 * never compares.
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
 * Looks in the hand-written list — **`null` when not found**.
 *
 * ⚠️ It used to silently return `METHODS[1]` (Same Day) on a miss. After
 * DEC-DLV-009 the `id` is a database row id, so every lookup in checkout
 * failed and everyone got "Same Day, ৳60": validation asked for the wrong
 * slot, the receipt carried the wrong name, the ETA was wrong. One fallback
 * was lying in five places.
 *
 * Now not found means not found. Anyone holding the live list searches there;
 * this remains only for old seed/demo data.
 */
export function getMethod(id: MethodId): DeliveryMethod | null {
  return METHODS.find((m) => m.id === id) ?? null;
}

export function defaultMethod(zone: Zone | null): MethodId {
  return zone === "bangladesh" ? "courier" : "sameday";
}

/* ─────────────────── KNOW THE SHAPE · NOT THE NAME ───────────────────
   A live method's `id` is a cuid, so behaviour cannot be decided by matching
   names. When `timing` is present that is the truth; when it is absent (the
   hand-written METHODS) the old `id` is the shape.
*/

const shape = (m: DeliveryMethod, live: DeliveryTiming, legacy: MethodId) =>
  m.timing ? m.timing === live : m.id === legacy;

/** the 2-hour kind — counted from confirmation, no slot */
export const isExpress = (m: DeliveryMethod) => shape(m, "FROM_CONFIRM", "express");
/** today + slot */
export const isSameDay = (m: DeliveryMethod) => shape(m, "TODAY_SLOT", "sameday");
/** nationwide courier — counted in days, no date to pick */
export const isCourier = (m: DeliveryMethod) => shape(m, "LEAD_DAYS", "courier");

/**
 * Which of the cart's speed flags blocks this method.
 *
 * ⚠️ It used to say `speeds[method.id]`. A live id is a cuid while the keys of
 * `CartSpeeds` are "express" | "sameday" | "midnight" — so it never matched,
 * and **a product's delivery restriction did nothing at all in checkout**. A
 * cake that cannot travel at midnight was sold for midnight anyway.
 *
 * `null` = this shape is never blocked (Schedule It and courier — the last
 * resort, everything can land there).
 */
export function speedKeyFor(m: DeliveryMethod): keyof CartSpeeds | null {
  if (isExpress(m)) return "express";
  if (isSameDay(m)) return "sameday";
  if (m.midnight) return "midnight";
  return null;
}

/**
 * This method's own slots. From the delivery module when live, otherwise the
 * old three.
 *
 * ⚠️ The one place in all of checkout that looks a slot up. `getSlot()` always
 * searched the hand-written `SLOTS`, so picking a live slot returned `null`
 * and validation said "That slot is gone" — the order could never be placed.
 */
export function slotsOf(m: DeliveryMethod): DeliverySlot[] {
  return "liveSlots" in m ? (m as LiveMethod).liveSlots : SLOTS;
}

export function findSlot(m: DeliveryMethod, id: string | null): DeliverySlot | null {
  if (!id) return null;
  return slotsOf(m).find((s) => s.id === id) ?? null;
}

/** The cart's "From ৳60" — derived from METHODS, never a separate number (D24) */
export const DELIVERY_FROM_PAISA: Record<"dhaka" | "bangladesh", number> = {
  dhaka: Math.min(...METHODS.filter((m) => m.zone === "dhaka").map((m) => m.feePaisa)),
  bangladesh: Math.min(
    ...METHODS.filter((m) => m.zone === "bangladesh").map((m) => m.feePaisa),
  ),
};

/* ─────────────────── CUT-OFF (Operations, locked 14 July) ─────────────────── */

/** Express can only be ordered inside this window */
export const EXPRESS_WINDOW = { startHour: 10, endHour: 17 }; // 10 AM – 5 PM

/** last order for tonight's midnight */
export const MIDNIGHT_CUTOFF_HOUR = 18; // 6 PM

export const COURIER_DAYS = { min: 1, max: 3 };

/* ─────────────────── SLOT + CAPACITY ─────────────────── */

export interface DeliverySlot {
  id: string;
  label: string;
  /** slot start on a 24-hour clock — orders are taken right up to this */
  startHour: number;
  /** from the admin panel — how many orders this slot can take */
  capacity: number;
  /** ⇄ SWAP HERE — a mock for now; the real booking count when the API lands */
  booked: number;
  /**
   * DEC-DLV-010 — how many minutes are left to order into this slot today.
   * Computed on the server in Dhaka time; ≤0 means it is over for today.
   * `null` = no closing time is set.
   *
   * ⚠️ Not the browser's clock. Someone sending a gift from abroad has a clock
   * six hours from Dhaka's — this used to be worked out from `startHour`, and
   * ordering from Dubai showed the wrong slots as open.
   */
  minutesLeft?: number | null;
}

export const SLOTS: DeliverySlot[] = [
  { id: "morning", label: "10 AM – 1 PM", startHour: 10, capacity: 40, booked: 12 },
  { id: "afternoon", label: "3 PM – 6 PM", startHour: 15, capacity: 40, booked: 40 }, // full — demo
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
 * Whether this slot can still be taken.
 * · today — not once the slot has started (no lead time, sobuj 14 July)
 * · not once capacity is full; the next one is shown instead
 */
export function slotState(
  slot: DeliverySlot,
  isToday: boolean,
  now = new Date(),
): SlotState {
  /*  DEC-DLV-010 — if the server worked it out in Dhaka time and sent it, that
      is the truth. The browser's clock is used only when nothing else is
      known.  */
  if (isToday && typeof slot.minutesLeft === "number")
    return slot.minutesLeft <= 0 ? { ok: false, reason: "passed" } : okOrFull(slot);
  if (isToday && slot.minutesLeft === null && slot.startHour === 0) return okOrFull(slot);
  if (isToday && now.getHours() >= slot.startHour) return { ok: false, reason: "passed" };
  return okOrFull(slot);
}

function okOrFull(slot: DeliverySlot): SlotState {
  /*  capacity 0 means "no limit was set", not "it is full" — which is exactly
      what happens when the field is left empty in the admin. Treating zero as
      full would show every new slot as closed the moment it was born.  */
  if (slot.capacity > 0 && slotLeft(slot) <= 0) return { ok: false, reason: "full" };
  return { ok: true, left: slot.capacity > 0 ? slotLeft(slot) : 999 };
}

/**
 * Whether this method has even one slot open today — Same Day's condition.
 *
 * ⚠️ Looks at the method's **own** slots. It always looked at the hand-written
 * `SLOTS`, so the slots the owner created in the admin had no bearing at all
 * on checkout's "all slots are gone" message.
 */
export function anySlotToday(m: DeliveryMethod, now = new Date()): boolean {
  return slotsOf(m).some((s) => slotState(s, true, now).ok);
}

/* ─────────────────── METHOD AVAILABILITY ───────────────────
   A closed card is not hidden — it is greyed out with the **reason** written
   on it. Hide it and the customer concludes Radian does not do midnight at
   all, and nobody ever learns why sales fell.
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
export function cartLeadDays(
  items: {
    leadTimeDays?: number | null;
    /*  DEC-PDP-09 — a PRE_ORDER line carries the day the shop expects to have
        it. Same idea as a lead time, only written as a date instead of a
        number of days.  */
    availability?: { state: string; backOn?: string | null } | null;
  }[],
  now = new Date(),
): number {
  /*  ⚠️ PRE-ORDER USED TO BE INVISIBLE HERE (owner, 23 Aug 2026). The product
      page said "we start sending these from 5 Sep", and then checkout offered
      TODAY, because only `leadTimeDays` reached this function. A shop that
      promises a date on one screen and takes an order for tomorrow on the next
      has already broken the promise before anybody packs anything.

      A pre-order date is just another floor under the same door, so it is
      turned into days-from-today and folded into the very same number every
      date chip, method rule and final check already obeys. Nothing else in
      checkout had to learn a new idea.

      The largest wins, not the sum — the owner's rule of 1 August: one
      address, one journey, the slowest thing sets the pace.  */
  const midnightToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return items.reduce((max, i) => {
    const lead = i.leadTimeDays ?? 0;
    let waitDays = 0;
    const backOn = i.availability?.state === "PRE_ORDER" ? i.availability.backOn : null;
    if (backOn) {
      const d = new Date(backOn);
      if (!Number.isNaN(d.getTime())) {
        const target = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        waitDays = Math.max(0, Math.round((target - midnightToday) / 86400000));
      }
    }
    return Math.max(max, lead, waitDays);
  }, 0);
}

/* ─────────────────── WHAT SPEEDS THIS BASKET CAN TAKE ───────────────────
   Owner's ruling, 1 Aug 2026, asked and answered in his own words (translated):
   *"however many products are in the cart, the rule that ALL of the products
   have wins"*.

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

      ⚠️ `speedKeyFor()`, not `speeds[method.id]` — from the shape, not from
      the name. See the note on speedKeyFor(): looking up by id meant this
      entire restriction was silently off on live data.  */
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

  /*  ── DEC-DLV-010 · the day's window ──────────────────────────────────────
      On a live method the **server** decides open or closed, on Dhaka's clock
      (`closedNow` / `closedReason`). Not the browser's clock — a gift sent
      from Dubai is six hours away from it.

      ⚠️ This check ran while drawing the card but was missing from
      `methodState()`. So a greyed-out card reading "Closed for today" still
      passed validateStep(4).  */
  const live = method as Partial<LiveMethod>;
  if (live.closedNow)
    return { ok: false, reason: live.closedReason ?? "Not available right now" };

  /*  The hand-written express window. On a live method these numbers are set
      in the delivery module (openFromMin / openToMin) and `closedNow` above is
      the answer — so when `timing` is present there is nothing to do here.  */
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
 * The date strip, per method.
 * · midnight — today only before 6 PM (MIDNIGHT_CUTOFF_HOUR)
 * · scheduled — today only while at least one slot is still open
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

  // "Tonight" is the wrong word for everything except midnight
  if (!method.midnight && out[0]) out[0].label = "Today";

  return out;
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** "Delivered in 1–3 days" — the date range in the courier zone */
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
   promo.ts: free midnight delivery above ৳3,000.
   Once reached, **both midnight's fee and its surcharge are waived**
   (৳60 + ৳200 → FREE). Nothing is waived on any other method — the offer's own
   words are "free MIDNIGHT delivery".
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
  /** deliverable subtotal — held items excluded (D21) */
  subtotalPaisa: number;
  /**
   * DEC-DLV-009 — the real row from the delivery module.
   *
   * ⚠️ Without this, `getMethod()` below searches the hand-written list and
   * the old ৳60 comes out instead of the owner's ৳200. Checkout always sends
   * it; the fallback is kept for older callers.
   */
  method?: DeliveryMethod;
}): DeliveryQuote {
  /*  ⚠️ `?? METHODS[1]` — on a failed lookup the old fallback does less damage
      than showing a price of zero, because checkout always sends `method` (see
      the note above). This is for seed/demo callers only.  */
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
