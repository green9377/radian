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
import { PaymentMethodsService } from '../common/payment-methods.service';
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
    /*  DEC-GBL-001 — one payment list for the whole shop  */
    private readonly payMethods: PaymentMethodsService,
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
    // raw client: a deleted bill still holds its number in the unique index
    const last = await this.prisma.order.findFirst({
      where: { orderNo: { startsWith: 'POS-' } },
      orderBy: { orderNo: 'desc' },
      select: { orderNo: true },
    });
    const n = (last?.orderNo ? parseInt(last.orderNo.slice(4), 10) + 1 : 1) + skip;
    return `POS-${String(n).padStart(6, '0')}`;
  }

  private async nextShiftNo(skip = 0): Promise<string> {
    const last = await this.prisma.posShift.findFirst({
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
    /*  Take the fields by name, never the body as it stands. ActorInterceptor
        stamps `actorName` onto every write body so the ledger records the real
        person, and PosSetting has no such column — so passing the DTO straight
        through made Prisma refuse ("Unknown argument actorName") and POS
        settings could never be saved at all. Found 21 Aug while adding
        DEC-POS-021; the bug was older than the feature.  */
    const data: Prisma.PosSettingUpdateInput = {};
    if (patch.openingFloatDefaultPaisa !== undefined) data.openingFloatDefaultPaisa = patch.openingFloatDefaultPaisa;
    if (patch.defaultTaxRateBps !== undefined) data.defaultTaxRateBps = patch.defaultTaxRateBps;
    if (patch.giftReceiptHidePrice !== undefined) data.giftReceiptHidePrice = patch.giftReceiptHidePrice;
    if (patch.defaultCreditLimitPaisa !== undefined) data.defaultCreditLimitPaisa = patch.defaultCreditLimitPaisa;
    if (patch.receiptHeader !== undefined) data.receiptHeader = patch.receiptHeader;
    if (patch.receiptFooter !== undefined) data.receiptFooter = patch.receiptFooter;
    if (patch.enabledMethods !== undefined) (data as { enabledMethods?: string[] }).enabledMethods = patch.enabledMethods;
    return this.prisma.db.posSetting.update({ where: { id: s.id }, data });
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

  /**
   * Strictest cap across the cart; unconfigured = 100 (no block).
   *
   * DEC-POS-018 — a counter line sells an Item, so a rule can now also be written
   * against an item or its item category. A rule written against a website product
   * still applies to the legacy product line, exactly as before.
   */
  private async cartDiscountCap(productIds: string[], itemIds: string[] = []): Promise<number> {
    const rules = await this.discountRules();
    if (!rules.length) return 100;
    let cap = 100;

    if (productIds.length) {
      const products = await this.prisma.db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, category: { select: { id: true } } } });
      for (const p of products) {
        const override = rules.find((r) => r.productId === p.id);
        const catRule = p.category ? rules.find((r) => r.categoryId === p.category!.id) : undefined;
        const rule = override ?? catRule;
        if (rule) cap = Math.min(cap, rule.maxPercent);
      }
    }

    if (itemIds.length) {
      const items = await this.prisma.db.item.findMany({
        where: { id: { in: itemIds } },
        select: { id: true, itemCategoryId: true },
      });
      for (const it of items) {
        const rule =
          rules.find((r) => (r as { itemId?: string | null }).itemId === it.id) ??
          (it.itemCategoryId
            ? rules.find((r) => (r as { itemCategoryId?: string | null }).itemCategoryId === it.itemCategoryId)
            : undefined);
        if (rule) cap = Math.min(cap, rule.maxPercent);
      }
    }

    return cap;
  }

  /* ------------------------------------------------ catalogue (DEC-POS-018) */

  /**
   * What the till may sell: every item marked "We sell it", services included.
   *
   * Products are deliberately absent. The website's shelf is a listing on top of
   * these same items, and offering both would put one thing on the screen twice —
   * with two prices and two ways for stock to leave.
   *
   * The price is worked out exactly as the item screen works it out (DEC-ITM-023),
   * because a cashier reading a different number from the owner is how arguments start.
   */
  async catalogue(search?: string) {
    const rows = await this.prisma.db.item.findMany({
      where: {
        isSaleable: true,
        isActive: true,
        ...(search?.trim()
          ? {
              OR: [
                { name: { contains: search.trim(), mode: 'insensitive' as const } },
                { sku: { contains: search.trim(), mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      select: {
        id: true, sku: true, name: true, imageUrl: true, itemType: true,
        isStockTracked: true,
        costMode: true, standardCostPaisa: true, computedCostPaisa: true,
        minMarginBp: true, minMarginPaisa: true,
        itemCategory: { select: { id: true, name: true } },
        unit: { select: { name: true, shortCode: true } },
        ...({ sellingPricePaisa: true, markupBp: true } as object),
      },
      orderBy: { name: 'asc' },
      take: 500,
    });

    /*  What is actually on the shelf. The till showed a teddy with nothing behind it
        and said nothing (owner, 20 Aug) — a counter screen that hides the shortage is
        worse than one that has no stock figure at all, because the cashier promises
        something the shop cannot hand over. Services are not counted and say so.  */
    const stock = await this.prisma.db.inventoryStock.groupBy({
      by: ['itemId'],
      where: { itemId: { in: rows.map((r) => r.id) } },
      _sum: { qtyMilli: true },
    });
    const onHand = new Map(stock.map((s) => [s.itemId, s._sum.qtyMilli ?? 0]));

    const defaultMarkupBp = await this.itemMarkupBp();
    return rows.map((r) => {
      const it = r as typeof r & { sellingPricePaisa?: number | null; markupBp?: number | null };
      const cost = it.costMode === 'AUTO' ? (it.computedCostPaisa ?? it.standardCostPaisa) : it.standardCostPaisa;
      const auto = cost > 0 ? Math.round(cost * (1 + (it.markupBp ?? defaultMarkupBp) / 10_000)) : null;
      const floor = it.minMarginBp
        ? Math.round(cost * (1 + it.minMarginBp / 10_000))
        : it.minMarginPaisa
          ? cost + it.minMarginPaisa
          : null;
      return {
        id: it.id,
        sku: it.sku,
        name: it.name,
        imageUrl: it.imageUrl,
        itemType: it.itemType,
        unitName: it.unit?.name ?? null,
        categoryId: it.itemCategory?.id ?? null,
        categoryName: it.itemCategory?.name ?? null,
        /** what the till charges; null = nobody has priced it yet */
        pricePaisa: it.sellingPricePaisa ?? auto,
        priceIsFixed: it.sellingPricePaisa != null,
        /** what the shop paid — the cashier haggles against this (owner, 20 Aug) */
        costPaisa: cost,
        /** the least it may go for — the till refuses under this */
        floorPricePaisa: floor,
        /** null = not counted (a service); otherwise the whole shop's on-hand */
        stockQty: it.isStockTracked ? Math.round((onHand.get(it.id) ?? 0) / 1000) : null,
      };
    });
  }

  /** DEC-ITM-023 — the shop's default profit percent, the same row the Item module reads */
  private async itemMarkupBp(): Promise<number> {
    const row = await (this.prisma.db as unknown as {
      itemSetting: { findFirst(): Promise<{ defaultMarkupBp: number } | null> };
    }).itemSetting.findFirst();
    return row?.defaultMarkupBp ?? 2000;
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

    /*  DEC-POS-018 — the counter's catalogue is the ITEM list. A line names an item;
        `productId` is only still accepted so an older till keeps working.  */
    const itemIds = dto.lines.map((l) => l.itemId).filter((v): v is string => !!v);
    const productIds = dto.lines.map((l) => l.productId).filter((v): v is string => !!v);

    const items = itemIds.length
      ? await this.prisma.db.item.findMany({
          where: { id: { in: itemIds } },
          select: {
            id: true, name: true, isSaleable: true, isActive: true, itemType: true,
            isStockTracked: true,
            standardCostPaisa: true, computedCostPaisa: true, costMode: true,
            minMarginBp: true, minMarginPaisa: true,
            ...({ sellingPricePaisa: true, markupBp: true } as object),
          },
        })
      : [];
    const iMap = new Map(items.map((i) => [i.id, i as typeof i & { sellingPricePaisa?: number | null; markupBp?: number | null }]));
    const defaultMarkupBp = itemIds.length ? await this.itemMarkupBp() : 2000;

    const products = productIds.length
      ? await this.prisma.db.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true, productType: true, sellingPricePaisa: true, discountType: true, discountValue: true, discountStartsAt: true, discountEndsAt: true, stockMode: true },
        })
      : [];
    const pMap = new Map(products.map((p) => [p.id, p]));

    /*  POS-R14 (owner, 20 Aug) — the counter cannot sell what is not on the shelf.
        The website may take an order for something that has run out (DEC-INV-011
        ALLOW_WARN, so a bouquet can still be promised for tomorrow); a customer
        standing at the till cannot walk out with air. Services are not counted.  */
    if (itemIds.length) {
      const wanted = new Map<string, number>();
      for (const l of dto.lines) {
        if (l.itemId) wanted.set(l.itemId, (wanted.get(l.itemId) ?? 0) + Math.max(0, l.qty ?? 0));
      }
      const tracked = items.filter((i) => i.isStockTracked);
      if (tracked.length) {
        const held = await this.prisma.db.inventoryStock.groupBy({
          by: ['itemId'],
          where: { itemId: { in: tracked.map((i) => i.id) } },
          _sum: { qtyMilli: true },
        });
        const onHand = new Map(held.map((h) => [h.itemId, Math.floor((h._sum.qtyMilli ?? 0) / 1000)]));
        const short = tracked
          .map((i) => ({ name: i.name, want: wanted.get(i.id) ?? 0, have: onHand.get(i.id) ?? 0 }))
          .filter((x) => x.want > x.have);
        if (short.length) {
          throw new BadRequestException(
            `not enough stock: ${short.map((x) => `${x.name} (want ${x.want}, have ${x.have})`).join('; ')}`,
          );
        }
      }
    }

    const lineData: Prisma.OrderLineCreateWithoutOrderInput[] = dto.lines.map((l) => {
      if (!l.qty || l.qty < 1) throw new BadRequestException('line qty must be >= 1');

      /* ---- the counter's own path: an Item ---- */
      if (l.itemId) {
        const it = iMap.get(l.itemId);
        if (!it) throw new BadRequestException(`itemId ${l.itemId} not found`);
        if (!it.isSaleable || !it.isActive) {
          throw new BadRequestException(`"${it.name}" is not on sale — switch on "We sell it" first`);
        }
        /*  the price the item screen shows, worked out the same way (DEC-ITM-023):
            a fixed price if it has one, else cost + profit%.  */
        const cost =
          it.costMode === 'AUTO' ? (it.computedCostPaisa ?? it.standardCostPaisa) : it.standardCostPaisa;
        const markupBp = it.markupBp ?? defaultMarkupBp;
        const auto = cost > 0 ? Math.round(cost * (1 + markupBp / 10_000)) : null;
        const listed = it.sellingPricePaisa ?? auto;
        const unitPaisa = l.unitPaisa ?? listed ?? 0;
        if (unitPaisa <= 0) {
          throw new BadRequestException(
            `"${it.name}" has no counter price yet — set one on the item, or type the price on the line`,
          );
        }
        /*  DEC-ITM-018 — the floor is the whole point of the floor: the till may
            haggle, but never under what the owner said he would accept.  */
        const floor = it.minMarginBp
          ? Math.round(cost * (1 + it.minMarginBp / 10_000))
          : it.minMarginPaisa
            ? cost + it.minMarginPaisa
            : null;
        if (floor !== null && unitPaisa < floor) {
          throw new BadRequestException(
            `"${it.name}" cannot be sold under ${(floor / 100).toFixed(2)} — that is its minimum`,
          );
        }
        /*  cast: the generated client on a machine that has not run BUILD_CHECK.bat
            still thinks a line must have a product (DEC-POS-018 made it optional)  */
        return {
          item: { connect: { id: it.id } },
          name: it.name,
          addonLabels: [],
          // a counter line is what it is; the enum only exists for website products
          productType: 'READYMADE' as ProductType,
          qty: l.qty,
          unitPaisa,
          linePaisa: unitPaisa * l.qty,
          discountPaisa: 0,
        } as unknown as Prisma.OrderLineCreateWithoutOrderInput;
      }

      /* ---- legacy path: a website product sold at the counter ---- */
      if (!l.productId) throw new BadRequestException('a line needs an itemId');
      const p = pMap.get(l.productId);
      if (!p) throw new BadRequestException(`productId ${l.productId} not found`);
      /*  DEC-PRD-028 — the counter honours the same price and the same window.  */
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
      const cap = await this.cartDiscountCap(
        dto.lines.map((l) => l.productId).filter((v): v is string => !!v),
        dto.lines.map((l) => l.itemId).filter((v): v is string => !!v),
      );
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
      // DEC-GBL-001 — the shop's list decides, not the screen
      await this.payMethods.assertActive(p.method);
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

    /*  DEC-POS-022 — an advance order is a promise, not a hand-over. The goods
        stay on the shelf until the day comes, so nothing about stock happens
        here; the money that came in today is real and is recorded.  */
    const promisedFor = dto.advance?.promisedFor ? new Date(dto.advance.promisedFor) : null;
    if (promisedFor && Number.isNaN(promisedFor.getTime()))
      throw new BadRequestException('That pick-up date cannot be read');
    if (promisedFor && promisedFor.getTime() < Date.now() - 24 * 60 * 60 * 1000)
      throw new BadRequestException('An advance order cannot be promised for a day that has passed');
    const isAdvance = !!promisedFor;

    // payment-mode rules (DEC-POS-017 / DEC-POS-008)
    if (!isAdvance && dto.payMode === 'full' && duePaisa > 0) throw new BadRequestException('full payment: take the whole amount or switch to partial');
    const identified = !!(dto.customerId || dto.customerPhone?.trim());
    if (duePaisa > 0 && !identified) throw new BadRequestException('a due (credit) sale needs an identified customer');

    const customer = await this.resolveCustomer(dto);
    /*  DEC-POS-019 — the cashier says which channel this sale came through; the
        counter's own channel is the default when nothing is picked.  */
    /*  DEC-POS-020 — a bill may be dated back, never forward. "Forward" has to
        allow for the clock: the shop is at UTC+6 and the server is not, so a
        bill written this morning arrives stamped a few hours ahead. Anything
        inside a day is pulled back to now; a genuinely later day is refused.  */
    const asked = dto.saleDate ? new Date(dto.saleDate) : new Date();
    if (Number.isNaN(asked.getTime())) throw new BadRequestException('That date cannot be read');
    const now = Date.now();
    if (asked.getTime() > now + 24 * 60 * 60 * 1000)
      throw new BadRequestException('A bill cannot be dated in the future');
    const saleDate = asked.getTime() > now ? new Date(now) : asked;

    const channelId = dto.channelId
      ? (await this.prisma.db.channel.findFirst({ where: { id: dto.channelId, isActive: true }, select: { id: true } }))?.id
        ?? (() => { throw new BadRequestException('That sales channel is switched off'); })()
      : await this.posChannelId();
    const paymentStatus = duePaisa === 0 ? PaymentStatus.paid : paid > 0 ? PaymentStatus.advance_paid : PaymentStatus.unpaid;

    // POS-REV-2 — receipt number allocated INSIDE the retry, wrapping the whole sale
    const order = await this.withNextNo(
      (skip) => this.nextPosNo(skip),
      (orderNo) => this.prisma.db.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          orderNo,
          /*  DEC-POS-020 — the bill's own date. A counter sale is normally now,
              but a bill written up the next morning must be able to say which
              day it belongs to. The future is refused above; the drawer and the
              shift stay with today either way.  */
          placedAt: saleDate,
          ...({ salespersonName: dto.salespersonName?.trim() || actorName } as object),
          channel: { connect: { id: channelId } },
          customer: { connect: { id: customer.id } },
          senderName: customer.name,
          senderPhone: customer.phone,
          fulfillmentType: FulfillmentType.COUNTER,
          promisedBy: promisedFor,
          branchId: dto.branchId ?? shift.registerId ?? null,
          posShift: { connect: { id: shift.id } },
          isGift: dto.isGift ?? false,
          /*  DEC-POS-022 — a walk-in is settled the moment it is rung up; an
              advance order is only placed, and completes when it is handed over.  */
          salesStatus: isAdvance ? SalesStatus.placed : SalesStatus.completed,
          deliveryStatus: isAdvance ? DeliveryStatus.unassigned : DeliveryStatus.delivered,
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
          /*  the charge names (DEC-POS-015) and the cashier's own words about
              this sale (DEC-POS-020) both belong on the bill  */
          internalNote: [dto.note?.trim(), dto.adjustmentNote?.trim()].filter(Boolean).join(" · ") || null,
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

      /*  legacy Product.stockQty decrement (DEC-INV-015 stage 1 — still the enforcing
          copy) — only for the legacy product lines. An item line's stock leaves
          through Inventory alone (DEC-POS-018), which is the whole point.  */
      if (!isAdvance) {
        for (const l of dto.lines) {
          if (!l.productId) continue;
          const p = pMap.get(l.productId);
          if (p && p.stockMode === 'MANUAL') {
            await tx.product.update({ where: { id: p.id }, data: { stockQty: { decrement: l.qty } } });
          }
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
    if (!isAdvance) try {
      const r = await this.inventory.postSaleForOrder({ orderId: order.id, orderNo, actor: actorName, direction: -1, lines: dto.lines.map((l) => ({ productId: l.productId ?? null, itemId: l.itemId ?? null, qty: l.qty })) });
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
    /*  DEC-POS-022 — no goods have moved, so there is no revenue and no cost of
        goods yet; only the money that came in is booked below.  */
    if (!isAdvance) await this.book(order.id, `POS sale ${orderNo}`, () => this.finance.onPosSale(order.id), actorName);
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
  /* ------------------------------------------------ advance orders (DEC-POS-022) */

  /** what is promised and not yet handed over, soonest first */
  async advanceOrders() {
    const rows = await this.prisma.db.order.findMany({
      where: {
        fulfillmentType: FulfillmentType.COUNTER,
        salesStatus: SalesStatus.placed,
        promisedBy: { not: null },
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        lines: { select: { id: true, name: true, qty: true, unitPaisa: true } },
      },
      orderBy: { promisedBy: 'asc' },
    });
    return rows.map((o) => ({
      id: o.id,
      orderNo: o.orderNo,
      placedAt: o.placedAt.toISOString(),
      promisedBy: o.promisedBy ? o.promisedBy.toISOString() : null,
      customerName: o.customer?.name ?? o.senderName,
      customerPhone: o.customer?.phone ?? o.senderPhone,
      totalPaisa: o.totalPaisa,
      paidPaisa: o.paidPaisa,
      duePaisa: Math.max(0, o.totalPaisa - (o.paidPaisa - o.refundPaisa)),
      lines: o.lines.map((l) => ({ id: l.id, name: l.name, qty: l.qty, unitPaisa: l.unitPaisa })),
    }));
  }

  /**
   * The day came: the goods leave now, the rest of the money is taken now, and
   * only now does the sale become revenue. Everything the walk-in path does at
   * the counter, an advance order does here instead (DEC-POS-022).
   */
  async handOverAdvance(orderId: string, dto: { payments?: PosPaymentDto[]; actorName?: string }) {
    const actorName = dto.actorName ?? 'Cashier';
    const o = await this.prisma.db.order.findFirst({
      where: { id: orderId, fulfillmentType: FulfillmentType.COUNTER },
      include: { lines: { select: { productId: true, qty: true, ...({ itemId: true } as object) } } },
    });
    if (!o) throw new NotFoundException('advance order not found');
    if (o.salesStatus !== SalesStatus.placed) throw new BadRequestException('this order has already been handed over');

    /*  take whatever is still owed first — one dialog, same rules as any other
        money that comes in (POS-REV-6 validation lives in collectDue)  */
    if (dto.payments?.length) {
      await this.collectDue({ orderId: o.id, payments: dto.payments, actorName });
    }

    await this.prisma.db.order.update({
      where: { id: o.id },
      data: {
        salesStatus: SalesStatus.completed,
        deliveryStatus: DeliveryStatus.delivered,
      },
    });

    // NOW the stock leaves (INV-RULE-001), the same call the walk-in path makes
    try {
      const r = await this.inventory.postSaleForOrder({
        orderId: o.id, orderNo: o.orderNo, actor: actorName, direction: -1,
        lines: o.lines.map((l) => ({ productId: l.productId ?? null, itemId: (l as { itemId?: string | null }).itemId ?? null, qty: l.qty })),
      });
      if (r.skipped.length) {
        await this.audit.event({ entityType: 'Order', entityId: o.id, kind: 'system', label: `Inventory: ${r.posted} movement(s); skipped (no item link): ${r.skipped.join(', ')}`, actorName });
      }
    } catch (e) {
      await this.audit.event({ entityType: 'Order', entityId: o.id, kind: 'system', label: `Inventory mirror failed: ${e instanceof Error ? e.message : 'error'}`, actorName });
    }

    // …and only now is it revenue and cost of goods
    await this.book(o.id, `POS sale ${o.orderNo} (advance handed over)`, () => this.finance.onPosSale(o.id), actorName);
    await this.audit.event({ entityType: 'Order', entityId: o.id, kind: 'sales', label: `Advance order ${o.orderNo} handed over`, actorName });

    return this.prisma.db.order.findFirst({ where: { id: o.id } });
  }

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
      await this.payMethods.assertActive(p.method); // DEC-GBL-001
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
