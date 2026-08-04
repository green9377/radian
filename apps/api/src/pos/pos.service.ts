import { ensureSingleton } from '../common/singleton';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  DiscountType,
  ProductType,
  SalesStatus,
  DeliveryStatus,
  DeliveryZone,
  PaymentMethod,
  PaymentStatus,
  PaymentTxnKind,
  FulfillmentType,
  PosShiftStatus,
  PosCashKind,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paidPaisa } from '../common/discount-window';
import { AuditService } from '../common/audit.service';
import { InventoryService } from '../inventory/inventory.service';
import { FinanceEventsService } from '../finance/finance-events.service';
import {
  OpenShiftDto,
  CloseShiftDto,
  CashMovementDto,
  CreatePosSaleDto,
  CollectDueDto,
  DiscountRuleInput,
  UpdatePosSettingsDto,
  CreateRegisterDto,
  PosPaymentDto,
  PosTender,
} from './pos.dto';

const ENTITY = 'PosSale';
const TENDER_METHOD: Record<PosTender, PaymentMethod> = {
  cash: PaymentMethod.cash,
  bkash: PaymentMethod.bkash,
  nagad: PaymentMethod.nagad,
  card: PaymentMethod.card,
};

@Injectable()
export class PosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly inventory: InventoryService,
    // Finance consumes the completed counter sale — fail-soft (DEC-FIN-010)
    private readonly finance: FinanceEventsService,
  ) {}

  /* ------------------------------------------------ helpers */


  /**
   * POS-REV-2 (30 Jul) — allocate a receipt number and RETRY if somebody took it.
   *
   * `Order.orderNo` and `PosShift.shiftNo` are @unique and both numbers were
   * read-the-highest-then-add-one. Two counters ringing up at the same second both
   * read POS-000412, both write it, and the loser came back as a raw P2002 — a 500
   * on the till with the customer standing there holding money.
   *
   * Of everywhere this pattern appears in the system, POS is the worst place for it:
   * it is the only screen where two people are meant to be working at once, at speed.
   */
  private async withNextNo<T>(
    next: (skip: number) => Promise<string>,
    write: (no: string) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        return await write(await next(attempt));
      } catch (e) {
        const taken = e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
        if (!taken || attempt === 7) throw e;
      }
    }
    throw new BadRequestException('Could not allocate a receipt number — try again.');
  }

  /** DEC-POS-004 — sequential POS receipt number POS-NNNNNN (shared counter pattern). */
  private async nextPosNo(skip = 0): Promise<string> {
    const last = await this.prisma.db.order.findFirst({
      where: { orderNo: { startsWith: 'POS-' } },
      orderBy: { orderNo: 'desc' },
      select: { orderNo: true },
    });
    const n = (last?.orderNo ? parseInt(last.orderNo.slice(4), 10) + 1 : 1) + skip;
    return `POS-${String(n).padStart(6, '0')}`;
  }

  private async nextShiftNo(skip = 0): Promise<string> {
    const last = await this.prisma.db.posShift.findFirst({
      where: { shiftNo: { startsWith: 'SHF-' } },
      orderBy: { shiftNo: 'desc' },
      select: { shiftNo: true },
    });
    const n = (last?.shiftNo ? parseInt(last.shiftNo.slice(4), 10) + 1 : 1) + skip;
    return `SHF-${String(n).padStart(6, '0')}`;
  }

  /* POS-REV-1 (30 Jul) — THREE MORE unprotected lazy singletons, all in this file.
     With Inventory's assembly floor that makes FOUR the 29 July sweep missed, and they
     were all missed the same way: that pass looked for `*Setting` accessors, so the
     lesson was applied to the SHAPE (a settings row) rather than to the HAZARD (any
     lazily-created row behind a @unique column).
     `Channel.slug`, `Customer.phone` and `PosRegister.code` are all @unique, so the
     first two counter sales of the morning raced each other and one died on P2002 —
     at the till, before a receipt existed. */

  /** POS channel (unified ledger — DEC-POS-001/002). */
  private async posChannelId(): Promise<string> {
    const c = await ensureSingleton(
      () => this.prisma.db.channel.findFirst({ where: { slug: 'pos' }, select: { id: true } }),
      () => this.prisma.db.channel.create({ data: { slug: 'pos', name: 'POS' }, select: { id: true } }),
    );
    return c.id;
  }

  /** Anonymous walk-in system customer (DEC-POS-007). */
  private async walkInCustomerId(): Promise<string> {
    const c = await ensureSingleton(
      () => this.prisma.db.customer.findFirst({ where: { phone: 'WALK-IN' }, select: { id: true } }),
      () => this.prisma.db.customer.create({ data: { name: 'Walk-in Customer', phone: 'WALK-IN' }, select: { id: true } }),
    );
    return c.id;
  }

  /**
   * POS-REV-5 (30 Jul) — the ONE place a finance event leaves this module.
   * Every call used to be `void this.finance…`. `safe()` swallows the error into a
   * FinancePostingFailure row, which is right, but nothing put it in front of anybody
   * — and this is the cash register. A POS sale that never posts takes its revenue,
   * its VAT and its cost of goods with it, and the day still looks like it balanced.
   */
  private async book(orderOrShiftId: string, what: string, run: () => Promise<void>, actorName: string) {
    try {
      await run();
    } catch (e) {
      await this.audit.event({
        entityType: 'Order',
        entityId: orderOrShiftId,
        kind: 'system',
        label: `⚠ Finance posting failed (${what}) — NOT in the books, replay it from Finance`,
        actorName,
        note: e instanceof Error ? e.message : String(e),
      });
    }
  }

  /** Resolve the customer for a sale: explicit id → phone upsert → walk-in. */
  private async resolveCustomer(dto: { customerId?: string; customerName?: string; customerPhone?: string }) {
    if (dto.customerId) {
      const c = await this.prisma.db.customer.findFirst({ where: { id: dto.customerId } });
      if (!c) throw new BadRequestException('customer not found');
      return c;
    }
    const phone = dto.customerPhone?.trim();
    if (phone) {
      /* POS-REV-8 (30 Jul) — the FOURTH one in this file, and I missed it on the first
         pass; the system-wide sweep found it. `Customer.phone` is @unique, so two
         counter sales taking the same NEW phone number at the same moment both looked,
         both saw nothing, and the loser died on P2002 — at the till.
         This is not a hypothetical: it is what happens when a customer buys at one
         counter and their spouse pays at the other, which for a flower shop on
         Valentine's morning is a Tuesday. */
      return ensureSingleton(
        () => this.prisma.db.customer.findFirst({ where: { phone } }),
        () => this.prisma.db.customer.create({ data: { name: dto.customerName?.trim() || phone, phone } }),
      );
    }
    const id = await this.walkInCustomerId();
    const c = await this.prisma.db.customer.findFirst({ where: { id } });
    if (!c) throw new BadRequestException('walk-in customer unavailable');
    return c;
  }

  /* ------------------------------------------------ settings */

  async settings() {
    // ensureSingleton — survives two requests creating this row at once (P2002)
    return ensureSingleton(
      () => this.prisma.db.posSetting.findFirst(),
      () => this.prisma.db.posSetting.create({ data: {} }),
    );
  }

  async updateSettings(patch: UpdatePosSettingsDto) {
    const s = await this.settings();
    return this.prisma.db.posSetting.update({ where: { id: s.id }, data: patch });
  }

  /* ------------------------------------------------ registers */

  async registers() {
    const list = await this.prisma.db.posRegister.findMany({ orderBy: { code: 'asc' } });
    if (list.length) return list;
    /* POS-REV-1 — the third of them. `PosRegister.code` is @unique, and this is the
       FIRST call the till screen makes on load, so in dev a React effect fires it
       twice on mount and one of the two 500s. Exactly the shape of the 29 Jul bug. */
    const first = await ensureSingleton(
      () => this.prisma.db.posRegister.findFirst({ where: { code: 'COUNTER-1' } }),
      () => this.prisma.db.posRegister.create({ data: { code: 'COUNTER-1', name: 'Main Counter' } }),
    );
    return [first];
  }

  async createRegister(dto: CreateRegisterDto) {
    const count = await this.prisma.db.posRegister.count();
    const code = dto.code?.trim() || `COUNTER-${count + 1}`;
    return this.prisma.db.posRegister.create({ data: { code, name: dto.name.trim(), branchId: dto.branchId } });
  }

  /* ------------------------------------------------ shifts */

  async currentShift(registerId?: string) {
    return this.prisma.db.posShift.findFirst({
      where: { status: PosShiftStatus.OPEN, ...(registerId ? { registerId } : {}) },
      orderBy: { openedAt: 'desc' },
      include: { register: true, cashMovements: { where: { deletedAt: null } } },
    });
  }

  async openShift(dto: OpenShiftDto) {
    if (!dto.cashierName?.trim()) throw new BadRequestException('cashierName is required');
    const open = await this.currentShift(dto.registerId);
    if (open) throw new BadRequestException('a shift is already open on this register');
    const s = await this.settings();
    // POS-REV-2 — the number is allocated inside the retry, not before it
    const shift = await this.withNextNo(
      (skip) => this.nextShiftNo(skip),
      (shiftNo) => this.prisma.db.posShift.create({
        data: {
          shiftNo,
          registerId: dto.registerId,
          cashierName: dto.cashierName.trim(),
          openingFloatPaisa: dto.openingFloatPaisa ?? s.openingFloatDefaultPaisa,
        },
      }),
    );
    await this.audit.record({ entityType: 'PosShift', entityId: shift.id, action: 'CREATE', actorName: dto.actorName ?? dto.cashierName });
    return shift;
  }

  /** Expected cash = opening float + cash sales − payouts/drops. */
  private async expectedCash(shiftId: string, openingFloatPaisa: number): Promise<number> {
    const moves = await this.prisma.db.posCashMovement.findMany({ where: { shiftId, deletedAt: null } });
    return moves.reduce((sum, m) => sum + m.amountPaisa, openingFloatPaisa);
  }

  async addCashMovement(shiftId: string, dto: CashMovementDto) {
    const shift = await this.prisma.db.posShift.findFirst({ where: { id: shiftId } });
    if (!shift) throw new NotFoundException('shift not found');
    if (shift.status !== PosShiftStatus.OPEN) throw new BadRequestException('shift is closed');
    /* POS-REV-7 (30 Jul) — the amount was never checked. A zero movement is a row that
       says nothing, and a fractional one puts a non-integer into a paisa column, which
       is the one discipline this whole codebase holds ("no floats anywhere in the
       money path"). Both then walk straight into the expected-cash sum at close. */
    if (!Number.isInteger(dto.amountPaisa) || dto.amountPaisa === 0) {
      throw new BadRequestException('Cash movement amount must be a non-zero whole number of paisa');
    }
    // PAYOUT/DROP remove cash → stored negative; ADJUSTMENT keeps its sign
    const signed = dto.kind === 'ADJUSTMENT' ? dto.amountPaisa : -Math.abs(dto.amountPaisa);
    return this.prisma.db.posCashMovement.create({
      data: { shiftId, kind: dto.kind as PosCashKind, amountPaisa: signed, note: dto.note, actorName: dto.actorName ?? shift.cashierName },
    });
  }

  async closeShift(shiftId: string, dto: CloseShiftDto) {
    const shift = await this.prisma.db.posShift.findFirst({ where: { id: shiftId } });
    if (!shift) throw new NotFoundException('shift not found');
    if (shift.status !== PosShiftStatus.OPEN) throw new BadRequestException('shift already closed');
    const expected = await this.expectedCash(shiftId, shift.openingFloatPaisa);
    const over = dto.countedCashPaisa - expected;
    const closed = await this.prisma.db.posShift.update({
      where: { id: shiftId },
      data: {
        status: PosShiftStatus.CLOSED,
        closedAt: new Date(),
        expectedCashPaisa: expected,
        countedCashPaisa: dto.countedCashPaisa,
        overShortPaisa: over,
        closeNote: dto.note,
      },
    });
    await this.audit.record({ entityType: 'PosShift', entityId: shiftId, action: 'UPDATE', actorName: dto.actorName ?? shift.cashierName, changes: { expected, counted: dto.countedCashPaisa, over } });
    // Finance consumes the completed shift close (DEC-POS-010) — POS never writes the ledger itself
    await this.book(shiftId, `shift close ${shift.shiftNo}`, () => this.finance.onPosShiftClosed(shiftId), dto.actorName ?? shift.cashierName);
    return closed;
  }

  /* ------------------------------------------------ discount rules (DEC-POS-006) */

  async discountRules() {
    return this.prisma.db.posDiscountRule.findMany({ where: { deletedAt: null } });
  }

  async replaceDiscountRules(rules: DiscountRuleInput[]) {
    await this.prisma.db.posDiscountRule.updateMany({ where: { deletedAt: null }, data: { deletedAt: new Date() } });
    for (const r of rules) {
      await this.prisma.db.posDiscountRule.create({
        data: { categoryId: r.categoryId ?? null, productId: r.productId ?? null, maxPercent: r.maxPercent, requiresApproval: r.requiresApproval },
      });
    }
    return this.discountRules();
  }

  /** Strictest cap across the cart; unconfigured = 100 (no block). */
  private async cartDiscountCap(productIds: string[]): Promise<number> {
    const rules = await this.discountRules();
    if (!rules.length) return 100;
    const products = await this.prisma.db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, category: { select: { id: true } } } });
    let cap = 100;
    for (const p of products) {
      const override = rules.find((r) => r.productId === p.id);
      const catRule = p.category ? rules.find((r) => r.categoryId === p.category!.id) : undefined;
      const rule = override ?? catRule;
      if (rule) cap = Math.min(cap, rule.maxPercent);
    }
    return cap;
  }

  /* ------------------------------------------------ SALE (DEC-POS-001) */

  async createSale(dto: CreatePosSaleDto) {
    if (!dto.lines?.length) throw new BadRequestException('add at least one item');
    const actorName = dto.actorName ?? 'Cashier';

    // shift must be open
    const shift = dto.shiftId
      ? await this.prisma.db.posShift.findFirst({ where: { id: dto.shiftId } })
      : await this.currentShift(dto.registerId);
    if (!shift || shift.status !== PosShiftStatus.OPEN) throw new BadRequestException('open a shift before selling');

    // products + lines
    const products = await this.prisma.db.product.findMany({
      where: { id: { in: dto.lines.map((l) => l.productId) } },
      select: { id: true, name: true, productType: true, sellingPricePaisa: true, discountType: true, discountValue: true, discountStartsAt: true, discountEndsAt: true, stockMode: true },
    });
    const pMap = new Map(products.map((p) => [p.id, p]));
    const lineData: Prisma.OrderLineCreateWithoutOrderInput[] = dto.lines.map((l) => {
      const p = pMap.get(l.productId);
      if (!p) throw new BadRequestException(`productId ${l.productId} not found`);
      if (!l.qty || l.qty < 1) throw new BadRequestException('line qty must be >= 1');
      /*  DEC-PRD-028 — কাউন্টারেও একই দাম, একই মেয়াদ।  */
      const unitPaisa = l.unitPaisa ?? paidPaisa(p);
      return {
        product: { connect: { id: p.id } },
        name: p.name,
        addonLabels: [],
        productType: p.productType as ProductType,
        qty: l.qty,
        unitPaisa,
        linePaisa: unitPaisa * l.qty,
        discountPaisa: 0,
      };
    });

    // money (DEC-POS-015/016)
    const subtotalPaisa = lineData.reduce((s, l) => s + l.linePaisa, 0);
    const discountPaisa = Math.min(Math.max(0, dto.discountPaisa ?? 0), subtotalPaisa);
    const adjustmentPaisa = dto.adjustmentPaisa ?? 0;
    const taxRateBps = dto.taxRateBps ?? 0;
    const base = Math.max(0, subtotalPaisa - discountPaisa + adjustmentPaisa);
    const vatPaisa = Math.round((base * taxRateBps) / 10000);
    const totalPaisa = base + vatPaisa;

    // discount cap (DEC-POS-006)
    if (discountPaisa > 0) {
      const cap = await this.cartDiscountCap(dto.lines.map((l) => l.productId));
      const pct = subtotalPaisa ? (discountPaisa / subtotalPaisa) * 100 : 0;
      if (pct > cap + 0.001 && !dto.discountApprovedBy?.trim()) {
        throw new BadRequestException(`discount ${pct.toFixed(0)}% exceeds the ${cap}% cap — manager approval required`);
      }
    }

    // payments + due
    const payments = dto.payments ?? [];
    /* POS-REV-6 (30 Jul) — validate each tender instead of clamping it.
       It was `Math.max(0, p.amountPaisa)` in the sum and `if (p.amountPaisa <= 0)
       continue` in the write, so a negative or fractional tender was SILENTLY DROPPED:
       the receipt printed, the drawer total ignored it, and nobody was told a line had
       been thrown away. A till may refuse a bad number; it may never quietly discard it. */
    for (const p of payments) {
      if (!Number.isInteger(p.amountPaisa) || p.amountPaisa <= 0) {
        throw new BadRequestException(`${p.method} amount must be a positive whole number of paisa`);
      }
      if (!TENDER_METHOD[p.method]) throw new BadRequestException(`unknown tender: ${p.method}`);
    }
    const paid = payments.reduce((s, p) => s + p.amountPaisa, 0);
    /* POS-REV-6 — and refuse an OVERPAYMENT rather than swallowing it. `duePaisa` was
       clamped at 0, so tendering ৳1000 on a ৳900 bill stored paidPaisa 1000 against
       totalPaisa 900 and called it `paid`. The ৳100 change is a real thing that leaves
       the drawer; recorded as revenue it makes the shift short by exactly that much and
       the cashier carries the blame. Change is counted by the cashier, not by the till. */
    if (paid > totalPaisa) {
      throw new BadRequestException(
        `tendered ${(paid / 100).toFixed(2)} for a ${(totalPaisa / 100).toFixed(2)} bill — enter what you are keeping, and give ${((paid - totalPaisa) / 100).toFixed(2)} as change`,
      );
    }
    const duePaisa = Math.max(0, totalPaisa - paid);

    // payment-mode rules (DEC-POS-017 / DEC-POS-008)
    if (dto.payMode === 'full' && duePaisa > 0) throw new BadRequestException('full payment: take the whole amount or switch to partial');
    const identified = !!(dto.customerId || dto.customerPhone?.trim());
    if (duePaisa > 0 && !identified) throw new BadRequestException('a due (credit) sale needs an identified customer');

    const customer = await this.resolveCustomer(dto);
    const channelId = await this.posChannelId();
    const paymentStatus = duePaisa === 0 ? PaymentStatus.paid : paid > 0 ? PaymentStatus.advance_paid : PaymentStatus.unpaid;

    // POS-REV-2 — receipt number allocated INSIDE the retry, wrapping the whole sale
    const order = await this.withNextNo(
      (skip) => this.nextPosNo(skip),
      (orderNo) => this.prisma.db.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          orderNo,
          channel: { connect: { id: channelId } },
          customer: { connect: { id: customer.id } },
          senderName: customer.name,
          senderPhone: customer.phone,
          fulfillmentType: FulfillmentType.COUNTER,
          branchId: dto.branchId ?? shift.registerId ?? null,
          posShift: { connect: { id: shift.id } },
          isGift: dto.isGift ?? false,
          salesStatus: SalesStatus.completed, // walk-in take-away — settled at the counter
          deliveryStatus: DeliveryStatus.delivered,
          zone: DeliveryZone.COUNTER,
          address: 'Counter sale',
          paymentMethod: PaymentMethod.counter,
          paymentStatus,
          paidPaisa: paid,
          duePaisa,
          subtotalPaisa,
          discountPaisa,
          adjustmentPaisa,
          vatPaisa,
          taxRateBps,
          totalPaisa,
          internalNote: dto.adjustmentNote,
          lines: { create: lineData },
        },
        include: { lines: true },
      });

      // payment transactions (split) — DEC-POS-009. Every tender is already validated
      // above (POS-REV-6), so there is nothing left here to skip over silently.
      for (const p of payments) {
        await tx.paymentTransaction.create({
          data: { orderId: created.id, kind: PaymentTxnKind.PAYMENT, method: TENDER_METHOD[p.method], amountPaisa: p.amountPaisa, actorName },
        });
      }

      // cash into the drawer for this shift (DEC-POS-010)
      const cashPaid = payments.filter((p) => p.method === 'cash').reduce((s, p) => s + p.amountPaisa, 0);
      if (cashPaid > 0) {
        await tx.posCashMovement.create({ data: { shiftId: shift.id, kind: PosCashKind.SALE_CASH, amountPaisa: cashPaid, note: orderNo, actorName } });
      }

      // legacy Product.stockQty decrement (DEC-INV-015 stage 1 — still the enforcing copy).
      // Negative allowed for a counter sale (item is physically leaving) — DEC-INV-011.
      for (const l of dto.lines) {
        const p = pMap.get(l.productId);
        if (p && p.stockMode === 'MANUAL') {
          await tx.product.update({ where: { id: p.id }, data: { stockQty: { decrement: l.qty } } });
        }
      }

      // customer sales mirror (Sales owns this; POS completes the sale)
      await tx.customer.update({
        where: { id: customer.id },
        data: { ordersCount: { increment: 1 }, ltvPaisa: { increment: BigInt(totalPaisa) }, lastOrderAt: new Date() },
      });

      return created;
      }),
    );
    const orderNo = order.orderNo;

    await this.audit.record({ entityType: ENTITY, entityId: order.id, action: 'CREATE', actorName });
    await this.audit.event({ entityType: 'Order', entityId: order.id, kind: 'sales', label: `POS sale ${orderNo} · ${customer.name}`, actorName });

    // stock deduction via Inventory (INV-RULE-001) — parallel ledger, fail-soft (DEC-INV-015; owner verify pending)
    try {
      const r = await this.inventory.postSaleForOrder({ orderId: order.id, orderNo, actor: actorName, direction: -1, lines: dto.lines.map((l) => ({ productId: l.productId, qty: l.qty })) });
      if (r.skipped.length) {
        await this.audit.event({ entityType: 'Order', entityId: order.id, kind: 'system', label: `Inventory: ${r.posted} movement(s); skipped (no item link): ${r.skipped.join(', ')}`, actorName });
      }
    } catch (e) {
      await this.audit.event({ entityType: 'Order', entityId: order.id, kind: 'system', label: `Inventory mirror failed: ${e instanceof Error ? e.message : 'error'}`, actorName });
    }

    // books: revenue + VAT + cost of goods, then each tender that came in.
    // POS-REV-5 — awaited and flagged. This is the cash register: a sale that never
    // posts takes its revenue, its VAT and its cost of goods with it, and the day
    // still looks like it balanced.
    await this.book(order.id, `POS sale ${orderNo}`, () => this.finance.onPosSale(order.id), actorName);
    const tenders = await this.prisma.db.paymentTransaction.findMany({ where: { orderId: order.id } });
    for (const t of tenders) {
      await this.book(order.id, `${t.method} tender on ${orderNo}`, () => this.finance.onPaymentRecorded(t.id), actorName);
    }

    return this.prisma.db.order.findFirst({ where: { id: order.id }, include: { lines: true, transactions: true, customer: { select: { id: true, name: true, phone: true } } } });
  }

  /* ------------------------------------------------ sales list / due / collect */

  async listSales(q: { search?: string; days?: number }) {
    const where: Prisma.OrderWhereInput = { fulfillmentType: FulfillmentType.COUNTER };
    if (q.days) where.placedAt = { gte: new Date(Date.now() - q.days * 86400000) };
    if (q.search) where.OR = [
      { orderNo: { contains: q.search, mode: 'insensitive' } },
      { senderName: { contains: q.search, mode: 'insensitive' } },
      { senderPhone: { contains: q.search } },
    ];
    return this.prisma.db.order.findMany({
      where,
      orderBy: { placedAt: 'desc' },
      take: 200,
      include: { customer: { select: { id: true, name: true, phone: true } }, transactions: { where: { deletedAt: null } }, _count: { select: { lines: true } } },
    });
  }

  async dueBoard() {
    const orders = await this.prisma.db.order.findMany({
      where: { fulfillmentType: FulfillmentType.COUNTER, duePaisa: { gt: 0 } },
      orderBy: { placedAt: 'asc' },
      include: { customer: { select: { id: true, name: true, phone: true } } },
    });
    const byCustomer = new Map<string, { customerId: string; name: string; phone: string; duePaisa: number; oldest: Date; orders: { id: string; orderNo: string; duePaisa: number; placedAt: Date }[] }>();
    for (const o of orders) {
      const key = o.customerId;
      const row = byCustomer.get(key) ?? { customerId: key, name: o.customer.name, phone: o.customer.phone, duePaisa: 0, oldest: o.placedAt, orders: [] };
      row.duePaisa += o.duePaisa;
      row.orders.push({ id: o.id, orderNo: o.orderNo, duePaisa: o.duePaisa, placedAt: o.placedAt });
      if (o.placedAt < row.oldest) row.oldest = o.placedAt;
      byCustomer.set(key, row);
    }
    return Array.from(byCustomer.values()).sort((a, b) => b.duePaisa - a.duePaisa);
  }

  /**
   * Collect against a credit sale.
   *
   * POS-REV-3 (30 Jul) — this was a LOST UPDATE, and it lost money in the direction
   * that hurts. It read the order, then wrote `paidPaisa` as an ABSOLUTE figure
   * (`o.paidPaisa + amount`). Two cashiers collecting from the same customer at the
   * same moment both read paidPaisa = 0, both created a PaymentTransaction, and both
   * wrote paidPaisa = their own amount. So: two payments in the ledger, ONE of them on
   * the order — the customer is still shown as owing money he has already paid, and
   * the ledger and the order disagree for ever with no way to tell which is right.
   * `increment` is the only safe verb here, and the whole thing belongs in one
   * transaction with the tender rows it is counting.
   *
   * POS-REV-4 (30 Jul) — and the cash went into the WRONG DRAWER, or into none at all.
   * It credited `o.posShiftId` — the shift the ORIGINAL sale was rung up on, often
   * weeks ago. Guarded by `status === OPEN`, so in the normal case (that shift is long
   * closed) the branch simply did nothing: the customer handed over real notes and
   * NOTHING recorded them. At close, today's drawer is over by that amount, the
   * cashier cannot explain it, and over/short exists precisely so that unexplained
   * money is a question. Cash belongs to the drawer it physically entered — the shift
   * open NOW.
   */
  async collectDue(dto: CollectDueDto) {
    const o = await this.prisma.db.order.findFirst({ where: { id: dto.orderId } });
    if (!o) throw new NotFoundException('order not found');
    const actorName = dto.actorName ?? 'Cashier';
    const lines = dto.payments ?? [];

    // POS-REV-6, same rule as a sale: refuse a bad tender, never discard it quietly
    for (const p of lines) {
      if (!Number.isInteger(p.amountPaisa) || p.amountPaisa <= 0) {
        throw new BadRequestException(`${p.method} amount must be a positive whole number of paisa`);
      }
      if (!TENDER_METHOD[p.method as PosTender]) throw new BadRequestException(`unknown tender: ${p.method}`);
    }
    const amount = lines.reduce((s, p) => s + p.amountPaisa, 0);
    if (amount <= 0) throw new BadRequestException('enter an amount to collect');
    const outstanding = Math.max(0, o.totalPaisa - (o.paidPaisa - o.refundPaisa));
    if (amount > outstanding) throw new BadRequestException(`cannot collect ${amount} — only ${outstanding} is outstanding`);

    const cashAmount = lines
      .filter((p) => p.method === 'cash')
      .reduce((s, p) => s + p.amountPaisa, 0);
    // POS-REV-4 — the drawer the money actually went into
    const drawer = cashAmount > 0 ? await this.currentShift() : null;

    const { updated, txnIds } = await this.prisma.db.$transaction(async (tx) => {
      const ids: string[] = [];
      for (const p of lines) {
        const txn = await tx.paymentTransaction.create({
          data: { orderId: o.id, kind: PaymentTxnKind.PAYMENT, method: TENDER_METHOD[p.method as PosTender], amountPaisa: p.amountPaisa, actorName },
        });
        ids.push(txn.id);
      }

      if (cashAmount > 0 && drawer) {
        await tx.posCashMovement.create({
          data: { shiftId: drawer.id, kind: PosCashKind.SALE_CASH, amountPaisa: cashAmount, note: `${o.orderNo} due`, actorName },
        });
      }

      /* POS-REV-3 — relative, not absolute. `refundPaisa` is read inside the
         transaction so the status cannot be decided from a stale figure either. */
      const bumped = await tx.order.update({
        where: { id: o.id },
        data: { paidPaisa: { increment: amount }, duePaisa: { decrement: amount } },
        select: { id: true, totalPaisa: true, paidPaisa: true, refundPaisa: true, duePaisa: true },
      });
      const stillDue = Math.max(0, bumped.totalPaisa - (bumped.paidPaisa - bumped.refundPaisa));
      const settled = await tx.order.update({
        where: { id: o.id },
        data: {
          duePaisa: stillDue,
          paymentStatus: stillDue === 0 ? PaymentStatus.paid : PaymentStatus.advance_paid,
        },
      });
      return { updated: settled, txnIds: ids };
    });

    // POS-REV-5 — awaited and flagged, like every other finance hand-off in this file
    for (const id of txnIds) {
      await this.book(o.id, `due collected on ${o.orderNo}`, () => this.finance.onPaymentRecorded(id), actorName);
    }

    /* POS-REV-4 — if there was cash and no shift open, say so on the order timeline.
       Silence is what made this invisible; the cash still has to be findable. */
    if (cashAmount > 0 && !drawer) {
      await this.audit.event({
        entityType: 'Order', entityId: o.id, kind: 'system',
        label: `⚠ ${(cashAmount / 100).toFixed(2)} tk cash collected with NO shift open — it is in the ledger but in nobody's drawer. Open a shift and record it as an adjustment.`,
        actorName,
      });
    }

    await this.audit.event({ entityType: 'Order', entityId: o.id, kind: 'payment', label: `Due collected ${amount} paisa`, actorName });
    return updated;
  }

  /* ------------------------------------------------ held carts (DEC-POS-011) */

  async listHeld() {
    return this.prisma.db.posHeldCart.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' } });
  }

  async createHeld(dto: { label: string; registerId?: string; payload: Prisma.InputJsonValue }) {
    return this.prisma.db.posHeldCart.create({ data: { label: dto.label, registerId: dto.registerId, payload: dto.payload } });
  }

  async deleteHeld(id: string) {
    await this.prisma.db.posHeldCart.update({ where: { id }, data: { deletedAt: new Date() } });
    return { id, deleted: true };
  }

  /* ------------------------------------------------ analytics (server-side, DEC-POS-014) */

  async analyticsToday() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const orders = await this.prisma.db.order.findMany({
      where: { fulfillmentType: FulfillmentType.COUNTER, placedAt: { gte: start } },
      select: { totalPaisa: true, duePaisa: true },
    });
    const salesPaisa = orders.reduce((s, o) => s + o.totalPaisa, 0);
    const count = orders.length;
    const duePaisa = orders.reduce((s, o) => s + o.duePaisa, 0);
    const shift = await this.currentShift();
    const cashInDrawer = shift
      ? await this.expectedCash(shift.id, shift.openingFloatPaisa)
      : 0;
    return { salesPaisa, count, avgPaisa: count ? Math.round(salesPaisa / count) : 0, duePaisa, cashInDrawer, shiftOpen: !!shift };
  }
}
