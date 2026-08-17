import { ensureSingleton } from '../common/singleton';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  PaymentMethod,
  PaymentStatus,
  ReturnStatus,
  ReturnResolution,
  ReturnRefundMethod,
  ReturnRestockAction,
  CustomerCreditKind,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceEventsService } from '../finance/finance-events.service';
import { AuditService } from '../common/audit.service';
import { InventoryService } from '../inventory/inventory.service';
import type {
  CreateReturnDto,
  CompleteReturnDto,
  ListReturnQuery,
  ReturnReasonDto,
  ReturnSettingsDto,
} from './return.dto';

const ENTITY = 'SalesReturn';

const RETURN_INCLUDE = {
  order: {
    select: {
      id: true,
      orderNo: true,
      deliveryStatus: true,
      salesStatus: true,
      paidPaisa: true,
      refundPaisa: true,
      totalPaisa: true,
      paymentMethod: true,
    },
  },
  customer: { select: { id: true, name: true, phone: true } },
  reason: true,
  lines: true,
} satisfies Prisma.SalesReturnInclude;

@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly inventory: InventoryService,
    // Finance consumes the completed return — fail-soft (DEC-FIN-010)
    private readonly finance: FinanceEventsService,
  ) {}

  /* ============================ reads ============================ */

  async list(q: ListReturnQuery) {
    const page = Math.max(1, parseInt(q.page ?? '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(q.pageSize ?? '20', 10) || 20));

    const where: Prisma.SalesReturnWhereInput = { deletedAt: null };
    if (q.status) where.status = q.status as ReturnStatus;
    /*  DEC-RTN-016 — one book, two doors. The menu shows Returns under both
        the website and the counter, but nothing is copied: this filters on the
        order it came from (DELIVERY = online, COUNTER = POS, DEC-POS-001).
        An unknown value falls through to the whole book on purpose — a filter
        nobody asked for must never silently hide rows.  */
    if (q.channel === 'online') where.order = { fulfillmentType: 'DELIVERY' };
    else if (q.channel === 'counter') where.order = { fulfillmentType: 'COUNTER' };
    if (q.search) {
      where.OR = [
        { returnNo: { contains: q.search, mode: 'insensitive' } },
        { order: { orderNo: { contains: q.search, mode: 'insensitive' } } },
        { customer: { name: { contains: q.search, mode: 'insensitive' } } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.db.salesReturn.findMany({
        where,
        include: RETURN_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.db.salesReturn.count({ where }),
    ]);

    return { items: rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async analytics(days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.db.salesReturn.findMany({
      where: { deletedAt: null, createdAt: { gte: since } },
      select: {
        status: true,
        returnValuePaisa: true,
        refundPaisa: true,
        storeCreditPaisa: true,
        compensationPaisa: true,
      },
    });
    const acc = {
      count: rows.length,
      pending: rows.filter((r) => r.status === 'pending_approval').length,
      completed: rows.filter((r) => r.status === 'completed').length,
      returnValuePaisa: 0,
      refundPaisa: 0,
      storeCreditPaisa: 0,
      compensationPaisa: 0,
    };
    for (const r of rows) {
      acc.returnValuePaisa += r.returnValuePaisa;
      acc.refundPaisa += r.refundPaisa;
      acc.storeCreditPaisa += r.storeCreditPaisa;
      acc.compensationPaisa += r.compensationPaisa;
    }
    return acc;
  }

  async findOne(id: string) {
    const r = await this.prisma.db.salesReturn.findFirst({
      where: { id, deletedAt: null },
      include: RETURN_INCLUDE,
    });
    if (!r) throw new NotFoundException('return not found');
    return r;
  }

  async timeline(id: string) {
    return this.audit.timeline(ENTITY, id);
  }

  /**
   * DEC-RTN boundary — only a DELIVERED order can be returned (pre-delivery = Cancel,
   * Sales owns that). Returns the order + each line's still-returnable qty
   * (ordered − already returned) + how much cash is still refundable.
   */
  async eligibleOrder(orderId: string) {
    const order = await this.prisma.db.order.findFirst({
      where: { id: orderId, deletedAt: null },
      include: {
        lines: { where: { deletedAt: null } },
        customer: { select: { id: true, name: true, phone: true } },
      },
    });
    if (!order) throw new NotFoundException('order not found');

    const delivered = order.deliveryStatus === 'delivered';

    // already-returned qty per orderLine (ignore rejected/cancelled returns)
    const priorLines = await this.prisma.db.salesReturnLine.findMany({
      where: {
        deletedAt: null,
        orderLine: { orderId },
        return: { status: { notIn: ['rejected', 'cancelled'] }, deletedAt: null },
      },
      select: { orderLineId: true, qty: true },
    });
    const returnedBy: Record<string, number> = {};
    for (const p of priorLines) returnedBy[p.orderLineId] = (returnedBy[p.orderLineId] ?? 0) + p.qty;

    const lines = order.lines.map((l) => {
      const unitNet = l.qty > 0 ? Math.round((l.linePaisa - l.discountPaisa) / l.qty) : 0;
      const returned = returnedBy[l.id] ?? 0;
      return {
        orderLineId: l.id,
        productId: l.productId,
        name: l.name,
        productType: l.productType,
        qty: l.qty,
        returnedQty: returned,
        returnableQty: Math.max(0, l.qty - returned),
        unitPaisa: unitNet,
        bg: l.bg,
      };
    });

    const refundableCap = Math.max(0, order.paidPaisa - order.refundPaisa);

    return {
      order: {
        id: order.id,
        orderNo: order.orderNo,
        deliveryStatus: order.deliveryStatus,
        salesStatus: order.salesStatus,
        paymentMethod: order.paymentMethod,
        paidPaisa: order.paidPaisa,
        refundPaisa: order.refundPaisa,
        totalPaisa: order.totalPaisa,
      },
      customer: order.customer,
      delivered,
      refundableCap,
      lines,
    };
  }

  /* ============================ create ============================ */

  async create(dto: CreateReturnDto) {
    const actorName = dto.actorName ?? 'Admin';
    const el = await this.eligibleOrder(dto.orderId);

    if (!el.delivered)
      throw new BadRequestException(
        'only a delivered order can be returned — cancel the order instead (Sales)',
      );
    if (!dto.lines?.length) throw new BadRequestException('no lines to return');

    const settings = await this.settings();
    const reason = dto.reasonId
      ? await this.prisma.db.returnReason.findFirst({ where: { id: dto.reasonId, deletedAt: null } })
      : null;

    // build validated lines
    const lineRows: {
      orderLineId: string;
      productId: string;
      name: string;
      qty: number;
      unitPaisa: number;
      valuePaisa: number;
      restockAction: ReturnRestockAction;
    }[] = [];
    let hasCrafted = false;

    for (const inp of dto.lines) {
      if (inp.qty <= 0) continue;
      const src = el.lines.find((l) => l.orderLineId === inp.orderLineId);
      if (!src) throw new BadRequestException(`line ${inp.orderLineId} not on this order`);
      if (inp.qty > src.returnableQty)
        throw new BadRequestException(
          `${src.name}: only ${src.returnableQty} left to return (asked ${inp.qty})`,
        );
      if (src.productType === 'CRAFTED') hasCrafted = true;
      const restockAction: ReturnRestockAction =
        inp.restockAction ??
        (src.productType === 'CRAFTED' || settings.restockDefaultPerishable
          ? ReturnRestockAction.WRITE_OFF
          : ReturnRestockAction.RESTOCK);
      lineRows.push({
        orderLineId: src.orderLineId,
        productId: src.productId,
        name: src.name,
        qty: inp.qty,
        unitPaisa: src.unitPaisa,
        valuePaisa: src.unitPaisa * inp.qty,
        restockAction,
      });
    }
    if (!lineRows.length) throw new BadRequestException('no valid lines to return');

    const returnValuePaisa = lineRows.reduce((s, l) => s + l.valuePaisa, 0);
    const resolution = dto.resolution ?? ReturnResolution.REFUND;
    const refundMethod = dto.refundMethod ?? reason?.defaultRefundMethod ?? ReturnRefundMethod.ORIGINAL;

    // DEC-RTN-012 approval gate: reason flag, crafted/perishable (locked), or over threshold
    const overThreshold =
      settings.approvalThresholdPaisa > 0 && returnValuePaisa >= settings.approvalThresholdPaisa;
    const needsApproval = Boolean(reason?.requiresApproval) || hasCrafted || overThreshold;
    const status = needsApproval ? ReturnStatus.pending_approval : ReturnStatus.approved;

    const returnNo = await this.nextReturnNo();

    const created = await this.prisma.db.$transaction(async (tx) => {
      return tx.salesReturn.create({
        data: {
          returnNo,
          order: { connect: { id: dto.orderId } },
          customer: { connect: { id: el.customer!.id } },
          reason: dto.reasonId ? { connect: { id: dto.reasonId } } : undefined,
          reasonNote: dto.reasonNote,
          resolution,
          status,
          returnValuePaisa,
          refundMethod,
          refundReference: dto.refundReference,
          compensationPaisa:
            resolution === ReturnResolution.PARTIAL_COMPENSATION ? dto.compensationPaisa ?? 0 : 0,
          actorName,
          note: dto.note,
          lines: {
            create: lineRows.map((l) => ({
              orderLine: { connect: { id: l.orderLineId } },
              productId: l.productId,
              name: l.name,
              qty: l.qty,
              unitPaisa: l.unitPaisa,
              valuePaisa: l.valuePaisa,
              restockAction: l.restockAction,
            })),
          },
        },
        include: RETURN_INCLUDE,
      });
    });

    await this.audit.record({ entityType: ENTITY, entityId: created.id, action: 'CREATE', actorName });
    await this.event(
      created.id,
      'sales',
      `Return ${returnNo} opened for ${el.order.orderNo} — ${resolution}${
        needsApproval ? ' (needs approval)' : ''
      }`,
      actorName,
    );
    await this.orderEvent(dto.orderId, 'sales', `Return ${returnNo} opened — ${resolution}`, actorName);
    return created;
  }

  /* ============================ approve / reject ============================ */

  async approve(id: string, actorName = 'Admin') {
    const r = await this.findOne(id);
    if (r.status !== ReturnStatus.pending_approval)
      throw new BadRequestException(`only a pending return can be approved (is ${r.status})`);
    const updated = await this.prisma.db.salesReturn.update({
      where: { id },
      data: { status: ReturnStatus.approved, approvedBy: actorName, approvedAt: new Date() },
      include: RETURN_INCLUDE,
    });
    await this.event(id, 'sales', `Return approved`, actorName);
    return updated;
  }

  async reject(id: string, actorName = 'Admin', note?: string) {
    const r = await this.findOne(id);
    if (r.status !== ReturnStatus.pending_approval)
      throw new BadRequestException(`only a pending return can be rejected (is ${r.status})`);
    const updated = await this.prisma.db.salesReturn.update({
      where: { id },
      data: { status: ReturnStatus.rejected, note: note ?? r.note },
      include: RETURN_INCLUDE,
    });
    await this.event(id, 'sales', `Return rejected${note ? ` — ${note}` : ''}`, actorName);
    return updated;
  }

  async cancel(id: string, actorName = 'Admin') {
    const r = await this.findOne(id);
    if (r.status === ReturnStatus.completed)
      throw new BadRequestException('a completed return cannot be cancelled');
    const updated = await this.prisma.db.salesReturn.update({
      where: { id },
      data: { status: ReturnStatus.cancelled },
      include: RETURN_INCLUDE,
    });
    await this.event(id, 'sales', `Return cancelled`, actorName);
    return updated;
  }

  /* ============================ complete (execute) ============================ */

  async complete(id: string, dto: CompleteReturnDto = {}) {
    const actorName = dto.actorName ?? 'Admin';
    const r = await this.findOne(id);
    if (r.status === ReturnStatus.completed)
      throw new BadRequestException('return already completed');
    if (r.status === ReturnStatus.pending_approval)
      throw new BadRequestException('approve the return before completing it');
    if (r.status === ReturnStatus.rejected || r.status === ReturnStatus.cancelled)
      throw new BadRequestException(`a ${r.status} return cannot be completed`);

    const refundMethod = dto.refundMethod ?? r.refundMethod;

    // 1) restock — ONLY lines the staff marked RESTOCK; fail-soft (never break the flow)
    const restockLines = r.lines
      .filter((l) => l.restockAction === ReturnRestockAction.RESTOCK)
      .map((l) => ({ productId: l.productId, qty: l.qty }));
    if (restockLines.length) {
      try {
        const res = await this.inventory.postSaleReturn({
          returnId: r.id,
          returnNo: r.returnNo,
          actor: actorName,
          lines: restockLines,
        });
        await this.event(
          id,
          'system',
          `Restocked ${res.posted} movement(s)${
            res.skipped.length ? ` · skipped (no item link): ${res.skipped.join(', ')}` : ''
          }`,
          actorName,
        );
      } catch (e) {
        await this.event(
          id,
          'system',
          `⚠ Restock failed — inventory not updated: ${e instanceof Error ? e.message : e}`,
          actorName,
        );
      }
    }

    // 2) money — payout NEVER exceeds what is still in hand. Store credit is money
    // we owe too (DEC-RTN-011), so BOTH cash refunds AND credit already given on this
    // order count against the cap — otherwise a store-credit + cash refund on the same
    // order could hand the customer up to 2× their money.
    const order = await this.prisma.db.order.findFirst({
      where: { id: r.orderId },
      select: { id: true, paidPaisa: true, refundPaisa: true, totalPaisa: true, paymentMethod: true },
    });
    if (!order) throw new NotFoundException('order missing');
    const priorCredit = await this.prisma.db.salesReturn.aggregate({
      where: { orderId: order.id, id: { not: id }, status: ReturnStatus.completed, deletedAt: null },
      _sum: { storeCreditPaisa: true },
    });
    const alreadyBack = order.refundPaisa + (priorCredit._sum.storeCreditPaisa ?? 0);
    const cap = Math.max(0, order.paidPaisa - alreadyBack);

    let refundPaisa = 0;
    let storeCreditPaisa = 0;
    let compensationPaisa = 0;

    const asStoreCredit = refundMethod === ReturnRefundMethod.STORE_CREDIT;

    if (r.resolution === ReturnResolution.REFUND) {
      if (asStoreCredit) storeCreditPaisa = Math.min(r.returnValuePaisa, cap);
      else refundPaisa = Math.min(r.returnValuePaisa, cap);
    } else if (r.resolution === ReturnResolution.STORE_CREDIT) {
      storeCreditPaisa = Math.min(r.returnValuePaisa, cap);
    } else if (r.resolution === ReturnResolution.PARTIAL_COMPENSATION) {
      const want = r.compensationPaisa || 0;
      compensationPaisa = Math.min(want, cap);
      if (asStoreCredit) storeCreditPaisa = compensationPaisa;
      else refundPaisa = compensationPaisa;
    } else if (r.resolution === ReturnResolution.REPLACEMENT) {
      await this.event(id, 'delivery', `Replacement — redeliver goods (no money moved)`, actorName);
    }

    const cashOut = refundPaisa; // actual money leaving (compensation handled above merged into refundPaisa when not store-credit)

    await this.prisma.db.$transaction(async (tx) => {
      // cash refund → real PaymentTransaction on the order + bump order.refundPaisa
      if (cashOut > 0) {
        const method = this.mapRefundMethod(refundMethod, order.paymentMethod);
        await tx.paymentTransaction.create({
          data: {
            orderId: order.id,
            kind: 'REFUND',
            method,
            amountPaisa: cashOut,
            note: `Return ${r.returnNo}`,
            actorName,
          },
        });
        const newRefund = order.refundPaisa + cashOut;
        await tx.order.update({
          where: { id: order.id },
          data: {
            refundPaisa: newRefund,
            paymentStatus:
              newRefund >= order.paidPaisa && order.paidPaisa > 0
                ? PaymentStatus.refunded
                : PaymentStatus.partially_refunded,
          },
        });
      }

      // store credit → CustomerCredit ISSUED (money stays with Radian as a wallet)
      if (storeCreditPaisa > 0) {
        await tx.customerCredit.create({
          data: {
            customerId: r.customerId,
            kind: CustomerCreditKind.ISSUED,
            amountPaisa: storeCreditPaisa,
            refType: 'RETURN',
            refId: r.id,
            note: `Return ${r.returnNo}`,
            actorName,
          },
        });
      }

      await tx.salesReturn.update({
        where: { id },
        data: {
          status: ReturnStatus.completed,
          refundMethod,
          refundReference: dto.refundReference ?? r.refundReference,
          refundPaisa: cashOut,
          storeCreditPaisa,
          compensationPaisa: r.resolution === ReturnResolution.PARTIAL_COMPENSATION ? compensationPaisa : 0,
        },
      });
    });

    if (cashOut > 0) {
      await this.event(id, 'payment', `Refunded ${cashOut} paisa via ${refundMethod}`, actorName);
      await this.orderEvent(order.id, 'payment', `Refund ${cashOut} paisa via ${refundMethod} (return ${r.returnNo})`, actorName);
    }
    if (storeCreditPaisa > 0) {
      await this.event(id, 'payment', `Issued ${storeCreditPaisa} paisa store credit`, actorName);
      await this.orderEvent(order.id, 'payment', `Store credit ${storeCreditPaisa} paisa issued (return ${r.returnNo})`, actorName);
    }
    if (cashOut === 0 && storeCreditPaisa === 0 && r.resolution !== ReturnResolution.REPLACEMENT)
      await this.event(
        id,
        'payment',
        `No money refunded — nothing left in hand to return (cap ${cap} paisa)`,
        actorName,
      );

    /* books: store credit is a liability, restocked goods come back at cost, and the
       cash refund rides on its own PaymentTransaction row.

       RTN-REV-5 (30 Jul) — awaited and flagged, not fire-and-forget. Found by the
       system-wide sweep, not by reading this file: the 23 July Returns review could not
       have caught it because Finance did not exist yet and these hooks were added
       afterwards. A return that fails to post leaves the store-credit LIABILITY off the
       books entirely — the shop owes a customer goods and the balance sheet says it
       does not. */
    await this.book(id, `return ${r.returnNo}`, () => this.finance.onReturnCompleted(id), actorName);
    if (cashOut > 0) {
      const refundTxn = await this.prisma.db.paymentTransaction.findFirst({
        where: { orderId: order.id, kind: 'REFUND' },
        orderBy: { createdAt: 'desc' },
      });
      if (refundTxn) {
        await this.book(id, `refund on ${r.returnNo}`, () => this.finance.onPaymentRecorded(refundTxn.id), actorName);
      }
    }

    await this.audit.record({ entityType: ENTITY, entityId: id, action: 'UPDATE', actorName });
    await this.event(id, 'sales', `Return ${r.returnNo} completed`, actorName);
    return this.findOne(id);
  }

  async remove(id: string, actorName = 'Admin') {
    const r = await this.findOne(id);
    if (r.status === ReturnStatus.completed)
      throw new BadRequestException('a completed return cannot be deleted');
    await this.prisma.db.salesReturn.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.record({ entityType: ENTITY, entityId: id, action: 'DELETE', actorName });
    return { ok: true };
  }

  /* ============================ reasons (master) ============================ */

  reasons() {
    return this.prisma.db.returnReason.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
  }

  async createReason(dto: ReturnReasonDto) {
    const code = (dto.code ?? dto.label).toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 40);
    return this.prisma.db.returnReason.create({
      data: {
        code: `RSN_${code}`,
        label: dto.label,
        requiresApproval: dto.requiresApproval ?? false,
        defaultRefundMethod: dto.defaultRefundMethod ?? ReturnRefundMethod.ORIGINAL,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updateReason(id: string, dto: ReturnReasonDto) {
    return this.prisma.db.returnReason.update({
      where: { id },
      data: {
        label: dto.label,
        requiresApproval: dto.requiresApproval,
        defaultRefundMethod: dto.defaultRefundMethod,
        isActive: dto.isActive,
        sortOrder: dto.sortOrder,
      },
    });
  }

  async deleteReason(id: string) {
    await this.prisma.db.returnReason.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  }

  /* ============================ settings ============================ */

  async settings() {
    // ensureSingleton — survives two requests creating this row at once (P2002)
    return ensureSingleton(
      () => this.prisma.db.returnSetting.findFirst({ where: { id: 'singleton' } }),
      () => this.prisma.db.returnSetting.create({ data: { id: 'singleton' } }),
    );
  }

  async updateSettings(dto: ReturnSettingsDto) {
    await this.settings();
    return this.prisma.db.returnSetting.update({
      where: { id: 'singleton' },
      data: {
        returnWindowDays: dto.returnWindowDays,
        approvalThresholdPaisa: dto.approvalThresholdPaisa,
        restockDefaultPerishable: dto.restockDefaultPerishable,
      },
    });
  }

  /* ============================ store credit ============================ */

  async creditBalance(customerId: string) {
    const rows = await this.prisma.db.customerCredit.findMany({
      where: { customerId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    const balancePaisa = rows.reduce((s, r) => s + r.amountPaisa, 0);
    return { customerId, balancePaisa, ledger: rows };
  }

  /* ============================ helpers ============================ */

  private mapRefundMethod(m: ReturnRefundMethod, orderMethod: PaymentMethod): PaymentMethod {
    switch (m) {
      case ReturnRefundMethod.CASH:
        return PaymentMethod.cash;
      case ReturnRefundMethod.BKASH:
        return PaymentMethod.bkash;
      case ReturnRefundMethod.NAGAD:
        return PaymentMethod.nagad;
      case ReturnRefundMethod.CARD:
        return PaymentMethod.card;
      case ReturnRefundMethod.BANK:
        return PaymentMethod.bank;
      case ReturnRefundMethod.ORIGINAL:
      default:
        return orderMethod;
    }
  }

  private async nextReturnNo(): Promise<string> {
    // Parse the numeric max over REAL numbers only (RTN-000001). Demo rows use a
    // non-numeric RTN-D001 shape and must be ignored — a naive desc+parseInt would
    // pick "RTN-D004", parse NaN, and poison every future number.
    const rows = await this.prisma.db.salesReturn.findMany({
      where: { returnNo: { startsWith: 'RTN-' } },
      select: { returnNo: true },
    });
    let max = 0;
    for (const row of rows) {
      const m = /^RTN-(\d{4,})$/.exec(row.returnNo);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > max) max = n;
      }
    }
    return `RTN-${String(max + 1).padStart(6, '0')}`;
  }

  private async event(
    id: string,
    kind: 'sales' | 'delivery' | 'payment' | 'system',
    label: string,
    actorName: string,
    note?: string,
  ) {
    return this.audit.event({ entityType: ENTITY, entityId: id, kind, label, actorName, note });
  }

  /** RTN-REV-5 — the one place a finance event leaves this module (see the call site). */
  private async book(returnId: string, what: string, run: () => Promise<void>, actorName: string) {
    try {
      await run();
    } catch (e) {
      await this.event(
        returnId, 'system',
        `⚠ Finance posting failed (${what}) — NOT in the books, replay it from Finance`,
        actorName,
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  /** mirror a return event onto the Order's unified timeline (constitution: one timeline) */
  private async orderEvent(
    orderId: string,
    kind: 'sales' | 'delivery' | 'payment' | 'system',
    label: string,
    actorName: string,
  ) {
    return this.audit.event({ entityType: 'Order', entityId: orderId, kind, label, actorName });
  }
}
