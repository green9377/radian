/**
 * The shop's day.
 *
 * Radian trades in Dhaka (UTC+6) on servers that do not. Anything that means
 * "today", "this day's takings" or "that date's window" has to say which day it
 * means in the SHOP's clock, or the answer moves with the container's timezone.
 *
 * P7-4 (31 Aug 2026) — the till was the one place that did not: `analyticsToday`
 * used `setHours(0,0,0,0)`, so in production its day ran 6 AM to 6 AM and a
 * midnight sale landed on the day before. Four files already carried their own
 * copy of this arithmetic; new code takes it from here.
 */

export const BD_OFFSET_MS = 6 * 60 * 60 * 1000;
export const DAY_MS = 86_400_000;

/** the start of that moment's Bangladesh day, in epoch ms */
export function startOfBdDay(d: Date): number {
  return Math.floor((d.getTime() + BD_OFFSET_MS) / DAY_MS) * DAY_MS - BD_OFFSET_MS;
}

/** the last moment of that date's Bangladesh day */
export function endOfBdDay(d: Date): number {
  return startOfBdDay(d) + DAY_MS - 1;
}
