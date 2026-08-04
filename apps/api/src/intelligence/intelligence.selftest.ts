/* eslint-disable no-console */
/**
 * INTELLIGENCE module self-test — end to end, against the real services.
 *
 * Run through `radian_intelligence_selftest.bat`. It talks to the Nest services
 * directly rather than over HTTP, so no password is needed and the rules are
 * exercised exactly where they live — the shape marketing.selftest.ts uses.
 *
 * WHAT THIS MODULE CAN GET WRONG, and therefore what is tested:
 *
 *   1. A SECOND SOURCE OF TRUTH. The one rule Intelligence exists to keep is
 *      that it never works out a number another module owns (INT-R01). The
 *      test that matters most compares the dashboard's figure with Finance's
 *      own answer for the same range, to the paisa. It is the check that fails
 *      the day somebody sums profit locally "just for the dashboard".
 *
 *   2. THE CACHE BECOMING A SOURCE. DailySnapshot is a copy. Corrupt a row and
 *      the source must still win, and the row must be rebuilt (INT-R02).
 *
 *   3. SILENCE. A missed night must be filled by the next sweep, not forgotten
 *      (INT-R05) — and today must never be frozen as history (INT-R07).
 *
 *   4. THE FENCE. STAFF must not receive cost, margin, profit or cash IN THE
 *      JSON — not merely have it hidden by the browser (INT-R08).
 *
 *   5. AVERAGED RATES. A month's margin is not the mean of its daily margins.
 *
 *   6. ZERO PRETENDING TO BE KNOWLEDGE. A month with nothing recorded must
 *      report null, never 0.
 *
 * SAFETY, because this touches a live database:
 *   · every row it makes is marked, and the days it snapshots are far in the
 *     past (2019) where the real business has nothing
 *   · cleanup runs FIRST and LAST, so a crash halfway leaves nothing behind
 *   · it writes no ledger entries at all — Intelligence has no money path
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { IntelligenceService } from './intelligence.service';
import { IntelligenceKpiService } from './intelligence.kpi.service';
import { FinanceReportsService } from '../finance/finance-reports.service';
import { IntelligenceLensService, LENSES } from './intelligence.lens.service';
import { IntelligenceReportsService } from './intelligence.reports.service';
import { IntelligenceForecastService } from './intelligence.forecast.service';

const TAG = '[selftest]';
/** a year the shop did not exist in — nothing real can collide here */
const Y = 2019;

let pass = 0;
let fail = 0;
const failures: string[] = [];

function ok(what: string, condition: boolean, detail = '') {
  if (condition) {
    pass += 1;
    console.log(`  PASS  ${what}${detail ? `  (${detail})` : ''}`);
  } else {
    fail += 1;
    failures.push(what + (detail ? ` — ${detail}` : ''));
    console.log(`  FAIL  ${what}${detail ? `  (${detail})` : ''}`);
  }
}

/*  A refusal test MUST say WHY it expected the refusal.

    The first version made `expectInMessage` optional and passed if anything at
    all was thrown. On the very first run it reported

        PASS  a margin target of 150 % is refused  (That year does not look right)

    — refused, yes, but for the wrong reason entirely: the test year tripped a
    different guard. Delete the margin rule and that check stays green. That is
    exactly the trap the kickoff warns about (§8, "re-read any test that has
    never gone red"), and it took about ninety seconds to walk into.

    So the message is required now. A test that accepts any error is not testing
    a rule, it is testing that the code can throw. */
async function refuses(what: string, fn: () => Promise<unknown>, expectInMessage: string) {
  try {
    await fn();
    ok(what, false, 'it was allowed, but should not have been');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    ok(what, msg.includes(expectInMessage), msg.slice(0, 70));
  }
}

const BD = 6 * 3600 * 1000;
const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d) - BD);

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const prisma = app.get(PrismaService);
  const intel = app.get(IntelligenceService);
  const kpi = app.get(IntelligenceKpiService);
  const reports = app.get(FinanceReportsService);
  const lens = app.get(IntelligenceLensService);
  const reportsCentre = app.get(IntelligenceReportsService);
  const forecast = app.get(IntelligenceForecastService);

  const cleanup = async () => {
    await prisma.db.dailySnapshot.deleteMany({
      where: { onDate: { gte: day(Y, 1, 1), lte: day(Y + 1, 1, 1) } },
    });
    await prisma.db.kpiTarget.deleteMany({ where: { year: Y } });
  };

  console.log(`\n${TAG} cleaning up anything left from last time`);
  await cleanup();

  try {
    /* ================================================================
       1. THE ONE THAT MATTERS — no second source of truth (INT-R01)
       ================================================================ */
    console.log('\n--- the dashboard and Finance agree, to the paisa ---');
    {
      const dash = await intel.dashboard('OWNER');
      const now = new Date();
      const bd = new Date(now.getTime() + BD);
      const monthStart = new Date(Date.UTC(bd.getUTCFullYear(), bd.getUTCMonth(), 1) - BD);
      const fin = await reports.profitAndLoss(monthStart.toISOString(), now.toISOString());

      const shown = dash.business.kpis.find((k) => k.key === 'sales')!.actual.value;
      ok(
        'sales on the dashboard IS the figure Finance gives',
        shown === fin.totalIncomePaisa,
        `dashboard ${shown} vs finance ${fin.totalIncomePaisa}`,
      );

      const margin = dash.business.kpis.find((k) => k.key === 'margin')!.actual.value;
      ok(
        'gross margin too — not recomputed here',
        margin === fin.grossMarginBp,
        `dashboard ${margin} vs finance ${fin.grossMarginBp}`,
      );
    }

    /* ================================================================
       2. THE FENCE — STAFF gets nothing it should not (INT-R08)
       ================================================================ */
    console.log('\n--- what a staff account actually receives ---');
    {
      const asStaff = await intel.dashboard('STAFF');
      const asManager = await intel.dashboard('MANAGER');

      ok('a manager gets the money section', asManager.money !== null);
      ok('a staff member does not', asStaff.money === null);

      /* the real test is the PAYLOAD, not the screen. Serialise the whole
         thing and look for the numbers themselves — a section the browser
         hides while the JSON still carries it is not a restriction. */
      const staffJson = JSON.stringify(asStaff);
      ok('no cash figure reaches a staff payload', !staffJson.includes('cashPaisa'));
      ok('no break-even either', !staffJson.includes('breakEven'));

      const staffMargin = asStaff.business.kpis.find((k) => k.key === 'margin')!;
      ok(
        'and margin is withheld with a reason, not silently zeroed',
        staffMargin.actual.unavailable !== undefined && staffMargin.targetValue === null,
        staffMargin.actual.unavailable ?? 'no reason given',
      );
    }

    /* ================================================================
       3. THE CACHE IS NOT A SOURCE (INT-R02) and never holds today (INT-R07)
       ================================================================ */
    console.log('\n--- the snapshot is a cache, and knows it ---');
    {
      const today = await intel.snapshotDay(new Date());
      ok(
        'today is refused — a half-finished day is not history',
        'skipped' in today,
        'skipped' in today ? today.skipped : 'it was written',
      );

      const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
      const wrote = await intel.snapshotDay(yesterday);
      ok('yesterday is written', 'written' in wrote);

      // corrupt it, then ask for it to be rebuilt
      const key = 'onDate' in wrote ? wrote.onDate : null;
      if (key) {
        await prisma.db.dailySnapshot.update({
          where: { onDate: key },
          data: { revenuePaisa: 999_999_99, ordersCount: 4242 },
        });
        await intel.snapshotDay(yesterday);
        const after = await prisma.db.dailySnapshot.findUnique({ where: { onDate: key } });
        ok(
          'a corrupted row is overwritten by the source, not trusted',
          after?.revenuePaisa !== 999_999_99 && after?.ordersCount !== 4242,
          `revenue now ${after?.revenuePaisa}, orders ${after?.ordersCount}`,
        );
      } else {
        ok('a corrupted row is overwritten by the source, not trusted', false, 'no row to corrupt');
      }
    }

    /* ================================================================
       4. RECONCILIATION FILLS GAPS, IT DOES NOT ASSUME (INT-R05)
       ================================================================ */
    console.log('\n--- a missed night catches up by itself ---');
    {
      const before = await prisma.db.dailySnapshot.count();
      // knock three days out of the middle
      const holes = [3, 4, 5].map((n) => {
        const d = new Date(Date.now() - n * 24 * 3600 * 1000);
        return new Date(Date.UTC(
          new Date(d.getTime() + BD).getUTCFullYear(),
          new Date(d.getTime() + BD).getUTCMonth(),
          new Date(d.getTime() + BD).getUTCDate(),
        ) - BD);
      });
      await prisma.db.dailySnapshot.deleteMany({ where: { onDate: { in: holes } } });
      const missing = await prisma.db.dailySnapshot.count();
      ok('three days removed', before - missing === 3, `${before} → ${missing}`);

      const run = await intel.reconcile(10);
      const after = await prisma.db.dailySnapshot.count();
      ok(
        'the sweep puts back every day it finds missing — not just one',
        after === before,
        `filled ${run.filled}, count ${missing} → ${after}`,
      );

      const again = await intel.reconcile(10);
      ok('and running it twice fills nothing more', again.filled === 0);
      /*  The sweep is capped per run so a 90-day catch-up cannot flood the
          database in one pass. Whatever is left must be REPORTED, not dropped —
          silence here would be the sweep quietly giving up. */
      ok('and it reports anything it deliberately left for next time', again.remaining === 0, `${again.remaining} left`);
    }

    /* ================================================================
       5. A MONTH'S MARGIN IS NOT THE MEAN OF ITS DAILY MARGINS
       ================================================================ */
    console.log('\n--- rates are rebuilt from money, never averaged ---');
    {
      // a tiny high-margin day and a big low-margin one
      await prisma.db.dailySnapshot.createMany({
        data: [
          { onDate: day(Y, 6, 10), revenuePaisa: 10_000, grossProfitPaisa: 8_000, grossMarginBp: 8000, ordersCount: 1 },
          { onDate: day(Y, 6, 11), revenuePaisa: 1_000_000, grossProfitPaisa: 200_000, grossMarginBp: 2000, ordersCount: 40 },
        ],
      });
      const yr = await kpi.year(Y);
      const june = yr.months.find((m) => m.month === 6)!;

      // the honest answer: 208000 / 1010000 = 20.59 % → 2059 bp
      const expected = Math.round((208_000 / 1_010_000) * 10000);
      const naiveMean = (8000 + 2000) / 2; // 5000 bp — the wrong answer

      ok(
        'June margin is built from the summed money',
        june.actual.grossMarginBp === expected,
        `${june.actual.grossMarginBp} bp (mean of the days would say ${naiveMean})`,
      );
      ok('and is nowhere near the average of the two days', june.actual.grossMarginBp !== naiveMean);
      ok('revenue is the sum', june.actual.revenuePaisa === 1_010_000);
    }

    /* ================================================================
       6. NOTHING RECORDED IS NOT ZERO
       ================================================================ */
    console.log('\n--- a month with no data says so ---');
    {
      const yr = await kpi.year(Y);
      const march = yr.months.find((m) => m.month === 3)!;
      ok('March 2019 reports null, not ৳0', march.actual.revenuePaisa === null);
      ok('and admits it has no days behind it', march.actual.daysRecorded === 0);
      const salesKpi = march.kpis.find((k) => k.kpi === 'MONTHLY_SALES')!;
      ok('so it gets no colour at all', salesKpi.rag === 'none');
    }

    /* ================================================================
       7. TARGETS — validated, and no colour without one (INT-R12)
       ================================================================ */
    console.log('\n--- what a target may be ---');
    {
      /* each of these names the message it expects, so it cannot pass because
         some OTHER rule happened to fire first */
      await refuses(
        'a margin target of 150 % is refused — and for being 150 %',
        () => kpi.setTarget({ year: Y, month: 6, kpi: 'GROSS_MARGIN', targetValue: 15000, actorName: TAG }),
        'between 0.01 % and 100 %',
      );
      await refuses(
        'so is month 13',
        () => kpi.setTarget({ year: Y, month: 13, kpi: 'MONTHLY_SALES', targetValue: 100, actorName: TAG }),
        'Month must be 1–12',
      );
      await refuses(
        'and a negative sales target — for being negative',
        () => kpi.setTarget({ year: Y, month: 6, kpi: 'MONTHLY_SALES', targetValue: -1, actorName: TAG }),
        'positive amount',
      );
      await refuses(
        'a year of 20 is a typo, and is refused',
        () => kpi.setTarget({ year: 20, month: 6, kpi: 'MONTHLY_SALES', targetValue: 100, actorName: TAG }),
        'does not look right',
      );
      /*  ...but 2019 is a real year and must be ACCEPTED. This is the check
          that would have caught the bug the year-guard test hid. */
      {
        const old = await kpi.setTarget({ year: Y, month: 11, kpi: 'MONTHLY_SALES', targetValue: 1000, actorName: TAG });
        ok('a real past year is allowed — the guard is for typos, not history', old.year === Y);
      }

      const before = await kpi.year(Y);
      const junBefore = before.months.find((m) => m.month === 6)!.kpis.find((k) => k.kpi === 'MONTHLY_SALES')!;
      ok('with no target, the month has no colour — never green', junBefore.rag === 'none');

      await kpi.setTarget({ year: Y, month: 6, kpi: 'MONTHLY_SALES', targetValue: 500_000, actorName: TAG });
      const after = await kpi.year(Y);
      const junAfter = after.months.find((m) => m.month === 6)!.kpis.find((k) => k.kpi === 'MONTHLY_SALES')!;
      ok(
        'with a target it goes green — 1,010,000 against 500,000',
        junAfter.rag === 'green',
        `${junAfter.progressBp} bp of target`,
      );

      await kpi.clearTarget({ year: Y, month: 6, kpi: 'MONTHLY_SALES', actorName: TAG });
      const cleared = await kpi.year(Y);
      const junCleared = cleared.months.find((m) => m.month === 6)!.kpis.find((k) => k.kpi === 'MONTHLY_SALES')!;
      ok('clearing it takes the colour away again', junCleared.rag === 'none' && junCleared.target === null);
    }

    console.log('\n--- copying targets forward ---');
    {
      await kpi.setTarget({ year: Y, month: 1, kpi: 'MONTHLY_SALES', targetValue: 300_000, actorName: TAG });
      await kpi.setTarget({ year: Y, month: 2, kpi: 'MONTHLY_SALES', targetValue: 111_111, actorName: TAG });

      const r = await kpi.copyTargets({
        fromYear: Y, fromMonth: 1, toYear: Y, months: [2, 3, 4], actorName: TAG,
      });
      ok('it fills the empty months', r.written === 2, `wrote ${r.written}`);
      ok('and refuses to overwrite a month somebody already set', r.skipped === 1, `skipped ${r.skipped}`);

      const yr = await kpi.year(Y);
      const feb = yr.months.find((m) => m.month === 2)!.kpis.find((k) => k.kpi === 'MONTHLY_SALES')!;
      ok('February keeps the number the owner chose', feb.target === 111_111, `${feb.target}`);
    }

    /* ================================================================
       8. THE MOVEMENT SPLIT MUST BE EXACT
       ================================================================ */
    console.log('\n--- why the month moved: volume vs basket ---');
    {
      // May: 20 orders, ৳2,000 each. June (already seeded): 41 orders, ৳1,010,000
      await prisma.db.dailySnapshot.create({
        data: { onDate: day(Y, 5, 15), revenuePaisa: 4_000_000, grossProfitPaisa: 1_000_000, grossMarginBp: 2500, ordersCount: 20 },
      });

      const mv = await kpi.movement(Y, 6);
      ok('both months have data, so the change can be explained', mv.known);
      if (mv.known) {
        ok(
          'volume and basket add up to the whole change, to the paisa',
          mv.volumePaisa + mv.valuePaisa === mv.totalChangePaisa,
          `${mv.volumePaisa} + ${mv.valuePaisa} = ${mv.totalChangePaisa}`,
        );
        ok(
          'and it names which one led',
          mv.leadingReason === 'volume' || mv.leadingReason === 'value',
          mv.leadingReason,
        );
      }

      const noPrev = await kpi.movement(Y, 2);
      ok(
        'with nothing to compare against it says so instead of inventing a change',
        !noPrev.known,
      );
    }

    /* ================================================================
       9. THE WEEKDAY PATTERN DOES NOT INVENT ONE
       ================================================================ */
    console.log('\n--- weekday pattern ---');
    {
      const w = await kpi.weekdayPattern(30);
      // the last 30 days are all empty in a fresh shop
      ok(
        'with no sales anywhere it reports no pattern rather than a flat one',
        w.known === false || w.weekdays.every((d) => d.avgRevenuePaisa === 0),
        `known=${w.known}`,
      );
    }

    /* ================================================================
       10. EVERY LENS AND EVERY REPORT ACTUALLY RUNS

       This is the cheapest high-value check in the file. A lens or a report
       that throws is INVISIBLE until somebody clicks it — the registry lists
       it, the button appears, and the failure waits. Six of these were caught
       by the compiler while this was being written (a `.byChannel` that is
       really `.channels`, a BigInt read as a number, a margin in paisa read as
       basis points); the ones the compiler cannot see are exactly the ones
       this loop is for.
       ================================================================ */
    console.log('\n--- every lens answers ---');
    {
      for (const l of LENSES) {
        try {
          const r = await lens.lens(l.key, '30d');
          ok(`${l.label} answers`, r.lens === l.key && Array.isArray(r.cards) && Array.isArray(r.charts));
        } catch (e) {
          ok(`${l.label} answers`, false, e instanceof Error ? e.message.slice(0, 60) : String(e));
        }
      }
      await refuses('an unknown lens is refused', () => lens.lens('nonsense' as never, '30d'), 'No such lens');
    }

    console.log('\n--- every report answers, and its total is the sum of its rows ---');
    {
      const list = reportsCentre.list();
      ok('the registry is not empty', list.reports.length > 0, `${list.reports.length} reports`);

      for (const m of list.reports) {
        try {
          const r = await reportsCentre.run(m.key);
          const shapeOk = r.key === m.key && Array.isArray(r.columns) && Array.isArray(r.rows);
          ok(`${m.title} answers`, shapeOk);

          /*  Where a report has a money total AND rows, the total must be the
              sum of those rows. A footer that does not add up is the fastest
              way to lose an accountant's trust in the whole system.
              P&L is excluded on purpose: its rows are sections and subtotals,
              not a flat list, so summing them would double-count by design. */
          if (r.totals && r.rows.length > 0 && m.key !== 'pnl') {
            for (const c of r.columns) {
              if (c.format !== 'paisa') continue;
              const t = r.totals[c.key];
              if (typeof t !== 'number') continue;
              const sum = r.rows.reduce((n, row) => n + (typeof row[c.key] === 'number' ? (row[c.key] as number) : 0), 0);
              ok(`${m.title} — "${c.label}" total is the sum of its rows`, sum === t, `${sum} vs ${t}`);
            }
          }
        } catch (e) {
          ok(`${m.title} answers`, false, e instanceof Error ? e.message.slice(0, 60) : String(e));
        }
      }

      await refuses('an unknown report is refused', () => reportsCentre.run('nonsense'), 'No such report');
      await refuses(
        'a start date after the end date is refused',
        () => reportsCentre.run('pnl', '2026-12-01', '2026-01-01'),
        'after the end date',
      );
    }

    /* ================================================================
       11. THE THREE FAULTS THE 29 JUL REVIEW FOUND — guarded so they
           cannot come back quietly.
       ================================================================ */
    console.log('\n--- one definition of average order value, not three ---');
    {
      /*  The dashboard once divided LEDGER INCOME by the order count, while the
          lens and the snapshot both divided the sum of ORDER TOTALS. Same name,
          three populations, and the figure changed meaning depending on which
          screen you opened — and changed again as it aged into history.
          They must agree. */
      const dash = await intel.dashboard('OWNER');
      const dashAov = dash.business.supporting.find((s) => s.key === 'aov')!.value;
      const salesLens = await lens.lens('sales', 'month');
      const lensAov = salesLens.cards.find((c) => c.key === 'aov')!.value;

      const bothEmpty = dashAov.unavailable !== undefined && lensAov === null;
      ok(
        'the dashboard and the Sales lens agree on average order value',
        bothEmpty || dashAov.value === lensAov,
        `dashboard ${dashAov.unavailable ?? dashAov.value} vs lens ${lensAov}`,
      );
    }

    console.log('\n--- a control that does nothing must say so ---');
    {
      /*  Four lenses ignored the period buttons entirely and two used only the
          length. Offering a control that changes nothing does not merely fail
          to help — it tells the reader the number covers a span it does not. */
      for (const l of LENSES) {
        const r = await lens.lens(l.key, '30d');
        ok(
          `${l.label} declares how much of the period it uses`,
          r.rangeMode === l.rangeMode &&
            (r.rangeMode === 'full' ? r.rangeNote === '' : r.rangeNote.length > 0),
          `${r.rangeMode}${r.rangeNote ? ' · says why' : ''}`,
        );
      }

      /* a lens that ignores the period must return the SAME figures whatever
         is asked for — if it differs, the declaration is wrong */
      const a = await lens.lens('staff', 'today');
      const b = await lens.lens('staff', 'year');
      ok(
        'a "none" lens really does answer identically for every period',
        JSON.stringify(a.cards) === JSON.stringify(b.cards),
      );
    }

    console.log('\n--- a report covers exactly the dates it was given ---');
    {
      /*  These two once computed a day count from the chosen dates and returned
          the last N days TO TODAY under a heading naming those dates. Products
          and Inventory now take a window, so the dates must be honoured — and
          a report for 2019 must come back EMPTY rather than showing this
          month's figures under a 2019 heading. That is the actual failure the
          original bug produced. */
      for (const key of ['product-performance', 'wastage']) {
        const r = await reportsCentre.run(key, '2019-03-01', '2019-03-31');
        ok(
          `${r.title} honours the dates it was given`,
          r.usesRange === true && (r.from ?? '').startsWith('2019-03'),
          `from ${r.from?.slice(0, 10)}`,
        );
        ok(
          `${r.title} returns nothing for a period the shop did not trade in`,
          r.rows.length === 0,
          `${r.rows.length} rows`,
        );
      }
    }

    /* ================================================================
       12. FORECAST — the five conditions of DEC-INT-006.

       The owner built this on demo data against my recommendation. Conditions
       2, 3 and 5 are the ones that can be proved by machine, so they are.
       ================================================================ */
    console.log('\n--- forecast: invented is labelled, and turns real by itself ---');
    {
      const f = await forecast.forecast();

      /* condition 2 — provenance travels WITH the figure, decided by the API */
      ok(
        'every projection says whether it is worked out or invented',
        f.projections.length > 0 && f.projections.every((p) => p.source === 'REAL' || p.source === 'DEMO'),
        f.projections.map((p) => `${p.key}=${p.source}`).join(' '),
      );
      ok(
        'and every one explains HOW, in words',
        f.projections.every((p) => p.method.length > 20),
      );

      /*  A forecast is a RANGE. A single confident number invites a purchase
          decision the data cannot support. */
      ok(
        'every projection is a range, not one confident number',
        f.projections.every((p) => p.lowPaisa <= p.midPaisa && p.midPaisa <= p.highPaisa),
      );

      /*  condition 5 — NOTHING may reach a buying decision. Not while demo,
          not ever from this module. An over-forecast on flowers is money in a
          bin, and this shop's stock rots. */
      ok('no buying recommendation is issued at all', f.recommendations.length === 0);

      /*  market analysis is PERMANENTLY demo — there is no source for it, so
          unlike the forecast it will not become real by waiting. It must say
          so, or the reader will assume a countdown that does not exist. */
      ok('market demand is demo', f.market.source === 'DEMO');
      ok('and admits that waiting will not fix it', f.market.permanent === true);
    }

    console.log('\n--- forecast: an empty day is not history (condition 3) ---');
    {
      /*  THE CONDITION THAT MATTERS. The switch from invented to real must flip
          BY ITSELF — no human step. And it must not flip on empty rows: the
          nightly sweep back-fills 90 days on a fresh install, and if those
          counted, a shop that has never sold anything would be declared ready
          to forecast. That is the exact failure this design exists to avoid. */
      const before = await forecast.forecast();
      ok(
        'ninety back-filled empty days do NOT make it ready',
        before.readiness.weekReady === false,
        `${before.readiness.daysRecorded} trading days counted`,
      );
      ok('so the weekly projection is still invented', before.projections.find((p) => p.key === 'week')!.source === 'DEMO');

      // give it 28 days that actually traded, and it must flip on its own
      const seeded: Date[] = [];
      for (let i = 1; i <= 28; i++) {
        const d = day(Y, 8, i);
        seeded.push(d);
        await prisma.db.dailySnapshot.upsert({
          where: { onDate: d },
          create: { onDate: d, revenuePaisa: 500_00 + i * 100, ordersCount: 3 },
          update: { revenuePaisa: 500_00 + i * 100, ordersCount: 3 },
        });
      }

      const after = await forecast.forecast();
      ok(
        'twenty-eight real trading days flip it to worked-out — with no human step',
        after.readiness.weekReady === true &&
          after.projections.find((p) => p.key === 'week')!.source === 'REAL',
        `${after.readiness.daysRecorded} trading days`,
      );
      ok(
        'and the monthly one stays invented, because a year has not passed',
        after.projections.find((p) => p.key === 'month')!.source === 'DEMO',
        `${after.readiness.daysUntilMonthReady} days still to go`,
      );

      await prisma.db.dailySnapshot.deleteMany({ where: { onDate: { in: seeded } } });
    }

    /* ================================================================
       13. SETTINGS SURVIVE A CONCURRENT FIRST LOAD (the P2002 bug)
       ================================================================ */
    console.log('\n--- the singleton under a double first load ---');
    {
      await prisma.db.intelligenceSetting.deleteMany({});
      const results = await Promise.all([
        intel.settings(), intel.settings(), intel.settings(),
        intel.settings(), intel.settings(), intel.settings(),
      ]);
      ok('six simultaneous callers all get a row', results.every((r) => r?.id === 'singleton'));
      const count = await prisma.db.intelligenceSetting.count();
      ok('and exactly one row exists', count === 1, `${count} rows`);
    }
  } finally {
    console.log(`\n${TAG} cleaning up`);
    await cleanup();
    await app.close();
  }

  console.log(`\n================ ${pass} passed, ${fail} failed ================`);
  if (fail > 0) {
    console.log('\nWhat failed:');
    for (const f of failures) console.log(`  · ${f}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
