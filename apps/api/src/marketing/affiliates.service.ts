import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { FinanceService, ACC2 } from '../finance/finance.service';
import { SettingsService } from './settings.service';
import type { AffiliateWriteDto, PayoutDto } from './marketing.dto';

/*
  AFFILIATE — the only place in this module where Radian's cash leaves the
  building, to somebody who is neither an employee nor a supplier.

  RADIAN_MARKETING_MODULE_ARCHITECTURE.md:
    MKT-D08      one table, type INDIVIDUAL | BUSINESS. Two tables would mean
                 two paths for money to leave, each with its own bugs
    MKT-D09      base = goods after discount. Delivery and VAT excluded, because
                 neither was ever Radian's money
    MKT-D10      accrue on delivery → hold → available → paid. Two events, two
                 dates, two journal entries — the shape HR uses for salary
    MKT-RULE-012 nothing accrues before the order is actually delivered
    MKT-RULE-014 a returned order reverses the commission; if it had already
                 been paid, it nets off the next payout
    MKT-RULE-015 an affiliate earns nothing on their own purchase
    MKT-RULE-016 a payout FAILS unless postEntry() hands back a real entry.
                 This is the HR-R28 bug, exactly: postEntry() returns null on a
                 duplicate sourceKey (DEC-FIN-023), and HR was writing
                 "APPROVED" over a ledger where nothing had landed.
*/

const ENTITY = 'Affiliate';

@Injectable()
export class AffiliatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly finance: FinanceService,
    private readonly settings: SettingsService,
  ) {}

  /* ---------------- numbering & codes ---------------- */

  /*  ⚠️ RAW client, not prisma.db — same trap as CampaignsService.nextNo().
      A soft-deleted affiliate still holds its number in the unique index, so
      counting through the filtered client would hand the number out twice and
      the create would fail. */
  private async nextNo(prefix: 'AFF' | 'APO'): Promise<string> {
    if (prefix === 'AFF') {
      const rows = await this.prisma.affiliate.findMany({ select: { affiliateNo: true } });
      return next(rows.map((r) => r.affiliateNo), 'AFF');
    }
    const rows = await this.prisma.affiliatePayout.findMany({ select: { payoutNo: true } });
    return next(rows.map((r) => r.payoutNo), 'APO');
  }

  /** MKT-RULE-020 — unique and uppercase. Derived from the name if not given. */
  private async makeCode(name: string, wanted?: string): Promise<string> {
    const base =
      (wanted ?? name)
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 10) || 'AFF';
    let code = base;
    for (let i = 0; i < 50; i += 1) {
      const clash = await this.prisma.affiliate.findUnique({ where: { code } });
      if (!clash) return code;
      code = `${base}${i + 1}`;
    }
    throw new BadRequestException('Could not find a free code — please type one');
  }

  /* ---------------- read ---------------- */

  async list(q: { status?: string; type?: string; search?: string } = {}) {
    const where: Prisma.AffiliateWhereInput = {};
    if (q.status) where.status = q.status as 'ACTIVE' | 'PAUSED';
    if (q.type) where.type = q.type as 'INDIVIDUAL' | 'BUSINESS';
    if (q.search?.trim()) {
      const s = q.search.trim();
      where.OR = [
        { name: { contains: s, mode: 'insensitive' } },
        { code: { contains: s, mode: 'insensitive' } },
        { phone: { contains: s } },
      ];
    }

    const items = await this.prisma.db.affiliate.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    /*  REV-MKT-7 — scoped to the affiliates on this page. It used to group
        EVERY commission row in the database and then throw away all but a
        handful in memory, which is fine with four affiliates and not fine
        later. groupBy is not soft-delete filtered either, so the id list is
        doing double duty here. */
    const totals = await this.prisma.db.affiliateCommission.groupBy({
      by: ['affiliateId', 'state'],
      where: { affiliateId: { in: items.map((a) => a.id) } },
      _sum: { amountPaisa: true },
      _count: { _all: true },
    });

    return items.map((a) => {
      const rows = totals.filter((t) => t.affiliateId === a.id);
      const sum = (s: string) =>
        rows.find((r) => r.state === s)?._sum.amountPaisa ?? 0;
      const cnt = rows.reduce((n, r) => n + r._count._all, 0);
      return {
        ...a,
        orders: cnt,
        pendingPaisa: sum('PENDING'),
        availablePaisa: sum('AVAILABLE'),
        paidPaisa: sum('PAID'),
        reversedPaisa: sum('REVERSED'),
      };
    });
  }

  async get(id: string) {
    const a = await this.prisma.db.affiliate.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('Affiliate not found');

    const commissions = await this.prisma.db.affiliateCommission.findMany({
      where: { affiliateId: id },
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: {
        order: {
          select: {
            id: true,
            orderNo: true,
            placedAt: true,
            senderName: true,
            totalPaisa: true,
            salesStatus: true,
            deliveryStatus: true,
          },
        },
      },
    });
    const payouts = await this.prisma.db.affiliatePayout.findMany({
      where: { affiliateId: id },
      orderBy: { createdAt: 'desc' },
    });

    const sum = (s: string) =>
      commissions.filter((c) => c.state === s).reduce((n, c) => n + c.amountPaisa, 0);

    return {
      ...a,
      commissions,
      payouts,
      pendingPaisa: sum('PENDING'),
      availablePaisa: sum('AVAILABLE'),
      paidPaisa: sum('PAID'),
      recoverablePaisa: await this.recoverable(id),
    };
  }

  /** MKT-RULE-014 — money already handed over on an order that later came back */
  private async recoverable(affiliateId: string): Promise<number> {
    const rows = await this.prisma.db.affiliateCommission.findMany({
      where: {
        affiliateId,
        state: 'REVERSED',
        payoutId: { not: null },
        recoveredPayoutId: null,
      },
      select: { amountPaisa: true },
    });
    return rows.reduce((n, r) => n + r.amountPaisa, 0);
  }

  /* ---------------- write ---------------- */

  async create(dto: AffiliateWriteDto, actorName: string) {
    if (!dto.name?.trim()) throw new BadRequestException('An affiliate needs a name');
    if (!dto.phone?.trim())
      throw new BadRequestException('A phone number is required — it is what stops self-purchase (MKT-RULE-015)');

    const s = await this.settings.get();
    const bp = clampBp(dto.commissionBp ?? s.defaultCommissionBp);

    const row = await this.prisma.db.affiliate.create({
      data: {
        affiliateNo: await this.nextNo('AFF'),
        type: dto.type ?? 'INDIVIDUAL',
        status: dto.status ?? 'ACTIVE',
        name: dto.name.trim(),
        phone: dto.phone.trim(),
        email: dto.email ?? null,
        contactName: dto.contactName ?? null,
        address: dto.address ?? null,
        note: dto.note ?? null,
        code: await this.makeCode(dto.name, dto.code),
        commissionBp: bp,
        payoutMethod: dto.payoutMethod ?? null,
        payoutNumber: dto.payoutNumber ?? null,
        customerId: dto.customerId ?? null,
        actorName,
      },
    });
    await this.audit.record({
      entityType: ENTITY,
      entityId: row.id,
      action: 'CREATE',
      actorName,
      changes: { name: row.name, code: row.code, commissionBp: row.commissionBp },
    });
    return row;
  }

  async update(id: string, dto: AffiliateWriteDto, actorName: string) {
    const before = await this.prisma.db.affiliate.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Affiliate not found');

    const data: Prisma.AffiliateUpdateInput = { actorName };
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.phone !== undefined) data.phone = dto.phone.trim();
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.contactName !== undefined) data.contactName = dto.contactName;
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.note !== undefined) data.note = dto.note;
    if (dto.payoutMethod !== undefined) data.payoutMethod = dto.payoutMethod;
    if (dto.payoutNumber !== undefined) data.payoutNumber = dto.payoutNumber;
    if (dto.customerId !== undefined) data.customerId = dto.customerId;
    if (dto.commissionBp !== undefined) data.commissionBp = clampBp(dto.commissionBp);
    if (dto.code !== undefined && dto.code.trim() && dto.code.toUpperCase() !== before.code) {
      data.code = await this.makeCode(before.name, dto.code);
    }

    const row = await this.prisma.db.affiliate.update({ where: { id }, data });
    await this.audit.record({
      entityType: ENTITY,
      entityId: id,
      action: 'UPDATE',
      actorName,
      changes: dto as Record<string, unknown>,
    });
    return row;
  }

  /** An affiliate that has ever earned is paused, never removed — the ledger
      still points at them. Same reasoning as MKT-RULE-018 for campaigns. */
  async remove(id: string, actorName: string) {
    const earned = await this.prisma.db.affiliateCommission.count({ where: { affiliateId: id } });
    if (earned > 0) {
      const row = await this.prisma.db.affiliate.update({
        where: { id },
        data: { status: 'PAUSED', actorName },
      });
      /*  REV-MKT-8 — this branch used to write nothing to the audit trail, so
          the one action that stops somebody earning left no trace. */
      await this.audit.record({
        entityType: ENTITY,
        entityId: id,
        action: 'UPDATE',
        actorName,
        changes: { paused: true, reason: 'removal requested', commissionRows: earned },
      });
      return {
        id,
        deleted: false,
        message: `Paused instead of removed — ${earned} commission row(s) point at this affiliate`,
        affiliate: row,
      };
    }
    await this.prisma.db.affiliate.update({
      where: { id },
      data: { deletedAt: new Date(), actorName },
    });
    await this.audit.record({ entityType: ENTITY, entityId: id, action: 'DELETE', actorName });
    return { id, deleted: true };
  }

  /* ---------------- accrual (MKT-D10, MKT-RULE-012) ---------------- */

  /** Earn commission for one delivered order. Idempotent: calling it twice does
      nothing the second time, because of the (orderId, affiliateId) unique. */
  async accrueForOrder(orderId: string, actorName = 'system') {
    const order = await this.prisma.db.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNo: true,
        placedAt: true,
        senderPhone: true,
        subtotalPaisa: true,
        discountPaisa: true,
        salesStatus: true,
        deliveryStatus: true,
        customer: { select: { phone: true } },
        attribution: { select: { affiliateId: true } },
      },
    });
    if (!order) return { skipped: 'no such order' as const };

    const affiliateId = order.attribution?.affiliateId;
    if (!affiliateId) return { skipped: 'no affiliate on this order' as const };

    // MKT-RULE-012 — nothing before the goods actually arrived
    if (order.deliveryStatus !== 'delivered')
      return { skipped: 'not delivered yet' as const };
    if (order.salesStatus === 'cancelled') return { skipped: 'cancelled' as const };

    const existing = await this.prisma.db.affiliateCommission.findUnique({
      where: { orderId_affiliateId: { orderId, affiliateId } },
    });
    if (existing) return { skipped: 'already accrued' as const, commission: existing };

    const aff = await this.prisma.db.affiliate.findUnique({ where: { id: affiliateId } });
    if (!aff) return { skipped: 'affiliate is gone' as const };
    /*  REV-MKT-2 — a paused affiliate earns nothing more.
        `remove()` pauses rather than deletes anyone who has ever earned, and
        until this check existed that pause did nothing at all: the fifteen
        minute sweep kept accruing on every new order carrying their code.
        Existing commission is untouched — it was earned while they were
        active, and history is not rewritten. */
    if (aff.status !== 'ACTIVE') return { skipped: 'the affiliate is paused' as const };

    // MKT-RULE-015 — no commission on your own purchase
    const affPhone = digits(aff.phone);
    if (
      affPhone &&
      (digits(order.senderPhone) === affPhone || digits(order.customer?.phone ?? '') === affPhone)
    ) {
      return { skipped: 'self purchase (MKT-RULE-015)' as const };
    }

    // MKT-D09 — goods after discount. Delivery and VAT are not Radian's margin.
    const base = Math.max(0, order.subtotalPaisa - order.discountPaisa);
    const amount = Math.round((base * aff.commissionBp) / 10000);
    if (amount <= 0) return { skipped: 'nothing to earn' as const };

    const s = await this.settings.get();
    const availableAt = new Date(Date.now() + s.holdDays * 864e5);

    const commission = await this.prisma.db.affiliateCommission.create({
      data: {
        affiliateId,
        orderId,
        basePaisa: base,
        rateBp: aff.commissionBp,
        amountPaisa: amount,
        state: 'PENDING',
        availableAt,
      },
    });

    // the sale already happened, so the cost is already real — it just has not
    // been handed over yet. Expense now, cash later (MKT-D10).
    const entry = await this.finance.postEntry({
      sourceType: 'AFFILIATE',
      sourceId: commission.id,
      sourceKey: `AFFCOM:${commission.id}`,
      narration: `Affiliate commission — ${aff.name} on ${order.orderNo}`,
      actorName,
      lines: [
        {
          accountCode: ACC2.AFFILIATE_COMMISSION,
          debitPaisa: amount,
          orderId,
          note: aff.code,
        },
        { accountCode: ACC2.AFFILIATE_PAYABLE, creditPaisa: amount, orderId, note: aff.code },
      ],
    });

    // MKT-RULE-016 — no entry, no commission. Do not leave a row claiming money
    // is owed when the books say nothing happened.
    if (!entry) {
      await this.prisma.affiliateCommission.delete({ where: { id: commission.id } });
      throw new BadRequestException(
        `Commission for ${order.orderNo} was NOT recorded — the ledger refused the entry (duplicate sourceKey). Nothing was saved (MKT-RULE-016).`,
      );
    }

    const saved = await this.prisma.db.affiliateCommission.update({
      where: { id: commission.id },
      data: { journalEntryId: entry.id },
    });
    await this.audit.record({
      entityType: 'AffiliateCommission',
      entityId: saved.id,
      action: 'CREATE',
      actorName,
      changes: { orderNo: order.orderNo, amountPaisa: amount, entryNo: entry.entryNo },
    });
    return { commission: saved, entryNo: entry.entryNo };
  }

  /** Sweep: every delivered order that carries an affiliate and has not earned
      yet. Cheap to re-run, and how the nightly job would call it. */
  async accrueAll(days = 120) {
    const since = new Date(Date.now() - days * 864e5);
    const links = await this.prisma.db.orderAttribution.findMany({
      where: {
        affiliateId: { not: null },
        order: { deliveryStatus: 'delivered', salesStatus: { not: 'cancelled' }, placedAt: { gte: since } },
      },
      select: { orderId: true },
    });
    let accrued = 0;
    let skipped = 0;
    for (const l of links) {
      const r = await this.accrueForOrder(l.orderId);
      if ('commission' in r && !('skipped' in r)) accrued += 1;
      else skipped += 1;
    }
    await this.releaseHolds();
    return { scanned: links.length, accrued, skipped };
  }

  /** PENDING → AVAILABLE once the hold window has passed (MKT-D10). */
  async releaseHolds() {
    const r = await this.prisma.db.affiliateCommission.updateMany({
      where: { state: 'PENDING', availableAt: { lte: new Date() } },
      data: { state: 'AVAILABLE' },
    });
    return { released: r.count };
  }

  /* ---------------- reversal (MKT-RULE-014) ---------------- */

  /** The order came back. Undo the accrual — and if the money is already gone,
      remember that it is owed. */
  async reverseForOrder(orderId: string, note: string, actorName = 'system') {
    const rows = await this.prisma.db.affiliateCommission.findMany({
      where: { orderId, state: { in: ['PENDING', 'AVAILABLE', 'PAID'] } },
    });
    const out: string[] = [];
    for (const c of rows) {
      const wasPaid = c.state === 'PAID';
      await this.prisma.db.affiliateCommission.update({
        where: { id: c.id },
        data: { state: 'REVERSED', reversedAt: new Date(), reversedNote: note },
      });

      // FIN-RULE-003 — a posted entry is never edited. The correction is its
      // own entry, in the opposite direction.
      if (c.journalEntryId) {
        const entry = await this.finance.postEntry({
          sourceType: 'AFFILIATE',
          sourceId: c.id,
          sourceKey: `AFFREV:${c.id}`,
          narration: `Affiliate commission reversed — ${note}`,
          actorName,
          lines: [
            { accountCode: ACC2.AFFILIATE_PAYABLE, debitPaisa: c.amountPaisa, orderId },
            { accountCode: ACC2.AFFILIATE_COMMISSION, creditPaisa: c.amountPaisa, orderId },
          ],
        });
        if (!entry) out.push(`${c.id}: reversal entry was refused as a duplicate`);
      }
      if (wasPaid) out.push(`${c.id}: already paid — ৳${(c.amountPaisa / 100).toFixed(2)} is now recoverable`);
    }
    return { reversed: rows.length, notes: out };
  }

  /** MKT-RULE-014, run by the automation.

      A hook on "order returned" would be the obvious thing, but a hook that
      fails fails SILENTLY — which is the entire reason Finance has a drift
      checker. So this reconciles instead: it asks the orders what happened and
      makes the commission ledger agree. Safe to run as often as you like.

      Two cases are unambiguous and handled:
        · the order was cancelled           → reverse
        · the whole order came back         → reverse

      A PARTIAL return is deliberately NOT touched. Quietly docking somebody's
      earnings by a formula nobody can explain is worse than showing it and
      letting a person decide — the commission list flags it instead. */
  async reconcileReversals(days = 180) {
    const since = new Date(Date.now() - days * 864e5);
    const live = await this.prisma.db.affiliateCommission.findMany({
      where: { state: { in: ['PENDING', 'AVAILABLE', 'PAID'] }, createdAt: { gte: since } },
      select: { id: true, orderId: true, basePaisa: true },
    });
    if (live.length === 0) return { checked: 0, reversed: 0 };

    const orderIds = [...new Set(live.map((c) => c.orderId))];
    const orders = await this.prisma.db.order.findMany({
      where: { id: { in: orderIds } },
      select: { id: true, orderNo: true, salesStatus: true },
    });
    const statusById = new Map(orders.map((o) => [o.id, o]));

    // goods value actually returned, per order — only COMPLETED returns count
    const returned = await this.prisma.db.salesReturn.groupBy({
      by: ['orderId'],
      where: { orderId: { in: orderIds }, status: 'completed' },
      _sum: { returnValuePaisa: true },
    });
    const returnedBy = new Map(returned.map((r) => [r.orderId, r._sum.returnValuePaisa ?? 0]));

    let reversed = 0;
    for (const c of live) {
      const o = statusById.get(c.orderId);
      const back = returnedBy.get(c.orderId) ?? 0;

      let why: string | null = null;
      if (!o || o.salesStatus === 'cancelled') why = 'order cancelled';
      else if (c.basePaisa > 0 && back >= c.basePaisa) why = 'whole order returned';

      if (why) {
        const r = await this.reverseForOrder(c.orderId, why, 'automation');
        reversed += r.reversed;
      }
    }
    return { checked: live.length, reversed };
  }

  /* ---------------- payout (MKT-RULE-016) ---------------- */

  async payout(dto: PayoutDto, actorName: string) {
    const aff = await this.prisma.db.affiliate.findUnique({ where: { id: dto.affiliateId } });
    if (!aff) throw new NotFoundException('Affiliate not found');
    /*  Deliberately NO status check here, unlike accrual (REV-MKT-2). A paused
        affiliate stops EARNING; what they already earned is still theirs and
        must still be payable, or pausing somebody would quietly confiscate
        their money. */
    if (!dto.paidFromId) throw new BadRequestException('Choose which account the money comes out of');

    const from = await this.prisma.db.financeAccount.findUnique({ where: { id: dto.paidFromId } });
    if (!from || !from.isMoneyAccount)
      throw new BadRequestException('That is not a place money sits');

    await this.releaseHolds();

    const where: Prisma.AffiliateCommissionWhereInput = {
      affiliateId: aff.id,
      state: 'AVAILABLE',
    };
    if (dto.commissionIds?.length) where.id = { in: dto.commissionIds };

    const due = await this.prisma.db.affiliateCommission.findMany({ where });
    if (due.length === 0)
      throw new BadRequestException(
        'Nothing is available to pay. Commission stays on hold until the return window has passed (MKT-D10).',
      );

    const gross = due.reduce((n, c) => n + c.amountPaisa, 0);

    // MKT-RULE-014 — net off anything paid earlier on an order that came back
    const owedBack = await this.prisma.db.affiliateCommission.findMany({
      where: {
        affiliateId: aff.id,
        state: 'REVERSED',
        payoutId: { not: null },
        recoveredPayoutId: null,
      },
    });
    let recover = 0;
    const recovered: string[] = [];
    for (const r of owedBack) {
      if (recover + r.amountPaisa > gross) break;
      recover += r.amountPaisa;
      recovered.push(r.id);
    }

    const net = gross - recover;
    const s = await this.settings.get();
    if (net < s.minWithdrawPaisa)
      throw new BadRequestException(
        `Below the minimum withdrawal of ৳${(s.minWithdrawPaisa / 100).toFixed(0)} — this comes to ৳${(net / 100).toFixed(2)}`,
      );
    if (net <= 0) throw new BadRequestException('Nothing left to pay after recovery');

    const payout = await this.prisma.db.affiliatePayout.create({
      data: {
        payoutNo: await this.nextNo('APO'),
        affiliateId: aff.id,
        amountPaisa: gross,
        recoveredPaisa: recover,
        netPaisa: net,
        paidFromId: dto.paidFromId,
        method: dto.method ?? aff.payoutMethod ?? null,
        reference: dto.reference ?? null,
        note: dto.note ?? null,
        state: 'PAID',
        actorName,
      },
    });

    const entry = await this.finance.postEntry({
      sourceType: 'AFFILIATE',
      sourceId: payout.id,
      sourceKey: `AFFPAY:${payout.payoutNo}`,
      narration: `Affiliate payout ${payout.payoutNo} — ${aff.name}`,
      actorName,
      lines: [
        { accountCode: ACC2.AFFILIATE_PAYABLE, debitPaisa: net, note: aff.code },
        { accountId: dto.paidFromId, creditPaisa: net, note: aff.code },
      ],
    });

    /* MKT-RULE-016 — THE HR-R28 GUARD.
       postEntry() returns null when it judges the entry a duplicate. In HR that
       silence meant a payroll said "APPROVED" while the ledger held nothing —
       the worst bug found in that module, and invisible to every review. Refuse
       outright, and unwind, rather than leave a payout row that claims money
       moved. */
    if (!entry) {
      await this.prisma.affiliatePayout.delete({ where: { id: payout.id } });
      throw new BadRequestException(
        'The payout was NOT recorded — the ledger refused the entry (duplicate sourceKey). Nothing was saved and no money should be handed over (MKT-RULE-016).',
      );
    }

    await this.prisma.db.affiliateCommission.updateMany({
      where: { id: { in: due.map((c) => c.id) } },
      data: { state: 'PAID', payoutId: payout.id },
    });
    if (recovered.length > 0) {
      await this.prisma.db.affiliateCommission.updateMany({
        where: { id: { in: recovered } },
        data: { recoveredPayoutId: payout.id },
      });
    }
    const saved = await this.prisma.db.affiliatePayout.update({
      where: { id: payout.id },
      data: { journalEntryId: entry.id },
    });

    await this.audit.record({
      entityType: 'AffiliatePayout',
      entityId: saved.id,
      action: 'CREATE',
      actorName,
      changes: {
        affiliate: aff.name,
        grossPaisa: gross,
        recoveredPaisa: recover,
        netPaisa: net,
        entryNo: entry.entryNo,
      },
    });

    return { ...saved, entryNo: entry.entryNo, commissions: due.length, recoveredCount: recovered.length };
  }

  /* ---------------- the sub-module's own screens ---------------- */

  /** Every commission row across every affiliate — the Commissions screen. */
  async allCommissions(q: { state?: string; affiliateId?: string } = {}) {
    const where: Prisma.AffiliateCommissionWhereInput = {};
    if (q.state) where.state = q.state as 'PENDING' | 'AVAILABLE' | 'PAID' | 'REVERSED';
    if (q.affiliateId) where.affiliateId = q.affiliateId;
    const rows = await this.prisma.db.affiliateCommission.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 400,
      include: {
        affiliate: { select: { id: true, name: true, code: true, type: true } },
        order: { select: { id: true, orderNo: true, placedAt: true, senderName: true } },
      },
    });

    /*  A partly-returned order is flagged, not silently adjusted — see
        reconcileReversals(). The owner sees "৳600 of this came back" and
        decides; nothing docks anybody's money behind their back. */
    const ids = rows.filter((r) => r.state !== 'REVERSED').map((r) => r.orderId);
    if (ids.length === 0) return rows.map((r) => ({ ...r, returnedPaisa: 0 }));
    const returned = await this.prisma.db.salesReturn.groupBy({
      by: ['orderId'],
      where: { orderId: { in: ids }, status: 'completed' },
      _sum: { returnValuePaisa: true },
    });
    const by = new Map(returned.map((r) => [r.orderId, r._sum.returnValuePaisa ?? 0]));
    return rows.map((r) => ({ ...r, returnedPaisa: r.state === 'REVERSED' ? 0 : by.get(r.orderId) ?? 0 }));
  }

  /** Every payout across every affiliate — the Payouts screen. */
  async allPayouts() {
    return this.prisma.db.affiliatePayout.findMany({
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: {
        affiliate: { select: { id: true, name: true, code: true, type: true } },
      },
    });
  }

  /** The Affiliates sub-module's own front page — not the Marketing one. */
  async overview() {
    await this.releaseHolds();
    const base = await this.stats();

    const people = await this.prisma.db.affiliate.count({ where: { type: 'INDIVIDUAL' } });
    const businesses = await this.prisma.db.affiliate.count({ where: { type: 'BUSINESS' } });

    const earned = await this.prisma.db.affiliateCommission.groupBy({
      by: ['affiliateId'],
      where: { state: { not: 'REVERSED' } },
      _sum: { amountPaisa: true, basePaisa: true },
      _count: { _all: true },
    });
    const ids = earned.map((e) => e.affiliateId);
    const names =
      ids.length === 0
        ? []
        : await this.prisma.db.affiliate.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true, code: true, type: true, commissionBp: true },
          });
    const nameById = new Map(names.map((n) => [n.id, n]));

    const leaderboard = earned
      .map((e) => ({
        affiliate: nameById.get(e.affiliateId) ?? null,
        orders: e._count._all,
        salesPaisa: e._sum.basePaisa ?? 0,
        earnedPaisa: e._sum.amountPaisa ?? 0,
      }))
      .filter((r) => r.affiliate)
      .sort((a, b) => b.salesPaisa - a.salesPaisa)
      .slice(0, 10);

    // who is standing there with their hand out
    const s = await this.settings.get();
    const readyRows = await this.prisma.db.affiliateCommission.groupBy({
      by: ['affiliateId'],
      where: { state: 'AVAILABLE' },
      _sum: { amountPaisa: true },
    });
    const readyIds = readyRows.map((r) => r.affiliateId);
    const readyNames =
      readyIds.length === 0
        ? []
        : await this.prisma.db.affiliate.findMany({
            where: { id: { in: readyIds } },
            select: { id: true, name: true, code: true, payoutMethod: true, payoutNumber: true },
          });
    const readyById = new Map(readyNames.map((n) => [n.id, n]));
    const readyToPay = readyRows
      .map((r) => ({
        affiliate: readyById.get(r.affiliateId) ?? null,
        amountPaisa: r._sum.amountPaisa ?? 0,
        overMinimum: (r._sum.amountPaisa ?? 0) >= s.minWithdrawPaisa,
      }))
      .filter((r) => r.affiliate)
      .sort((a, b) => b.amountPaisa - a.amountPaisa);

    const recent = await this.prisma.db.affiliateCommission.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: {
        affiliate: { select: { id: true, name: true, code: true } },
        order: { select: { id: true, orderNo: true } },
      },
    });

    // total sales these people brought in, and what that cost
    const totalSales = earned.reduce((n, e) => n + (e._sum.basePaisa ?? 0), 0);
    const totalCost = earned.reduce((n, e) => n + (e._sum.amountPaisa ?? 0), 0);

    return {
      ...base,
      people,
      businesses,
      totalSalesPaisa: totalSales,
      totalCostPaisa: totalCost,
      effectiveRateBp: totalSales > 0 ? Math.round((totalCost / totalSales) * 10000) : 0,
      minWithdrawPaisa: s.minWithdrawPaisa,
      holdDays: s.holdDays,
      leaderboard,
      readyToPay,
      recent,
    };
  }

  /* ---------------- overview ---------------- */

  async stats() {
    await this.releaseHolds();
    const [active, rows] = await Promise.all([
      this.prisma.db.affiliate.count({ where: { status: 'ACTIVE' } }),
      this.prisma.db.affiliateCommission.groupBy({
        by: ['state'],
        _sum: { amountPaisa: true },
        _count: { _all: true },
      }),
    ]);
    const sum = (s: string) => rows.find((r) => r.state === s)?._sum.amountPaisa ?? 0;
    return {
      activeAffiliates: active,
      pendingPaisa: sum('PENDING'),
      availablePaisa: sum('AVAILABLE'),
      paidPaisa: sum('PAID'),
      reversedPaisa: sum('REVERSED'),
      commissionRows: rows.reduce((n, r) => n + r._count._all, 0),
    };
  }
}

/* ---------------- small helpers ---------------- */

function next(existing: string[], prefix: string): string {
  let max = 0;
  const re = new RegExp(`^${prefix}-(\\d{4,})$`);
  for (const v of existing) {
    const m = re.exec(v);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return `${prefix}-${String(max + 1).padStart(6, '0')}`;
}

function clampBp(bp: number): number {
  const n = Math.round(Number(bp) || 0);
  if (n < 0) return 0;
  // 50 % is not a rate, it is a mistake — and a mistake worth stopping
  if (n > 5000) throw new BadRequestException('A commission above 50 % is almost certainly a typo');
  return n;
}

function digits(v: string): string {
  const d = (v || '').replace(/\D/g, '');
  return d.length > 10 ? d.slice(-10) : d; // ignore +88 / 0 prefixes
}
