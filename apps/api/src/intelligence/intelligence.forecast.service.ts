import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IntelligenceService } from './intelligence.service';
import { DEMO_WEEK_AHEAD, DEMO_MONTH_AHEAD, DEMO_MARKET } from './intelligence.demo';

/*  FORECASTING & MARKET — the fourth sub-module. DEC-INT-006.

    THE OBJECTION, KEPT HERE SO IT TRAVELS WITH THE CODE.

    Forecasting needs history, and Radian's books restart from zero. Worse than
    "not enough data": a flower shop in Bangladesh is violently seasonal.
    Valentine's Day, Pohela Falgun, Mother's Day, wedding season, Eid — a handful
    of days outsell whole months. A model trained on six months has never seen a
    single peak; a model trained on February would recommend buying at
    Valentine's volume all year. `ItemExpiryLot` exists because flowers rot, so
    an over-forecast is not an embarrassing number on a screen, it is money in a
    bin.

    The owner heard that twice and decided to build it anyway, with demo data.
    That is his business and his call. These are the five conditions that make
    the decision survivable — all five are implemented, and the self-test proves
    the ones that can be proved.

      1. every invented number lives in intelligence.demo.ts — one file
      2. provenance travels WITH the figure: the API says REAL or DEMO, never
         the screen. A screen that decides what is real can be told to lie.
      3. THE SWITCH IS AUTOMATIC. No human has to remember anything. This is the
         condition that matters; the other four are hygiene. `/delivery/
         performance` showed an invented 94 % for weeks precisely because
         "wire it up later" was a person's job.
      4. the Demo badge is at the top of the screen, not the bottom
      5. a DEMO figure never reaches a recommendation, and market analysis stays
         DEMO permanently because no source for it exists

    EACH PROJECTION DECLARES ITS OWN DATA REQUIREMENT, rather than one global
    threshold. "Next week" needs four weeks of weekdays; "next month" needs a
    full year, because without one it has never seen a single festival. So the
    screen can be honestly real about the near term while still refusing the
    far term — which is the true state of things, and one number could not say
    it.
*/

const BD_OFFSET_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 3600 * 1000;

export type Provenance = 'REAL' | 'DEMO';

export interface Projection {
  key: string;
  label: string;
  horizon: string;
  source: Provenance;
  /** how it was worked out — in words, so the reader can disbelieve it */
  method: string;
  /** days of history this projection needs before it can be real */
  needsDays: number;
  haveDays: number;
  /** a forecast is a RANGE. A single confident number is the lie. */
  lowPaisa: number;
  midPaisa: number;
  highPaisa: number;
  points: { label: string; value: number }[];
}

export interface ForecastResult {
  /** how much history exists, and what each projection still wants */
  readiness: {
    daysRecorded: number;
    firstDay: string | null;
    weekReady: boolean;
    monthReady: boolean;
    daysUntilMonthReady: number;
  };
  projections: Projection[];
  market: {
    source: Provenance;
    /** true = this will not become real by waiting; there is no source at all */
    permanent: boolean;
    note: string;
    items: { label: string; changeBp: number; note: string }[];
  };
  /** DEC-INT-006 condition 5 — nothing here may drive a purchase */
  recommendations: never[];
  recommendationNote: string;
}

/** four weeks of the same weekday is the least that can see a weekly rhythm */
const WEEK_NEEDS_DAYS = 28;
/** a full year, because without one the model has never seen a single festival */
const MONTH_NEEDS_DAYS = 365;

@Injectable()
export class IntelligenceForecastService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly intelligence: IntelligenceService,
  ) {}

  async forecast(): Promise<ForecastResult> {
    const cfg = await this.intelligence.settings();
    const monthNeeds = cfg.forecastMinDays > 0 ? cfg.forecastMinDays : MONTH_NEEDS_DAYS;

    /*  A day that exists but is empty is not history. Ninety back-filled rows of
        zero teach a model nothing, and counting them would flip the switch on a
        shop that has never sold anything — the exact failure this design is
        built to avoid. So only days with ACTIVITY count. */
    const [withActivity, firstRow] = await Promise.all([
      this.prisma.db.dailySnapshot.findMany({
        where: { OR: [{ revenuePaisa: { gt: 0 } }, { ordersCount: { gt: 0 } }] },
        orderBy: { onDate: 'asc' },
        select: { onDate: true, revenuePaisa: true, ordersCount: true },
      }),
      this.prisma.db.dailySnapshot.findFirst({ orderBy: { onDate: 'asc' }, select: { onDate: true } }),
    ]);

    const haveDays = withActivity.length;
    const weekReady = haveDays >= WEEK_NEEDS_DAYS;
    const monthReady = haveDays >= monthNeeds;

    return {
      readiness: {
        daysRecorded: haveDays,
        firstDay: firstRow?.onDate.toISOString().slice(0, 10) ?? null,
        weekReady,
        monthReady,
        daysUntilMonthReady: Math.max(0, monthNeeds - haveDays),
      },
      projections: [
        weekReady ? this.realWeek(withActivity) : this.demoWeek(haveDays),
        monthReady ? this.realMonth(withActivity, monthNeeds) : this.demoMonth(haveDays, monthNeeds),
      ],
      market: {
        source: 'DEMO',
        permanent: true,
        note:
          'Radian has no source for market demand — no competitor prices, no search trends, ' +
          'no marketplace feed. These figures are invented to show the shape of the screen. ' +
          'Unlike the forecast above, waiting will not make them real: there is nothing to ' +
          'count down to. Connect a source and this becomes real; until then it stays labelled.',
        items: DEMO_MARKET,
      },
      /*  DEC-INT-006 condition 5, enforced by there being nothing to enforce:
          this module issues no recommendations at all while any input is DEMO,
          and it has no path to a purchase order in any case. */
      recommendations: [],
      recommendationNote:
        monthReady
          ? 'Buying suggestions are still not made here. Forecasting informs a decision; it does not take one.'
          : 'No buying suggestion is made from a demo figure. An over-forecast on flowers is money in a bin.',
    };
  }

  /* ==================== the real ones ==================== */

  /*  NEXT SEVEN DAYS — a weekday-aware average, and nothing cleverer.

      For each of the next seven days, take the same weekday from the last four
      weeks and average it. A flower shop's week is not flat — Thursday and
      Friday carry it — and a plain seven-day mean would smear that away.

      Deliberately simple: with a few months of data, a method the owner can
      check by hand beats one he has to trust. The range is the observed spread,
      not a statistical interval, and it is labelled as such. */
  private realWeek(rows: { onDate: Date; revenuePaisa: number }[]): Projection {
    const recent = rows.slice(-WEEK_NEEDS_DAYS);
    const byWeekday = new Map<number, number[]>();
    for (const r of recent) {
      const wd = new Date(r.onDate.getTime() + BD_OFFSET_MS).getUTCDay();
      byWeekday.set(wd, [...(byWeekday.get(wd) ?? []), r.revenuePaisa]);
    }

    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const points: { label: string; value: number }[] = [];
    let mid = 0;
    let low = 0;
    let high = 0;

    const today = new Date();
    for (let i = 1; i <= 7; i++) {
      const d = new Date(today.getTime() + i * DAY_MS);
      const wd = new Date(d.getTime() + BD_OFFSET_MS).getUTCDay();
      const seen = byWeekday.get(wd) ?? [];
      const avg = seen.length > 0 ? Math.round(seen.reduce((a, b) => a + b, 0) / seen.length) : 0;
      points.push({ label: names[wd], value: avg });
      mid += avg;
      low += seen.length > 0 ? Math.min(...seen) : 0;
      high += seen.length > 0 ? Math.max(...seen) : 0;
    }

    return {
      key: 'week', label: 'Next seven days', horizon: '7 days',
      source: 'REAL',
      method: `Each weekday averaged over the last ${WEEK_NEEDS_DAYS} days. The range is the best and worst that weekday actually did — not a statistical interval.`,
      needsDays: WEEK_NEEDS_DAYS, haveDays: rows.length,
      lowPaisa: low, midPaisa: mid, highPaisa: high,
      points,
    };
  }

  /*  NEXT MONTH — last year's same month, moved by this year's trend.

      This is the projection that needs a full year, and the reason is the whole
      argument of DEC-INT-006: without last year's Valentine's Day, a model has
      no idea February exists. With it, the simplest honest method is to take
      what that month actually did and adjust it by how this year is running
      against last year so far. */
  private realMonth(rows: { onDate: Date; revenuePaisa: number }[], needs: number): Projection {
    const now = new Date();
    const bd = new Date(now.getTime() + BD_OFFSET_MS);
    const targetMonth = (bd.getUTCMonth() + 1) % 12;
    const lastYear = bd.getUTCFullYear() - (targetMonth === bd.getUTCMonth() + 1 ? 0 : 1);

    const sameMonthLastYear = rows.filter((r) => {
      const d = new Date(r.onDate.getTime() + BD_OFFSET_MS);
      return d.getUTCMonth() === targetMonth && d.getUTCFullYear() === lastYear;
    });
    const base = sameMonthLastYear.reduce((n, r) => n + r.revenuePaisa, 0);

    // how this year is running against the same stretch last year
    const cutoff = new Date(now.getTime() - 90 * DAY_MS);
    const recent = rows.filter((r) => r.onDate >= cutoff).reduce((n, r) => n + r.revenuePaisa, 0);
    const priorFrom = new Date(cutoff.getTime() - 365 * DAY_MS);
    const priorTo = new Date(now.getTime() - 365 * DAY_MS);
    const prior = rows
      .filter((r) => r.onDate >= priorFrom && r.onDate <= priorTo)
      .reduce((n, r) => n + r.revenuePaisa, 0);
    const trend = prior > 0 ? recent / prior : 1;

    const mid = Math.round(base * trend);
    return {
      key: 'month', label: 'Next month', horizon: '1 month',
      source: 'REAL',
      method: `The same month last year (${(base / 100).toFixed(0)} taka), moved by how the last 90 days compare with the same 90 days a year ago (×${trend.toFixed(2)}).`,
      needsDays: needs, haveDays: rows.length,
      /* ±25 %, stated as a guess about the guess rather than dressed up as
         statistics. A single number would be the lie. */
      lowPaisa: Math.round(mid * 0.75), midPaisa: mid, highPaisa: Math.round(mid * 1.25),
      points: [],
    };
  }

  /* ==================== the demo ones ==================== */

  private demoWeek(have: number): Projection {
    return {
      key: 'week', label: 'Next seven days', horizon: '7 days',
      source: 'DEMO',
      method: `Invented. A real weekly projection needs ${WEEK_NEEDS_DAYS} days of trading; there are ${have}. This becomes real by itself — nobody has to change anything.`,
      needsDays: WEEK_NEEDS_DAYS, haveDays: have,
      lowPaisa: Math.round(DEMO_WEEK_AHEAD.reduce((n, d) => n + d.revenuePaisa, 0) * 0.8),
      midPaisa: DEMO_WEEK_AHEAD.reduce((n, d) => n + d.revenuePaisa, 0),
      highPaisa: Math.round(DEMO_WEEK_AHEAD.reduce((n, d) => n + d.revenuePaisa, 0) * 1.2),
      points: DEMO_WEEK_AHEAD.map((d) => ({ label: d.label, value: d.revenuePaisa })),
    };
  }

  private demoMonth(have: number, needs: number): Projection {
    return {
      key: 'month', label: 'Next month', horizon: '1 month',
      source: 'DEMO',
      method: `Invented. A monthly projection needs a full year (${needs} days) — without one it has never seen a Valentine's Day, a Pohela Falgun or an Eid, and a flower shop's year is mostly those. ${have} days recorded so far.`,
      needsDays: needs, haveDays: have,
      lowPaisa: DEMO_MONTH_AHEAD.lowPaisa,
      midPaisa: DEMO_MONTH_AHEAD.revenuePaisa,
      highPaisa: DEMO_MONTH_AHEAD.highPaisa,
      points: [],
    };
  }
}
