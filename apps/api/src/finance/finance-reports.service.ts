import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ACC, ACC2, FinanceService } from './finance.service';

/*  Reports — every number computed here, never in the browser (FIN-RULE-016 / D1).
    The leakage set comes straight out of RADIAN_FINANCE_REVIEW.md §5: the paths
    money or goods can quietly walk out of the business.
*/

@Injectable()
export class FinanceReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly finance: FinanceService,
  ) {}

  private range(from?: string, to?: string) {
    const now = new Date();
    return {
      start: from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1),
      end: to ? new Date(to) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59),
    };
  }

  /* ==================== profit & loss ==================== */

  async profitAndLoss(from?: string, to?: string) {
    const { start, end } = this.range(from, to);
    const accs = await this.finance.accounts();
    const byId = new Map(accs.map((a) => [a.id, a]));
    const sums = await this.prisma.db.journalLine.groupBy({
      by: ['accountId'],
      where: { entry: { entryDate: { gte: start, lte: end } } },
      _sum: { debitPaisa: true, creditPaisa: true },
    });

    type Row = { code: string; name: string; group: string; paisa: number };
    const income: Row[] = [];
    const expense: Row[] = [];
    for (const s of sums) {
      const a = byId.get(s.accountId);
      if (!a) continue;
      const d = s._sum.debitPaisa ?? 0;
      const c = s._sum.creditPaisa ?? 0;
      if (a.type === 'INCOME' && c - d !== 0)
        income.push({ code: a.code, name: a.name, group: a.groupName ?? 'Other', paisa: c - d });
      if (a.type === 'EXPENSE' && d - c !== 0)
        expense.push({ code: a.code, name: a.name, group: a.groupName ?? 'Other', paisa: d - c });
    }
    income.sort((x, y) => y.paisa - x.paisa);
    expense.sort((x, y) => y.paisa - x.paisa);

    const totalIncome = income.reduce((n, r) => n + r.paisa, 0);
    const cogs = expense.filter((r) => r.group === 'Cost of Goods Sold').reduce((n, r) => n + r.paisa, 0);
    const otherExpense = expense.reduce((n, r) => n + r.paisa, 0) - cogs;
    const grossProfit = totalIncome - cogs;

    // group the running costs so the page reads like a real P&L
    const byGroup = new Map<string, number>();
    for (const r of expense) {
      if (r.group === 'Cost of Goods Sold') continue;
      byGroup.set(r.group, (byGroup.get(r.group) ?? 0) + r.paisa);
    }

    return {
      from: start.toISOString(),
      to: end.toISOString(),
      income,
      totalIncomePaisa: totalIncome,
      cogsPaisa: cogs,
      grossProfitPaisa: grossProfit,
      grossMarginBp: totalIncome > 0 ? Math.round((grossProfit / totalIncome) * 10000) : 0,
      expenseGroups: [...byGroup.entries()].map(([group, paisa]) => ({ group, paisa })).sort((a, b) => b.paisa - a.paisa),
      expense,
      totalExpensePaisa: otherExpense,
      netProfitPaisa: grossProfit - otherExpense,
    };
  }

  /* ==================== who owes what, and for how long ==================== */

  async aging() {
    const bucket = (days: number) =>
      days <= 7 ? '0–7 days' : days <= 15 ? '8–15 days' : days <= 30 ? '16–30 days' : 'over 30 days';

    // customers — unpaid delivered orders
    const orders = await this.prisma.db.order.findMany({
      // only orders whose revenue is already in the books — otherwise this report
      // and the Customer Receivable account would tell two different stories
      where: { duePaisa: { gt: 0 }, salesStatus: 'completed', financePostedAt: { not: null } },
      select: { id: true, orderNo: true, placedAt: true, duePaisa: true, senderName: true, senderPhone: true },
      orderBy: { placedAt: 'asc' },
      take: 500,
    });
    const receivable = orders.map((o) => {
      const days = Math.floor((Date.now() - o.placedAt.getTime()) / 86400000);
      return {
        ref: o.orderNo,
        who: o.senderName,
        phone: o.senderPhone,
        paisa: o.duePaisa,
        days,
        bucket: bucket(days),
      };
    });

    // suppliers — bills still owing
    const purchases = await this.prisma.db.purchase.findMany({
      where: { deletedAt: null },
      select: {
        id: true, purchaseNo: true, supplierName: true, purchaseDate: true,
        /* NST-REV-1 (30 Jul) — the nested `where` is the whole point of this line.
           The soft-delete extension does NOT reach into a nested include (its own
           comment says so), and this is the supplier PAYABLES AGEING report. A
           soft-deleted PurchasePayment was still being summed into `paid`, so `due`
           came out SMALLER than it is — the report told the owner he owed his suppliers
           less than he does. Note the parent already filters `deletedAt: null` two
           lines up: whoever wrote this knew about soft delete, and the nested relation
           simply was not covered by the thing they were relying on. */
        grandTotalPaisa: true,
        payments: { where: { deletedAt: null }, select: { amountPaisa: true } },
      },
      orderBy: { purchaseDate: 'asc' },
      take: 500,
    });
    const payable = purchases
      .map((p) => {
        const paid = p.payments.reduce((n, x) => n + x.amountPaisa, 0);
        const due = p.grandTotalPaisa - paid;
        const days = Math.floor((Date.now() - p.purchaseDate.getTime()) / 86400000);
        return { ref: p.purchaseNo, who: p.supplierName, paisa: due, days, bucket: bucket(days) };
      })
      .filter((r) => r.paisa > 0);

    const totals = (rows: { paisa: number; bucket: string }[]) => {
      const m = new Map<string, number>();
      for (const r of rows) m.set(r.bucket, (m.get(r.bucket) ?? 0) + r.paisa);
      return ['0–7 days', '8–15 days', '16–30 days', 'over 30 days'].map((b) => ({
        bucket: b,
        paisa: m.get(b) ?? 0,
      }));
    };

    return {
      receivable: { rows: receivable, buckets: totals(receivable), totalPaisa: receivable.reduce((n, r) => n + r.paisa, 0) },
      payable: { rows: payable, buckets: totals(payable), totalPaisa: payable.reduce((n, r) => n + r.paisa, 0) },
    };
  }

  /* ==================== daily money flow ==================== */

  /** opening → in → out → closing, per day, across all money accounts */
  async balanceFlow(days = 30) {
    const accs = await this.finance.accounts();
    const money = accs.filter((a) => a.isMoneyAccount);
    const ids = new Set(money.map((a) => a.id));
    const closing = money.reduce((n, a) => n + a.balancePaisa, 0);

    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const lines = await this.prisma.db.journalLine.findMany({
      where: { accountId: { in: [...ids] }, entry: { entryDate: { gte: since } } },
      include: { entry: { select: { entryDate: true } } },
      take: 5000,
    });

    const byDay = new Map<string, { inPaisa: number; outPaisa: number }>();
    for (const l of lines) {
      const key = l.entry.entryDate.toISOString().slice(0, 10);
      const cur = byDay.get(key) ?? { inPaisa: 0, outPaisa: 0 };
      cur.inPaisa += l.debitPaisa;
      cur.outPaisa += l.creditPaisa;
      byDay.set(key, cur);
    }

    // walk backwards from today's closing balance to get each day's opening
    const out: { date: string; openingPaisa: number; inPaisa: number; outPaisa: number; closingPaisa: number }[] = [];
    let running = closing;
    for (let i = 0; i < days; i += 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const m = byDay.get(key) ?? { inPaisa: 0, outPaisa: 0 };
      const opening = running - m.inPaisa + m.outPaisa;
      out.push({ date: key, openingPaisa: opening, inPaisa: m.inPaisa, outPaisa: m.outPaisa, closingPaisa: running });
      running = opening;
    }
    return out.reverse().filter((r) => r.inPaisa > 0 || r.outPaisa > 0 || r.closingPaisa !== 0);
  }

  /* ==================== leakage watch (review §5) ==================== */

  async leakage() {
    const accs = await this.finance.accounts();
    const byCode = new Map(accs.map((a) => [a.code, a]));

    /* 1. goods that left the warehouse and never arrived anywhere */
    const goodsOut = byCode.get(ACC.GOODS_OUT);
    const stuck: { orderNo: string; paisa: number; days: number }[] = [];
    if (goodsOut) {
      const lines = await this.prisma.db.journalLine.findMany({
        where: { accountId: goodsOut.id },
        include: { entry: { select: { entryDate: true } } },
        take: 2000,
      });
      const perOrder = new Map<string, { paisa: number; oldest: Date }>();
      for (const l of lines) {
        if (!l.orderId) continue;
        const cur = perOrder.get(l.orderId) ?? { paisa: 0, oldest: l.entry.entryDate };
        cur.paisa += l.debitPaisa - l.creditPaisa;
        if (l.entry.entryDate < cur.oldest) cur.oldest = l.entry.entryDate;
        perOrder.set(l.orderId, cur);
      }
      const openIds = [...perOrder.entries()].filter(([, v]) => v.paisa > 0).map(([k]) => k);
      if (openIds.length > 0) {
        const orders = await this.prisma.db.order.findMany({
          where: { id: { in: openIds } },
          select: { id: true, orderNo: true },
        });
        const nameById = new Map(orders.map((o) => [o.id, o.orderNo]));
        for (const id of openIds) {
          const v = perOrder.get(id)!;
          stuck.push({
            orderNo: nameById.get(id) ?? id.slice(0, 8),
            paisa: v.paisa,
            days: Math.floor((Date.now() - v.oldest.getTime()) / 86400000),
          });
        }
        stuck.sort((a, b) => b.days - a.days);
      }
    }

    /* 2. who is writing off stock */
    const issues = await this.prisma.db.stockIssue.findMany({
      where: { deletedAt: null },
      select: { kind: true, actor: true, totalValuePaisa: true, createdAt: true },
      take: 1000,
    });
    const byActor = new Map<string, { wastagePaisa: number; giftPaisa: number; count: number }>();
    for (const i of issues) {
      const key = i.actor ?? 'not recorded';
      const cur = byActor.get(key) ?? { wastagePaisa: 0, giftPaisa: 0, count: 0 };
      if (i.kind === 'WASTAGE') cur.wastagePaisa += i.totalValuePaisa;
      else cur.giftPaisa += i.totalValuePaisa;
      cur.count += 1;
      byActor.set(key, cur);
    }
    const writeOffs = [...byActor.entries()]
      .map(([actor, v]) => ({ actor, ...v }))
      .sort((a, b) => b.wastagePaisa + b.giftPaisa - (a.wastagePaisa + a.giftPaisa));

    /* 3. price given away at the counter */
    const adjust = byCode.get(ACC.SALES_ADJUSTMENT);
    const discounts = await this.prisma.db.order.findMany({
      where: { OR: [{ discountPaisa: { gt: 0 } }, { adjustmentPaisa: { not: 0 } }] },
      select: { orderNo: true, discountPaisa: true, adjustmentPaisa: true, placedAt: true, fulfillmentType: true },
      orderBy: { placedAt: 'desc' },
      take: 50,
    });

    /* 4. store credit given out and used */
    const credits = await this.prisma.db.customerCredit.findMany({
      where: { deletedAt: null },
      select: { kind: true, amountPaisa: true, actorName: true, createdAt: true },
      take: 500,
    });
    const issued = credits.filter((c) => c.kind === 'ISSUED').reduce((n, c) => n + c.amountPaisa, 0);
    const consumed = credits.filter((c) => c.kind === 'CONSUMED').reduce((n, c) => n + Math.abs(c.amountPaisa), 0);

    /* 5. staff advances that never come back */
    const advanceAcc = byCode.get(ACC2.EMPLOYEE_ADVANCE);
    let staffOutstanding = 0;
    if (advanceAcc) staffOutstanding = advanceAcc.balancePaisa;

    return {
      goodsStuckOut: {
        rows: stuck.slice(0, 20),
        totalPaisa: stuck.reduce((n, r) => n + r.paisa, 0),
        overdueCount: stuck.filter((r) => r.days > 7).length,
      },
      writeOffs,
      discounts: {
        rows: discounts.map((o) => ({
          orderNo: o.orderNo,
          discountPaisa: o.discountPaisa,
          adjustmentPaisa: o.adjustmentPaisa,
          at: o.placedAt.toISOString(),
          counter: o.fulfillmentType === 'COUNTER',
        })),
        adjustmentTotalPaisa: adjust?.balancePaisa ?? 0,
      },
      storeCredit: { issuedPaisa: issued, usedPaisa: consumed, outstandingPaisa: issued - consumed },
      staffAdvanceOutstandingPaisa: staffOutstanding,
    };
  }

  /* ==================== what we are committed to every month ==================== */

  /**
   * Salary + the bills that arrive whether or not anything sells. This is the
   * number that decides how much has to go out of the door each month.
   */
  async commitments() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const accs = await this.finance.accounts();
    const byId = new Map(accs.map((a) => [a.id, a]));

    type Item = {
      kind: 'BILL' | 'PARTNER_SALARY' | 'STAFF_SALARY' | 'DEPRECIATION' | 'PREPAID' | 'LOAN';
      name: string;
      monthlyPaisa: number;
      detail: string;
      status: 'paid' | 'due' | 'planned';
      dayOfMonth?: number;
    };
    const items: Item[] = [];

    /* recurring bills the owner set up */
    const bills = await this.prisma.db.recurringExpense.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { dayOfMonth: 'asc' },
    });
    for (const b of bills) {
      const acc = byId.get(b.accountId);
      const posted = b.lastPostedFor ? b.lastPostedFor.getTime() === monthStart.getTime() : false;
      items.push({
        kind: 'BILL',
        name: b.name,
        monthlyPaisa: b.amountPaisa,
        detail: acc?.name ?? 'expense',
        status: posted ? 'paid' : 'due',
        dayOfMonth: b.dayOfMonth,
      });
    }

    /* partner salaries — agreed, whether or not paid yet */
    const partners = await this.prisma.db.partner.findMany({
      where: { deletedAt: null, isActive: true, monthlySalaryPaisa: { gt: 0 } },
    });
    const paidThisMonth = await this.prisma.db.partnerTransaction.findMany({
      where: { kind: 'SALARY', happenedAt: { gte: monthStart }, deletedAt: null },
      select: { partnerId: true, amountPaisa: true },
    });
    for (const p of partners) {
      const paid = paidThisMonth.filter((t) => t.partnerId === p.id).reduce((n, t) => n + t.amountPaisa, 0);
      items.push({
        kind: 'PARTNER_SALARY',
        name: p.name,
        monthlyPaisa: p.monthlySalaryPaisa,
        detail: 'partner salary',
        status: paid >= p.monthlySalaryPaisa ? 'paid' : 'due',
      });
    }

    /* staff salaries — from what actually went through the books */
    const staffAcc = accs.find((a) => a.code === ACC.STAFF_SALARY);
    const staffLines = staffAcc
      ? await this.prisma.db.journalLine.findMany({
          where: { accountId: staffAcc.id },
          include: { entry: { select: { entryDate: true } } },
          take: 1000,
        })
      : [];
    // HR-D06 — group by the real person where we have one; two different people
    // called "Rakib" must not be averaged into a single salary line. Rows posted
    // before the HR module have a name only, and still group by that.
    const byPerson = new Map<
      string,
      { name: string; total: number; months: Set<string>; thisMonth: number }
    >();
    for (const l of staffLines) {
      const key = l.employeeId ?? `name:${l.employeeName ?? 'not named'}`;
      const cur =
        byPerson.get(key) ??
        { name: l.employeeName ?? 'not named', total: 0, months: new Set<string>(), thisMonth: 0 };
      const amt = l.debitPaisa - l.creditPaisa;
      cur.total += amt;
      cur.months.add(l.entry.entryDate.toISOString().slice(0, 7));
      if (l.entry.entryDate >= monthStart) cur.thisMonth += amt;
      byPerson.set(key, cur);
    }
    const staff = [...byPerson.values()].map((v) => ({
      name: v.name,
      averagePaisa: Math.round(v.total / Math.max(1, v.months.size)),
      thisMonthPaisa: v.thisMonth,
      monthsPaid: v.months.size,
    }));
    for (const s of staff)
      items.push({
        kind: 'STAFF_SALARY',
        name: s.name,
        monthlyPaisa: s.averagePaisa,
        detail: 'staff salary (average)',
        status: s.thisMonthPaisa > 0 ? 'paid' : 'due',
      });

    /* wear and tear + advance rent slices — real monthly costs with no cash movement */
    const assets = await this.prisma.db.fixedAsset.findMany({
      where: { deletedAt: null, disposedAt: null },
    });
    for (const a of assets) {
      const monthly = Math.round(Math.max(0, a.costPaisa - a.salvagePaisa) / Math.max(1, a.usefulLifeMonths));
      if (monthly <= 0 || a.accumDepPaisa >= a.costPaisa - a.salvagePaisa) continue;
      items.push({
        kind: 'DEPRECIATION',
        name: a.name,
        monthlyPaisa: monthly,
        detail: 'wear and tear (no cash leaves)',
        status: a.lastDepreciatedOn && a.lastDepreciatedOn.getTime() >= monthStart.getTime() ? 'paid' : 'planned',
      });
    }
    const prepaids = await this.prisma.db.prepaidItem.findMany({
      where: { deletedAt: null, closedAt: null, months: { gt: 0 } },
    });
    for (const p of prepaids) {
      const monthly = Math.round(p.totalPaisa / Math.max(1, p.months));
      if (p.amortizedPaisa >= p.totalPaisa) continue;
      items.push({
        kind: 'PREPAID',
        name: p.name,
        monthlyPaisa: monthly,
        detail: 'already paid, spread monthly',
        status: p.lastAmortizedOn && p.lastAmortizedOn.getTime() >= monthStart.getTime() ? 'paid' : 'planned',
      });
    }

    /* loans — interest is the monthly cost */
    const loans = await this.prisma.db.loan.findMany({ where: { deletedAt: null, closedAt: null } });
    for (const l of loans) {
      const monthlyInterest = Math.round((l.principalPaisa * l.interestRateBp) / 10000 / 12);
      if (monthlyInterest <= 0) continue;
      items.push({
        kind: 'LOAN',
        name: `${l.lenderName} — interest`,
        monthlyPaisa: monthlyInterest,
        detail: `${l.interestRateBp / 100}% a year`,
        status: 'planned',
      });
    }

    const totalMonthly = items.reduce((n, i) => n + i.monthlyPaisa, 0);
    const cashOut = items
      .filter((i) => i.kind !== 'DEPRECIATION' && i.kind !== 'PREPAID')
      .reduce((n, i) => n + i.monthlyPaisa, 0);
    const stillDue = items.filter((i) => i.status === 'due').reduce((n, i) => n + i.monthlyPaisa, 0);

    /* how much has to be sold to cover it, at the margin we are actually running */
    const sums = await this.prisma.db.journalLine.groupBy({
      by: ['accountId'],
      where: { entry: { entryDate: { gte: new Date(now.getFullYear(), now.getMonth() - 2, 1) } } },
      _sum: { debitPaisa: true, creditPaisa: true },
    });
    let income = 0;
    let variable = 0;
    for (const s of sums) {
      const a = byId.get(s.accountId);
      if (!a) continue;
      const d = s._sum.debitPaisa ?? 0;
      const c = s._sum.creditPaisa ?? 0;
      if (a.type === 'INCOME') income += c - d;
      if (a.type === 'EXPENSE' && a.costBehavior === 'VARIABLE') variable += d - c;
    }
    const marginBp = income > 0 ? Math.round(((income - variable) / income) * 10000) : 0;
    const salesNeeded = marginBp > 0 ? Math.round((totalMonthly / marginBp) * 10000 / 100) * 100 : 0;

    return {
      items: items.sort((a, b) => b.monthlyPaisa - a.monthlyPaisa),
      totalMonthlyPaisa: totalMonthly,
      cashOutMonthlyPaisa: cashOut,
      stillDuePaisa: stillDue,
      dailyPaisa: Math.round(totalMonthly / 30),
      marginBp,
      salesNeededPaisa: salesNeeded,
      staff,
    };
  }

  /* ==================== trial balance ==================== */

  async trialBalance() {
    const accs = await this.finance.accounts();
    const rows = accs
      .filter((a) => a.debitPaisa !== 0 || a.creditPaisa !== 0)
      .map((a) => ({
        code: a.code,
        name: a.name,
        type: a.type,
        group: a.groupName,
        debitPaisa: a.debitPaisa,
        creditPaisa: a.creditPaisa,
      }));
    const debit = rows.reduce((n, r) => n + r.debitPaisa, 0);
    const credit = rows.reduce((n, r) => n + r.creditPaisa, 0);
    return { rows, totalDebitPaisa: debit, totalCreditPaisa: credit, balanced: debit === credit };
  }

  /* ==================== what actually made money ==================== */

  /** profit by zone and by channel — only possible because every sale line is tagged */
  async salesBreakdown(from?: string, to?: string) {
    const { start, end } = this.range(from, to);
    const accs = await this.finance.accounts();
    const sales = accs.find((a) => a.code === ACC.SALES);
    const cogs = accs.find((a) => a.code === ACC.COGS);
    if (!sales || !cogs) return { zones: [], channels: [] };

    const lines = await this.prisma.db.journalLine.findMany({
      where: {
        accountId: { in: [sales.id, cogs.id] },
        entry: { entryDate: { gte: start, lte: end } },
      },
      select: { accountId: true, debitPaisa: true, creditPaisa: true, zone: true, channelId: true },
      take: 5000,
    });

    const zone = new Map<string, { salesPaisa: number; costPaisa: number }>();
    const channel = new Map<string, { salesPaisa: number; costPaisa: number }>();
    for (const l of lines) {
      const isSale = l.accountId === sales.id;
      const amount = isSale ? l.creditPaisa - l.debitPaisa : l.debitPaisa - l.creditPaisa;
      const z = l.zone ?? 'not recorded';
      const c = l.channelId ?? 'not recorded';
      const zc = zone.get(z) ?? { salesPaisa: 0, costPaisa: 0 };
      const cc = channel.get(c) ?? { salesPaisa: 0, costPaisa: 0 };
      if (isSale) { zc.salesPaisa += amount; cc.salesPaisa += amount; }
      else { zc.costPaisa += amount; cc.costPaisa += amount; }
      zone.set(z, zc);
      channel.set(c, cc);
    }

    const channels = await this.prisma.db.channel.findMany({ select: { id: true, name: true } });
    const chName = new Map(channels.map((c) => [c.id, c.name]));

    return {
      zones: [...zone.entries()].map(([k, v]) => ({
        name: k, ...v, marginPaisa: v.salesPaisa - v.costPaisa,
      })).sort((a, b) => b.salesPaisa - a.salesPaisa),
      channels: [...channel.entries()].map(([k, v]) => ({
        name: chName.get(k) ?? k, ...v, marginPaisa: v.salesPaisa - v.costPaisa,
      })).sort((a, b) => b.salesPaisa - a.salesPaisa),
    };
  }
}
