import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AssignmentKind,
  AssignmentStatus,
  DeliveryMethodKind,
  DeliveryStatus,
  DeliveryTiming,
  DeliveryZone,
  FulfillmentType,
  Prisma,
  SalesStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { eraseOrBury } from '../common/erase';
import { AuditService } from '../common/audit.service';
import { OrdersService } from '../orders/orders.service';
import { FinanceEventsService } from '../finance/finance-events.service';
import { FinanceAssetsService } from '../finance/finance-assets.service';
import type {
  AreaWriteDto,
  TypeWriteDto,
  MethodWriteDto,
  SlotWriteDto,
  SlotTemplateWriteDto,
  BlackoutWriteDto,
  DeliverySettingsDto,
  RiderWriteDto,
  CourierWriteDto,
  AssignDto,
  AssignmentActionDto,
  BoardQuery,
  BoardSeg,
  BulkAssignDto,
  SettleDto,
} from './delivery.dto';

/*  DELIVERY MANAGEMENT — RADIAN_DELIVERY_MODULE_ARCHITECTURE.md (23 Jul 2026)

    DLV-R01  one ACTIVE assignment per order; re-assign auto-cancels the old one
    DLV-R02  RIDER needs riderId; COURIER needs courierId
    DLV-R03  out/delivered/fail go THROUGH OrdersService (DEC-DLV-006) — the
             payment/COD/LTV rules stay single-sourced in Sales
    DLV-R04  fail keeps reason; retry = NEW assignment
    DLV-R05  slot capacity WARNS, never blocks
    DLV-R06  method edits never rewrite order snapshots
    DLV-R07  COUNTER (POS) orders never reach the board
*/

const ENTITY = 'DeliveryAssignment';

@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly orders: OrdersService,
    /*  Delivery never writes to the ledger itself. It records what happened to
        a parcel and hands the completed event to Finance, which owns what that
        means in the accounts (core principle: accounting receives events, never
        manual inserts). Finance does not import Delivery, so there is no cycle. */
    private readonly finance: FinanceEventsService,
    private readonly financeAssets: FinanceAssetsService,
  ) {}

  /* ================= config (order form / storefront read) ================= */

  /** Methods + slots by zone. Seeds the storefront's old static menu on first run. */
  async config() {
    await this.seedMethodsIfEmpty();
    const methods = await this.prisma.db.deliveryMethod.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: [{ zone: 'asc' }, { sortOrder: 'asc' }],
      include: { slots: { where: { deletedAt: null, isActive: true }, orderBy: { sortOrder: 'asc' } } },
    });
    return methods;
  }

  /*
    ⚠️ SEEDING RESURRECTED WHAT THE OWNER DELETED — 1 Aug 2026.

    The owner deleted the deliveries under Dhaka City to build his own, and
    the deleted names came back. The cause was one line:

        const count = await this.prisma.db.deliveryMethod.count();
        if (count > 0) return;

    `prisma.db` is the soft-delete-aware client — it does NOT count deleted
    rows. So after deleting everything the count was zero, and the seed,
    thinking "empty table", planted its four rows again. The shop could never
    truly empty its own delivery list.

    The count now uses the RAW client, which sees deleted rows too. So the
    seed runs exactly once in a lifetime — on a brand-new database. If the
    owner empties the table, it stays empty, because that is what he asked.
  */
  private async seedMethodsIfEmpty() {
    const count = await this.prisma.deliveryMethod.count();
    if (count > 0) return;
    const seed: { label: string; zone: DeliveryZone; kind: DeliveryMethodKind; feePaisa: number; etaLabel: string; slots?: string[] }[] = [
      { label: '2-Hour Express', zone: 'DHAKA', kind: 'RIDER', feePaisa: 15000, etaLabel: 'within 2 hours' },
      { label: 'Same Day', zone: 'DHAKA', kind: 'RIDER', feePaisa: 10000, etaLabel: 'today', slots: ['10:00–13:00', '13:00–17:00', '17:00–21:00'] },
      { label: 'Midnight Surprise', zone: 'DHAKA', kind: 'RIDER', feePaisa: 20000, etaLabel: '11:30pm–12:15am' },
      { label: 'Nationwide Courier', zone: 'BANGLADESH', kind: 'COURIER', feePaisa: 15000, etaLabel: '1–3 days' },
    ];
    for (let i = 0; i < seed.length; i++) {
      const s = seed[i];
      await this.prisma.db.deliveryMethod.create({
        data: {
          label: s.label, zone: s.zone, kind: s.kind, feePaisa: s.feePaisa,
          etaLabel: s.etaLabel, sortOrder: i,
          slots: s.slots ? { create: s.slots.map((l, j) => ({ label: l, sortOrder: j })) } : undefined,
        },
      });
    }
  }

  private async seedCouriersIfEmpty() {
    /* raw client — counts deleted rows too, or the seed brings them back */
    const count = await this.prisma.courierService.count();
    if (count > 0) return;
    const seed = [
      { name: 'Steadfast', trackingUrlTemplate: 'https://steadfast.com.bd/t/{cn}' },
      { name: 'Pathao', trackingUrlTemplate: null },
      { name: 'RedX', trackingUrlTemplate: 'https://redx.com.bd/track-parcel/?trackingId={cn}' },
    ];
    for (let i = 0; i < seed.length; i++) {
      await this.prisma.db.courierService.create({
        data: { name: seed[i].name, trackingUrlTemplate: seed[i].trackingUrlTemplate, sortOrder: i },
      });
    }
  }

  /* ================= board (DLV-R07) ================= */

  /*  ⚠️ `take: 300` USED TO SIT HERE AND SAY NOTHING — 12 Aug 2026.

      The owner asked what this screen does at 100–500 orders. It dropped them:
      order 301 onwards was fetched by nobody, displayed nowhere, and no count
      anywhere on the screen revealed that anything was missing. A board that
      quietly hides work is worse than a board that is slow, because the shop
      finds out from the customer.

      So the page now asks for a page at a time and is always told the true
      total. `take` still exists — it is `limit`, and the screen prints what it
      is a limit OF.

      ORDER: by the time we PROMISED, soonest first, and never by order number.
      In a shop whose whole promise is two hours, "which one first" is the only
      question the screen exists to answer. Orders with no promise (taken before
      `promisedBy` existed) sort last rather than first — an unknown deadline
      must not push a real one down the page.  */
  async board(q: BoardQuery = {}) {
    const pageSize = Math.min(Math.max(q.pageSize ?? q.limit ?? 50, 1), 200);
    const page = Math.max(q.page ?? 1, 1);
    const now = new Date();

    /*  (audit 11 Sep 2026) THE DAY IS DHAKA'S, chosen by `date`, today when
        blank — the same definition Orders overview uses: promised inside the
        day, or unscheduled and placed that day. The default scope is that day
        PLUS anything overdue (promised before now, not finished), because a
        late parcel from yesterday is today's problem. `scope=all` lists every
        date. Delivered rows are only ever the chosen day's (deliveredAt).  */
    const DHAKA = 6 * 3600_000;
    const dhakaNow = new Date(now.getTime() + DHAKA);
    let y = dhakaNow.getUTCFullYear(), m = dhakaNow.getUTCMonth(), d = dhakaNow.getUTCDate();
    const mt = /^(\d{4})-(\d{2})-(\d{2})$/.exec(q.date ?? '');
    if (mt) { y = Number(mt[1]); m = Number(mt[2]) - 1; d = Number(mt[3]); }
    const dayStart = new Date(Date.UTC(y, m, d) - DHAKA);
    const dayEnd = new Date(dayStart.getTime() + 24 * 3600_000);
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const allDates = q.scope === 'all';

    const live: DeliveryStatus[] = [
      DeliveryStatus.unassigned,
      DeliveryStatus.preparing,
      DeliveryStatus.out_for_delivery,
      DeliveryStatus.failed,
    ];
    const base: Prisma.OrderWhereInput = {
      deletedAt: null,
      fulfillmentType: FulfillmentType.DELIVERY,
      salesStatus: { in: [SalesStatus.confirmed, SalesStatus.completed] },
    };
    if (q.zone) base.zone = q.zone as DeliveryZone;
    if (q.methodId) base.deliveryMethodId = q.methodId;

    /*  One box, three things people actually have in hand: the order number a
        customer read out, the phone they rang from, or a name. Anything more
        clever would need explaining. */
    const term = q.q?.trim();
    const search: Prisma.OrderWhereInput[] = term
      ? [{
          OR: [
            { orderNo: { contains: term, mode: 'insensitive' } },
            { recipientPhone: { contains: term } },
            { recipientName: { contains: term, mode: 'insensitive' } },
            { address: { contains: term, mode: 'insensitive' } },
            { customer: { is: { name: { contains: term, mode: 'insensitive' } } } },
            { customer: { is: { phone: { contains: term } } } },
          ],
        }]
      : [];

    const inDay: Prisma.OrderWhereInput = {
      OR: [
        { promisedBy: { gte: dayStart, lt: dayEnd } },
        { promisedBy: null, placedAt: { gte: dayStart, lt: dayEnd } },
      ],
    };
    const overdue: Prisma.OrderWhereInput = { promisedBy: { lt: now } };
    /* not finished, on the chosen day (or overdue) */
    const unfinished: Prisma.OrderWhereInput = {
      AND: [
        base,
        { deliveryStatus: { in: live } },
        ...(allDates ? [] : [{ OR: [inDay, overdue] }]),
        ...search,
      ],
    };
    /* finished on the chosen day */
    const finished: Prisma.OrderWhereInput = {
      AND: [
        base,
        { deliveryStatus: DeliveryStatus.delivered, deliveredAt: { gte: dayStart, lt: dayEnd } },
        ...search,
      ],
    };

    /*  The tiles, in the database. A parcel "has a carrier" when its active
        assignment is still ASSIGNED (on the road is its own tile). A failed
        order that was assigned again is BACK IN PREPARATION (P1 #16), so it
        counts under Not assigned / Photo pending / Ready, not under Failed.  */
    const activeAssigned: Prisma.DeliveryAssignmentWhereInput = { isActive: true, deletedAt: null, status: AssignmentStatus.ASSIGNED };
    const hasCarrier: Prisma.OrderWhereInput = { assignments: { some: activeAssigned } };
    const noCarrier: Prisma.OrderWhereInput = { assignments: { none: activeAssigned } };
    const needsPhoto: Prisma.OrderWhereInput = { photoUpdates: true, photos: { none: { kind: 'PREP', deletedAt: null } } };
    const photoOk: Prisma.OrderWhereInput = { OR: [{ photoUpdates: false }, { photos: { some: { kind: 'PREP', deletedAt: null } } }] };
    const prepping: Prisma.OrderWhereInput = {
      OR: [
        { deliveryStatus: { in: [DeliveryStatus.unassigned, DeliveryStatus.preparing] } },
        { deliveryStatus: DeliveryStatus.failed, ...hasCarrier },
      ],
    };
    const segWhere: Record<BoardSeg, Prisma.OrderWhereInput> = {
      all: unfinished,
      notAssigned: { AND: [unfinished, { deliveryStatus: { in: [DeliveryStatus.unassigned, DeliveryStatus.preparing] } }, noCarrier] },
      photoPending: { AND: [unfinished, prepping, hasCarrier, needsPhoto] },
      ready: { AND: [unfinished, prepping, hasCarrier, photoOk] },
      onRoad: { AND: [unfinished, { deliveryStatus: DeliveryStatus.out_for_delivery }] },
      late: { AND: [unfinished, { deliveryStatus: { not: DeliveryStatus.failed } }, overdue] },
      failed: { AND: [unfinished, { deliveryStatus: DeliveryStatus.failed }, noCarrier] },
      delivered: finished,
    };

    /* legacy `status=` callers get the raw status inside the same day scope */
    const legacyStatus = q.status as DeliveryStatus | undefined;
    const seg: BoardSeg = q.seg && q.seg in segWhere ? q.seg : legacyStatus === DeliveryStatus.delivered ? 'delivered' : 'all';
    const where: Prisma.OrderWhereInput =
      legacyStatus && legacyStatus !== DeliveryStatus.delivered && !q.seg
        ? { AND: [unfinished, { deliveryStatus: legacyStatus }] }
        : segWhere[seg];

    /*  The chips count the WHOLE day, not the page — "412 waiting" must not
        drop to "3" because the screen is on page 9. */
    const segKeys = Object.keys(segWhere) as BoardSeg[];
    const [total, grouped, ...tallies] = await Promise.all([
      this.prisma.db.order.count({ where }),
      this.prisma.db.order.groupBy({ by: ['deliveryStatus'], where: { OR: [unfinished, finished] }, _count: { _all: true } }),
      ...segKeys.map((k) => this.prisma.db.order.count({ where: segWhere[k] })),
    ]);
    /*  (review 11 Sep 2026, RISK 12) TWO DIFFERENT QUESTIONS, TWO OBJECTS.
        `counts` is what it has always been — the raw delivery statuses — and
        `segCounts` is the board's eight tiles. They were briefly merged, and
        two keys collide: "failed" as a status counts every failed order,
        "failed" as a tile counts only the ones with nobody carrying them now.
        An old caller reading `counts.failed` would silently have got the
        narrower number. Kept apart.  */
    const counts: Record<string, number> = {
      unassigned: 0, preparing: 0, out_for_delivery: 0, failed: 0, delivered: 0,
    };
    for (const g of grouped) counts[g.deliveryStatus as string] = g._count?._all ?? 0;
    const segCounts: Record<string, number> = {};
    segKeys.forEach((k, i) => { segCounts[k] = tallies[i]; });

    const orders = await this.prisma.db.order.findMany({
      where,
      orderBy: seg === 'delivered'
        ? [{ deliveredAt: 'desc' }]
        : [
            { promisedBy: { sort: 'asc', nulls: 'last' } },
            { placedAt: 'asc' },
          ],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        _count: {
          select: {
            lines: { where: { deletedAt: null } },
            photos: { where: { deletedAt: null } },
          },
        },
        /*  the board's Photo column (owner, 10 Sep 2026): did the customer
            ask, and is the before-delivery shot there yet  */
        /*  one row per KIND, never the whole album (review 11 Sep 2026): all
            this asks is "is there a prep shot, is there a hand-over shot".  */
        photos: {
          where: { deletedAt: null, kind: { in: ['PREP', 'DELIVERY'] } },
          select: { kind: true },
          distinct: ['kind'],
          take: 2,
        },
        /* "photo sent" is only true when a PHOTO_UPDATE message really went (P2) */
        messages: { where: { deletedAt: null, kind: 'PHOTO_UPDATE', status: 'SENT' }, select: { id: true }, take: 1 },
        lines: { where: { deletedAt: null }, select: { name: true, qty: true }, take: 3 },
        /*  newest first: the active one is the newest (re-assign switches the
            old one off), and for a failed order the newest is the attempt that
            failed — the carrier and reason the row must show (P1 #23).  */
        assignments: {
          where: { deletedAt: null },
          orderBy: { assignedAt: 'desc' },
          take: 3,
          include: { rider: { select: { id: true, name: true } }, courier: { select: { id: true, name: true } } },
        },
      },
    });
    return {
      rows: orders.map((o) => {
        const last = o.assignments[0] ?? null;
        return {
          id: o.id,
          orderNo: o.orderNo,
          placedAt: o.placedAt,
          promisedBy: o.promisedBy,
          customer: o.customer,
          recipientName: o.recipientName,
          isGift: o.isGift,
          zone: o.zone,
          address: o.address,
          methodLabel: o.methodLabel,
          slotLabel: o.slotLabel,
          date: o.date,
          salesStatus: o.salesStatus,
          deliveryStatus: o.deliveryStatus,
          totalPaisa: o.totalPaisa,
          duePaisa: o.duePaisa,
          paymentMethod: o.paymentMethod,
          deliveredAt: o.deliveredAt,
          lineCount: o._count.lines,
          photoCount: o._count.photos,
          photoUpdates: o.photoUpdates,
          hasPrepPhoto: o.photos.some((p) => p.kind === 'PREP'),
          hasDeliveryPhoto: o.photos.some((p) => p.kind === 'DELIVERY'),
          photoSent: o.messages.length > 0,
          items: o.lines.map((l) => ({ name: l.name, qty: l.qty })),
          assignment: o.assignments.find((a) => a.isActive) ?? null,
          lastAssignment: last
            ? {
                id: last.id,
                assignmentNo: last.assignmentNo,
                kind: last.kind,
                isActive: last.isActive,
                status: last.status,
                carrierName: last.rider?.name ?? last.courier?.name ?? (last.platform ? `${last.platform} rider` : null),
                failReason: last.failReason,
                failDecision: last.failDecision,
                failedAt: last.failedAt,
              }
            : null,
        };
      }),
      total,
      page,
      pageSize,
      limit: pageSize,
      /** the raw delivery statuses, exactly as this endpoint has always returned them */
      counts,
      /** the board's eight tiles — kept in their own object so no key collides with a status */
      segCounts,
      date: dateStr,
      scope: allDates ? 'all' : 'today',
      seg,
      /* the photo gates, so the board can offer the hand-over photo right there (P1 #21) */
      rules: await this.deliverySettings(),
    };
  }

  /*  BULK ASSIGN — the reason the list view exists (owner, 12 Aug 2026).

      Forty Dhaka parcels to one rider is one decision, not forty. Doing it
      forty times is not thoroughness, it is a screen making a person do its
      arithmetic.

      ⚠️ NOT A TRANSACTION, AND THAT IS DELIBERATE. One cancelled order in a
      selection of forty must not throw the other thirty-nine away. Each parcel
      is assigned on its own and every failure comes back named, so the screen
      can say WHICH three did not go through and why. An all-or-nothing bulk
      action on a delivery board would mean the busiest hour of the day is the
      hour nothing can be assigned.  */
  async bulkAssign(dto: BulkAssignDto) {
    const ids = [...new Set(dto.orderIds ?? [])];
    if (ids.length === 0) throw new BadRequestException('no orders selected');
    if (ids.length > 200) throw new BadRequestException('assign at most 200 parcels at a time');

    const done: { orderId: string; assignmentNo: string }[] = [];
    const failed: { orderId: string; reason: string }[] = [];

    for (const orderId of ids) {
      try {
        const a = await this.assign({
          orderId,
          kind: dto.kind,
          riderId: dto.riderId,
          courierId: dto.courierId,
          note: dto.note,
          actorName: dto.actorName,
        } as AssignDto);
        done.push({ orderId, assignmentNo: a.assignmentNo });
      } catch (e) {
        failed.push({ orderId, reason: e instanceof Error ? e.message : 'could not assign' });
      }
    }
    return { assigned: done.length, failedCount: failed.length, done, failed };
  }

  /* ================= assignments ================= */

  async assign(dto: AssignDto) {
    const actorName = dto.actorName ?? 'Delivery';
    const order = await this.prisma.db.order.findFirst({ where: { id: dto.orderId, deletedAt: null } });
    if (!order) throw new NotFoundException('order not found');
    if (order.fulfillmentType === FulfillmentType.COUNTER)
      throw new BadRequestException('a counter (POS) sale has no delivery');
    if (order.salesStatus === 'cancelled' || order.salesStatus === 'completed')
      throw new BadRequestException(`cannot assign a ${order.salesStatus} order`);

    /*  ═══ THE CUSTOMER IS NEVER CHARGED A DELIVERY FARE — owner, 11 Sep 2026 ═══

        > *"A courier bill, a fare, a second trip — we are not going to get
        >  into a fight with the customer over any of it. We clear those with
        >  the carrier and settle them in the commission."*

        A failed first attempt, a second trip, a courier who charges more than
        we quoted: none of it reaches the customer's bill. It is settled with
        the carrier, and the margin is what absorbs it. So there is no "the
        customer pays this retry" tick, no fare required at assign, and no
        charge at settle — the three places that used to exist are gone rather
        than left switched off, so nobody can turn them back on by accident.  */

    const kind = dto.kind as AssignmentKind;
    let riderName: string | null = null;
    let courierName: string | null = null;
    let trackingUrl: string | null = null;

    if (kind === 'RIDER') {
      if (!dto.riderId) throw new BadRequestException('riderId is required for a rider assignment (DLV-R02)');
      const rider = await this.prisma.db.rider.findFirst({ where: { id: dto.riderId, deletedAt: null } });
      if (!rider) throw new BadRequestException('rider not found');
      if (!rider.isActive) throw new BadRequestException('rider is inactive');
      riderName = rider.name;
    } else if (kind === 'ONE_TIME') {
      /*  Owner, 10 Sep 2026: a rider called for one trip is not a person the
          shop keeps. Platform is the only thing that must be said; a phone
          helps today and is forgotten with the parcel.  */
      if (!dto.platform?.trim()) throw new BadRequestException('say where the one-time rider came from (Pathao ride, Uber, other)');
      riderName = `${dto.platform.trim()} rider${dto.riderPhone ? ` ${dto.riderPhone}` : ''}`;
    } else {
      if (!dto.courierId) throw new BadRequestException('courierId is required for a courier assignment (DLV-R02)');
      const courier = await this.prisma.db.courierService.findFirst({ where: { id: dto.courierId, deletedAt: null } });
      if (!courier) throw new BadRequestException('courier not found');
      courierName = courier.name;
      if (dto.consignmentNo && courier.trackingUrlTemplate)
        trackingUrl = courier.trackingUrlTemplate.replace('{cn}', dto.consignmentNo);
    }

    // DLV-R01 — supersede the previous active assignment
    const prevActive = await this.prisma.db.deliveryAssignment.findFirst({
      where: { orderId: dto.orderId, isActive: true, deletedAt: null },
    });

    /*  DEC-DLV-021 — WAS THE PARCEL ALREADY ON THE ROAD?
        Then this is a swap, not a cancellation: it left with one carrier and
        somebody else is finishing it. A failed one keeps FAILED (its reason is
        the record of why), and anything that never left is CANCELLED as before.

        ⚠️ THE ORDER IS ASKED TOO, not only the assignment. An order can be out
        for delivery while its assignment still reads ASSIGNED — every row
        created before the order screen's button was routed through Delivery is
        in exactly that state. Reading the assignment alone would file those
        swaps as cancellations, which is the record saying the parcel never
        left when it had.  */
    const wasOnTheRoad =
      prevActive?.status === AssignmentStatus.OUT_FOR_DELIVERY ||
      order.deliveryStatus === DeliveryStatus.out_for_delivery;
    const supersededStatus =
      prevActive?.status === AssignmentStatus.FAILED
        ? AssignmentStatus.FAILED
        : wasOnTheRoad
          ? AssignmentStatus.SWAPPED
          : AssignmentStatus.CANCELLED;
    const isSwap = !!prevActive && supersededStatus === AssignmentStatus.SWAPPED;

    /*  (audit 11 Sep 2026, P1 #24) ONE WINNER. The supersede is a guarded
        updateMany — if somebody else already switched that row off, this
        assign loses and says so instead of stacking a second carrier. The
        DLV number is drawn INSIDE the transaction and retried on a clash;
        and the partial unique index (one active per order) turns any race
        the code missed into a refusal rather than two live assignments.  */
    const costTyped = !!dto.costPaisa && dto.costPaisa > 0 ? Math.round(dto.costPaisa) : 0;
    let created: Prisma.DeliveryAssignmentGetPayload<{ include: { rider: true; courier: true } }> | null = null;
    for (let attempt = 1; attempt <= 3 && !created; attempt++) {
      try {
        created = await this.prisma.db.$transaction(async (tx) => {
          if (prevActive) {
            const won = await tx.deliveryAssignment.updateMany({
              where: { id: prevActive.id, isActive: true },
              data: { isActive: false, status: supersededStatus },
            });
            if (won.count !== 1)
              throw new BadRequestException('This parcel\'s carrier was just changed by somebody else — refresh and look again');
          }
          const assignmentNo = await this.nextNo(tx);
          return tx.deliveryAssignment.create({
            data: {
              assignmentNo,
              orderId: dto.orderId,
              kind,
              riderId: kind === 'RIDER' ? dto.riderId : null,
              courierId: kind === 'COURIER' ? dto.courierId : null,
              consignmentNo: dto.consignmentNo,
              trackingUrl,
              note: dto.note,
              actorName,
              platform: kind === 'ONE_TIME' ? dto.platform?.trim() : null,
              riderPhone: kind === 'ONE_TIME' ? dto.riderPhone?.trim() || null : null,
              paidCash: kind === 'ONE_TIME' && !!dto.paidCash,
              /*  A fare known at assign time is the cost — typed by a person, so
                  costRecordedAt is set (DEC-DLV-016). Left blank, Settle asks.  */
              ...(costTyped > 0 ? { costPaisa: costTyped, costRecordedAt: new Date() } : {}),
              /*  R5 (4 Sep 2026) — a carrier given a parcel that is ALREADY on the
                  road (a swap, or an order sent out before anyone was assigned)
                  is carrying it now. Born ASSIGNED, this row could never be marked
                  delivered through Delivery ("cannot deliver from ASSIGNED"), the
                  order screen went round it, and the settle board — DELIVERED rows
                  only — never saw the cash. Born on the road, the record tells the
                  truth from its first second.  */
              ...(wasOnTheRoad ? { status: AssignmentStatus.OUT_FOR_DELIVERY, outAt: new Date() } : {}),
            },
            include: { rider: true, courier: true },
          });
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          const target = String((e.meta as { target?: unknown } | undefined)?.target ?? '');
          if (target.includes('assignmentNo')) {
            if (attempt < 3) continue; // number clash — draw again
            throw new BadRequestException('Could not number this assignment (three clashes in a row) — try again');
          }
          // the partial unique index spoke: somebody assigned this order a moment ago
          throw new BadRequestException('This order already has an active carrier — refresh; if you meant to change it, use Change carrier');
        }
        throw e;
      }
    }
    if (!created) throw new BadRequestException('Could not number this assignment — try again');

    /*  (audit 11 Sep 2026, P0 #5) A fare typed at assign is a cost the books
        must see: it goes to 5200 Delivery Cost now, not "when Settle gets to
        it" — Settle never did, because the parcel already read as recorded.
        A posting failure is logged by Finance (FinancePostingFailure, replay
        from the Ledger) and never undoes the assignment.  */
    if (costTyped > 0) {
      try {
        await this.finance.onDeliveryCost(created.id);
      } catch (e) {
        this.logger.warn(`delivery cost posting failed for ${created.assignmentNo}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // DEC-DLV-006 — keep the legacy Order courier fields in step (old screens live on)
    if (kind === 'COURIER') {
      await this.prisma.db.order.update({
        where: { id: dto.orderId },
        data: {
          courierName,
          courierConsignment: dto.consignmentNo ?? null,
          courierTrackingUrl: trackingUrl,
          courierAssignedAt: new Date(),
        },
      });
    }

    await this.audit.record({ entityType: ENTITY, entityId: created.id, action: 'CREATE', actorName });
    const who = kind === 'RIDER'
      ? `rider ${riderName}`
      : kind === 'ONE_TIME'
        ? `one-time ${riderName}${dto.costPaisa ? ` · paid ${(dto.costPaisa / 100).toFixed(0)}` : ''}`
        : `courier ${courierName}${dto.consignmentNo ? ` (${dto.consignmentNo})` : ''}`;
    await this.audit.event({
      entityType: 'Order', entityId: dto.orderId, kind: 'delivery',
      /*  DEC-DLV-021 — the timeline says a swap out loud. Somebody reading an
          order later has to be able to tell "we changed carrier mid-journey"
          from "we assigned it", and the two look identical otherwise.  */
      label: isSwap
        ? `Carrier swapped on the road — now ${who} (${created.assignmentNo}), was ${prevActive?.assignmentNo}`
        : `Assigned to ${who} — ${created.assignmentNo}`,
      actorName,
    });
    return created;
  }

  async assignmentAction(id: string, action: 'out' | 'delivered' | 'fail' | 'cancel', dto: AssignmentActionDto) {
    const actorName = dto.actorName ?? 'Delivery';
    const a = await this.prisma.db.deliveryAssignment.findFirst({
      where: { id, deletedAt: null },
      include: { courier: true },
    });
    if (!a) throw new NotFoundException('assignment not found');
    if (!a.isActive) throw new BadRequestException('this assignment is no longer active — assign again');

    if (action === 'out') {
      if (a.status !== AssignmentStatus.ASSIGNED)
        throw new BadRequestException(`cannot go out from ${a.status}`);
      // DEC-DLV-020 — the prep-photo gate, when the owner switched it on
      const rules = await this.deliverySettings();
      if (rules.requirePrepPhoto) {
        const prep = await this.prisma.db.orderPhoto.count({
          where: { orderId: a.orderId, kind: 'PREP', deletedAt: null },
        });
        if (prep === 0)
          throw new BadRequestException('A prep photo is required before going out — add one on the order');
      }
      let trackingUrl = a.trackingUrl;
      let consignmentNo = a.consignmentNo;
      if (dto.consignmentNo) {
        consignmentNo = dto.consignmentNo;
        if (a.courier?.trackingUrlTemplate)
          trackingUrl = a.courier.trackingUrlTemplate.replace('{cn}', dto.consignmentNo);
      }
      /*  (audit 11 Sep 2026, P0 #6 — corrected on review, same day)
          CLAIM, THEN CALL SALES, THEN COMPENSATE IF SALES REFUSED.

          ⚠️ THE OBVIOUS SHAPE IS THE WRONG ONE. Wrapping this in
          `$transaction(async tx => { claim; await this.orders.out(); })`
          reads as "all or nothing" and is not: OrdersService opens its OWN
          transaction on a second pooled connection and then does long
          post-commit work (finance postings, COGS, LTV, best-seller re-rank,
          message queueing). Prisma's interactive-transaction timeout is five
          seconds, so on a slow run the OUTER transaction dies with P2028
          AFTER Sales has committed — order delivered, assignment still on the
          road, parcel never reaches the settle board, the rider's cash never
          reconciled. That is the very split this fix exists to close, failing
          in the worse direction. It also pins two pool connections per click.

          So: the guarded `updateMany` is atomic ON ITS OWN and needs no
          transaction. If Sales then refuses, the claim is put back exactly as
          it was — guarded by the timestamp WE wrote, so a compensation can
          never overwrite somebody else's later move.  */
      const claimedAt = new Date();
      const won = await this.prisma.db.deliveryAssignment.updateMany({
        where: { id, isActive: true, status: AssignmentStatus.ASSIGNED },
        data: { status: AssignmentStatus.OUT_FOR_DELIVERY, outAt: claimedAt, consignmentNo, trackingUrl },
      });
      if (won.count !== 1) throw new BadRequestException('This parcel was just sent out by somebody else — refresh');
      try {
        // DLV-R03 — the order transition carries the business rules (R5: told which assignment is moving)
        await this.orders.outForDelivery(a.orderId, actorName, { viaAssignmentId: a.id });
      } catch (e) {
        await this.undoClaim(id, { outAt: claimedAt }, {
          status: a.status, outAt: a.outAt, consignmentNo: a.consignmentNo, trackingUrl: a.trackingUrl,
        }, a.assignmentNo);
        throw e;
      }
      return this.prisma.db.deliveryAssignment.findUniqueOrThrow({ where: { id }, include: { rider: true, courier: true } });
    }

    if (action === 'delivered') {
      if (a.status !== AssignmentStatus.OUT_FOR_DELIVERY)
        throw new BadRequestException(`cannot deliver from ${a.status}`);
      // DEC-DLV-020 — the hand-over photo gate, when the owner switched it on
      const rules = await this.deliverySettings();
      if (rules.requireDeliveryPhoto) {
        const proof = await this.prisma.db.orderPhoto.count({
          where: { orderId: a.orderId, kind: 'DELIVERY', deletedAt: null },
        });
        if (proof === 0)
          throw new BadRequestException('A delivery photo is required before marking delivered — add one on the order');
      }
      /* same shape as `out`: claim, call Sales, put the claim back if Sales refused */
      const claimedAt = new Date();
      const won = await this.prisma.db.deliveryAssignment.updateMany({
        where: { id, isActive: true, status: AssignmentStatus.OUT_FOR_DELIVERY },
        data: { status: AssignmentStatus.DELIVERED, deliveredAt: claimedAt, isActive: false },
      });
      if (won.count !== 1) throw new BadRequestException('This parcel was just marked delivered by somebody else — refresh');
      try {
        await this.orders.delivered(a.orderId, actorName, { viaAssignmentId: a.id }); // COD collect + LTV mirror live there
      } catch (e) {
        await this.undoClaim(id, { deliveredAt: claimedAt }, {
          status: a.status, deliveredAt: a.deliveredAt, isActive: true,
        }, a.assignmentNo);
        throw e;
      }
      return this.prisma.db.deliveryAssignment.findUniqueOrThrow({ where: { id }, include: { rider: true, courier: true } });
    }

    if (action === 'fail') {
      if (a.status !== AssignmentStatus.OUT_FOR_DELIVERY && a.status !== AssignmentStatus.ASSIGNED)
        throw new BadRequestException(`cannot fail from ${a.status}`);
      /*  Owner, 10 Sep 2026: what happens next is a staff decision, taken
          here with the reason. RETRY = the order stays failed and waits for
          a new carrier (DLV-R04); KEEP = same, nobody is retrying yet;
          CANCEL = the order is cancelled through Sales, refund rules apply. */
      const decision = dto.decision ?? 'KEEP';
      const reasonFields = await this.failReasonFields(dto);
      /* same shape as `out`: claim, call Sales, put the claim back if Sales refused */
      const claimedAt = new Date();
      const won = await this.prisma.db.deliveryAssignment.updateMany({
        where: { id, isActive: true, status: { in: [AssignmentStatus.OUT_FOR_DELIVERY, AssignmentStatus.ASSIGNED] } },
        data: {
          status: AssignmentStatus.FAILED,
          failedAt: claimedAt,
          failDecision: decision,
          /*  DEC-DLV-022 — the reason comes from the list, and its label is
              snapshotted beside the id. Renaming a reason later must not
              rewrite what this parcel said, the same discipline as
              `variantLabel` on an order line.  */
          ...reasonFields,
          isActive: false, // DLV-R04 — retry = new assignment
        },
      });
      if (won.count !== 1) throw new BadRequestException('This parcel was just changed by somebody else — refresh');
      if (a.status === AssignmentStatus.OUT_FOR_DELIVERY) {
        try {
          /*  (review 11 Sep 2026) the reason and the note travel with it, so
              `Order.failReason` / `failNote` say the same thing the assignment
              does. The DECISION is deliberately NOT passed: Sales would apply
              CANCEL itself, and the cancel below already does that for both
              paths (a parcel that never left has no failDelivery call at all).  */
          await this.orders.failDelivery(a.orderId, actorName, {
            failReasonId: dto.failReasonId,
            /* with no reason picked, the typed text IS the reason; with one, it is the note beside it */
            reason: dto.failReasonId ? undefined : dto.failReason?.trim() || undefined,
            note: dto.failReason?.trim() || undefined,
          });
        } catch (e) {
          await this.undoClaim(id, { failedAt: claimedAt }, {
            status: a.status, failedAt: a.failedAt, failDecision: a.failDecision,
            failReasonId: a.failReasonId, failReason: a.failReason, isActive: true,
          }, a.assignmentNo);
          throw e;
        }
      }
      const failed = await this.prisma.db.deliveryAssignment.findUniqueOrThrow({
        where: { id }, include: { rider: true, courier: true },
      });
      if (decision === 'CANCEL') {
        await this.orders.cancel(a.orderId, { reason: `delivery failed: ${dto.failReason ?? 'no reason typed'}`, actorName });
      } else {
        await this.audit.event({
          entityType: 'Order', entityId: a.orderId, kind: 'delivery',
          label: decision === 'RETRY' ? 'Staff decided: retry delivery — assign a carrier again' : 'Staff decided: keep as failed for now',
          actorName,
        });
      }
      return failed;
    }

    // cancel
    return this.prisma.db.deliveryAssignment.update({
      where: { id },
      data: { status: AssignmentStatus.CANCELLED, isActive: false },
      include: { rider: true, courier: true },
    });
  }

  /**
   * (review 11 Sep 2026) Put a claim back after Sales refused the step.
   *
   * `guard` is the timestamp THIS request wrote, so the compensation touches
   * the row only while it still holds our own claim — if somebody else has
   * moved the parcel on in the meantime, we leave their work alone and simply
   * log. A compensation that cannot be applied (the unique "one active
   * assignment per order" index, when a replacement carrier was assigned while
   * this row sat inactive) is logged rather than thrown: the caller is already
   * receiving the real error, and burying it under a second one would tell the
   * shop nothing about what actually went wrong.
   */
  private async undoClaim(
    id: string,
    guard: Prisma.DeliveryAssignmentWhereInput,
    /*  UNCHECKED, not the checked input: putting a claim back may have to
        restore `failReasonId` — a relation's own column, which the checked
        update-many input does not accept (review 11 Sep 2026).  */
    restore: Prisma.DeliveryAssignmentUncheckedUpdateManyInput,
    assignmentNo: string,
  ) {
    try {
      const back = await this.prisma.db.deliveryAssignment.updateMany({ where: { id, ...guard }, data: restore });
      if (back.count !== 1)
        this.logger.warn(`could not undo the claim on ${assignmentNo} — the row moved on; check it by hand`);
    } catch (e) {
      this.logger.error(`undoing the claim on ${assignmentNo} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /* ============== DEC-DLV-022 · why a delivery failed ==================

     The owner, 30 Aug 2026: failed and rescheduled stay ONE action, with the
     reason recorded. The parcel did not arrive either way — asking a rider at
     the door to decide which of the two it was is asking for a guess, and the
     reports can separate them afterwards.

     ⚠️ The reasons live in `ReasonMaster`, scoped by `purpose`, which is the
     same table Inventory keeps WASTAGE and GIFT in. One table, one row per
     reason; each module owns its own purpose and reads nothing else. Delivery
     does NOT call Inventory's endpoint for them (house rule 4) — it owns
     DELIVERY_FAIL and serves it here.  */

  private static readonly FAIL_PURPOSE = 'DELIVERY_FAIL';

  /** the list a rider picks from — active, in the owner's own order */
  async failReasons() {
    return this.prisma.db.reasonMaster.findMany({
      where: { purpose: DeliveryService.FAIL_PURPOSE, deletedAt: null, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      select: { id: true, label: true, sortOrder: true },
    });
  }

  async addFailReason(label: string, actorName = 'Admin') {
    const l = label.trim();
    if (!l) throw new BadRequestException('Give the reason a name');
    try {
      const row = await this.prisma.db.reasonMaster.create({
        data: { purpose: DeliveryService.FAIL_PURPOSE, label: l, sortOrder: 500 },
      });
      await this.audit.record({ entityType: 'ReasonMaster', entityId: row.id, action: 'CREATE', actorName });
      return row;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        throw new BadRequestException('That reason is already on the list');
      throw e;
    }
  }

  async updateFailReason(id: string, patch: { label?: string; isActive?: boolean }, actorName = 'Admin') {
    const row = await this.prisma.db.reasonMaster.findFirst({
      where: { id, purpose: DeliveryService.FAIL_PURPOSE, deletedAt: null },
    });
    if (!row) throw new NotFoundException('reason not found');
    const label = patch.label?.trim();
    const updated = await this.prisma.db.reasonMaster.update({
      where: { id },
      data: { ...(label ? { label } : {}), ...(patch.isActive === undefined ? {} : { isActive: patch.isActive }) },
    });
    await this.audit.record({ entityType: 'ReasonMaster', entityId: id, action: 'UPDATE', actorName });
    return updated;
  }

  /*  Soft delete, like every master. Parcels already filed under this reason
      keep pointing at it and keep their label snapshot — the history of why
      deliveries failed is not something a tidy-up may erase.  */
  async deleteFailReason(id: string, actorName = 'Admin') {
    const row = await this.prisma.db.reasonMaster.findFirst({
      where: { id, purpose: DeliveryService.FAIL_PURPOSE, deletedAt: null },
    });
    if (!row) throw new NotFoundException('reason not found');
    await this.prisma.db.reasonMaster.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    await this.audit.record({ entityType: 'ReasonMaster', entityId: id, action: 'DELETE', actorName });
    return { ok: true };
  }

  /**
   * The two columns a failure writes: which reason, and what it said at the
   * time. A free-text note may travel with the pick — "gate locked, guard sent
   * us away" is worth keeping and belongs to this parcel, not to the master.
   *
   * An id that is not a live DELIVERY_FAIL reason is dropped rather than
   * refused: a delivery has already failed by the time anyone presses this,
   * and blocking the record over a stale dropdown would lose the fact itself.
   */
  private async failReasonFields(dto: { failReasonId?: string; failReason?: string }) {
    const note = dto.failReason?.trim();
    if (!dto.failReasonId) {
      return { failReasonId: null, failReason: note || 'not specified' };
    }
    const reason = await this.prisma.db.reasonMaster.findFirst({
      where: { id: dto.failReasonId, purpose: DeliveryService.FAIL_PURPOSE, deletedAt: null },
      select: { id: true, label: true },
    });
    if (!reason) return { failReasonId: null, failReason: note || 'not specified' };
    return {
      failReasonId: reason.id,
      failReason: note ? `${reason.label} — ${note}` : reason.label,
    };
  }

  /* ================= settling a carrier (DEC-DLV-016/017) =================

     WHAT IS ON THIS LIST. Every delivered parcel whose accounts are not
     finished — and "finished" means two separate things:

       the cost is recorded          (costRecordedAt, not costPaisa > 0)
       and, if it was COD, the cash came back  (codHandedOver)

     ⚠️ `costPaisa > 0` WOULD HAVE BEEN THE WRONG TEST. It defaults to 0, so a
     delivery that genuinely cost nothing and one nobody has priced yet look
     identical. `costRecordedAt` is set only when a person types a number, which
     is why it exists at all.

     ⚠️ PREPAID PARCELS ARE HERE TOO, on purpose. There is no cash to reconcile
     on them, but the rider was still paid, and a list of only-COD parcels would
     silently lose the cost of every prepaid delivery — which in this shop is
     most of them. The owner chose this shape: one list, "Delivered — not
     settled", and a parcel leaves it when both facts are true.

     ⚠️ THE CASH FIGURE IS WHAT WAS COLLECTED, NOT `order.duePaisa` — fixed
     31 Aug 2026, found the first time this chain was ever walked.

     It read `duePaisa`, and `orders.delivered()` sets that to ZERO the moment
     the parcel is handed over: taking the cash IS the delivery (REV-C5). So by
     the time a parcel reached this list its due was always 0 and every COD
     delivery displayed as **prepaid**. Three consequences, worst last:

       · the screen told the shop a cash parcel needed no cash back
       · `settle()` used the same test, so `codHandedOver` could never become
         true and `remitWithLines` was never reached — gross was always 0
       · and once its cost was typed the parcel LEFT THIS LIST anyway, taking
         the rider's cash off the board while it still sat in 1110 Cash with
         Rider / Courier. Money the shop is owed, invisible.

     The honest number is the COD_COLLECTED payment written at delivery. That
     is the cash that physically went into someone's hand. */
  async unsettled(carrierId?: string) {
    const rows = await this.prisma.db.deliveryAssignment.findMany({
      where: {
        deletedAt: null,
        ...(carrierId
          ? carrierId.startsWith('one-time:')
            ? { kind: AssignmentKind.ONE_TIME, platform: carrierId.slice(9) }
            : { OR: [{ riderId: carrierId }, { courierId: carrierId }] }
          : {}),
        /*  (audit 11 Sep 2026, P0 #7) a FAILED attempt cost money too — the
            Pathao trip that came back from a locked gate is still a fare.
            It is here until its cost is recorded; cash never applies to it. */
        AND: [{
          OR: [
            { status: AssignmentStatus.DELIVERED, OR: [{ costRecordedAt: null }, { codHandedOver: false }] },
            { status: AssignmentStatus.FAILED, costRecordedAt: null },
          ],
        }],
      },
      /*  (review 11 Sep 2026, RISK 13) A FAILED ATTEMPT HAS NO `deliveredAt`.
          Ordering on that column alone put every unpriced failure in one
          null-shaped clump at one end of the list, and `daysSince` read null
          beside it — the oldest unpaid fares, which is exactly what this list
          is for, could be the least visible thing on it. The database sorts on
          both columns and the effective date (delivered, else failed, else
          assigned) is worked out below, where the shape is known.  */
      orderBy: [{ deliveredAt: 'asc' }, { failedAt: 'asc' }],
      take: 500,
      include: {
        rider: { select: { id: true, name: true } },
        courier: { select: { id: true, name: true } },
        order: {
          select: {
            id: true, orderNo: true, zone: true, address: true,
            paymentMethod: true, totalPaisa: true, paidPaisa: true, duePaisa: true,
          },
        },
      },
    });

    const collected = await this.codCollectedFor(
      rows.map((a) => a.order?.id).filter((v): v is string => !!v),
    );

    /*  A parcel with no cash outstanding is not "settled" — it may still be
        waiting for its cost. The two facts travel separately all the way to
        the screen so it can grey the right box rather than hide the row. */
    return rows
      .filter(
        (a) =>
          a.costRecordedAt === null ||
          (a.status === AssignmentStatus.DELIVERED && !a.codHandedOver && (collected.get(a.order?.id ?? '') ?? 0) > 0),
      )
      .map((a) => ({
        assignmentId: a.id,
        assignmentNo: a.assignmentNo,
        status: a.status,
        failedAt: a.failedAt,
        failReason: a.failReason,
        deliveredAt: a.deliveredAt,
        daysSince: a.deliveredAt
          ? Math.floor((Date.now() - a.deliveredAt.getTime()) / 86400000)
          : null,
        kind: a.kind,
        /*  ONE_TIME (owner, 10 Sep 2026) — no Rider row; the platform stands in
            as the carrier name so the settle board can group by it.  */
        carrier: a.rider ?? a.courier ?? (a.platform ? { id: `one-time:${a.platform}`, name: `${a.platform} rider${a.riderPhone ? ` · ${a.riderPhone}` : ''}` } : null),
        carrierId: a.riderId ?? a.courierId ?? (a.platform ? `one-time:${a.platform}` : null),
        platform: a.platform,
        riderPhone: a.riderPhone,
        paidCash: a.paidCash,
        consignmentNo: a.consignmentNo,
        orderId: a.order?.id,
        orderNo: a.order?.orderNo,
        zone: a.order?.zone,
        address: a.order?.address,
        /** the cash actually taken at the door — 0 on a prepaid parcel, 0 on a failed attempt */
        codDuePaisa: a.status === AssignmentStatus.DELIVERED ? collected.get(a.order?.id ?? '') ?? 0 : 0,
        costPaisa: a.costPaisa,
        costRecorded: a.costRecordedAt !== null,
        codHandedOver: a.codHandedOver,
      }));
  }

  /**
   * How much cash each of these orders put into a carrier's hand.
   *
   * The COD_COLLECTED payment `orders.delivered()` writes is the only honest
   * record of that: `order.duePaisa` is zeroed by the same method, so it
   * answers "does the customer still owe us" — a different question, and the
   * one that made every COD parcel read as prepaid on the settle screen.
   *
   * Refunds are not netted off here. A refund is money going back to the
   * customer from the shop's own account; it does not take anything out of the
   * rider's pocket, and subtracting it would leave him holding cash the board
   * says he does not have.
   */
  /*  DELIVERY MONEY (owner, 10 Sep 2026) — one order, one line, the whole
      story of its cash and its cost:

        TO_COLLECT    out for delivery, the rider has to bring back ৳X
        WITH_CARRIER  delivered, COD taken at the door, cash not with us yet
        RECEIVED      the cash reached the shop (remittance) — or prepaid
      plus what we paid the carrier, what the parcel cost us (Inventory's
      AVCO on the ORDER movements; the product's cost price when stock was
      never posted), and the order's profit after both. Reads only — the
      writes stay where they are: settle() for cash and cost, Orders for the
      order's own money.  */
  async money(q: { days?: number } = {}) {
    const days = Math.min(Math.max(q.days ?? 30, 1), 365);
    const since = new Date(Date.now() - days * 86400000);
    /*  (audit 11 Sep 2026, P1 #20) THE WINDOW IS FOR FINISHED ROWS ONLY.
        Cash still in a rider's hand, or a fee nobody has recorded, is owed
        whatever the date on the order — filtering it by placedAt made COD
        that was never handed in disappear after 30 days, which is the one
        thing this screen exists to stop. So: recent rows, PLUS every row
        that is still on the road, still holding cash, or still unpriced.  */
    const openCost: Prisma.DeliveryAssignmentWhereInput = {
      deletedAt: null,
      status: { in: [AssignmentStatus.DELIVERED, AssignmentStatus.FAILED] },
      costRecordedAt: null,
    };
    const openCash: Prisma.DeliveryAssignmentWhereInput = {
      deletedAt: null,
      status: AssignmentStatus.DELIVERED,
      codHandedOver: false,
    };
    const orders = await this.prisma.db.order.findMany({
      where: {
        deletedAt: null,
        fulfillmentType: FulfillmentType.DELIVERY,
        salesStatus: { not: SalesStatus.cancelled },
        deliveryStatus: { in: [DeliveryStatus.out_for_delivery, DeliveryStatus.delivered] },
        OR: [
          { placedAt: { gte: since } },
          { deliveryStatus: DeliveryStatus.out_for_delivery },
          { assignments: { some: openCost } },
          { assignments: { some: openCash } },
        ],
      },
      orderBy: [{ deliveryStatus: 'asc' }, { placedAt: 'desc' }],
      take: 500,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        lines: { where: { deletedAt: null }, select: { qty: true, name: true, product: { select: { costPaisa: true } } } },
        /*  (P0 #7) EVERY attempt, newest first. The newest is "the carrier"
            the row talks about; the older ones that failed still cost money
            and are listed under it so each can be recorded and paid.  */
        assignments: {
          where: { deletedAt: null },
          orderBy: { assignedAt: 'desc' },
          include: { rider: { select: { id: true, name: true } }, courier: { select: { id: true, name: true } } },
        },
      },
    });
    const ids = orders.map((o) => o.id);
    const [collected, moved] = await Promise.all([
      this.codCollectedFor(ids),
      ids.length
        ? this.prisma.db.inventoryMovement.groupBy({
            by: ['refId'],
            where: { refType: 'ORDER', refId: { in: ids } },
            _sum: { valuePaisa: true },
          })
        : Promise.resolve([] as { refId: string | null; _sum: { valuePaisa: number | null } }[]),
    ]);
    const cogsByOrder = new Map<string, number>();
    for (const m of moved) if (m.refId) cogsByOrder.set(m.refId, Math.abs(m._sum.valuePaisa ?? 0));

    const shapeAttempt = (a: (typeof orders)[number]['assignments'][number]) => ({
      assignmentId: a.id,
      assignmentNo: a.assignmentNo,
      status: a.status,
      isActive: a.isActive,
      kind: a.kind,
      carrierType: a.kind === 'ONE_TIME' ? 'ONE_TIME' : a.kind,
      carrierId: a.riderId ?? a.courierId ?? (a.platform ? `one-time:${a.platform}` : null),
      name: a.rider?.name ?? a.courier?.name ?? (a.platform ? `${a.platform} rider` : 'Carrier'),
      costPaisa: a.costPaisa,
      costRecorded: !!a.costRecordedAt,
      paidCash: a.paidCash,
      codHandedOver: a.codHandedOver,
      failReason: a.failReason,
      failedAt: a.failedAt,
      deliveredAt: a.deliveredAt,
    });

    const totals = { toCollect: 0, withCarrier: 0, received: 0, paidCarrier: 0, costMissing: 0, revenue: 0, profit: 0 };
    const rows = orders
      .map((o) => {
        const a = o.assignments[0] ?? null;
        const cod = collected.get(o.id) ?? 0;
        const delivered = o.deliveryStatus === DeliveryStatus.delivered;
        const stage = !delivered
          ? o.duePaisa > 0 ? 'TO_COLLECT' : 'PREPAID'
          : cod > 0
            ? a?.codHandedOver ? 'RECEIVED' : 'WITH_CARRIER'
            : 'PREPAID';
        const cogsPosted = cogsByOrder.get(o.id);
        const cogs = cogsPosted ?? o.lines.reduce((s, l) => s + (l.product?.costPaisa ?? 0) * l.qty, 0);
        /*  (P0 #7) the order paid for EVERY attempt, not only the one that
            got there. Cost missing = any delivered/failed attempt nobody has
            priced yet.  */
        const attempts = o.assignments.map(shapeAttempt);
        const settled = o.assignments.filter((x) => x.costRecordedAt);
        const carrierCost = settled.reduce((n, x) => n + x.costPaisa, 0);
        const unpriced = o.assignments.filter(
          (x) => !x.costRecordedAt && (x.status === AssignmentStatus.DELIVERED || x.status === AssignmentStatus.FAILED),
        );
        const costRecorded = !!a?.costRecordedAt;
        const costMissing = unpriced.length > 0;
        const profit = o.totalPaisa - cogs - carrierCost;
        const inWindow = o.placedAt >= since;
        const open = stage === 'TO_COLLECT' || stage === 'WITH_CARRIER' || costMissing;
        if (!inWindow && !open) return null;
        if (stage === 'TO_COLLECT') totals.toCollect += o.duePaisa;
        if (stage === 'WITH_CARRIER') totals.withCarrier += cod;
        if (stage === 'RECEIVED') totals.received += cod;
        totals.paidCarrier += carrierCost;
        if (costMissing) totals.costMissing++;
        if (delivered) {
          totals.revenue += o.totalPaisa;
          totals.profit += profit;
        }
        return {
          id: o.id,
          orderNo: o.orderNo,
          placedAt: o.placedAt,
          deliveredAt: a?.deliveredAt ?? o.deliveredAt ?? null,
          deliveryStatus: o.deliveryStatus,
          customer: o.customer,
          isGift: o.isGift,
          recipientName: o.recipientName,
          address: o.address,
          paymentMethod: o.paymentMethod,
          totalPaisa: o.totalPaisa,
          deliveryPaisa: o.deliveryPaisa,
          duePaisa: o.duePaisa,
          codCollectedPaisa: cod,
          stage,
          carrier: a ? shapeAttempt(a) : null,
          attempts,
          costMissing,
          cogsPaisa: cogs,
          cogsFrom: cogsPosted !== undefined ? 'inventory' : 'product cost',
          carrierCostPaisa: carrierCost,
          profitPaisa: profit,
          /*  "final" once every attempt is priced — a cash-paid one-time rider
              with no fare typed is still an unknown number, not a free ride  */
          profitFinal: delivered && !costMissing && (costRecorded || o.assignments.length === 0),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    return { rows, totals, days };
  }

  private async codCollectedFor(orderIds: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (orderIds.length === 0) return out;
    const rows = await this.prisma.db.paymentTransaction.groupBy({
      by: ['orderId'],
      where: { orderId: { in: orderIds }, kind: 'COD_COLLECTED', deletedAt: null },
      _sum: { amountPaisa: true },
    });
    for (const r of rows) if (r.orderId) out.set(r.orderId, r._sum.amountPaisa ?? 0);
    return out;
  }

  /*  ⚠️ THE CHARGE IS EXPENSED ONCE, AND THIS IS WHERE THAT IS DECIDED.

      `chargePaisa` on a line is the same money as `costPaisa` on the parcel.
      The parcel is what posts to 5200 Delivery Cost (Finance.onDeliveryCost).
      So the remittance this creates must NOT debit 5200 as well — Finance
      checks for lines and clears the accrual instead. Without that check every
      courier fee in the accounts would be double what it really was.  */
  async settle(dto: SettleDto) {
    const actorName = dto.actorName ?? 'Delivery';
    const lines = (dto.lines ?? []).filter((l) => l.assignmentId);
    if (lines.length === 0) throw new BadRequestException('nothing selected to settle');
    if (!dto.carrierId) throw new BadRequestException('which carrier is this?');
    if (new Set(lines.map((l) => l.assignmentId)).size !== lines.length)
      throw new BadRequestException('the same parcel is on the list twice');

    const ids = lines.map((l) => l.assignmentId);
    const found = await this.prisma.db.deliveryAssignment.findMany({
      where: { id: { in: ids }, deletedAt: null },
      include: {
        order: { select: { id: true, duePaisa: true, deliveryStatus: true, salesStatus: true } },
        /*  Every receipt this parcel has already had: to name the last one when
            the cash is fully in, and — since a SHORT receipt leaves the parcel
            open (review 11 Sep 2026) — to know how much of the door money is
            still outstanding.  */
        remittanceLines: {
          where: { deletedAt: null, codPaisa: { gt: 0 } },
          select: { codPaisa: true, remittance: { select: { remittanceNo: true, receivedAt: true } } },
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });
    /*  Same correction as `unsettled()`: whether this parcel put cash in a
        carrier's hand is answered by the COD_COLLECTED payment, never by
        `duePaisa` — which delivery has already zeroed.  */
    const collected = await this.codCollectedFor(
      found.map((a) => a.order?.id).filter((v): v is string => !!v),
    );
    if (found.length !== ids.length) throw new BadRequestException('one of these parcels no longer exists');

    /*  (audit 11 Sep 2026) WHAT A LINE MAY SAY, checked before anything is
        written:
          · a DELIVERED parcel may carry cash and/or a fee
          · a FAILED attempt may carry a fee only (P0 #7) — no cash was taken
          · cash is refused a SECOND time (P0 #2): `codHandedOver` only ever
            goes false -> true, and the receipt that set it is named
          · a fee is written only when the line CARRIES one (P0 #1); a
            "cash received" line without it leaves the cost untouched  */
    const byId = new Map(found.map((a) => [a.id, a]));
    const norm = lines.map((l) => {
      const a = byId.get(l.assignmentId)!;
      const codTaken = collected.get(a.order?.id ?? '') ?? 0;
      /* what earlier receipts already brought in for this parcel (a part one leaves a balance) */
      const already = a.remittanceLines.reduce((n, r) => n + r.codPaisa, 0);
      const outstanding = Math.max(0, codTaken - already);
      const cod = Math.max(0, Math.round(l.codPaisa ?? 0));
      const hasCharge = typeof l.chargePaisa === 'number' && Number.isFinite(l.chargePaisa);
      const chg = hasCharge ? Math.max(0, Math.round(l.chargePaisa as number)) : null;
      if (a.status !== AssignmentStatus.DELIVERED && a.status !== AssignmentStatus.FAILED)
        throw new BadRequestException(`${a.assignmentNo} has not been delivered yet`);
      if (a.status === AssignmentStatus.FAILED && cod > 0)
        throw new BadRequestException(`${a.assignmentNo} failed at the door — no cash was taken on it, only its fee can be recorded`);
      /*  (review 11 Sep 2026, BLOCKER 3) A RECORDED FEE IS NOT REWRITTEN HERE.
          `onDeliveryCost` posts to 5200 under the key `DELIVERY:<id>:cost` and
          `postEntry` de-dupes on it, so a second, different number would change
          the parcel and leave the ledger on the first one — the assignment
          saying 120 while 5200 and the accrual say 80, for ever, with nothing
          flagging the drift. DEC-DLV-016 says the fee is typed once; sending it
          again unchanged is a harmless no-op, sending a different one is
          refused and belongs in Finance as a reversal.  */
      if (chg !== null && a.costRecordedAt && chg !== a.costPaisa)
        throw new BadRequestException(
          `The fee on ${a.assignmentNo} was already recorded as ${(a.costPaisa / 100).toFixed(0)} tk and is already in the accounts — it cannot be changed here. Reverse it in Finance if it was wrong.`,
        );
      /* already recorded and unchanged: nothing to write, nothing to post again */
      const write = chg !== null && !a.costRecordedAt ? chg : null;
      if (cod > 0) {
        if (codTaken <= 0)
          throw new BadRequestException(`${a.assignmentNo} was prepaid — there is no cash to receive on it`);
        if (a.codHandedOver || outstanding <= 0) {
          const prev = a.remittanceLines[0]?.remittance;
          const when = prev?.receivedAt ? prev.receivedAt.toISOString().slice(0, 10) : 'an earlier date';
          throw new BadRequestException(
            `Cash for ${a.assignmentNo} was already received on ${when}${prev?.remittanceNo ? ` (${prev.remittanceNo})` : ''} — it cannot be received twice`,
          );
        }
        if (cod > outstanding)
          throw new BadRequestException(
            `${a.assignmentNo}: ${(cod / 100).toFixed(0)} tk is more than the ${(outstanding / 100).toFixed(0)} tk still owed on this parcel`,
          );
      }
      /*  A PART RECEIPT LEAVES THE PARCEL OPEN. Marking it handed over would
          strand the balance: 1110 Cash with Rider still holds it, and the
          rider bringing the rest tomorrow would be refused as a second
          receipt. So the parcel only closes when the whole of the door money
          has come back — there is no "short, written off" state, because the
          rider is not a debtor here (owner, 11 Sep 2026: the cash he collects
          simply goes onto the order, and we pay him his fee).  */
      const closes = cod > 0 && codTaken > 0 && cod >= outstanding;
      const feeKept = !!l.feeKeptFromCash && cod > 0 && (write ?? (a.costRecordedAt ? a.costPaisa : 0)) > 0;
      return { l, a, codTaken, outstanding, cod, chg: write, feeKept, closes };
    });

    let gross = 0;
    let charge = 0;
    for (const n of norm) {
      gross += n.cod;
      charge += n.chg ?? 0;
    }

    const now = dto.receivedAt ? new Date(dto.receivedAt) : new Date();

    /*  The parcels are written first and each on its own terms: a line that
        carries only a cost must not pretend the cash came back, and a line
        that carries only cash must not touch the cost. */
    await this.prisma.db.$transaction(async (tx) => {
      for (const n of norm) {
        const won = await tx.deliveryAssignment.updateMany({
          /* one winner on the cash: a second receipt racing this one loses here */
          where: { id: n.a.id, ...(n.cod > 0 ? { codHandedOver: false } : {}) },
          data: {
            ...(n.chg !== null ? { costPaisa: n.chg, costRecordedAt: now } : {}),
            /*  Only a parcel that actually took cash at the door can have that
                cash come back — and once true it stays true (P0 #2). A receipt
                that was SHORT does not close it (review, RISK 6): the balance
                is still with the carrier and can be received later.  */
            codHandedOver: n.a.codHandedOver || n.closes,
          },
        });
        if (won.count !== 1)
          throw new BadRequestException(`Cash for ${n.a.assignmentNo} was just received by somebody else — refresh`);
      }
    });

    const carrierName =
      (dto.carrierType === 'RIDER'
        ? (await this.prisma.db.rider.findFirst({ where: { id: dto.carrierId } }))?.name
        : dto.carrierType === 'ONE_TIME'
          ? `${dto.carrierId.replace(/^one-time:/, '')} · one-time riders`
          : (await this.prisma.db.courierService.findFirst({ where: { id: dto.carrierId } }))?.name) ?? 'Carrier';

    /*  The expense goes on the parcel, one parcel at a time. This is the call
        that has been missing since `costPaisa` was added: the column existed,
        Finance knew how to post it, and nothing ever pulled the trigger — so
        5200 Delivery Cost has been empty the whole time and delivery margin
        has read as pure profit. */
    for (const n of norm) {
      if (n.chg !== null && n.chg > 0) await this.finance.onDeliveryCost(n.a.id);
    }

    /*  Only cash that actually came back becomes a remittance. A settlement of
        prepaid parcels moves no money — the cost is accrued and paid later like
        any other bill — so inventing a receipt for it would put money in the
        books that never arrived. The fee is netted off the cash ONLY on lines
        where the rider kept it (P0 #3); Finance does that arithmetic.  */
    let remittance: { id: string; remittanceNo: string } | null = null;
    let kept = 0;
    if (gross > 0) {
      if (!dto.intoAccountId) throw new BadRequestException('Where did the money land?');
      const r = await this.financeAssets.remitWithLines({
        carrierType: dto.carrierType,
        carrierId: dto.carrierId,
        carrierName,
        intoAccountId: dto.intoAccountId,
        receivedAt: now,
        note: dto.note ?? null,
        actorName,
        lines: norm
          .filter((n) => n.cod > 0)
          .map((n) => ({
            assignmentId: n.a.id,
            codPaisa: n.cod,
            /* the recorded fee — this line's, or the one already on the parcel — but only counted when kept */
            chargePaisa: n.feeKept ? (n.chg ?? n.a.costPaisa) : 0,
            feeKeptFromCash: n.feeKept,
          })),
      });
      kept = r.chargePaisa;
      remittance = { id: r.id, remittanceNo: r.remittanceNo };
    }

    await this.audit.record({
      entityType: ENTITY, entityId: dto.carrierId, action: 'UPDATE', actorName,
      changes: { settled: lines.length, grossPaisa: gross, chargePaisa: charge, keptFromCashPaisa: kept },
    });

    return {
      settled: lines.length,
      grossPaisa: gross,
      chargePaisa: charge,
      /*  Null when no cash came back, not a negative number — 31 Aug 2026,
          seen while walking a prepaid settlement. `gross - charge` returned
          −12000 there, which reads as "the rider owes us ৳120" when the truth
          is the opposite: nothing was handed over and the SHOP now owes HIM
          that ৳120, accrued in 2300. A "net received" of a receipt that was
          never issued is a number with no meaning, and on a money screen a
          meaningless number is a misleading one. What the shop owes is on the
          accrual, where it belongs.  */
      netPaisa: gross > 0 ? gross - kept : null,
      carrierName,
      remittance,
    };
  }

  async orderAssignments(orderId: string) {
    return this.prisma.db.deliveryAssignment.findMany({
      where: { orderId, deletedAt: null },
      orderBy: { assignedAt: 'desc' },
      include: { rider: { select: { id: true, name: true } }, courier: { select: { id: true, name: true } } },
    });
  }

  /* ================= riders ================= */

  async riders() {
    const list = await this.prisma.db.rider.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const today = await this.prisma.db.deliveryAssignment.groupBy({
      by: ['riderId', 'status'],
      where: { deletedAt: null, riderId: { not: null }, assignedAt: { gte: start } },
      _count: { _all: true },
    });
    return list.map((r) => {
      const mine = today.filter((t) => t.riderId === r.id);
      const sum = (s: AssignmentStatus) => mine.find((m) => m.status === s)?._count._all ?? 0;
      return {
        ...r,
        today: {
          assigned: sum(AssignmentStatus.ASSIGNED),
          out: sum(AssignmentStatus.OUT_FOR_DELIVERY),
          delivered: sum(AssignmentStatus.DELIVERED),
          failed: sum(AssignmentStatus.FAILED),
        },
      };
    });
  }

  async createRider(dto: RiderWriteDto) {
    if (!dto.name?.trim()) throw new BadRequestException('name is required');
    return this.prisma.db.rider.create({
      data: {
        name: dto.name.trim(), phone: dto.phone, vehicle: dto.vehicle,
        photoUrl: dto.photoUrl, note: dto.note, isActive: dto.isActive ?? true,
      },
    });
  }

  async updateRider(id: string, dto: RiderWriteDto) {
    const r = await this.prisma.db.rider.findFirst({ where: { id, deletedAt: null } });
    if (!r) throw new NotFoundException('rider not found');
    return this.prisma.db.rider.update({
      where: { id },
      data: {
        name: dto.name?.trim() ?? r.name, phone: dto.phone === undefined ? r.phone : dto.phone,
        vehicle: dto.vehicle === undefined ? r.vehicle : dto.vehicle,
        photoUrl: dto.photoUrl === undefined ? r.photoUrl : dto.photoUrl,
        note: dto.note === undefined ? r.note : dto.note,
        isActive: dto.isActive ?? r.isActive,
      },
    });
  }

  async removeRider(id: string) {
    const open = await this.prisma.db.deliveryAssignment.count({
      where: { riderId: id, isActive: true, deletedAt: null },
    });
    if (open > 0) throw new BadRequestException(`rider has ${open} active assignment(s) — hand them over first`);
    await eraseOrBury(
      () => this.prisma.rider.delete({ where: { id } }),
      () => this.prisma.db.rider.update({ where: { id }, data: { deletedAt: new Date() } }),
      'Rider',
    );
    return { id, deleted: true };
  }

  /* ================= couriers (P2 master) ================= */

  async couriers() {
    await this.seedCouriersIfEmpty();
    return this.prisma.db.courierService.findMany({
      where: { deletedAt: null },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async createCourier(dto: CourierWriteDto) {
    if (!dto.name?.trim()) throw new BadRequestException('name is required');
    return this.prisma.db.courierService.create({
      data: {
        name: dto.name.trim(), phone: dto.phone,
        trackingUrlTemplate: dto.trackingUrlTemplate, note: dto.note,
        sortOrder: dto.sortOrder ?? 0, isActive: dto.isActive ?? true,
      },
    });
  }

  async updateCourier(id: string, dto: CourierWriteDto) {
    const c = await this.prisma.db.courierService.findFirst({ where: { id, deletedAt: null } });
    if (!c) throw new NotFoundException('courier not found');
    return this.prisma.db.courierService.update({
      where: { id },
      data: {
        name: dto.name?.trim() ?? c.name,
        phone: dto.phone === undefined ? c.phone : dto.phone,
        trackingUrlTemplate: dto.trackingUrlTemplate === undefined ? c.trackingUrlTemplate : dto.trackingUrlTemplate,
        note: dto.note === undefined ? c.note : dto.note,
        sortOrder: dto.sortOrder ?? c.sortOrder,
        isActive: dto.isActive ?? c.isActive,
      },
    });
  }

  async removeCourier(id: string) {
    /* (audit 11 Sep 2026, P1 #34) the rider guard, mirrored: parcels on the road keep their courier */
    const open = await this.prisma.db.deliveryAssignment.count({
      where: { courierId: id, isActive: true, deletedAt: null },
    });
    if (open > 0) throw new BadRequestException(`courier has ${open} active assignment(s) — hand them over first`);
    await eraseOrBury(
      () => this.prisma.courierService.delete({ where: { id } }),
      () => this.prisma.db.courierService.update({ where: { id }, data: { deletedAt: new Date() } }),
      'Courier Service',
    );
    return { id, deleted: true };
  }

  /* ================= areas (DEC-DLV-007) =================
     Owner, 1 Aug 2026: everything runs by the delivery module's own rules.

     ⚠️ The screen existed before — Zones · types · slots — but it sat in the
     browser with `DEMO_ZONE_TREE`. The owner changed a charge, refreshed, and
     it was gone. A screen that does not save is not a screen, it is a picture.

     The tree is two levels: parentId = null is a main zone, otherwise an area
     inside one. One table, because both are the same thing — a place
     deliveries go into. */

  async areas() {
    await this.seedZonesIfEmpty();
    return this.prisma.db.deliveryArea.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  /**
   * The two main zones, and nothing else.
   *
   * ⚠️ THE AREAS UNDER THEM ARE NOT SEEDED, on purpose. "Dhanmondi, Gulshan,
   * Uttara" were three names in a demo file; seeding them would put three
   * invented places into a real shop's settings, and the owner would have to
   * work out which of them he actually delivers to. The zones are different —
   * every Radian order is either inside Dhaka or it is not, and that is true
   * before anybody configures anything.
   */
  private async seedZonesIfEmpty() {
    /* raw client — counts deleted rows too, or the seed brings them back */
    const count = await this.prisma.deliveryArea.count();
    if (count > 0) return;
    await this.prisma.db.deliveryArea.createMany({
      data: [
        { name: 'Dhaka City', zone: 'DHAKA' as DeliveryZone, sortOrder: 0 },
        { name: 'Nationwide', zone: 'BANGLADESH' as DeliveryZone, sortOrder: 1 },
      ],
    });
  }

  async createArea(dto: AreaWriteDto) {
    if (!dto.name?.trim()) throw new BadRequestException('name is required');

    /*  An area does not pick its own zone — it inherits from whatever it sits
        inside. Otherwise one day Dhanmondi ends up in the "BANGLADESH" zone
        and nobody understands why it is missing from the Dhaka list.  */
    let zone = dto.zone as DeliveryZone | undefined;
    if (dto.parentId) {
      const parent = await this.prisma.db.deliveryArea.findFirst({
        where: { id: dto.parentId, deletedAt: null },
      });
      if (!parent) throw new NotFoundException('parent zone not found');
      if (parent.parentId) throw new BadRequestException('an area cannot hold another area');
      zone = parent.zone;
    }
    if (!zone) throw new BadRequestException('zone is required for a main zone');

    return this.prisma.db.deliveryArea.create({
      data: {
        name: dto.name.trim(),
        parentId: dto.parentId ?? null,
        zone,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateArea(id: string, dto: AreaWriteDto) {
    const a = await this.prisma.db.deliveryArea.findFirst({ where: { id, deletedAt: null } });
    if (!a) throw new NotFoundException('area not found');
    return this.prisma.db.deliveryArea.update({
      where: { id },
      data: {
        name: dto.name?.trim() ?? a.name,
        sortOrder: dto.sortOrder ?? a.sortOrder,
        isActive: dto.isActive ?? a.isActive,
      },
    });
  }

  /**
   * ⚠️ SOFT DELETE, AND THE PRICES UNDER IT GO WITH IT — but orders never do.
   * DLV-R06: a method's label and fee are SNAPSHOTTED on the order, so a
   * receipt printed last week still reads "Same day · ৳80" after the area is
   * gone. Deleting a place must never rewrite what somebody already paid.
   */
  async removeArea(id: string) {
    const kids = await this.prisma.db.deliveryArea.count({
      where: { parentId: id, deletedAt: null },
    });
    if (kids > 0)
      throw new BadRequestException('remove the areas inside it first');

    const now = new Date();
    await this.prisma.db.deliveryArea.update({ where: { id }, data: { deletedAt: now } });
    await this.prisma.db.deliveryMethod.updateMany({
      where: { areaId: id, deletedAt: null },
      data: { deletedAt: now },
    });
    return { id, deleted: true };
  }

  /* ================= types — the NAMES (DEC-DLV-008) =================
     Owner: "whatever is edited in the delivery module must work automatically
     across the whole system." The product upload page shows THIS list and
     nothing else. Rename here and it renames there — the link is by id, not
     by text. */

  async types() {
    const rows = await this.prisma.db.deliveryType.findMany({
      where: { deletedAt: null },
      orderBy: [{ zone: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        /*  ⚠️ how many places carry its price — and without this the product
            page lies. A name with no price in any area is never shown by
            checkout (DEC-DLV-009: no price = null), yet it could be ticked on
            a product and the owner would think it works. A tick that does
            nothing is a bug.  */
        _count: { select: { rates: { where: { deletedAt: null } } } },
      },
    });
    return rows.map((t) => ({ ...t, rateCount: t._count.rates }));
  }

  async createType(dto: TypeWriteDto) {
    if (!dto.name?.trim()) throw new BadRequestException('name is required');
    return this.prisma.db.deliveryType.create({
      data: {
        name: dto.name.trim(),
        zone: dto.zone as DeliveryZone,
        kind: (dto.kind ?? 'RIDER') as DeliveryMethodKind,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
        timing: (dto.timing ?? 'TODAY_SLOT') as DeliveryTiming,
        promiseMinutes: dto.promiseMinutes ?? null,
        openFromMin: dto.openFromMin ?? null,
        openToMin: dto.openToMin ?? null,
      },
    });
  }

  async updateType(id: string, dto: TypeWriteDto) {
    const t = await this.prisma.db.deliveryType.findFirst({ where: { id, deletedAt: null } });
    if (!t) throw new NotFoundException('delivery type not found');

    /*  ⚠️ Renaming also renames the price rows' `label` — the old screens and
        the order form still read that text, and two names in two places would
        leave the owner guessing which is real. Order snapshots are never
        touched — those are receipts.  */
    const renamed = dto.name?.trim() && dto.name.trim() !== t.name;
    const updated = await this.prisma.db.deliveryType.update({
      where: { id },
      data: {
        name: dto.name?.trim() ?? t.name,
        kind: (dto.kind ?? t.kind) as DeliveryMethodKind,
        sortOrder: dto.sortOrder ?? t.sortOrder,
        isActive: dto.isActive ?? t.isActive,
        timing: (dto.timing ?? t.timing) as DeliveryTiming,
        /*  `undefined` = the form said nothing, keep the old. `null` = the
            owner cleared it. The two must stay apart, or a window can never
            be removed.  */
        promiseMinutes: dto.promiseMinutes === undefined ? t.promiseMinutes : dto.promiseMinutes,
        openFromMin: dto.openFromMin === undefined ? t.openFromMin : dto.openFromMin,
        openToMin: dto.openToMin === undefined ? t.openToMin : dto.openToMin,
      },
    });
    if (renamed) {
      await this.prisma.db.deliveryMethod.updateMany({
        where: { typeId: id, deletedAt: null },
        data: { label: updated.name },
      });
    }
    return updated;
  }

  /**
   * ⚠️ Deleting a name takes its prices with it, and the product links are
   * removed too (CASCADE-like behaviour, done by hand here). Otherwise a
   * product would keep pointing at a delivery that no longer exists, and
   * checkout would keep looking for an empty space.
   */
  async removeType(id: string) {
    const now = new Date();
    await this.prisma.db.deliveryType.update({ where: { id }, data: { deletedAt: now } });
    await this.prisma.db.deliveryMethod.updateMany({
      where: { typeId: id, deletedAt: null },
      data: { deletedAt: now },
    });
    await this.prisma.db.productDeliveryType.deleteMany({ where: { typeId: id } });
    return { id, deleted: true };
  }

  /* ================= methods & slots (P3 master) ================= */

  async methods() {
    await this.seedMethodsIfEmpty();
    return this.prisma.db.deliveryMethod.findMany({
      where: { deletedAt: null },
      orderBy: [{ zone: 'asc' }, { sortOrder: 'asc' }],
      include: {
        slots: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
        area: { select: { id: true, name: true, parentId: true } },
        type: { select: { id: true, name: true, kind: true } },
      },
    });
  }

  async createMethod(dto: MethodWriteDto) {
    if (!dto.label?.trim()) throw new BadRequestException('label is required');
    return this.prisma.db.deliveryMethod.create({
      data: {
        label: dto.label.trim(),
        zone: dto.zone as DeliveryZone,
        kind: (dto.kind ?? 'RIDER') as DeliveryMethodKind,
        feePaisa: dto.feePaisa ?? 0,
        cutoffTime: dto.cutoffTime, etaLabel: dto.etaLabel,
        sortOrder: dto.sortOrder ?? 0, isActive: dto.isActive ?? true,
        isFeatured: dto.isFeatured ?? true,
        /* DEC-DLV-007 — null means "the whole zone", and that is the default */
        areaId: dto.areaId ?? null,
        typeId: dto.typeId ?? null,
      },
      include: { slots: true },
    });
  }

  async updateMethod(id: string, dto: MethodWriteDto) {
    const m = await this.prisma.db.deliveryMethod.findFirst({ where: { id, deletedAt: null } });
    if (!m) throw new NotFoundException('method not found');
    return this.prisma.db.deliveryMethod.update({
      where: { id },
      data: {
        label: dto.label?.trim() ?? m.label,
        zone: (dto.zone ?? m.zone) as DeliveryZone,
        kind: (dto.kind ?? m.kind) as DeliveryMethodKind,
        feePaisa: dto.feePaisa ?? m.feePaisa,
        cutoffTime: dto.cutoffTime === undefined ? m.cutoffTime : dto.cutoffTime,
        etaLabel: dto.etaLabel === undefined ? m.etaLabel : dto.etaLabel,
        sortOrder: dto.sortOrder ?? m.sortOrder,
        isActive: dto.isActive ?? m.isActive,
        isFeatured: dto.isFeatured ?? m.isFeatured,
        /*  `undefined` = the form did not mention it, leave it alone.
            `null` = the owner moved this price back to the whole zone. The
            two must stay distinguishable or un-scoping a price is impossible. */
        areaId: dto.areaId === undefined ? m.areaId : dto.areaId,
        typeId: dto.typeId === undefined ? m.typeId : dto.typeId,
      },
      include: { slots: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } } },
    });
  }

  /** DLV-R06 — deactivate/soft-delete never touches order snapshots. */
  async removeMethod(id: string) {
    await eraseOrBury(
      () => this.prisma.deliveryMethod.delete({ where: { id } }),
      () => this.prisma.db.deliveryMethod.update({ where: { id }, data: { deletedAt: new Date() } }),
      'Delivery Method',
    );
    await this.prisma.db.deliverySlot.updateMany({ where: { methodId: id }, data: { deletedAt: new Date() } });
    return { id, deleted: true };
  }

  async addSlot(methodId: string, dto: SlotWriteDto) {
    const m = await this.prisma.db.deliveryMethod.findFirst({ where: { id: methodId, deletedAt: null } });
    if (!m) throw new NotFoundException('method not found');
    if (!dto.label?.trim()) throw new BadRequestException('label is required');
    return this.prisma.db.deliverySlot.create({
      data: {
        methodId, label: dto.label.trim(),
        capacityPerDay: dto.capacityPerDay ?? null,
        sortOrder: dto.sortOrder ?? 0, isActive: dto.isActive ?? true,
        startMin: dto.startMin ?? null,
        endMin: dto.endMin ?? null,
        cutoffTime: dto.cutoffTime ?? null,
        // DEC-DLV-018 — cast until the local client is regenerated on the host
        ...({ templateId: dto.templateId ?? null } as object),
      },
    });
  }

  async updateSlot(slotId: string, dto: SlotWriteDto) {
    const s = await this.prisma.db.deliverySlot.findFirst({ where: { id: slotId, deletedAt: null } });
    if (!s) throw new NotFoundException('slot not found');
    return this.prisma.db.deliverySlot.update({
      where: { id: slotId },
      data: {
        label: dto.label?.trim() ?? s.label,
        capacityPerDay: dto.capacityPerDay === undefined ? s.capacityPerDay : dto.capacityPerDay,
        sortOrder: dto.sortOrder ?? s.sortOrder,
        isActive: dto.isActive ?? s.isActive,
        startMin: dto.startMin === undefined ? s.startMin : dto.startMin,
        endMin: dto.endMin === undefined ? s.endMin : dto.endMin,
        cutoffTime: dto.cutoffTime === undefined ? s.cutoffTime : dto.cutoffTime,
      },
    });
  }

  async removeSlot(slotId: string) {
    await this.prisma.db.deliverySlot.update({ where: { id: slotId }, data: { deletedAt: new Date() } });
    return { id: slotId, deleted: true };
  }

  /* ================= slot masters · DEC-DLV-018 =================
     Made once here; Setup connects them to a zone-method, which copies the
     master into a DeliverySlot row (checkout reads those, unchanged) and
     remembers templateId. Editing a master fans out to its connections.
     The db cast is temporary: the local Prisma client is regenerated on the
     host (BUILD_CHECK.bat); the table itself is live via the migration. */

  private get slotTemplates() {
    return (this.prisma.db as unknown as {
      deliverySlotTemplate: {
        findMany: (a: unknown) => Promise<Record<string, unknown>[]>;
        findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
        create: (a: unknown) => Promise<Record<string, unknown>>;
        update: (a: unknown) => Promise<Record<string, unknown>>;
      };
    }).deliverySlotTemplate;
  }

  async listSlotTemplates() {
    const rows = await this.slotTemplates.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
    // usage count = live connections, so the screen can say "used in N places"
    const links = await this.prisma.db.deliverySlot.groupBy({
      by: ['templateId'],
      where: { deletedAt: null, templateId: { not: null } },
      _count: { _all: true },
    } as never);
    const byId = new Map(
      (links as unknown as { templateId: string; _count: { _all: number } }[]).map((l) => [l.templateId, l._count._all]),
    );
    return rows.map((r) => ({ ...r, usedCount: byId.get(r.id as string) ?? 0 }));
  }

  async createSlotTemplate(dto: SlotTemplateWriteDto) {
    if (!dto.label?.trim()) throw new BadRequestException('label is required');
    return this.slotTemplates.create({
      data: {
        label: dto.label.trim(),
        startMin: dto.startMin ?? null,
        endMin: dto.endMin ?? null,
        cutoffTime: dto.cutoffTime ?? null,
        capacityPerDay: dto.capacityPerDay ?? null,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateSlotTemplate(id: string, dto: SlotTemplateWriteDto) {
    const t = await this.slotTemplates.findFirst({ where: { id, deletedAt: null } });
    if (!t) throw new NotFoundException('slot not found');
    const data = {
      label: dto.label?.trim() || (t.label as string),
      startMin: dto.startMin === undefined ? t.startMin : dto.startMin,
      endMin: dto.endMin === undefined ? t.endMin : dto.endMin,
      cutoffTime: dto.cutoffTime === undefined ? t.cutoffTime : dto.cutoffTime,
      capacityPerDay: dto.capacityPerDay === undefined ? t.capacityPerDay : dto.capacityPerDay,
      sortOrder: dto.sortOrder ?? (t.sortOrder as number),
      isActive: dto.isActive ?? (t.isActive as boolean),
    };
    const updated = await this.slotTemplates.update({ where: { id }, data });
    // the fan-out: one master, edited once, every connection follows.
    // capacityPerDay is NOT fanned out — capacity belongs to the connection,
    // set per zone in Setup (owner, 19 Aug).
    await this.prisma.db.deliverySlot.updateMany({
      where: { deletedAt: null, ...({ templateId: id } as object) },
      data: {
        label: data.label,
        startMin: data.startMin as number | null,
        endMin: data.endMin as number | null,
        cutoffTime: data.cutoffTime as string | null,
      },
    });
    return updated;
  }

  /* ================= blackouts & rules · DEC-DLV-019/020 =================
     The Blackout & rules tab used to be a mock — fake dates, switches that
     saved nothing. Real now. The db casts are temporary until the local
     Prisma client is regenerated on the host (the tables are live). */

  private get blackoutTable() {
    return (this.prisma.db as unknown as {
      deliveryBlackout: {
        findMany: (a: unknown) => Promise<Record<string, unknown>[]>;
        findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
        create: (a: unknown) => Promise<Record<string, unknown>>;
        update: (a: unknown) => Promise<Record<string, unknown>>;
      };
    }).deliveryBlackout;
  }

  private get settingTable() {
    return (this.prisma.db as unknown as {
      deliverySetting: {
        findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
        create: (a: unknown) => Promise<Record<string, unknown>>;
        update: (a: unknown) => Promise<Record<string, unknown>>;
      };
    }).deliverySetting;
  }

  async blackouts() {
    return this.blackoutTable.findMany({
      where: { deletedAt: null },
      orderBy: [{ date: 'asc' }],
      include: { type: { select: { id: true, name: true } } },
    });
  }

  async createBlackout(dto: BlackoutWriteDto) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dto.date ?? ''))
      throw new BadRequestException('date must be YYYY-MM-DD');
    if (dto.typeId) {
      const t = await this.prisma.db.deliveryType.findFirst({
        where: { id: dto.typeId, deletedAt: null },
      });
      if (!t) throw new NotFoundException('delivery method not found');
    }
    const dup = await this.blackoutTable.findFirst({
      where: { deletedAt: null, date: dto.date, typeId: dto.typeId ?? null },
    });
    if (dup) throw new BadRequestException('that day is already paused');
    return this.blackoutTable.create({
      data: { date: dto.date, reason: dto.reason?.trim() || null, typeId: dto.typeId ?? null },
    });
  }

  async removeBlackout(id: string) {
    await this.blackoutTable.update({ where: { id }, data: { deletedAt: new Date() } });
    return { id, deleted: true };
  }

  /** one row, born on first read — the photo gates default OFF */
  async deliverySettings(): Promise<{ requirePrepPhoto: boolean; requireDeliveryPhoto: boolean }> {
    const row = (await this.settingTable.findFirst({})) ?? (await this.settingTable.create({ data: {} }));
    return {
      requirePrepPhoto: !!row.requirePrepPhoto,
      requireDeliveryPhoto: !!row.requireDeliveryPhoto,
    };
  }

  async updateDeliverySettings(dto: DeliverySettingsDto) {
    const row = (await this.settingTable.findFirst({})) ?? (await this.settingTable.create({ data: {} }));
    await this.settingTable.update({
      where: { id: row.id },
      data: {
        ...(dto.requirePrepPhoto !== undefined ? { requirePrepPhoto: dto.requirePrepPhoto } : {}),
        ...(dto.requireDeliveryPhoto !== undefined ? { requireDeliveryPhoto: dto.requireDeliveryPhoto } : {}),
      },
    });
    return this.deliverySettings();
  }

  async removeSlotTemplate(id: string) {
    const linked = await this.prisma.db.deliverySlot.count({
      where: { deletedAt: null, ...({ templateId: id } as object) },
    });
    if (linked > 0)
      throw new BadRequestException(
        `This slot is connected in ${linked} place(s) — disconnect it in Setup first`,
      );
    await this.slotTemplates.update({ where: { id }, data: { deletedAt: new Date() } });
    return { id, deleted: true };
  }

  /** DLV-R05 — slot load for a given date; capacity warns, never blocks. */
  async slotLoad(date: string) {
    const orders = await this.prisma.db.order.findMany({
      where: { deletedAt: null, date, deliverySlotId: { not: null }, salesStatus: { not: 'cancelled' } },
      select: { deliverySlotId: true },
    });
    const by: Record<string, number> = {};
    for (const o of orders) if (o.deliverySlotId) by[o.deliverySlotId] = (by[o.deliverySlotId] ?? 0) + 1;
    return by;
  }

  /* ================= helpers ================= */

  /*  (audit 11 Sep 2026, P1 #24) drawn INSIDE the create transaction, so a
      clash on the unique assignmentNo is a P2002 that `assign()` retries —
      never a 500 from a number two requests both thought was free.  */
  private async nextNo(
    tx: {
      deliveryAssignment: {
        findMany(args: {
          where: { assignmentNo: { startsWith: string } };
          orderBy: { assignmentNo: 'desc' };
          take: number;
          select: { assignmentNo: true };
        }): Promise<{ assignmentNo: string }[]>;
      };
    } = this.prisma.db,
  ): Promise<string> {
    /*  DEC-DLV-005 — numeric max over real DLV- numbers (RTN- self-healing
        pattern), but BOUNDED (review 11 Sep 2026, RISK 11). This used to read
        every assignment row the shop had ever written, every time a parcel was
        assigned — now inside the create transaction and up to 200 times in a
        bulk assign. The numbers are zero-padded to six digits, so the highest
        string IS the highest number; a handful are read rather than one, so a
        stray hand-typed or differently-shaped number cannot derail the count.
        Past DLV-999999 the padding stops and string order could drift — the
        P2002 retry in `assign()` is the backstop, and by then the shop can
        afford a sequence.  */
    const rows = await tx.deliveryAssignment.findMany({
      where: { assignmentNo: { startsWith: 'DLV-' } },
      orderBy: { assignmentNo: 'desc' },
      take: 25,
      select: { assignmentNo: true },
    });
    let max = 0;
    for (const row of rows) {
      const m = /^DLV-(\d{4,})$/.exec(row.assignmentNo);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > max) max = n;
      }
    }
    return `DLV-${String(max + 1).padStart(6, '0')}`;
  }
}
