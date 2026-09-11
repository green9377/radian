import {
  BadRequestException,
  ConflictException,
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
  AssignmentStatus,
  PaymentTxnKind,
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
import { FulfillmentType, OrderMessageKind } from '@prisma/client';
import {
  CreateOrderDto,
  EditOrderDto,
  AddPaymentDto,
  AddPhotoDto,
  CancelOrderDto,
  ListOrderQuery,
  OrderLineInput,
  FailOrderDto,
  FailDecision,
} from './order.dto';
import { validateFailOrder, validateAddPayment, validateCreateOrder, validateEditOrder } from './order.dto';

const ENTITY = 'Order';

/*  The client Prisma hands an interactive transaction on OUR extended db.
    `Prisma.TransactionClient` is the un-extended one and does not match, so
    it is derived from the real thing rather than guessed (audit 11 Sep 2026). */
type OrderTx = Omit<
  PrismaService['db'],
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;
const NOT_DELETED = { deletedAt: null };

const FULL_INCLUDE = {
  channel: true,
  customer: { select: { id: true, name: true, phone: true } },
  lines: {
    where: NOT_DELETED,
    orderBy: { createdAt: 'asc' },
    /*  R2 (4 Sep 2026) — the one COD flag, DEC-SAL-015, carried with the
        line so a screen can say WHY cash is closed without guessing from
        CRAFTED (which is not a COD rule and never was, since 30 Aug).  */
    include: { product: { select: { advanceRequired: true } } },
  },
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

  /*  ═══ THE ALL-ORDERS LIST, COUNTED AND PAGED IN THE DATABASE ═══════════
      audit 11 Sep 2026 (P2 "100-row cap everywhere").

      The screen used to ask for `pageSize=100` and then do EVERYTHING in the
      browser: the search box, the six segments, the self/gift and payment
      drop-downs, and the five band tiles — all over whichever hundred orders
      happened to come back. Under a hundred orders that is right by accident.
      Past it: an order placed last month cannot be found by typing its number,
      and "Revenue" and "To collect" quietly report a slice of the shop while
      looking exactly as healthy as the truth.

      Every one of those filters is a `where` now, and the tiles come from
      `stats()` over the WHOLE filtered set, never one page.

      ⚠️ THE RESPONSE STILL CARRIES `items`. Payments and Returns both read
      `listOrders().items`, and this is not their fix; `rows` is added as an
      alias so the new screen can speak the same language as the delivery
      board, and both point at the same array.  */

  /** everything the list and the stats filter on — one definition, two callers */
  private listWhere(q: ListOrderQuery): Prisma.OrderWhereInput {
    // AUD-2 FIX — this is the ONLINE Sales list. POS counter sales live in the
    // same Order table (DEC-POS-001) but have their own screens; without this
    // filter they leak into online revenue/COD KPIs and double-count.
    /*  ...unless the caller says otherwise. Returns has to find a counter bill
        too (owner, 21 Aug: searching a POS order number found nothing), and it
        asks with includeCounter=true. The online lists never do.  */
    const where: Prisma.OrderWhereInput =
      q.includeCounter === 'true'
        ? {}
        : /*  ⚠️ AND PICKUP (9 Sep 2026). This said DELIVERY alone, so the day
              'collect from shop' arrived every such order would have vanished
              from the owner's Orders screen — a web order he had taken money
              for, missing from the one list he works from. Only a POS counter
              sale is meant to be out of this view.  */
          { fulfillmentType: { in: [FulfillmentType.DELIVERY, FulfillmentType.PICKUP] } };

    /*  `search` is the old name and `q` the new one; both do the same thing,
        and the recipient and the address are searchable now because that is
        what staff actually type when a customer rings up.  */
    const needle = (q.q ?? q.search ?? '').trim();
    if (needle) {
      where.OR = [
        { orderNo: { contains: needle, mode: 'insensitive' } },
        { senderName: { contains: needle, mode: 'insensitive' } },
        { senderPhone: { contains: needle } },
        { recipientName: { contains: needle, mode: 'insensitive' } },
        { recipientPhone: { contains: needle } },
        { address: { contains: needle, mode: 'insensitive' } },
      ];
    }
    if (q.salesStatus) where.salesStatus = q.salesStatus as SalesStatus;
    if (q.deliveryStatus) where.deliveryStatus = q.deliveryStatus as DeliveryStatus;
    if (q.channelId) where.channelId = q.channelId;
    if (q.needsAction === 'true') where.salesStatus = SalesStatus.placed;
    if (q.paymentMethod === 'cod' || q.paymentMethod === 'online')
      where.paymentMethod = q.paymentMethod as PaymentMethod;
    if (q.isGift === 'true' || q.isGift === 'false') where.isGift = q.isGift === 'true';
    if (q.zone === 'DHAKA' || q.zone === 'BANGLADESH') where.zone = q.zone;
    if (q.due === 'true') {
      where.duePaisa = { gt: 0 };
      /*  (review 11 Sep 2026) ⚠️ DO NOT ASSIGN salesStatus HERE. A plain
          assignment threw away whatever `salesStatus`/`needsAction` had
          already put on the where, so "unpaid AND still to confirm" quietly
          became "every unpaid order". "Not cancelled" is an extra condition,
          so it goes on as one.  */
      const notCancelled = { salesStatus: { not: SalesStatus.cancelled } };
      where.AND = Array.isArray(where.AND) ? [...where.AND, notCancelled] : where.AND ? [where.AND, notCancelled] : [notCancelled];
    }

    /*  The window is on placedAt, and a bare YYYY-MM-DD is read as DHAKA's
        day — the shop's day, not the server's (COMMON rule 9). `to` is
        inclusive of the whole day named.  */
    const from = this.dayBoundary(q.from, 'start');
    const to = this.dayBoundary(q.to, 'end');
    if (from || to) where.placedAt = { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) };

    /*  The screen's own segments, in the database this time. `fulfilling`,
        `due` and the rest were `Array.filter` predicates in OrderListView; the
        same sentences, said in SQL.  */
    const seg = this.segWhere(q.seg);
    return seg ? { AND: [where, seg] } : where;
  }

  /** the six segments of All orders — the exact predicates the screen used */
  private segWhere(seg?: string): Prisma.OrderWhereInput | null {
    switch (seg) {
      case 'placed':
        return { salesStatus: SalesStatus.placed };
      case 'fulfilling':
        return {
          salesStatus: { not: SalesStatus.cancelled },
          deliveryStatus: { in: [DeliveryStatus.preparing, DeliveryStatus.out_for_delivery] },
        };
      case 'confirmed':
        return { salesStatus: SalesStatus.confirmed, deliveryStatus: DeliveryStatus.unassigned };
      case 'delivered':
        return { deliveryStatus: DeliveryStatus.delivered };
      case 'due':
        return { duePaisa: { gt: 0 }, salesStatus: { not: SalesStatus.cancelled } };
      case 'cancelled':
        return { salesStatus: SalesStatus.cancelled };
      default:
        return null;
    }
  }

  /**
   * A YYYY-MM-DD read as Dhaka's day (UTC+6), or a full ISO instant taken as
   * it is. `end` gives the START of the next day, so a `lt` covers the whole
   * of the day named. Reuses the constant `overview()` already lives by
   * rather than inventing a second idea of when today began.
   */
  private dayBoundary(v: string | undefined, edge: 'start' | 'end'): Date | null {
    if (!v?.trim()) return null;
    const DHAKA = 6 * 3600_000;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
    if (m) {
      const base = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - DHAKA;
      return new Date(edge === 'end' ? base + 24 * 3600_000 : base);
    }
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  async list(q: ListOrderQuery) {
    const page = Math.max(1, parseInt(q.page ?? '1', 10) || 1);
    /*  200 is the ceiling and 50 the default; the old default of 20 stays for
        anybody who asks for neither, because Returns' order picker relies on
        a small page.  */
    const pageSize = Math.min(200, Math.max(1, parseInt(q.pageSize ?? '20', 10) || 20));
    const where = this.listWhere(q);

    const [items, total] = await Promise.all([
      this.prisma.db.order.findMany({
        where,
        include: {
          channel: true,
          // ordersCount is the Customer module's own tally — the list shows NEW / REPEAT from it
          customer: { select: { id: true, name: true, ordersCount: true } },
          _count: { select: { lines: { where: NOT_DELETED } } },
          // the latest money movement only — Payments shows it as "Last movement"
          transactions: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
        orderBy: { placedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.db.order.count({ where }),
    ]);
    /*  `rows` and `items` are the SAME array. `items` is what Payments and
        Returns read and must keep working; `rows` is what the board and the
        new All-orders page speak.  */
    return { items, rows: items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  /**
   * The five band tiles, over the whole filtered set.
   *
   * ⚠️ SEGMENT COUNTS IGNORE THE `seg` FILTER, ON PURPOSE. The tiles and the
   * segment chips are how you CHOOSE a segment; counting them inside the
   * segment you have already chosen would make every other one read 0 and the
   * chosen one read the total. Everything else — the search box, the zone, the
   * dates, self/gift, payment method — does apply, because those narrow WHICH
   * orders are being talked about rather than which slice of them.
   */
  async stats(q: ListOrderQuery) {
    const base = this.listWhere({ ...q, seg: undefined });
    const and = (extra: Prisma.OrderWhereInput): Prisma.OrderWhereInput => ({ AND: [base, extra] });
    const notCancelled: Prisma.OrderWhereInput = { salesStatus: { not: SalesStatus.cancelled } };

    /*  "Delivered today" is DELIVERED TODAY — by `deliveredAt`, in Dhaka's day
        (audit #35). The screen counted it off the PROMISED date, so a parcel
        promised for today and still in the workshop was reported as delivered,
        and one delivered today a day late was not counted at all.  */
    const DHAKA = 6 * 3600_000;
    const now = new Date(Date.now() + DHAKA);
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - DHAKA);
    const todayEnd = new Date(todayStart.getTime() + 24 * 3600_000);

    const [all, placed, fulfilling, confirmed, delivered, dueAgg, cancelled, revenueAgg, outCount, deliveredToday] =
      await Promise.all([
        this.prisma.db.order.count({ where: base }),
        this.prisma.db.order.count({ where: and(this.segWhere('placed')!) }),
        this.prisma.db.order.count({ where: and(this.segWhere('fulfilling')!) }),
        this.prisma.db.order.count({ where: and(this.segWhere('confirmed')!) }),
        this.prisma.db.order.count({ where: and(this.segWhere('delivered')!) }),
        this.prisma.db.order.aggregate({ where: and(this.segWhere('due')!), _sum: { duePaisa: true }, _count: { _all: true } }),
        this.prisma.db.order.count({ where: and({ salesStatus: SalesStatus.cancelled }) }),
        /*  ⚠️ REVENUE IS DELIVERED-ONLY, like Reports and like Finance's own
            books (DEC-FIN-002). A placed order is a promise, not a sale.  */
        /*  (review 11 Sep 2026) `refundPaisa` joins the sum: "Collected" is
            money in hand, and a refunded order was quietly still counting its
            full `paidPaisa`, overstating the tile by every refund ever made.  */
        this.prisma.db.order.aggregate({ where: and({ deliveryStatus: DeliveryStatus.delivered }), _sum: { totalPaisa: true, paidPaisa: true, refundPaisa: true } }),
        this.prisma.db.order.count({ where: and({ deliveryStatus: DeliveryStatus.out_for_delivery, ...notCancelled }) }),
        this.prisma.db.order.count({ where: and({ deliveredAt: { gte: todayStart, lt: todayEnd } }) }),
      ]);

    return {
      counts: {
        all,
        placed,
        fulfilling,
        confirmed,
        delivered,
        due: dueAgg._count._all,
        cancelled,
        outForDelivery: outCount,
        deliveredToday,
      },
      /** delivered orders only */
      revenuePaisa: revenueAgg._sum.totalPaisa ?? 0,
      /** what is actually in hand on those delivered orders — paid less refunded */
      collectedPaisa: (revenueAgg._sum.paidPaisa ?? 0) - (revenueAgg._sum.refundPaisa ?? 0),
      /** what went back out on them, so the tile can be read honestly */
      refundedPaisa: revenueAgg._sum.refundPaisa ?? 0,
      /** every unpaid balance on an order that is not cancelled */
      duePaisa: dueAgg._sum.duePaisa ?? 0,
      dueOrders: dueAgg._count._all,
      deliveredToday,
    };
  }

  /**
   * REV-C4 — the order report, counted by the DATABASE.
   *
   * ⚠️ THE SCREEN USED TO DO THIS ARITHMETIC ITSELF, over `listOrders()`, which
   * asks for `pageSize=100`. Revenue, average order value, the cancellation
   * rate and every channel / zone / payment / gift split were sums over the
   * hundred most recent orders. Under a hundred that is right by accident;
   * past it every number on the page is quietly wrong, and it looks perfectly
   * healthy on demo — the exact shape of fault Phase 5 kept finding, and the
   * one critical the 17 July Sales review left open.
   *
   * ⚠️ REVENUE IS DELIVERED-ONLY, and that is not a display choice: DEC-FIN-002
   * posts revenue at *delivered*, so anything else here would disagree with
   * Finance's own books. A placed order is a promise, not a sale.
   *
   * ⚠️ Counter (POS) sales are excluded, like every other online Sales screen
   * (AUD-2). They live in the same table and have their own reports; counting
   * them here would double-count the shop's takings.
   *
   * Six grouped queries, no order rows crossing the wire. It stays one round
   * trip whether the shop has done 40 orders or 40,000.
   */
  /*  The Orders overview (owner, 11 Sep 2026 — design E, "Today's slots"):
      the day laid out by delivery slot, the month's money, and a short
      watch list. Counted in the database, Dhaka's day (UTC+6). `date` is
      YYYY-MM-DD; blank means today.  */
  async overview(q: { date?: string; range?: string }) {
    const DHAKA = 6 * 3600_000;
    const now = new Date();
    const dhakaNow = new Date(now.getTime() + DHAKA);
    let y = dhakaNow.getUTCFullYear(), m = dhakaNow.getUTCMonth(), d = dhakaNow.getUTCDate();
    const mt = /^(\d{4})-(\d{2})-(\d{2})$/.exec(q.date ?? '');
    if (mt) { y = Number(mt[1]); m = Number(mt[2]) - 1; d = Number(mt[3]); }
    const dayStart = new Date(Date.UTC(y, m, d) - DHAKA);
    const dayEnd = new Date(dayStart.getTime() + 24 * 3600_000);
    /*  The range (owner, 11 Sep 2026): today · 7 · 30 · 90 days, for the
        money, the mix, and the orders-per-day bars. The slots stay per day.  */
    const rangeDays = q.range === '7' ? 7 : q.range === '30' ? 30 : q.range === '90' ? 90 : 1;
    const todayStart = new Date(Date.UTC(dhakaNow.getUTCFullYear(), dhakaNow.getUTCMonth(), dhakaNow.getUTCDate()) - DHAKA);
    const monthStart = new Date(todayStart.getTime() - (rangeDays - 1) * 24 * 3600_000);
    const barDays = rangeDays === 1 ? 14 : rangeDays;
    const barStart = new Date(todayStart.getTime() - (barDays - 1) * 24 * 3600_000);
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

    const web: Prisma.OrderWhereInput = {
      deletedAt: null,
      fulfillmentType: { in: [FulfillmentType.DELIVERY, FulfillmentType.PICKUP] },
    };
    const notCancelled: Prisma.OrderWhereInput = { ...web, salesStatus: { not: SalesStatus.cancelled } };

    const sel = {
      id: true, orderNo: true, placedAt: true, promisedBy: true, slotLabel: true, methodLabel: true,
      salesStatus: true, deliveryStatus: true, paymentMethod: true, paymentStatus: true,
      totalPaisa: true, duePaisa: true, isGift: true, photoUpdates: true, zone: true, address: true,
      recipientName: true, senderName: true, deliveredAt: true,
      photos: { where: { deletedAt: null, kind: 'PREP' as const }, select: { id: true }, take: 1 },
      assignments: { where: { deletedAt: null, isActive: true }, select: { id: true, status: true, kind: true, platform: true, rider: { select: { name: true } }, courier: { select: { name: true } } }, take: 1 },
    } satisfies Prisma.OrderSelect;

    const [today, open, monthDelivered, monthAll, dueAgg, refundAgg, cancelledAgg, placedRows] = await Promise.all([
      /* the day's parcels: promised inside the day, or unscheduled and placed that day */
      this.prisma.db.order.findMany({
        where: {
          ...notCancelled,
          OR: [
            { promisedBy: { gte: dayStart, lt: dayEnd } },
            { promisedBy: null, placedAt: { gte: dayStart, lt: dayEnd } },
          ],
        },
        select: sel,
        orderBy: [{ promisedBy: { sort: 'asc', nulls: 'last' } }, { placedAt: 'asc' }],
      }),
      /* everything still moving, whatever its day — the counters and the watch list */
      this.prisma.db.order.findMany({
        where: {
          ...notCancelled,
          OR: [
            { salesStatus: SalesStatus.placed },
            { deliveryStatus: { in: [DeliveryStatus.unassigned, DeliveryStatus.preparing, DeliveryStatus.out_for_delivery, DeliveryStatus.failed] } },
          ],
        },
        select: sel,
        orderBy: { placedAt: 'asc' },
        take: 500,
      }),
      this.prisma.db.order.aggregate({
        where: { ...web, deliveryStatus: DeliveryStatus.delivered, deliveredAt: { gte: monthStart } },
        _sum: { totalPaisa: true }, _count: { _all: true },
      }),
      this.prisma.db.order.groupBy({
        by: ['paymentMethod', 'isGift'],
        where: { ...notCancelled, placedAt: { gte: monthStart } },
        _count: { _all: true },
      }),
      this.prisma.db.order.aggregate({ where: { ...notCancelled, duePaisa: { gt: 0 } }, _sum: { duePaisa: true }, _count: { _all: true } }),
      this.prisma.db.order.aggregate({ where: { ...web, refundPaisa: { gt: 0 }, placedAt: { gte: monthStart } }, _sum: { refundPaisa: true }, _count: { _all: true } }),
      this.prisma.db.order.count({ where: { ...web, salesStatus: SalesStatus.cancelled, placedAt: { gte: monthStart } } }),
      this.prisma.db.order.findMany({ where: { ...notCancelled, placedAt: { gte: barStart } }, select: { placedAt: true } }),
    ]);

    /* orders per day — one bar a day, Dhaka's days, today last */
    const daily: { day: string; label: string; n: number }[] = [];
    for (let i = 0; i < barDays; i++) {
      const t = new Date(barStart.getTime() + i * 24 * 3600_000 + DHAKA);
      daily.push({ day: `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`, label: String(t.getUTCDate()), n: 0 });
    }
    for (const r of placedRows) {
      const idx = Math.floor((r.placedAt.getTime() - barStart.getTime()) / (24 * 3600_000));
      if (idx >= 0 && idx < barDays) daily[idx].n++;
    }

    type Row = (typeof today)[number];
    const isOut = (o: Row) => o.deliveryStatus === DeliveryStatus.out_for_delivery;
    const isLate = (o: Row) => isOut(o) && !!o.promisedBy && o.promisedBy.getTime() < now.getTime();
    const isPrep = (o: Row) =>
      o.salesStatus !== SalesStatus.placed &&
      (o.deliveryStatus === DeliveryStatus.unassigned || o.deliveryStatus === DeliveryStatus.preparing);
    const hasCarrier = (o: Row) => !!o.assignments[0] && o.assignments[0].status === AssignmentStatus.ASSIGNED;
    const carrierName = (o: Row) => {
      const a = o.assignments[0];
      if (!a) return null;
      return a.rider?.name ?? a.courier?.name ?? (a.platform ? `${a.platform} rider` : null);
    };
    const photoPending = (o: Row) => isPrep(o) && o.photoUpdates && o.photos.length === 0;

    /* slots, in the order the day runs */
    const slots = new Map<string, { label: string; time: string; first: number; total: number; toConfirm: number; preparing: number; ready: number; out: number; late: number; delivered: number; failed: number }>();
    for (const o of today) {
      const raw = (o.slotLabel ?? o.methodLabel ?? 'Unscheduled').trim();
      const [label, ...rest] = raw.split(' · ');
      const key = raw;
      const g = slots.get(key) ?? { label, time: rest.join(' · '), first: o.promisedBy?.getTime() ?? Number.MAX_SAFE_INTEGER, total: 0, toConfirm: 0, preparing: 0, ready: 0, out: 0, late: 0, delivered: 0, failed: 0 };
      g.total++;
      if (o.salesStatus === SalesStatus.placed) g.toConfirm++;
      else if (isPrep(o)) { if (hasCarrier(o) && !photoPending(o)) g.ready++; else g.preparing++; }
      else if (isOut(o)) { g.out++; if (isLate(o)) g.late++; }
      else if (o.deliveryStatus === DeliveryStatus.delivered) g.delivered++;
      else if (o.deliveryStatus === DeliveryStatus.failed) g.failed++;
      slots.set(key, g);
    }

    const counts = { toConfirm: 0, toConfirmPaid: 0, toConfirmCod: 0, preparing: 0, ready: 0, photoPending: 0, notAssigned: 0, onRoad: 0, late: 0, failed: 0, goingOutToday: 0, deliveredToday: 0, cancelled: cancelledAgg };
    for (const o of open) {
      if (o.salesStatus === SalesStatus.placed) { counts.toConfirm++; if (o.paymentMethod === PaymentMethod.cod) counts.toConfirmCod++; else counts.toConfirmPaid++; }
      else if (isPrep(o)) { if (hasCarrier(o) && !photoPending(o)) counts.ready++; else { counts.preparing++; if (!hasCarrier(o)) counts.notAssigned++; if (photoPending(o)) counts.photoPending++; } }
      else if (isOut(o)) { counts.onRoad++; if (isLate(o)) counts.late++; }
      else if (o.deliveryStatus === DeliveryStatus.failed) counts.failed++;
    }
    for (const o of today) {
      if (o.deliveryStatus === DeliveryStatus.delivered) counts.deliveredToday++;
      else if (o.salesStatus !== SalesStatus.placed && o.deliveryStatus !== DeliveryStatus.failed) counts.goingOutToday++;
    }

    /* watch list — the few orders a person should look at first */
    const watch: { id: string; orderNo: string; kind: 'LATE' | 'FAILED' | 'COD_CALL' | 'PHOTO' | 'UNCONFIRMED'; title: string; detail: string; slot: string }[] = [];
    const slotOf = (o: Row) => (o.slotLabel ?? o.methodLabel ?? '').split(' · ')[0];
    const hrs = (from: Date) => Math.round((now.getTime() - from.getTime()) / 3600_000);
    for (const o of open) {
      if (isLate(o) && o.promisedBy) watch.push({ id: o.id, orderNo: o.orderNo, kind: 'LATE', slot: slotOf(o), title: `${hrs(o.promisedBy)} h late`, detail: `${o.recipientName ?? o.senderName} · ${o.address.split(',')[0]}${carrierName(o) ? ` · ${carrierName(o)}` : ' · no carrier recorded'}` });
    }
    for (const o of open) if (o.deliveryStatus === DeliveryStatus.failed) watch.push({ id: o.id, orderNo: o.orderNo, kind: 'FAILED', slot: slotOf(o), title: 'Failed — decide', detail: `${o.recipientName ?? o.senderName} · retry, keep or cancel` });
    for (const o of open) if (o.salesStatus === SalesStatus.placed && o.paymentMethod === PaymentMethod.cod && now.getTime() - o.placedAt.getTime() > 30 * 60_000) watch.push({ id: o.id, orderNo: o.orderNo, kind: 'COD_CALL', slot: slotOf(o), title: 'COD, not called', detail: `৳${(o.totalPaisa / 100).toLocaleString('en-IN')} · ${o.address.split(',')[0]} · ${hrs(o.placedAt)} h ago` });
    for (const o of open) if (photoPending(o)) watch.push({ id: o.id, orderNo: o.orderNo, kind: 'PHOTO', slot: slotOf(o), title: 'Photo pending', detail: `Customer asked for a photo before delivery${carrierName(o) ? ` · ${carrierName(o)} assigned` : ''}` });
    for (const o of open) if (o.salesStatus === SalesStatus.placed && o.paymentMethod !== PaymentMethod.cod && now.getTime() - o.placedAt.getTime() > 3 * 3600_000) watch.push({ id: o.id, orderNo: o.orderNo, kind: 'UNCONFIRMED', slot: slotOf(o), title: `Paid, unconfirmed ${hrs(o.placedAt)} h`, detail: `৳${(o.totalPaisa / 100).toLocaleString('en-IN')} · ${o.senderName}` });

    /*  Six more blocks the owner asked for (11 Sep 2026): top products,
        repeat vs new, upcoming occasions, zone split, lost orders, returns
        pending. Each is its own query so the page reads the same on a slow
        day; all follow the range except occasions (next 7 days) and returns
        (whatever is open).  */
    const inRange: Prisma.OrderWhereInput = { ...notCancelled, placedAt: { gte: monthStart } };
    const mmdd = (t: Date) => `${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
    const next7 = Array.from({ length: 7 }, (_, i) => mmdd(new Date(todayStart.getTime() + i * 24 * 3600_000 + DHAKA)));
    const [lineRows, rangeOrders, occasions, zoneRows, lostAgg, lostOpen, returnsPending] = await Promise.all([
      this.prisma.db.orderLine.groupBy({
        by: ['productId'],
        where: { deletedAt: null, productId: { not: null }, order: inRange },
        _sum: { qty: true, linePaisa: true },
        _count: { _all: true },
        orderBy: { _sum: { qty: 'desc' } },
        take: 10,
      }),
      this.prisma.db.order.findMany({ where: inRange, select: { customerId: true, totalPaisa: true, placedAt: true } }),
      this.prisma.db.recipientOccasion.findMany({
        where: { deletedAt: null, date: { in: next7 }, recipient: { deletedAt: null } },
        select: { type: true, date: true, label: true, recipient: { select: { name: true, relationship: true, customer: { select: { id: true, name: true, phone: true } } } } },
        take: 50,
      }),
      this.prisma.db.order.groupBy({ by: ['zone'], where: inRange, _count: { _all: true }, _sum: { totalPaisa: true } }),
      this.prisma.db.checkoutLead.aggregate({ where: { deletedAt: null, status: { not: 'CONVERTED' }, createdAt: { gte: monthStart } }, _count: { _all: true }, _sum: { totalPaisa: true } }),
      this.prisma.db.checkoutLead.count({ where: { deletedAt: null, status: 'OPEN', createdAt: { gte: monthStart } } }),
      this.prisma.db.salesReturn.findMany({
        where: { deletedAt: null, status: { in: ['draft', 'pending_approval', 'approved'] } },
        select: { id: true, returnNo: true, status: true, returnValuePaisa: true, refundPaisa: true, createdAt: true, order: { select: { orderNo: true, senderName: true } } },
        orderBy: { createdAt: 'asc' },
        take: 8,
      }),
    ]);

    const productIds = lineRows.map((l) => l.productId).filter((x): x is string => !!x);
    const products = productIds.length
      ? await this.prisma.db.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true, images: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } } },
        })
      : [];
    const pmap = new Map(products.map((p) => [p.id, p]));
    const topProducts = lineRows.map((l) => {
      const p = l.productId ? pmap.get(l.productId) : undefined;
      return { productId: l.productId, name: p?.name ?? 'Removed product', image: p?.images[0]?.url ?? null, qty: l._sum.qty ?? 0, orders: l._count._all, paisa: l._sum.linePaisa ?? 0 };
    });

    /* repeat vs new: a customer is new when their FIRST ever order sits inside the range */
    const custIds = [...new Set(rangeOrders.map((o) => o.customerId))];
    const firstOrders = custIds.length
      ? await this.prisma.db.order.groupBy({ by: ['customerId'], where: { ...notCancelled, customerId: { in: custIds } }, _min: { placedAt: true } })
      : [];
    const firstAt = new Map(firstOrders.map((f) => [f.customerId, f._min.placedAt?.getTime() ?? 0]));
    const customers = { newCount: 0, repeatCount: 0, newPaisa: 0, repeatPaisa: 0, newOrders: 0, repeatOrders: 0 };
    const seen = new Set<string>();
    for (const o of rangeOrders) {
      const isNew = (firstAt.get(o.customerId) ?? 0) >= monthStart.getTime();
      if (isNew) { customers.newPaisa += o.totalPaisa; customers.newOrders++; } else { customers.repeatPaisa += o.totalPaisa; customers.repeatOrders++; }
      if (!seen.has(o.customerId)) { seen.add(o.customerId); if (isNew) customers.newCount++; else customers.repeatCount++; }
    }

    const occasionsOut = occasions
      .map((oc) => ({
        type: oc.type, date: oc.date, label: oc.label, inDays: next7.indexOf(oc.date),
        recipient: oc.recipient.name, relationship: oc.recipient.relationship,
        customer: oc.recipient.customer ? { id: oc.recipient.customer.id, name: oc.recipient.customer.name, phone: oc.recipient.customer.phone } : null,
      }))
      .sort((x, y) => x.inDays - y.inDays);

    const zones = zoneRows.map((z) => ({ zone: z.zone, orders: z._count._all, paisa: z._sum.totalPaisa ?? 0 }));

    const mix = { online: 0, cod: 0, gift: 0, self: 0, total: 0 };
    for (const g of monthAll) {
      const n = g._count._all;
      mix.total += n;
      if (g.paymentMethod === PaymentMethod.cod) mix.cod += n; else mix.online += n;
      if (g.isGift) mix.gift += n; else mix.self += n;
    }

    return {
      date: dateStr,
      range: rangeDays,
      daily,
      isToday: !mt || dateStr === `${dhakaNow.getUTCFullYear()}-${String(dhakaNow.getUTCMonth() + 1).padStart(2, '0')}-${String(dhakaNow.getUTCDate()).padStart(2, '0')}`,
      slots: [...slots.values()].sort((a, b) => a.first - b.first).map(({ first: _f, ...g }) => g),
      counts,
      money: {
        revenueMonth: monthDelivered._sum.totalPaisa ?? 0,
        deliveredMonth: monthDelivered._count._all,
        aov: monthDelivered._count._all ? Math.round((monthDelivered._sum.totalPaisa ?? 0) / monthDelivered._count._all) : 0,
        dueFromCustomer: dueAgg._sum.duePaisa ?? 0,
        dueOrders: dueAgg._count._all,
        refundedMonth: refundAgg._sum.refundPaisa ?? 0,
        refundedOrders: refundAgg._count._all,
      },
      mix,
      watch: watch.slice(0, 10),
      topProducts,
      customers,
      occasions: occasionsOut,
      zones,
      lost: { count: lostAgg._count._all, paisa: lostAgg._sum.totalPaisa ?? 0, open: lostOpen },
      returns: returnsPending.map((r) => ({ id: r.id, returnNo: r.returnNo, status: r.status, valuePaisa: r.returnValuePaisa, refundPaisa: r.refundPaisa, createdAt: r.createdAt, orderNo: r.order.orderNo, customer: r.order.senderName })),
    };
  }

  async report(q: { from?: string; to?: string }) {
    const where: Prisma.OrderWhereInput = {
      // a collected order is still a web order — see the note above
      fulfillmentType: { in: [FulfillmentType.DELIVERY, FulfillmentType.PICKUP] },
    };

    /*  A blank or unparseable date is ignored rather than refused — a report
        is a read, and half a filter must never mean half a truth. Whatever is
        applied comes back in `range` so the screen can say what it counted. */
    const from = q.from ? new Date(q.from) : null;
    const to = q.to ? new Date(q.to) : null;
    const okFrom = from && !Number.isNaN(from.getTime()) ? from : null;
    const okTo = to && !Number.isNaN(to.getTime()) ? to : null;
    if (okFrom || okTo) {
      where.placedAt = {
        ...(okFrom ? { gte: okFrom } : {}),
        ...(okTo ? { lte: okTo } : {}),
      };
    }

    const delivered: Prisma.OrderWhereInput = {
      ...where,
      deliveryStatus: DeliveryStatus.delivered,
    };

    /*  `_sum.totalPaisa` is added only on the delivered set. Grouping the whole
        set and summing everything would hand the page a "revenue" that counts
        orders nobody has paid for yet.  */
    const [total, cancelled, deliveredAgg, byChannel, byZone, byPayment, byGift] =
      await Promise.all([
        this.prisma.db.order.count({ where }),
        this.prisma.db.order.count({ where: { ...where, salesStatus: SalesStatus.cancelled } }),
        this.prisma.db.order.aggregate({
          where: delivered,
          _count: { _all: true },
          _sum: { totalPaisa: true },
        }),
        this.prisma.db.order.groupBy({ by: ['channelId'], where, _count: { _all: true } }),
        this.prisma.db.order.groupBy({ by: ['zone'], where, _count: { _all: true } }),
        this.prisma.db.order.groupBy({ by: ['paymentMethod'], where, _count: { _all: true } }),
        this.prisma.db.order.groupBy({ by: ['isGift'], where, _count: { _all: true } }),
      ]);

    /*  The same four splits again over delivered orders only, so each bar can
        carry its own revenue — the screen shows "n orders · ৳x" per row, and
        that ৳x has to obey the delivered-only rule as much as the headline
        does.  */
    const [revChannel, revZone, revPayment, revGift] = await Promise.all([
      this.prisma.db.order.groupBy({ by: ['channelId'], where: delivered, _sum: { totalPaisa: true } }),
      this.prisma.db.order.groupBy({ by: ['zone'], where: delivered, _sum: { totalPaisa: true } }),
      this.prisma.db.order.groupBy({ by: ['paymentMethod'], where: delivered, _sum: { totalPaisa: true } }),
      this.prisma.db.order.groupBy({ by: ['isGift'], where: delivered, _sum: { totalPaisa: true } }),
    ]);

    /*  Channels are named in their own table (One Data One Owner), so the ids
        are resolved once here instead of the screen guessing from a slug.  */
    const channelIds = byChannel
      .map((r) => r.channelId)
      .filter((v): v is string => !!v);
    const channels = channelIds.length
      ? await this.prisma.db.channel.findMany({
          where: { id: { in: channelIds } },
          select: { id: true, name: true },
        })
      : [];
    const channelName = new Map(channels.map((c) => [c.id, c.name]));

    /*  Two grouped results joined on a plain string key. Prisma gives each
        groupBy its own shape, so they are flattened to `{key, n}` and
        `{key, revenue}` before meeting — trying to keep both Prisma types in
        one generic buys nothing and costs a page of type noise.  */
    type Counted = { key: string; label: string; n: number };
    const rows = (counted: Counted[], revenues: { key: string; revenuePaisa: number }[]) => {
      const rev = new Map(revenues.map((r) => [r.key, r.revenuePaisa]));
      return counted
        .map((r) => ({ label: r.label, n: r.n, revenuePaisa: rev.get(r.key) ?? 0 }))
        .sort((a, b) => b.n - a.n);
    };

    const revenuePaisa = deliveredAgg._sum.totalPaisa ?? 0;
    const deliveredCount = deliveredAgg._count._all;

    /*  Orders -> Reports, 9 Sep 2026 (owner): three more splits on the same
        rules — by day, by delivery type, top products. Day and delivery type
        obey delivered-only for revenue like everything above; the product
        table counts every line on a non-cancelled order, because a product
        sold is a product sold whether the van has left yet or not.  */
    const [byDay, byMethod, revMethod, topLines] = await Promise.all([
      this.prisma.db.order.findMany({
        where,
        select: { placedAt: true, totalPaisa: true, deliveryStatus: true, salesStatus: true },
      }),
      this.prisma.db.order.groupBy({ by: ['methodLabel'], where, _count: { _all: true } }),
      this.prisma.db.order.groupBy({ by: ['methodLabel'], where: delivered, _sum: { totalPaisa: true } }),
      /*  ⚠️ GROUPED BY productId ALONE — audit 11 Sep 2026.
          This grouped by (productId, name), and `name` on a line is a frozen
          snapshot of what the product was CALLED when it was sold. Rename
          "Red Roses" to "Red Roses Bouquet" and the same product came back as
          two rows, each with half the quantity, neither of them the truth.
          The current name is looked up below, from Product, which owns it.  */
      this.prisma.db.orderLine.groupBy({
        by: ['productId'],
        where: {
          deletedAt: null,
          order: { ...where, salesStatus: { not: SalesStatus.cancelled } },
        },
        _sum: { qty: true, linePaisa: true },
        orderBy: { _sum: { qty: 'desc' } },
        take: 8,
      }),
    ]);
    /*  one query for the current names of the eight products above  */
    const topIds = topLines.map((l) => l.productId).filter((v): v is string => !!v);
    const topNames = new Map(
      topIds.length
        ? (await this.prisma.db.product.findMany({ where: { id: { in: topIds } }, select: { id: true, name: true } }))
            .map((p) => [p.id, p.name] as const)
        : [],
    );

    const dayMap = new Map<string, { n: number; delivered: number; cancelled: number; revenuePaisa: number }>();
    for (const o of byDay) {
      const key = o.placedAt.toISOString().slice(0, 10);
      const d = dayMap.get(key) ?? { n: 0, delivered: 0, cancelled: 0, revenuePaisa: 0 };
      d.n++;
      if (o.salesStatus === SalesStatus.cancelled) d.cancelled++;
      if (o.deliveryStatus === DeliveryStatus.delivered) {
        d.delivered++;
        d.revenuePaisa += o.totalPaisa;
      }
      dayMap.set(key, d);
    }
    const day = [...dayMap.entries()]
      .map(([date, d]) => ({ date, ...d }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      range: {
        from: okFrom ? okFrom.toISOString() : null,
        to: okTo ? okTo.toISOString() : null,
      },
      totalOrders: total,
      deliveredOrders: deliveredCount,
      cancelledOrders: cancelled,
      revenuePaisa,
      /** delivered orders only — an average over promises is not an average order */
      aovPaisa: deliveredCount ? Math.round(revenuePaisa / deliveredCount) : 0,
      cancelRatePct: total ? Math.round((cancelled / total) * 100) : 0,
      channel: rows(
        byChannel.map((r) => ({
          key: r.channelId ?? '',
          label: r.channelId ? (channelName.get(r.channelId) ?? 'Unknown') : 'Web',
          n: r._count._all,
        })),
        revChannel.map((r) => ({ key: r.channelId ?? '', revenuePaisa: r._sum.totalPaisa ?? 0 })),
      ),
      zone: rows(
        byZone.map((r) => ({
          key: r.zone,
          label: r.zone === 'DHAKA' ? 'Inside Dhaka' : 'Nationwide',
          n: r._count._all,
        })),
        revZone.map((r) => ({ key: r.zone, revenuePaisa: r._sum.totalPaisa ?? 0 })),
      ),
      payment: rows(
        byPayment.map((r) => ({
          key: r.paymentMethod,
          label: r.paymentMethod === PaymentMethod.cod ? 'Cash on delivery' : 'Online',
          n: r._count._all,
        })),
        revPayment.map((r) => ({ key: r.paymentMethod, revenuePaisa: r._sum.totalPaisa ?? 0 })),
      ),
      type: rows(
        byGift.map((r) => ({ key: String(r.isGift), label: r.isGift ? 'Gift' : 'Self', n: r._count._all })),
        revGift.map((r) => ({ key: String(r.isGift), revenuePaisa: r._sum.totalPaisa ?? 0 })),
      ),
      method: rows(
        byMethod.map((r) => ({ key: r.methodLabel ?? '', label: r.methodLabel ?? 'Not set', n: r._count._all })),
        revMethod.map((r) => ({ key: r.methodLabel ?? '', revenuePaisa: r._sum.totalPaisa ?? 0 })),
      ),
      day,
      products: topLines.map((l) => ({
        productId: l.productId,
        /*  the name Product holds TODAY; a line whose product has since been
            deleted falls back to the snapshot on its own newest line  */
        label: (l.productId ? topNames.get(l.productId) : null) ?? 'Removed product',
        qty: l._sum.qty ?? 0,
        revenuePaisa: l._sum.linePaisa ?? 0,
      })),
    };
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
  private async assertBuyable(
    products: {
      id: string;
      name: string;
      stockMode: StockMode;
      stockQty: number;
      supplierId: string | null;
      itemId: string | null;
      soldOutMode: SoldOutMode;
      preorderDate: Date | null;
      /** "Allow order when stock is 0" — the owner's switch (4 Sep 2026) */
      allowOrderAtZero: boolean;
      /** DEC-PRD-014 — with variants, their shelves are the real stock */
      variants?: { id: string; stockQty: number; itemId: string | null }[];
    }[],
    want: Iterable<{ productId: string; variantId?: string | null }>,
  ) {
    /*  Owner, 4 Sep 2026 — Inventory-connected stock is gated at zero exactly
        like a hand box, so this door reads Inventory's live count for every
        linked Item (the product's own, and any variant's) the same way the
        product page does. One query for all of them; milli-units floor to
        whole pieces. Nothing here writes stock.  */
    const linked = [
      ...new Set(
        products.flatMap((p) => [
          ...(p.stockMode === 'TRACKED' && p.itemId ? [p.itemId] : []),
          ...(p.variants ?? []).flatMap((v) => (v.itemId ? [v.itemId] : [])),
        ]),
      ),
    ];
    const sums = linked.length
      ? await this.prisma.db.inventoryStock.groupBy({
          by: ['itemId'],
          where: { itemId: { in: linked } },
          _sum: { qtyMilli: true },
        })
      : [];
    const invQty = new Map(
      sums.map((r) => [r.itemId, Math.max(0, Math.floor((r._sum.qtyMilli ?? 0) / 1000))]),
    );
    const countOf = (v: { itemId: string | null; stockQty: number }) =>
      v.itemId ? (invQty.get(v.itemId) ?? 0) : v.stockQty;

    const byId = new Map(products.map((p) => [p.id, p]));
    const blocked: string[] = [];
    for (const { productId, variantId } of want) {
      const p = byId.get(productId);
      if (!p) continue; // missing products are another check's problem
      const variants = p.variants ?? [];
      /*  R1 (4 Sep 2026) — Preparing judges a variant line against ITS shelf
          (REV-M4), so this door must ask the same shelf, or the shop says yes
          at checkout and no an hour later.  */
      const a = availabilityOf({
        ...p,
        variantStock: variants.length ? variants.map(countOf) : undefined,
        inventoryQty:
          p.stockMode === 'TRACKED' && p.itemId ? (invQty.get(p.itemId) ?? null) : undefined,
      });
      if (!isBuyable(a)) {
        blocked.push(p.name);
        continue;
      }
      if (variantId && p.supplierId === null && !p.allowOrderAtZero) {
        const v = variants.find((x) => x.id === variantId);
        if (v && countOf(v) <= 0) blocked.push(`${p.name} (that option is sold out)`);
      }
    }
    if (blocked.length)
      throw new BadRequestException(
        `out of stock — cannot order: ${blocked.join(', ')}`,
      );
  }

  async create(dto: CreateOrderDto) {
    /*  audit 11 Sep 2026 #29 — every shape check before a single query. See
        the long note at the bottom of order.dto.ts for why these are hand
        written and not class-validator decorators.  */
    validateCreateOrder(dto);
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
        /*  `imageUrl` — the colour's own photo, so a line for the RED one
            carries the red one's picture (owner, 7 Sep 2026: three colours of
            one product all showed the product's first photo).  */
        variants: { where: { deletedAt: null, isActive: true }, select: { id: true, stockQty: true, itemId: true, imageUrl: true } },
        /*  5 Aug — the line's picture snapshot. The `bg` column existed from
            day one but nothing ever wrote it, so the admin and the receipt
            showed a purple placeholder for every order, even with photos
            uploaded.  */
        images: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' as const }, take: 1, select: { url: true } },
      },
    });
    const pMap = new Map(products.map((p) => [p.id, p]));
    /* DEC-PDP-09 — before a single paisa is worked out. Refusing after the
       totals are built would still be correct, but it wastes the offer engine
       and reads as an afterthought in the code. */
    await this.assertBuyable(products, dto.lines.map((l) => ({ productId: l.productId, variantId: l.variantId })));
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

    const actorName = dto.actorName ?? 'Admin';

    /*  The advance taken in hand at the counter or on the phone (audit
        11 Sep 2026 #28). It used to be a SECOND call from the form: create the
        order, then record the payment. When the second call failed the order
        was already there, unpaid and unnoticed, and staff made the whole thing
        again — two orders, one customer. It is now part of the same
        transaction, so either both exist or neither does.  */
    const advance = Math.max(0, Math.round(dto.advancePaisa ?? 0));
    if (advance > totalPaisa)
      throw new BadRequestException(
        `cannot take ${advance} paisa in advance — the order is only ${totalPaisa} paisa`,
      );

    /* REV-OFR-1 — the discount is already baked into totalPaisa above, so the
       redemption rows MUST be written in the SAME transaction as the order.
       Fail-soft (writing after create) would let the discount stand while the
       limit/first-order guard and analytics silently lose the record. */
    const attempt = async (orderNo: string) => this.prisma.db.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          orderNo,
          /*  DELIVERY unless the order is collected — see CreateOrderDto.
              A POS counter sale sets COUNTER on its own path.  */
          fulfillmentType:
            dto.fulfillmentType === 'PICKUP' ? FulfillmentType.PICKUP : FulfillmentType.DELIVERY,
          channel: { connect: { id: dto.channelId } },
          customer: { connect: { id: dto.customerId } },
          /*  টাইপ করা পরিচয়ই রসিদের snapshot; CRM-এর ঘর fallback মাত্র।
              দেখুন CreateOrderDto.senderName-এর নোট (মালিকের রায়, ৩ আগস্ট)।  */
          senderName: dto.senderName?.trim() || customer.name,
          /*  a customer who signed in with Google may not have a number on
              file yet; the one typed on the order is then the only one  */
          senderPhone: dto.senderPhone?.trim() || customer.phone || '',
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
          paymentStatus: advance > 0
            ? this.derivePaymentStatus(method, totalPaisa, advance, 0, 'ADVANCE')
            : PaymentStatus.unpaid,
          paidPaisa: advance,
          duePaisa: Math.max(0, totalPaisa - advance),
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
      /*  the advance, in the same breath as the order (#28)  */
      if (advance > 0) {
        await tx.paymentTransaction.create({
          data: {
            orderId: created.id,
            kind: 'ADVANCE',
            method: dto.advanceMethod ?? method,
            amountPaisa: advance,
            accountId: dto.advanceAccountId ?? null,
            reference: dto.advanceReference,
            note: 'Taken when the order was created',
            actorName,
          } as unknown as Prisma.PaymentTransactionUncheckedCreateInput,
        });
      }
      return created;
    });

    /*  #25 — the number is drawn INSIDE the transaction and the unique index
        is the referee. Three goes at a random number, then a timestamp that
        cannot clash with anything.  */
    let order: Awaited<ReturnType<typeof attempt>> | null = null;
    let orderNo = '';
    for (let i = 0; i < 4 && !order; i++) {
      orderNo = this.candidateOrderNo(i);
      try {
        order = await attempt(orderNo);
      } catch (e) {
        if (i < 3 && this.isOrderNoClash(e)) continue;
        throw e;
      }
    }
    if (!order) throw new ConflictException('Could not allocate an order number — try again');

    await this.audit.record({ entityType: ENTITY, entityId: order.id, action: 'CREATE', actorName });
    await this.event(order.id, 'sales', `Order ${orderNo} placed via ${channel.name}`, actorName);
    if (advance > 0) {
      await this.event(order.id, 'payment', `ADVANCE ${advance} paisa taken when the order was created`, actorName);
      const adv = await this.prisma.db.paymentTransaction.findFirst({
        where: { orderId: order.id, kind: 'ADVANCE' },
        orderBy: { createdAt: 'desc' },
      });
      if (adv) await this.book(order.id, `advance on ${orderNo}`, () => this.finance.onPaymentRecorded(adv.id), actorName);

      /*  (review 11 Sep 2026) THE MESSAGE MUST NOT BE LOST WITH THE SECOND CALL.
          Folding the advance into create (#28) removed the `addPayment` call
          the form used to make — and with it the two things addPayment does
          after the money lands: the confirmation for a PREPAID order that is
          now fully paid, and the "this much cleared, this much still due"
          note for a part payment. Same conditions as addPayment, same
          idempotency (the unique index on the message row), so a counter sale
          paid in full still reaches the customer.  */
      const prepaid = method !== PaymentMethod.cod;
      if (prepaid && advance >= totalPaisa) {
        void this.orderMessages
          .queueConfirmation(order.id, false)
          .then(() => this.orderMessages.sendDue(5))
          .catch(() => undefined);
      } else if (advance < totalPaisa) {
        void this.orderMessages
          .queue(order.id, OrderMessageKind.PAYMENT_RECEIVED, { attempt: 1 })
          .then(() => this.orderMessages.sendDue(5))
          .catch(() => undefined);
      }
    }

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
    const updated = await this.prisma.db.$transaction(async (tx) => {
      // DEC-SAL-016 — the moment, not just the state · R4 — one winner
      await this.claim(tx, id, { salesStatus: SalesStatus.placed }, { salesStatus: SalesStatus.confirmed, confirmedAt: new Date() });
      return tx.order.findUniqueOrThrow({ where: { id }, include: FULL_INCLUDE });
    });
    await this.event(id, 'sales', `Order confirmed`, actorName);

    /*  ═══ THE CUSTOMER IS TOLD — owner, 9 Sep 2026 ═══════════════════════

        This step changed the status, wrote a timeline entry, took the
        workshop's hours, and said NOTHING to the person waiting. His list of
        when a message goes: *"order approved hole jabe."*

        Fail-soft and unwaited, like every message on this path: a message
        that will not send must never make an order impossible to confirm.  */
    void this.orderMessages
      .queue(id, OrderMessageKind.ORDER_APPROVED)
      .then(() => this.orderMessages.sendDue(5))
      .catch(() => undefined);

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
    const { pMap, vMap } = await this.stockContext(lines);

    /*
      DEC-PRD-014 — WHICH SHELF THE STOCK COMES OFF, fixed 3 Aug 2026.

      A product with variants keeps its truth in the variants' own `stockQty`;
      the product row is just the sum every screen displays. This method used
      to decrement the PRODUCT row regardless — caught live: a Red Roses order
      went all the way to delivered and the shop still showed 20 in stock,
      because the variant's 20 was never touched and the displays sum variants.
      Sold for ever, deducted never.
    */
    this.assertLineStock(lines, pMap, vMap);

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
      /*  R4 — take the step BEFORE touching a single shelf. If another
          request already took it, this one stops here and no stock moves.  */
      await this.claim(
        tx, id,
        { salesStatus: SalesStatus.confirmed, deliveryStatus: DeliveryStatus.unassigned },
        // DEC-SAL-016 — the moment, not just the state
        { deliveryStatus: DeliveryStatus.preparing, preparingAt: new Date() },
      );
      await this.deductStock(tx, lines, pMap, vMap);
      return tx.order.findUniqueOrThrow({ where: { id }, include: FULL_INCLUDE });
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

  async outForDelivery(id: string, actorName = 'Admin', opts: { viaAssignmentId?: string } = {}) {
    const o = await this.get(id);
    await this.assertNotOutrunningDelivery(id, 'out', opts.viaAssignmentId); // R5
    /*  REV-M1: a failed delivery is a retry, not a dead end — the parcel is
        already made and stock is already committed, so it can go out again.

        DEC-DLV-021: and an order ALREADY out for delivery may go out again
        too, because the carrier can change mid-journey. This used to throw,
        which made the swap a dead end: Delivery would accept the new rider and
        then refuse to let him leave, and the only way through was to fail the
        delivery first — the very thing the owner said must not count against
        anyone.  */
    const swapping = o.deliveryStatus === DeliveryStatus.out_for_delivery;
    if (
      o.deliveryStatus !== DeliveryStatus.preparing &&
      o.deliveryStatus !== DeliveryStatus.failed &&
      !swapping
    )
      throw new BadRequestException('order must be preparing (or a failed delivery) before out-for-delivery');
    /*  TWO GATES BEFORE THE DOOR (owner, 10 Sep 2026).

        1. A carrier. Nothing leaves the shop without somebody carrying it —
           an own rider, a courier, or a one-time rider typed on the order.
           The assignment is what the board, the settle sheet and the COD
           reconciliation all read; an order that went out without one was
           invisible to every one of them.
        2. The customer's photograph, when they ticked "photo updates" at
           checkout. That tick is a promise: they see the gift before it
           goes. A PREP photo on the order is the proof the promise was kept;
           whether the message reached them is a courtesy and never blocks.
        The global prep-photo switch (DEC-DLV-020) is still honoured on the
        assignment path; this is the customer's own ask, checked on both.  */
    if (!swapping) {
      const carrier = opts.viaAssignmentId
        ? { id: opts.viaAssignmentId }
        : await this.prisma.db.deliveryAssignment.findFirst({
            where: { orderId: id, isActive: true, deletedAt: null, status: 'ASSIGNED' },
            select: { id: true },
          });
      if (!carrier) throw new BadRequestException('Assign a carrier first — own rider, courier or a one-time rider');
      if (o.photoUpdates) {
        const prep = await this.prisma.db.orderPhoto.count({ where: { orderId: id, kind: 'PREP', deletedAt: null } });
        if (prep === 0) throw new BadRequestException('The customer asked for a photo before delivery — add one on the order first');
      }
    }
    if (o.deliveryStatus === DeliveryStatus.failed) await this.event(id, 'delivery', `Retrying delivery`, actorName);
    const updated = await this.prisma.db.$transaction(async (tx) => {
      // R4 — one winner: the state read above must still be the state on the row
      await this.claim(
        tx, id,
        { deliveryStatus: o.deliveryStatus },
        {
          deliveryStatus: DeliveryStatus.out_for_delivery,
          /*  DEC-SAL-016 — the FIRST time it left, kept through a retry. A
              second attempt after a failure must not erase how long this parcel
              has really been on the road.  */
          ...(o.outForDeliveryAt ? {} : { outForDeliveryAt: new Date() }),
        },
      );
      return tx.order.findUniqueOrThrow({ where: { id }, include: FULL_INCLUDE });
    });
    await this.event(id, 'delivery', swapping ? `Back on the road with the new carrier` : `Out for delivery`, actorName);
    /*  Queued, so the order page can show whether the customer was told.

        ⚠️ NOT ON A SWAP. "Your order is on its way" is true once. Sending it
        again because the parcel changed hands tells the customer nothing they
        did not know and reads like the shop lost track of their flowers.  */
    if (!swapping) {
      void this.orderMessages
        .queue(id, OrderMessageKind.ORDER_OUT_FOR_DELIVERY)
        .then(() => this.orderMessages.sendDue(5))
        .catch(() => undefined);
    }
    return this.shape(updated);
  }

  // delivered → salesCount +1, Customer LTV/ordersCount +1 (locked §4)। cancel-before-delivered = গোনা হয় না।
  async delivered(id: string, actorName = 'Admin', opts: { viaAssignmentId?: string } = {}) {
    const o = await this.get(id);
    if (o.deliveryStatus !== DeliveryStatus.out_for_delivery)
      throw new BadRequestException('order must be out-for-delivery before delivered');
    await this.assertNotOutrunningDelivery(id, 'delivered', opts.viaAssignmentId); // R5

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
      /*  R4 — take the step FIRST. A second "delivered" arriving together
          with this one stops here, before it can book the cash twice.  */
      await this.claim(
        tx, id,
        { deliveryStatus: DeliveryStatus.out_for_delivery },
        { deliveryStatus: DeliveryStatus.delivered, salesStatus: SalesStatus.completed, deliveredAt: new Date() },
      );
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
          // status + deliveredAt (DEC-SAL-016) were claimed at the top of this transaction (R4)
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

  /**
   * A delivery that did not happen — audit 11 Sep 2026 #19.
   *
   * ⚠️ THE SCREEN HAS ALWAYS ASKED THREE QUESTIONS AND THIS TOOK NONE OF THEM.
   * Why it failed, the note somebody typed, and what staff decided (retry,
   * keep, cancel) were all sent and all dropped on the floor; "Cancel order"
   * in particular did nothing whatsoever unless a delivery assignment happened
   * to exist to carry the decision instead. Somebody pressed Cancel, the box
   * closed, the order stayed open, and nobody found out until the parcel was
   * chased a day later.
   *
   * All three are stored now, and CANCEL runs the real `cancel()` — the same
   * refund ladder, the same stock revert, the same assignment stand-down. The
   * decision is recorded on the order EVEN when it is CANCEL, so the timeline
   * reads "failed, then cancelled" rather than only the second half.
   */
  async failDelivery(id: string, actorName = 'Admin', dto: FailOrderDto = {}) {
    const o = await this.get(id);
    if (o.deliveryStatus !== DeliveryStatus.preparing && o.deliveryStatus !== DeliveryStatus.out_for_delivery)
      throw new BadRequestException('only a preparing/out-for-delivery order can fail');
    validateFailOrder(dto);
    /*  No decision sent means nobody has decided yet — NOT "keep". Delivery's
        own fail path calls this without one (it records the decision on the
        assignment, which is the attempt the decision is about), and writing
        KEEP here would have the order contradict it.  */
    const decision: FailDecision | null = dto.decision ?? null;

    /*  A reason picked from the list is snapshotted by LABEL, the way the
        assignment does it (DEC-DLV-022) — renaming a reason later must not
        rewrite what this order says happened.  */
    let reasonLabel = dto.reason?.trim() || '';
    if (dto.failReasonId) {
      const r = await this.prisma.db.reasonMaster.findFirst({
        where: { id: dto.failReasonId }, select: { label: true },
      });
      if (!r) throw new BadRequestException('That reason is no longer on the list — pick another.');
      reasonLabel = [r.label, dto.reason?.trim()].filter(Boolean).join(' - ');
    }

    const updated = await this.prisma.db.$transaction(async (tx) => {
      // R4 — one winner: the state read above must still be the state on the row
      await this.claim(
        tx, id,
        { deliveryStatus: o.deliveryStatus },
        {
          deliveryStatus: DeliveryStatus.failed,
          failReason: reasonLabel || null,
          failNote: dto.note?.trim() || null,
          ...(decision ? { failDecision: decision } : {}),
        },
      );
      return tx.order.findUniqueOrThrow({ where: { id }, include: FULL_INCLUDE });
    });
    await this.event(
      id, 'delivery',
      `Delivery failed${reasonLabel ? ` - ${reasonLabel}` : ''}`,
      actorName,
      [dto.note?.trim(), decision ? `decision: ${decision.toLowerCase()}` : null].filter(Boolean).join(' | ') || undefined,
    );

    /*  The decision is APPLIED, not merely filed. RETRY and KEEP both leave
        the order failed and waiting — the difference is what the board says
        about it — so only CANCEL has anything more to do.  */
    if (decision === 'CANCEL') {
      return this.cancel(id, {
        reason: reasonLabel ? `Delivery failed - ${reasonLabel}` : 'Delivery failed',
        actorName,
      });
    }
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
    /** how many live carrier assignments this cancel stood down (audit #22) */
    let cancelledAssignments = 0;

    /*  DEC-SAL-013 — the ORDER decided the number; the lines carry their share
        of it so the receipt still adds up. Shared out by each line's value,
        with the rounding remainder given to the last line rather than lost.  */
    const orderNet = lines.reduce((s, l) => s + (l.linePaisa - l.discountPaisa), 0);
    const stageNote =
      refundPct >= 100 ? 'Cancelled before the workshop started'
        : refundPct > 0 ? `Cancelled after it was made — ${refundPct}% of what was paid`
          : 'Cancelled after the rider left — nothing refundable';

    /*  REV-C1 — never refund money that was never collected. Since DEC-SAL-013
        the entitlement is already a share OF `collected`, so this can no
        longer exceed it; the cap stays as the belt to that braces. A COD order
        cancelled before anyone paid refunds 0, which is the owner's own
        answer to that exact case.  */
    const payout = Math.min(entitlement, collected);
    const newRefund = o.refundPaisa + payout;
    const payStatus: PaymentStatus =
      o.paidPaisa > 0 && newRefund >= o.paidPaisa ? PaymentStatus.refunded
      : newRefund > 0 ? PaymentStatus.partially_refunded
      : o.paymentStatus;

    /*  ═══ ONE TRANSACTION, ONE WINNER — audit 11 Sep 2026 #9 ═══════════════
        Cancelling used to be five separate writes with no claim in front of
        them. A double-click ran the whole thing twice: two REFUND rows in the
        ledger, the stock put back on the shelf twice, and `refundPaisa` set to
        `o.refundPaisa + payout` from a row read before either request started
        — so the customer was recorded as refunded twice for money that left
        the till once.

        The claim is first and it is the cancel itself: `salesStatus` goes to
        cancelled only from a status that is neither cancelled nor completed.
        The loser of a race gets count 0 and the whole transaction unwinds —
        no refund row, no stock, no assignment change.  */
    let totalRefund = 0;
    const refundTxnId = await this.prisma.db.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: {
          id,
          salesStatus: { notIn: [SalesStatus.cancelled, SalesStatus.completed] },
        },
        data: {
          salesStatus: SalesStatus.cancelled,
          cancelledAt: new Date(), // DEC-SAL-016
          deliveryStatus: preparingStarted ? DeliveryStatus.stock_reverted : o.deliveryStatus,
          refundPaisa: newRefund,
          duePaisa: 0, // a cancelled order collects nothing more
          paymentStatus: payStatus,
        },
      });
      if (claimed.count !== 1)
        throw new ConflictException('This order has already been cancelled — reload the page.');

      /*  Audit #22 (agent A's request) — the parcel stops being live in the
          same breath. Left active, a cancelled order kept showing on the
          delivery board, counted against its rider, and blocked "remove
          rider" for ever. SWAPPED would be a lie (nobody finished it), so
          CANCELLED it is.  */
      const stood = await tx.deliveryAssignment.updateMany({
        where: { orderId: id, isActive: true, deletedAt: null },
        data: {
          isActive: false,
          status: AssignmentStatus.CANCELLED,
          note: `Order cancelled${dto.reason ? ` — ${dto.reason}` : ''}`,
        },
      });
      if (stood.count > 0) cancelledAssignments = stood.count;

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

      /*  the refund row belongs INSIDE the claim, or a losing second click
          writes a second one against an order that is already cancelled  */
      if (payout > 0) {
        const refundTxn = await tx.paymentTransaction.create({
          data: { orderId: id, kind: 'REFUND', method: o.paymentMethod, amountPaisa: payout, note: 'Cancellation per-line refund', actorName },
        });
        return refundTxn.id;
      }
      return null;
    });

    if (refundTxnId) {
      await this.book(id, `cancellation refund on ${o.orderNo}`, () => this.finance.onPaymentRecorded(refundTxnId), actorName);
    }
    if (cancelledAssignments > 0) {
      await this.event(id, 'delivery', `${cancelledAssignments} carrier assignment(s) cancelled with the order`, actorName);
    }
    if (entitlement > payout) {
      await this.event(
        id, 'payment',
        `No money to refund — ${entitlement} paisa was owed back but only ${collected} paisa had been collected`,
        actorName,
      );
    }
    const totalRefundApplied = payout;
    const updated = await this.prisma.db.order.findUniqueOrThrow({ where: { id }, include: FULL_INCLUDE });
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
    validateAddPayment(dto);
    const actorName = dto.actorName ?? 'Admin';
    const method = dto.method ?? o.paymentMethod;
    const collected = o.paidPaisa - o.refundPaisa;

    /*  ═══ WHAT KIND OF MOVEMENT IS THIS, IF NOBODY SAID? ═══════════════════
        audit 11 Sep 2026 #13.

        The screen defaulted every money movement to COD_COLLECTED, including
        on an online order where no rider ever collects anything, and including
        a part payment that leaves a balance — the order then read "COD
        collected" with money still due, which is a sentence that cannot be
        true. `derivePaymentStatus` takes COD_COLLECTED at its word, so that
        wrong kind became a wrong payment STATUS on the order.

        The method decides, not the form:
          · online / gateway  -> PAYMENT
          · cash on a COD order that settles the bill -> COD_COLLECTED
          · cash on a COD order that does not         -> PAYMENT (a part payment)
        Nothing is invented: ADVANCE, PAYMENT, COD_COLLECTED and REFUND are the
        four kinds the enum has always had.  */
    /*  ⚠️ RESOLVE THE AMOUNT FIRST, THEN NAME THE KIND (review 11 Sep 2026).
        The first version asked "does this settle the bill?" using the TYPED
        amount, which is 0 when the box is left empty — and then defaulted the
        empty box to the whole outstanding balance. So "Record" with an empty
        box on a COD order filed a PAYMENT on money that demonstrably closed
        the bill: exactly the wrong label this change set out to remove.

        An empty refund amount means "give back what we are holding", never
        "give back what is still owed" — the due is money coming IN.  */
    const typed = Math.max(0, Math.round(dto.amountPaisa ?? 0));
    const amountPaisa =
      typed > 0
        ? typed
        : dto.kind === 'REFUND'
          ? Math.max(0, collected)
          : Math.max(0, o.totalPaisa - collected);
    const settlesTheBill = collected + amountPaisa >= o.totalPaisa;
    const kind: PaymentTxnKind =
      dto.kind ??
      (method === PaymentMethod.cod && settlesTheBill ? 'COD_COLLECTED' : 'PAYMENT');
    /*  A COD_COLLECTED that does NOT settle the bill is a part payment
        however it was typed — the label is corrected rather than refused, so
        nobody has to know the enum to record cash that came in.  */
    const effectiveKind: PaymentTxnKind =
      kind === 'COD_COLLECTED' && !settlesTheBill ? 'PAYMENT' : kind;
    if (!amountPaisa || amountPaisa <= 0) throw new BadRequestException('amountPaisa must be > 0');

    /* REV-M8: a double click must not create money.
       · collection can never exceed what is still outstanding
       · a refund can never exceed what is actually in hand */
    if (effectiveKind === 'REFUND') {
      if (amountPaisa > collected)
        throw new BadRequestException(`cannot refund ${amountPaisa} paisa — only ${Math.max(0, collected)} paisa was collected`);
    } else {
      const outstanding = Math.max(0, o.totalPaisa - collected);
      if (outstanding === 0) throw new BadRequestException('nothing is outstanding on this order');
      if (amountPaisa > outstanding)
        throw new BadRequestException(`cannot collect ${amountPaisa} paisa — only ${outstanding} paisa is outstanding`);
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
        data: {
          orderId: id,
          kind: effectiveKind,
          method,
          amountPaisa,
          /*  DEC-GBL-006 — the column was added on 21 Aug and this call site
              never wrote it, so every order payment landed in the method's
              default account regardless of which bKash number actually took
              it. Passed through now; still optional, because a method with a
              single account has nothing to ask.  */
          accountId: dto.accountId ?? null,
          /*  DEC-FIN-029 — the gateway's cut, straight from the gateway's own
              answer. Null when it did not say (see `gatewayFee`).

              ⚠️ Cast until the local Prisma client is regenerated — the same
              shape `checkout.ts` uses for `deliveryBlackout`. `BUILD_CHECK.bat`
              regenerates on the host and the cast becomes redundant, not
              wrong.  */
          feePaisa: dto.feePaisa ?? null,
          reference: dto.reference,
          note: dto.note,
          actorName,
        } as unknown as Prisma.PaymentTransactionUncheckedCreateInput,
      });

      const bumped = await tx.order.update({
        where: { id },
        data: effectiveKind === 'REFUND'
          ? { refundPaisa: { increment: amountPaisa } }
          : { paidPaisa: { increment: amountPaisa } },
        select: { totalPaisa: true, paidPaisa: true, refundPaisa: true, paymentMethod: true },
      });

      const due = Math.max(0, bumped.totalPaisa - bumped.paidPaisa);
      const status = this.derivePaymentStatus(
        bumped.paymentMethod, bumped.totalPaisa, bumped.paidPaisa, bumped.refundPaisa, effectiveKind,
      );
      const settled = await tx.order.update({
        where: { id },
        data: { duePaisa: due, paymentStatus: status },
        include: FULL_INCLUDE,
      });
      return { txn: created, updated: settled };
    });

    await this.book(id, `${effectiveKind} on ${o.orderNo}`, () => this.finance.onPaymentRecorded(txn.id), actorName);
    await this.event(id, 'payment', `${effectiveKind} ${amountPaisa} paisa via ${method}`, actorName);

    /*
      ═══ MONEY IN, ORDER CONFIRMED — owner, 9 Sep 2026 ═══

      A prepaid order says nothing to the customer until it is paid (see
      `shop/checkout.ts`). The gateway queues the confirmation itself, but the
      gateway is not the only way money arrives: the shop takes a bKash send
      by hand, or records a bank transfer on the order screen. Without this,
      that customer would be waiting for a confirmation that never comes.

      ⚠️ NOT FOR COD. A cash-on-delivery order was confirmed at checkout —
      there was nothing to wait for — and the rider handing over the parcel is
      what triggers `addPayment` there. Confirming again at that moment would
      tell someone holding their flowers that their order is placed.

      ⚠️ Only when the bill is fully settled, and never on a refund. Idempotent
      through the unique index, so the gateway's own queue and this one cannot
      both send.
    */
    const settledNow = updated.paidPaisa - updated.refundPaisa;

    if (
      effectiveKind !== 'REFUND' &&
      updated.paymentMethod !== PaymentMethod.cod &&
      settledNow >= updated.totalPaisa
    ) {
      void this.orderMessages
        .queueConfirmation(id, false)
        .then(() => this.orderMessages.sendDue(5))
        .catch(() => undefined);
    }

    /*  ═══ PART PAYMENT SAYS WHAT IS LEFT — owner, 9 Sep 2026 ═══════════════

        > *"jodi kono ta particular payment dey tahole particular amount clear
        >  kre due ta bole setaw sms jabe."*

        Money that does not settle the bill said nothing at all before. It now
        sends what has been cleared and what is still owed — the two numbers
        the customer would otherwise ring up to ask for.

        ⚠️ `attempt` COUNTS THE PAYMENTS, not the retries. Every other kind is
        once per order and the unique index on (orderId, kind, attempt) is what
        enforces it; a bill can be paid in three instalments, and each one has
        something new to say. The amounts themselves are read at SEND time from
        the order, so a second payment landing while the first message waits
        cannot send a stale figure.  */
    if (effectiveKind !== 'REFUND' && settledNow > 0 && settledNow < updated.totalPaisa) {
      void this.prisma.db.orderMessage
        .count({ where: { orderId: id, kind: OrderMessageKind.PAYMENT_RECEIVED } })
        .then((n) =>
          this.orderMessages.queue(id, OrderMessageKind.PAYMENT_RECEIVED, { attempt: n + 1 }),
        )
        .then(() => this.orderMessages.sendDue(5))
        .catch(() => undefined);
    }

    return this.shape(updated);
  }

  /*  `assignCourier` LEFT THIS FILE — Phase 6, 30 Aug 2026. It wrote courier
      fields straight onto the Order with no DeliveryAssignment, so Delivery
      never saw the parcel. Carrier hand-off now lives only in
      DeliveryService.assign() (POST /delivery/assignments), which mirrors the
      legacy Order courier fields itself (DEC-DLV-006). */

  // proof photo — Delivery-owned; Sales only records and shows it
  async addPhoto(id: string, dto: AddPhotoDto) {
    const o = await this.get(id);
    const actorName = dto.actorName ?? 'Delivery';
    const photo = await this.prisma.db.orderPhoto.create({
      data: { orderId: id, kind: dto.kind, url: dto.url, bg: dto.bg, caption: dto.caption, capturedBy: dto.capturedBy ?? actorName },
    });
    await this.event(id, 'delivery', `${dto.kind} photo added`, actorName);
    /*  Owner, 10 Sep 2026: a PREP photo on an order whose customer ticked
        "photo updates" goes to them the moment it is saved — WhatsApp first,
        email when the number has no WhatsApp, and it is on their account
        either way (the storefront reads OrderPhoto). Queued and swept like
        every other message, so a send that fails is on the order's message
        log with its reason, and the photo itself is never lost.  */
    /*  The DELIVERY photo goes the same road once the parcel is handed over
        (owner, 10 Sep 2026) — same tick, same doors, its own template.  */
    if ((dto.kind === 'PREP' || dto.kind === 'DELIVERY') && o.photoUpdates && dto.url) {
      const kind = dto.kind === 'PREP' ? OrderMessageKind.PHOTO_UPDATE : OrderMessageKind.DELIVERY_PHOTO;
      void this.orderMessages
        .queue(id, kind, { repeat: true })
        .then(() => this.orderMessages.sendDue(5))
        .catch(() => undefined);
    }
    return photo;
  }

  /* ---------------- edit (guardrails) ---------------- */

  async edit(id: string, dto: EditOrderDto) {
    validateEditOrder(dto); // audit 11 Sep 2026 #29
    const o = await this.get(id);
    const gate = this.editableFields(o);
    const actorName = dto.actorName ?? 'Admin';

    const recipientTouched =
      dto.recipientName !== undefined ||
      dto.recipientPhone !== undefined ||
      dto.giftMessage !== undefined;
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

    /*  Photo updates are a MESSAGING choice, not a recipient detail (8 Sep
        2026). Hung on the recipient gate for an afternoon, it was refused with
        "recipient locked at this stage" on every order past preparing — which
        is precisely when the prep photo is taken and somebody wants to say
        "don't send this one". It stays open as long as the order is open.  */
    if (!gate.notes && dto.photoUpdates !== undefined)
      throw new BadRequestException('order is closed — photo updates cannot be changed');

    /*  ═══ VALIDATE EVERYTHING, THEN APPLY ONCE — audit 11 Sep 2026 #10 ═══

        This method used to write as it walked: it soft-deleted the removed
        lines, THEN checked the added ones, THEN created them, THEN re-checked
        the COD rule, and every one of those was its own statement outside any
        transaction. Three ways that hurt:

          · a save that removed both lines and added one the shop no longer
            sells left an order with NO items at all — the "keep at least one"
            check had already passed on a promise the next step broke
          · the COD rule was tested AFTER the offending line was already on the
            order, so the refusal left the thing it refused behind
          · an added line on an order past Preparing deducted the PRODUCT row
            only, never the variant's shelf and never its add-ons — and
            `cancel()` then put back what had never been taken

        So: nothing is written until every question has been answered, and then
        it is all written together. `deductStock` is the SAME code `startPreparing`
        runs, not a second copy of it.  */

    const live = await this.prisma.db.orderLine.findMany({ where: { orderId: id, deletedAt: null } });
    const liveById = new Map(live.map((l) => [l.id, l]));

    /*  The slot and method have to be REAL (audit 11 Sep 2026 #29) — a
        connect on a missing id is a 500 with a Prisma sentence in it, and a
        screen that lets somebody type one deserves a plain refusal.  */
    if (dto.deliverySlotId) {
      const slot = await this.prisma.db.deliverySlot.findFirst({ where: { id: dto.deliverySlotId }, select: { id: true } });
      if (!slot) throw new BadRequestException('That delivery slot no longer exists - pick one from the list.');
    }
    if (dto.deliveryMethodId) {
      const m = await this.prisma.db.deliveryMethod.findFirst({ where: { id: dto.deliveryMethodId }, select: { id: true } });
      if (!m) throw new BadRequestException('That delivery method no longer exists - pick one from the list.');
    }

    /* ---- removals ---- */
    const removeIds = dto.removeLineIds ?? [];
    for (const rid of removeIds) {
      if (!liveById.has(rid)) throw new BadRequestException(`line ${rid} is not on this order`);
    }
    const keptCount = live.filter((l) => !removeIds.includes(l.id)).length + (dto.addLines?.length ?? 0);
    if (keptCount < 1)
      throw new BadRequestException('an order must keep at least one item — cancel it instead');

    /* ---- quantities ---- */
    for (const q of dto.lineQty ?? []) {
      if (!q.qty || q.qty < 1) throw new BadRequestException('line qty must be >= 1');
      if (!liveById.has(q.lineId)) throw new BadRequestException(`line ${q.lineId} not found`);
      if (removeIds.includes(q.lineId))
        throw new BadRequestException('a line cannot be re-quantified and removed in the same save');
    }
    /** the quantity each surviving line will have once this save lands */
    const qtyAfter = (lineId: string) =>
      (dto.lineQty ?? []).find((q) => q.lineId === lineId)?.qty ?? liveById.get(lineId)?.qty ?? 0;

    /* ---- added lines ---- */
    let addData: Prisma.OrderLineCreateWithoutOrderInput[] = [];
    let addStock: { pMap: Map<string, { id: string; name: string; stockMode: StockMode; stockQty: number }>; vMap: Map<string, { stockQty: number }> } | null = null;
    const committed =
      o.deliveryStatus === DeliveryStatus.preparing || o.deliveryStatus === DeliveryStatus.out_for_delivery;
    const addShape = (dto.addLines ?? []).map((l) => ({
      productId: l.productId,
      variantId: l.variantId ?? null,
      name: '',
      variantLabel: l.variantLabel ?? null,
      qty: l.qty,
      addonIds: l.addonIds ?? [],
    }));

    if (dto.addLines?.length) {
      const products = await this.prisma.db.product.findMany({
        where: { id: { in: dto.addLines.map((l) => l.productId) } },
        /*  DEC-PRD-014 — same as `create` above, for the same reason; the
            picture snapshot too.  */
        include: {
          variants: { where: { deletedAt: null, isActive: true }, select: { id: true, stockQty: true, itemId: true } },
          images: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' as const }, take: 1, select: { url: true } },
        },
      });
      const pMap = new Map(products.map((p) => [p.id, p]));
      /* DEC-PDP-09 — the second door into an order. Gating `create` alone
         would mean a sold-out item cannot start an order but can be added to
         one a minute later. */
      await this.assertBuyable(products, dto.addLines.map((l) => ({ productId: l.productId, variantId: l.variantId })));
      /*  মালিকের রায়, ৪ আগস্ট ২০২৬ — add-on-ও বিক্রির জিনিস। Checked at this
          door too, BEFORE anything is created (it used not to be checked here
          at all).  */
      await this.assertAddonsInStock(dto.addLines);

      /* REV-C3: the COD rule was only checked at create, so an edit could smuggle
         a crafted / advance-required product into a cash-on-delivery order and
         break the locked rule. Re-checked here — and now BEFORE the line exists,
         so a refusal does not leave the offending item on the order. */
      if (o.paymentMethod === PaymentMethod.cod) {
        /*  Staff read these, not customers — but plain words cost nothing and a
            section number explains nothing to anybody. DEC-PAY-001.

            ⚠️ The CRAFTED check that stood here is gone (DEC-SAL-015) — it has to
            match `assertCodAllowed`, and a rule enforced in two places is a rule
            that will disagree with itself.  */
        const badAdvance = products.find((p) => p.advanceRequired);
        if (badAdvance)
          throw new BadRequestException(
            `\u201c${badAdvance.name}\u201d needs advance payment, so it cannot be added to a Cash on Delivery order.`,
          );
      }

      addData = dto.addLines.map((l) => this.buildLine(l, pMap));
      for (const [i, l] of dto.addLines.entries()) addShape[i].name = pMap.get(l.productId)?.name ?? '';

      /* AUD-1 — if stock is ALREADY committed (order past Preparing), a newly
         added line must deduct its stock NOW. Otherwise cancel() would revert a
         line that was never deducted -> phantom stock created out of nothing.
         Same shelves, same add-ons, same shortage message as startPreparing. */
      if (committed) {
        const ctx = await this.stockContext(addShape);
        this.assertLineStock(addShape, ctx.pMap, ctx.vMap);
        addStock = ctx;
      }
    }

    /* ---- per-line discounts (money edit open until close) — raw unit price rewrite নয় ---- */
    for (const d of dto.lineDiscounts ?? []) {
      const line = liveById.get(d.lineId);
      if (!line) throw new BadRequestException(`line ${d.lineId} not found`);
      if (removeIds.includes(d.lineId)) continue; // a removed line's discount is moot
      const ceiling = line.unitPaisa * qtyAfter(d.lineId);
      if (d.discountPaisa < 0 || d.discountPaisa > ceiling)
        throw new BadRequestException('line discount out of range');
    }

    /* ---- add-ons attached to an existing item (audit 11 Sep 2026) ---- */
    let addonPlan: { lineId: string; addonIds: string[]; addonLabels: string[]; newIds: string[]; qty: number }[] = [];
    if (dto.lineAddons?.length) {
      if (!gate.notes) throw new BadRequestException('order is closed — add-ons cannot be changed');
      const wantedIds = [...new Set(dto.lineAddons.flatMap((a) => a.addonIds))];
      const rows = wantedIds.length
        ? await this.prisma.db.addOn.findMany({
            where: { id: { in: wantedIds } },
            select: { id: true, name: true, stockQty: true, isActive: true },
          })
        : [];
      const byId = new Map(rows.map((r) => [r.id, r]));
      for (const a of dto.lineAddons) {
        const line = liveById.get(a.lineId);
        if (!line) throw new BadRequestException(`line ${a.lineId} not found`);
        if (removeIds.includes(a.lineId)) continue;
        const have = line.addonIds ?? [];
        /*  only what is genuinely NEW on this line costs stock; re-sending the
            same list must not take the card off the shelf a second time  */
        const newIds = a.addonIds.filter((x) => !have.includes(x));
        for (const x of newIds) {
          const r = byId.get(x);
          if (!r || !r.isActive) throw new BadRequestException('that add-on is no longer offered');
        }
        addonPlan.push({
          lineId: a.lineId,
          addonIds: [...have, ...newIds],
          addonLabels: [...(line.addonLabels ?? []), ...newIds.map((x) => byId.get(x)!.name)],
          newIds,
          qty: qtyAfter(a.lineId),
        });
      }
      /*  the same door every other add-on goes through (owner, 4 Aug 2026):
          not in stock, not sold  */
      await this.assertAddonsInStock(
        addonPlan.map((pl) => ({ addonIds: pl.newIds, qty: pl.qty })),
      );
    }

    /* ═══ every question answered — now write, once ═══ */
    await this.prisma.db.$transaction(async (tx) => {
      if (removeIds.length) {
        await tx.orderLine.updateMany({
          where: { id: { in: removeIds }, orderId: id },
          data: { deletedAt: new Date() },
        });
      }
      for (const q of dto.lineQty ?? []) {
        const line = liveById.get(q.lineId)!;
        const linePaisa = line.unitPaisa * q.qty;
        await tx.orderLine.update({
          where: { id: q.lineId },
          data: { qty: q.qty, linePaisa, discountPaisa: Math.min(line.discountPaisa, linePaisa) },
        });
      }
      for (const data of addData) {
        await tx.orderLine.create({ data: { ...data, order: { connect: { id } } } });
      }
      if (addStock) await this.deductStock(tx, addShape, addStock.pMap, addStock.vMap);
      for (const pl of addonPlan) {
        await tx.orderLine.update({
          where: { id: pl.lineId },
          data: { addonIds: pl.addonIds, addonLabels: pl.addonLabels },
        });
        /*  stock only when this order has already taken its stock. Before
            Preparing the whole order is deducted later and the add-on goes
            with it; deducting twice is the phantom-stock bug in reverse.  */
        if (committed && pl.newIds.length) {
          await this.deductStock(tx, [{ productId: null, qty: pl.qty, addonIds: pl.newIds }], new Map(), new Map());
        }
      }
      for (const d of dto.lineDiscounts ?? []) {
        if (removeIds.includes(d.lineId)) continue;
        await tx.orderLine.update({ where: { id: d.lineId }, data: { discountPaisa: d.discountPaisa } });
      }
      await tx.order.update({
        where: { id },
        data: {
          recipientName: dto.recipientName,
          recipientPhone: dto.recipientPhone,
          giftMessage: dto.giftMessage,
          photoUpdates: dto.photoUpdates,
          address: dto.address,
          deliveryNotes: dto.deliveryNotes,
          methodLabel: dto.methodLabel,
          date: dto.date,
          slotLabel: dto.slotLabel,
          internalNote: dto.internalNote,
          /*  ⚠️ `undefined` MEANS "LEAVE IT ALONE" AND MUST STAY THAT WAY
              (audit 11 Sep 2026 #8). Prisma skips an undefined field, which is
              exactly the behaviour the Edit screen needs: it only sends
              `adjustmentPaisa` when somebody actually touched the charges
              block. Never coalesce this to 0 — that is what wiped a retry fare
              or a goodwill adjustment on every unrelated save.  */
          adjustmentPaisa: dto.adjustmentPaisa,
          deliveryPaisa: dto.deliveryPaisa,
          /*  DEC-DLV-002 — the FK moves with the label when the screen sends
              it. Typed-in slot text used to leave `deliverySlotId` pointing at
              the OLD slot, so the overview counted the parcel under a slot it
              was no longer in and a typo grew a phantom slot card.  */
          ...(dto.deliveryMethodId !== undefined
            ? { deliveryMethod: dto.deliveryMethodId ? { connect: { id: dto.deliveryMethodId } } : { disconnect: true } }
            : {}),
          ...(dto.deliverySlotId !== undefined
            ? { deliverySlot: dto.deliverySlotId ? { connect: { id: dto.deliverySlotId } } : { disconnect: true } }
            : {}),
          /* DEC-INT-003(a) — if the customer moves the delivery, the promise moves with
             it, or on-time is measured against a date nobody agreed to any more.
             Only recomputed when one of the two halves was actually sent: `undefined`
             leaves the frozen promise alone, which is what a note-only edit should do. */
          ...(dto.date !== undefined || dto.slotLabel !== undefined
            ? { promisedBy: resolvePromisedBy(dto.date ?? o.date, dto.slotLabel ?? o.slotLabel) }
            : {}),
        },
      });
    });

    for (const pl of addonPlan) {
      if (!pl.newIds.length) continue;
      await this.event(id, 'sales', `${pl.newIds.length} add-on(s) added to an item`, actorName, committed ? 'stock taken now' : 'stock comes off at Preparing');
    }
    if (removeIds.length) await this.event(id, 'sales', `${removeIds.length} item(s) removed`, actorName);
    if (dto.lineQty?.length) await this.event(id, 'sales', `Quantity updated on ${dto.lineQty.length} item(s)`, actorName);
    if (dto.addLines?.length) {
      await this.event(id, 'sales', `${dto.addLines.length} item(s) added`, actorName);
      if (committed) {
        await this.event(id, 'delivery', `Stock committed for ${dto.addLines.length} added item(s) (order already preparing)`, actorName);
        await this.mirrorToInventory(
          id, o.orderNo, -1,
          dto.addLines.map((l) => ({ productId: l.productId, qty: l.qty })),
          actorName,
        );
      }
    }

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

  /**
   * ⚠️ IT REFUSES AT EVERY OTHER STATUS — audit 11 Sep 2026 #11.
   *
   * This used to delete an order at ANY point in its life and revert nothing.
   * Deleting a confirmed order left the workshop's hours booked; deleting one
   * past Preparing left its stock committed for ever; deleting a delivered one
   * removed a sale Finance had already posted revenue against, so the books
   * and the order list disagreed with nobody able to say why.
   *
   * Only two states can be deleted, and both are states where deleting takes
   * nothing back:
   *   · `placed`     — nothing has been committed yet; this is a mis-typed order
   *   · `cancelled`  — cancel() has already given back the stock, the hours,
   *                    the offer slots and the money it owed
   * Anything in between must be CANCELLED first, which is the path that knows
   * how to undo it.
   */
  async remove(id: string, actorName = 'Admin') {
    const o = await this.get(id);
    if (o.salesStatus !== SalesStatus.placed && o.salesStatus !== SalesStatus.cancelled) {
      throw new BadRequestException(
        o.salesStatus === SalesStatus.completed
          ? 'A completed order cannot be deleted — it is a sale the books have already counted. Raise a return instead.'
          : 'Only a placed or a cancelled order can be deleted. Cancel this one first — that is what gives back the stock, the workshop hours and any refund owed.',
      );
    }
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

  /*  R4 (4 Sep 2026) — ONE WINNER PER TRANSITION.

      Every lifecycle step read the order, checked its state, then wrote the
      next one. Two requests arriving together (a double-click, two tabs, a
      rider app retrying) both read the same state, both passed, and both
      wrote — stock came off twice, or a parcel was "delivered" twice. The
      flip now carries the state it expects in its WHERE, so under READ
      COMMITTED the second writer waits on the row, re-checks, matches
      nothing, and is told the order has already moved. The read-and-check
      above each transition stays: it is what produces the human sentence.  */
  private async claim(
    /*  the soft-delete extension gives `$transaction` its own client type;
        only `order.updateMany` is needed here, so that is all that is asked  */
    tx: { order: { updateMany: (args: Prisma.OrderUpdateManyArgs) => Promise<{ count: number }> } },
    id: string,
    expect: Prisma.OrderWhereInput,
    data: Prisma.OrderUpdateManyMutationInput,
  ) {
    const r = await tx.order.updateMany({ where: { id, ...expect }, data });
    if (r.count !== 1)
      throw new ConflictException('This order has already moved on — reload the page to see where it is.');
  }

  /*  R5 (4 Sep 2026) — THE PARCEL'S OWN RECORD MUST NOT BE OUTRUN.

      An order could be sent out, and marked delivered, straight from the
      order screen while a rider assignment for it still read ASSIGNED. The
      books then said "cash with rider" and the settle board — which only
      lists DELIVERED assignments — never showed the parcel, so the money was
      never squared. Delivery owns the assignment (house rule 4), so the order
      does not rewrite it; it REFUSES to move past it. Delivery's own actions
      call these methods with the assignment they are advancing, and pass.  */
  private async assertNotOutrunningDelivery(
    orderId: string,
    step: 'out' | 'delivered',
    viaAssignmentId?: string,
  ) {
    const live = await this.prisma.db.deliveryAssignment.findFirst({
      where: { orderId, isActive: true, deletedAt: null },
      include: { rider: { select: { name: true } }, courier: { select: { name: true } } },
    });
    if (!live || live.id === viaAssignmentId) return;
    const who = live.rider?.name ?? live.courier?.name ?? 'the carrier';
    if (step === 'out' && live.status === AssignmentStatus.ASSIGNED)
      throw new BadRequestException(
        `This parcel is assigned to ${who} (${live.assignmentNo}) — send it out from the Delivery panel, so Delivery and the books stay in step.`,
      );
    if (step === 'delivered' && live.status !== AssignmentStatus.DELIVERED)
      throw new BadRequestException(
        `This parcel is with ${who} (${live.assignmentNo}) — mark it delivered from the Delivery panel, so the rider's cash and the settle board stay in step.`,
      );
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

  /* ---------- stock: ONE implementation, used by preparing AND edit ----------
     Audit 11 Sep 2026 #10. `edit()` added a line to an order whose stock was
     already committed and deducted the PRODUCT row only — never the variant's
     shelf, never the add-ons. `cancel()` then put back what was never taken,
     inventing stock out of nothing. These three helpers are lifted verbatim
     out of `startPreparing`, so there is now one answer to "which shelf" and
     both doors ask it. */

  /** the products and variants a set of lines touches, in two queries */
  private async stockContext(lines: { productId: string | null; variantId?: string | null }[]) {
    /*  DEC-POS-018 — a counter line carries an Item, not a Product. These website
        paths only ever see product lines; the filter keeps the types honest.  */
    const products = await this.prisma.db.product.findMany({
      where: { id: { in: lines.map((l) => l.productId).filter((v): v is string => !!v) } },
    });
    const variantIds = lines.map((l) => l.variantId).filter((v): v is string => !!v);
    const variants = variantIds.length
      ? await this.prisma.db.productVariant.findMany({ where: { id: { in: variantIds } } })
      : [];
    return {
      pMap: new Map(products.map((p) => [p.id, p])),
      vMap: new Map(variants.map((v) => [v.id, v])),
    };
  }

  /** REV-M4: never let stock go negative silently — say what is short instead. */
  private assertLineStock(
    lines: { productId: string | null; variantId?: string | null; name: string; variantLabel?: string | null; qty: number }[],
    pMap: Map<string, { name: string; stockMode: StockMode; stockQty: number }>,
    vMap: Map<string, { stockQty: number }>,
  ) {
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
  }

  /**
   * Take the stock off the shelves these lines actually came from, inside the
   * caller's transaction.
   *
   * MANUAL stock: a variant line comes off THAT variant's shelf, everything
   * else off the product's (DEC-MOD-003 / DEC-PRD-014). Counted add-ons come
   * off in the same breath, never below zero — a shortage that slips past the
   * door means somebody sold it in between.
   */
  private async deductStock(
    tx: OrderTx,
    lines: { productId: string | null; variantId?: string | null; qty: number; addonIds?: string[] | null }[],
    pMap: Map<string, { id: string; stockMode: StockMode }>,
    vMap: Map<string, unknown>,
  ) {
    for (const l of lines) {
      const p = l.productId ? pMap.get(l.productId) : undefined;
      if (!p || p.stockMode !== 'MANUAL') continue;
      if (l.variantId && vMap.has(l.variantId)) {
        await tx.productVariant.update({ where: { id: l.variantId }, data: { stockQty: { decrement: l.qty } } });
      } else {
        await tx.product.update({ where: { id: p.id }, data: { stockQty: { decrement: l.qty } } });
      }
    }
    const addonNeed = this.addonDemand(lines);
    for (const [addonId, qty] of addonNeed) {
      const a = await tx.addOn.findFirst({ where: { id: addonId }, select: { stockQty: true } });
      if (a?.stockQty !== null && a !== null) {
        await tx.addOn.update({ where: { id: addonId }, data: { stockQty: Math.max(0, a.stockQty - qty) } });
      }
    }
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
        /** the first photo, for the line's `bg` snapshot (5 Aug) */
        images?: { url: string }[];
        /** the colours, with their own photos — the sold one's wins */
        variants?: { id: string; imageUrl?: string | null }[];
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
      /*  The picture, frozen like everything else on a receipt. Changing the
          product's photo later must not change an old order's (the spirit of
          DEC-DLV-002). The admin drops it straight into `background:`, so it
          is kept in CSS form.  */
      bg: (() => {
        const v = l.variantId ? p.variants?.find((x) => x.id === l.variantId) : undefined;
        const url = v?.imageUrl || p.images?.[0]?.url;
        return url ? `url(${url}) center/cover` : undefined;
      })(),
      sizeLabel: l.sizeLabel,
      bundleLabel: l.bundleLabel,
      addonLabels: l.addonLabels ?? [],
      addonIds: l.addonIds ?? [],
      persoText: l.persoText,
      /*  DEC-PRD-061 — the customer's own photograph, which on these products
          is printed ON the goods. It belongs to the line for the same reason
          the price does: it is what was ordered.  */
      persoImageUrl: l.persoImageUrl,
      /*  DEC-PRD-014 — the colour that was sold: the FK and the label
          snapshot, both.  */
      ...(l.variantId ? { variant: { connect: { id: l.variantId } } } : {}),
      variantLabel: l.variantLabel,
      addedFrom: (l.addedFrom ?? 'PRODUCT') as AddedFrom,
      productType: p.productType, // per-line freeze from product
      qty: l.qty,
      unitPaisa,
      /*  ⚠️ linePaisa = what the customer pays for this line, discount taken
          off. The order's subtotal is the sum of these, so not subtracting it
          here would count the bundle discount twice — once here and once in
          `discountPaisa` below.  */
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

    /*  ⚠️ CRAFTED IS NOT A COD RULE — removed 30 Aug 2026, DEC-SAL-015.
        This used to refuse Cash on Delivery on every CRAFTED line. Radian
        ASSEMBLES what it sells (flowers + ribbon + wrap → bouquet), so 22 of
        24 live products are CRAFTED: the rule closed COD on practically the
        whole shop, while the cart badge and the product page went on promising
        it. The browser's own `paymentOptions()` never had this check, so the
        website OFFERED cash and the server then refused the order — a screen
        and a rule telling different stories, the same family of fault Phase 5
        kept finding.

        The owner's rule, in his words (30 Aug): a gift is always paid in full ·
        a self order may be COD or online · and a product marked "payment
        required" needs payment whichever it is. Made-to-order is answered by
        `advanceRequired` below — the one flag the owner actually ticks.  */

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
  /**
   * Owner, 10 Sep 2026: a retry after a failed delivery where staff decided
   * the customer pays the second fare. Called by Delivery when the cost is
   * recorded at Settle — the fare lands on the order as an adjustment and
   * the due is recomputed, so it is collected like any other balance.
   */
  /*  ⚠️ FOUR ARGUMENTS SINCE 11 SEP 2026 (audit 11 Sep 2026, P0 #4).
      Delivery calls this twice — at assign, when a one-time fare is typed, and
      at settle, when the fee is first recorded on a parcel still on the road.
      Both hand over the ASSIGNMENT the fare belongs to, because that row is
      where "this fare has already been put on the customer" is written.

      The claim is the whole point: `customerChargedAt` goes null → now inside
      the same transaction that moves the money, so two settle clicks (or a
      settle racing an assign) can only charge the customer once. A caller that
      loses the claim gets `{ charged: false }` and nothing happens — this is
      not an error, it is the second click doing its job.

      It refuses outright on a delivered or cancelled order: a due raised on a
      completed order is a bill nobody is going to collect, and a cancelled
      order collects nothing more by rule.  */
  async chargeDeliveryToCustomer(
    orderId: string,
    paisa: number,
    actorName: string | undefined,
    assignmentId: string,
  ): Promise<{ charged: boolean; reason?: string }> {
    const who = actorName ?? 'Delivery';
    const amount = Math.round(paisa);
    if (!amount || amount <= 0) return { charged: false, reason: 'nothing to charge' };
    if (!assignmentId) return { charged: false, reason: 'no assignment given' };

    /*  (audit 11 Sep 2026, corrected on review the same day)
        ⚠️ A REFUSAL MUST ROLL THE CLAIM BACK, NOT COMMIT IT.
        `customerChargedAt` is a one-shot: it is the only thing standing
        between this fare and being charged twice. The first version of this
        method took the claim, then `return`ed `{charged:false}` when the
        order turned out to be cancelled or already delivered — and a plain
        return COMMITS, stamping "charged" on a parcel nobody ever charged.
        The fare could then never be put on the customer again, silently.
        So every refusal inside the transaction THROWS (rolling the claim
        back) and is turned into a quiet answer out here.  */
    const REFUSED = 'CHARGE_REFUSED:';
    let outcome: { charged: boolean; reason?: string };
    try {
      outcome = await this.prisma.db.$transaction(async (tx) => {
      /*  R4 — take the right to charge BEFORE reading anything else. If
          another request already took it, this one stops here.  */
      const claim = await tx.deliveryAssignment.updateMany({
        where: { id: assignmentId, customerChargedAt: null },
        data: { customerChargedAt: new Date() },
      });
      if (claim.count !== 1) throw new Error(REFUSED + 'already charged');

      const order = await tx.order.findFirst({
        where: { id: orderId, deletedAt: null },
        include: { lines: { where: NOT_DELETED } },
      });
      if (!order) throw new Error(REFUSED + 'order not found');
      if (order.salesStatus === SalesStatus.cancelled)
        throw new Error(REFUSED + 'order is cancelled');
      if (order.deliveryStatus === DeliveryStatus.delivered)
        throw new Error(REFUSED + 'order is already delivered');

      const adjustment = order.adjustmentPaisa + amount;
      const m = this.moneyOf({ ...order, adjustmentPaisa: adjustment });
      await tx.order.update({
        where: { id: orderId },
        data: {
          adjustmentPaisa: adjustment,
          subtotalPaisa: m.subtotal,
          totalPaisa: m.total,
          duePaisa: m.due,
          paymentStatus: m.status,
          discountPaisa: m.discount,
        },
      });
      return { charged: true };
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.startsWith(REFUSED)) return { charged: false, reason: msg.slice(REFUSED.length) };
      throw e; // a real failure — the claim rolled back with it, so a retry is safe
    }

    if (outcome.charged) {
      await this.event(orderId, 'payment', `Delivery fee charged to the customer: ${amount} paisa`, who);
    }
    return outcome;
  }

  /**
   * The ONE piece of order arithmetic — subtotal, capped discount, total, due,
   * payment status. Extracted 11 Sep 2026 (audit) so `recomputeMoney` and
   * `chargeDeliveryToCustomer` (which has to do its sums inside its own claim
   * transaction) cannot drift apart. Pure: it reads, it does not write.
   */
  private moneyOf(order: {
    lines: { linePaisa: number; discountPaisa: number }[];
    discountPaisa: number;
    deliveryPaisa: number;
    deliveryWaivedPaisa: number;
    adjustmentPaisa: number;
    paidPaisa: number;
    refundPaisa: number;
    paymentMethod: PaymentMethod;
  }) {
    const subtotal = order.lines.reduce((s, l) => s + (l.linePaisa - l.discountPaisa), 0);
    // REV-OFR-2 — a discount can never exceed the subtotal (DEC-OFR-009); an edit
    // that shrinks the cart must not leave a discount bigger than what's left.
    const discount = Math.min(order.discountPaisa, subtotal);
    const total = subtotal - discount + order.deliveryPaisa - order.deliveryWaivedPaisa + order.adjustmentPaisa;
    const collected = order.paidPaisa - order.refundPaisa; // money actually in hand
    const due = Math.max(0, total - collected);
    const status = this.derivePaymentStatus(order.paymentMethod, total, order.paidPaisa, order.refundPaisa, '');
    return { subtotal, discount, total, due, collected, status };
  }

  private async recomputeMoney(id: string) {
    const order = await this.prisma.db.order.findFirst({ where: { id }, include: { lines: { where: NOT_DELETED } } });
    if (!order) return;
    const m = this.moneyOf(order);
    await this.prisma.db.order.update({
      where: { id },
      data: { subtotalPaisa: m.subtotal, totalPaisa: m.total, duePaisa: m.due, paymentStatus: m.status, discountPaisa: m.discount },
    });
    if (m.collected > m.total) {
      await this.event(id, 'payment', `Overpaid by ${m.collected - m.total} paisa — refund is owed`, 'System');
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

  /*  One candidate receipt number. The CHECK is gone (audit 11 Sep 2026 #25):
      "is it free?" followed by "take it" is two statements with a gap between
      them, and under load two orders walked through the same gap and the
      second one 500'd on the unique index. The number is now drawn inside the
      create transaction and the index itself is the referee — see `create`,
      which retries on P2002.  */
  private candidateOrderNo(attempt: number): string {
    if (attempt >= 3) return `RAD-${Date.now()}`; // the last resort is unique by construction
    return `RAD-${50000 + Math.floor(Math.random() * 49999)}`;
  }

  /** true when this Prisma error is a unique-constraint clash on orderNo */
  private isOrderNoClash(e: unknown): boolean {
    const err = e as { code?: string; meta?: { target?: unknown } };
    if (err?.code !== 'P2002') return false;
    const t = err.meta?.target;
    const names = Array.isArray(t) ? t.map(String) : typeof t === 'string' ? [t] : [];
    return names.length === 0 || names.some((n) => n.toLowerCase().includes('orderno'));
  }
}
