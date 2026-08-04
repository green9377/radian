/*
  Order.promisedBy — turning the delivery promise into something comparable to a clock.

  WHY THIS FILE EXISTS (30 Jul 2026 — closes DEC-INT-003(a), open since 29 Jul)

  `/delivery/performance` showed "On-time 94 %" from a fixture for weeks. The real
  computation was built on 29 July (`delivery-analytics.service.ts`) and has been
  reporting *"no delivery has a promised time yet"* ever since — which was correct, and
  useless. `Order.promisedBy` was added by the migration and then **nothing ever wrote
  to it**: it was read in six places and written in none.

  The reason it could not be computed is worth stating, because it is the whole problem:
  `DeliveryAssignment.deliveredAt` is a real `DateTime`, but what was PROMISED survives
  only as `Order.date` (a String) and `Order.slotLabel` (a String, "10:00–13:00") —
  **text meant to be read, not compared to a clock.**

  THREE DECISIONS, each of which could silently corrupt the number if taken differently:

  1. THE END OF THE WINDOW, not the start. A "10 AM – 1 PM" parcel handed over at 12:59
     was on time. Taking the start would report most of a good day as late.

  2. BANGLADESH TIME, explicitly. `deliveredAt` is stored UTC and the container runs
     UTC. Building the promise from local date parts without the offset would put it
     six hours out — and six hours is wider than most slots, so **every late delivery
     would have been reported as on time**. A wrong number that flatters you is the
     worst kind. The offset constant matches the one `delivery-analytics.service.ts`
     already uses (and finance-drift, and intelligence): producer and consumer have to
     agree or the comparison is meaningless.

  3. UNPARSEABLE ⇒ null, never a guess. A slot label is free text an admin can rename.
     If it cannot be read, the order stays UNMEASURABLE, which the analytics already
     reports honestly and counts out loud. Guessing "end of day" would quietly turn
     every unreadable label into a passing grade.

  Old orders keep `promisedBy = null` for ever and are reported as unmeasurable, never
  as on-time and never as late.
*/

/** matches delivery-analytics.service.ts, finance-drift.service.ts, intelligence */
const BD_OFFSET_MS = 6 * 60 * 60 * 1000;

/**
 * Minutes past midnight for the LAST moment the promise covers, or null.
 *
 * Handles the shapes actually in the data and the seeds:
 *   "10:00–13:00"     → 780   (en dash)
 *   "10:00-13:00"     → 780   (hyphen)
 *   "10 AM – 1 PM"    → 780
 *   "3 PM – 6 PM"     → 1080
 *   "6 PM to 9 PM"    → 1260
 *   "12:00 AM sharp"  → 0     (midnight delivery — a Radian business priority)
 *   "Same day"        → null  (no time in it; unmeasurable, and honest about it)
 */
export function slotEndMinutes(slotLabel?: string | null): number | null {
  if (!slotLabel) return null;
  const s = slotLabel.toLowerCase();

  // every time-looking token, with its optional am/pm
  const re = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/g;
  const found: { h: number; m: number; ap?: 'am' | 'pm' }[] = [];
  for (const m of s.matchAll(re)) {
    const h = parseInt(m[1], 10);
    const min = m[2] ? parseInt(m[2], 10) : 0;
    const ap = m[3] as 'am' | 'pm' | undefined;
    // a bare number with no colon and no am/pm is not a time ("Slot 2", "within 2 days")
    if (!m[2] && !ap) continue;
    if (h > 23 || min > 59) continue;
    found.push({ h, m: min, ap });
  }
  if (!found.length) return null;

  /* An am/pm on the LAST token applies backwards to a bare first one when the label
     writes it once — "10 – 1 PM". Only the last token is used for the promise, so this
     matters only for deciding whether the last token itself is 24h or 12h. */
  const last = found[found.length - 1];
  let hour = last.h;
  if (last.ap === 'pm') hour = last.h === 12 ? 12 : last.h + 12;
  else if (last.ap === 'am') hour = last.h === 12 ? 0 : last.h;
  // no am/pm at all ⇒ the label is 24h ("10:00–13:00"), so `hour` stands as written

  return hour * 60 + last.m;
}

/** "2026-07-30" / an ISO string → that calendar day in Bangladesh, or null */
function bdDayStartUtcMs(date?: string | null): number | null {
  if (!date) return null;
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(date.trim());
  if (ymd) {
    const [, y, mo, d] = ymd;
    // midnight in Dhaka is 18:00 UTC the previous day
    return Date.UTC(+y, +mo - 1, +d) - BD_OFFSET_MS;
  }
  const parsed = Date.parse(date);
  if (Number.isNaN(parsed)) return null;
  // reduce whatever it parsed to the Bangladesh calendar day it falls on
  const bd = new Date(parsed + BD_OFFSET_MS);
  return Date.UTC(bd.getUTCFullYear(), bd.getUTCMonth(), bd.getUTCDate()) - BD_OFFSET_MS;
}

/**
 * DEC-INT-003 — the promise, frozen at order creation.
 *
 * Returns null whenever either half is unreadable. The caller must store the null:
 * "we never promised a time" and "we promised and cannot tell" are the same thing for
 * reporting, and both are honestly UNMEASURABLE. They are NOT the same as "on time".
 */
export function resolvePromisedBy(
  date?: string | null,
  slotLabel?: string | null,
): Date | null {
  const dayStart = bdDayStartUtcMs(date);
  if (dayStart === null) return null;
  const minutes = slotEndMinutes(slotLabel);
  if (minutes === null) return null;
  return new Date(dayStart + minutes * 60_000);
}
