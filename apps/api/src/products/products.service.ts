import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, DiscountType, ProductType, ProductZone } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import {
  CreateProductDto,
  UpdateProductDto,
  ListProductQuery,
  ProductVariantInput,
} from './product.dto';
import { paidPaisa } from '../common/discount-window';

const ENTITY = 'Product';

// child সহ পূর্ণ product ফেরত
// nested include soft-delete extension ধরে না — তাই প্রতিটা to-many-তে explicit filter
const NOT_DELETED = { deletedAt: null };
const FULL_INCLUDE = {
  category: true,
  /*
    DEC-ITM-002 — the physical thing behind the listing, and through it
    DEC-SUP-004, whoever supplies it.

    Added 1 Aug 2026 for the product editor's TRACKED mode. The owner picks an
    Item; the vendor is NOT a second choice he makes, it is a fact the Item
    already carries. Asking for it again would put "who supplies this" in two
    places and let them disagree.

    ⚠️ Only what the editor draws. `Item.costPaisa` and the recipe stay out —
    this is the product screen, not the stockroom.
  */
  /*  the vendor who MAKES this listing — nothing of ours is stocked for it  */
  supplier: {
    select: {
      id: true,
      name: true,
      nickname: true,
      notifyChannel: true,
      notifyMode: true,
      leadTimeHours: true,
    },
  },
  item: {
    select: {
      id: true,
      sku: true,
      name: true,
      isStockTracked: true,
      supplier: {
        select: {
          id: true,
          name: true,
          nickname: true,
          notifyChannel: true,
          notifyMode: true,
          leadTimeHours: true,
        },
      },
    },
  },
  tags: { where: NOT_DELETED },
  variantGroup: true,
  images: { where: NOT_DELETED, orderBy: { sortOrder: 'asc' } },
  sizes: { where: NOT_DELETED, orderBy: { sortOrder: 'asc' } },
  specRows: { where: NOT_DELETED, orderBy: { sortOrder: 'asc' } },
  faqs: { where: NOT_DELETED, orderBy: { sortOrder: 'asc' } },
  trustBadges: { where: NOT_DELETED, orderBy: { sortOrder: 'asc' } },
  /*  DEC-DLV-008 — কোন কোন delivery-তে যেতে পারে। editor এটা দিয়েই
      chip-গুলো আবার টিক করে দেয়।  */
  deliveryTypes: { select: { typeId: true } },
  /*  DEC-PRD-012 — রঙ / ফ্লেভার / মাপ, প্রতিটার নিজের ছবি-মজুদ-দাম নিয়ে।
      master-এর নাম আর রঙও সাথে আসে, নাহলে editor আর storefront দুজনকেই
      আলাদা করে সেটা খুঁজতে হতো।  */
  variants: {
    where: NOT_DELETED,
    orderBy: { sortOrder: 'asc' },
    include: {
      variantValue: {
        select: {
          id: true, label: true, swatch: true, imageUrl: true,
          attribute: { select: { id: true, name: true, displayMode: true } },
        },
      },
      /*  DEC-PRD-015 — কোন Item এই রঙটার মজুদ রাখে। নাম আর code দুটোই
          লাগে, কারণ editor বাছার পর সেটা লিখে দেখায় — id দেখিয়ে কারও
          কাজ হয় না।  */
      item: { select: { id: true, sku: true, name: true } },
    },
  },
} satisfies Prisma.ProductInclude;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /* ---------------- analytics (funnel · Phase 1) ----------------
     Bottom of the funnel only — orders / delivered / revenue / refunds come
     from OUR database and are authoritative. View / add-to-cart / checkout
     come from web analytics later; never mixed with money numbers. */

  /*  A window, not just a length.

      This used to take only a number of days and always count back from today,
      which meant nothing could ask it about a past period — "last March" was
      impossible. Intelligence's Reports centre worked around it by computing a
      day count from the chosen dates and then LABELLING the answer with those
      dates, so a request for March returned the last 31 days to today under a
      March heading. Found in the 29 Jul review.
      The fix belongs here, not there: a report may not quietly redefine what
      the owning module measured. */
  private async funnelRows(window: number | { from: Date; to: Date }, productId?: string) {
    const since = typeof window === 'number' ? new Date(Date.now() - window * 86400000) : window.from;
    const until = typeof window === 'number' ? undefined : window.to;
    const lines = await this.prisma.db.orderLine.findMany({
      where: {
        ...(productId ? { productId } : {}),
        order: { deletedAt: null, placedAt: until ? { gte: since, lte: until } : { gte: since } },
      },
      select: {
        productId: true,
        qty: true,
        linePaisa: true,
        discountPaisa: true,
        refundPaisa: true,
        order: {
          select: {
            id: true,
            placedAt: true,
            salesStatus: true,
            deliveryStatus: true,
          },
        },
      },
    });

    type Agg = {
      productId: string;
      orderIds: Set<string>;
      cancelledIds: Set<string>;
      deliveredIds: Set<string>;
      units: number;
      revenuePaisa: number;
      refundPaisa: number;
    };
    const map = new Map<string, Agg>();
    for (const l of lines) {
      let a = map.get(l.productId);
      if (!a) {
        a = {
          productId: l.productId,
          orderIds: new Set(),
          cancelledIds: new Set(),
          deliveredIds: new Set(),
          units: 0,
          revenuePaisa: 0,
          refundPaisa: 0,
        };
        map.set(l.productId, a);
      }
      const cancelled = l.order.salesStatus === 'cancelled';
      a.orderIds.add(l.order.id);
      if (cancelled) a.cancelledIds.add(l.order.id);
      if (l.order.deliveryStatus === 'delivered') a.deliveredIds.add(l.order.id);
      if (!cancelled) {
        a.units += l.qty;
        a.revenuePaisa += l.linePaisa - (l.discountPaisa ?? 0);
      }
      a.refundPaisa += l.refundPaisa ?? 0;
    }
    return { lines, map };
  }

  /** catalog-wide: one row per product that sold in the window */
  /**  `analytics(30)` — the last 30 days, as before.
   *   `analytics({ from, to })` — an exact window, for a report that names dates.
   */
  async analytics(window: number | { from: Date; to: Date } = 30) {
    const { map } = await this.funnelRows(window);
    const days = typeof window === 'number'
      ? window
      : Math.max(1, Math.round((window.to.getTime() - window.from.getTime()) / 86400000));
    const products = await this.prisma.db.product.findMany({
      select: {
        id: true,
        slug: true,
        sku: true,
        name: true,
        costPaisa: true,
        sellingPricePaisa: true,
        discountType: true,
        discountValue: true,
        salesCount: true,
        stockQty: true,
        isPublished: true,
        category: { select: { id: true, name: true } },
      },
    });

    const items = products.map((p) => {
      const a = map.get(p.id);
      const orders = a ? a.orderIds.size - a.cancelledIds.size : 0;
      const revenuePaisa = a?.revenuePaisa ?? 0;
      const offer = this.withOffer(p as never) as unknown as {
        offerPricePaisa: number;
      };
      const unitMargin = offer.offerPricePaisa - p.costPaisa;
      return {
        productId: p.id,
        slug: p.slug,
        sku: p.sku,
        name: p.name,
        categoryId: p.category?.id ?? null,
        categoryName: p.category?.name ?? null,
        isPublished: p.isPublished,
        stockQty: p.stockQty,
        orders,
        cancelled: a?.cancelledIds.size ?? 0,
        delivered: a?.deliveredIds.size ?? 0,
        units: a?.units ?? 0,
        revenuePaisa,
        refundPaisa: a?.refundPaisa ?? 0,
        marginPaisa: (a?.units ?? 0) * unitMargin,
        // top of funnel — not tracked yet (Phase 2)
        views: null as number | null,
        addToCarts: null as number | null,
        checkouts: null as number | null,
      };
    });

    const totals = items.reduce(
      (t, i) => ({
        orders: t.orders + i.orders,
        delivered: t.delivered + i.delivered,
        cancelled: t.cancelled + i.cancelled,
        units: t.units + i.units,
        revenuePaisa: t.revenuePaisa + i.revenuePaisa,
        refundPaisa: t.refundPaisa + i.refundPaisa,
        marginPaisa: t.marginPaisa + i.marginPaisa,
      }),
      {
        orders: 0,
        delivered: 0,
        cancelled: 0,
        units: 0,
        revenuePaisa: 0,
        refundPaisa: 0,
        marginPaisa: 0,
      },
    );

    return { days, trackingConnected: false, totals, items };
  }

  /** one product + a daily series for the trend chart */
  async productAnalytics(id: string, days = 30) {
    const product = await this.prisma.db.product.findFirst({
      where: { id },
      include: { category: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const { lines, map } = await this.funnelRows(days, id);
    const a = map.get(id);

    const daily = new Map<string, { date: string; orders: number; units: number; revenuePaisa: number }>();
    const seen = new Set<string>();
    for (const l of lines) {
      const date = l.order.placedAt.toISOString().slice(0, 10);
      let d = daily.get(date);
      if (!d) {
        d = { date, orders: 0, units: 0, revenuePaisa: 0 };
        daily.set(date, d);
      }
      const key = `${date}|${l.order.id}`;
      if (!seen.has(key) && l.order.salesStatus !== 'cancelled') {
        seen.add(key);
        d.orders += 1;
      }
      if (l.order.salesStatus !== 'cancelled') {
        d.units += l.qty;
        d.revenuePaisa += l.linePaisa - (l.discountPaisa ?? 0);
      }
    }

    const withOffer = this.withOffer(product as never) as unknown as {
      offerPricePaisa: number;
    };
    const unitMargin = withOffer.offerPricePaisa - product.costPaisa;

    return {
      days,
      trackingConnected: false,
      product: this.withOffer(product as never),
      funnel: {
        views: null as number | null,
        addToCarts: null as number | null,
        checkouts: null as number | null,
        orders: a ? a.orderIds.size - a.cancelledIds.size : 0,
        delivered: a?.deliveredIds.size ?? 0,
        cancelled: a?.cancelledIds.size ?? 0,
      },
      money: {
        units: a?.units ?? 0,
        revenuePaisa: a?.revenuePaisa ?? 0,
        refundPaisa: a?.refundPaisa ?? 0,
        marginPaisa: (a?.units ?? 0) * unitMargin,
      },
      daily: [...daily.values()].sort((x, y) => x.date.localeCompare(y.date)),
    };
  }

  /* ---------------- read ---------------- */

  async list(q: ListProductQuery) {
    const page = Math.max(1, parseInt(q.page ?? '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(q.pageSize ?? '20', 10) || 20));

    const where: Prisma.ProductWhereInput = {};
    if (q.search) {
      where.OR = [
        { name: { contains: q.search, mode: 'insensitive' } },
        { slug: { contains: q.search, mode: 'insensitive' } },
      ];
    }
    if (q.categoryId) where.categoryId = q.categoryId;
    if (q.productType) where.productType = q.productType as ProductType;
    if (q.zone) where.zone = q.zone as ProductZone;
    if (q.published === 'true') where.isPublished = true;
    if (q.published === 'false') where.isPublished = false;

    const [items, total] = await Promise.all([
      this.prisma.db.product.findMany({
        where,
        include: {
          category: true,
          tags: { where: NOT_DELETED },
          /* NST-REV-2 (30 Jul) — the neighbour above filters and this one did not, so a
             deleted add-on group kept appearing on the product list. `AddOnGroup` does
             carry `deletedAt`; the nested include just is not reached by the soft-delete
             extension. One line filtered, the line under it not — that is what these
             gaps look like from the outside. */
          manualAddOnGroups: { where: NOT_DELETED, select: { id: true, name: true } },
          /*  The main photo, and only that one — a list draws a thumbnail, not
              a gallery. Without it every row on Products → All products showed
              the same tinted square, so a shop with eight products had eight
              identical rows and the owner could not tell which one he had just
              given pictures to. (1 Aug 2026) */
          images: {
            where: NOT_DELETED,
            orderBy: { sortOrder: 'asc' },
            take: 1,
            select: { id: true, url: true, sortOrder: true },
          },
          /*  PENDING G1 — the vendor badge on the list. Only the supplier's
              name; the list is a row, not a supplier page.  */
          item: {
            select: {
              id: true,
              sku: true,
              supplier: { select: { id: true, name: true, nickname: true } },
            },
          },
          /*  DEC-PRD-014 — variant থাকলে মজুদ তাদের ঘরে। তালিকার প্রতিটা
              সারি, Stock page আর Overview-এর "out of stock" গোনা — সবই
              `stockQty` পড়ে, তাই সংখ্যাটা এখানেই ঠিক করে পাঠানো হয়।  */
          variants: {
            where: { deletedAt: null, isActive: true },
            select: { stockQty: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.db.product.count({ where }),
    ]);

    return {
      /*
        DEC-PRD-014 — মালিক, ২ আগস্ট ২০২৬: *"variant থাকলে variant-এর
        stock-ই চলবে, product-এর ঘরটা তখন যোগফল দেখাবে।"*

        ⚠️ কলামটা বদলানো হয় না, শুধু **উত্তরটা** বদলে যায়। ঘরে হাতে লেখা
        পুরনো সংখ্যাটা রয়ে যায় — মালিক variant-গুলো তুলে দিলে সেটাই আবার
        চলবে। দুটো সংখ্যা রাখা আর দুটো সংখ্যা দেখানো এক কথা নয়।
      */
      items: items.map((p) =>
        this.withOffer(
          /*  ⚠️ শুধু Manual-এ। TRACKED হলে গোনাটা Inventory-র, আর
              variant-এর হাতে লেখা ঘরগুলো তখন পড়াই হয় না (DEC-PRD-015)।  */
          p.stockMode === 'MANUAL' && p.variants.length > 0
            ? { ...p, stockQty: p.variants.reduce((n, v) => n + v.stockQty, 0) }
            : p,
        ),
      ),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findOne(id: string) {
    const product = await this.prisma.db.product.findFirst({
      where: { id },
      include: FULL_INCLUDE,
    });
    if (!product) throw new NotFoundException('Product not found');
    return this.withOffer(product);
  }

  async timeline(id: string) {
    await this.ensureExists(id);
    return this.audit.timeline(ENTITY, id);
  }

  /* ---------------- create ---------------- */

  async create(dto: CreateProductDto) {
    this.validateMoneyAndRules(dto);
    await this.validateRefs(dto);
    await this.ensureSlugFree(dto.slug);
    await this.assertPublishReady(dto, null, null);

    const actorName = dto.actorName ?? 'Admin';

    const created = await this.prisma.db.product.create({
      data: this.buildCreateData(dto),
      select: { id: true },
    });

    /*  DEC-DLV-008 — নতুন product-এর delivery সংযোগ। `create`-এর ভেতরে
        nested করা হয়নি ইচ্ছাকৃতভাবে: update-ও ঠিক এই function-টাই ডাকে,
        তাই নিয়মটা একবারই লেখা থাকে।  */
    await this.replaceDeliveryTypes(created.id, dto.deliveryTypeIds);
    await this.replaceVariants(created.id, dto.variants);

    const product = await this.prisma.db.product.findFirstOrThrow({
      where: { id: created.id },
      include: FULL_INCLUDE,
    });

    await this.audit.record({
      entityType: ENTITY,
      entityId: product.id,
      action: 'CREATE',
      actorName,
      changes: { created: dto as unknown as Record<string, unknown> },
    });
    await this.audit.event({
      entityType: ENTITY,
      entityId: product.id,
      kind: 'general',
      label: `Product "${product.name}" created`,
      actorName,
    });

    return this.withOffer(product);
  }

  /* ---------------- update ---------------- */

  async update(id: string, dto: UpdateProductDto) {
    const existing = await this.prisma.db.product.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException('Product not found');

    // merged view দিয়ে money/advance নিয়ম যাচাই (partial patch হলেও)
    this.validateMoneyAndRules({ ...existing, ...dto } as CreateProductDto);
    await this.validateRefs(dto);
    if (dto.slug && dto.slug !== existing.slug) await this.ensureSlugFree(dto.slug);
    await this.assertPublishReady(dto, existing, id);

    const actorName = dto.actorName ?? 'Admin';

    await this.prisma.db.product.update({ where: { id }, data: this.buildUpdateData(dto) });

    /*
      ⚠️ THE CHILD ROWS WERE NEVER SAVED ON UPDATE — 1 Aug 2026.
      `buildCreateData` has handled photos, sizes, spec, FAQ and trust badges
      since the beginning; `buildUpdateData` never touched them, and the admin
      never sent them. So a shop could upload six photographs, watch them
      appear in the editor, press Publish, and the product would come back with
      none. It looked like an upload failure and was a save that dropped them.

      Replace, not merge: the editor shows the whole list and the owner edits it
      as a whole, so what arrives IS the list. Sending nothing for a kind
      (`undefined`) leaves it alone — that is what lets a screen save one part
      of a product without carrying the rest.
    */
    await this.replaceChildren(id, dto);

    const product = await this.prisma.db.product.findFirstOrThrow({
      where: { id },
      include: FULL_INCLUDE,
    });

    await this.audit.record({
      entityType: ENTITY,
      entityId: id,
      action: 'UPDATE',
      actorName,
      changes: this.diff(existing, dto),
    });
    await this.audit.event({
      entityType: ENTITY,
      entityId: id,
      kind: 'general',
      label: `Product "${product.name}" updated`,
      actorName,
    });

    return this.withOffer(product);
  }

  /* ---------------- soft delete / restore ---------------- */

  // DEC (core): Soft Delete Only — কখনো hard DELETE নয়।
  async remove(id: string, actorName = 'Admin') {
    const existing = await this.prisma.db.product.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException('Product not found');

    await this.prisma.db.product.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit.record({ entityType: ENTITY, entityId: id, action: 'DELETE', actorName });
    await this.audit.event({
      entityType: ENTITY,
      entityId: id,
      kind: 'general',
      label: `Product "${existing.name}" deleted (soft)`,
      actorName,
    });
    return { id, deleted: true };
  }

  /**
   * Permanent delete — the ONE sanctioned exception to Soft Delete Only.
   *
   * The owner's Trash held 74 rows of QA/test junk with no way to clear it
   * (6 Aug 2026). The soft-delete rule exists to protect BUSINESS HISTORY —
   * an order must always be able to show what was sold. So the gate is
   * exactly that: a product that appears on ANY order line can never be
   * purged, only kept hidden. A product no order has ever touched is catalog
   * data, not history, and holding it forever protects nothing.
   *
   * Two-step by design: only an already-soft-deleted product can be purged,
   * so nothing goes from live to gone in one click.
   */
  async purge(id: string, actorName = 'Admin') {
    const existing = await this.prisma.product.findFirst({
      where: { id, NOT: { deletedAt: null } },
    });
    if (!existing) throw new NotFoundException('Not in the recovery list');

    const orderRefs = await this.prisma.orderLine.count({ where: { productId: id } });
    if (orderRefs > 0) {
      throw new BadRequestException(
        `"${existing.name}" appears on ${orderRefs} order${orderRefs === 1 ? '' : 's'} — order history must keep it. It stays in recovery, hidden from everything else.`,
      );
    }

    try {
      await this.prisma.$transaction([
        // catalog-owned children whose FKs are not ON DELETE CASCADE
        this.prisma.productImage.deleteMany({ where: { productId: id } }),
        this.prisma.productSize.deleteMany({ where: { productId: id } }),
        this.prisma.productSpec.deleteMany({ where: { productId: id } }),
        this.prisma.productFaq.deleteMany({ where: { productId: id } }),
        this.prisma.productTrustBadge.deleteMany({ where: { productId: id } }),
        this.prisma.review.deleteMany({ where: { productId: id } }),
        this.prisma.bundle.updateMany({ where: { productId: id }, data: { productId: null } }),
        this.prisma.product.delete({ where: { id } }),
      ]);
    } catch (e) {
      /*  P2003 = some other table still points here. Naming the constraint
          would mean nothing to the owner; what matters is the product is
          part of records that must survive.  */
      if ((e as { code?: string }).code === 'P2003') {
        throw new BadRequestException(
          `"${existing.name}" is still referenced by other records (sales, returns or POS) — it must stay in recovery.`,
        );
      }
      throw e;
    }

    await this.audit.record({ entityType: ENTITY, entityId: id, action: 'DELETE', actorName });
    await this.audit.event({
      entityType: ENTITY,
      entityId: id,
      kind: 'general',
      label: `Product "${existing.name}" permanently deleted (was in recovery, no order references)`,
      actorName,
    });
    return { id, purged: true };
  }

  /** deleted products — the only way an admin can reach `restore()`.
      Uses the base client so the soft-delete extension does not hide them. */
  async trash() {
    const rows = await this.prisma.product.findMany({
      where: { NOT: { deletedAt: null } },
      orderBy: { deletedAt: 'desc' },
      take: 200,
      select: {
        id: true,
        slug: true,
        sku: true,
        name: true,
        sellingPricePaisa: true,
        costPaisa: true,
        discountType: true,
        discountValue: true,
        stockQty: true,
        deletedAt: true,
        category: { select: { id: true, name: true, slug: true } },
      },
    });
    return { items: rows.map((r) => this.withOffer(r)), total: rows.length };
  }

  async restore(id: string, actorName = 'Admin') {
    // base client (extension ছাড়া) — deleted রেকর্ডও দেখা যায়
    const existing = await this.prisma.product.findFirst({
      where: { id, NOT: { deletedAt: null } },
    });
    if (!existing) throw new NotFoundException('Deleted product not found');

    await this.prisma.product.update({ where: { id }, data: { deletedAt: null } });
    await this.audit.record({ entityType: ENTITY, entityId: id, action: 'RESTORE', actorName });
    await this.audit.event({
      entityType: ENTITY,
      entityId: id,
      kind: 'general',
      label: `Product "${existing.name}" restored`,
      actorName,
    });
    return { id, restored: true };
  }

  /* ---------------- helpers ---------------- */

  private async ensureExists(id: string) {
    const p = await this.prisma.db.product.findFirst({ where: { id }, select: { id: true } });
    if (!p) throw new NotFoundException('Product not found');
  }

  /**
   * PRD-REV-1 (30 Jul) — the RAW client, because `Product.slug` is @unique and the
   * index does not care that a row is soft-deleted.
   *
   * This read went through `prisma.db`, which filters `deletedAt: null`, so a deleted
   * product's slug looked FREE: the check passed, the insert hit the unique index, and
   * the user got a raw P2002 — a 500 with no message on a slug the system had just
   * said was available. Item's `freeSku()` has always used the raw client for this
   * reason; the lesson never crossed the module boundary. `Customer.phone` had the
   * same fault (CUS-REV-2).
   *
   * A slug also matters more than an internal code: it is the storefront URL, so
   * silently reusing a deleted product's slug would point an old link, an old Meta ad
   * and an old WhatsApp forward at a different product.
   */
  private async ensureSlugFree(slug: string) {
    const dupe = await this.prisma.product.findFirst({
      where: { slug },
      select: { id: true, name: true, deletedAt: true },
    });
    if (!dupe) return;
    if (dupe.deletedAt) {
      throw new BadRequestException(
        `slug "${slug}" belongs to "${dupe.name}", which is in the trash. Restore it, or pick a different slug — reusing it would send old links and old ads to the wrong product.`,
      );
    }
    throw new BadRequestException(`slug "${slug}" already in use`);
  }

  private async validateRefs(dto: UpdateProductDto) {
    if (dto.categoryId) {
      const cat = await this.prisma.db.category.findFirst({
        where: { id: dto.categoryId },
        select: { id: true },
      });
      if (!cat) throw new BadRequestException('categoryId not found');
    }
    if (dto.brandId) {
      const brand = await this.prisma.db.brand.findFirst({
        where: { id: dto.brandId },
        select: { id: true },
      });
      if (!brand) throw new BadRequestException('brandId not found');
    }
    if (dto.unitId) {
      const unit = await this.prisma.db.unit.findFirst({
        where: { id: dto.unitId },
        select: { id: true },
      });
      if (!unit) throw new BadRequestException('unitId not found');
    }
    if (dto.variantGroupId) {
      const vg = await this.prisma.db.variantGroup.findFirst({
        where: { id: dto.variantGroupId },
        select: { id: true },
      });
      if (!vg) throw new BadRequestException('variantGroupId not found');
    }
    // D-CAT-01 — the colour must exist in the master. This check is the whole
    // point of the change: it is what makes "Red" one thing site-wide instead
    // of a word each product spells its own way.
    if (dto.variantValueId) {
      const vv = await this.prisma.db.variantValue.findFirst({
        where: { id: dto.variantValueId, isActive: true },
        select: { id: true },
      });
      if (!vv) throw new BadRequestException('variantValueId not found — add it under Variant & Option first');
    }
    if (dto.tagIds && dto.tagIds.length) {
      const found = await this.prisma.db.tag.count({ where: { id: { in: dto.tagIds } } });
      if (found !== dto.tagIds.length) throw new BadRequestException('one or more tagIds not found');
    }
    /*  DEC-ITM-002 — the Item must exist. A dangling link would show a
        listing as stock-tracked while nothing is counting it.  */
    if (dto.itemId) {
      const it = await this.prisma.db.item.findFirst({
        where: { id: dto.itemId },
        select: { id: true },
      });
      if (!it) throw new BadRequestException('itemId not found — pick an item from the list');
    }
  }

  // DEC (locked §2): টাকা=paisa integer · discount · advance override নিয়ম
  private validateMoneyAndRules(dto: CreateProductDto) {
    const ints: [string, number | undefined][] = [
      ['costPaisa', dto.costPaisa],
      ['sellingPricePaisa', dto.sellingPricePaisa],
      ['advanceAmountPaisa', dto.advanceAmountPaisa],
      ['stockQty', dto.stockQty],
      ['salesCount', dto.salesCount],
    ];
    for (const [k, v] of ints) {
      if (v === undefined || v === null) continue;
      if (!Number.isInteger(v) || v < 0) throw new BadRequestException(`${k} must be a non-negative integer (paisa)`);
    }

    const dType = dto.discountType ?? DiscountType.NONE;
    const dVal = dto.discountValue ?? 0;
    if (dType === DiscountType.FLAT && dVal > (dto.sellingPricePaisa ?? 0))
      throw new BadRequestException('FLAT discount cannot exceed sellingPricePaisa');
    if (dType === DiscountType.PERCENT && (dVal < 0 || dVal > 10000))
      throw new BadRequestException('PERCENT discount must be basis points 0..10000 (0-100%)');

    if (dto.advanceRequired) {
      if (!dto.advanceType) throw new BadRequestException('advanceType required when advanceRequired=true');
      if (dto.advanceType === 'PARTIAL') {
        const hasPct = dto.advancePercent != null;
        const hasAmt = dto.advanceAmountPaisa != null;
        if (!hasPct && !hasAmt)
          throw new BadRequestException('PARTIAL advance needs advancePercent or advanceAmountPaisa');
        if (hasPct && (dto.advancePercent! < 1 || dto.advancePercent! > 100))
          throw new BadRequestException('advancePercent must be 1..100');
      }
    }
  }

  /*
    DEC-PRD-032 — Publish-এর গেট। মালিক, ৬ আগস্ট ২০২৬:
    "ami jodi product image na dei taw amr published hoy... ata biroktikor."

    আগে `isPublished` ছিল শুধু একটা flag — সত্যি বলতে কিছুই আটকাত না, তাই
    ছবি ছাড়া, দাম ০ রেখেও, কোনো delivery speed না টিকিয়েও একটা product
    লাইভ চলে যেত (placeholder রঙিন বাক্স নিয়ে)। মালিক নিজে ঠিক করে দিলেন
    publish আটকানোর ৪টা শর্ত — এখানে সেটাই lock করা হলো। Draft হিসেবে
    save করতে এই মেথড কখনো বাধা দেয় না, শুধু `isPublished: true` হওয়ার
    মুহূর্তেই যাচাই করে।
  */
  private async assertPublishReady(
    dto: { isPublished?: boolean; sellingPricePaisa?: number; categoryId?: string; supportsExpress?: boolean; supportsSameDay?: boolean; supportsMidnight?: boolean; images?: { url: string }[] },
    existing: {
      isPublished?: boolean;
      sellingPricePaisa?: number;
      categoryId?: string;
      supportsExpress?: boolean;
      supportsSameDay?: boolean;
      supportsMidnight?: boolean;
    } | null,
    productId: string | null,
  ) {
    const willPublish = dto.isPublished ?? existing?.isPublished ?? false;
    if (!willPublish) return;

    const price = dto.sellingPricePaisa ?? existing?.sellingPricePaisa ?? 0;
    if (!(price > 0)) {
      throw new BadRequestException('Publish করার আগে দাম (sellingPricePaisa) শূন্যের বেশি হতে হবে।');
    }

    const categoryId = dto.categoryId ?? existing?.categoryId;
    if (!categoryId) {
      throw new BadRequestException('Publish করার আগে category বাছতে হবে।');
    }

    const exp = dto.supportsExpress ?? existing?.supportsExpress ?? false;
    const sd = dto.supportsSameDay ?? existing?.supportsSameDay ?? false;
    const mn = dto.supportsMidnight ?? existing?.supportsMidnight ?? false;
    if (!exp && !sd && !mn) {
      throw new BadRequestException(
        'Publish করার আগে অন্তত একটা delivery speed (Express / Same Day / Midnight) টিক করতে হবে।',
      );
    }

    // `images` REPLACE-not-merge (see `replaceChildren`) — dto-তে থাকলে সেটাই
    // চূড়ান্ত তালিকা, না থাকলে DB-তে যা আছে তা-ই টিকে থাকবে।
    let imageCount: number;
    if (dto.images !== undefined) {
      imageCount = dto.images.length;
    } else if (productId) {
      imageCount = await this.prisma.db.productImage.count({
        where: { productId, deletedAt: null },
      });
    } else {
      imageCount = 0;
    }
    if (imageCount === 0) {
      throw new BadRequestException('Publish করার আগে অন্তত একটা ছবি আপলোড করতে হবে।');
    }
  }

  /*
    offer price = selling − discount (paisa)। দেখানোর জন্য, সংরক্ষিত নয়।

    ⚠️ DEC-PRD-028 — মেয়াদ ফুরানো ছাড় এখানেও বসে না। নাহলে Overview-তে
    margin 44% দেখাত অথচ দোকান পুরো দামে বিক্রি করত — মালিক ভুল সংখ্যার
    উপর দাঁড়িয়ে দাম ঠিক করতেন।
  */
  private withOffer<
    T extends {
      sellingPricePaisa: number;
      discountType: DiscountType;
      discountValue: number;
      discountStartsAt?: Date | null;
      discountEndsAt?: Date | null;
    },
  >(p: T): T & { offerPricePaisa: number; marginPaisa: number | null } {
    const offer = paidPaisa(p);
    const cost = (p as unknown as { costPaisa?: number }).costPaisa;
    return {
      ...p,
      offerPricePaisa: offer,
      marginPaisa: typeof cost === 'number' ? offer - cost : null,
    };
  }

  private diff(before: Record<string, unknown>, patch: UpdateProductDto): Record<string, unknown> {
    const changes: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'actorName') continue;
      if ((before as Record<string, unknown>)[k] !== v) {
        changes[k] = { from: (before as Record<string, unknown>)[k], to: v };
      }
    }
    return changes;
  }

  private buildCreateData(dto: CreateProductDto): Prisma.ProductCreateInput {
    return {
      slug: dto.slug,
      sku: dto.sku,
      name: dto.name,
      category: { connect: { id: dto.categoryId } },
      brand: dto.brandId ? { connect: { id: dto.brandId } } : undefined,
      unit: dto.unitId ? { connect: { id: dto.unitId } } : undefined,
      item: dto.itemId ? { connect: { id: dto.itemId } } : undefined,
      supplier: dto.supplierId ? { connect: { id: dto.supplierId } } : undefined,
      displayQty: dto.displayQty ?? null,
      makeMinutes: dto.makeMinutes ?? null,
      /* DEC-PDP-09 — falls back to the schema default (STOCK_OUT) when the
         form does not say. Defaulting the other way would let a product start
         life promising a delivery date nobody chose. */
      soldOutMode: dto.soldOutMode,
      preorderDate: dto.preorderDate ? new Date(dto.preorderDate) : null,
      tags: dto.tagIds?.length ? { connect: dto.tagIds.map((id) => ({ id })) } : undefined,
      productType: dto.productType,
      zone: dto.zone,
      natureType: dto.natureType,
      natureLabel: dto.natureLabel,
      shortDesc: dto.shortDesc,
      typeText: dto.typeText,
      videoId: dto.videoId,
      nationwideMsg: dto.nationwideMsg,
      // SEO-D01 — the six columns Marketing -> SEO also writes to
      metaTitle: dto.metaTitle,
      metaDescription: dto.metaDescription,
      ogTitle: dto.ogTitle,
      ogDescription: dto.ogDescription,
      ogImageUrl: dto.ogImageUrl,
      noIndex: dto.noIndex,
      costPaisa: dto.costPaisa,
      sellingPricePaisa: dto.sellingPricePaisa,
      discountType: dto.discountType,
      discountValue: dto.discountValue,
      advanceRequired: dto.advanceRequired,
      advanceType: dto.advanceType,
      advancePercent: dto.advancePercent,
      advanceAmountPaisa: dto.advanceAmountPaisa,
      stockMode: dto.stockMode,
      stockQty: dto.stockQty,
      showStock: dto.showStock,
      salesCount: dto.salesCount,
      /*  DEC-PRD-028 — ছাড়ের মেয়াদ। ⚠️ খালি string নয়, `null` — খালি
          string-কে Prisma অবৈধ তারিখ ধরে আর গোটা save ভাঙে।  */
      discountStartsAt: dto.discountStartsAt ? new Date(dto.discountStartsAt) : dto.discountStartsAt === null ? null : undefined,
      discountEndsAt: dto.discountEndsAt ? new Date(dto.discountEndsAt) : dto.discountEndsAt === null ? null : undefined,
      /*  DEC-PRD-025/026/027 — নতুন ঘরগুলো। `undefined` হলে Prisma ছোঁয় না,
          তাই পুরনো পর্দা থেকে আসা save-এ কিছু মুছে যায় না।  */
      salesSeedToday: dto.salesSeedToday,
      salesSeedWeek: dto.salesSeedWeek,
      salesSeedMonth: dto.salesSeedMonth,
      salesSeedAll: dto.salesSeedAll,
      /*  DEC-PRD-025 — ঘড়িটা এখানেই নতুন করে শুরু হয়। মালিক ঢুকে save
          করলেই "আজকের" সংখ্যা আজ থেকে গোনা শুরু। ⚠️ form সংখ্যার কথা না
          বললে (`undefined`) সময়টাও ছোঁয়া হয় না — অন্য কারণে save করলে
          মেয়াদ বেড়ে যাওয়া উচিত নয়।  */
      salesSeedAt:
        dto.salesSeedToday !== undefined ||
        dto.salesSeedWeek !== undefined ||
        dto.salesSeedMonth !== undefined ||
        dto.salesSeedAll !== undefined
          ? new Date()
          : undefined,
      salesWindow: dto.salesWindow,
      persoTitle: dto.persoTitle,
      persoText: dto.persoText,
      persoTextLabel: dto.persoTextLabel,
      persoTextMax: dto.persoTextMax,
      persoTextHint: dto.persoTextHint,
      persoImage: dto.persoImage,
      persoImageLabel: dto.persoImageLabel,
      persoImageHint: dto.persoImageHint,
      customiseOn: dto.customiseOn,
      customiseTitle: dto.customiseTitle,
      customiseSub: dto.customiseSub,
      leadTimeDays: dto.leadTimeDays,
      upgradeOf: dto.upgradeOfProductId ? { connect: { id: dto.upgradeOfProductId } } : undefined,
      upgradeSortOrder: dto.upgradeSortOrder,
      manualAddOnGroups: dto.manualAddOnGroupIds?.length
        ? { connect: dto.manualAddOnGroupIds.map((id) => ({ id })) }
        : undefined,
      variantGroup: dto.variantGroupId ? { connect: { id: dto.variantGroupId } } : undefined,
      variantLabel: dto.variantLabel,
      variantSwatch: dto.variantSwatch,
      // D-CAT-01 — the colour, from the master
      variantValue: dto.variantValueId ? { connect: { id: dto.variantValueId } } : undefined,
      supportsExpress: dto.supportsExpress,
      supportsSameDay: dto.supportsSameDay,
      supportsMidnight: dto.supportsMidnight,
      isPublished: dto.isPublished,
      isBestSeller: dto.isBestSeller,
      isNewArrival: dto.isNewArrival,
      images: dto.images?.length ? { create: dto.images } : undefined,
      sizes: dto.sizes?.length ? { create: dto.sizes } : undefined,
      specRows: dto.specRows?.length ? { create: dto.specRows } : undefined,
      faqs: dto.faqs?.length ? { create: dto.faqs } : undefined,
      trustBadges: dto.trustBadges?.length ? { create: dto.trustBadges } : undefined,
    };
  }

  // update: scalar + FK re-connect + tag set। child rows-এর পূর্ণ re-sync পরে
  // (edit UI এলে) — এখন scalar/relation edit যথেষ্ট।
  /**
   * Swap a product's owned lists for the ones the editor just sent.
   *
   * SOFT DELETE, not `deleteMany` — the constitution's rule, and here it also
   * protects history: a cart or an order line may still point at a size id, and
   * a row that is gone entirely turns those into dangling references. A
   * soft-deleted row is invisible everywhere (`FULL_INCLUDE` and the storefront
   * both filter it) and still resolvable by anything holding its id.
   *
   * `undefined` means "this screen is not editing that list" and is left
   * untouched. An empty ARRAY means "the owner removed them all" and is obeyed.
   * The difference matters: treating the two the same would make every partial
   * save wipe whatever it did not mention.
   */
  private async replaceChildren(productId: string, dto: UpdateProductDto) {
    const now = new Date();
    const swap = async <T>(
      model: {
        updateMany: (a: unknown) => Promise<unknown>;
        createMany: (a: unknown) => Promise<unknown>;
      },
      rows: T[] | undefined,
    ) => {
      if (rows === undefined) return;
      await model.updateMany({
        where: { productId, deletedAt: null },
        data: { deletedAt: now },
      });
      if (rows.length === 0) return;
      await model.createMany({
        data: rows.map((r, i) => ({ ...r, productId, sortOrder: i })),
      });
    };

    await swap(this.prisma.db.productImage, dto.images);
    await swap(this.prisma.db.productSize, dto.sizes);
    await swap(this.prisma.db.productSpec, dto.specRows);
    await swap(this.prisma.db.productFaq, dto.faqs);
    await swap(this.prisma.db.productTrustBadge, dto.trustBadges);
    await this.replaceDeliveryTypes(productId, dto.deliveryTypeIds);
    await this.replaceVariants(productId, dto.variants);
  }

  /**
   * DEC-DLV-008 — কোন কোন delivery-তে এই product যেতে পারে।
   *
   * ⚠️ HARD DELETE, soft নয় — আর এটাই এখানে ঠিক। এই টেবিলে কোনো তথ্য নেই,
   * শুধু দুটো id-র জোড়া। মুছে ফেলা জোড়া রেখে দেওয়ার মানে হতো একটা "মুছে
   * ফেলা হয়েছে" চিহ্নওয়ালা সারি, যা কেউ কখনো পড়বে না। order-এর জন্য যা
   * দরকার সেটা আগেই order-এ snapshot হয়ে বসে আছে (DEC-DLV-002)।
   *
   * ⚠️ `undefined` হলে কিছুই ছোঁয়া হয় না। form যে ঘরের কথা বলেনি, সেই ঘর
   * মোছা যায় না — এই ভুলেই ১ আগস্ট product edit করলে ছবি হারিয়ে যাচ্ছিল।
   */
  /**
   * DEC-PRD-012 — এই product-এর variant-গুলো।
   *
   * ⚠️ SOFT DELETE, hard নয় — order-এর line পুরনো variant-এর দিকে দেখাতে
   * পারে, আর সেই সংযোগ ছিঁড়ে গেলে গতকালের রসিদে "কোন রঙ পাঠানো হয়েছিল"
   * আর পড়া যেত না।
   *
   * ⚠️ `undefined` হলে কিছুই ছোঁয়া হয় না। যে ঘরের কথা form বলেনি সেটা
   * মোছা যায় না — এই ভুলেই ১ আগস্ট product edit করলে ছবি হারাচ্ছিল।
   */
  private async replaceVariants(productId: string, rows: ProductVariantInput[] | undefined) {
    if (rows === undefined) return;
    const now = new Date();

    const keep = rows.map((r) => r.variantValueId);
    await this.prisma.db.productVariant.updateMany({
      where: { productId, deletedAt: null, variantValueId: { notIn: keep.length ? keep : ['—'] } },
      data: { deletedAt: now },
    });

    for (const [i, r] of rows.entries()) {
      const data = {
        imageUrl: r.imageUrl?.trim() ? r.imageUrl : null,
        stockQty: r.stockQty ?? 0,
        /*  DEC-PRD-015 — এই রঙের নিজের stockroom Item। খালি লেখা এলে
            `null`, কারণ খালি string কোনো Item নয় আর FK সেটা মানবে না।  */
        itemId: r.itemId?.trim() ? r.itemId : null,
        /*  খালি = product-এর মূল দাম। মালিকের নিয়ম: রঙ বদলালে দাম এক,
            kg/flavour বদলালে আলাদা।  */
        pricePaisa: r.pricePaisa ?? null,
        sortOrder: r.sortOrder ?? i,
        isActive: r.isActive ?? true,
        deletedAt: null,
      };
      /*  একই মান আগে মুছে ফেলা থাকলে সেটাই ফিরিয়ে আনা হয়, নতুন সারি নয় —
          `@@unique([productId, variantValueId])` তাই দাবি করে, আর তাতে
          পুরনো order-এর সংযোগও অক্ষত থাকে।  */
      await this.prisma.db.productVariant.upsert({
        where: { productId_variantValueId: { productId, variantValueId: r.variantValueId } },
        create: { productId, variantValueId: r.variantValueId, ...data },
        update: data,
      });
    }
  }

  private async replaceDeliveryTypes(productId: string, ids: string[] | undefined) {
    if (ids === undefined) return;
    await this.prisma.db.productDeliveryType.deleteMany({ where: { productId } });
    if (ids.length > 0) {
      await this.prisma.db.productDeliveryType.createMany({
        data: [...new Set(ids)].map((typeId) => ({ productId, typeId })),
        skipDuplicates: true,
      });
    }

    /*
      ⚠️ DEC-PRD-033 — পুরনো তিনটা flag এখান থেকেই লেখা হয়।

      ৩ আগস্টের নিরীক্ষায় ধরা সবচেয়ে বড় ছেঁড়া তার: editor লিখত নতুন
      টেবিলে (ProductDeliveryType), আর storefront-এর badge/filter পড়ত
      পুরনো তিনটা কলাম (supportsExpress/SameDay/Midnight) — যেগুলো আর
      **কেউ লিখত না**। মালিক Delivery tab-এ যা-ই বদলান, website-এর
      "2 hrs" badge-এ তার কোনো ছাপই পড়ত না।

      ধাপ ৪-এ storefront নতুন টেবিল পড়া শিখলে এই অনুবাদটা মুছে যাবে।
      ততদিন এক লেখার জায়গা থেকে দুটোই লেখা হয় — আলাদা হতে পারে না।

      অনুবাদের নিয়ম, DeliveryType.timing থেকে:
        FROM_CONFIRM    → express   ("২ ঘণ্টায়")
        TODAY_SLOT      → same day
        PICK_DATE_FIXED → midnight
    */
    /*
      ⚠️ শুধু সেই delivery গোনা হয় যেটা গ্রাহককে সত্যিই দেওয়া যায় — চালু,
      মোছা নয়, আর অন্তত একটা zone-এ ভাড়া বসানো। ৩ আগস্টের test-এই ধরা:
      product-এ "2-Hour Express"-এর একটা পুরনো link ছিল যার কোনো ভাড়া নেই —
      editor সেটা লুকিয়ে সাবধানবাণী দেখায়, checkout কখনো দেয় না, অথচ badge
      "২ ঘণ্টায়" বলে বসে ছিল। যে প্রতিশ্রুতি রাখা যায় না, badge-ও নয়।
    */
    const types = ids.length
      ? await this.prisma.db.deliveryType.findMany({
          where: {
            id: { in: ids },
            isActive: true,
            deletedAt: null,
            rates: { some: { deletedAt: null } },
          },
          select: { timing: true },
        })
      : [];
    const has = (t: string) => types.some((x) => x.timing === t);
    await this.prisma.db.product.update({
      where: { id: productId },
      data: {
        supportsExpress: has('FROM_CONFIRM'),
        supportsSameDay: has('TODAY_SLOT'),
        supportsMidnight: has('PICK_DATE_FIXED'),
      },
    });
  }

  private buildUpdateData(dto: UpdateProductDto): Prisma.ProductUpdateInput {
    return {
      slug: dto.slug,
      sku: dto.sku,
      name: dto.name,
      category: dto.categoryId ? { connect: { id: dto.categoryId } } : undefined,
      brand:
        dto.brandId === undefined
          ? undefined
          : dto.brandId
            ? { connect: { id: dto.brandId } }
            : { disconnect: true },
      unit:
        dto.unitId === undefined
          ? undefined
          : dto.unitId
            ? { connect: { id: dto.unitId } }
            : { disconnect: true },
      item:
        dto.itemId === undefined
          ? undefined
          : dto.itemId
            ? { connect: { id: dto.itemId } }
            : { disconnect: true },
      supplier:
        dto.supplierId === undefined
          ? undefined
          : dto.supplierId
            ? { connect: { id: dto.supplierId } }
            : { disconnect: true },
      displayQty: dto.displayQty,
      makeMinutes: dto.makeMinutes,
      /* DEC-PDP-09. `undefined` = the form did not mention it, leave it;
         `null` on the date = the owner cleared it. The two must stay
         distinguishable or clearing a date becomes impossible. */
      soldOutMode: dto.soldOutMode,
      preorderDate:
        dto.preorderDate === undefined
          ? undefined
          : dto.preorderDate
            ? new Date(dto.preorderDate)
            : null,
      tags: dto.tagIds ? { set: dto.tagIds.map((id) => ({ id })) } : undefined,
      productType: dto.productType,
      zone: dto.zone,
      natureType: dto.natureType,
      natureLabel: dto.natureLabel,
      shortDesc: dto.shortDesc,
      typeText: dto.typeText,
      videoId: dto.videoId,
      nationwideMsg: dto.nationwideMsg,
      // SEO-D01 — the six columns Marketing -> SEO also writes to
      metaTitle: dto.metaTitle,
      metaDescription: dto.metaDescription,
      ogTitle: dto.ogTitle,
      ogDescription: dto.ogDescription,
      ogImageUrl: dto.ogImageUrl,
      noIndex: dto.noIndex,
      costPaisa: dto.costPaisa,
      sellingPricePaisa: dto.sellingPricePaisa,
      discountType: dto.discountType,
      discountValue: dto.discountValue,
      advanceRequired: dto.advanceRequired,
      advanceType: dto.advanceType,
      advancePercent: dto.advancePercent,
      advanceAmountPaisa: dto.advanceAmountPaisa,
      stockMode: dto.stockMode,
      stockQty: dto.stockQty,
      showStock: dto.showStock,
      salesCount: dto.salesCount,
      /*  DEC-PRD-028 — ছাড়ের মেয়াদ। ⚠️ খালি string নয়, `null` — খালি
          string-কে Prisma অবৈধ তারিখ ধরে আর গোটা save ভাঙে।  */
      discountStartsAt: dto.discountStartsAt ? new Date(dto.discountStartsAt) : dto.discountStartsAt === null ? null : undefined,
      discountEndsAt: dto.discountEndsAt ? new Date(dto.discountEndsAt) : dto.discountEndsAt === null ? null : undefined,
      /*  DEC-PRD-025/026/027 — নতুন ঘরগুলো। `undefined` হলে Prisma ছোঁয় না,
          তাই পুরনো পর্দা থেকে আসা save-এ কিছু মুছে যায় না।  */
      salesSeedToday: dto.salesSeedToday,
      salesSeedWeek: dto.salesSeedWeek,
      salesSeedMonth: dto.salesSeedMonth,
      salesSeedAll: dto.salesSeedAll,
      /*  DEC-PRD-025 — ঘড়িটা এখানেই নতুন করে শুরু হয়। মালিক ঢুকে save
          করলেই "আজকের" সংখ্যা আজ থেকে গোনা শুরু। ⚠️ form সংখ্যার কথা না
          বললে (`undefined`) সময়টাও ছোঁয়া হয় না — অন্য কারণে save করলে
          মেয়াদ বেড়ে যাওয়া উচিত নয়।  */
      salesSeedAt:
        dto.salesSeedToday !== undefined ||
        dto.salesSeedWeek !== undefined ||
        dto.salesSeedMonth !== undefined ||
        dto.salesSeedAll !== undefined
          ? new Date()
          : undefined,
      salesWindow: dto.salesWindow,
      persoTitle: dto.persoTitle,
      persoText: dto.persoText,
      persoTextLabel: dto.persoTextLabel,
      persoTextMax: dto.persoTextMax,
      persoTextHint: dto.persoTextHint,
      persoImage: dto.persoImage,
      persoImageLabel: dto.persoImageLabel,
      persoImageHint: dto.persoImageHint,
      customiseOn: dto.customiseOn,
      customiseTitle: dto.customiseTitle,
      customiseSub: dto.customiseSub,
      leadTimeDays: dto.leadTimeDays,
      upgradeOf:
        dto.upgradeOfProductId === undefined
          ? undefined
          : dto.upgradeOfProductId
            ? { connect: { id: dto.upgradeOfProductId } }
            : { disconnect: true },
      upgradeSortOrder: dto.upgradeSortOrder,
      manualAddOnGroups:
        dto.manualAddOnGroupIds === undefined
          ? undefined
          : { set: dto.manualAddOnGroupIds.map((id) => ({ id })) },
      variantGroup: dto.variantGroupId ? { connect: { id: dto.variantGroupId } } : undefined,
      variantLabel: dto.variantLabel,
      variantSwatch: dto.variantSwatch,
      // undefined = not sent, leave it alone. null = the owner cleared it.
      variantValue:
        dto.variantValueId === undefined
          ? undefined
          : dto.variantValueId
            ? { connect: { id: dto.variantValueId } }
            : { disconnect: true },
      supportsExpress: dto.supportsExpress,
      supportsSameDay: dto.supportsSameDay,
      supportsMidnight: dto.supportsMidnight,
      isPublished: dto.isPublished,
      isBestSeller: dto.isBestSeller,
      isNewArrival: dto.isNewArrival,
    };
  }
}
