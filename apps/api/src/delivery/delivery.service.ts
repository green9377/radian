import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AssignmentKind,
  AssignmentStatus,
  DeliveryMethodKind,
  DeliveryTiming,
  DeliveryZone,
  FulfillmentType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { OrdersService } from '../orders/orders.service';
import type {
  AreaWriteDto,
  TypeWriteDto,
  MethodWriteDto,
  SlotWriteDto,
  RiderWriteDto,
  CourierWriteDto,
  AssignDto,
  AssignmentActionDto,
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly orders: OrdersService,
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
    ⚠️ SEEDING RESURRECTED WHAT THE OWNER DELETED — ১ আগস্ট ২০২৬।

    মালিক Dhaka City-র নিচের delivery-গুলো মুছে নিজের মতো বানাতে গিয়েছিলেন,
    আর মুছে দেওয়া নামগুলো ফিরে এসেছিল। কারণটা এক লাইনের:

        const count = await this.prisma.db.deliveryMethod.count();
        if (count > 0) return;

    `prisma.db` হলো soft-delete করা client — সে মুছে ফেলা সারি **গোনে না**।
    তাই সব মুছে ফেলার পর count শূন্য, আর "খালি টেবিল" ভেবে seed আবার চারটা
    সারি বসিয়ে দিত। দোকান কখনোই নিজের delivery তালিকা খালি করতে পারত না।

    এখন গোনা হয় **raw client** দিয়ে, যেটা মুছে ফেলা সারিও দেখে। মানে seed
    জীবনে একবারই চলে — একদম নতুন database-এ। মালিক সব মুছে ফেললে টেবিল
    খালিই থাকে, কারণ সেটাই তিনি চেয়েছেন।
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
    /* raw client — মুছে ফেলা সারিও গোনে, নাহলে seed আবার ফিরিয়ে আনে */
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

  async board() {
    const orders = await this.prisma.db.order.findMany({
      where: {
        deletedAt: null,
        fulfillmentType: FulfillmentType.DELIVERY,
        salesStatus: { in: ['confirmed', 'completed'] },
        deliveryStatus: { in: ['unassigned', 'preparing', 'out_for_delivery', 'failed'] },
      },
      orderBy: { placedAt: 'asc' },
      take: 300,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        _count: { select: { lines: { where: { deletedAt: null } }, photos: { where: { deletedAt: null } } } },
        assignments: {
          where: { deletedAt: null, isActive: true },
          include: { rider: { select: { id: true, name: true } }, courier: { select: { id: true, name: true } } },
          take: 1,
        },
      },
    });
    return orders.map((o) => ({
      id: o.id,
      orderNo: o.orderNo,
      placedAt: o.placedAt,
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
      lineCount: o._count.lines,
      photoCount: o._count.photos,
      assignment: o.assignments[0] ?? null,
    }));
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

    const assignmentNo = await this.nextNo();
    const created = await this.prisma.db.$transaction(async (tx) => {
      if (prevActive) {
        await tx.deliveryAssignment.update({
          where: { id: prevActive.id },
          data: {
            isActive: false,
            status: prevActive.status === AssignmentStatus.FAILED ? prevActive.status : AssignmentStatus.CANCELLED,
          },
        });
      }
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
        },
        include: { rider: true, courier: true },
      });
    });

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
    await this.audit.event({
      entityType: 'Order', entityId: dto.orderId, kind: 'delivery',
      label: `Assigned to ${kind === 'RIDER' ? `rider ${riderName}` : `courier ${courierName}${dto.consignmentNo ? ` (${dto.consignmentNo})` : ''}`} — ${assignmentNo}`,
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
      let trackingUrl = a.trackingUrl;
      let consignmentNo = a.consignmentNo;
      if (dto.consignmentNo) {
        consignmentNo = dto.consignmentNo;
        if (a.courier?.trackingUrlTemplate)
          trackingUrl = a.courier.trackingUrlTemplate.replace('{cn}', dto.consignmentNo);
      }
      // DLV-R03 — the order transition carries the business rules
      await this.orders.outForDelivery(a.orderId, actorName);
      return this.prisma.db.deliveryAssignment.update({
        where: { id },
        data: { status: AssignmentStatus.OUT_FOR_DELIVERY, outAt: new Date(), consignmentNo, trackingUrl },
        include: { rider: true, courier: true },
      });
    }

    if (action === 'delivered') {
      if (a.status !== AssignmentStatus.OUT_FOR_DELIVERY)
        throw new BadRequestException(`cannot deliver from ${a.status}`);
      await this.orders.delivered(a.orderId, actorName); // COD collect + LTV mirror live there
      return this.prisma.db.deliveryAssignment.update({
        where: { id },
        data: { status: AssignmentStatus.DELIVERED, deliveredAt: new Date(), isActive: false },
        include: { rider: true, courier: true },
      });
    }

    if (action === 'fail') {
      if (a.status !== AssignmentStatus.OUT_FOR_DELIVERY && a.status !== AssignmentStatus.ASSIGNED)
        throw new BadRequestException(`cannot fail from ${a.status}`);
      if (a.status === AssignmentStatus.OUT_FOR_DELIVERY) {
        await this.orders.failDelivery(a.orderId, actorName);
      }
      return this.prisma.db.deliveryAssignment.update({
        where: { id },
        data: {
          status: AssignmentStatus.FAILED,
          failedAt: new Date(),
          failReason: dto.failReason ?? 'not specified',
          isActive: false, // DLV-R04 — retry = new assignment
        },
        include: { rider: true, courier: true },
      });
    }

    // cancel
    return this.prisma.db.deliveryAssignment.update({
      where: { id },
      data: { status: AssignmentStatus.CANCELLED, isActive: false },
      include: { rider: true, courier: true },
    });
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
    await this.prisma.db.rider.update({ where: { id }, data: { deletedAt: new Date() } });
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
    await this.prisma.db.courierService.update({ where: { id }, data: { deletedAt: new Date() } });
    return { id, deleted: true };
  }

  /* ================= areas (DEC-DLV-007) =================
     মালিক, ১ আগস্ট ২০২৬: delivery module-এর নিয়ম অনুযায়ীই সব চলবে।

     ⚠️ পর্দাটা আগে থেকেই ছিল — Zones · types · slots — কিন্তু সেটা
     `DEMO_ZONE_TREE` নিয়ে browser-এর ভেতরে বসে ছিল। মালিক charge বদলে
     refresh দিলেই সব মুছে যেত। যে পর্দা save করে না, সেটা পর্দা নয়, ছবি।

     গাছটা দুই স্তরের: parentId = null হলে মূল zone, নাহলে তার ভেতরের এলাকা।
     একই টেবিলে, কারণ দুটোই একই জিনিস — একটা জায়গা, যার ভেতরে delivery যায়। */

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
    /* raw client — মুছে ফেলা সারিও গোনে, নাহলে seed আবার ফিরিয়ে আনে */
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

    /*  একটা এলাকা তার zone নিজে ঠিক করে না — যার ভেতরে বসছে তার থেকেই পায়।
        নাহলে একদিন Dhanmondi "BANGLADESH" zone-এ বসে থাকবে আর কেউ বুঝবে না
        কেন ঢাকার তালিকায় সেটা নেই।  */
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
     মালিক: *"delivery module-এ যা edit বা change করা হয়, তা যেন auto পুরা
     system-এ কাজ করে।"* Product upload page এই তালিকাটাই দেখাবে — আর
     কিছু না। নাম বদলালে সেখানেও বদলাবে, কারণ সংযোগটা id-র, লেখার নয়। */

  async types() {
    const rows = await this.prisma.db.deliveryType.findMany({
      where: { deletedAt: null },
      orderBy: [{ zone: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        /*  ⚠️ কয়টা জায়গায় এর দাম বসানো আছে — আর এটা ছাড়া product page
            মিথ্যা বলে। নাম থাকলেও যদি কোনো এলাকায় দাম না থাকে, তাহলে
            checkout ওই delivery কখনোই দেখাবে না (DEC-DLV-009: দাম না
            থাকলে `null`)। অথচ product-এ টিক দেওয়া যেত, আর মালিক ভাবতেন
            কাজ করছে। একটা টিক যা কিছুই করে না, সেটা bug।  */
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

    /*  ⚠️ নাম বদলালে দামের সারিগুলোর `label`-ও সাথে বদলায়। ওই লেখাটা পুরনো
        পর্দা আর order form এখনো পড়ে, আর দুই জায়গায় দুই নাম থাকলে মালিক
        ভাববেন কোনটা আসল। order-এর snapshot ছোঁয়া হয় না — সেটা রসিদ।  */
    const renamed = dto.name?.trim() && dto.name.trim() !== t.name;
    const updated = await this.prisma.db.deliveryType.update({
      where: { id },
      data: {
        name: dto.name?.trim() ?? t.name,
        kind: (dto.kind ?? t.kind) as DeliveryMethodKind,
        sortOrder: dto.sortOrder ?? t.sortOrder,
        isActive: dto.isActive ?? t.isActive,
        timing: (dto.timing ?? t.timing) as DeliveryTiming,
        /*  `undefined` = form বলেনি, আগেরটাই থাক। `null` = মালিক মুছে
            দিয়েছেন। দুটো আলাদা রাখতেই হবে, নাহলে জানালা তোলা যায় না।  */
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
   * ⚠️ নাম মুছলে তার দামগুলোও যায়, কিন্তু product-এর সংযোগ **আপনাআপনি**
   * মুছে যায় (`ON DELETE CASCADE`-এর মতো আচরণ, এখানে হাতে)। নাহলে product
   * এমন একটা delivery-র দিকে দেখিয়ে থাকত যেটা আর নেই, আর checkout প্রতিবার
   * একটা খালি জায়গা খুঁজত।
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
    await this.prisma.db.deliveryMethod.update({ where: { id }, data: { deletedAt: new Date() } });
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

  private async nextNo(): Promise<string> {
    // DEC-DLV-005 — numeric max over real DLV- numbers (RTN- self-healing pattern)
    const rows = await this.prisma.db.deliveryAssignment.findMany({
      where: { assignmentNo: { startsWith: 'DLV-' } },
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
