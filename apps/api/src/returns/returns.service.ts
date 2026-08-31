import { ensureSingleton } from '../common/singleton';
import {
  BadRequestException,
  ForbiddenException,
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
import { PaymentMethodsService } from '../common/payment-methods.service';
import { SslCommerzService } from '../shop/payment';

/*  DEC-FIN-031 — `GATEWAY` is new on the enum, and a Prisma client generated
    before the migration does not know it yet. Same cast pattern the rest of
    the project uses (see `checkout.ts` on deliveryBlackout); BUILD_CHECK
    regenerates on the host and the cast becomes redundant, not wrong.  */
const REFUND_GATEWAY = 'GATEWAY' as unknown as ReturnRefundMethod;
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

/** DEC-RTN-017 — what went back out to the customer on a replacement */
export interface ReplacementRow {
  id: string;
  itemId: string | null;
  productId: string | null;
  name: string;
  qty: number;
  unitPaisa: number;
  deletedAt: Date | null;
}

@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly inventory: InventoryService,
    // Finance consumes the completed return — fail-soft (DEC-FIN-010)
    private readonly finance: FinanceEventsService,
    private readonly payMethods: PaymentMethodsService, // DEC-GBL-001
    /*  DEC-FIN-031 — the second way money can go back: down the wire it came
        up. Beside the hand-sent refund, never instead of it.  */
    private readonly gateway: SslCommerzService,
  ) {}

  /**
   * DEC-FIN-031 — can this order's money go back through the gateway at all?
   *
   * Two things have to be true, and neither is a preference: the order was
   * really paid online, and we still hold the gateway's own `bankTranId` for a
   * settled payment. Without that reference SSLCommerz has nothing to reverse.
   *
   * Returned rather than thrown, because the SCREEN needs to know before it
   * offers the choice — a greyed-out option with a reason beats a button that
   * fails after it is pressed.
   */
  async gatewayRefundable(orderId: string): Promise<{ ok: boolean; bankTranId?: string; why?: string }> {
    const order = await this.prisma.db.order.findFirst({
      where: { id: orderId },
      select: { paymentMethod: true },
    });
    if (!order) return { ok: false, why: 'Order not found.' };
    if (order.paymentMethod !== PaymentMethod.online)
      return { ok: false, why: 'This order was not paid online, so there is nothing at the gateway to send back.' };

    const session = await this.prisma.db.paymentSession.findFirst({
      where: { orderId, status: 'SUCCESS', NOT: { bankTranId: null } },
      orderBy: { settledAt: 'desc' },
      select: { bankTranId: true },
    });
    if (!session?.bankTranId)
      return { ok: false, why: 'No gateway reference was recorded for this payment, so it can only be sent back by hand.' };

    return { ok: true, bankTranId: session.bankTranId };
  }

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
    return { ...r, replacements: await this.replacementsOf(id) };
  }

  /*  Read on its own instead of through `include`: the extended (soft-delete)
      client and a client generated before DEC-RTN-017 disagree about the shape,
      and one relation is not worth a type argument that deep.  */
  private async replacementsOf(returnId: string): Promise<ReplacementRow[]> {
    const client = this.prisma as unknown as {
      returnReplacementLine?: { findMany(args: unknown): Promise<ReplacementRow[]> };
    };
    if (!client.returnReplacementLine) return [];
    try {
      return await client.returnReplacementLine.findMany({
        where: { returnId, deletedAt: null },
        orderBy: { createdAt: 'asc' },
      });
    } catch {
      return [];
    }
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
        /*  DEC-POS-018 — a counter line carries an Item instead of a Product.  */
        itemId: (l as { itemId?: string | null }).itemId ?? null,
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
      /*  DEC-POS-018 — a website line carries a product, a counter line an item  */
      productId: string | null;
      itemId: string | null;
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
        itemId: src.itemId ?? null, // DEC-POS-018
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

    /*  DEC-RTN-017 — a replacement takes goods OUT of the shop. Default is the
        same goods in the same count; the staff can swap them on the screen.  */
    const replacementRows =
      resolution === ReturnResolution.REPLACEMENT
        ? (dto.replacements?.length
            ? dto.replacements
                .filter((x) => x.qty > 0 && (x.itemId || x.productId))
                .map((x) => ({
                  itemId: x.itemId ?? null,
                  productId: x.productId ?? null,
                  name: x.name,
                  qty: x.qty,
                  unitPaisa: x.unitPaisa ?? 0,
                }))
            : lineRows.map((l) => ({
                itemId: l.itemId,
                productId: l.productId,
                name: l.name,
                qty: l.qty,
                unitPaisa: l.unitPaisa,
              })))
        : [];

    /*  DEC-RTN-018 — the shop says how much credit it gives. Above what was
        collected is the owner's call, not a cashier's.  */
    let creditAskPaisa: number | null = null;
    if (resolution === ReturnResolution.STORE_CREDIT) {
      const want = Math.round(dto.creditAskPaisa ?? returnValuePaisa);
      if (want < 0) throw new BadRequestException('store credit cannot be negative');
      const cap = await this.settleCap(dto.orderId);
      const role = (dto.actorRole ?? '').toUpperCase();
      if (want > cap && role !== 'OWNER' && role !== 'MANAGER')
        throw new ForbiddenException(
          `Only the owner or a manager can give more credit than the ${(cap / 100).toFixed(2)} taka collected on this bill.`,
        );
      creditAskPaisa = want;
    }

    const created = await this.withNextReturnNo((returnNo) =>
      this.prisma.db.$transaction(async (tx) => {
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
          ...({ creditAskPaisa } as object), // DEC-RTN-018 (cast: pre-migration client)
          ...(replacementRows.length
            ? ({ replacements: { create: replacementRows } } as object) // DEC-RTN-017
            : {}),
          actorName,
          note: dto.note,
          lines: {
            /*  cast: on a machine whose client predates DEC-POS-018 productId is
                still non-null and itemId unknown. Removed at the next regenerate.  */
            create: lineRows.map((l) => ({
              orderLine: { connect: { id: l.orderLineId } },
              productId: l.productId,
              itemId: l.itemId ?? null, // DEC-POS-018
              name: l.name,
              qty: l.qty,
              unitPaisa: l.unitPaisa,
              valuePaisa: l.valuePaisa,
              restockAction: l.restockAction,
            })) as unknown as Prisma.SalesReturnLineCreateWithoutReturnInput[],
          },
        },
        include: RETURN_INCLUDE,
      });
    }),
    );
    const returnNo = created.returnNo;

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


  /*  DEC-POS-024 — a counter line sold by the base unit took a FRACTION of the
      item's counting unit off the shelf; putting `qty` back whole would grow
      stock out of thin air. The order line's snapshot says how much one sold
      unit really weighed; the same share goes back.  */
  private async unitOverrides(lines: { orderLineId: string; qty: number }[]) {
    const ids = [...new Set(lines.map((l) => l.orderLineId))];
    if (!ids.length) return new Map<string, number>();
    const rows = await this.prisma.db.orderLine.findMany({
      where: { id: { in: ids } },
      select: { id: true, qty: true, ...({ unitQtyMilli: true } as object) },
    });
    const out = new Map<string, number>();
    for (const r of rows as { id: string; qty: number; unitQtyMilli?: number | null }[]) {
      if (r.unitQtyMilli != null && r.qty > 0) out.set(r.id, r.unitQtyMilli / r.qty);
    }
    return out; // orderLineId -> milli per ONE sold unit
  }

  /* ============================ complete (execute) ============================ */

  /**
   * Put a completed return's goods back on the shelf when they never got there.
   * Two of the owner's returns (21 Aug) completed while the restock path only
   * spoke Product, so counter lines were dropped in silence. Guarded: if the
   * movements are already there it does nothing rather than restocking twice.
   */
  async repostRestock(id: string, actorName = 'system') {
    const r = await this.prisma.db.salesReturn.findFirst({
      where: { id },
      include: { lines: true },
    });
    if (!r) throw new NotFoundException('return not found');
    if (r.status !== ReturnStatus.completed)
      throw new BadRequestException('only a completed return can be reposted');

    const already = await this.prisma.db.inventoryMovement.count({
      where: { refType: 'SALE_RETURN', refId: r.id },
    });
    if (already > 0) return { posted: 0, skipped: [], already };

    const perOne = await this.unitOverrides(r.lines);
    const lines = r.lines
      .filter((l) => l.restockAction === ReturnRestockAction.RESTOCK)
      .map((l) => ({
        productId: l.productId ?? null,
        itemId: (l as { itemId?: string | null }).itemId ?? null,
        qty: l.qty,
        qtyMilliOverride: perOne.has(l.orderLineId) ? Math.round(perOne.get(l.orderLineId)! * l.qty) : undefined,
      }))
      .filter((l) => !!l.productId || !!l.itemId);
    if (!lines.length) return { posted: 0, skipped: [], already: 0 };

    const res = await this.inventory.postSaleReturn({
      returnId: r.id, returnNo: r.returnNo, orderId: r.orderId, actor: actorName, lines,
    });
    await this.event(id, 'system', `Restock reposted — ${res.posted} movement(s)`, actorName);
    return { ...res, already: 0 };
  }

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
    // DEC-GBL-001/006 — a payout cannot leave by a door the shop has closed,
    // and it has to say which account it left from
    await this.payMethods.assertActive(refundMethod);

    /*  1) restock — ONLY lines the staff marked RESTOCK; fail-soft (never break
        the flow). Website lines come back by their Product, counter lines by the
        Item itself (owner, 21 Aug: a completed counter return never reached the
        shelf, because only the Product path existed).  */
    const perOne = await this.unitOverrides(r.lines);
    const restockLines = r.lines
      .filter((l) => l.restockAction === ReturnRestockAction.RESTOCK)
      .map((l) => ({
        productId: l.productId ?? null,
        itemId: (l as { itemId?: string | null }).itemId ?? null,
        qty: l.qty,
        qtyMilliOverride: perOne.has(l.orderLineId) ? Math.round(perOne.get(l.orderLineId)! * l.qty) : undefined,
      }))
      .filter((l) => !!l.productId || !!l.itemId);
    if (restockLines.length) {
      try {
        const res = await this.inventory.postSaleReturn({
          returnId: r.id,
          returnNo: r.returnNo,
          orderId: r.orderId, // back into the store the goods left (DEC-INV-018)
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
      /*  DEC-RTN-018 — the amount the shop decided, which may sit above the cap
          because an owner or a manager said so when the return was written.  */
      const asked = (r as { creditAskPaisa?: number | null }).creditAskPaisa;
      storeCreditPaisa = asked === null || asked === undefined ? Math.min(r.returnValuePaisa, cap) : asked;
    } else if (r.resolution === ReturnResolution.PARTIAL_COMPENSATION) {
      const want = r.compensationPaisa || 0;
      compensationPaisa = Math.min(want, cap);
      if (asStoreCredit) storeCreditPaisa = compensationPaisa;
      else refundPaisa = compensationPaisa;
    } else if (r.resolution === ReturnResolution.REPLACEMENT) {
      /*  DEC-RTN-017 — the goods that go out have to leave the shelf, or a
          replacement quietly grows the stock by one every time.  */
      const out = (r.replacements ?? []).filter((x) => !x.deletedAt && x.qty > 0);
      const outLines = out
        .map((x) => ({ productId: x.productId, itemId: x.itemId, qty: x.qty }))
        .filter((l) => !!l.productId || !!l.itemId);
      if (outLines.length) {
        try {
          const res = await this.inventory.postSaleForOrder({
            orderId: r.orderId,
            orderNo: `${r.order?.orderNo ?? ''} · replacement ${r.returnNo}`,
            actor: actorName,
            direction: -1,
            lines: outLines,
          });
          await this.event(
            id,
            'system',
            `Replacement out — ${res.posted} movement(s)${
              res.skipped.length ? ` · skipped (no item link): ${res.skipped.join(', ')}` : ''
            }`,
            actorName,
          );
        } catch (e) {
          await this.event(
            id,
            'system',
            `⚠ Replacement stock not deducted: ${e instanceof Error ? e.message : e}`,
            actorName,
          );
        }
      }
      await this.event(
        id,
        'delivery',
        out.length
          ? `Replacement handed over — ${out.map((o) => `${o.name} × ${o.qty}`).join(', ')} (no money moved)`
          : 'Replacement — redeliver goods (no money moved)',
        actorName,
      );
    }

    const cashOut = refundPaisa; // actual money leaving (compensation handled above merged into refundPaisa when not store-credit)

    /*
      ═══ DEC-FIN-031 — GATEWAY REFUND: SEND IT BEFORE RECORDING IT ═══

      The gateway call happens OUTSIDE and BEFORE the transaction below, and
      that order is the whole point. If SSLCommerz refuses — wrong reference,
      too old, already refunded — nothing may be written. A REFUND row the
      gateway never accepted is money the books say went back and the customer
      never received, and that is the worst kind of wrong: it looks settled.

      A refusal throws, so the screen shows the gateway's own reason and the
      staff member can send it by hand instead. That is the choice the owner
      asked for, arriving at the moment it is needed.
    */
    let gatewayRefundId: string | null = null;
    let gatewayRefundStatus: string | null = null;
    if (cashOut > 0 && refundMethod === REFUND_GATEWAY) {
      const can = await this.gatewayRefundable(order.id);
      if (!can.ok) throw new BadRequestException(can.why ?? 'This refund cannot go through the gateway.');
      const sent = await this.gateway.refund({
        bankTranId: can.bankTranId!,
        amountPaisa: cashOut,
        reason: `Return ${r.returnNo}`,
        /*  Our own id, so a double click cannot become two refunds — the same
            discipline as the payment side's tranId.  */
        refundTranId: `RF-${r.returnNo}`,
      });
      if (!sent.ok) throw new BadRequestException(sent.message);
      gatewayRefundId = sent.refundRefId;
      gatewayRefundStatus = sent.status ?? 'processing';
    }

    await this.prisma.db.$transaction(async (tx) => {
      // cash refund → real PaymentTransaction on the order + bump order.refundPaisa
      if (cashOut > 0) {
        const method = this.mapRefundMethod(refundMethod, order.paymentMethod);
        const accountId = await this.payMethods.resolveAccount(method, dto.refundAccountId);
        await tx.paymentTransaction.create({
          data: {
            orderId: order.id,
            kind: 'REFUND',
            method,
            amountPaisa: cashOut,
            note: `Return ${r.returnNo}`,
            actorName,
            ...({ accountId } as object), // DEC-GBL-006
            /*  DEC-FIN-031 — only a gateway refund carries these. On a
                hand-sent refund they stay null, and that absence is the honest
                record: nothing to chase at the gateway.  */
            ...({ gatewayRefundId, gatewayRefundStatus } as object),
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

      /*  ═══ P7-3 (31 Aug 2026) — CASH HANDED BACK COMES OUT OF THE DRAWER ═══
          Finance was told (it credits the cash account), the customer was told,
          and the till was not. So the notes physically left the drawer while
          `expectedCash` still counted them: at day-close the drawer came up
          short by exactly the refund, that shortage posted to `5700 Cash Short`,
          and the cashier carried the blame for money the shop gave back on
          purpose. Same shape as DEC-DLV-016 — one module zeroing what another
          reads.
          A cash refund on ANY order is taken from the counter drawer, online or
          counter, because that is where the notes are. If no shift is open,
          nothing is invented: the order timeline says so, exactly as a due
          collection with no drawer does (POS-REV-4).  */
      if (refundTxn && refundTxn.method === PaymentMethod.cash) {
        const drawer = await this.prisma.db.posShift.findFirst({
          where: { status: 'OPEN' },
          orderBy: { openedAt: 'desc' },
          select: { id: true, shiftNo: true },
        });
        if (drawer) {
          await this.prisma.db.posCashMovement.create({
            data: {
              shiftId: drawer.id,
              kind: 'PAYOUT',
              amountPaisa: -cashOut,
              note: `Refund · ${r.returnNo}`,
              actorName,
            },
          });
        } else {
          await this.orderEvent(
            order.id,
            'system',
            `⚠ ${(cashOut / 100).toFixed(2)} tk refunded in cash with NO shift open — it is in the ledger but no drawer recorded it leaving. Open a shift and record it.`,
            actorName,
          );
        }
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
      /*  DEC-FIN-031 — money going back down the gateway is `online` money, the
          same way it arrived. Finance then credits the Gateway account, not the
          cash drawer, which is where the money actually is.  */
      case REFUND_GATEWAY:
        return PaymentMethod.online;
      case ReturnRefundMethod.ORIGINAL:
      default:
        return orderMethod;
    }
  }

  /**
   * DEC-FIN-031 — ask the gateway whether a refund has actually landed, and
   * write down what it says.
   *
   * ⚠️ This is the ONLY thing that may turn "sent" into "arrived". Nothing
   * marks a refund as received on a timer or on optimism; the gateway is asked
   * and its own word is stored. Called from the returns screen.
   */
  async refreshGatewayRefund(paymentId: string) {
    const row = (await this.prisma.db.paymentTransaction.findFirst({
      where: { id: paymentId },
    })) as unknown as { id: string; gatewayRefundId?: string | null } | null;
    if (!row?.gatewayRefundId)
      throw new BadRequestException('This refund did not go through the gateway.');

    const got = await this.gateway.refundStatus(row.gatewayRefundId);
    await this.prisma.db.paymentTransaction.update({
      where: { id: row.id },
      data: { gatewayRefundStatus: got.status ?? 'processing' } as unknown as Record<string, string>,
    });
    return { status: got.status, refundedOn: got.refundedOn };
  }

  /**
   * What is still ours to give back on this order: collected − already refunded −
   * credit already issued (DEC-RTN-011). Cash never passes it; store credit may,
   * but only on an owner's or a manager's say-so (DEC-RTN-018).
   */
  private async settleCap(orderId: string, exceptReturnId?: string): Promise<number> {
    const order = await this.prisma.db.order.findFirst({
      where: { id: orderId },
      select: { paidPaisa: true, refundPaisa: true },
    });
    if (!order) return 0;
    const prior = await this.prisma.db.salesReturn.aggregate({
      where: {
        orderId,
        id: exceptReturnId ? { not: exceptReturnId } : undefined,
        status: ReturnStatus.completed,
        deletedAt: null,
      },
      _sum: { storeCreditPaisa: true },
    });
    return Math.max(0, order.paidPaisa - order.refundPaisa - (prior._sum.storeCreditPaisa ?? 0));
  }

  private async nextReturnNo(skip = 0): Promise<string> {
    // Parse the numeric max over REAL numbers only (RTN-000001). Demo rows use a
    // non-numeric RTN-D001 shape and must be ignored — a naive desc+parseInt would
    // pick "RTN-D004", parse NaN, and poison every future number.
    //
    // The RAW client on purpose (21 Aug): a soft-deleted return keeps its row and
    // its number, and the unique index does not care about deletedAt. Reading
    // through `.db` hides those rows, so the next return is handed a number that
    // already exists and every create dies on P2002.
    const rows = await this.prisma.salesReturn.findMany({
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
    return `RTN-${String(max + 1 + skip).padStart(6, '0')}`;
  }

  /**
   * Read-then-write is not atomic, and a number can also be taken by a row that
   * was deleted. Stepping over a taken number costs nothing — the sequence only
   * has to be unique and roughly increasing (same shape as Purchases, PUR-REV-7).
   */
  private async withNextReturnNo<T>(write: (no: string) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        return await write(await this.nextReturnNo(attempt));
      } catch (e) {
        const taken =
          e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
        if (!taken || attempt === 7) throw e;
      }
    }
    throw new BadRequestException('Could not allocate a return number — try again.');
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
