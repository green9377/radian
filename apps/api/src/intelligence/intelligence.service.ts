import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceService } from '../finance/finance.service';
import { FinanceReportsService } from '../finance/finance-reports.service';
import { InventoryService } from '../inventory/inventory.service';
import type { AppRoleName } from '../auth/auth.guard';
import { ensureSingleton } from '../common/singleton';

/*  INTELLIGENCE — RADIAN_INTELLIGENCE_MODULE_ARCHITECTURE.md (29 Jul 2026).

    THE ONE RULE THIS FILE EXISTS TO KEEP (INT-R01):
    Intelligence works out no figure that another module already works out. It
    ASKS. Every money figure below comes from FinanceService or
    FinanceReportsService — none of it is added up here. The day somebody sums
    profit locally "just for the dashboard", the shop has two profit figures and
    within a month nobody can say which one is true.

    What IS counted here: order counts, new customers, and the on-time tally.
    No module produces those as a daily series, so counting them is not a second
    source — it is the only source. Money is different, and money is asked for.

    Provenance (INT-R03): every figure leaves here inside { value, source },
    where source is REAL or DEMO. The API decides, never the screen — a screen
    that decides what is real can be told to lie, and eventually is.
*/

const BD_OFFSET_MS = 6 * 60 * 60 * 1000; // Asia/Dhaka, no DST
const DAY_MS = 24 * 3600 * 1000;
// the schedule itself lives in intelligence.automation.ts

export type Provenance = 'REAL' | 'DEMO';

/** Every figure that leaves this module wears its own label. */
export interface Figure {
  value: number;
  source: Provenance;
  /** set only when the figure could not be worked out at all */
  unavailable?: string;
}

const real = (value: number): Figure => ({ value, source: 'REAL' });
const missing = (why: string): Figure => ({ value: 0, source: 'REAL', unavailable: why });

/** start and end of one Bangladesh day, expressed in UTC instants */
function bdDayRange(d: Date) {
  const bd = new Date(d.getTime() + BD_OFFSET_MS);
  const startBd = Date.UTC(bd.getUTCFullYear(), bd.getUTCMonth(), bd.getUTCDate());
  return { start: new Date(startBd - BD_OFFSET_MS), end: new Date(startBd - BD_OFFSET_MS + DAY_MS - 1) };
}

/** midnight BD for a day, the key DailySnapshot.onDate is stored on */
function bdMidnight(d: Date) {
  return bdDayRange(d).start;
}

/*  Which calendar day/month is it IN DHAKA — not in UTC. Between midnight and
    6 AM Bangladesh time the two disagree, and on the 1st of the month that is
    the difference between "sales this month" showing the new month and showing
    the old one. Every month boundary below goes through here. */
function bdParts(d: Date) {
  const bd = new Date(d.getTime() + BD_OFFSET_MS);
  return { year: bd.getUTCFullYear(), month: bd.getUTCMonth() + 1, day: bd.getUTCDate() };
}

/** first instant of the Bangladesh month that `d` falls in */
function bdMonthStart(d: Date) {
  const { year, month } = bdParts(d);
  return new Date(Date.UTC(year, month - 1, 1) - BD_OFFSET_MS);
}

@Injectable()
export class IntelligenceService {
  private readonly logger = new Logger('Intelligence');

  constructor(
    private readonly prisma: PrismaService,
    private readonly finance: FinanceService,
    private readonly reports: FinanceReportsService,
    private readonly inventory: InventoryService,
  ) {}

  /* ==================== settings ==================== */

  /*  This is the method that returned P2002 on the dashboard's first ever load
      and took the whole page down with it. The full story, and why `upsert`
      alone does not fix it, is in common/singleton.ts — the same fault was
      sitting in seven other modules and they now all share this one helper. */
  async settings() {
    return ensureSingleton(
      () => this.prisma.db.intelligenceSetting.findUnique({ where: { id: 'singleton' } }),
      () => this.prisma.db.intelligenceSetting.create({ data: { id: 'singleton' } }),
    );
  }

  /* ==================== the dashboard ==================== */

  /*  DEC-INT-001 — one page, three sections, in this order:
      Today (what is stuck) → Business (how it is going) → Money (where it is).

      DEC-INT-005 — STAFF is refused cost, margin, profit and cash HERE, in the
      payload. A section the screen merely hides but the API still sends is not a
      restriction, it is a rumour. Finance closes its whole module to STAFF on
      purpose; Intelligence reads from everywhere, so Intelligence is where that
      fence leaks if nobody holds it.  */
  async dashboard(role: AppRoleName) {
    const seesMoney = role === 'OWNER' || role === 'MANAGER';
    const [today, business, money] = await Promise.all([
      this.todaySection(),
      this.businessSection(seesMoney),
      seesMoney ? this.moneySection() : Promise.resolve(null),
    ]);

    const snapshotDays = await this.prisma.db.dailySnapshot.count();
    return {
      role,
      seesMoney,
      today,
      business,
      money, // null for STAFF — the key is present and empty, not quietly absent
      meta: {
        generatedAt: new Date().toISOString(),
        snapshotDays,
        /* everything above is live. History comes from DailySnapshot, and there
           is none until a night has passed — which the screen says plainly
           rather than drawing an empty chart that looks broken. */
        historyReady: snapshotDays > 0,
      },
    };
  }

  /* ---------- 1. Today — the work that is stuck ---------- */

  /*  Every line here is a COUNT WITH A DESTINATION. A dashboard line that
      cannot be clicked is a line that gets read twice and then never again —
      that is the whole reason this section sits at the top (DEC-INT-001). */
  private async todaySection() {
    const { start, end } = bdDayRange(new Date());

    const [
      unpacked,
      unassigned,
      outForDelivery,
      failedDelivery,
      codNotHandedOver,
      inv,
      fin,
    ] = await Promise.all([
      /*  These two MUST NOT overlap, and the first draft did: both counted
          `deliveryStatus: unassigned`, so one order appeared as a thing to pack
          AND as a delivery with no rider. Two lines, one job, and the reader
          quietly stops trusting the arithmetic.
          The delivery states already separate them — `preparing` is being made,
          `unassigned` is made and waiting for somebody to carry it.  */
      this.prisma.db.order.count({
        where: { deliveryStatus: 'preparing', salesStatus: { notIn: ['cancelled'] } },
      }),
      this.prisma.db.order.count({
        where: { deliveryStatus: 'unassigned', salesStatus: { in: ['placed', 'confirmed'] } },
      }),
      this.prisma.db.order.count({ where: { deliveryStatus: 'out_for_delivery' } }),
      this.prisma.db.order.count({ where: { deliveryStatus: 'failed' } }),
      // cash the rider is holding that has not reached us. DeliveryAssignment
      // has no deletedAt filter problem — but it IS soft-deletable, so db.*
      this.prisma.db.deliveryAssignment.count({
        where: { status: 'DELIVERED', codHandedOver: false, isActive: true },
      }),
      this.inventory.overview(),
      this.finance.overview(),
    ]);

    const todayOrders = await this.prisma.db.order.count({
      where: { createdAt: { gte: start, lte: end }, salesStatus: { not: 'cancelled' } },
    });

    return {
      lines: [
        { key: 'unpacked', label: 'Orders being prepared', count: unpacked, href: '/delivery/board', tone: unpacked > 0 ? 'info' : 'ok' },
        { key: 'unassigned', label: 'Deliveries with no rider', count: unassigned, href: '/delivery/board', tone: unassigned > 0 ? 'danger' : 'ok' },
        { key: 'outForDelivery', label: 'Out for delivery now', count: outForDelivery, href: '/delivery/tracking', tone: 'info' },
        { key: 'failedDelivery', label: 'Failed deliveries to deal with', count: failedDelivery, href: '/delivery/failed', tone: failedDelivery > 0 ? 'danger' : 'ok' },
        { key: 'codPending', label: 'COD collected, not yet handed over', count: codNotHandedOver, href: '/finance/carrier', tone: codNotHandedOver > 0 ? 'warn' : 'ok' },
        { key: 'stockNegative', label: 'Items showing negative stock', count: inv.needsAttention.negativeCount, href: '/inventory', tone: inv.needsAttention.negativeCount > 0 ? 'danger' : 'ok' },
        { key: 'stockLow', label: 'Items running low', count: inv.needsAttention.lowCount, href: '/inventory', tone: inv.needsAttention.lowCount > 0 ? 'warn' : 'ok' },
        { key: 'expiring', label: 'Stock expiring soon', count: inv.needsAttention.expiring.length, href: '/inventory/expiry', tone: inv.needsAttention.expiring.length > 0 ? 'warn' : 'ok' },
        // Finance's own counts, asked for rather than recomputed (INT-R01)
        { key: 'approvals', label: 'Expenses waiting for approval', count: fin.pendingApprovalCount, href: '/finance/expenses', tone: fin.pendingApprovalCount > 0 ? 'warn' : 'ok' },
        { key: 'postingFailures', label: 'Things the books refused to record', count: fin.postingFailureCount, href: '/finance/drift', tone: fin.postingFailureCount > 0 ? 'danger' : 'ok' },
      ],
      ordersToday: todayOrders,
    };
  }

  /* ---------- 2. Business — how it is going, against a target ---------- */

  private async businessSection(seesMoney: boolean) {
    const now = new Date();
    const { start: dayStart, end: dayEnd } = bdDayRange(now);
    const monthStart = bdMonthStart(now);
    const bdNow = bdParts(now);

    const [pnlMonth, ordersMonth, ordersToday, newCustomers, onTime, targets] = await Promise.all([
      this.reports.profitAndLoss(monthStart.toISOString(), dayEnd.toISOString()),
      this.prisma.db.order.count({
        where: { createdAt: { gte: monthStart, lte: dayEnd }, salesStatus: { not: 'cancelled' } },
      }),
      this.prisma.db.order.count({
        where: { createdAt: { gte: dayStart, lte: dayEnd }, salesStatus: { not: 'cancelled' } },
      }),
      this.prisma.db.customer.count({ where: { createdAt: { gte: monthStart, lte: dayEnd } } }),
      this.onTimeRate(monthStart, dayEnd),
      this.targetsFor(bdNow.year, bdNow.month),
    ]);

    const salesPaisa = pnlMonth.totalIncomePaisa;

    /*  AVERAGE ORDER VALUE — ONE DEFINITION, AND THIS IS IT.

        The first version divided LEDGER INCOME by the order count. That is a
        mixed metric and it was wrong in a way nothing would have shouted about:
        ledger income excludes the VAT held for the government and can include
        income that never came from an order at all, while the order count is
        strictly orders. Two different populations, one division.

        Worse, it disagreed with this module's own other answers. The lens
        divides the sum of order totals; so does DailySnapshot. So the SAME
        figure changed meaning depending on which screen you opened it from, and
        changed again the moment it aged from "today" into history.

        Average order value means what a customer actually paid, on average. So:
        the sum of order totals, over the number of orders. Everywhere. */
    const orderTotals = await this.prisma.db.order.aggregate({
      where: { createdAt: { gte: monthStart, lte: dayEnd }, salesStatus: { not: 'cancelled' } },
      _sum: { totalPaisa: true },
    });
    const aov = ordersMonth > 0 ? Math.round((orderTotals._sum.totalPaisa ?? 0) / ordersMonth) : null;

    /*  DEC-INT-003 — missing a target changes a COLOUR and nothing else. No
        message, no notification. A monthly target is unmet for most of the month
        by definition; something that says so every day teaches the reader to
        ignore it, and it is then also ignored on the day it matters.  */
    const bands = await this.settings();
    const rag = (actualBp: number | null): 'none' | 'green' | 'amber' | 'red' => {
      // INT-R12 — no target set means NO colour. Never green by default: a
      // target nobody set is not a target that was met.
      if (actualBp === null) return 'none';
      if (actualBp >= bands.amberAtBp) return 'green';
      if (actualBp >= bands.redBelowBp) return 'amber';
      return 'red';
    };
    const progressBp = (actual: number, target?: number) =>
      target && target > 0 ? Math.round((actual / target) * 10000) : null;

    const salesTarget = targets.MONTHLY_SALES;
    const marginTarget = targets.GROSS_MARGIN;
    const onTimeTarget = targets.ON_TIME_DELIVERY;

    const salesProgress = progressBp(salesPaisa, salesTarget);
    const marginProgress = progressBp(pnlMonth.grossMarginBp, marginTarget);
    const onTimeProgress = onTime.measurable > 0 ? progressBp(onTime.rateBp, onTimeTarget) : null;

    return {
      kpis: [
        {
          key: 'sales',
          label: 'Sales this month',
          unit: 'paisa',
          actual: real(salesPaisa),
          targetValue: salesTarget ?? null,
          progressBp: salesProgress,
          rag: rag(salesProgress),
        },
        {
          key: 'margin',
          label: 'Gross margin',
          unit: 'bp',
          // margin is a cost figure — STAFF never receives it (INT-R08)
          actual: seesMoney ? real(pnlMonth.grossMarginBp) : missing('Not shown for your account'),
          targetValue: seesMoney ? marginTarget ?? null : null,
          progressBp: seesMoney ? marginProgress : null,
          rag: seesMoney ? rag(marginProgress) : 'none',
        },
        {
          key: 'onTime',
          label: 'On-time delivery',
          unit: 'bp',
          /*  DEC-INT-003 / INT-R09. Until Orders fills Order.promisedBy there is
              nothing to compare a delivery against, and this says so instead of
              printing a number. An order with no promised time is UNMEASURABLE —
              it is never counted as late, because it was never counted at all.
              The panel has shown an invented "94%" from a demo file up to now;
              an honest blank is worth more than a confident fiction. */
          actual:
            onTime.measurable > 0
              ? real(onTime.rateBp)
              : missing('No delivery has a promised time yet'),
          targetValue: onTimeTarget ?? null,
          progressBp: onTimeProgress,
          rag: rag(onTimeProgress),
          denominator: {
            measurable: onTime.measurable,
            delivered: onTime.delivered,
            unmeasurable: onTime.delivered - onTime.measurable,
          },
        },
      ],
      supporting: [
        { key: 'ordersMonth', label: 'Orders this month', value: real(ordersMonth), unit: 'count' },
        { key: 'ordersToday', label: 'Orders today', value: real(ordersToday), unit: 'count' },
        { key: 'aov', label: 'Average order value',
          value: aov === null ? missing('No orders yet this month') : real(aov), unit: 'paisa' },
        { key: 'newCustomers', label: 'New customers this month', value: real(newCustomers), unit: 'count' },
      ],
    };
  }

  /** on-time = deliveredAt <= promisedBy. Anything without promisedBy is
      unmeasurable, and the count of those travels with the answer (INT-R09). */
  private async onTimeRate(from: Date, to: Date) {
    const rows = await this.prisma.db.deliveryAssignment.findMany({
      where: { status: 'DELIVERED', deliveredAt: { gte: from, lte: to }, isActive: true },
      select: { deliveredAt: true, order: { select: { promisedBy: true } } },
    });
    const delivered = rows.length;
    const judged = rows.filter((r) => r.order?.promisedBy && r.deliveredAt);
    const onTime = judged.filter((r) => r.deliveredAt! <= r.order!.promisedBy!).length;
    return {
      delivered,
      measurable: judged.length,
      onTime,
      rateBp: judged.length > 0 ? Math.round((onTime / judged.length) * 10000) : 0,
    };
  }

  /** targets for one month, as a lookup. Absent = no target set. */
  private async targetsFor(year: number, month: number) {
    const rows = await this.prisma.db.kpiTarget.findMany({ where: { year, month } });
    const out: Partial<Record<'MONTHLY_SALES' | 'GROSS_MARGIN' | 'ON_TIME_DELIVERY', number>> = {};
    for (const r of rows) out[r.kpi] = r.targetValue;
    return out;
  }

  /* ---------- 3. Money — OWNER and MANAGER only ---------- */

  /*  Not one number in here is worked out by Intelligence. FinanceService owns
      every one of them, and if this method ever starts adding things up, the
      dashboard and the P&L will drift apart and both will look authoritative. */
  private async moneySection() {
    const fin = await this.finance.overview();
    return {
      figures: [
        { key: 'cash', label: 'Cash in hand', value: real(fin.cashPaisa), unit: 'paisa', href: '/finance/accounts' },
        { key: 'spendable', label: 'Of that, actually spendable', value: real(fin.spendablePaisa), unit: 'paisa', href: '/finance/accounts' },
        { key: 'receivable', label: 'Owed to us', value: real(fin.receivablePaisa), unit: 'paisa', href: '/finance/reports' },
        { key: 'payable', label: 'We owe suppliers', value: real(fin.payablePaisa), unit: 'paisa', href: '/finance/reports' },
        { key: 'inventory', label: 'Stock value', value: real(fin.inventoryPaisa), unit: 'paisa', href: '/inventory' },
        { key: 'profit', label: 'Profit this month', value: real(fin.profitPaisa), unit: 'paisa', href: '/finance' },
      ],
      breakEven: {
        targetPaisa: fin.breakEvenPaisa,
        progressBp: fin.breakEvenProgressBp,
        /* Finance refuses to guess a break-even point on thin sales, and returns
           0 rather than a confident wrong number. Passed straight through — the
           screen says "not enough sales yet" instead of drawing a bar. */
        known: fin.breakEvenPaisa > 0,
      },
      runwayDays: fin.runwayDays,
    };
  }

  /* ==================== history ==================== */

  /** the strip under Business — read from the cache, never recomputed */
  async history(days = 30) {
    const from = bdMidnight(new Date(Date.now() - days * DAY_MS));
    const rows = await this.prisma.db.dailySnapshot.findMany({
      where: { onDate: { gte: from } },
      orderBy: { onDate: 'asc' },
    });
    return {
      days: rows.map((r) => ({
        onDate: r.onDate.toISOString().slice(0, 10),
        revenuePaisa: r.revenuePaisa,
        grossProfitPaisa: r.grossProfitPaisa,
        grossMarginBp: r.grossMarginBp,
        ordersCount: r.ordersCount,
      })),
      /* an empty history is not a fault — it is a table that has nothing to
         remember yet, and the screen must say that rather than draw nothing */
      readyAfterFirstNight: rows.length === 0,
    };
  }

  /* ==================== the nightly snapshot ==================== */

  /*  DEC-INT-002. A snapshot row is a CACHE. Every figure in it was worked out
      by its owning service for that day and copied here so that six months of
      history is not recomputed on every page load.

      INT-R02 — it is never a source. Rebuilding a day always overwrites, so a
      row that has drifted is repaired simply by asking for it again.

      INT-R07 — a day is snapshotted only after it has closed. Today is never
      written, because a half-finished day stored as history is a lie that gets
      harder to spot the older it gets.  */
  async snapshotDay(day: Date) {
    const onDate = bdMidnight(day);
    const { start, end } = bdDayRange(day);

    // INT-R07 — refuse to freeze a day that has not finished
    if (end.getTime() >= Date.now()) return { onDate, skipped: 'day has not closed yet' as const };

    const [pnl, orders, newCustomers, onTime] = await Promise.all([
      // money: ASKED FOR, not added up (INT-R01)
      this.reports.profitAndLoss(start.toISOString(), end.toISOString()),
      this.prisma.db.order.findMany({
        where: { createdAt: { gte: start, lte: end }, salesStatus: { not: 'cancelled' } },
        select: { totalPaisa: true },
      }),
      this.prisma.db.customer.count({ where: { createdAt: { gte: start, lte: end } } }),
      this.onTimeRate(start, end),
    ]);

    const ordersCount = orders.length;
    const orderSum = orders.reduce((n, o) => n + (o.totalPaisa ?? 0), 0);

    /*  Position at day end — cash and stock value are BALANCES, not sums over a
        range, so for a past day they can only be read as they are now. Storing
        today's balance against an old date would be quietly wrong, so a
        back-filled day stores 0 and the screen shows the balance only for the
        most recent row. Honest gap beats plausible fiction.  */
    const isYesterday = Date.now() - end.getTime() < 2 * DAY_MS;
    let inventoryValuePaisa = 0;
    let cashBalancePaisa = 0;
    if (isYesterday) {
      const fin = await this.finance.overview();
      inventoryValuePaisa = fin.inventoryPaisa;
      cashBalancePaisa = fin.cashPaisa;
    }

    const data = {
      revenuePaisa: pnl.totalIncomePaisa,
      cogsPaisa: pnl.cogsPaisa,
      grossProfitPaisa: pnl.grossProfitPaisa,
      grossMarginBp: pnl.grossMarginBp,
      ordersCount,
      avgOrderValuePaisa: ordersCount > 0 ? Math.round(orderSum / ordersCount) : 0,
      newCustomers,
      deliveredCount: onTime.delivered,
      onTimeCount: onTime.onTime,
      measurableDeliveries: onTime.measurable,
      inventoryValuePaisa,
      cashBalancePaisa,
      computedAt: new Date(),
    };

    await this.prisma.db.dailySnapshot.upsert({
      where: { onDate },
      create: { onDate, ...data },
      update: data, // INT-R02 — rebuilding always overwrites
    });
    return { onDate, written: true as const };
  }

  /*  INT-R05 — RECONCILIATION, NOT A CRON PROMISE.

      This does not ask "did last night run?". It asks "which days are missing?"
      and fills every one of them. A hook that fails, fails silently; a sweep
      that looks for gaps cannot fail silently, because the gap is still there
      next time and gets filled then.

      The shop laptop is not on at 2 AM — the same reason marketing's sweep
      catches up shortly after boot.  */
  async reconcile(maxDays?: number) {
    const cfg = await this.settings();
    const back = maxDays ?? cfg.snapshotBackfillDays;

    const oldest = bdMidnight(new Date(Date.now() - back * DAY_MS));
    const have = await this.prisma.db.dailySnapshot.findMany({
      where: { onDate: { gte: oldest } },
      select: { onDate: true },
    });
    const present = new Set(have.map((r) => r.onDate.toISOString().slice(0, 10)));

    // yesterday backwards — never today (INT-R07)
    const missing: Date[] = [];
    for (let i = 1; i <= back; i++) {
      const day = new Date(Date.now() - i * DAY_MS);
      if (present.has(bdMidnight(day).toISOString().slice(0, 10))) continue;
      missing.push(day);
    }

    /*  CAPPED, AND IN SMALL BATCHES.

        Rebuilding one day costs a P&L groupBy over the ledger plus three
        counts. The first version rebuilt up to 90 days one after another —
        roughly 450 queries in a single pass, on the API's own event loop, and
        getting slower every month the ledger grows.

        Two changes, both cheap:
        · at most MAX_PER_RUN days per pass. Nothing is lost — this is
          reconciliation, so whatever is still missing is found next time, and
          the hourly timer means "next time" is within the hour, not next year.
        · BATCH days at a time rather than one, so the database is doing useful
          work while we wait, without letting a catch-up flood it.

        Deliberately NOT unbounded parallelism: 90 concurrent groupBys on the
        shop's single Postgres would make the panel unusable for whoever is
        standing at the counter. */
    const MAX_PER_RUN = 30;
    const BATCH = 3;
    const todo = missing.slice(0, MAX_PER_RUN);
    const written: string[] = [];

    for (let i = 0; i < todo.length; i += BATCH) {
      const slice = todo.slice(i, i + BATCH);
      const results = await Promise.all(slice.map((d) => this.snapshotDay(d)));
      results.forEach((r, n) => {
        if ('written' in r) written.push(bdMidnight(slice[n]).toISOString().slice(0, 10));
      });
    }

    const remaining = missing.length - todo.length;
    if (written.length)
      this.logger.log(
        `snapshot filled ${written.length} day(s)` +
          (remaining > 0 ? ` · ${remaining} still missing, next run will take them` : ''),
      );
    return { filled: written.length, days: written, remaining };
  }

  /* ==================== KPI targets ==================== */

  async listTargets(year: number) {
    return this.prisma.db.kpiTarget.findMany({
      where: { year },
      orderBy: [{ month: 'asc' }, { kpi: 'asc' }],
    });
  }

  async setTarget(input: { year: number; month: number; kpi: 'MONTHLY_SALES' | 'GROSS_MARGIN' | 'ON_TIME_DELIVERY'; targetValue: number; note?: string }) {
    const { year, month, kpi, targetValue, note } = input;
    return this.prisma.db.kpiTarget.upsert({
      where: { year_month_kpi: { year, month, kpi } },
      create: { year, month, kpi, targetValue, note },
      update: { targetValue, note, deletedAt: null },
    });
  }
}
