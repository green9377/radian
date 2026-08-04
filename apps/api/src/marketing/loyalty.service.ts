import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { SettingsService } from './settings.service';
import { FinanceService, ACC, ACC2 } from '../finance/finance.service';

/*
  LOYALTY — MKT-D21. Points on ordinary purchases.

  THE OWNER'S RULES, locked 29 Jul 2026, every number a setting:

    · 1 point = ৳1. Already true — Referral uses the same ledger (MKT-D16).
    · EARN 1 % of (goods − discount). Not delivery, not VAT: delivery goes to
      the rider and VAT belongs to the government, so paying points on either
      is paying out of margin on money that was never Radian's.
    · Earned when the order is DELIVERED — deliberately later than Referral,
      which pays on confirmed. Referral happens a few times a year; purchase
      points happen on every order, and paying on confirmed opens a hole:
      order Monday, spend the points Tuesday, cancel on Wednesday. The nightly
      sweep would notice, but there would be nothing left to take back.
    · SPEND at checkout only, capped at 20 % of (goods − discount) — the
      customer pays at least 80 % from their own pocket. There is NO minimum
      order value and no banding below the cap: 95 % cash and 5 % points is
      perfectly fine. Only a floor of 50 points per redemption, so the ledger
      does not fill with ৳3 entries.
    · Points may NOT pay delivery or VAT, for the same reason they are not
      earned on them.
    · OFF by default until the radianbd.com customers are migrated and their
      opening balances are seeded.

  WHY POINTS ARE A TENDER AND NOT A DISCOUNT. A redemption settles part of the
  bill; it does not reduce the bill. The invoice keeps its full value, VAT is
  computed on the full value, and the shop still owes the government the same
  VAT in cash. Treating points as a discount would quietly shrink the taxable
  value of every order they touch — a tax position nobody here chose to take.

  ACCOUNTING, both halves:
    earning     DR 5453 Loyalty Points Cost   CR 2130 Customer Points Payable
    redemption  DR 2130 Customer Points Payable   CR 1100 Receivable
    reversal    DR 2130                        CR 5453
  The point is a liability the day it is earned, not the day it is spent —
  otherwise the books show a profit that is already promised away.
*/

type Reason =
  | 'REFERRAL' | 'REFERRAL_REVERSED' | 'PURCHASE' | 'PURCHASE_REVERSED'
  | 'OPENING' | 'REDEEMED' | 'ADJUSTMENT' | 'EXPIRED';

@Injectable()
export class LoyaltyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly finance: FinanceService,
  ) {}

  /* ---------------- the ledger ---------------- */

  /** the balance is always the SUM of the ledger, never a stored number */
  async balance(customerId: string) {
    const r = await this.prisma.loyaltyPoint.aggregate({
      where: { customerId },
      _sum: { deltaPoints: true },
    });
    return r._sum.deltaPoints ?? 0;
  }

  /**
   * One row in the points ledger, with the matching journal entry.
   *
   * `costAccount` differs by what caused it: 5453 for a purchase, 5452 for a
   * referral. Redemption passes `settle: true` and hits 1100 instead, because
   * spending a point discharges a liability against the bill — it does not
   * un-spend the cost, which was real the day the point was given.
   */
  private async write(input: {
    customerId: string;
    delta: number;
    reason: Reason;
    refType?: string;
    refId?: string;
    note?: string;
    actorName: string;
    sourceKey: string;
    narration: string;
    settle?: boolean;
  }) {
    const s = await this.settings.get();
    const paisa = Math.abs(input.delta) * s.pointValuePaisa;

    let entryId: string | null = null;
    if (paisa > 0) {
      const earning = input.delta > 0;
      const other = input.settle ? ACC.RECEIVABLE : ACC2.LOYALTY_COST;

      const entry = await this.finance.postEntry({
        sourceType: 'MANUAL',
        sourceKey: input.sourceKey,
        narration: input.narration,
        actorName: input.actorName,
        lines: earning
          ? [
              { accountCode: other, debitPaisa: paisa },
              { accountCode: ACC2.LOYALTY_POINTS, creditPaisa: paisa },
            ]
          : [
              { accountCode: ACC2.LOYALTY_POINTS, debitPaisa: paisa },
              { accountCode: other, creditPaisa: paisa },
            ],
      });

      /*  MKT-RULE-016 — the HR-R28 guard. If the ledger refused the entry,
          do NOT write a points row: a balance the books know nothing about is
          exactly the bug that let a payroll say PAID over an empty ledger. */
      if (!entry)
        throw new BadRequestException(
          'The points were NOT recorded — the ledger refused the entry (duplicate sourceKey). Nothing was saved.',
        );
      entryId = entry.id;
    }

    return this.prisma.db.loyaltyPoint.create({
      data: {
        customerId: input.customerId,
        deltaPoints: input.delta,
        reason: input.reason,
        refType: input.refType ?? null,
        refId: input.refId ?? null,
        note: input.note ?? null,
        journalEntryId: entryId,
        actorName: input.actorName,
      },
    });
  }

  /* ---------------- earning ---------------- */

  /** the rate in force right now, festival multiplier included */
  async currentRate() {
    const s = await this.settings.get();
    const live =
      s.earnMultiplierBp !== 10000 &&
      (!s.multiplierUntil || s.multiplierUntil > new Date());
    const mult = live ? s.earnMultiplierBp : 10000;
    return {
      baseBp: s.earnRateBp,
      multiplierBp: mult,
      /* the two multiplied — 100 bp × 2 = 200 bp = 2 % */
      effectiveBp: Math.round((s.earnRateBp * mult) / 10000),
      festivalOn: live,
      until: live ? s.multiplierUntil : null,
    };
  }

  /**
   * MKT-D21 — points for one delivered order. Idempotent: the (refType, refId)
   * pair is checked first, so the fifteen-minute sweep can run all day.
   */
  async earnForOrder(orderId: string, actorName = 'system') {
    const s = await this.settings.get();
    if (!s.loyaltyEnabled) return { skipped: 'loyalty is switched off' as const };

    const order = await this.prisma.db.order.findUnique({
      where: { id: orderId },
      select: {
        id: true, orderNo: true, customerId: true,
        subtotalPaisa: true, discountPaisa: true,
        salesStatus: true, deliveryStatus: true,
      },
    });
    if (!order) return { skipped: 'no such order' as const };

    // the goods have to have arrived (the owner's rule, 29 Jul)
    if (order.deliveryStatus !== 'delivered') return { skipped: 'not delivered yet' as const };
    if (order.salesStatus === 'cancelled') return { skipped: 'cancelled' as const };

    const already = await this.prisma.loyaltyPoint.findFirst({
      where: { refType: 'ORDER', refId: orderId, reason: 'PURCHASE' },
    });
    if (already) return { skipped: 'already earned' as const, row: already };

    /*  Goods after discount. If the customer paid part of THIS order with
        points, that part sits in discountPaisa's neighbour pointsPaisa — and
        it is deliberately NOT subtracted here, because points are a tender,
        not a discount: the customer still bought ৳1,000 of flowers. */
    const base = Math.max(0, order.subtotalPaisa - order.discountPaisa);
    const rate = await this.currentRate();
    const paisa = Math.round((base * rate.effectiveBp) / 10000);
    const points = Math.floor(paisa / s.pointValuePaisa);
    if (points <= 0) return { skipped: 'the order is too small to earn a point' as const };

    const row = await this.write({
      customerId: order.customerId,
      delta: points,
      reason: 'PURCHASE',
      refType: 'ORDER',
      refId: order.id,
      note: `${(rate.effectiveBp / 100).toFixed(2)}% of ৳${(base / 100).toFixed(2)} on ${order.orderNo}`,
      actorName,
      sourceKey: `LOYEARN:${order.id}`,
      narration: `Loyalty points — ${order.orderNo}`,
    });

    return { earned: points, base, rateBp: rate.effectiveBp, row };
  }

  /**
   * The order was cancelled or wholly returned, so the points come back.
   *
   * A PARTIAL return is deliberately left alone and flagged instead, exactly
   * as commission is (MKT-D14): quietly docking somebody's points by a formula
   * nobody can explain is worse than showing it.
   */
  async reverseForOrder(orderId: string, actorName = 'system') {
    const earned = await this.prisma.loyaltyPoint.findFirst({
      where: { refType: 'ORDER', refId: orderId, reason: 'PURCHASE' },
    });
    if (!earned) return { skipped: 'nothing was earned on this order' as const };

    const undone = await this.prisma.loyaltyPoint.findFirst({
      where: { refType: 'ORDER_REVERSED', refId: orderId },
    });
    if (undone) return { skipped: 'already taken back' as const };

    const row = await this.write({
      customerId: earned.customerId,
      delta: -earned.deltaPoints,
      reason: 'PURCHASE_REVERSED',
      refType: 'ORDER_REVERSED',
      refId: orderId,
      note: 'the order was cancelled or wholly returned',
      actorName,
      sourceKey: `LOYREV:${orderId}`,
      narration: `Loyalty points taken back — order ${orderId}`,
    });
    return { reversed: earned.deltaPoints, row };
  }

  /* ---------------- spending ---------------- */

  /**
   * How many points may be used on this order, and why not more.
   *
   * This is the ONE place the cap is decided. Nothing else may spend points —
   * the "turn points into store credit" button was removed on 29 Jul precisely
   * because a rule with two doors is a rule people walk around.
   */
  async quote(orderId: string) {
    const s = await this.settings.get();
    const order = await this.prisma.db.order.findUnique({
      where: { id: orderId },
      select: {
        id: true, orderNo: true, customerId: true,
        subtotalPaisa: true, discountPaisa: true,
        deliveryPaisa: true, vatPaisa: true, totalPaisa: true,
        pointsUsed: true, pointsPaisa: true,
        salesStatus: true,
        customer: { select: { id: true, name: true } },
      },
    });
    if (!order) throw new NotFoundException('No such order');

    const base = Math.max(0, order.subtotalPaisa - order.discountPaisa);
    const capPaisa = Math.round((base * s.redeemMaxBp) / 10000);
    const capPoints = Math.floor(capPaisa / s.pointValuePaisa);

    const held = await this.balance(order.customerId);
    const alreadyUsed = order.pointsUsed;
    const roomLeft = Math.max(0, capPoints - alreadyUsed);
    const usable = Math.min(held, roomLeft);

    /*  The floor applies to what is actually about to be spent, not to the
        balance. Somebody with 60 points on a ৳200 order can spend 40 — and
        40 is under the floor, so the answer is no, with a reason. */
    const meetsFloor = usable >= s.minRedeemPoints;

    return {
      orderId: order.id,
      orderNo: order.orderNo,
      customer: order.customer,
      enabled: s.loyaltyEnabled,
      basePaisa: base,
      /* said out loud, because these two are the whole reason the cap is not
         simply a share of the total the customer sees */
      deliveryPaisa: order.deliveryPaisa,
      vatPaisa: order.vatPaisa,
      capBp: s.redeemMaxBp,
      capPoints,
      alreadyUsed,
      balance: held,
      maxUsable: meetsFloor ? usable : 0,
      minRedeemPoints: s.minRedeemPoints,
      pointValuePaisa: s.pointValuePaisa,
      why: !s.loyaltyEnabled
        ? 'The loyalty scheme is switched off.'
        : order.salesStatus === 'cancelled'
          ? 'This order is cancelled.'
          : held <= 0
            ? 'This customer has no points.'
            : roomLeft <= 0
              ? `The cap for this order (${s.redeemMaxBp / 100}% of the goods) is already used.`
              : !meetsFloor
                ? `Only ${usable} point${usable === 1 ? '' : 's'} could be used here, and the smallest redemption is ${s.minRedeemPoints}.`
                : `Up to ${usable} points — the customer still pays at least ${100 - s.redeemMaxBp / 100}% from their own pocket, plus all delivery and VAT.`,
    };
  }

  /** spend points against an order. The cap lives in quote(), and so does the truth. */
  async redeemForOrder(orderId: string, points: number, actorName: string) {
    const p = Math.floor(points);
    if (p <= 0) throw new BadRequestException('How many points?');

    const s = await this.settings.get();
    if (!s.loyaltyEnabled) throw new BadRequestException('The loyalty scheme is switched off');

    const q = await this.quote(orderId);
    if (q.maxUsable <= 0) throw new BadRequestException(q.why);
    if (p < s.minRedeemPoints)
      throw new BadRequestException(`The smallest redemption is ${s.minRedeemPoints} points`);
    if (p > q.maxUsable)
      throw new BadRequestException(
        `At most ${q.maxUsable} points on this order — the customer must pay ${100 - s.redeemMaxBp / 100}% from their own pocket, and points cannot pay delivery or VAT`,
      );

    const paisa = p * s.pointValuePaisa;

    /*  Points row FIRST, because it is the one that checks the ledger. If the
        journal entry is refused, nothing below runs and the order is untouched
        — the alternative is an order that says "৳200 paid by points" with no
        entry behind it, which is the HR bug wearing a different hat. */
    const row = await this.write({
      customerId: q.customer.id,
      delta: -p,
      reason: 'REDEEMED',
      refType: 'ORDER',
      refId: orderId,
      note: `${p} points on ${q.orderNo}`,
      actorName,
      sourceKey: `LOYSPEND:${orderId}:${q.alreadyUsed + p}`,
      narration: `Points spent — ${q.orderNo}`,
      settle: true,
    });

    /*  Sales owns the order row; Marketing writes only these two fields, the
        same arrangement as Expense.campaignId with Finance (MKT-D05). */
    const order = await this.prisma.db.order.update({
      where: { id: orderId },
      data: {
        pointsUsed: { increment: p },
        pointsPaisa: { increment: paisa },
        paidPaisa: { increment: paisa },
        duePaisa: { decrement: paisa },
      },
      select: { id: true, orderNo: true, pointsUsed: true, pointsPaisa: true, duePaisa: true },
    });

    await this.audit.record({
      entityType: 'Order',
      entityId: orderId,
      action: 'UPDATE',
      actorName,
      changes: { pointsSpent: p, worthPaisa: paisa },
    });

    return { points: p, paisa, order, row, balance: await this.balance(q.customer.id) };
  }

  /* ---------------- by hand ---------------- */

  /** a correction, or the opening balance from radianbd.com */
  async adjust(customerId: string, delta: number, why: string, actorName: string, opening = false) {
    const d = Math.round(delta);
    if (d === 0) throw new BadRequestException('Nothing to change');
    if (!why?.trim()) throw new BadRequestException('Say why — a points change without a reason is not auditable');

    if (d < 0) {
      const have = await this.balance(customerId);
      if (-d > have) throw new BadRequestException(`Only ${have} points to take away`);
    }

    return this.write({
      customerId,
      delta: d,
      reason: opening ? 'OPENING' : 'ADJUSTMENT',
      note: why.trim(),
      actorName,
      sourceKey: `${opening ? 'LOYOPEN' : 'LOYADJ'}:${customerId}:${Date.now()}`,
      narration: `Points ${opening ? 'opening balance' : 'adjustment'} — ${why.trim()}`,
    });
  }

  /* ---------------- reading ---------------- */

  /** one customer's whole story */
  async history(customerId: string, take = 100) {
    const [rows, bal] = await Promise.all([
      this.prisma.loyaltyPoint.findMany({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
        take: Math.min(500, take),
      }),
      this.balance(customerId),
    ]);
    return { balance: bal, rows };
  }

  /**
   * The shop-wide picture.
   *
   * `liabilityPaisa` is the number that matters and the one nobody thinks to
   * ask for: every unspent point is ৳1 of future revenue already promised
   * away. It is checked against account 2130, and the two are shown side by
   * side — if they ever disagree, something wrote points without a ledger
   * entry and the screen says so rather than picking a favourite.
   */
  async overview() {
    const s = await this.settings.get();
    const rate = await this.currentRate();

    const [given, spent, back, holders] = await Promise.all([
      this.prisma.loyaltyPoint.aggregate({
        where: { deltaPoints: { gt: 0 } }, _sum: { deltaPoints: true },
      }),
      this.prisma.loyaltyPoint.aggregate({
        where: { reason: 'REDEEMED' }, _sum: { deltaPoints: true },
      }),
      this.prisma.loyaltyPoint.aggregate({
        where: { reason: { in: ['PURCHASE_REVERSED', 'REFERRAL_REVERSED', 'EXPIRED'] } },
        _sum: { deltaPoints: true },
      }),
      this.prisma.loyaltyPoint.groupBy({
        by: ['customerId'],
        _sum: { deltaPoints: true },
      }),
    ]);

    const outstanding = holders.reduce((n, h) => n + (h._sum.deltaPoints ?? 0), 0);
    const withPoints = holders.filter((h) => (h._sum.deltaPoints ?? 0) > 0);

    // what the books say the promise is worth
    const acc = await this.prisma.financeAccount.findFirst({
      where: { code: ACC2.LOYALTY_POINTS },
      select: { id: true },
    });
    let ledgerPaisa = 0;
    if (acc) {
      const lines = await this.prisma.journalLine.aggregate({
        where: { accountId: acc.id },
        _sum: { debitPaisa: true, creditPaisa: true },
      });
      // a liability: credits raise it, debits pay it down
      ledgerPaisa = (lines._sum.creditPaisa ?? 0) - (lines._sum.debitPaisa ?? 0);
    }

    const liabilityPaisa = outstanding * s.pointValuePaisa;

    return {
      enabled: s.loyaltyEnabled,
      rate,
      pointValuePaisa: s.pointValuePaisa,
      redeemMaxBp: s.redeemMaxBp,
      minRedeemPoints: s.minRedeemPoints,
      pointsGiven: given._sum.deltaPoints ?? 0,
      pointsSpent: Math.abs(spent._sum.deltaPoints ?? 0),
      pointsTakenBack: Math.abs(back._sum.deltaPoints ?? 0),
      outstanding,
      liabilityPaisa,
      ledgerPaisa,
      /* the honesty check — see the doc comment above */
      agrees: liabilityPaisa === ledgerPaisa,
      customersWithPoints: withPoints.length,
    };
  }

  /** who is holding points, biggest first — the list to look at before switching on */
  async holders(take = 50) {
    const rows = await this.prisma.loyaltyPoint.groupBy({
      by: ['customerId'],
      _sum: { deltaPoints: true },
      orderBy: { _sum: { deltaPoints: 'desc' } },
      take: Math.min(500, take),
    });
    const ids = rows.map((r) => r.customerId);
    const customers = await this.prisma.db.customer.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, phone: true, ordersCount: true },
    });
    const s = await this.settings.get();
    return rows
      .filter((r) => (r._sum.deltaPoints ?? 0) > 0)
      .map((r) => ({
        customer: customers.find((c) => c.id === r.customerId) ?? null,
        points: r._sum.deltaPoints ?? 0,
        worthPaisa: (r._sum.deltaPoints ?? 0) * s.pointValuePaisa,
      }));
  }

  /**
   * REV-MKT-3 — which of these orders came back in FULL.
   *
   * "In full" means the completed returns add up to the goods value the points
   * were calculated on, so the comparison has to use the same base: goods minus
   * discount, never delivery or VAT. Only `completed` returns count — a return
   * somebody has started but not finished has not brought anything back yet.
   */
  private async whollyReturned(orderIds: string[]): Promise<Set<string>> {
    const out = new Set<string>();
    if (orderIds.length === 0) return out;

    const orders = await this.prisma.db.order.findMany({
      where: { id: { in: orderIds } },
      select: { id: true, subtotalPaisa: true, discountPaisa: true },
    });
    const returned = await this.prisma.db.salesReturn.groupBy({
      by: ['orderId'],
      where: { orderId: { in: orderIds }, status: 'completed' },
      _sum: { returnValuePaisa: true },
    });
    const backBy = new Map(returned.map((r) => [r.orderId, r._sum.returnValuePaisa ?? 0]));

    for (const o of orders) {
      const base = Math.max(0, o.subtotalPaisa - o.discountPaisa);
      const back = backBy.get(o.id) ?? 0;
      if (base > 0 && back >= base) out.add(o.id);
    }
    return out;
  }

  /* ---------------- the nightly sweep's share ---------------- */

  /**
   * Reconciliation, not hooks — the Finance drift checker's precedent. A hook
   * that fails, fails silently; a sweep that asks the orders what happened
   * repairs itself on the next pass.
   */
  async reconcile(days = 30) {
    const s = await this.settings.get();
    if (!s.loyaltyEnabled) return { earned: 0, reversed: 0, skipped: 'switched off' as const };

    const since = new Date(Date.now() - days * 864e5);
    let earned = 0;
    let reversed = 0;

    // 1 — delivered orders that have not earned yet
    const delivered = await this.prisma.db.order.findMany({
      where: { placedAt: { gte: since }, deliveryStatus: 'delivered', salesStatus: { not: 'cancelled' } },
      select: { id: true },
      take: 2000,
    });
    for (const o of delivered) {
      const r = await this.earnForOrder(o.id, 'system');
      if ('earned' in r) earned += 1;
    }

    /*  2 — orders that earned and then died.
     *
     *  REV-MKT-3. This used to look only at `salesStatus === 'cancelled'`, so a
     *  customer could keep the whole order's points after sending the whole
     *  order back — the goods returned, the money returned, the points stayed.
     *  The affiliate side has always checked returns as well (MKT-RULE-014);
     *  loyalty and referral simply never caught up, and the owner had been told
     *  returns were handled.
     *
     *  Same test as the affiliate side, and same restraint: only a WHOLE return
     *  reverses. A partial return is left alone rather than docked by a formula
     *  nobody can explain (MKT-D14). */
    const cancelled = await this.prisma.db.order.findMany({
      where: { placedAt: { gte: since }, salesStatus: 'cancelled' },
      select: { id: true },
      take: 2000,
    });

    const earnedRows = await this.prisma.loyaltyPoint.findMany({
      where: { reason: 'PURCHASE', refType: 'ORDER', createdAt: { gte: since } },
      select: { refId: true },
    });
    const earnedIds = [...new Set(earnedRows.map((r) => r.refId).filter((x): x is string => !!x))];
    const wholeReturns = earnedIds.length
      ? await this.whollyReturned(earnedIds)
      : new Set<string>();

    const dead = new Set([...cancelled.map((o) => o.id), ...wholeReturns]);
    for (const id of dead) {
      const r = await this.reverseForOrder(id, 'system');
      if ('reversed' in r) reversed += 1;
    }

    return { earned, reversed };
  }
}
