import { ensureSingleton } from '../common/singleton';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  Offer,
  OfferMechanism,
  OfferShape,
  OfferStatus,
  OfferDiscountType,
  PaymentMethod,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import type {
  OfferWriteDto,
  ListOfferQuery,
  QuoteDto,
  QuoteResult,
  QuoteApplied,
  OfferSettingsDto,
} from './offer.dto';

/*  PRICING & OFFERS — RADIAN_OFFERS_MODULE_ARCHITECTURE.md (locked 23 Jul 2026)

    OFR-R01  applies only when approved · unpaused · in window · minSpend · target
    OFR-R02  FIRST_ORDER: ordersCount==0 AND no prior FIRST_ORDER redemption
    OFR-R03  PAYMENT shape matches the order's paymentMethod
    OFR-R04  CATEGORY/PRODUCT discount base = matching lines only
    OFR-R05  PERCENT = base×bp÷10000 capped by maxDiscount; FLAT = min(value, base)
    OFR-R06  per-customer / total limits count LIVE redemptions
    OFR-R07  stacking DEC-OFR-002: best auto + one coupon, both combinable or best single
    OFR-R08  coupon errors are human-readable, each cause distinct
    OFR-R09  below-cost detection at save ⇒ approval gate (DEC-OFR-004)
    OFR-R10  Orders re-runs the quote server-side — client preview never trusted
*/

const ENTITY = 'Offer';

const OFFER_INCLUDE = {
  category: { select: { id: true, name: true, slug: true } },
  products: { select: { id: true, name: true, slug: true } },
  _count: { select: { redemptions: { where: { deletedAt: null } } } },
} satisfies Prisma.OfferInclude;

type OfferFull = Prisma.OfferGetPayload<{ include: typeof OFFER_INCLUDE }>;

export type LiveState = 'draft' | 'pending_approval' | 'scheduled' | 'active' | 'expired' | 'paused' | 'archived';

@Injectable()
export class OffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /* ---------------- live-state (DEC-OFR-006 — derived, no cron) ---------------- */

  liveState(o: Pick<Offer, 'status' | 'startsAt' | 'endsAt'>, now = new Date()): LiveState {
    if (o.status === OfferStatus.draft) return 'draft';
    if (o.status === OfferStatus.pending_approval) return 'pending_approval';
    if (o.status === OfferStatus.paused) return 'paused';
    if (o.status === OfferStatus.archived) return 'archived';
    // approved — dates decide
    if (o.startsAt && now < o.startsAt) return 'scheduled';
    if (o.endsAt && now > o.endsAt) return 'expired';
    return 'active';
  }

  private shape(o: OfferFull) {
    return { ...o, liveState: this.liveState(o), redeemedCount: o._count.redemptions };
  }

  /* ---------------- reads ---------------- */

  async list(q: ListOfferQuery) {
    const page = Math.max(1, parseInt(q.page ?? '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(q.pageSize ?? '50', 10) || 50));
    const where: Prisma.OfferWhereInput = { deletedAt: null };
    if (q.search) {
      where.OR = [
        { name: { contains: q.search, mode: 'insensitive' } },
        { publicTitle: { contains: q.search, mode: 'insensitive' } },
        { code: { contains: q.search, mode: 'insensitive' } },
        { offerNo: { contains: q.search, mode: 'insensitive' } },
      ];
    }
    if (q.status) where.status = q.status as OfferStatus;
    if (q.mechanism) where.mechanism = q.mechanism as OfferMechanism;
    if (q.shape) where.shape = q.shape as OfferShape;

    const [rows, total] = await Promise.all([
      this.prisma.db.offer.findMany({
        where,
        include: OFFER_INCLUDE,
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.db.offer.count({ where }),
    ]);
    return {
      items: rows.map((r) => this.shape(r)),
      total, page, pageSize, totalPages: Math.ceil(total / pageSize),
    };
  }

  async findOne(id: string) {
    const o = await this.prisma.db.offer.findFirst({ where: { id, deletedAt: null }, include: OFFER_INCLUDE });
    if (!o) throw new NotFoundException('offer not found');
    return this.shape(o);
  }

  async timeline(id: string) {
    return this.audit.timeline(ENTITY, id);
  }

  async redemptions(id: string) {
    return this.prisma.db.offerRedemption.findMany({
      where: { offerId: id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        order: { select: { id: true, orderNo: true, totalPaisa: true, salesStatus: true, placedAt: true } },
        customer: { select: { id: true, name: true, phone: true } },
      },
    });
  }

  /** approvals queue — everything the gate is holding (DEC-OFR-004) */
  async approvalsQueue() {
    const rows = await this.prisma.db.offer.findMany({
      where: { deletedAt: null, status: OfferStatus.pending_approval },
      include: OFFER_INCLUDE,
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((r) => this.shape(r));
  }

  /* ---------------- write ---------------- */

  async create(dto: OfferWriteDto) {
    const actorName = dto.actorName ?? 'Admin';
    const data = await this.buildWrite(dto, null);
    const offerNo = await this.nextOfferNo();

    const created = await this.prisma.db.offer.create({
      data: { ...data, offerNo, actorName },
      include: OFFER_INCLUDE,
    });
    await this.audit.record({ entityType: ENTITY, entityId: created.id, action: 'CREATE', actorName });
    await this.audit.event({
      entityType: ENTITY, entityId: created.id, kind: 'general',
      label: `Offer ${offerNo} created (${created.status})`, actorName,
    });
    return this.shape(created);
  }

  async update(id: string, dto: OfferWriteDto) {
    const actorName = dto.actorName ?? 'Admin';
    const existing = await this.prisma.db.offer.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('offer not found');

    const data = await this.buildWrite(dto, existing);
    const updated = await this.prisma.db.offer.update({
      where: { id },
      data: {
        ...data,
        ...(dto.productIds ? { products: { set: dto.productIds.map((pid) => ({ id: pid })) } } : {}),
      },
      include: OFFER_INCLUDE,
    });
    await this.audit.record({
      entityType: ENTITY, entityId: id, action: 'UPDATE', actorName,
      changes: { edit: dto as unknown as Record<string, unknown> },
    });
    return this.shape(updated);
  }

  async approve(id: string, actorName = 'Admin') {
    const o = await this.prisma.db.offer.findFirst({ where: { id, deletedAt: null } });
    if (!o) throw new NotFoundException('offer not found');
    if (o.status !== OfferStatus.pending_approval)
      throw new BadRequestException(`only a pending offer can be approved (is ${o.status})`);
    const updated = await this.prisma.db.offer.update({
      where: { id },
      data: { status: OfferStatus.approved, approvedBy: actorName, approvedAt: new Date() },
      include: OFFER_INCLUDE,
    });
    await this.audit.event({ entityType: ENTITY, entityId: id, kind: 'general', label: 'Offer approved', actorName });
    return this.shape(updated);
  }

  async rejectToDraft(id: string, actorName = 'Admin', note?: string) {
    const o = await this.prisma.db.offer.findFirst({ where: { id, deletedAt: null } });
    if (!o) throw new NotFoundException('offer not found');
    if (o.status !== OfferStatus.pending_approval)
      throw new BadRequestException(`only a pending offer can be declined (is ${o.status})`);
    const updated = await this.prisma.db.offer.update({
      where: { id },
      data: { status: OfferStatus.draft },
      include: OFFER_INCLUDE,
    });
    await this.audit.event({
      entityType: ENTITY, entityId: id, kind: 'general',
      label: `Offer declined back to draft${note ? ` — ${note}` : ''}`, actorName,
    });
    return this.shape(updated);
  }

  async pause(id: string, actorName = 'Admin') {
    return this.setStatus(id, OfferStatus.paused, 'Offer paused', actorName, [OfferStatus.approved]);
  }

  async resume(id: string, actorName = 'Admin') {
    return this.setStatus(id, OfferStatus.approved, 'Offer resumed', actorName, [OfferStatus.paused]);
  }

  async archive(id: string, actorName = 'Admin') {
    return this.setStatus(id, OfferStatus.archived, 'Offer archived', actorName, null);
  }

  async remove(id: string, actorName = 'Admin') {
    const o = await this.prisma.db.offer.findFirst({ where: { id, deletedAt: null } });
    if (!o) throw new NotFoundException('offer not found');
    await this.prisma.db.offer.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.record({ entityType: ENTITY, entityId: id, action: 'DELETE', actorName });
    return { id, deleted: true };
  }

  private async setStatus(
    id: string, to: OfferStatus, label: string, actorName: string, allowedFrom: OfferStatus[] | null,
  ) {
    const o = await this.prisma.db.offer.findFirst({ where: { id, deletedAt: null } });
    if (!o) throw new NotFoundException('offer not found');
    if (allowedFrom && !allowedFrom.includes(o.status))
      throw new BadRequestException(`cannot go ${o.status} → ${to}`);
    const updated = await this.prisma.db.offer.update({ where: { id }, data: { status: to }, include: OFFER_INCLUDE });
    await this.audit.event({ entityType: ENTITY, entityId: id, kind: 'general', label, actorName });
    return this.shape(updated);
  }

  /* ---------------- write helpers ---------------- */

  private async buildWrite(dto: OfferWriteDto, existing: Offer | null) {
    const mechanism = (dto.mechanism ?? existing?.mechanism ?? 'AUTOMATIC') as OfferMechanism;
    const shape = (dto.shape ?? existing?.shape ?? 'SITEWIDE') as OfferShape;
    const discountType = (dto.discountType ?? existing?.discountType ?? 'PERCENT') as OfferDiscountType;
    const discountValue = dto.discountValue ?? existing?.discountValue ?? 0;

    if (!existing && !dto.name?.trim()) throw new BadRequestException('name is required');

    // coupon code discipline (DEC-OFR-005)
    let code: string | null | undefined = undefined;
    if (mechanism === 'COUPON') {
      const raw = (dto.code ?? existing?.code ?? '').trim().toUpperCase();
      if (!raw) throw new BadRequestException('a coupon offer needs a code');
      if (!/^[A-Z0-9_-]{3,24}$/.test(raw))
        throw new BadRequestException('code: 3–24 chars, letters/numbers/-/_ only');
      const dupe = await this.prisma.db.offer.findFirst({
        where: { code: raw, deletedAt: null, ...(existing ? { id: { not: existing.id } } : {}) },
        select: { id: true },
      });
      if (dupe) throw new BadRequestException(`code ${raw} is already used by another offer`);
      code = raw;
    } else {
      code = null;
    }

    if (discountType === 'PERCENT' && (discountValue < 0 || discountValue > 10000))
      throw new BadRequestException('percent discount must be 0–10000 basis points');
    if (discountType === 'FLAT' && discountValue < 0)
      throw new BadRequestException('flat discount cannot be negative');

    // shape targeting sanity
    if (shape === 'CATEGORY') {
      const catId = dto.categoryId ?? existing?.categoryId;
      if (!catId) throw new BadRequestException('CATEGORY offer needs categoryId');
      const cat = await this.prisma.db.category.findFirst({ where: { id: catId } });
      if (!cat) throw new BadRequestException('categoryId not found');
    }
    if (shape === 'PRODUCT') {
      const ids = dto.productIds ?? [];
      if (!existing && ids.length === 0) throw new BadRequestException('PRODUCT offer needs productIds');
    }
    if (shape === 'PAYMENT') {
      const pm = dto.paymentMethod ?? existing?.paymentMethod;
      if (!pm) throw new BadRequestException('PAYMENT offer needs paymentMethod');
    }

    // DEC-OFR-004 gate: threshold % + below-cost (OFR-R09)
    const settings = await this.settings();
    let status = existing?.status ?? OfferStatus.draft;
    let belowCostFlag = existing?.belowCostFlag ?? false;

    if (dto.submit) {
      belowCostFlag = await this.detectBelowCost({ shape, discountType, discountValue, dto, existing });
      const overThreshold =
        settings.approvalThresholdBp > 0 &&
        discountType === 'PERCENT' &&
        discountValue >= settings.approvalThresholdBp;
      status = belowCostFlag || overThreshold ? OfferStatus.pending_approval : OfferStatus.approved;
    }

    return {
      name: dto.name?.trim() ?? existing?.name ?? '',
      internalNote: dto.internalNote ?? existing?.internalNote,
      publicTitle: dto.publicTitle ?? existing?.publicTitle,
      benefitLine: dto.benefitLine ?? existing?.benefitLine,
      description: dto.description ?? existing?.description,
      mechanism, shape, status, code,
      discountType, discountValue,
      maxDiscountPaisa: dto.maxDiscountPaisa === undefined ? existing?.maxDiscountPaisa : dto.maxDiscountPaisa,
      minSpendPaisa: dto.minSpendPaisa === undefined ? existing?.minSpendPaisa : dto.minSpendPaisa,
      perCustomerLimit: dto.perCustomerLimit === undefined ? existing?.perCustomerLimit : dto.perCustomerLimit,
      totalLimit: dto.totalLimit === undefined ? existing?.totalLimit : dto.totalLimit,
      categoryId: shape === 'CATEGORY' ? (dto.categoryId ?? existing?.categoryId) : null,
      paymentMethod:
        shape === 'PAYMENT'
          ? ((dto.paymentMethod ?? existing?.paymentMethod) as PaymentMethod)
          : null,
      combinable: dto.combinable ?? existing?.combinable ?? settings.defaultCombinable,
      priority: dto.priority ?? existing?.priority ?? 0,
      scarcity: dto.scarcity ?? existing?.scarcity ?? false,
      bonusLines: dto.bonusLines ?? existing?.bonusLines ?? [],
      guaranteeText: dto.guaranteeText === undefined ? existing?.guaranteeText : dto.guaranteeText,
      startsAt: dto.startsAt === undefined ? existing?.startsAt : dto.startsAt ? new Date(dto.startsAt) : null,
      endsAt: dto.endsAt === undefined ? existing?.endsAt : dto.endsAt ? new Date(dto.endsAt) : null,
      belowCostFlag,
      ...(dto.productIds && !existing
        ? { products: { connect: dto.productIds.map((pid) => ({ id: pid })) } }
        : {}),
    };
  }

  /** OFR-R09 — cheapest targeted product's offer price − discount < cost ⇒ flag. */
  private async detectBelowCost(args: {
    shape: OfferShape;
    discountType: OfferDiscountType;
    discountValue: number;
    dto: OfferWriteDto;
    existing: Offer | null;
  }): Promise<boolean> {
    const { shape, discountType, discountValue, dto, existing } = args;
    if (discountType === 'FREE_DELIVERY') return false;

    let where: Prisma.ProductWhereInput = { deletedAt: null, isPublished: true };
    if (shape === 'CATEGORY') {
      const catId = dto.categoryId ?? existing?.categoryId;
      if (!catId) return false;
      where = { ...where, OR: [{ categoryId: catId }, { category: { parentId: catId } }] };
    } else if (shape === 'PRODUCT') {
      const ids =
        dto.productIds ??
        (existing
          ? (
              await this.prisma.db.offer.findFirst({
                where: { id: existing.id },
                select: { products: { select: { id: true } } },
              })
            )?.products.map((p) => p.id) ?? []
          : []);
      if (!ids.length) return false;
      where = { ...where, id: { in: ids } };
    }
    // SITEWIDE/FIRST_ORDER/PAYMENT sweep the whole live catalogue

    const products = await this.prisma.db.product.findMany({
      where,
      select: { sellingPricePaisa: true, discountType: true, discountValue: true, costPaisa: true },
      take: 500,
    });
    for (const p of products) {
      const offerPrice = this.productOfferPaisa(p.sellingPricePaisa, p.discountType, p.discountValue);
      const off =
        discountType === 'PERCENT'
          ? Math.round((offerPrice * discountValue) / 10000)
          : Math.min(discountValue, offerPrice);
      if (offerPrice - off < p.costPaisa) return true;
    }
    return false;
  }

  private productOfferPaisa(selling: number, type: string, value: number): number {
    if (type === 'FLAT') return Math.max(0, selling - value);
    if (type === 'PERCENT') return Math.round(selling * (1 - value / 10000));
    return selling;
  }

  /* ================= QUOTE ENGINE (OFR-R01…R10) ================= */

  async quote(dto: QuoteDto): Promise<QuoteResult> {
    if (!dto.lines?.length) throw new BadRequestException('quote needs lines');
    const now = new Date();

    // price the cart the same way Orders does (frozen at product offer price)
    const products = await this.prisma.db.product.findMany({
      where: { id: { in: dto.lines.map((l) => l.productId) } },
      select: {
        id: true, name: true, categoryId: true, costPaisa: true,
        sellingPricePaisa: true, discountType: true, discountValue: true,
        category: { select: { id: true, parentId: true } },
      },
    });
    const pMap = new Map(products.map((p) => [p.id, p]));
    const lines = dto.lines.map((l) => {
      const p = pMap.get(l.productId);
      if (!p) throw new BadRequestException(`productId ${l.productId} not found`);
      const unit = l.unitPaisa ?? this.productOfferPaisa(p.sellingPricePaisa, p.discountType, p.discountValue);
      return { ...l, unitPaisa: unit, linePaisa: unit * Math.max(1, l.qty), product: p };
    });
    const subtotalPaisa = lines.reduce((s, l) => s + l.linePaisa, 0);
    const deliveryPaisa = Math.max(0, dto.deliveryPaisa ?? 0);

    const customer = dto.customerId
      ? await this.prisma.db.customer.findFirst({
          where: { id: dto.customerId },
          select: { id: true, ordersCount: true },
        })
      : null;

    // candidates: everything approved+live-now
    const candidates = await this.prisma.db.offer.findMany({
      where: {
        deletedAt: null,
        status: OfferStatus.approved,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
      },
      include: { products: { select: { id: true } } },
    });

    const skipped: { name: string; reason: string }[] = [];
    type Scored = { offer: (typeof candidates)[number]; discountPaisa: number; freeDelivery: boolean };

    const score = async (o: (typeof candidates)[number]): Promise<Scored | string> => {
      // OFR-R01 minSpend
      if (o.minSpendPaisa && subtotalPaisa < o.minSpendPaisa)
        return `needs min spend ৳${Math.round(o.minSpendPaisa / 100)}`;
      // OFR-R03 payment
      if (o.shape === 'PAYMENT' && (!dto.paymentMethod || dto.paymentMethod !== o.paymentMethod))
        return `only with ${o.paymentMethod}`;
      // OFR-R02 first order
      if (o.shape === 'FIRST_ORDER') {
        if (!customer) return 'needs an identified customer';
        if (customer.ordersCount > 0) return 'not a first order';
        const prior = await this.prisma.db.offerRedemption.count({
          where: { customerId: customer.id, deletedAt: null, offer: { shape: 'FIRST_ORDER' } },
        });
        if (prior > 0) return 'welcome offer already used';
      }
      // OFR-R06 limits
      if (o.totalLimit) {
        const used = await this.prisma.db.offerRedemption.count({
          where: { offerId: o.id, deletedAt: null },
        });
        if (used >= o.totalLimit) return 'fully redeemed';
      }
      if (o.perCustomerLimit && customer) {
        const mine = await this.prisma.db.offerRedemption.count({
          where: { offerId: o.id, customerId: customer.id, deletedAt: null },
        });
        if (mine >= o.perCustomerLimit) return 'limit reached for this customer';
      }
      // OFR-R04 base
      let base = subtotalPaisa;
      if (o.shape === 'CATEGORY') {
        base = lines
          .filter(
            (l) =>
              l.product.categoryId === o.categoryId ||
              l.product.category?.parentId === o.categoryId,
          )
          .reduce((s, l) => s + l.linePaisa, 0);
        if (base === 0) return 'no items from that category';
      } else if (o.shape === 'PRODUCT') {
        const ids = new Set(o.products.map((p) => p.id));
        base = lines.filter((l) => ids.has(l.productId)).reduce((s, l) => s + l.linePaisa, 0);
        if (base === 0) return 'no matching product in the cart';
      }
      // OFR-R05 discount
      if (o.discountType === 'FREE_DELIVERY' || o.shape === 'FREE_DELIVERY') {
        if (deliveryPaisa === 0) return 'no delivery charge to waive';
        return { offer: o, discountPaisa: 0, freeDelivery: true };
      }
      let off =
        o.discountType === 'PERCENT'
          ? Math.round((base * o.discountValue) / 10000)
          : Math.min(o.discountValue, base);
      if (o.maxDiscountPaisa) off = Math.min(off, o.maxDiscountPaisa);
      if (off <= 0) return 'discount rounds to zero';
      return { offer: o, discountPaisa: off, freeDelivery: false };
    };

    /*
      ⚠️ WHAT AN OFFER IS WORTH — and free delivery is worth the delivery fee.

      This comparison read `discountPaisa` alone. A FREE_DELIVERY offer scores
      `discountPaisa: 0` and carries its value in `freeDelivery: true`, so it
      lost to every money offer on the shop, always, by nought to anything.

      Found live on 24 Aug 2026 with four test offers running: the product
      page advertised "Free delivery on orders over ৳3,000" and the cart
      charged the ৳150 anyway. Pause the money offers and it worked, which is
      why it had never been noticed — one offer at a time hides it completely.

      That matters more here than it would in most shops. Delivery IS Radian's
      promise; free delivery is the promotion this shop is most likely to run,
      and it was the one shape guaranteed to be thrown away.

      The fix is the sum the code already knew how to write — twenty lines
      below, the coupon-versus-automatic branch has always compared
      `discountPaisa + (freeDelivery ? deliveryPaisa : 0)`. The knowledge was
      there and was applied in one of the two places that needed it.
    */
    const worth = (s: Scored) => s.discountPaisa + (s.freeDelivery ? deliveryPaisa : 0);

    // best automatic
    let bestAuto: Scored | null = null;
    for (const o of candidates.filter((c) => c.mechanism === 'AUTOMATIC')) {
      const r = await score(o);
      if (typeof r === 'string') {
        skipped.push({ name: o.name, reason: r });
        continue;
      }
      const better =
        !bestAuto ||
        worth(r) > worth(bestAuto) ||
        (worth(r) === worth(bestAuto) && r.offer.priority > bestAuto.offer.priority);
      if (better) {
        if (bestAuto) skipped.push({ name: bestAuto.offer.name, reason: 'beaten by a better automatic offer' });
        bestAuto = r;
      } else {
        skipped.push({ name: o.name, reason: 'beaten by a better automatic offer' });
      }
    }

    // the typed coupon (OFR-R08)
    let couponScored: Scored | null = null;
    let couponError: string | undefined;
    if (dto.couponCode?.trim()) {
      const codeUp = dto.couponCode.trim().toUpperCase();
      const c = await this.prisma.db.offer.findFirst({
        where: { code: codeUp, deletedAt: null },
        include: { products: { select: { id: true } } },
      });
      if (!c) couponError = `code ${codeUp} does not exist`;
      else {
        const ls = this.liveState(c, now);
        if (ls === 'draft' || ls === 'pending_approval') couponError = `${codeUp} is not live yet`;
        else if (ls === 'paused') couponError = `${codeUp} is paused`;
        else if (ls === 'scheduled') couponError = `${codeUp} has not started yet`;
        else if (ls === 'expired') couponError = `${codeUp} has expired`;
        else if (ls === 'archived') couponError = `${codeUp} is no longer running`;
        else {
          const r = await score(c);
          if (typeof r === 'string') couponError = `${codeUp}: ${r}`;
          else couponScored = r;
        }
      }
    }

    // OFR-R07 / DEC-OFR-002 stacking
    const applied: Scored[] = [];
    if (bestAuto && couponScored) {
      if (bestAuto.offer.combinable && couponScored.offer.combinable) {
        applied.push(bestAuto, couponScored);
      } else {
        /*  Same sum as `worth()` above — one helper now, so the two can never
            drift into disagreeing about what an offer is worth.  */
        const autoVal = worth(bestAuto);
        const cpnVal = worth(couponScored);
        if (cpnVal >= autoVal) {
          applied.push(couponScored);
          skipped.push({ name: bestAuto.offer.name, reason: 'not combinable with the coupon' });
        } else {
          applied.push(bestAuto);
          skipped.push({
            name: couponScored.offer.name,
            reason: 'the automatic offer is bigger and they are not combinable',
          });
          couponError = `${couponScored.offer.code}: automatic offer gives more — coupon not applied`;
          couponScored = null;
        }
      }
    } else if (bestAuto) applied.push(bestAuto);
    else if (couponScored) applied.push(couponScored);

    // never below zero (DEC-OFR-009)
    let discountPaisa = applied.reduce((s, a) => s + a.discountPaisa, 0);
    discountPaisa = Math.min(discountPaisa, subtotalPaisa);
    const deliveryWaivedPaisa = applied.some((a) => a.freeDelivery) ? deliveryPaisa : 0;

    const appliedOut: QuoteApplied[] = applied.map((a) => ({
      offerId: a.offer.id,
      offerNo: a.offer.offerNo,
      name: a.offer.name,
      mechanism: a.offer.mechanism,
      shape: a.offer.shape,
      code: a.offer.code,
      discountPaisa: a.discountPaisa,
      freeDelivery: a.freeDelivery,
    }));

    return { subtotalPaisa, discountPaisa, deliveryWaivedPaisa, applied: appliedOut, couponError, skipped };
  }

  /**
   * Called by OrdersService inside order create (OFR-R10). Re-quotes and writes
   * redemption rows in the caller's transaction. Returns the money to stamp.
   */
  async applyToOrder(
    tx: Prisma.TransactionClient,
    args: {
      orderId: string;
      customerId: string;
      quote: QuoteResult;
      actorName: string;
    },
  ) {
    for (const a of args.quote.applied) {
      await tx.offerRedemption.create({
        data: {
          offerId: a.offerId,
          orderId: args.orderId,
          customerId: args.customerId,
          code: a.code,
          discountPaisa: a.discountPaisa,
          freeDelivery: a.freeDelivery,
        },
      });
    }
  }

  /** DEC-OFR-008 — order cancelled ⇒ release the slots. */
  async releaseForOrder(orderId: string) {
    await this.prisma.db.offerRedemption.updateMany({
      where: { orderId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  /* ---------------- analytics (server-side — D1 lesson) ---------------- */

  async analytics(days = 30) {
    const since = new Date(Date.now() - days * 86400000);
    const reds = await this.prisma.db.offerRedemption.findMany({
      where: { deletedAt: null, createdAt: { gte: since } },
      include: {
        offer: { select: { id: true, name: true, shape: true, mechanism: true, code: true } },
        order: { select: { totalPaisa: true, salesStatus: true } },
        customer: { select: { id: true, ordersCount: true } },
      },
    });
    type Row = {
      offerId: string; name: string; shape: string; mechanism: string; code: string | null;
      redemptions: number; revenuePaisa: number; discountPaisa: number; newCustomers: number;
    };
    const by = new Map<string, Row>();
    for (const r of reds) {
      const row =
        by.get(r.offerId) ??
        {
          offerId: r.offerId, name: r.offer.name, shape: r.offer.shape,
          mechanism: r.offer.mechanism, code: r.offer.code,
          redemptions: 0, revenuePaisa: 0, discountPaisa: 0, newCustomers: 0,
        };
      row.redemptions += 1;
      row.revenuePaisa += r.order.totalPaisa;
      row.discountPaisa += r.discountPaisa;
      if (r.customer.ordersCount <= 1) row.newCustomers += 1;
      by.set(r.offerId, row);
    }
    const leaderboard = Array.from(by.values()).sort((a, b) => b.redemptions - a.redemptions);
    const totals = leaderboard.reduce(
      (t, r) => ({
        redemptions: t.redemptions + r.redemptions,
        revenuePaisa: t.revenuePaisa + r.revenuePaisa,
        discountPaisa: t.discountPaisa + r.discountPaisa,
        newCustomers: t.newCustomers + r.newCustomers,
      }),
      { redemptions: 0, revenuePaisa: 0, discountPaisa: 0, newCustomers: 0 },
    );
    const liveCount = (
      await this.prisma.db.offer.findMany({
        where: { deletedAt: null, status: OfferStatus.approved },
        select: { status: true, startsAt: true, endsAt: true },
      })
    ).filter((o) => this.liveState(o) === 'active').length;
    return { days, totals, liveCount, leaderboard };
  }

  /* ---------------- settings ---------------- */

  async settings() {
    // ensureSingleton — survives two requests creating this row at once (P2002)
    return ensureSingleton(
      () => this.prisma.db.offerSetting.findFirst({ where: { id: 'singleton' } }),
      () => this.prisma.db.offerSetting.create({ data: { id: 'singleton' } }),
    );
  }

  async updateSettings(dto: OfferSettingsDto) {
    await this.settings();
    return this.prisma.db.offerSetting.update({
      where: { id: 'singleton' },
      data: {
        approvalThresholdBp: dto.approvalThresholdBp,
        defaultCombinable: dto.defaultCombinable,
      },
    });
  }

  /* ---------------- helpers ---------------- */

  private async nextOfferNo(): Promise<string> {
    // DEC-OFR-005 — numeric max over real OFR- numbers (RTN- self-healing pattern)
    const rows = await this.prisma.db.offer.findMany({
      where: { offerNo: { startsWith: 'OFR-' } },
      select: { offerNo: true },
    });
    let max = 0;
    for (const row of rows) {
      const m = /^OFR-(\d{4,})$/.exec(row.offerNo);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > max) max = n;
      }
    }
    return `OFR-${String(max + 1).padStart(6, '0')}`;
  }
}
