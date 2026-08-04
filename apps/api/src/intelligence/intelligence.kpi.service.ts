import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { FinanceReportsService } from '../finance/finance-reports.service';
import { IntelligenceService } from './intelligence.service';

/*  ANALYTICS & KPIs — the third sub-module.
    RADIAN_INTELLIGENCE_MODULE_ARCHITECTURE.md, DEC-INT-003.

    The dashboard answers "what is happening". This answers **"why"**, and
    "where against the target".

    TWO ARITHMETIC TRAPS LIVE IN THIS FILE, and both produce numbers that look
    perfectly reasonable while being wrong:

    1. A MONTH'S MARGIN IS NOT THE AVERAGE OF ITS DAILY MARGINS.
       A day with ৳100 of sales at 80 % and a day with ৳10,000 at 20 % do not
       make a 50 % month — they make a 20.6 % month. Rates must be rebuilt from
       the summed money, never averaged. Same for on-time: sum the counts, then
       divide once.

    2. "NO DATA" IS NOT "ZERO".
       A month before the shop was recording anything must say it does not know.
       Reporting ৳0 for it would put a fake trough on every chart and make this
       year look like growth that never happened. Every figure here carries how
       many days it was built from, and says so when that is none.
*/

const BD_OFFSET_MS = 6 * 60 * 60 * 1000;

export type KpiName = 'MONTHLY_SALES' | 'GROSS_MARGIN' | 'ON_TIME_DELIVERY';
const KPI_NAMES: KpiName[] = ['MONTHLY_SALES', 'GROSS_MARGIN', 'ON_TIME_DELIVERY'];

/*  What a target value MEANS depends on the KPI, so validation does too.
    Money is paisa and has no ceiling; a rate is basis points and cannot exceed
    100 %. Without this an owner typing "95" for margin sets a target of 0.95 %
    and the screen turns green for ever. */
const LIMITS: Record<KpiName, { unit: 'paisa' | 'bp'; min: number; max: number; label: string }> = {
  MONTHLY_SALES: { unit: 'paisa', min: 1, max: 100_000_000_00, label: 'Monthly sales' },
  GROSS_MARGIN: { unit: 'bp', min: 1, max: 10_000, label: 'Gross margin' },
  ON_TIME_DELIVERY: { unit: 'bp', min: 1, max: 10_000, label: 'On-time delivery' },
};

const ENTITY = 'KpiTarget';

/*  Exported because the controller's inferred return type mentions it, and a
    type a public method returns must be nameable from outside (TS4053).
    Caught by radian_check_and_restart.bat — twice now this script has stopped a
    broken build reaching the running API, which is more than any review did. */
export interface MonthActual {
  revenuePaisa: number | null;
  grossMarginBp: number | null;
  onTimeBp: number | null;
  ordersCount: number | null;
  daysRecorded: number;
  isCurrentMonth: boolean;
}

@Injectable()
export class IntelligenceKpiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly reports: FinanceReportsService,
    private readonly intelligence: IntelligenceService,
  ) {}

  /* ==================== targets ==================== */

  /** OWNER only (enforced on the route). Validated here, because a target that
      means the wrong thing is worse than no target at all. */
  async setTarget(input: {
    year: number;
    month: number;
    kpi: KpiName;
    targetValue: number;
    note?: string;
    actorName: string;
  }) {
    const { year, month, kpi, targetValue, note, actorName } = input;

    if (!KPI_NAMES.includes(kpi)) throw new BadRequestException(`Unknown KPI: ${kpi}`);
    if (!Number.isInteger(month) || month < 1 || month > 12)
      throw new BadRequestException('Month must be 1–12');
    /*  2000–2100, matching the controller. The first draft said `year < 2020`,
        which quietly made it impossible to record a target against anything
        earlier — and the self-test caught it by being refused for a reason it
        was not testing. The guard is only here to catch a typed `20` or
        `202600`; it was never meant to have an opinion about history. */
    if (!Number.isInteger(year) || year < 2000 || year > 2100)
      throw new BadRequestException('That year does not look right');

    const lim = LIMITS[kpi];
    if (!Number.isInteger(targetValue))
      throw new BadRequestException(`${lim.label} must be a whole number`);
    if (targetValue < lim.min || targetValue > lim.max)
      throw new BadRequestException(
        lim.unit === 'bp'
          ? `${lim.label} must be between 0.01 % and 100 %`
          : `${lim.label} must be a positive amount`,
      );

    const saved = await this.prisma.db.kpiTarget.upsert({
      where: { year_month_kpi: { year, month, kpi } },
      create: { year, month, kpi, targetValue, note },
      // deletedAt: null — setting a target again brings back one that was cleared
      update: { targetValue, note, deletedAt: null },
    });

    await this.audit.record({
      entityType: ENTITY,
      entityId: saved.id,
      action: 'UPDATE',
      actorName,
      changes: { year, month, kpi, targetValue, unit: lim.unit },
    });
    return saved;
  }

  /** Soft-delete — the row keeps its history, the month goes back to no colour
      at all (INT-R12). Never a hard delete (constitution). */
  async clearTarget(input: { year: number; month: number; kpi: KpiName; actorName: string }) {
    const { year, month, kpi, actorName } = input;
    const row = await this.prisma.db.kpiTarget.findFirst({
      where: { year, month, kpi },
    });
    if (!row) return { cleared: false as const };
    await this.prisma.db.kpiTarget.update({
      where: { id: row.id },
      data: { deletedAt: new Date() },
    });
    await this.audit.record({
      entityType: ENTITY,
      entityId: row.id,
      action: 'DELETE',
      actorName,
      changes: { year, month, kpi },
    });
    return { cleared: true as const };
  }

  /*  Copy a month's targets forward. The owner sets January once and then wants
      the other eleven; typing 33 numbers by hand is how a KPI screen stops
      being used in week two. Existing targets are NOT overwritten — filling in
      the blanks is helpful, silently rewriting a number somebody chose is not. */
  async copyTargets(input: {
    fromYear: number;
    fromMonth: number;
    toYear: number;
    months: number[];
    actorName: string;
  }) {
    const { fromYear, fromMonth, toYear, months, actorName } = input;
    const source = await this.prisma.db.kpiTarget.findMany({
      where: { year: fromYear, month: fromMonth },
    });
    if (source.length === 0)
      throw new BadRequestException('That month has no targets to copy');

    const written: string[] = [];
    const skipped: string[] = [];
    for (const month of months) {
      if (!Number.isInteger(month) || month < 1 || month > 12) continue;
      if (toYear === fromYear && month === fromMonth) continue;
      for (const s of source) {
        const exists = await this.prisma.db.kpiTarget.findFirst({
          where: { year: toYear, month, kpi: s.kpi },
        });
        if (exists) {
          skipped.push(`${month}/${s.kpi}`);
          continue;
        }
        await this.setTarget({
          year: toYear,
          month,
          kpi: s.kpi as KpiName,
          targetValue: s.targetValue,
          note: `copied from ${fromMonth}/${fromYear}`,
          actorName,
        });
        written.push(`${month}/${s.kpi}`);
      }
    }
    return { written: written.length, skipped: skipped.length, skippedKeys: skipped };
  }

  /* ==================== the year, month by month ==================== */

  /*  Twelve rows: what was aimed at, what happened, and how far apart they are.
      This is the whole "where against the target" half of the sub-module. */
  async year(y: number) {
    const now = new Date();
    const bdNow = new Date(now.getTime() + BD_OFFSET_MS);
    const curYear = bdNow.getUTCFullYear();
    const curMonth = bdNow.getUTCMonth() + 1;

    const [targets, bands] = await Promise.all([
      this.prisma.db.kpiTarget.findMany({ where: { year: y } }),
      this.intelligence.settings(),
    ]);

    const targetFor = (month: number, kpi: KpiName) =>
      targets.find((t) => t.month === month && t.kpi === kpi)?.targetValue ?? null;

    /*  Annotated on purpose. `const months = []` infers `never[]`, and every
        push then fails to compile — caught by radian_check_and_restart.bat,
        which refused to restart the API rather than take a broken build live.
        Exactly what that gate is for. */
    const months: {
      month: number;
      inFuture: boolean;
      actual: MonthActual;
      kpis: {
        kpi: KpiName;
        unit: 'paisa' | 'bp';
        target: number | null;
        actual: number | null;
        progressBp: number | null;
        rag: 'none' | 'green' | 'amber' | 'red';
      }[];
    }[] = [];

    for (let m = 1; m <= 12; m++) {
      const inFuture = y > curYear || (y === curYear && m > curMonth);
      const actual: MonthActual = inFuture
        ? { revenuePaisa: null, grossMarginBp: null, onTimeBp: null, ordersCount: null, daysRecorded: 0, isCurrentMonth: false }
        : await this.monthActual(y, m, y === curYear && m === curMonth);

      months.push({
        month: m,
        inFuture,
        actual,
        kpis: KPI_NAMES.map((kpi) => {
          const target = targetFor(m, kpi);
          const value =
            kpi === 'MONTHLY_SALES' ? actual.revenuePaisa
            : kpi === 'GROSS_MARGIN' ? actual.grossMarginBp
            : actual.onTimeBp;
          const progressBp =
            target && target > 0 && value !== null ? Math.round((value / target) * 10000) : null;
          return {
            kpi,
            unit: LIMITS[kpi].unit,
            target,
            actual: value,
            progressBp,
            rag: this.rag(progressBp, bands.amberAtBp, bands.redBelowBp),
          };
        }),
      });
    }

    return { year: y, currentMonth: y === curYear ? curMonth : null, months, bands };
  }

  /*  INT-R12 — no target means NO colour. Never green by default: a target
      nobody set is not a target that was met. And a month with no data gets no
      colour either, for the same reason in reverse. */
  private rag(progressBp: number | null, amberAt: number, redBelow: number) {
    if (progressBp === null) return 'none' as const;
    if (progressBp >= amberAt) return 'green' as const;
    if (progressBp >= redBelow) return 'amber' as const;
    return 'red' as const;
  }

  /*  One month's actuals.

      Past months come from DailySnapshot — the cache exists precisely so this
      is not recomputed on every page load (DEC-INT-002). The CURRENT month is
      asked of Finance live, because today is not in the snapshot yet
      (INT-R07) and a month missing its own latest days would read low.  */
  private async monthActual(year: number, month: number, isCurrent: boolean): Promise<MonthActual> {
    const start = new Date(Date.UTC(year, month - 1, 1) - BD_OFFSET_MS);
    const end = new Date(Date.UTC(year, month, 1) - BD_OFFSET_MS - 1);

    if (isCurrent) {
      const [pnl, orders, onTime] = await Promise.all([
        this.reports.profitAndLoss(start.toISOString(), new Date().toISOString()),
        this.prisma.db.order.count({
          where: { createdAt: { gte: start, lte: new Date() }, salesStatus: { not: 'cancelled' } },
        }),
        this.onTimeFor(start, new Date()),
      ]);
      return {
        revenuePaisa: pnl.totalIncomePaisa,
        grossMarginBp: pnl.grossMarginBp,
        onTimeBp: onTime,
        ordersCount: orders,
        daysRecorded: -1, // live, not counted in days
        isCurrentMonth: true,
      };
    }

    const rows = await this.prisma.db.dailySnapshot.findMany({
      where: { onDate: { gte: start, lte: end } },
    });

    // TRAP 2 — nothing recorded means UNKNOWN, not zero.
    if (rows.length === 0)
      return { revenuePaisa: null, grossMarginBp: null, onTimeBp: null, ordersCount: null, daysRecorded: 0, isCurrentMonth: false };

    const revenue = rows.reduce((n, r) => n + r.revenuePaisa, 0);
    const grossProfit = rows.reduce((n, r) => n + r.grossProfitPaisa, 0);
    const orders = rows.reduce((n, r) => n + r.ordersCount, 0);
    const onTime = rows.reduce((n, r) => n + r.onTimeCount, 0);
    const measurable = rows.reduce((n, r) => n + r.measurableDeliveries, 0);

    return {
      revenuePaisa: revenue,
      // TRAP 1 — rebuilt from the summed money, never the average of daily rates
      grossMarginBp: revenue > 0 ? Math.round((grossProfit / revenue) * 10000) : null,
      onTimeBp: measurable > 0 ? Math.round((onTime / measurable) * 10000) : null,
      ordersCount: orders,
      daysRecorded: rows.length,
      isCurrentMonth: false,
    };
  }

  private async onTimeFor(from: Date, to: Date): Promise<number | null> {
    const rows = await this.prisma.db.deliveryAssignment.findMany({
      where: { status: 'DELIVERED', deliveredAt: { gte: from, lte: to }, isActive: true },
      select: { deliveredAt: true, order: { select: { promisedBy: true } } },
    });
    const judged = rows.filter((r) => r.order?.promisedBy && r.deliveredAt);
    if (judged.length === 0) return null;
    const ok = judged.filter((r) => r.deliveredAt! <= r.order!.promisedBy!).length;
    return Math.round((ok / judged.length) * 10000);
  }

  /* ==================== analytics — the "why" ==================== */

  /*  Why did the month move?

      Revenue can only change two ways: more people bought, or each person spent
      more. Separating those is the single most useful thing this screen can
      say, because the two call for opposite responses — one is a marketing
      problem, the other is a basket problem, and a shop that cannot tell them
      apart spends money on the wrong one.

      The split is EXACT, not an estimate:

          volume effect = (N₁ − N₀) × AOV₀
          value effect  = (AOV₁ − AOV₀) × N₁
          ------------------------------------
          together       = R₁ − R₀            ← always, to the paisa

      A self-test asserts that identity. If it ever stops holding, the
      decomposition is lying and the screen should not show it.  */
  async movement(year: number, month: number) {
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;

    const now = new Date();
    const bdNow = new Date(now.getTime() + BD_OFFSET_MS);
    const isCurrent = year === bdNow.getUTCFullYear() && month === bdNow.getUTCMonth() + 1;

    const [cur, prev] = await Promise.all([
      this.monthActual(year, month, isCurrent),
      this.monthActual(prevYear, prevMonth, false),
    ]);

    if (cur.revenuePaisa === null || prev.revenuePaisa === null || !cur.ordersCount || !prev.ordersCount)
      return {
        known: false as const,
        why: 'Both months need recorded sales before the change can be explained.',
        current: cur,
        previous: prev,
      };

    const n0 = prev.ordersCount;
    const n1 = cur.ordersCount;
    const aov0 = Math.round(prev.revenuePaisa / n0);
    const aov1 = Math.round(cur.revenuePaisa / n1);

    const volumePaisa = Math.round((n1 - n0) * aov0);
    const totalChange = cur.revenuePaisa - prev.revenuePaisa;
    // value effect is taken as the remainder so the two ALWAYS add to the
    // total exactly — rounding must never leak into an unexplained gap
    const valuePaisa = totalChange - volumePaisa;

    return {
      known: true as const,
      totalChangePaisa: totalChange,
      changeBp: prev.revenuePaisa > 0 ? Math.round((totalChange / prev.revenuePaisa) * 10000) : null,
      volumePaisa,
      valuePaisa,
      ordersFrom: n0,
      ordersTo: n1,
      aovFromPaisa: aov0,
      aovToPaisa: aov1,
      /* plain words, because a number without a reading gets ignored */
      leadingReason:
        Math.abs(volumePaisa) >= Math.abs(valuePaisa) ? ('volume' as const) : ('value' as const),
      current: cur,
      previous: prev,
    };
  }

  /*  Which days of the week actually sell.

      For a flower shop this is not trivia — it decides when stock is bought and
      when staff are rostered. Built from DailySnapshot, so it costs nothing and
      gets more truthful every night.

      A weekday with no recorded days is left out rather than shown as zero. */
  async weekdayPattern(days = 90) {
    const from = new Date(Date.now() - days * 24 * 3600 * 1000);
    const rows = await this.prisma.db.dailySnapshot.findMany({
      where: { onDate: { gte: from } },
      select: { onDate: true, revenuePaisa: true, ordersCount: true },
    });

    const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const buckets = names.map((name) => ({ name, days: 0, revenuePaisa: 0, ordersCount: 0 }));
    for (const r of rows) {
      // the weekday IN DHAKA — onDate is already stored at BD midnight
      const idx = new Date(r.onDate.getTime() + BD_OFFSET_MS).getUTCDay();
      buckets[idx].days += 1;
      buckets[idx].revenuePaisa += r.revenuePaisa;
      buckets[idx].ordersCount += r.ordersCount;
    }

    const withData = buckets.filter((b) => b.days > 0);
    const anySales = withData.some((b) => b.revenuePaisa > 0);
    return {
      daysConsidered: rows.length,
      /* no sales anywhere means there is no pattern to report — saying
         "every day is equally bad" would be technically true and useless */
      known: anySales,
      weekdays: withData.map((b) => ({
        name: b.name,
        days: b.days,
        avgRevenuePaisa: Math.round(b.revenuePaisa / b.days),
        avgOrders: Math.round((b.ordersCount / b.days) * 10) / 10,
      })),
    };
  }
}
