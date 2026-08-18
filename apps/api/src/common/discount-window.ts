/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  THE DISCOUNT WINDOW — DEC-PRD-028
 *
 *  The owner's instruction, 3 Aug 2026:
 *
 *  > "amra jodi nirdisto product a kono offer chalai like discount, tar
 *  >  timing dewar jayga nei — start date and end date. ja frontend and
 *  >  admin panel akoi sathe dekhabe ar kaj korbe."
 *  > ("if we run an offer like a discount on a particular product, there is
 *  >  nowhere to set its timing — start date and end date. Which the frontend
 *  >  and admin panel should show and honour together.")
 *
 *  ⚠️ Why this file exists
 *
 *  The discount arithmetic was written out separately in **six places** —
 *  storefront grid, product page, admin margin, order, POS, offers. The day
 *  the date rule was added, that is what it exposed: the discount stopped on
 *  the page, kept running in the grid, and the order line still carried the
 *  old price. A customer saw ৳2,160 on one page and paid ৳2,400 on another.
 *
 *  So the rule now lives in **one place**. If a price has to be worked out
 *  somewhere new, call it from here — do not write it out by hand again.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface DiscountWindow {
  /** `null`/`undefined` = starts now */
  discountStartsAt?: Date | null;
  /** `null`/`undefined` = no end */
  discountEndsAt?: Date | null;
}

/**
 * Whether the discount is running at this moment.
 *
 * ⚠️ The end date is **inclusive**. If the owner writes "until 10 August", the
 * 10th is a discounted day too — he would have called a price jumping up at
 * midday a bug, and he would have been right. So the end date is taken as
 * 23:59:59 of that day.
 *
 * ⚠️ Bangladesh time (UTC+6). Even when the server runs in UTC, the day is the
 * shop's day.
 */
export function discountLive(w: DiscountWindow, at: Date = new Date()): boolean {
  const now = at.getTime();
  const s = windowStartMs(w.discountStartsAt);
  const e = windowEndMs(w.discountEndsAt);
  if (s !== null && s > now) return false;
  if (e !== null && e < now) return false;
  return true;
}

/**
 * DEC-PRD-042 (10 Aug 2026) — the owner now wants to set a time as well.
 *
 * The earlier rule always took the whole day: start = 00:00 of that day, end =
 * 23:59:59. So there was no way to say "ends at 9 PM" — a time was thrown away
 * even when sent.
 *
 * Now: **if the owner gives a time, that time**; if not, the old behaviour —
 * the start of the start day, the end of the end day. His 3 August ruling
 * ("until the 10th includes the 10th") therefore stands untouched, and a
 * midnight offer is now possible.
 *
 * ⚠️ How "a time was given" is detected — whether it is midnight in Bangladesh
 * time. On a date-only value the admin sends exactly 00:00:00 BD; with a time
 * set it sends something else. The one second just above the boundary (ending
 * at 12 AM) is therefore treated as the end of the day — which is what the
 * owner means by it.
 */
function windowStartMs(d?: Date | null): number | null {
  if (!d) return null;
  return hasTimeOfDay(d) ? d.getTime() : startOfBdDay(d);
}
function windowEndMs(d?: Date | null): number | null {
  if (!d) return null;
  return hasTimeOfDay(d) ? d.getTime() : endOfBdDay(d);
}
function hasTimeOfDay(d: Date): boolean {
  return (d.getTime() + BD_OFFSET_MS) % DAY_MS !== 0;
}

/** the moment this discount stops, in epoch ms — `null` = no end (storefront countdown) */
export function discountEndsMs(w: DiscountWindow): number | null {
  return windowEndMs(w.discountEndsAt);
}
/** the moment it starts, in epoch ms — `null` = already running */
export function discountStartsMs(w: DiscountWindow): number | null {
  return windowStartMs(w.discountStartsAt);
}

const BD_OFFSET_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

/** the start of that date's Bangladesh day, in epoch ms */
function startOfBdDay(d: Date): number {
  return Math.floor((d.getTime() + BD_OFFSET_MS) / DAY_MS) * DAY_MS - BD_OFFSET_MS;
}
/** the last moment of that date's Bangladesh day */
function endOfBdDay(d: Date): number {
  return startOfBdDay(d) + DAY_MS - 1;
}

/**
 * What the customer pays.
 *
 * ⚠️ PERCENT is in basis points: 1000 = 10%. FLAT is in paisa.
 * ⚠️ Outside the window the discount value is **not erased** — it simply does
 *    not apply. Extend the date and it runs again; nothing has to be retyped.
 */
export function paidPaisa(
  p: {
    sellingPricePaisa: number;
    discountType: 'NONE' | 'FLAT' | 'PERCENT' | string;
    discountValue: number;
  } & DiscountWindow,
): number {
  if (!discountLive(p)) return p.sellingPricePaisa;
  if (p.discountType === 'FLAT') return Math.max(0, p.sellingPricePaisa - p.discountValue);
  if (p.discountType === 'PERCENT')
    return Math.max(0, Math.round(p.sellingPricePaisa * (1 - p.discountValue / 10000)));
  return p.sellingPricePaisa;
}
