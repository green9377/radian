import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ACC, FinanceService } from './finance.service';
import { AuditService } from '../common/audit.service';

/*  DRIFT CHECKER — closes gap G1 (RADIAN_FINANCE_REVIEW2.md §4).

    The ledger is a MIRROR of what the shop actually did. A mirror can go
    wrong in exactly two ways and neither one announces itself:

      · an event never reached the books  (a hook failed, someone imported
        rows straight into the database, a migration ran mid-sale)
      · the books were written by hand and the shop was never told

    Either way the numbers stay internally consistent — the trial balance
    still balances, every screen still adds up — and you only find out at
    year end when the accountant asks why supplier dues are ৳1,00,000 in the
    books and ৳0 in the purchase register. That exact gap is sitting in this
    system right now (it is practice data, but nothing would have caught it).

    So once a day we ask the operational tables the same questions the ledger
    answers, and compare. Finance owns nothing operational — it only READS
    those tables (constitution). No writes, no repairs: a drift check that
    silently "fixes" things would destroy the evidence. It reports.

    Every check returns the same shape so the screen stays simple:
      what we are comparing · books say · shop says · difference · how bad.
*/

export type DriftSeverity = 'ok' | 'watch' | 'wrong';

export interface DriftCheck {
  key: string;
  /** plain language — this is what the owner reads */
  title: string;
  /** why it matters, in one sentence */
  why: string;
  booksPaisa: number | null;
  realPaisa: number | null;
  /** books − real; positive = the books claim more than the shop can show */
  diffPaisa: number | null;
  severity: DriftSeverity;
  /** what to do about it, when there is something to do */
  advice: string;
  /** for the count-style checks (unposted orders, failures) */
  count?: number;
  examples?: string[];
}

export interface DriftReport {
  ranAt: string;
  worst: DriftSeverity;
  wrongCount: number;
  watchCount: number;
  checks: DriftCheck[];
}

/** below this a difference is rounding, not drift (৳1) */
const NOISE_PAISA = 100;
/** above this we stop calling it "watch" and call it wrong (৳500) */
const WRONG_PAISA = 50000;

/*  When the nightly check runs, in Bangladesh time.

    2 AM: the shop is shut, the day's orders are all in, and if something is
    wrong the owner reads it with his morning tea instead of finding out three
    weeks later. Bangladesh has no daylight saving, so a fixed +6 offset is
    correct all year and needs no timezone library. */
const NIGHTLY_HOUR_BD = 2;
const BD_OFFSET_MS = 6 * 3600 * 1000;
const DAY_MS = 86400000;

/** the audit trail doubles as the drift history — no new table, and it is permanent */
const DRIFT_ENTITY = 'FinanceDrift';

@Injectable()
export class FinanceDriftService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FinanceDriftService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly finance: FinanceService,
    private readonly audit: AuditService,
  ) {}

  /* ------------------------------------------------- the nightly run */

  onModuleInit() {
    this.scheduleNext();
    /*  If the machine was off at 2 AM — a shop laptop usually is not running
        all night — the check would simply never happen. So on boot, if there
        has been no run in the last day, do one shortly after startup. The
        delay keeps it out of the way while the app is still warming up. */
    setTimeout(() => void this.catchUp(), 90_000).unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearTimeout(this.timer);
  }

  private scheduleNext() {
    const now = Date.now();
    const bdNow = new Date(now + BD_OFFSET_MS);
    const next = Date.UTC(
      bdNow.getUTCFullYear(),
      bdNow.getUTCMonth(),
      bdNow.getUTCDate(),
      NIGHTLY_HOUR_BD,
    ) - BD_OFFSET_MS;
    const at = next > now ? next : next + DAY_MS;
    this.timer = setTimeout(() => {
      void this.runAndRecord('Nightly check');
      this.scheduleNext();
    }, at - now);
    this.timer.unref?.();
    this.logger.log(`next drift check at ${new Date(at).toISOString()}`);
  }

  private async catchUp() {
    try {
      const last = await this.prisma.db.auditLog.findFirst({
        where: { entityType: DRIFT_ENTITY },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      if (last && Date.now() - last.createdAt.getTime() < DAY_MS) return;
      await this.runAndRecord('Catch-up after restart');
    } catch (e) {
      this.logger.warn(`drift catch-up failed — ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /*  Run it and write the verdict into the audit trail.

      Recorded EVERY time, not only when something is wrong — otherwise you
      cannot tell "the books have matched every night for a month" from
      "nobody has checked since March". Knowing when drift STARTED is usually
      what tells you what caused it. */
  async runAndRecord(reason: string): Promise<DriftReport> {
    const report = await this.run();
    const problems = report.checks
      .filter((c) => c.severity !== 'ok')
      .map((c) => ({
        title: c.title,
        diffPaisa: c.diffPaisa,
        count: c.count ?? null,
        examples: c.examples ?? null,
      }));
    await this.audit.record({
      entityType: DRIFT_ENTITY,
      entityId: 'ledger',
      action: 'CREATE',
      actorName: 'System',
      changes: {
        reason,
        worst: report.worst,
        wrongCount: report.wrongCount,
        watchCount: report.watchCount,
        problems,
      },
    });
    if (report.worst !== 'ok')
      this.logger.warn(
        `drift check: ${report.wrongCount} wrong, ${report.watchCount} to watch (${reason})`,
      );
    return report;
  }

  /** the last 30 verdicts — "when did this start?" is the useful question */
  async history() {
    const rows = await this.prisma.db.auditLog.findMany({
      where: { entityType: DRIFT_ENTITY },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { id: true, createdAt: true, changes: true },
    });
    return rows.map((r) => {
      const c = (r.changes ?? {}) as {
        reason?: string;
        worst?: DriftSeverity;
        wrongCount?: number;
        watchCount?: number;
        problems?: { title: string; diffPaisa: number | null; count: number | null }[];
      };
      return {
        id: r.id,
        ranAt: r.createdAt.toISOString(),
        reason: c.reason ?? '',
        worst: c.worst ?? 'ok',
        wrongCount: c.wrongCount ?? 0,
        watchCount: c.watchCount ?? 0,
        problems: c.problems ?? [],
      };
    });
  }

  /** the short version the Overview screen shows as a badge */
  async lastVerdict() {
    const rows = await this.history();
    return rows[0] ?? null;
  }

  /* ------------------------------------------------------------------ */

  async run(): Promise<DriftReport> {
    const accounts = await this.finance.accounts();
    /*  Anything dated before the finance go-live date was deliberately never
        posted (the hooks skip it), so counting it as missing would cry wolf
        every single night. */
    const setting = await this.finance.settings();
    const goLive = setting?.goLiveDate ?? null;
    const bal = (code: string) =>
      accounts.find((a) => a.code === code)?.balancePaisa ?? 0;

    const checks: DriftCheck[] = [];
    for (const fn of [
      () => this.supplierDues(bal(ACC.SUPPLIER_PAYABLE)),
      () => this.customerDues(bal(ACC.RECEIVABLE)),
      () => this.stockValue(bal(ACC.INVENTORY)),
      () => this.carrierCash(bal(ACC.CASH_WITH_CARRIER)),
      () => this.unpostedSales(goLive),
      () => this.unpostedPurchases(goLive),
      () => this.postingFailures(),
      () => this.unbalancedEntries(),
      () => this.negativeMoney(accounts),
      () => this.staleGoodsOut(bal(ACC.GOODS_OUT)),
    ]) {
      try {
        checks.push(await fn());
      } catch (e) {
        // one broken check must never hide the other nine
        const message = e instanceof Error ? e.message : String(e);
        this.logger.warn(`drift check failed — ${message}`);
        checks.push({
          key: 'failed',
          title: 'One check could not run',
          why: 'The comparison itself hit an error, so this area is unchecked.',
          booksPaisa: null,
          realPaisa: null,
          diffPaisa: null,
          severity: 'watch',
          advice: message.slice(0, 200),
        });
      }
    }

    const wrongCount = checks.filter((c) => c.severity === 'wrong').length;
    const watchCount = checks.filter((c) => c.severity === 'watch').length;
    return {
      ranAt: new Date().toISOString(),
      worst: wrongCount ? 'wrong' : watchCount ? 'watch' : 'ok',
      wrongCount,
      watchCount,
      checks,
    };
  }

  /* --------------------------------------------------------- helpers */

  private grade(diff: number): DriftSeverity {
    const d = Math.abs(diff);
    if (d < NOISE_PAISA) return 'ok';
    return d >= WRONG_PAISA ? 'wrong' : 'watch';
  }

  private money(
    key: string,
    title: string,
    why: string,
    books: number,
    real: number,
    advice: string,
    okAdvice = 'Matches — nothing to do.',
  ): DriftCheck {
    const diff = books - real;
    const severity = this.grade(diff);
    return {
      key,
      title,
      why,
      booksPaisa: books,
      realPaisa: real,
      diffPaisa: diff,
      severity,
      advice: severity === 'ok' ? okAdvice : advice,
    };
  }

  /* ---------------------------------------------------------- checks */

  /** 2000 Supplier Payable vs what the purchase register actually shows */
  private async supplierDues(books: number): Promise<DriftCheck> {
    const [suppliers, purchases, payments, adjustments] = await Promise.all([
      this.prisma.db.supplier.findMany({ select: { id: true, openingDuePaisa: true } }),
      this.prisma.db.purchase.findMany({
        select: {
          supplierId: true,
          grandTotalPaisa: true,
          payments: { where: { deletedAt: null }, select: { amountPaisa: true } },
          returns: { where: { deletedAt: null }, select: { dueCutPaisa: true } },
        },
      }),
      this.prisma.db.supplierPayment.findMany({
        select: { allocations: { select: { purchaseId: true, amountPaisa: true } } },
      }),
      this.prisma.db.supplierAdjustment.findMany({ select: { amountPaisa: true } }),
    ]);

    // same arithmetic the Supplier module uses for its own board — deliberately
    // duplicated rather than imported, because Finance must not depend on it
    const openingPaid = payments
      .flatMap((p) => p.allocations)
      .filter((a) => a.purchaseId === null)
      .reduce((s, a) => s + a.amountPaisa, 0);
    const openingTotal = suppliers.reduce((s, x) => s + x.openingDuePaisa, 0);
    const openingRemaining = Math.max(openingTotal - openingPaid, 0);

    const purchaseDue = purchases.reduce((s, p) => {
      const paid = p.payments.reduce((a, x) => a + x.amountPaisa, 0);
      const cut = p.returns.reduce((a, r) => a + r.dueCutPaisa, 0);
      return s + Math.max(p.grandTotalPaisa - cut - paid, 0);
    }, 0);
    const adj = adjustments.reduce((s, a) => s + a.amountPaisa, 0);
    const real = Math.max(openingRemaining + purchaseDue + adj, 0);

    return this.money(
      'supplier-dues',
      'What we owe suppliers',
      'The books and the purchase register must agree, or a supplier bill has been paid or entered in only one of them.',
      books,
      real,
      'Open Suppliers and compare bill by bill. A bill entered straight into the books, or a purchase saved while the API was down, shows up here.',
    );
  }

  /** 1100 Receivable vs orders that are delivered, posted and still unpaid */
  private async customerDues(books: number): Promise<DriftCheck> {
    const orders = await this.prisma.db.order.findMany({
      where: { salesStatus: 'completed', financePostedAt: { not: null }, duePaisa: { gt: 0 } },
      select: { duePaisa: true },
    });
    const real = orders.reduce((s, o) => s + o.duePaisa, 0);
    return this.money(
      'customer-dues',
      'What customers owe us',
      'Money still to be collected should be the same number whether you read it from the orders or from the books.',
      books,
      real,
      'Open Reports → Who owes what and compare with the order list. A payment recorded on the order but never posted lands here.',
    );
  }

  /** 1150 Inventory vs the stock board's own valuation */
  private async stockValue(books: number): Promise<DriftCheck> {
    const [items, stocks] = await Promise.all([
      this.prisma.db.item.findMany({
        where: { isStockTracked: true, itemType: { not: 'SERVICE' } },
        select: {
          id: true,
          costMode: true,
          standardCostPaisa: true,
          computedCostPaisa: true,
        },
      }),
      this.prisma.db.inventoryStock.findMany({ select: { itemId: true, qtyMilli: true } }),
    ]);
    const costOf = new Map(
      items.map((i) => [
        i.id,
        i.costMode === 'AUTO' ? (i.computedCostPaisa ?? i.standardCostPaisa) : i.standardCostPaisa,
      ]),
    );
    const qty = new Map<string, number>();
    for (const s of stocks) qty.set(s.itemId, (qty.get(s.itemId) ?? 0) + s.qtyMilli);

    let real = 0;
    for (const [itemId, milli] of qty) {
      const cost = costOf.get(itemId);
      if (cost == null || milli <= 0) continue; // negative stock is its own alarm
      real += Math.round((milli * cost) / 1000);
    }

    return this.money(
      'stock-value',
      'Value of the stock we hold',
      'The stock sitting in the shop is money. If the books disagree with the stock board, one of them was changed without the other.',
      books,
      real,
      'Run a stocktake. Also check that item costs were not edited after stock was received — changing a cost moves this number without any money moving.',
    );
  }

  /** 1110 Cash with Rider/Courier vs COD delivered but not yet remitted */
  private async carrierCash(books: number): Promise<DriftCheck> {
    const lines = await this.prisma.db.journalLine.findMany({
      where: { account: { code: ACC.CASH_WITH_CARRIER } },
      select: { debitPaisa: true, creditPaisa: true },
    });
    // the ledger side IS the books number; the operational side is delivered
    // COD assignments that no remittance has covered yet
    const delivered = await this.prisma.db.deliveryAssignment.findMany({
      where: { status: 'DELIVERED', isActive: true },
      select: { order: { select: { paymentMethod: true, totalPaisa: true, paidPaisa: true } } },
    });
    const cod = delivered
      .filter((a) => a.order && a.order.paymentMethod === 'cod')
      .reduce((s, a) => s + Math.max((a.order?.totalPaisa ?? 0) - (a.order?.paidPaisa ?? 0), 0), 0);
    const remitted = await this.prisma.db.carrierRemittance.aggregate({
      where: { deletedAt: null },
      _sum: { grossPaisa: true },
    });
    const real = Math.max(cod - (remitted._sum.grossPaisa ?? 0), 0);
    void lines;

    return this.money(
      'carrier-cash',
      'Cash still with riders and couriers',
      'Money collected on delivery but not handed over yet is the easiest money in the business to lose.',
      books,
      real,
      'Open Cash with carriers and settle each rider. A parcel marked delivered whose cash never came back shows up here first.',
    );
  }

  /** orders finished in the shop that never reached the books at all */
  private async unpostedSales(goLive: Date | null): Promise<DriftCheck> {
    const rows = await this.prisma.db.order.findMany({
      where: {
        salesStatus: 'completed',
        financePostedAt: null,
        ...(goLive ? { placedAt: { gte: goLive } } : {}),
      },
      select: { orderNo: true, totalPaisa: true },
      take: 50,
    });
    const total = rows.reduce((s, o) => s + o.totalPaisa, 0);
    return {
      key: 'unposted-sales',
      title: 'Delivered orders missing from the books',
      why: 'These sales happened but the books never heard about them, so income and profit are both understated.',
      booksPaisa: 0,
      realPaisa: total,
      diffPaisa: -total,
      count: rows.length,
      examples: rows.slice(0, 6).map((o) => o.orderNo),
      severity: rows.length === 0 ? 'ok' : 'wrong',
      advice:
        rows.length === 0
          ? 'Every finished order is in the books.'
          : 'Open Failed postings and replay them. If nothing is queued there, these orders were completed while the finance hook was off.',
    };
  }

  /** purchases received that never reached the books

      Purchase has no financePostedAt stamp of its own, so we ask the ledger
      instead: is there an entry whose sourceKey is this purchase's receipt?
      That key is unique (DEC-FIN-023), which makes it a reliable receipt. */
  private async unpostedPurchases(goLive: Date | null): Promise<DriftCheck> {
    const received = await this.prisma.db.purchase.findMany({
      where: {
        status: 'RECEIVED',
        deletedAt: null,
        grandTotalPaisa: { gt: 0 },
        ...(goLive ? { purchaseDate: { gte: goLive } } : {}),
      },
      select: { id: true, purchaseNo: true, grandTotalPaisa: true },
    });
    const keys = received.map((p) => `PURCHASE:${p.id}:received`);
    const posted = keys.length
      ? await this.prisma.db.journalEntry.findMany({
          where: { sourceKey: { in: keys } },
          select: { sourceKey: true },
        })
      : [];
    const have = new Set(posted.map((e) => e.sourceKey));
    const rows = received.filter((p) => !have.has(`PURCHASE:${p.id}:received`)).slice(0, 50);
    const total = rows.reduce((s, p) => s + p.grandTotalPaisa, 0);
    return {
      key: 'unposted-purchases',
      title: 'Received purchases missing from the books',
      why: 'Stock came in but the cost never did, so profit looks better than it is.',
      booksPaisa: 0,
      realPaisa: total,
      diffPaisa: -total,
      count: rows.length,
      examples: rows.slice(0, 6).map((p) => p.purchaseNo),
      severity: rows.length === 0 ? 'ok' : 'wrong',
      advice:
        rows.length === 0
          ? 'Every received purchase is in the books.'
          : 'Open Failed postings and replay them.',
    };
  }

  /** the fail-soft queue (DEC-FIN-010) — anything sitting here is lost money */
  private async postingFailures(): Promise<DriftCheck> {
    const rows = await this.prisma.db.financePostingFailure.findMany({
      select: { sourceType: true, sourceId: true },
      take: 50,
    });
    return {
      key: 'posting-failures',
      title: 'Events waiting to be written into the books',
      why: 'A sale or purchase that failed to post is parked here on purpose — it is not lost, but until it is replayed the books are incomplete.',
      booksPaisa: null,
      realPaisa: null,
      diffPaisa: null,
      count: rows.length,
      examples: rows.slice(0, 6).map((r) => `${r.sourceType}:${r.sourceId.slice(0, 8)}`),
      severity: rows.length === 0 ? 'ok' : 'wrong',
      advice:
        rows.length === 0
          ? 'Nothing waiting.'
          : 'Open Failed postings and press Replay on each one.',
    };
  }

  /** every entry must have debits equal to credits — a broken one poisons every report */
  private async unbalancedEntries(): Promise<DriftCheck> {
    const grouped = await this.prisma.db.journalLine.groupBy({
      by: ['entryId'],
      _sum: { debitPaisa: true, creditPaisa: true },
    });
    const bad = grouped.filter(
      (g) => (g._sum.debitPaisa ?? 0) !== (g._sum.creditPaisa ?? 0),
    );
    let examples: string[] = [];
    if (bad.length) {
      const entries = await this.prisma.db.journalEntry.findMany({
        where: { id: { in: bad.slice(0, 6).map((b) => b.entryId) } },
        select: { entryNo: true },
      });
      examples = entries.map((e) => e.entryNo);
    }
    return {
      key: 'unbalanced',
      title: 'Entries where the two sides do not match',
      why: 'Double-entry only works while every entry balances. One broken entry makes every report wrong by that amount.',
      booksPaisa: null,
      realPaisa: null,
      diffPaisa: null,
      count: bad.length,
      examples,
      severity: bad.length === 0 ? 'ok' : 'wrong',
      advice:
        bad.length === 0
          ? 'Every entry balances.'
          : 'These cannot happen through the screens — they mean something wrote to the database directly. Reverse them and post again.',
    };
  }

  /** a place money sits cannot hold less than nothing */
  private async negativeMoney(
    accounts: { code: string; name: string; balancePaisa: number; isMoneyAccount: boolean }[],
  ): Promise<DriftCheck> {
    const bad = accounts.filter((a) => a.isMoneyAccount && a.balancePaisa < 0);
    const total = bad.reduce((s, a) => s + a.balancePaisa, 0);
    return {
      key: 'negative-money',
      title: 'A money account showing less than zero',
      why: 'A wallet cannot hold negative taka. It means money was paid out of a place that never received it — usually an opening balance that was never entered.',
      booksPaisa: total,
      realPaisa: 0,
      diffPaisa: total,
      count: bad.length,
      examples: bad.map((a) => `${a.name} ${(a.balancePaisa / 100).toLocaleString()}`),
      severity: bad.length === 0 ? 'ok' : 'wrong',
      advice:
        bad.length === 0
          ? 'Every wallet holds zero or more.'
          : 'Enter the real opening balance for that account, or find the payment that was recorded against the wrong wallet.',
    };
  }

  /** 1160 Goods Out — stock that left the shop and never became a sale */
  private async staleGoodsOut(books: number): Promise<DriftCheck> {
    const cut = new Date(Date.now() - 7 * 86400000);
    const lines = await this.prisma.db.journalLine.findMany({
      where: { account: { code: ACC.GOODS_OUT }, entry: { entryDate: { lt: cut } } },
      select: { orderId: true, debitPaisa: true, creditPaisa: true },
      take: 5000,
    });
    const per = new Map<string, number>();
    for (const l of lines) {
      if (!l.orderId) continue;
      per.set(l.orderId, (per.get(l.orderId) ?? 0) + l.debitPaisa - l.creditPaisa);
    }
    const openIds = [...per.entries()].filter(([, v]) => v > 0);
    const stuck = openIds.reduce((s, [, v]) => s + v, 0);
    let examples: string[] = [];
    if (openIds.length) {
      const orders = await this.prisma.db.order.findMany({
        where: { id: { in: openIds.slice(0, 6).map(([k]) => k) } },
        select: { orderNo: true },
      });
      examples = orders.map((o) => o.orderNo);
    }
    return {
      key: 'goods-out',
      title: 'Goods that left the shop over a week ago and never became a sale',
      why: 'Stock is deducted when an order is being prepared and only turns into cost when it is delivered. Anything still sitting here a week later either was never delivered, or walked out.',
      booksPaisa: books,
      realPaisa: 0,
      diffPaisa: stuck,
      count: openIds.length,
      examples,
      severity: stuck < NOISE_PAISA ? 'ok' : stuck >= WRONG_PAISA ? 'wrong' : 'watch',
      advice:
        stuck < NOISE_PAISA
          ? 'Nothing stuck.'
          : 'Find these orders. Either mark them delivered, or record the loss as wastage so the books show the truth.',
    };
  }
}
