import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  DiscountType,
  ProductType,
  SalesStatus,
  DeliveryStatus,
  PaymentMethod,
  PaymentStatus,
  StockMode,
  SoldOutMode,
  AddedFrom,
} from '@prisma/client';
/*  DEC-PDP-09 — the SAME function the storefront answers with. Imported rather
    than re-derived: two copies of "is it buyable" is how a page ends up saying
    "Out of stock" above a button that still takes money. */
import { availabilityOf, isBuyable } from '../common/availability';
import { PrismaService } from '../prisma/prisma.service';
import { paidPaisa } from '../common/discount-window';
import { resolvePromisedBy } from './promise';
import { AuditService } from '../common/audit.service';
import { MerchService } from '../products/merch';
import { InventoryService } from '../inventory/inventory.service';
import { OffersService } from '../offers/offers.service';
import { FinanceEventsService } from '../finance/finance-events.service';
import { CapacityService } from '../catalog/capacity';
import { WhatsAppCloudService } from '../common/whatsapp-cloud';
import { OrderMessagesService } from '../messaging/order-messages.service';
import { OrderMessageKind } from '@prisma/client';
import {
  CreateOrderDto,
  EditOrderDto,
  AddPaymentDto,
  AddPhotoDto,
  AssignCourierDto,
  CancelOrderDto,
  ListOrderQuery,
  OrderLineInput,
} from './order.dto';

const ENTITY = 'Order';
const NOT_DELETED = { deletedAt: null };

const FULL_INCLUDE = {
  channel: true,
  customer: { select: { id: true, name: true, phone: true } },
  lines: { where: NOT_DELETED, orderBy: { createdAt: 'asc' } },
  photos: { where: NOT_DELETED, orderBy: { capturedAt: 'asc' } },
  transactions: { where: NOT_DELETED, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.OrderInclude;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly inventory: InventoryService,
    private readonly offers: OffersService,
    // DEC-FIN-010 — Finance consumes completed events; every call is fail-soft
    // inside FinanceEventsService, so the sales path can never be blocked by it.
    private readonly finance: FinanceEventsService,
    /*  The workshop's day. Booked at confirm, released at cancel —
        owner's ruling, 1 Aug 2026.  */
    private readonly capacity: CapacityService,
    /*  রসিদের WhatsApp বার্তা (confirmation storefront পাঠায়; status এখানে)।
        সব call fail-soft — বার্তা সৌজন্য, order চুক্তি।  */
    private readonly whatsappCloud: WhatsAppCloudService,
    /*
      Messages are queued rather than sent directly: a row is the only record
      that one was sent, and the database can refuse a duplicate.
    */
    private readonly orderMessages: OrderMessagesService,
    /*  DEC-PRD-050 — re-ranks Best seller after a delivery. Fail-soft by
        construction (`recomputeQuietly`), like every other courtesy on this
        path.  */
    private readonly merch: MerchService,
  ) {}

  /**
   * DEC-INV-015 stage 1 — parallel run: mirror the stock event into Inventory's
   * ledger (SALE, branch by assemblyMode per DEC-ITM-004). FAIL-SOFT on purpose:
   * an inventory error must NEVER break the live sales path — it lands on the
   * order timeline instead, and the legacy Product.stockQty write above remains
   * the enforcing copy until the owner flips the flag (stage 3).
   */
  private async mirrorToInventory(
    orderId: string,
    orderNo: string,
    direction: 1 | -1,
    /*  DEC-POS-018 — either key; Inventory resolves the item from whichever it gets  */
    lines: { productId?: string | null; itemId?: string | null; qty: number }[],
    actorName: string,
  ) {
    try {
      const r = await this.inventory.postSaleForOrder({
        orderId, orderNo, actor: actorName, direction, lines,
      });
      // the same movement that changed stock also moves value in the books:
      // deduct → Goods Out for Delivery, revert → back into Inventory (DEC-FIN-003)
      if (direction === -1) {
        await this.book(orderId, `stock out on ${orderNo}`, () => this.finance.onOrderStockOut(orderId), actorName);
      } else {
        await this.book(orderId, `stock revert on ${orderNo}`, () => this.finance.onOrderStockReverted(orderId), actorName);
      }
      if (r.skipped.length) {
        await this.event(
          orderId, 'system',
          `Inventory mirror: ${r.posted} movement(s); skipped (no item link): ${r.skipped.join(', ')}`,
          actorName,
        );
      }
    } catch (e) {
      await this.event(
        orderId, 'system',
        `⚠ Inventory mirror failed (${direction === -1 ? 'deduct' : 'revert'}) — ledger missing this order: ${e instanceof Error ? e.message : e}`,
        actorName,
      );
    }
  }

  /* ---------------- read ---------------- */

  async list(q: ListOrderQuery) {
    const page = Math.max(1, parseInt(q.page ?? '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(q.pageSize ?? '20', 10) || 20));

    // AUD-2 FIX — this is the ONLINE Sales list. POS counter sales live in the
    // same Order table (DEC-POS-001) but have their own screens; without this
    // filter they leak into online revenue/COD KPIs and double-count.
    /*  ...unless the caller says otherwise. Returns has to find a counter bill
        too (owner, 21 Aug: searching a POS order number found nothing), and it
        asks with includeCounter=true. The online lists never do.  */
    const where: Prisma.OrderWhereInput =
      q.includeCounter === 'true' ? {} : { fulfillmentType: 'DELIVERY' };
    if (q.search) {
      where.OR = [
        { orderNo: { contains: q.search, mode: 'insensitive' } },
        { senderName: { contains: q.search, mode: 'insensitive' } },
        { senderPhone: { contains: q.search } },
      ];
    }
    if (q.salesStatus) where.salesStatus = q.salesStatus as SalesStatus;
    if (q.deliveryStatus) where.deliveryStatus = q.deliveryStatus as DeliveryStatus;
    if (q.channelId) where.channelId = q.channelId;
    if (q.needsAction === 'true') where.salesStatus = SalesStatus.placed;

    const [items, total] = await Promise.all([
      this.prisma.db.order.findMany({
        where,
        include: {
          channel: true,
          customer: { select: { id: true, name: true } },
          _count: { select: { lines: { where: NOT_DELETED } } },
        },
        orderBy: { placedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.db.order.count({ where }),
    ]);
    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findOne(id: string) {
    const o = await this.prisma.db.order.findFirst({ where: { id }, include: FULL_INCLUDE });
    if (!o) throw new NotFoundException('Order not found');
    return { ...o, editable: this.editableFields(o) };
  }

  async timeline(id: string) {
    await this.ensureExists(id);
    return this.audit.timeline(ENTITY, id);
  }

  /* ---------------- create ---------------- */

  /*  DEC-PDP-09 — মালিকের সিদ্ধান্ত ১ আগস্ট ২০২৬:
      "stock 0 হলে order দেওয়া যাবে না। হয় stock out আসবে, বা pre-order আসবে।"

      ⚠️ THE GATE HAS TO BE HERE, not only on the website. A disabled button is
      a courtesy, not a rule — anyone can post to this endpoint, and the admin's
      own order form goes through the same door. The website reads
      `availabilityOf` too, so the two always agree.

      ⚠️ PRE_ORDER PASSES ON PURPOSE. It is a sale the owner has chosen to
      accept knowing the thing is not on the shelf; only STOCK_OUT is refused.
      Payment is not special-cased here either — the product's own
      `advanceRequired` already decides that, which is exactly what the owner
      asked for ("product-এর advance rule যা বলে তাই"), so there is no second
      rule to keep in step.

      ⚠️ STAFF ARE NOT EXEMPT. A phone order for something that does not exist
      is the same broken promise as a web order for it. If the owner wants an
      override for the counter later, it belongs in POS as an explicit,
      audited act — not as a quiet hole in this check. */
  private assertBuyable(
    products: {
      id: string;
      name: string;
      stockMode: StockMode;
      stockQty: number;
      supplierId: string | null;
      soldOutMode: SoldOutMode;
      preorderDate: Date | null;
      /** DEC-PRD-014 — variant থাকলে এদের যোগফলই আসল মজুদ */
      variants?: { stockQty: number }[];
    }[],
    want: Iterable<string>,
  ) {
    const byId = new Map(products.map((p) => [p.id, p]));
    const blocked: string[] = [];
    for (const id of want) {
      const p = byId.get(id);
      if (!p) continue; // missing products are another check's problem
      if (
        !isBuyable(
          availabilityOf({ ...p, variantStock: p.variants?.map((v) => v.stockQty) }),
        )
      )
        blocked.push(p.name);
    }
    if (blocked.length)
      throw new BadRequestException(
        `out of stock — cannot order: ${blocked.join(', ')}`,
      );
  }

  async create(dto: CreateOrderDto) {
    if (!dto.lines?.length) throw new BadRequestException('order needs at least one line');
    const customer = await this.prisma.db.customer.findFirst({ where: { id: dto.customerId } });
    if (!customer) throw new BadRequestException('customerId not found');
    const channel = await this.prisma.db.channel.findFirst({ where: { id: dto.channelId } });
    if (!channel) throw new BadRequestException('channelId not found');

    // line snapshot freeze (productId FK + frozen name/price/type)
    const products = await this.prisma.db.product.findMany({
      where: { id: { in: dto.lines.map((l) => l.productId) } },
      /*  DEC-PRD-014 — variant থাকলে মজুদ তাদের ঘরে থাকে, product-এর
          ঘরে নয়। এটা না আনলে রঙে-রঙে stock রাখা product-এর প্রতিটা order
          "out of stock" বলে ফিরিয়ে দেওয়া হতো।  */
      include: {
        variants: { where: { deletedAt: null, isActive: true }, select: { stockQty: true } },
        /*  ৫ আগস্ট — line-এর ছবি-snapshot। `bg` কলামটা প্রথম দিন থেকে ছিল,
            কিন্তু কেউ কখনো লিখত না — admin আর রসিদে প্রতিটা order-ই তাই
            বেগুনি placeholder দেখাত, ছবি upload করা থাকলেও।  */
        images: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' as const }, take: 1, select: { url: true } },
      },
    });
    const pMap = new Map(products.map((p) => [p.id, p]));
    /* DEC-PDP-09 — before a single paisa is worked out. Refusing after the
       totals are built would still be correct, but it wastes the offer engine
       and reads as an afterthought in the code. */
    this.assertBuyable(products, dto.lines.map((l) => l.productId));
    /*  মালিকের রায়, ৪ আগস্ট ২০২৬: add-on-ও বিক্রির জিনিস — inventory-তে না
        থাকলে বিক্রি হবে না। null stockQty = গোনা হয় না (সীমাহীন), সংখ্যা
        থাকলে সেটাই সীমা। product-এর DEC-PDP-09 gate-এর একই স্পিরিট, একই
        জায়গায় — দরজাতেই, ভেতরে ঢোকার পরে নয়।  */
    await this.assertAddonsInStock(dto.lines);

    const lineData = dto.lines.map((l) => this.buildLine(l, pMap));
    const subtotalPaisa = lineData.reduce((s, l) => s + l.linePaisa, 0);
    const deliveryPaisa = dto.deliveryPaisa ?? 0;

    /* DEC-OFR-003 / OFR-R10 — the offer engine runs server-side on create.
       Engine discount ADDS to any manual staff discount (the form previews the
       engine number, so staff never types it twice). A typed coupon that fails
       validation is a hard 400 — silent non-application would surprise the
       customer at the door. */
    let engineDiscount = 0;
    let engineWaived = 0;
    let quoteApplied: Awaited<ReturnType<OffersService['quote']>>['applied'] = [];
    if (dto.applyOffers !== false) {
      const quote = await this.offers.quote({
        customerId: dto.customerId,
        /*
          ⚠️ THE NET UNIT, NOT THE GROSS ONE — fixed 3 Aug 2026.

          The engine builds its subtotal as `unitPaisa × qty` and then decides
          `minSpendPaisa` and every PERCENT base from it. Handing it the gross
          unit while the order's own subtotal is net means the two disagree,
          and a bundle discount would quietly buy the customer a threshold they
          had not reached and a percentage off money they never spent.

          Harmless until this same day, because `discountPaisa` on a line was
          always 0 and gross WAS net. Storefront bundle picks (DEC-PRD-018) put
          a real number there, so the difference became real with it.

          ⚠️ Rounded, and the rounding is deliberately left in the OFFER BASE
          rather than pushed into the charge. At most `qty − 1` paisa, on a
          number used only to size a discount — never on what anybody pays,
          which stays `linePaisa` exactly.
        */
        lines: dto.lines.map((l, i) => ({
          productId: l.productId,
          qty: l.qty,
          unitPaisa: Math.round(lineData[i].linePaisa / Math.max(1, l.qty)),
        })),
        deliveryPaisa,
        paymentMethod: dto.paymentMethod ?? PaymentMethod.online,
        couponCode: dto.couponCode,
      });
      if (dto.couponCode?.trim() && quote.couponError)
        throw new BadRequestException(quote.couponError);
      engineDiscount = quote.discountPaisa;
      engineWaived = quote.deliveryWaivedPaisa;
      quoteApplied = quote.applied;
    }

    const discountPaisa = (dto.discountPaisa ?? 0) + engineDiscount;
    const deliveryWaivedPaisa = (dto.deliveryWaivedPaisa ?? 0) + engineWaived;
    const totalPaisa = subtotalPaisa - discountPaisa + deliveryPaisa - deliveryWaivedPaisa;
    if (totalPaisa < 0) throw new BadRequestException('total cannot be negative');

    const method = dto.paymentMethod ?? PaymentMethod.online;
    // COD নিয়ম (locked §4): self only · no crafted · no advance-required line; gift-এ কখনো COD নয়
    if (method === PaymentMethod.cod) this.assertCodAllowed(dto, lineData, pMap);

    const orderNo = await this.nextOrderNo();
    const actorName = dto.actorName ?? 'Admin';

    /* REV-OFR-1 — the discount is already baked into totalPaisa above, so the
       redemption rows MUST be written in the SAME transaction as the order.
       Fail-soft (writing after create) would let the discount stand while the
       limit/first-order guard and analytics silently lose the record. */
    const order = await this.prisma.db.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          orderNo,
          channel: { connect: { id: dto.channelId } },
          customer: { connect: { id: dto.customerId } },
          /*  টাইপ করা পরিচয়ই রসিদের snapshot; CRM-এর ঘর fallback মাত্র।
              দেখুন CreateOrderDto.senderName-এর নোট (মালিকের রায়, ৩ আগস্ট)।  */
          senderName: dto.senderName?.trim() || customer.name,
          senderPhone: dto.senderPhone?.trim() || customer.phone,
          senderEmail: dto.senderEmail?.trim() || customer.email,
          isGift: dto.isGift ?? false,
          recipientName: dto.recipientName,
          recipientPhone: dto.recipientPhone,
          recipientCustomerId: dto.recipientCustomerId,
          giftMessage: dto.giftMessage,
          anonymousGift: dto.anonymousGift ?? false,
          photoUpdates: dto.photoUpdates ?? true,
          salesStatus: SalesStatus.placed,
          deliveryStatus: DeliveryStatus.unassigned,
          zone: dto.zone,
          address: dto.address,
          deliveryNotes: dto.deliveryNotes,
          methodLabel: dto.methodLabel,
          date: dto.date,
          slotLabel: dto.slotLabel,
          etaLabel: dto.etaLabel,
          /* DEC-INT-003(a) — freeze the promise as a real instant, once, here.
             Open since 29 Jul: `promisedBy` was read in six places and written in
             none, so `/delivery/performance` has been honestly reporting "no delivery
             has a promised time yet" instead of a number. See `promise.ts` for why the
             end of the window, and why Bangladesh time explicitly. */
          promisedBy: resolvePromisedBy(dto.date, dto.slotLabel),
          // DEC-DLV-002 — optional FKs; snapshots above remain the receipt
          ...(dto.deliveryMethodId ? { deliveryMethod: { connect: { id: dto.deliveryMethodId } } } : {}),
          ...(dto.deliverySlotId ? { deliverySlot: { connect: { id: dto.deliverySlotId } } } : {}),
          paymentMethod: method,
          paymentStatus: PaymentStatus.unpaid,
          paidPaisa: 0,
          duePaisa: totalPaisa,
          refundPaisa: 0,
          subtotalPaisa,
          couponCode: dto.couponCode,
          discountPaisa,
          deliveryPaisa,
          deliveryWaivedPaisa,
          adjustmentPaisa: 0,
          totalPaisa,
          internalNote: dto.internalNote,
          /*  MKT-D02 — কাঁচা attribution, storefront থেকে। খালি এলে খালিই
              থাকে; Marketing পরে এর উপর রায় লেখে (OrderAttribution)।  */
          utmSource: dto.utmSource?.trim() || null,
          utmMedium: dto.utmMedium?.trim() || null,
          utmCampaign: dto.utmCampaign?.trim() || null,
          refCode: dto.refCode?.trim() || null,
          lines: { create: lineData },
        },
        include: FULL_INCLUDE,
      });
      // atomic with the order (REV-OFR-1)
      for (const a of quoteApplied) {
        await tx.offerRedemption.create({
          data: {
            offerId: a.offerId,
            orderId: created.id,
            customerId: dto.customerId,
            code: a.code,
            discountPaisa: a.discountPaisa,
            freeDelivery: a.freeDelivery,
          },
        });
      }
      return created;
    });

    await this.audit.record({ entityType: ENTITY, entityId: order.id, action: 'CREATE', actorName });
    await this.event(order.id, 'sales', `Order ${orderNo} placed via ${channel.name}`, actorName);

    if (quoteApplied.length) {
      await this.event(
        order.id, 'payment',
        `Offers applied: ${quoteApplied.map((a) => `${a.name}${a.code ? ` (${a.code})` : ''} −${a.discountPaisa}p${a.freeDelivery ? ' +free delivery' : ''}`).join(' · ')}`,
        actorName,
      );
    }
    return { ...order, editable: this.editableFields(order) };
  }

  /* ---------------- status transitions ---------------- */

  async confirm(id: string, actorName = 'Admin') {
    const o = await this.get(id);
    if (o.salesStatus !== SalesStatus.placed)
      throw new BadRequestException(`cannot confirm from salesStatus=${o.salesStatus}`);
    const updated = await this.prisma.db.order.update({
      where: { id },
      data: { salesStatus: SalesStatus.confirmed },
      include: FULL_INCLUDE,
    });
    await this.event(id, 'sales', `Order confirmed`, actorName);

    /*
      ⚠️ THE WORKSHOP'S DAY IS TAKEN HERE, AT CONFIRM — owner's ruling,
      1 Aug 2026, and he chose this moment deliberately over order-placed.
      An unconfirmed order is a request; holding hours open for one that is
      never answered starves the orders that are.

      Fail-soft, like every Finance call on this path: capacity is a planning
      aid, and a shop must never be unable to confirm an order because the
      board could not be written to. The order is already confirmed above; a
      failure here leaves the day looking emptier than it is, which is the
      recoverable direction.
    */
    try {
      await this.capacity.bookForOrder(id);
    } catch {
      /*  intentionally swallowed — see above  */
    }
    return this.shape(updated);
  }

  // DEC-MOD-003: stock −1 fires at Delivery "preparing", NOT at confirm।
  async startPreparing(id: string, actorName = 'Admin') {
    const o = await this.get(id);
    if (o.salesStatus !== SalesStatus.confirmed)
      throw new BadRequestException('order must be confirmed before preparing');
    if (o.deliveryStatus !== DeliveryStatus.unassigned)
      throw new BadRequestException(`cannot start preparing from deliveryStatus=${o.deliveryStatus}`);

    const lines = await this.prisma.db.orderLine.findMany({ where: { orderId: id, deletedAt: null } });
    /*  DEC-POS-018 — a counter line carries an Item, not a Product. These website
        paths only ever see product lines; the filter keeps the types honest.  */
    const products = await this.prisma.db.product.findMany({
      where: { id: { in: lines.map((l) => l.productId).filter((v): v is string => !!v) } },
    });
    const pMap = new Map(products.map((p) => [p.id, p]));

    /*
      DEC-PRD-014 — WHICH SHELF THE STOCK COMES OFF, fixed 3 Aug 2026.

      A product with variants keeps its truth in the variants' own `stockQty`;
      the product row is just the sum every screen displays. This method used
      to decrement the PRODUCT row regardless — caught live: a Red Roses order
      went all the way to delivered and the shop still showed 20 in stock,
      because the variant's 20 was never touched and the displays sum variants.
      Sold for ever, deducted never.
    */
    const variantIds = lines.map((l) => l.variantId).filter((v): v is string => !!v);
    const variants = variantIds.length
      ? await this.prisma.db.productVariant.findMany({ where: { id: { in: variantIds } } })
      : [];
    const vMap = new Map(variants.map((v) => [v.id, v]));

    /* REV-M4: never let stock go negative silently — say what is short instead.
       A variant line is judged against ITS shelf, not the product's sum. */
    const short: string[] = [];
    for (const l of lines) {
      const p = l.productId ? pMap.get(l.productId) : undefined;
      if (!p || p.stockMode !== 'MANUAL') continue;
      const v = l.variantId ? vMap.get(l.variantId) : null;
      if (v) {
        if (v.stockQty < l.qty)
          short.push(`${l.name}${l.variantLabel ? ` (${l.variantLabel})` : ''} — need ${l.qty}, have ${v.stockQty}`);
      } else if (p.stockQty < l.qty) {
        short.push(`${p.name} (need ${l.qty}, have ${p.stockQty})`);
      }
    }
    if (short.length) throw new BadRequestException(`not enough stock: ${short.join('; ')}`);

    /*
      ═══ ADD-ON-ও এখানেই আটকায় — মালিকের রায়, ৪ আগস্ট ২০২৬ ═══
      *"process a dibo tkhon... inventory check kre amra ata sell kre dibo
      ba process a jabe. na thakle to ar sell krte parbo na."*

      আগের সংস্করণ ঘাটতিতে চুপচাপ ০ পর্যন্ত কেটে এগিয়ে যেত (fail-soft) —
      পরীক্ষায় ধরা: stock ০ রেখেও prepare ২০১ দিল। সেটা নিয়মের উল্টো।
      Greeting card না থাকলে order-টা PREPARE-এ ঢুকবেই না; admin আগে
      add-on-টা restock করবে (বা line থেকে বাদ দেবে), তারপর process।
      বার্তাটা দরজার gate-এর সাথে হুবহু এক ভাষায়, যাতে চেনা যায়।
    */
    await this.assertAddonsInStock(lines);

    // REV-C2: stock deduction + status move in one transaction, so a failure
    // can never leave stock committed against an order that never started.
    const updated = await this.prisma.db.$transaction(async (tx) => {
      for (const l of lines) {
        const p = l.productId ? pMap.get(l.productId) : undefined;
        if (!p || p.stockMode !== 'MANUAL') continue;
        // MANUAL stock: variant line → variant-এর ঘর; নইলে product-এর ঘর (DEC-MOD-003 / DEC-PRD-014)
        if (l.variantId && vMap.has(l.variantId)) {
          await tx.productVariant.update({ where: { id: l.variantId }, data: { stockQty: { decrement: l.qty } } });
        } else {
          await tx.product.update({ where: { id: p.id }, data: { stockQty: { decrement: l.qty } } });
        }
      }
      /*  add-on-ও একই মুহূর্তে কাটে (DEC-MOD-003-এর একই ঘড়ি) — শুধু গোনা
          add-on (stockQty ≠ null)। ঋণাত্মকে নামতে দেওয়া হয় না; দরজার gate
          পেরিয়ে আসা order-এ ঘাটতি মানে মাঝখানে কেউ বেচে দিয়েছে — তখনো
          কাটা হয় ০ পর্যন্তই, আর ঘটনাটা timeline-এ ওঠে (নিচে)।  */
      const addonNeed = this.addonDemand(lines);
      for (const [addonId, qty] of addonNeed) {
        const a = await tx.addOn.findFirst({ where: { id: addonId }, select: { stockQty: true } });
        if (a?.stockQty !== null && a !== null) {
          await tx.addOn.update({
            where: { id: addonId },
            data: { stockQty: Math.max(0, a.stockQty - qty) },
          });
        }
      }
      return tx.order.update({
        where: { id },
        data: { deliveryStatus: DeliveryStatus.preparing },
        include: FULL_INCLUDE,
      });
    });
    await this.event(id, 'delivery', `Preparing — stock −qty (DEC-MOD-003)`, actorName);
    // DEC-INV-015 stage 1: parallel ledger copy (fail-soft — see mirrorToInventory)
    await this.mirrorToInventory(
      id, o.orderNo, -1,
      lines.map((l) => ({ productId: l.productId, itemId: (l as { itemId?: string | null }).itemId ?? null, qty: l.qty })),
      actorName,
    );
    return this.shape(updated);
  }

  async outForDelivery(id: string, actorName = 'Admin') {
    const o = await this.get(id);
    // REV-M1: a failed delivery is a retry, not a dead end — the parcel is
    // already made and stock is already committed, so it can go out again.
    if (o.deliveryStatus !== DeliveryStatus.preparing && o.deliveryStatus !== DeliveryStatus.failed)
      throw new BadRequestException('order must be preparing (or a failed delivery) before out-for-delivery');
    if (o.deliveryStatus === DeliveryStatus.failed) await this.event(id, 'delivery', `Retrying delivery`, actorName);
    const updated = await this.prisma.db.order.update({
      where: { id },
      data: { deliveryStatus: DeliveryStatus.out_for_delivery },
      include: FULL_INCLUDE,
    });
    await this.event(id, 'delivery', `Out for delivery`, actorName);
    // Queued, so the order page can show whether the customer was told.
    void this.orderMessages
      .queue(id, OrderMessageKind.ORDER_OUT_FOR_DELIVERY)
      .then(() => this.orderMessages.sendDue(5))
      .catch(() => undefined);
    return this.shape(updated);
  }

  // delivered → salesCount +1, Customer LTV/ordersCount +1 (locked §4)। cancel-before-delivered = গোনা হয় না।
  async delivered(id: string, actorName = 'Admin') {
    const o = await this.get(id);
    if (o.deliveryStatus !== DeliveryStatus.out_for_delivery)
      throw new BadRequestException('order must be out-for-delivery before delivered');

    /* REV-C5: an order may not close with money unaccounted for.
       · COD — handing the parcel over IS the moment cash is taken, so the
         outstanding amount is recorded as collected here.
       · online — nothing is auto-collected; record the payment first, otherwise
         a completed order would inflate revenue and lifetime value. */
    const outstanding = Math.max(0, o.totalPaisa - (o.paidPaisa - o.refundPaisa));
    if (outstanding > 0 && o.paymentMethod !== PaymentMethod.cod) {
      throw new BadRequestException(
        `cannot mark delivered — ${outstanding} paisa is still unpaid. Record the payment first.`,
      );
    }

    const lines = await this.prisma.db.orderLine.findMany({ where: { orderId: id, deletedAt: null } });
    const cust = await this.prisma.db.customer.findFirst({ where: { id: o.customerId } });

    // REV-C2: one transaction — stock counters, customer mirror and the status
    // move together, so a mid-way failure can never double-count anything.
    const updated = await this.prisma.db.$transaction(async (tx) => {
      if (outstanding > 0) {
        await tx.paymentTransaction.create({
          data: { orderId: id, kind: 'COD_COLLECTED', method: o.paymentMethod, amountPaisa: outstanding, note: 'Collected on delivery', actorName },
        });
      }
      // units, not orders — stock moves by qty, so the "sold" counter must too.
      for (const l of lines) {
        if (!l.productId) continue; // DEC-POS-018 — an item line has no product counter
        await tx.product.update({ where: { id: l.productId }, data: { salesCount: { increment: l.qty } } });
      }
      // Customer LTV / ordersCount @delivered (Sales writes the Sales-owned mirror)
      if (cust) {
        await tx.customer.update({
          where: { id: cust.id },
          data: {
            ordersCount: { increment: 1 },
            ltvPaisa: { increment: BigInt(o.totalPaisa) },
            lastOrderAt: new Date(),
            firstOrderAt: cust.firstOrderAt ?? new Date(),
          },
        });
      }
      /* ORD-REV-3 (30 Jul) — increment, and read the result back.
         This wrote `o.paidPaisa + outstanding` as an ABSOLUTE figure from a row read
         before the transaction opened. It is a one-shot transition, so it looked safe —
         but an advance recorded on the phone at the moment the rider marks delivered
         would be silently overwritten. And it got MORE likely, not less, the moment
         ORD-REV-2 made `recordPayment` concurrent-safe: that call now lands cleanly and
         then this one flattens it. Two half-fixes can be worse than one. */
      const bumped = outstanding > 0
        ? await tx.order.update({
            where: { id },
            data: { paidPaisa: { increment: outstanding } },
            select: { totalPaisa: true, paidPaisa: true, refundPaisa: true, paymentMethod: true },
          })
        : await tx.order.findUniqueOrThrow({
            where: { id },
            select: { totalPaisa: true, paidPaisa: true, refundPaisa: true, paymentMethod: true },
          });
      return tx.order.update({
        where: { id },
        data: {
          deliveryStatus: DeliveryStatus.delivered,
          salesStatus: SalesStatus.completed,
          duePaisa: Math.max(0, bumped.totalPaisa - bumped.paidPaisa),
          paymentStatus: this.derivePaymentStatus(bumped.paymentMethod, bumped.totalPaisa, bumped.paidPaisa, bumped.refundPaisa, outstanding > 0 ? 'COD_COLLECTED' : ''),
        },
        include: FULL_INCLUDE,
      });
    });

    // revenue + COGS + advance release. ORD-REV-1 — awaited and flagged: this is the
    // entry that turns a delivered parcel into money, and it was fire-and-forget.
    await this.book(id, `delivery of ${o.orderNo}`, () => this.finance.onOrderDelivered(id), actorName);
    if (outstanding > 0) {
      // the COD row was written inside the transaction above; book it now so the
      // cash shows as "with the rider/courier" until it is handed over
      const cod = await this.prisma.db.paymentTransaction.findFirst({
        where: { orderId: id, kind: 'COD_COLLECTED' },
        orderBy: { createdAt: 'desc' },
      });
      if (cod) {
        await this.book(id, `COD on ${o.orderNo}`, () => this.finance.onPaymentRecorded(cod.id), actorName);
      }
    }
    await this.event(id, 'delivery', `Delivered`, actorName);
    if (outstanding > 0) await this.event(id, 'payment', `COD collected — ${outstanding} paisa`, actorName);
    await this.event(id, 'system', `Sales completed — salesCount +qty, Customer LTV +${o.totalPaisa} paisa`, actorName);
    /*  DEC-PRD-050 — a completed sale is the only thing that can change who is
        a best seller, so the ranking is redone here rather than on a nightly
        job that could quietly stop running. Fire-and-forget and swallowed
        inside: a badge is decoration, an order is a contract.  */
    void this.merch.recomputeQuietly();
    void this.orderMessages
      .queue(id, OrderMessageKind.ORDER_DELIVERED)
      // DEC-WEB-008 — the review invite queues now, due 24h from now; the
      // sweeper sends it when its time comes. sendDue(5) only picks up what
      // is already due, so the invite is safe from it.
      .then(() => this.orderMessages.queueReviewRequest(id))
      .then(() => this.orderMessages.sendDue(5))
      .catch(() => undefined);
    return this.shape(updated);
  }

  async failDelivery(id: string, actorName = 'Admin') {
    const o = await this.get(id);
    if (o.deliveryStatus !== DeliveryStatus.preparing && o.deliveryStatus !== DeliveryStatus.out_for_delivery)
      throw new BadRequestException('only a preparing/out-for-delivery order can fail');
    const updated = await this.prisma.db.order.update({
      where: { id },
      data: { deliveryStatus: DeliveryStatus.failed },
      include: FULL_INCLUDE,
    });
    await this.event(id, 'delivery', `Delivery failed`, actorName);
    return this.shape(updated);
  }

  /**
   * ── DEC-SAL-013 · what a cancelled order gives back (owner, 25 Aug 2026) ──
   *
   * The refund is a share of the MONEY ACTUALLY RECEIVED, never of the order
   * total. Asked directly, the owner: *"the customer gets 50% of the amount
   * they paid — not 50% of the product price."* And on a COD order where
   * nothing had been paid: nothing back, nothing owed. The shop loses the
   * flowers and that is the end of it.
   *
   *   unassigned        nothing made yet          → beforeStartPct (100%)
   *   preparing         made, rider not out       → afterStartPct  (50%)
   *   out_for_delivery  the rider has left        → 0
   *   delivered         refused above — that is a Return, not a cancel
   *
   * ⚠️ WHAT THIS REPLACED, AND WHY IT WAS A LEAK. The old rule refunded each
   * line in full unless the product carried an advance, and `advanceForfeit`
   * returns 0 for a product with none. Not one product in this shop has one.
   * So a made-to-order bouquet cancelled after the workshop had cut the stems
   * refunded 100% — the shop lost the flowers AND the money, every time.
   *
   * ⚠️ THE PER-LINE FIGURES ARE NOW A SHARE-OUT, NOT THE SOURCE. The order
   * decides one number and the lines carry their proportion of it, so the
   * receipt still adds up. Do not go back to deciding it line by line: the
   * ruling is about the ORDER's progress, and lines do not have progress.
   */
  async cancel(id: string, dto: CancelOrderDto) {
    const o = await this.get(id);
    if (o.salesStatus === SalesStatus.completed || o.salesStatus === SalesStatus.cancelled)
      throw new BadRequestException(`cannot cancel a ${o.salesStatus} order`);
    const actorName = dto.actorName ?? 'Admin';
    const preparingStarted = o.deliveryStatus !== DeliveryStatus.unassigned;

    /*  Money in hand: what was paid, less anything already given back.  */
    const collected = Math.max(0, o.paidPaisa - o.refundPaisa);

    const rates = await this.salesRates();
    const refundPct =
      o.deliveryStatus === DeliveryStatus.unassigned
        ? rates.beforeStartPct
        : o.deliveryStatus === DeliveryStatus.preparing
          ? rates.afterStartPct
          : /*  out_for_delivery, failed, stock_reverted — the rider has been
                out with it. Not a setting: "once it is on the road it is
                gone" is the ruling itself.  */
            0;
    const entitlement = Math.round((collected * refundPct) / 100);

    const lines = await this.prisma.db.orderLine.findMany({ where: { orderId: id, deletedAt: null } });
    /*  DEC-POS-018 — a counter line carries an Item, not a Product. These website
        paths only ever see product lines; the filter keeps the types honest.  */
    const products = await this.prisma.db.product.findMany({
      where: { id: { in: lines.map((l) => l.productId).filter((v): v is string => !!v) } },
    });
    const pMap = new Map(products.map((p) => [p.id, p]));

    /*  DEC-SAL-013 — the ORDER decided the number; the lines carry their share
        of it so the receipt still adds up. Shared out by each line's value,
        with the rounding remainder given to the last line rather than lost.  */
    const orderNet = lines.reduce((s, l) => s + (l.linePaisa - l.discountPaisa), 0);
    const stageNote =
      refundPct >= 100 ? 'Cancelled before the workshop started'
        : refundPct > 0 ? `Cancelled after it was made — ${refundPct}% of what was paid`
          : 'Cancelled after the rider left — nothing refundable';

    // REV-C2: per-line refund figures + stock revert run in one transaction.
    let totalRefund = 0;
    await this.prisma.db.$transaction(async (tx) => {
      for (const [i, l] of lines.entries()) {
        const p = l.productId ? pMap.get(l.productId) : undefined;
        const net = l.linePaisa - l.discountPaisa;
        const last = i === lines.length - 1;
        const refund = last
          ? Math.max(0, entitlement - totalRefund)
          : orderNet > 0
            ? Math.round((entitlement * net) / orderNet)
            : 0;
        totalRefund += refund;
        await tx.orderLine.update({ where: { id: l.id }, data: { refundPaisa: refund, refundNote: stageNote } });

        /*  ── DEC-SAL-012 · ONCE THE WORKSHOP HAS TOUCHED IT, IT DOES NOT GO
               BACK ON THE SHELF (owner, 25 August 2026) ────────────────────

            The regression suite flagged that a cancelled CRAFTED line never
            returns its stock, and asked whether that was a decision or an
            accident. It is a decision. The owner:

              *"যখন কাজে হাত দিবে তখন আর ফিরতের অপশন নেই"* — once work has
              started there is no putting it back.

            Stock only ever comes off at PREPARING, which IS the moment the
            workshop starts. So:

              · cancelled before preparing — nothing was deducted, nothing to
                return. The shelf never moved.
              · cancelled after preparing, READYMADE — it was picked off a
                shelf, not made. The flowers are untouched, so it goes back.
              · cancelled after preparing, CRAFTED — the stems are cut. The
                number stays down, because the flowers really are gone.

            ⚠️ So the `READYMADE` test below is the rule, not an oversight.
            Do not "fix" it into restoring everything.

            ⚠️ WHERE IT GOES BACK also matters: the same box it came out of.
            A variant line returns to the variant (DEC-PRD-014) — restoring to
            the product instead invented phantom stock and left the variant
            short for ever.

            ⚠️ THE MONEY HALF OF THIS RULE IS NOT HERE YET. The owner's ladder
            is 50% back when cancelled before delivery, nothing once it has
            been handed over. `advanceForfeit` above still answers a different
            question (how much advance is kept), and with no product carrying
            an advance it currently refunds everything. Tracked in
            RADIAN_PENDING — do not read this comment as if the money side
            were settled.  */
        if (preparingStarted && l.productType === ProductType.READYMADE && p && p.stockMode === 'MANUAL') {
          if (l.variantId) {
            await tx.productVariant.update({ where: { id: l.variantId }, data: { stockQty: { increment: l.qty } } });
          } else {
            await tx.product.update({ where: { id: p.id }, data: { stockQty: { increment: l.qty } } });
          }
        }
        /*  add-on-ও ফেরে — যে ঘর থেকে কাটা, সেই ঘরেই (গোনা add-on হলে)।  */
        if (preparingStarted) {
          for (const addonId of l.addonIds ?? []) {
            const a = await tx.addOn.findFirst({ where: { id: addonId }, select: { stockQty: true } });
            if (a && a.stockQty !== null) {
              await tx.addOn.update({ where: { id: addonId }, data: { stockQty: { increment: l.qty } } });
            }
          }
        }
      }
    });

    /*  REV-C1 — never refund money that was never collected. Since DEC-SAL-013
        the entitlement is already a share OF `collected`, so this can no
        longer exceed it; the cap stays as the belt to that braces. A COD order
        cancelled before anyone paid refunds 0, which is the owner's own
        answer to that exact case.  */
    const payout = Math.min(entitlement, collected);

    if (payout > 0) {
      const refundTxn = await this.prisma.db.paymentTransaction.create({
        data: { orderId: id, kind: 'REFUND', method: o.paymentMethod, amountPaisa: payout, note: 'Cancellation per-line refund', actorName },
      });
      await this.book(id, `cancellation refund on ${o.orderNo}`, () => this.finance.onPaymentRecorded(refundTxn.id), actorName);
    }
    if (entitlement > payout) {
      await this.event(
        id, 'payment',
        `No money to refund — ${entitlement} paisa was owed back but only ${collected} paisa had been collected`,
        actorName,
      );
    }
    const totalRefundApplied = payout;
    const newRefund = o.refundPaisa + totalRefundApplied;
    const payStatus: PaymentStatus =
      o.paidPaisa > 0 && newRefund >= o.paidPaisa ? PaymentStatus.refunded
      : newRefund > 0 ? PaymentStatus.partially_refunded
      : o.paymentStatus;

    const updated = await this.prisma.db.order.update({
      where: { id },
      data: {
        salesStatus: SalesStatus.cancelled,
        deliveryStatus: preparingStarted ? DeliveryStatus.stock_reverted : o.deliveryStatus,
        refundPaisa: newRefund,
        duePaisa: 0, // a cancelled order collects nothing more
        paymentStatus: payStatus,
      },
      include: FULL_INCLUDE,
    });
    // DEC-OFR-008 — release redemption slots (per-customer/total limits give back)
    try {
      await this.offers.releaseForOrder(id);
    } catch { /* fail-soft — never block a cancel */ }
    /*  Give the workshop's hours back. A cancelled order that keeps them is a
        day that looks full and is not — the expensive kind of wrong, because
        nobody goes looking for capacity they believe is already gone.  */
    try {
      await this.capacity.releaseForOrder(id);
    } catch { /* fail-soft — never block a cancel */ }
    await this.event(id, 'sales', `Cancelled${dto.reason ? ' — ' + dto.reason : ''}`, actorName, `Refunded ${totalRefundApplied} paisa of ${entitlement} paisa owed`);
    if (preparingStarted) {
      await this.event(id, 'delivery', `Stock reverted (readymade lines)`, actorName);
      // DEC-INV-015 stage 1 mirror — revert ONLY readymade lines: a crafted
      // bouquet's components are genuinely consumed and stay consumed.
      await this.mirrorToInventory(
        id, o.orderNo, 1,
        lines
          .filter((l) => l.productType === ProductType.READYMADE)
          .map((l) => ({ productId: l.productId, qty: l.qty })),
        actorName,
      );
    }
    return this.shape(updated);
  }

  /* ---------------- payment / photo ---------------- */

  async addPayment(id: string, dto: AddPaymentDto) {
    const o = await this.get(id);
    if (!dto.amountPaisa || dto.amountPaisa <= 0) throw new BadRequestException('amountPaisa must be > 0');
    const actorName = dto.actorName ?? 'Admin';
    const method = dto.method ?? o.paymentMethod;

    /* REV-M8: a double click must not create money.
       · collection can never exceed what is still outstanding
       · a refund can never exceed what is actually in hand */
    const collected = o.paidPaisa - o.refundPaisa;
    if (dto.kind === 'REFUND') {
      if (dto.amountPaisa > collected)
        throw new BadRequestException(`cannot refund ${dto.amountPaisa} paisa — only ${Math.max(0, collected)} paisa was collected`);
    } else {
      const outstanding = Math.max(0, o.totalPaisa - collected);
      if (outstanding === 0) throw new BadRequestException('nothing is outstanding on this order');
      if (dto.amountPaisa > outstanding)
        throw new BadRequestException(`cannot collect ${dto.amountPaisa} paisa — only ${outstanding} paisa is outstanding`);
    }

    /* ORD-REV-2 (30 Jul) — a LOST UPDATE, and the identical twin of POS-REV-3.
       The transaction row was written, then `paidPaisa` was recomputed from `o`, which
       was read before it, and written back as an ABSOLUTE figure. Two payments landing
       together on one order — an advance on the phone while the rider marks COD, which
       is a normal Friday — both read the same `o.paidPaisa`, both created a
       PaymentTransaction, and both wrote their own total. Result: two rows in the
       payment ledger, ONE of them on the order. The customer stays shown as owing money
       he has paid, and there is no way afterwards to tell which figure is the true one.

       `increment` is the only safe verb, and it belongs in the same transaction as the
       row it is counting. The status is then derived from what the database actually
       holds, not from a figure read a moment ago. */
    const { txn, updated } = await this.prisma.db.$transaction(async (tx) => {
      const created = await tx.paymentTransaction.create({
        data: { orderId: id, kind: dto.kind, method, amountPaisa: dto.amountPaisa, reference: dto.reference, note: dto.note, actorName },
      });

      const bumped = await tx.order.update({
        where: { id },
        data: dto.kind === 'REFUND'
          ? { refundPaisa: { increment: dto.amountPaisa } }
          : { paidPaisa: { increment: dto.amountPaisa } },
        select: { totalPaisa: true, paidPaisa: true, refundPaisa: true, paymentMethod: true },
      });

      const due = Math.max(0, bumped.totalPaisa - bumped.paidPaisa);
      const status = this.derivePaymentStatus(
        bumped.paymentMethod, bumped.totalPaisa, bumped.paidPaisa, bumped.refundPaisa, dto.kind,
      );
      const settled = await tx.order.update({
        where: { id },
        data: { duePaisa: due, paymentStatus: status },
        include: FULL_INCLUDE,
      });
      return { txn: created, updated: settled };
    });

    await this.book(id, `${dto.kind} on ${o.orderNo}`, () => this.finance.onPaymentRecorded(txn.id), actorName);
    await this.event(id, 'payment', `${dto.kind} ${dto.amountPaisa} paisa via ${method}`, actorName);
    return this.shape(updated);
  }

  /* courier hand-off — Delivery executes the parcel; Sales records the reference
     so the order carries its consignment id and tracking link. */
  async assignCourier(id: string, dto: AssignCourierDto) {
    const o = await this.get(id);
    if (o.salesStatus === SalesStatus.cancelled) throw new BadRequestException('order is cancelled');
    if (!dto.courierName?.trim()) throw new BadRequestException('courierName is required');
    const actorName = dto.actorName ?? 'Admin';

    const updated = await this.prisma.db.order.update({
      where: { id },
      data: {
        courierName: dto.courierName.trim(),
        courierConsignment: dto.courierConsignment?.trim() || null,
        courierTrackingUrl: dto.courierTrackingUrl?.trim() || null,
        courierAssignedAt: new Date(),
      },
      include: FULL_INCLUDE,
    });
    await this.audit.record({ entityType: ENTITY, entityId: id, action: 'UPDATE', actorName, changes: { courier: dto as unknown as Record<string, unknown> } });
    await this.event(id, 'delivery', `Courier assigned — ${dto.courierName}${dto.courierConsignment ? ` (${dto.courierConsignment})` : ''}`, actorName);
    return this.shape(updated);
  }

  // proof photo — Delivery-owned; Sales শুধু record/দেখায়
  async addPhoto(id: string, dto: AddPhotoDto) {
    await this.ensureExists(id);
    const actorName = dto.actorName ?? 'Delivery';
    const photo = await this.prisma.db.orderPhoto.create({
      data: { orderId: id, kind: dto.kind, url: dto.url, bg: dto.bg, caption: dto.caption, capturedBy: dto.capturedBy ?? actorName },
    });
    await this.event(id, 'delivery', `${dto.kind} photo added`, actorName);
    return photo;
  }

  /* ---------------- edit (guardrails) ---------------- */

  async edit(id: string, dto: EditOrderDto) {
    const o = await this.get(id);
    const gate = this.editableFields(o);
    const actorName = dto.actorName ?? 'Admin';

    const recipientTouched = dto.recipientName !== undefined || dto.recipientPhone !== undefined || dto.giftMessage !== undefined;
    const deliveryTouched = dto.address !== undefined || dto.deliveryNotes !== undefined || dto.methodLabel !== undefined || dto.date !== undefined || dto.slotLabel !== undefined;
    const existingItemsTouched = !!(dto.removeLineIds?.length || dto.lineQty?.length);
    const moneyTouched = dto.adjustmentPaisa !== undefined || dto.deliveryPaisa !== undefined || !!dto.lineDiscounts;

    if (recipientTouched && !gate.recipient) throw new BadRequestException('recipient locked at this stage');
    if (deliveryTouched && !gate.delivery) throw new BadRequestException('delivery details locked at this stage');
    // changing/removing an existing line locks once stock is committed at Preparing (DEC-MOD-003)
    if (existingItemsTouched && !gate.items) throw new BadRequestException('existing items are locked at this stage — stock is already committed');
    // adding is softer: allowed until the rider leaves
    if (dto.addLines?.length && !gate.addItems) throw new BadRequestException('cannot add items once the order is out for delivery');
    if (!gate.notes && (dto.internalNote !== undefined || moneyTouched))
      throw new BadRequestException('order is closed — no edits allowed');

    /* ---- item composition (only while gate.items is open) ---- */
    if (dto.removeLineIds?.length) {
      const live = await this.prisma.db.orderLine.findMany({ where: { orderId: id, deletedAt: null }, select: { id: true } });
      const remaining = live.filter((l) => !dto.removeLineIds!.includes(l.id)).length;
      if (remaining < 1 && !dto.addLines?.length)
        throw new BadRequestException('an order must keep at least one item — cancel it instead');
      await this.prisma.db.orderLine.updateMany({
        where: { id: { in: dto.removeLineIds }, orderId: id },
        data: { deletedAt: new Date() },
      });
      await this.event(id, 'sales', `${dto.removeLineIds.length} item(s) removed`, actorName);
    }

    if (dto.lineQty?.length) {
      for (const q of dto.lineQty) {
        if (!q.qty || q.qty < 1) throw new BadRequestException('line qty must be >= 1');
        const line = await this.prisma.db.orderLine.findFirst({ where: { id: q.lineId, orderId: id, deletedAt: null } });
        if (!line) throw new BadRequestException(`line ${q.lineId} not found`);
        const linePaisa = line.unitPaisa * q.qty;
        await this.prisma.db.orderLine.update({
          where: { id: q.lineId },
          data: { qty: q.qty, linePaisa, discountPaisa: Math.min(line.discountPaisa, linePaisa) },
        });
      }
      await this.event(id, 'sales', `Quantity updated on ${dto.lineQty.length} item(s)`, actorName);
    }

    if (dto.addLines?.length) {
      const products = await this.prisma.db.product.findMany({
        where: { id: { in: dto.addLines.map((l) => l.productId) } },
        /*  DEC-PRD-014 — উপরের create-এর মতোই, একই কারণে। ছবি-snapshot-ও তাই। */
        include: {
          variants: { where: { deletedAt: null, isActive: true }, select: { stockQty: true } },
          images: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' as const }, take: 1, select: { url: true } },
        },
      });
      const pMap = new Map(products.map((p) => [p.id, p]));
      /* DEC-PDP-09 — the second door into an order. Gating `create` alone
         would mean a sold-out item cannot start an order but can be added to
         one a minute later. */
      this.assertBuyable(products, dto.addLines.map((l) => l.productId));
      for (const l of dto.addLines) {
        const data = this.buildLine(l, pMap);
        await this.prisma.db.orderLine.create({ data: { ...data, order: { connect: { id } } } });
      }
      await this.event(id, 'sales', `${dto.addLines.length} item(s) added`, actorName);

      /* AUD-1 FIX — if stock is ALREADY committed (order past Preparing), a newly
         added line must deduct its stock NOW. Otherwise cancel() would revert a
         line that was never deducted → phantom stock created out of nothing.
         Matches startPreparing: every MANUAL product deducts (crafted included);
         cancel reverts only the readymade ones. */
      const committed = o.deliveryStatus === DeliveryStatus.preparing || o.deliveryStatus === DeliveryStatus.out_for_delivery;
      if (committed) {
        await this.prisma.db.$transaction(async (tx) => {
          for (const l of dto.addLines!) {
            const p = pMap.get(l.productId);
            if (p && p.stockMode === 'MANUAL') {
              await tx.product.update({ where: { id: p.id }, data: { stockQty: { decrement: l.qty } } });
            }
          }
        });
        await this.event(id, 'delivery', `Stock committed for ${dto.addLines.length} added item(s) (order already preparing)`, actorName);
        await this.mirrorToInventory(
          id, o.orderNo, -1,
          dto.addLines.map((l) => ({ productId: l.productId, qty: l.qty })),
          actorName,
        );
      }
    }

    /* REV-C3: the COD rule was only checked at create, so an edit could smuggle
       a crafted / advance-required product into a cash-on-delivery order and
       break the locked rule. It is re-checked here after the lines change. */
    if (dto.addLines?.length && o.paymentMethod === PaymentMethod.cod) {
      const added = await this.prisma.db.product.findMany({ where: { id: { in: dto.addLines.map((l) => l.productId) } } });
      /*  Staff read these, not customers — but plain words cost nothing and a
          section number explains nothing to anybody. Locked §4 / DEC-PAY-001.  */
      const badType = added.find((p) => p.productType === ProductType.CRAFTED);
      if (badType)
        throw new BadRequestException(
          `“${badType.name}” is made to order, so it cannot be added to a Cash on Delivery order.`,
        );
      const badAdvance = added.find((p) => p.advanceRequired);
      if (badAdvance)
        throw new BadRequestException(
          `“${badAdvance.name}” needs advance payment, so it cannot be added to a Cash on Delivery order.`,
        );
    }

    // per-line discount (money edit open until close) — raw unit price rewrite নয়
    if (dto.lineDiscounts?.length) {
      for (const d of dto.lineDiscounts) {
        const line = await this.prisma.db.orderLine.findFirst({ where: { id: d.lineId, orderId: id, deletedAt: null } });
        if (!line) throw new BadRequestException(`line ${d.lineId} not found`);
        if (d.discountPaisa < 0 || d.discountPaisa > line.linePaisa)
          throw new BadRequestException('line discount out of range');
        await this.prisma.db.orderLine.update({ where: { id: d.lineId }, data: { discountPaisa: d.discountPaisa } });
      }
    }

    await this.prisma.db.order.update({
      where: { id },
      data: {
        recipientName: dto.recipientName,
        recipientPhone: dto.recipientPhone,
        giftMessage: dto.giftMessage,
        address: dto.address,
        deliveryNotes: dto.deliveryNotes,
        methodLabel: dto.methodLabel,
        date: dto.date,
        slotLabel: dto.slotLabel,
        internalNote: dto.internalNote,
        adjustmentPaisa: dto.adjustmentPaisa,
        deliveryPaisa: dto.deliveryPaisa,
        /* DEC-INT-003(a) — if the customer moves the delivery, the promise moves with
           it, or on-time is measured against a date nobody agreed to any more.
           Only recomputed when one of the two halves was actually sent: `undefined`
           leaves the frozen promise alone, which is what a note-only edit should do. */
        ...(dto.date !== undefined || dto.slotLabel !== undefined
          ? { promisedBy: resolvePromisedBy(dto.date ?? o.date, dto.slotLabel ?? o.slotLabel) }
          : {}),
      },
    });
    /* REV-OFR-2 — if the item composition changed, the offer engine must run
       again: a category/product offer's discount base moved, so a frozen
       discountPaisa would be wrong (e.g. the offer's target line was removed).
       Re-quote with the order's stored coupon, refresh discount + redemptions. */
    if (existingItemsTouched || dto.addLines?.length) {
      await this.reapplyOffers(id, actorName);
    }
    // money edit হলে total পুনঃগণনা
    await this.recomputeMoney(id);

    await this.audit.record({ entityType: ENTITY, entityId: id, action: 'UPDATE', actorName, changes: { edit: dto as unknown as Record<string, unknown> } });
    if (dto.deliveryPaisa !== undefined) await this.event(id, 'payment', `Delivery charge set to ৳${(dto.deliveryPaisa / 100).toLocaleString('en-IN')}`, actorName);
    if (dto.adjustmentPaisa !== undefined && dto.adjustmentPaisa !== 0)
      await this.event(id, 'payment', `Adjustment ৳${(dto.adjustmentPaisa / 100).toLocaleString('en-IN')}`, actorName, dto.adjustmentNote);
    await this.event(id, 'sales', `Order edited`, actorName);
    return this.findOne(id);
  }

  /* ---------------- soft delete ---------------- */

  async remove(id: string, actorName = 'Admin') {
    const o = await this.get(id);
    await this.prisma.db.order.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.record({ entityType: ENTITY, entityId: id, action: 'DELETE', actorName });
    await this.event(id, 'system', `Order ${o.orderNo} deleted (soft)`, actorName);
    return { id, deleted: true };
  }

  /* ---------------- helpers ---------------- */

  private async get(id: string) {
    const o = await this.prisma.db.order.findFirst({ where: { id } });
    if (!o) throw new NotFoundException('Order not found');
    return o;
  }
  private async ensureExists(id: string) {
    const o = await this.prisma.db.order.findFirst({ where: { id }, select: { id: true } });
    if (!o) throw new NotFoundException('Order not found');
  }
  /**
   * ORD-REV-1 (30 Jul) — the ONE place a finance event leaves this module.
   *
   * All six hand-offs were `void this.finance…` — fire and forget. `safe()` inside
   * FinanceEventsService swallows the error into a FinancePostingFailure row, which is
   * right, but nothing put that row in front of anybody, so a silent failure was
   * indistinguishable from a sale that had posted cleanly.
   *
   * Why the 17 July Sales review did not catch this: **Finance did not exist yet.**
   * These hooks were added later and the old review was never re-run. That is the
   * lesson worth keeping from this whole exercise — a module being "review-fixed" is
   * true only as of the day it was reviewed, and every module it later grew a
   * dependency on reopens it.
   */
  private async book(orderId: string, what: string, run: () => Promise<void>, actorName: string) {
    try {
      await run();
    } catch (e) {
      await this.event(
        orderId, 'system',
        `⚠ Finance posting failed (${what}) — NOT in the books, replay it from Finance`,
        actorName,
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  private event(id: string, kind: 'sales' | 'delivery' | 'payment' | 'system' | 'general', label: string, actorName: string, note?: string) {
    return this.audit.event({ entityType: ENTITY, entityId: id, kind, label, actorName, note });
  }

  private shape<T extends { salesStatus: SalesStatus; deliveryStatus: DeliveryStatus }>(o: T) {
    return { ...o, editable: this.editableFields(o) };
  }

  // locked §4 editableFields guard
  /**
   * `items`   = change/remove an EXISTING line — locks once stock is committed
   *             at Preparing (DEC-MOD-003); undoing it would strand stock.
   * `addItems`= ADD a new line — a softer rule: adding only commits fresh stock
   *             and charges more, it never strands what is already prepared.
   *             Stays open until the rider leaves (out_for_delivery).
   */
  private editableFields(o: { salesStatus: SalesStatus; deliveryStatus: DeliveryStatus }) {
    if (o.salesStatus === SalesStatus.cancelled || o.salesStatus === SalesStatus.completed)
      return { items: false, addItems: false, recipient: false, delivery: false, notes: false };
    if (o.deliveryStatus === DeliveryStatus.out_for_delivery)
      return { items: false, addItems: false, recipient: false, delivery: false, notes: true };
    if (o.deliveryStatus === DeliveryStatus.preparing)
      return { items: false, addItems: true, recipient: true, delivery: true, notes: true };
    return { items: true, addItems: true, recipient: true, delivery: true, notes: true };
  }

  /*
    ⚠️ DEC-PRD-028 — order line-এর দামেও ছাড়ের মেয়াদ ধরা হয়। storefront
    যদি পুরো দাম দেখায় আর order যদি ছাড়ের দাম বসায়, তফাতটা প্রতি order-এ
    নীরবে মালিকের পকেট থেকে যেত।
  */
  /** প্রতিটা add-on-এর চাহিদা (qty-সহ) — একই add-on দুই line-এ থাকলে যোগফল */
  private addonDemand(lines: { addonIds?: string[] | null; qty: number }[]): Map<string, number> {
    const need = new Map<string, number>();
    for (const l of lines) {
      for (const id of l.addonIds ?? []) {
        need.set(id, (need.get(id) ?? 0) + l.qty);
      }
    }
    return need;
  }

  private async assertAddonsInStock(lines: { addonIds?: string[] | null; qty: number }[]) {
    const need = this.addonDemand(lines);
    if (need.size === 0) return;
    const rows = await this.prisma.db.addOn.findMany({
      where: { id: { in: [...need.keys()] } },
      select: { id: true, name: true, stockQty: true, isActive: true },
    });
    const short: string[] = [];
    for (const [id, qty] of need) {
      const a = rows.find((r) => r.id === id);
      if (!a || !a.isActive) { short.push('an add-on that is no longer offered'); continue; }
      if (a.stockQty !== null && a.stockQty < qty)
        short.push(`${a.name} (need ${qty}, have ${a.stockQty})`);
    }
    if (short.length)
      throw new BadRequestException(`add-on out of stock: ${short.join('; ')}`);
  }

  private buildLine(
    l: OrderLineInput,
    pMap: Map<
      string,
      {
        id: string;
        name: string;
        productType: ProductType;
        sellingPricePaisa: number;
        discountType: DiscountType;
        discountValue: number;
        discountStartsAt?: Date | null;
        discountEndsAt?: Date | null;
        /** প্রথম ছবিটা — line-এর `bg` snapshot-এর জন্য (৫ আগস্ট) */
        images?: { url: string }[];
      }
    >,
  ): Prisma.OrderLineCreateWithoutOrderInput {
    const p = pMap.get(l.productId);
    if (!p) throw new BadRequestException(`productId ${l.productId} not found`);
    if (!l.qty || l.qty < 1) throw new BadRequestException('line qty must be >= 1');
    const unitPaisa = l.unitPaisa ?? paidPaisa(p);
    /*  ছাড় কখনো line-এর দামের চেয়ে বড় হতে পারবে না — নইলে একটা line
        ঋণাত্মক হয়ে বাকি order-এর দাম কমিয়ে দিত।  */
    const discountPaisa = Math.min(Math.max(0, l.discountPaisa ?? 0), unitPaisa * l.qty);
    return {
      product: { connect: { id: p.id } },
      name: p.name,
      /*  ছবি-snapshot — রসিদের বাকি সবকিছুর মতোই জমে যায়। মালিক পরে ছবি
          বদলালে পুরনো order-এর ছবি বদলায় না (DEC-DLV-002-এর স্পিরিট)।
          admin `background:`-এ সরাসরি বসায়, তাই CSS-রূপে রাখা হয়।  */
      bg: p.images?.[0]?.url ? `url(${p.images[0].url}) center/cover` : undefined,
      sizeLabel: l.sizeLabel,
      bundleLabel: l.bundleLabel,
      addonLabels: l.addonLabels ?? [],
      addonIds: l.addonIds ?? [],
      persoText: l.persoText,
      /*  DEC-PRD-014 — যে রঙটা বিক্রি হলো, FK + label snapshot দুটোই।  */
      ...(l.variantId ? { variant: { connect: { id: l.variantId } } } : {}),
      variantLabel: l.variantLabel,
      addedFrom: (l.addedFrom ?? 'PRODUCT') as AddedFrom,
      productType: p.productType, // per-line freeze from product
      qty: l.qty,
      unitPaisa,
      /*  ⚠️ linePaisa = গ্রাহক এই line-এর জন্য যা দেবেন, ছাড় বাদ দিয়ে।
          Order-এর subtotal এদের যোগফল, তাই ছাড় এখানে না কাটলে bundle
          ছাড়টা দুবার হিসাব হতো — একবার এখানে, একবার নিচে discountPaisa-তে।  */
      linePaisa: unitPaisa * l.qty - discountPaisa,
      discountPaisa,
    };
  }

  /**
   * DEC-SAL-013 — the two rates, from the one row the owner can edit.
   *
   * Read fresh on every cancel rather than cached: a cancellation is rare and
   * a stale percentage is money.
   */
  /** DEC-SAL-013 — the rules screen reads this. */
  async getSalesSettings() {
    return this.salesRates();
  }

  /**
   * DEC-SAL-013 — and writes it.
   *
   * ⚠️ Bounded 0–100. A percentage outside that is a typo, and this one is
   * money: 1000 would try to refund ten times what came in, and the payout
   * cap would quietly swallow it so nobody ever found out.
   */
  async saveSalesSettings(dto: { beforeStartPct?: number; afterStartPct?: number }) {
    const now = await this.salesRates();
    const clamp = (n: number | undefined, fallback: number) =>
      n == null || Number.isNaN(n) ? fallback : Math.min(100, Math.max(0, Math.round(n)));
    await this.prisma.db.salesSetting.update({
      where: { id: 'singleton' },
      data: {
        beforeStartPct: clamp(dto.beforeStartPct, now.beforeStartPct),
        afterStartPct: clamp(dto.afterStartPct, now.afterStartPct),
      },
    });
    return this.salesRates();
  }

  private async salesRates(): Promise<{ beforeStartPct: number; afterStartPct: number }> {
    try {
      const row = await this.prisma.db.salesSetting.upsert({
        where: { id: 'singleton' },
        update: {},
        create: { id: 'singleton' },
      });
      return { beforeStartPct: row.beforeStartPct, afterStartPct: row.afterStartPct };
    } catch {
      /*  Before the table exists, the owner's own numbers — never a silent
          100% refund, which is the leak this rule was written to close.  */
      return { beforeStartPct: 100, afterStartPct: 50 };
    }
  }

  /**
   * ⚠️ NO LONGER USED BY `cancel()` — DEC-SAL-013 replaced it, 25 Aug 2026.
   *
   * It answers a different question from the refund ladder: how much of the
   * price must be paid UP FRONT before the workshop starts. Kept because
   * `advanceRequired` / `advanceType` still drive that, and checkout reads
   * them. It must not creep back into a refund calculation — the owner's rule
   * is a share of what was RECEIVED, and this is a share of what was OWED.
   */
  private advanceForfeit(p: { advanceType: string | null; advancePercent: number | null; advanceAmountPaisa: number | null } | undefined, net: number): number {
    if (!p) return 0;
    if (p.advanceType === 'FULL') return net;
    if (p.advanceType === 'PARTIAL') {
      if (p.advanceAmountPaisa != null) return Math.min(net, p.advanceAmountPaisa);
      if (p.advancePercent != null) return Math.round((net * p.advancePercent) / 100);
    }
    return 0;
  }

  /**
   * The COD rule — locked §4 / DEC-PAY-001. THE ONLY PLACE IT IS ENFORCED.
   *
   * ⚠️ A SECOND COPY LIVED IN `shop/checkout.ts` FOR HALF A DAY, 24 Aug 2026,
   * and it was mine. The complaint that started it was real — the BROWSER's
   * copy of the rule read the mock catalogue and always answered "no advance
   * needed", so the website offered Cash on Delivery on made-to-order goods.
   * The mistake was concluding the server did not enforce it either. It did,
   * right here, on every channel: the storefront reaches this through
   * `orders.create`, and so do the admin and the counter.
   *
   * So the second copy is gone and this one stayed, because a money rule with
   * two implementations is a money rule that will disagree with itself — the
   * same lesson as `ChannelSender` in CLAUDE.md.
   *
   * ⚠️ THESE SENTENCES ARE READ BY CUSTOMERS. This throws on the public
   * checkout, so whatever is written here lands on a shopper's screen at the
   * moment they press Place order. Until today the middle one said
   * *"COD not allowed with a crafted line (locked §4)"* — a section number
   * from an internal document, shown to somebody trying to buy flowers.
   *
   * Say what the shop cannot do, name the thing, and give the reason. The
   * DEC id belongs in this comment, not on their screen.
   */
  private assertCodAllowed(
    dto: CreateOrderDto,
    lines: Prisma.OrderLineCreateWithoutOrderInput[],
    pMap: Map<string, { advanceRequired?: boolean }>,
  ) {
    if (dto.isGift)
      throw new BadRequestException(
        'Cash on Delivery is not available on a gift order — our rider would have to ask the receiver for money. Please pay online.',
      );

    const crafted = lines.find((l) => l.productType === ProductType.CRAFTED);
    if (crafted)
      throw new BadRequestException(
        `“${crafted.name}” is made to order, so it cannot be Cash on Delivery. Please pay online.`,
      );

    const advanceLine = dto.lines.find((l) => pMap.get(l.productId)?.advanceRequired);
    if (advanceLine) {
      const name = lines.find((l) => l.product?.connect?.id === advanceLine.productId)?.name;
      throw new BadRequestException(
        name
          ? `“${name}” needs advance payment, so Cash on Delivery is not available for this order.`
          : 'One of these needs advance payment, so Cash on Delivery is not available for this order.',
      );
    }
  }

  private derivePaymentStatus(method: PaymentMethod, total: number, paid: number, refund: number, kind: string): PaymentStatus {
    if (refund > 0 && refund >= paid) return PaymentStatus.refunded;
    if (refund > 0) return PaymentStatus.partially_refunded;
    if (kind === 'COD_COLLECTED') return PaymentStatus.cod_collected;
    if (paid >= total && total > 0) return method === PaymentMethod.cod ? PaymentStatus.cod_collected : PaymentStatus.paid;
    if (paid > 0) return PaymentStatus.advance_paid;
    return PaymentStatus.unpaid;
  }

  /**
   * REV-M2: money is recomputed AND the payment status is re-derived. An edit
   * that lowers the total below what was already collected leaves an
   * over-payment — it is surfaced as `overpaidPaisa` so staff can refund it,
   * instead of silently sitting in duePaisa = 0.
   */
  private async recomputeMoney(id: string) {
    const order = await this.prisma.db.order.findFirst({ where: { id }, include: { lines: { where: NOT_DELETED } } });
    if (!order) return;
    const subtotal = order.lines.reduce((s, l) => s + (l.linePaisa - l.discountPaisa), 0);
    // REV-OFR-2 — a discount can never exceed the subtotal (DEC-OFR-009); an edit
    // that shrinks the cart must not leave a discount bigger than what's left.
    const cappedDiscount = Math.min(order.discountPaisa, subtotal);
    const total = subtotal - cappedDiscount + order.deliveryPaisa - order.deliveryWaivedPaisa + order.adjustmentPaisa;
    const collected = order.paidPaisa - order.refundPaisa; // money actually in hand
    const due = Math.max(0, total - collected);
    const status = this.derivePaymentStatus(order.paymentMethod, total, order.paidPaisa, order.refundPaisa, '');
    await this.prisma.db.order.update({
      where: { id },
      data: { subtotalPaisa: subtotal, totalPaisa: total, duePaisa: due, paymentStatus: status, discountPaisa: cappedDiscount },
    });
    if (collected > total) {
      await this.event(id, 'payment', `Overpaid by ${collected - total} paisa — refund is owed`, 'System');
    }
  }

  /**
   * REV-OFR-2 — re-run the offer engine after an edit changed the cart, and keep
   * the redemption rows in step with the new discount. The stored couponCode is
   * reused; automatic offers are re-evaluated against the new lines. Manual
   * staff discount is preserved (we only own the engine's share). Fail-soft:
   * a re-quote hiccup must never break the edit — the cap in recomputeMoney is
   * the safety net if the discount ends up stale.
   */
  private async reapplyOffers(id: string, actorName: string) {
    try {
      const order = await this.prisma.db.order.findFirst({
        where: { id },
        include: { lines: { where: NOT_DELETED } },
      });
      if (!order) return;

      // prior redemptions = the engine's previous share of discountPaisa
      const priorReds = await this.prisma.db.offerRedemption.findMany({
        where: { orderId: id, deletedAt: null },
      });
      const priorEngineDiscount = priorReds.reduce((s, r) => s + r.discountPaisa, 0);
      const manualDiscount = Math.max(0, order.discountPaisa - priorEngineDiscount);

      const quote = await this.offers.quote({
        customerId: order.customerId,
        /*  DEC-POS-018 — the offer engine prices website products; a counter item
            line has no product to match a rule against.  */
        lines: order.lines
          .map((l) => ({ productId: l.productId, qty: l.qty, unitPaisa: l.unitPaisa }))
          .filter((l): l is { productId: string; qty: number; unitPaisa: number } => !!l.productId),
        deliveryPaisa: order.deliveryPaisa,
        paymentMethod: order.paymentMethod,
        couponCode: order.couponCode ?? undefined,
      });

      // release old, write fresh — all in one transaction
      await this.prisma.db.$transaction(async (tx) => {
        await tx.offerRedemption.updateMany({
          where: { orderId: id, deletedAt: null },
          data: { deletedAt: new Date() },
        });
        for (const a of quote.applied) {
          await tx.offerRedemption.create({
            data: {
              offerId: a.offerId, orderId: id, customerId: order.customerId,
              code: a.code, discountPaisa: a.discountPaisa, freeDelivery: a.freeDelivery,
            },
          });
        }
        await tx.order.update({
          where: { id },
          data: {
            discountPaisa: manualDiscount + quote.discountPaisa,
            deliveryWaivedPaisa: quote.deliveryWaivedPaisa,
          },
        });
      });

      if (priorEngineDiscount !== quote.discountPaisa) {
        await this.event(id, 'payment', `Offers re-applied after edit — discount now ${quote.discountPaisa} paisa`, actorName);
      }
    } catch (e) {
      await this.event(id, 'system', `⚠ Offer re-apply after edit failed: ${e instanceof Error ? e.message : e}`, actorName);
    }
  }

  private async nextOrderNo(): Promise<string> {
    for (let i = 0; i < 20; i++) {
      const n = 50000 + Math.floor(Math.random() * 49999);
      const no = `RAD-${n}`;
      const dupe = await this.prisma.db.order.findFirst({ where: { orderNo: no }, select: { id: true } });
      if (!dupe) return no;
    }
    return `RAD-${Date.now()}`;
  }
}
