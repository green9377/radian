/*  EVERY INVENTED NUMBER IN THE INTELLIGENCE MODULE LIVES IN THIS FILE.

    DEC-INT-006, condition 1. The owner chose to build Forecasting now, on demo
    data, against my recommendation. The objection is recorded in full in
    RADIAN_INTELLIGENCE_MODULE_ARCHITECTURE.md; this file is one of the five
    conditions that make the decision survivable.

    WHY ONE FILE. The Delivery module's problem was never that fixtures existed —
    `/delivery/performance` carried a Demo badge and was honest about itself. The
    problem was that nobody could answer "where is the fake data?" So it sat
    there showing an invented 94 % on-time long after real deliveries began,
    because wiring it up was a thing a person had to REMEMBER.

    So: one file, one import site, and a switch that flips itself
    (`forecastMinDays` in IntelligenceSetting). Deleting this file should break
    the build in exactly one place.

    ⚠️ NOTHING HERE MAY EVER REACH A DECISION. No purchase quantity, no reorder
    level, no price. A demo number that reaches a buying decision is money in a
    bin — and for a flower shop, literally so. The self-test asserts it.
*/

export const DEMO_TAG = 'DEMO';

/** A plausible-looking week, for showing what the screen WILL look like. */
export const DEMO_WEEK_AHEAD: { label: string; revenuePaisa: number; orders: number }[] = [
  { label: 'Sat', revenuePaisa: 4_250_00, orders: 23 },
  { label: 'Sun', revenuePaisa: 3_180_00, orders: 17 },
  { label: 'Mon', revenuePaisa: 2_940_00, orders: 16 },
  { label: 'Tue', revenuePaisa: 3_060_00, orders: 17 },
  { label: 'Wed', revenuePaisa: 3_720_00, orders: 20 },
  { label: 'Thu', revenuePaisa: 5_640_00, orders: 29 },
  { label: 'Fri', revenuePaisa: 6_980_00, orders: 35 },
];

export const DEMO_MONTH_AHEAD = {
  revenuePaisa: 11_40_000_00,
  orders: 618,
  /** what a real forecast would carry: a range, never a single confident number */
  lowPaisa: 9_60_000_00,
  highPaisa: 13_20_000_00,
};

/*  MARKET DEMAND — PERMANENTLY DEMO, AND THAT IS NOT A TEMPORARY STATE.

    The owner asked for market-demand analysis. Radian has no source for it:
    competitor prices, what people are searching for, what is selling elsewhere —
    none of it enters this system, and no module plans to bring it in. Without a
    source this is not analysis, it is well-formatted guessing.

    Unlike the forecast, there is no countdown here, because there is nothing to
    count down to. The screen says so plainly rather than implying it will fill
    in on its own. If a source is ever connected — a search-trends feed, a price
    scraper, a marketplace API — this becomes real; until then it stays labelled.
*/
export const DEMO_MARKET: { label: string; changeBp: number; note: string }[] = [
  { label: 'Roses', changeBp: 1800, note: 'demand rising into Valentine season' },
  { label: 'Cakes', changeBp: 600, note: 'steady, birthday-driven' },
  { label: 'Gift hampers', changeBp: -400, note: 'softening after Eid' },
  { label: 'Same-day delivery', changeBp: 2400, note: 'fastest-growing request' },
];
