import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { FinanceService, ACC2 } from '../finance/finance.service';
import { SettingsService } from './settings.service';

/*
  REFERRAL & POINTS — MKT-D16 / D17.

  The owner's rule, 28 Jul 2026, in his words: "je bondhu anbe tar account a
  point joma hobe ar jake anbe se discount pabe" — and the points land as soon
  as the friend's order is CONFIRMED, not when it is delivered.

  ONE POINTS LEDGER. Loyalty is coming later, and the one thing that must not
  happen is a second points system beside this one: a customer with two
  balances that never agree is a mistake nobody can unwind afterwards. So
  LoyaltyPoint is built now, referral is its first source, and purchases and
  the migrated radianbd.com history become later sources of the same rows.

  POINTS ARE A LIABILITY (MKT-D17). One point is a promise to give away ৳1 of
  future revenue. It costs the shop on the day it is earned, not the day it is
  spent, so awarding posts 5452 → 2130. Without that the books show a profit
  that has already been half promised away.

  ON "CONFIRMED, NOT DELIVERED". The owner chose confirmed, and confirmed it
  is — but a confirmed order can still be cancelled, and the points would
  already be gone. So the nightly reconciliation takes them back if that
  happens, exactly as it does for affiliate commission. His rule stands; the
  hole under it is covered.
*/

const ENTITY = 'Referral';

@Injectable()
export class ReferralService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly finance: FinanceService,
    private readonly settings: SettingsService,
  ) {}

  /* ---------------- codes ---------------- */

  /** made on demand — most customers never ask, so there is no sense creating
      a code for every one of them up front */
  async codeFor(customerId: string) {
    const existing = await this.prisma.referralCode.findUnique({ where: { customerId } });
    if (existing) return existing;

    const c = await this.prisma.db.customer.findUnique({
      where: { id: customerId },
      select: { id: true, name: true, phone: true },
    });
    if (!c) throw new NotFoundException('Customer not found');

    const base =
      (c.name || 'FRIEND').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6) || 'FRIEND';
    const tail = c.phone.replace(/\D/g, '').slice(-4);
    let code = `${base}${tail}`;
    for (let i = 0; i < 50; i += 1) {
      const clash = await this.prisma.referralCode.findUnique({ where: { code } });
      if (!clash) break;
      code = `${base}${tail}${i + 1}`;
    }
    return this.prisma.db.referralCode.create({ data: { customerId, code } });
  }

  private async ownerOfCode(code: string) {
    const c = (code ?? '').trim().toUpperCase();
    if (!c) return null;
    return this.prisma.referralCode.findUnique({
      where: { code: c },
      include: { customer: { select: { id: true, name: true, phone: true } } },
    });
  }

  /* ---------------- points ---------------- */

  /** Always derived, never stored (FIN-RULE-008 applied to points). */
  async balance(customerId: string): Promise<number> {
    const r = await this.prisma.db.loyaltyPoint.aggregate({
      where: { customerId },
      _sum: { deltaPoints: true },
    });
    return r._sum.deltaPoints ?? 0;
  }

  async ledger(customerId: string) {
    return this.prisma.db.loyaltyPoint.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  /*  Write one row, and post the money side of it.

      Earning points COSTS the shop: 5452 (cost of selling) → 2130 (a liability
      to the customer). Spending them releases the liability. A correction that
      nets to zero money posts nothing. */
  private async writePoints(input: {
    customerId: string;
    delta: number;
    reason: 'REFERRAL' | 'REFERRAL_REVERSED' | 'PURCHASE' | 'OPENING' | 'REDEEMED' | 'ADJUSTMENT' | 'EXPIRED';
    refType?: string;
    refId?: string;
    note?: string;
    actorName: string;
    sourceKey: string;
    narration: string;
  }) {
    const s = await this.settings.get();
    const paisa = Math.abs(input.delta) * s.pointValuePaisa;

    let entryId: string | null = null;
    if (paisa > 0) {
      const earning = input.delta > 0;
      const entry = await this.finance.postEntry({
        sourceType: 'MANUAL',
        sourceKey: input.sourceKey,
        narration: input.narration,
        actorName: input.actorName,
        lines: earning
          ? [
              { accountCode: ACC2.REFERRAL_COST, debitPaisa: paisa },
              { accountCode: ACC2.LOYALTY_POINTS, creditPaisa: paisa },
            ]
          : [
              { accountCode: ACC2.LOYALTY_POINTS, debitPaisa: paisa },
              { accountCode: ACC2.REFERRAL_COST, creditPaisa: paisa },
            ],
      });
      /*  MKT-RULE-016, the same guard as the affiliate payout: if the ledger
          refused the entry, do NOT write a points row saying the customer has
          something. A balance the books do not know about is the HR bug again. */
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

  /** the owner correcting something by hand — always audited */
  async adjust(customerId: string, delta: number, note: string, actorName: string) {
    const d = Math.round(delta);
    if (!d) throw new BadRequestException('Nothing to add or take away');
    if (!note?.trim()) throw new BadRequestException('Say why — an unexplained adjustment is worse than none');

    const row = await this.writePoints({
      customerId,
      delta: d,
      reason: 'ADJUSTMENT',
      note: note.trim(),
      actorName,
      sourceKey: `POINTADJ:${customerId}:${Date.now()}`,
      narration: `Points adjusted by hand — ${note.trim()}`,
    });
    await this.audit.record({
      entityType: 'LoyaltyPoint',
      entityId: row.id,
      action: 'CREATE',
      actorName,
      changes: { customerId, delta: d, note },
    });
    return row;
  }

  /** turn points into store credit, which is where they become spendable */
  /**
   * REMOVED 29 Jul 2026 — points can no longer be turned into store credit.
   *
   * Two reasons, and the second is the one that mattered.
   *
   * 1. It went round the loyalty cap. MKT-D21 says a customer must pay at
   *    least 80 % of any order from their own pocket. A customer who could
   *    convert points into store credit — which is money, and uncapped —
   *    could pay for a whole order with points through the side door. A rule
   *    with two doors is a rule people walk around.
   *
   * 2. The accounting was wrong, and had been since it was written. It
   *    credited 5452, un-booking the cost of the points, while creating a
   *    CustomerCredit row with NO journal entry behind it. So the shop took
   *    on an obligation the books knew nothing about and simultaneously
   *    forgot it had ever cost anything. Both halves wrong, in opposite
   *    directions, cancelling out just enough to look plausible.
   *
   * Points are now spent one way only: against an order, inside the cap, in
   * LoyaltyService.redeemForOrder(). If somebody genuinely needs compensating,
   * Finance issues store credit directly — that path posts a proper entry and
   * has nothing to do with points.
   */

  /* ---------------- the referral itself ---------------- */

  private async nextNo(): Promise<string> {
    // raw client: a soft-deleted referral still holds its number in the index
    const rows = await this.prisma.referral.findMany({ select: { referralNo: true } });
    let max = 0;
    for (const r of rows) {
      const m = /^REF-(\d{4,})$/.exec(r.referralNo);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return `REF-${String(max + 1).padStart(6, '0')}`;
  }

  /** somebody signed up with a code. Nothing is earned yet. */
  async join(dto: { code: string; friendId: string }, actorName: string) {
    const s = await this.settings.get();
    if (!s.referralEnabled) throw new BadRequestException('Referrals are switched off');

    const owner = await this.ownerOfCode(dto.code);
    if (!owner) throw new BadRequestException('That code does not belong to anybody');
    if (owner.customerId === dto.friendId)
      throw new BadRequestException('Somebody cannot refer themselves');

    const friend = await this.prisma.db.customer.findUnique({
      where: { id: dto.friendId },
      select: { id: true, name: true, phone: true, ordersCount: true },
    });
    if (!friend) throw new NotFoundException('Customer not found');

    /*  A referral is for bringing somebody NEW. Letting an existing customer
        be "referred" turns the scheme into a discount for people who were
        going to buy anyway, and every scheme that allows it gets used that way
        within a week. */
    if (friend.ordersCount > 0)
      throw new BadRequestException(`${friend.name} has ordered before — a referral is for a new customer`);

    const already = await this.prisma.referral.findUnique({ where: { friendId: dto.friendId } });
    if (already) throw new BadRequestException('That person has already been referred by somebody');

    const row = await this.prisma.db.referral.create({
      data: {
        referralNo: await this.nextNo(),
        referrerId: owner.customerId,
        friendId: dto.friendId,
        state: 'JOINED',
        actorName,
      },
    });
    await this.prisma.db.referralCode.update({
      where: { customerId: owner.customerId },
      data: { uses: { increment: 1 } },
    });
    await this.audit.record({
      entityType: ENTITY,
      entityId: row.id,
      action: 'CREATE',
      actorName,
      changes: { referrer: owner.customer.name, friend: friend.name },
    });
    return row;
  }

  /*  The friend's order was confirmed — pay the referrer.

      Idempotent: a referral only moves JOINED → REWARDED once, so calling
      this again does nothing. */
  async rewardForOrder(orderId: string, actorName = 'system') {
    const order = await this.prisma.db.order.findUnique({
      where: { id: orderId },
      select: {
        id: true, orderNo: true, customerId: true, salesStatus: true,
        subtotalPaisa: true, discountPaisa: true,
      },
    });
    if (!order) return { skipped: 'no such order' as const };
    if (order.salesStatus === 'placed') return { skipped: 'not confirmed yet' as const };
    if (order.salesStatus === 'cancelled') return { skipped: 'cancelled' as const };

    const ref = await this.prisma.db.referral.findUnique({ where: { friendId: order.customerId } });
    if (!ref) return { skipped: 'this customer was not referred' as const };
    if (ref.state !== 'JOINED') return { skipped: 'already settled' as const };

    const s = await this.settings.get();
    if (!s.referralEnabled) return { skipped: 'referrals are switched off' as const };

    const value = Math.max(0, order.subtotalPaisa - order.discountPaisa);
    if (value < s.referralMinOrderPaisa)
      return { skipped: `below the ৳${(s.referralMinOrderPaisa / 100).toFixed(0)} minimum` as const };

    const points = s.referralPoints;
    if (points <= 0) return { skipped: 'the reward is set to zero' as const };

    const written = await this.writePoints({
      customerId: ref.referrerId,
      delta: points,
      reason: 'REFERRAL',
      refType: 'REFERRAL',
      refId: ref.id,
      note: `${order.orderNo}`,
      actorName,
      sourceKey: `REFPTS:${ref.id}`,
      narration: `Referral reward — ${points} points on ${order.orderNo}`,
    });

    const saved = await this.prisma.db.referral.update({
      where: { id: ref.id },
      data: { state: 'REWARDED', orderId, pointsAwarded: points, rewardedAt: new Date() },
    });
    await this.audit.record({
      entityType: ENTITY,
      entityId: ref.id,
      action: 'UPDATE',
      actorName,
      changes: { rewarded: true, points, orderNo: order.orderNo, pointRow: written.id },
    });
    return { referral: saved, points };
  }

  /*  MKT-D16's safety net.

      The owner chose to pay on CONFIRMED, which is generous and good for the
      customer — but a confirmed order can still be cancelled, and by then the
      points are already in somebody's account. This asks the orders what
      happened and takes them back if it must, exactly as the affiliate side
      does. Run as often as you like; it is idempotent. */
  async reconcile(days = 180) {
    const since = new Date(Date.now() - days * 864e5);
    const rewarded = await this.prisma.db.referral.findMany({
      where: { state: 'REWARDED', rewardedAt: { gte: since }, orderId: { not: null } },
      select: { id: true, orderId: true, referrerId: true, pointsAwarded: true },
    });
    if (rewarded.length === 0) return { checked: 0, reversed: 0 };

    const ids = rewarded.map((r) => r.orderId!).filter(Boolean);
    const orders = await this.prisma.db.order.findMany({
      where: { id: { in: ids } },
      select: {
        id: true, orderNo: true, salesStatus: true,
        subtotalPaisa: true, discountPaisa: true,
      },
    });
    const byId = new Map(orders.map((o) => [o.id, o]));

    /*  REV-MKT-3 — a WHOLE return has to take the points back too.
     *
     *  This used to test only `salesStatus === 'cancelled'`, so the friend
     *  could order, the referrer could be paid, and then the friend could send
     *  everything back and keep the reward. The affiliate side has checked
     *  returns since the beginning (MKT-RULE-014); referral and loyalty were
     *  simply never brought in line.
     *
     *  Only `completed` returns count, and only a whole one reverses — a
     *  partial return is left alone on purpose (MKT-D14). */
    const returned = await this.prisma.db.salesReturn.groupBy({
      by: ['orderId'],
      where: { orderId: { in: ids }, status: 'completed' },
      _sum: { returnValuePaisa: true },
    });
    const backBy = new Map(returned.map((r) => [r.orderId, r._sum.returnValuePaisa ?? 0]));

    let reversed = 0;
    for (const r of rewarded) {
      const o = r.orderId ? byId.get(r.orderId) : undefined;

      let why: string | null = null;
      if (!o) why = 'the order is gone';
      else if (o.salesStatus === 'cancelled') why = `${o.orderNo} was cancelled`;
      else {
        const base = Math.max(0, o.subtotalPaisa - o.discountPaisa);
        const back = backBy.get(o.id) ?? 0;
        if (base > 0 && back >= base) why = `${o.orderNo} was returned in full`;
      }
      if (!why) continue;

      await this.writePoints({
        customerId: r.referrerId,
        delta: -r.pointsAwarded,
        reason: 'REFERRAL_REVERSED',
        refType: 'REFERRAL',
        refId: r.id,
        note: why,
        actorName: 'automation',
        sourceKey: `REFREV:${r.id}`,
        narration: `Referral points taken back — ${why}`,
      });
      await this.prisma.db.referral.update({
        where: { id: r.id },
        data: { state: 'REVERSED', reversedAt: new Date(), reversedNote: why },
      });
      reversed += 1;
    }
    return { checked: rewarded.length, reversed };
  }

  /** the sweep — any confirmed order from a referred customer that has not paid out */
  async rewardAll(days = 90) {
    const since = new Date(Date.now() - days * 864e5);
    const waiting = await this.prisma.db.referral.findMany({
      where: { state: 'JOINED' },
      select: { friendId: true },
    });
    if (waiting.length === 0) return { scanned: 0, rewarded: 0 };

    const orders = await this.prisma.db.order.findMany({
      where: {
        customerId: { in: waiting.map((w) => w.friendId) },
        placedAt: { gte: since },
        salesStatus: { notIn: ['placed', 'cancelled'] },
      },
      orderBy: { placedAt: 'asc' },
      select: { id: true },
    });

    let rewarded = 0;
    for (const o of orders) {
      const r = await this.rewardForOrder(o.id);
      if ('referral' in r) rewarded += 1;
    }
    return { scanned: orders.length, rewarded };
  }

  /* ---------------- screens ---------------- */

  async list(q: { state?: string; search?: string } = {}) {
    const where: Prisma.ReferralWhereInput = {};
    if (q.state) where.state = q.state as 'JOINED' | 'REWARDED' | 'REVERSED';
    return this.prisma.db.referral.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: {
        referrer: { select: { id: true, name: true, phone: true } },
        friend: { select: { id: true, name: true, phone: true, ordersCount: true } },
      },
    });
  }

  async overview() {
    const s = await this.settings.get();
    const [joined, rewarded, reversed] = await Promise.all([
      this.prisma.db.referral.count({ where: { state: 'JOINED' } }),
      this.prisma.db.referral.count({ where: { state: 'REWARDED' } }),
      this.prisma.db.referral.count({ where: { state: 'REVERSED' } }),
    ]);

    const outstanding = await this.prisma.db.loyaltyPoint.aggregate({ _sum: { deltaPoints: true } });
    const given = await this.prisma.db.loyaltyPoint.aggregate({
      where: { reason: 'REFERRAL' },
      _sum: { deltaPoints: true },
    });

    // what the friends actually bought — is the scheme paying for itself?
    const orders = await this.prisma.db.referral.findMany({
      where: { state: 'REWARDED', orderId: { not: null } },
      select: { orderId: true },
    });
    const sales = orders.length
      ? await this.prisma.db.order.aggregate({
          where: { id: { in: orders.map((o) => o.orderId!) }, salesStatus: { not: 'cancelled' } },
          _sum: { subtotalPaisa: true, discountPaisa: true },
        })
      : { _sum: { subtotalPaisa: 0, discountPaisa: 0 } };

    const broughtIn = (sales._sum.subtotalPaisa ?? 0) - (sales._sum.discountPaisa ?? 0);
    const costPaisa = (given._sum.deltaPoints ?? 0) * s.pointValuePaisa;

    const top = await this.prisma.db.referral.groupBy({
      by: ['referrerId'],
      where: { state: 'REWARDED' },
      _count: { _all: true },
      _sum: { pointsAwarded: true },
    });
    const names = top.length
      ? await this.prisma.db.customer.findMany({
          where: { id: { in: top.map((t) => t.referrerId) } },
          select: { id: true, name: true, phone: true },
        })
      : [];
    const nameById = new Map(names.map((n) => [n.id, n]));

    return {
      enabled: s.referralEnabled,
      pointValuePaisa: s.pointValuePaisa,
      referralPoints: s.referralPoints,
      friendDiscountBp: s.friendDiscountBp,
      joined,
      rewarded,
      reversed,
      pointsOutstanding: outstanding._sum.deltaPoints ?? 0,
      /// MKT-D17 — what those unspent points will cost when they are used
      liabilityPaisa: (outstanding._sum.deltaPoints ?? 0) * s.pointValuePaisa,
      pointsGivenForReferrals: given._sum.deltaPoints ?? 0,
      costPaisa,
      broughtInPaisa: broughtIn,
      returnRatio: costPaisa > 0 ? broughtIn / costPaisa : null,
      leaderboard: top
        .map((t) => ({
          customer: nameById.get(t.referrerId) ?? null,
          friends: t._count._all,
          points: t._sum.pointsAwarded ?? 0,
        }))
        .filter((r) => r.customer)
        .sort((a, b) => b.friends - a.friends)
        .slice(0, 10),
    };
  }

  /** everything about one customer — their code, points and who they brought */
  async forCustomer(customerId: string) {
    const [code, bal, ledger, made] = await Promise.all([
      this.prisma.referralCode.findUnique({ where: { customerId } }),
      this.balance(customerId),
      this.ledger(customerId),
      this.prisma.db.referral.findMany({
        where: { referrerId: customerId },
        include: { friend: { select: { id: true, name: true, phone: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const s = await this.settings.get();
    return {
      code: code?.code ?? null,
      uses: code?.uses ?? 0,
      points: bal,
      worthPaisa: bal * s.pointValuePaisa,
      ledger,
      referrals: made,
    };
  }
}
