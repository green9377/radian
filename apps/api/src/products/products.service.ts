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
/*  DEC-PRD-050 — one rule for "is this new", shared with the storefront.  */
import { isNewNow, MERCH_DEFAULTS, type BadgeMode } from './merch';

const ENTITY = 'Product';

// the full product, children included
// a nested include does not pick up the soft-delete extension — hence an
// explicit filter on every to-many
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
  /*  DEC-DLV-008 — which deliveries it can travel on. This is what the editor
      uses to tick the chips back on.  */
  deliveryTypes: { select: { typeId: true } },
  /*  DEC-PRD-012 — colour / flavour / size, each with its own photo, stock and
      price. The master's name and colour come along too, otherwise both the
      editor and the storefront would have to go and find them separately.  */
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
      /*  DEC-PRD-045 — every value in this combination. One row for a plain
          colour list, two for Size × Colour. The editor rebuilds its grid
          from exactly this.  */
      values: {
        include: {
          variantValue: {
            select: {
              id: true, label: true, swatch: true, imageUrl: true, sortOrder: true,
              attribute: { select: { id: true, name: true, displayMode: true, sortOrder: true } },
            },
          },
        },
      },
      /*  DEC-PRD-015 — which Item holds this colour's stock. Both the name and
          the code are needed, because the editor writes it out after picking —
          showing someone an id helps nobody. The photo comes too (DEC-ITM-012),
          so a linked row looks the same here as in every other item list.  */
      item: { select: { id: true, sku: true, name: true, imageUrl: true } },
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
      /*  DEC-POS-018 — a counter line sells an Item and has no productId. This is the
          PRODUCT funnel, so those lines are not ours to count; the till's own numbers
          live in the POS reports.  */
      const pid = l.productId;
      if (!pid) continue;
      let a = map.get(pid);
      if (!a) {
        a = {
          productId: pid,
          orderIds: new Set(),
          cancelledIds: new Set(),
          deliveredIds: new Set(),
          units: 0,
          revenuePaisa: 0,
          refundPaisa: 0,
        };
        map.set(pid, a);
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
        stockMode: true,
        itemId: true,
        variants: { where: { deletedAt: null, isActive: true }, select: { itemId: true, stockQty: true } },
        isPublished: true,
        category: { select: { id: true, name: true } },
        /*  the real photo — the funnel rows showed a coloured tile for
            products that have one (owner, 9 Aug 2026)  */
        images: {
          where: { deletedAt: null },
          orderBy: { sortOrder: 'asc' },
          take: 1,
          select: { url: true },
        },
      },
    });

    /*  The funnel carried the same fault the product list did (23 Aug 2026):
        it printed `stockQty` raw, so every TRACKED product read 0 here too.
        One groupBy for the whole page, same as the list.  */
    const funnelItemIds = [
      ...new Set(
        products.flatMap((p) => [
          ...(p.itemId ? [p.itemId] : []),
          ...p.variants.flatMap((v) => (v.itemId ? [v.itemId] : [])),
        ]),
      ),
    ];
    const funnelSums = funnelItemIds.length
      ? await this.prisma.db.inventoryStock.groupBy({
          by: ['itemId'],
          where: { itemId: { in: funnelItemIds } },
          _sum: { qtyMilli: true },
        })
      : [];
    const funnelQty = new Map(
      funnelSums.map((r) => [r.itemId, Math.max(0, Math.floor((r._sum.qtyMilli ?? 0) / 1000))]),
    );
    const stockOf = (p: {
      stockMode: string; stockQty: number; itemId: string | null;
      variants: { itemId: string | null; stockQty: number }[];
    }) => {
      if (p.stockMode === 'MANUAL')
        return p.variants.length ? p.variants.reduce((n, v) => n + v.stockQty, 0) : p.stockQty;
      return p.variants.length
        ? p.variants.reduce(
            (n, v) => n + (v.itemId ? (funnelQty.get(v.itemId) ?? 0) : v.stockQty),
            0,
          )
        : p.itemId
          ? (funnelQty.get(p.itemId) ?? 0)
          : 0;
    };

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
        imageUrl: p.images[0]?.url ?? null,
        categoryId: p.category?.id ?? null,
        categoryName: p.category?.name ?? null,
        isPublished: p.isPublished,
        stockQty: stockOf(p),
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
    await this.refreshNewDays(); // DEC-PRD-050
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
          /*  DEC-PRD-014 — when there are variants the stock lives in their
              fields. Every row of the list, the Stock page and Overview's
              "out of stock" count all read `stockQty`, so the number is
              corrected here before it is sent.  */
          variants: {
            where: { deletedAt: null, isActive: true },
            select: { stockQty: true, itemId: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.db.product.count({ where }),
    ]);

    /*  One query for every linked item on the page — the product's own and
        each variant's. Never N+1: a hundred rows must still be one round trip. */
    const linkedItemIds = [
      ...new Set(
        items.flatMap((p) => [
          ...(p.itemId ? [p.itemId] : []),
          ...p.variants.flatMap((v) => (v.itemId ? [v.itemId] : [])),
        ]),
      ),
    ];
    const invSums = linkedItemIds.length
      ? await this.prisma.db.inventoryStock.groupBy({
          by: ['itemId'],
          where: { itemId: { in: linkedItemIds } },
          _sum: { qtyMilli: true },
        })
      : [];
    /*  milli-units floor to whole pieces, the same way the product page does it */
    const invQty = new Map(
      invSums.map((r) => [r.itemId, Math.max(0, Math.floor((r._sum.qtyMilli ?? 0) / 1000))]),
    );
    /*  ⚠️ A variant with no item of its own falls back to ITS OWN typed
        number — exactly what the storefront does (`product-detail.ts`,
        variantCount). Reading it as zero instead was the second half of the
        same bug: the owner's product is TRACKED with one unlinked variant
        holding 10, and the row still said OUT. The admin and the shop have to
        answer this question the same way or the number is worthless.  */
    const trackedQty = (p: {
      itemId: string | null;
      variants: { itemId: string | null; stockQty: number }[];
    }) =>
      p.variants.length > 0
        ? p.variants.reduce(
            (n, v) => n + (v.itemId ? (invQty.get(v.itemId) ?? 0) : v.stockQty),
            0,
          )
        : p.itemId
          ? (invQty.get(p.itemId) ?? 0)
          : 0;

    return {
      /*
        DEC-PRD-014 — Owner, 2 Aug 2026 (translated): *"when there are variants
        the variants' stock governs, and the product's field then shows the
        total."*

        ⚠️ The column is not changed, only the **answer** changes. The old
        hand-typed number stays in the field — if the owner removes the
        variants it governs again. Keeping two numbers and showing two numbers
        are not the same thing.
      */
      items: items.map((p) =>
        this.withOffer(
          p.stockMode === 'MANUAL'
            ? /*  DEC-PRD-014 — with variants, the variants' hand-typed fields
                  add up to the product's answer.  */
              p.variants.length > 0
              ? { ...p, stockQty: p.variants.reduce((n, v) => n + v.stockQty, 0) }
              : p
            : /*  TRACKED — the count belongs to Inventory (DEC-PRD-015), and
                  until 23 Aug 2026 this list never asked it. It returned the
                  product's own `stockQty` column, which under TRACKED is never
                  written, so every tracked product read 0 and the list stamped
                  it "OUT" — while the shop itself showed the real number,
                  because the storefront always did ask Inventory.

                  The owner caught it on his first product: item Red-Rose held
                  280 and the row said 0 OUT. A stock figure that is wrong in
                  the admin and right on the website is worse than no figure —
                  it is the one number he would reorder against.  */
              { ...p, stockQty: trackedQty(p) },
        ),
      ),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findOne(id: string) {
    await this.refreshNewDays(); // DEC-PRD-050
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

    /*  DEC-DLV-008 — the new product's delivery links. Deliberately not nested
        inside `create`: update calls this very same function, so the rule is
        written once.  */
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

    // check the money/advance rules against the merged view (even on a partial patch)
    this.validateMoneyAndRules({ ...existing, ...dto } as CreateProductDto);
    await this.validateRefs(dto);
    if (dto.slug && dto.slug !== existing.slug) await this.ensureSlugFree(dto.slug);
    await this.assertPublishReady(dto, existing, id);

    const actorName = dto.actorName ?? 'Admin';

    await this.prisma.db.product.update({
      where: { id },
      data: {
        ...this.buildUpdateData(dto),
        /*  DEC-PRD-050 — stamped ONCE, on the first time this product goes
            live. Re-stamping on every save would make "New arrival" mean
            "recently edited", and a bouquet would go new again every time
            somebody fixed a typo in it.  */
        publishedAt:
          dto.isPublished && !existing.isPublished ? new Date() : undefined,
      },
    });

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

  // DEC (core): Soft Delete Only — never a hard DELETE.
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
        /*  ⚠️ Recovery is where you decide "is this the one I meant to
            delete?" — and the photo is how anybody answers that. It was the
            one list still sending none (owner, 9 Aug 2026).
            `deletedAt: null` on the images, not on the product: the product
            IS deleted here; its photos are not.  */
        images: {
          where: { deletedAt: null },
          orderBy: { sortOrder: 'asc' },
          take: 1,
          select: { id: true, url: true, sortOrder: true },
        },
      },
    });
    return { items: rows.map((r) => this.withOffer(r)), total: rows.length };
  }

  async restore(id: string, actorName = 'Admin') {
    // the base client (without the extension) — deleted records are visible too
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
        listing as stock-tracked while nothing is counting it.
        DEC-ITM-013 (enforced 20 Aug) — and it must be marked "We sell it":
        the item editor promises "only saleable items may be connected to a
        Product", so the server keeps that promise. Covers the product's own
        item AND every variant's item in one query.  */
    const itemIds = [
      ...(dto.itemId ? [dto.itemId] : []),
      ...(dto.variants ?? []).map((v) => v.itemId).filter((x): x is string => !!x?.trim()),
    ];
    if (itemIds.length) {
      const found = await this.prisma.db.item.findMany({
        where: { id: { in: itemIds } },
        /*  isOnline cast: the generated client on a machine that has not run
            BUILD_CHECK.bat yet predates DEC-ITM-024. Goes away on regenerate.  */
        select: { id: true, name: true, isSaleable: true, ...({ isOnline: true } as object) },
      });
      const byId = new Map(found.map((i) => [i.id, i]));
      for (const id of itemIds) {
        const it = byId.get(id);
        if (!it) throw new BadRequestException('itemId not found — pick an item from the list');
        if (!it.isSaleable) {
          throw new BadRequestException(
            `"${it.name}" is not marked "We sell it". Open the item and switch it on first — only saleable items may sit behind a product.`,
          );
        }
        /*  DEC-ITM-024 — and it has to be allowed online. A counter-only item
            (wrapping, decoration) belongs on the till, not on a product page.  */
        if (!(it as { isOnline?: boolean }).isOnline) {
          throw new BadRequestException(
            `"${it.name}" is counter only. Switch on "Sell online" in the item to put it on the website.`,
          );
        }
      }
    }
  }

  // DEC (locked §2): money = integer paisa · discount · advance override rules
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
    DEC-PRD-032 — the Publish gate. Owner, 6 Aug 2026:
    "ami jodi product image na dei taw amr published hoy... ata biroktikor."
    ("even if I give no product image it still gets published... this is
    annoying.")

    `isPublished` used to be just a flag — it truly stopped nothing, so a
    product could go live with no photo, a price of 0, and not one delivery
    speed ticked (carrying a placeholder coloured box). The owner himself set
    the 4 conditions that block publishing — they are locked here. This method
    never stands in the way of saving as a draft; it only checks at the moment
    `isPublished: true` is set.
  */
  private async assertPublishReady(
    dto: { isPublished?: boolean; sellingPricePaisa?: number; categoryId?: string; sku?: string | null; supportsExpress?: boolean; supportsSameDay?: boolean; supportsMidnight?: boolean; deliveryTypeIds?: string[]; images?: { url: string }[]; variants?: ProductVariantInput[] },
    existing: {
      isPublished?: boolean;
      sellingPricePaisa?: number;
      categoryId?: string;
      sku?: string | null;
      supportsExpress?: boolean;
      supportsSameDay?: boolean;
      supportsMidnight?: boolean;
    } | null,
    productId: string | null,
  ) {
    const willPublish = dto.isPublished ?? existing?.isPublished ?? false;
    if (!willPublish) return;

    /*  DEC-PRD-035 — a product whose EVERY variant carries its own price is
        legitimately sold without a product-level price: the shop quotes
        "from ৳X" and each colour charges its own number. Blocking publish on
        the empty box then (caught by the owner, 9 Aug 2026) forced him to
        invent a price nothing would ever sell at. One blank variant, though,
        genuinely falls back to this price — so the gate stays for that.  */
    const price = dto.sellingPricePaisa ?? existing?.sellingPricePaisa ?? 0;
    if (!(price > 0)) {
      const rows =
        dto.variants ??
        (productId
          ? await this.prisma.db.productVariant.findMany({
              where: { productId, deletedAt: null, isActive: true },
              select: { pricePaisa: true },
            })
          : []);
      const everyVariantPriced =
        rows.length > 0 && rows.every((r) => r.pricePaisa != null && r.pricePaisa > 0);
      if (!everyVariantPriced) {
        throw new BadRequestException(
          'Set a selling price above zero — or give every variant its own price — before publishing.',
        );
      }
    }

    const categoryId = dto.categoryId ?? existing?.categoryId;
    if (!categoryId) {
      throw new BadRequestException('Pick a category before publishing.');
    }

    // SKU/product code required to publish (owner, 6 Aug 2026). Draft is never
    // blocked — this only fires when isPublished flips true.
    const sku = (dto.sku ?? existing?.sku ?? '').trim();
    if (!sku) {
      throw new BadRequestException('A product cannot be published without a SKU / product code.');
    }

    /*  ⚠️ THIS GATE USED TO BE ABOUT THREE ENGLISH WORDS (fixed 22 Aug 2026).
        It read `supportsExpress / SameDay / Midnight`, and those three are not
        set by anybody — they are DERIVED in the product editor by matching the
        delivery type's NAME against /hour|express/, /same/ and /midnight/.

        The owner ticked his own two types, "Schedule it" and "National
        delivery". Neither name contains any of those words, so all three
        booleans came out false and publishing was refused — while the screen
        showed the section as done, because two types really were ticked. The
        screen was right and the gate was wrong.

        It also contradicted two locked decisions at once: DEC-DLV-008 says the
        delivery names come from the Delivery module and nothing is hardcoded,
        and house rule 7 says no business value lives in code. A shop that
        renames "Express" to "2 Hour Rush" would have had every publish blocked
        with no way to find out why.

        The rule the business actually wants: a published product must be
        deliverable SOME way. So the gate now asks whether any delivery type is
        linked at all. The three booleans are still written (the storefront's
        speed filter reads them) — they are just no longer the judge.  */
    const linkedTypes =
      dto.deliveryTypeIds !== undefined
        ? dto.deliveryTypeIds.length
        : productId
          ? await this.prisma.db.productDeliveryType.count({ where: { productId } })
          : 0;
    if (linkedTypes === 0) {
      throw new BadRequestException(
        'Pick at least one delivery type on the Delivery tab before publishing.',
      );
    }

    // `images` is REPLACE-not-merge (see `replaceChildren`) — if it is in the
    // dto that is the final list; if not, whatever is in the DB survives.
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
      throw new BadRequestException('Upload at least one photo before publishing.');
    }
  }

  /*
    offer price = selling − discount (paisa). For display, not stored.

    ⚠️ DEC-PRD-028 — an expired discount is not applied here either. Otherwise
    Overview would show a 44% margin while the shop sold at full price — and
    the owner would set his prices standing on the wrong number.
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
    /*  DEC-PRD-050 — "New arrival" is answered here, not read from the column.
        A stored answer to a date question is wrong from the day after it is
        written, so the admin gets the same live answer the shop shows.
        Rows this wrapper is handed without the three fields (the Trash list,
        the funnel projections) keep whatever they had.  */
    const row = p as unknown as {
      publishedAt?: Date | null;
      createdAt?: Date;
      newArrivalMode?: BadgeMode;
    };
    const live =
      row.createdAt === undefined
        ? {}
        : {
            isNewArrival: isNewNow(
              {
                publishedAt: row.publishedAt ?? null,
                createdAt: row.createdAt,
                newArrivalMode: row.newArrivalMode ?? 'AUTO',
              },
              this.newDays,
            ),
          };
    return {
      ...p,
      ...live,
      offerPricePaisa: offer,
      marginPaisa: typeof cost === 'number' ? offer - cost : null,
    };
  }

  /*  How many days count as new. Read from `MerchSetting` and kept for a
      minute so a page of sixty products does not ask sixty times; a badge
      rule that is up to a minute stale has never hurt anybody, and the
      alternative is threading an async call through every list mapper.  */
  private newDays = MERCH_DEFAULTS.newArrivalDays;
  private newDaysAt = 0;

  private async refreshNewDays() {
    if (Date.now() - this.newDaysAt < 60_000) return;
    this.newDaysAt = Date.now();
    try {
      const row = await this.prisma.db.merchSetting.findUnique({ where: { id: 'singleton' } });
      if (row) this.newDays = row.newArrivalDays;
    } catch {
      /*  Before the table exists (first boot on an un-migrated database) the
          default stands. A missing setting must not take the product list
          down with it.  */
    }
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
      /*  DEC-PRD-028 — the discount's expiry. ⚠️ `null`, not an empty string —
          Prisma reads an empty string as an invalid date and the whole save
          breaks.  */
      discountStartsAt: dto.discountStartsAt ? new Date(dto.discountStartsAt) : dto.discountStartsAt === null ? null : undefined,
      discountEndsAt: dto.discountEndsAt ? new Date(dto.discountEndsAt) : dto.discountEndsAt === null ? null : undefined,
      /*  DEC-PRD-025/026/027 — the new fields. Prisma leaves `undefined`
          alone, so a save coming from an older screen erases nothing.  */
      salesSeedToday: dto.salesSeedToday,
      salesSeedWeek: dto.salesSeedWeek,
      salesSeedMonth: dto.salesSeedMonth,
      salesSeedAll: dto.salesSeedAll,
      /*  DEC-PRD-025 — the clock restarts right here. The moment the owner
          goes in and saves, the "today" number starts counting from today.
          ⚠️ If the form says nothing about the number (`undefined`) the time
          is not touched either — saving for some other reason should not
          extend the window.  */
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
      persoTextRequired: dto.persoTextRequired,
      persoImage: dto.persoImage,
      persoImageLabel: dto.persoImageLabel,
      persoImageHint: dto.persoImageHint,
      persoImageRequired: dto.persoImageRequired,
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
      /*  DEC-PRD-050 — the badges are earned, not typed. What arrives from the
          form is the owner's OVERRIDE (Auto / Always / Never); `isBestSeller`
          itself is written only by `MerchService.recompute()`.  */
      bestSellerMode: dto.bestSellerMode,
      newArrivalMode: dto.newArrivalMode,
      /*  The date a customer would call "new" is the day it went live, not the
          day a draft was started.  */
      publishedAt: dto.isPublished ? new Date() : undefined,
      images: dto.images?.length ? { create: dto.images } : undefined,
      sizes: dto.sizes?.length ? { create: dto.sizes } : undefined,
      specRows: dto.specRows?.length ? { create: dto.specRows } : undefined,
      faqs: dto.faqs?.length ? { create: dto.faqs } : undefined,
      trustBadges: dto.trustBadges?.length ? { create: dto.trustBadges } : undefined,
    };
  }

  // update: scalar + FK re-connect + tag set. A full re-sync of child rows
  // comes later (when the edit UI lands) — scalar/relation edits are enough now.
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
   * DEC-DLV-008 — which deliveries this product can travel on.
   *
   * ⚠️ HARD DELETE, not soft — and that is right here. This table holds no
   * information, only a pair of ids. Keeping a deleted pair would mean a row
   * marked "deleted" that nobody will ever read. What an order needs is
   * already snapshotted onto the order itself (DEC-DLV-002).
   *
   * ⚠️ `undefined` touches nothing. A field the form did not mention cannot be
   * erased — this is the mistake that was losing photos when a product was
   * edited on 1 Aug.
   */
  /**
   * DEC-PRD-012 — this product's variants.
   *
   * ⚠️ SOFT DELETE, not hard — an order line may still point at an old
   * variant, and breaking that link would make "which colour was sent" on
   * yesterday's receipt unreadable.
   *
   * ⚠️ `undefined` touches nothing. A field the form did not mention cannot be
   * erased — this is the mistake that was losing photos when a product was
   * edited on 1 Aug.
   */
  private async replaceVariants(productId: string, rows: ProductVariantInput[] | undefined) {
    if (rows === undefined) return;
    const now = new Date();

    /*  ── DEC-PRD-045 · a row is a COMBINATION ────────────────────────────
        The owner, 23 August 2026, on a bouquet that comes in three sizes and
        every size in three colours: nine things to sell, "each pair its own
        price, its own stock, its own item".

        This replaced DEC-PRD-031 ("one product, ONE list"), which existed
        because a flat row of "12 stems · Pink · Large" reads as three
        alternatives of each other and means nothing to a customer. That
        reasoning still holds — and it is answered by giving each LIST its own
        row of buttons on the page, not by allowing only one list.

        What is still refused, because the grid would be ragged and some pair
        would have no price anywhere:
          · two values from the SAME list inside one combination
            (Small and Medium cannot both be one thing)
          · rows that do not all use the same lists
            (one row Size×Colour and the next Size only)  */
    const combos = rows.map((r) => {
      const ids = r.valueIds?.length ? r.valueIds : [r.variantValueId];
      return [...new Set(ids.filter(Boolean))];
    });
    const everyId = [...new Set(combos.flat())];
    const values = await this.prisma.db.variantValue.findMany({
      where: { id: { in: everyId } },
      select: { id: true, attributeId: true, sortOrder: true, attribute: { select: { sortOrder: true, name: true } } },
    });
    const byId = new Map(values.map((v) => [v.id, v]));

    const missing = everyId.filter((id) => !byId.has(id));
    if (missing.length) {
      throw new BadRequestException('One of the chosen options no longer exists — reopen the product and pick again.');
    }

    let shape: string | null = null;
    for (const ids of combos) {
      const attrs = ids.map((id) => byId.get(id)!.attributeId);
      if (new Set(attrs).size !== attrs.length) {
        throw new BadRequestException('One combination uses the same list twice — a thing cannot be both Small and Medium.');
      }
      const thisShape = [...attrs].sort().join('|');
      if (shape === null) shape = thisShape;
      else if (shape !== thisShape) {
        throw new BadRequestException('Every combination has to use the same lists — either all of them carry a size and a colour, or none do.');
      }
    }

    /*  The LEAD value: the axis that comes first in the master's own order,
        so "Medium × Red" is always filed under Medium and never under Red,
        whichever way round the form happened to send them.  */
    const leadOf = (ids: string[]) =>
      [...ids].sort((a, b) => {
        const x = byId.get(a)!;
        const y = byId.get(b)!;
        return (
          x.attribute.sortOrder - y.attribute.sortOrder ||
          x.attribute.name.localeCompare(y.attribute.name) ||
          x.sortOrder - y.sortOrder
        );
      })[0];

    /*  Sorted so that Red+Medium and Medium+Red are recognised as the same
        pair. This column exists only to let the database refuse a duplicate —
        a unique index cannot span a child table's rows, but it can span one
        column here.  */
    const keyOf = (ids: string[]) => [...ids].sort().join('|');
    const keep = combos.map(keyOf);

    await this.prisma.db.productVariant.updateMany({
      where: { productId, deletedAt: null, comboKey: { notIn: keep.length ? keep : ['—'] } },
      data: { deletedAt: now },
    });

    for (const [i, r] of rows.entries()) {
      /*  DEC-PRD-032 — a discount with nothing to discount is a typo. The
          variant's own price is what it comes off; without one the product's
          price rules and the number here would never be applied, so it is
          refused loudly rather than saved and quietly ignored.  */
      if (r.discountType && r.discountType !== 'NONE') {
        if (r.pricePaisa == null) {
          throw new BadRequestException(
            'Give this variant its own price before putting a discount on it.',
          );
        }
        if (!r.discountValue || r.discountValue <= 0) {
          throw new BadRequestException('A variant discount needs a value above zero.');
        }
        if (r.discountType === 'PERCENT' && r.discountValue >= 10_000) {
          throw new BadRequestException('A percentage discount has to be under 100%.');
        }
        if (r.discountType === 'FLAT' && r.discountValue >= r.pricePaisa) {
          throw new BadRequestException(
            'A flat discount has to be smaller than the variant’s own price.',
          );
        }
      }
      const data = {
        imageUrl: r.imageUrl?.trim() ? r.imageUrl : null,
        stockQty: r.stockQty ?? 0,
        /*  DEC-PRD-015 — this colour's own stockroom Item. `null` when blank
            text arrives, because an empty string is not an Item and the FK
            will not accept it.  */
        itemId: r.itemId?.trim() ? r.itemId : null,
        /*  Empty = the product's own price. The owner's rule: changing colour
            keeps the price, changing kg/flavour does not.  */
        pricePaisa: r.pricePaisa ?? null,
        discountType: r.discountType ?? 'NONE',
        discountValue: r.discountValue ?? 0,
        sortOrder: r.sortOrder ?? i,
        isActive: r.isActive ?? true,
        deletedAt: null,
      };
      /*  If the same combination was deleted before it is brought back rather
          than created afresh — `@@unique([productId, comboKey])` demands it,
          and it keeps old orders' links intact. A soft-deleted row still
          holds its key (the trap of 21 Aug), so reviving is the only shape
          that works here.  */
      const ids = combos[i];
      const comboKey = keyOf(ids);
      const lead = leadOf(ids);
      const saved = await this.prisma.db.productVariant.upsert({
        where: { productId_comboKey: { productId, comboKey } },
        create: { productId, comboKey, variantValueId: lead, ...data },
        update: { ...data, variantValueId: lead },
        select: { id: true },
      });

      /*  DEC-PRD-045 — the values this row is made of. Rewritten whole: the
          set is small, and working out which one changed costs more than
          writing two rows.  */
      await this.prisma.db.productVariantValue.deleteMany({
        where: { productVariantId: saved.id, variantValueId: { notIn: ids } },
      });
      await this.prisma.db.productVariantValue.createMany({
        data: ids.map((variantValueId) => ({ productVariantId: saved.id, variantValueId })),
        skipDuplicates: true,
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
      ⚠️ DEC-PRD-033 — the three old flags are written from right here.

      The biggest cut wire found in the 3 Aug audit: the editor wrote to the
      new table (ProductDeliveryType) while the storefront's badge/filter read
      the three old columns (supportsExpress/SameDay/Midnight) — which
      **nobody wrote any more**. Whatever the owner changed on the Delivery
      tab left no mark at all on the website's "2 hrs" badge.

      This translation disappears at step 4, when the storefront learns to read
      the new table. Until then both are written from one place — they cannot
      disagree.

      The translation rule, from DeliveryType.timing:
        FROM_CONFIRM    → express   ("within 2 hours")
        TODAY_SLOT      → same day
        PICK_DATE_FIXED → midnight
    */
    /*
      ⚠️ Only a delivery that can really be offered to a customer counts —
      active, not deleted, and with a fee set in at least one zone. Caught in
      the 3 Aug test itself: a product had an old link to "2-Hour Express" with
      no fee — the editor hides it behind a warning and checkout never offers
      it, yet the badge sat there saying "within 2 hours". A promise that
      cannot be kept is not a badge either.
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
      /*  DEC-PRD-028 — the discount's expiry. ⚠️ `null`, not an empty string —
          Prisma reads an empty string as an invalid date and the whole save
          breaks.  */
      discountStartsAt: dto.discountStartsAt ? new Date(dto.discountStartsAt) : dto.discountStartsAt === null ? null : undefined,
      discountEndsAt: dto.discountEndsAt ? new Date(dto.discountEndsAt) : dto.discountEndsAt === null ? null : undefined,
      /*  DEC-PRD-025/026/027 — the new fields. Prisma leaves `undefined`
          alone, so a save coming from an older screen erases nothing.  */
      salesSeedToday: dto.salesSeedToday,
      salesSeedWeek: dto.salesSeedWeek,
      salesSeedMonth: dto.salesSeedMonth,
      salesSeedAll: dto.salesSeedAll,
      /*  DEC-PRD-025 — the clock restarts right here. The moment the owner
          goes in and saves, the "today" number starts counting from today.
          ⚠️ If the form says nothing about the number (`undefined`) the time
          is not touched either — saving for some other reason should not
          extend the window.  */
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
      persoTextRequired: dto.persoTextRequired,
      persoImage: dto.persoImage,
      persoImageLabel: dto.persoImageLabel,
      persoImageHint: dto.persoImageHint,
      persoImageRequired: dto.persoImageRequired,
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
      /*  DEC-PRD-050 — the override, never the badge itself.  */
      bestSellerMode: dto.bestSellerMode,
      newArrivalMode: dto.newArrivalMode,
    };
  }
}
