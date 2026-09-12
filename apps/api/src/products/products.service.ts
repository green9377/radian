import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, DiscountType, ProductType, ProductZone, StockMode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import {
  CreateProductDto,
  UpdateProductDto,
  ListProductQuery,
  ProductVariantInput,
} from './product.dto';
import { paidPaisa } from '../common/discount-window';
import { BD_OFFSET_MS, DAY_MS, startOfBdDay, endOfBdDay } from '../common/bd-day';
/*  DEC-PRD-050 — one rule for "is this new", shared with the storefront.  */
import { isNewNow, MERCH_DEFAULTS, type BadgeMode } from './merch';

/*  One write, or none at all.

    A product's photos, sizes, specs, FAQs, badges, delivery links and variants
    are REPLACED on every save: the old rows go, the new rows come. Run loose,
    that is a window in which the product owns nothing — and any failure in the
    second half (a bad id, a stray key in the request body) leaves it there for
    good, published, with an empty gallery. So every replace now takes the
    client it must run on, and the callers hand it a transaction.  */
type TxDb = Omit<
  PrismaService['db'],
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

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
    /*  "The last 7 days" means seven Dhaka days ending tonight, not a rolling
        168 hours in UTC. Counted the old way, at 09:00 in Dhaka a 1-day report
        reached back to 09:00 yesterday and billed half of yesterday to today.
        The daily bars below are bucketed on Dhaka days, so the window that
        feeds them has to be cut on the same clock or the first bar is a part
        day drawn as a whole one.  */
    const since =
      typeof window === 'number'
        ? new Date(startOfBdDay(new Date(Date.now() - Math.max(0, window - 1) * DAY_MS)))
        : new Date(startOfBdDay(window.from));
    const until = typeof window === 'number' ? undefined : new Date(endOfBdDay(window.to));
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
        It then carried its own COPY of the correction - the third one in this
        file - so the three screens could drift apart one edit at a time. One
        rule, `stockReader`, for all of them.  */
    const stockOf = await this.stockReader(products);

    const items = products.map((p) => {
      const a = map.get(p.id);
      const orders = a ? a.orderIds.size - a.cancelledIds.size : 0;
      const revenuePaisa = a?.revenuePaisa ?? 0;
      /*  MARGIN IS MEASURED AGAINST WHAT WAS ACTUALLY CHARGED.
          It used to be `todayOfferPrice − cost` multiplied by units sold,
          while revenue beside it was the historical line total. Raising a
          price today then changed last month's margin, and a product priced
          only on its variants (sellingPricePaisa 0, DEC-PRD-035) reported a
          large negative one. Revenue is already the real money; the cost of
          the goods is the only other half.  */
      const unitsSold = a?.units ?? 0;
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
        /*  Money that went back out is not margin. It is shown in its own
            column right beside this one, and leaving it in made a fully
            refunded product report its full profit.  */
        marginPaisa: revenuePaisa - (a?.refundPaisa ?? 0) - unitsSold * p.costPaisa,
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
      /*  A Dhaka day, not a UTC one. An order placed at 01:30 in Dhaka is
          19:30 the previous day in UTC — every midnight delivery, a headline
          product here, was landing on yesterday's bar.  */
      const date = new Date(l.order.placedAt.getTime() + BD_OFFSET_MS).toISOString().slice(0, 10);
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
        marginPaisa:
          (a?.revenuePaisa ?? 0) - (a?.refundPaisa ?? 0) - (a?.units ?? 0) * product.costPaisa,
      },
      daily: [...daily.values()].sort((x, y) => x.date.localeCompare(y.date)),
    };
  }

  /* ---------------- read ---------------- */

  /*  DEC-PRD-014 / DEC-PRD-015 - ONE answer to "how many of this are there".

      The list corrected `stockQty` from Inventory and `findOne` did not
      (12 Sep 2026), so the row said 280 and the editor it opened said 0 - for
      the same product, reached from the same screen. A number the admin gives
      two answers to is worse than no number, so the rule now lives in one
      place and every read goes through it.

      MANUAL - the hand-typed numbers: the variants' when there are variants
      (they govern, and the product's own field then only shows their total),
      the product's own when there are none.
      TRACKED - the count belongs to Inventory. A variant with no Item of its
      own falls back to ITS OWN typed number, exactly as the storefront does
      (`product-detail.ts`, variantCount); reading it as zero was the second
      half of the same bug.

      Takes the whole page at once and returns the reader, so a hundred rows
      are still one round trip - never N+1.  */
  private async stockReader(
    rows: {
      itemId: string | null;
      variants: { itemId: string | null; stockQty: number; isActive?: boolean }[];
    }[],
  ) {
    /*  An inactive variant is not on sale, so its stock is not the product's.
        `findOne` includes them (the editor draws them); the list does not.  */
    const live = <V extends { isActive?: boolean }>(vs: V[]) => vs.filter((v) => v.isActive !== false);
    const linkedItemIds = [
      ...new Set(
        rows.flatMap((p) => [
          ...(p.itemId ? [p.itemId] : []),
          ...live(p.variants).flatMap((v) => (v.itemId ? [v.itemId] : [])),
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
    return (p: {
      stockMode: string;
      stockQty: number;
      itemId: string | null;
      variants: { itemId: string | null; stockQty: number; isActive?: boolean }[];
    }): number => {
      const vs = live(p.variants);
      if (p.stockMode === 'MANUAL')
        return vs.length > 0 ? vs.reduce((n, v) => n + v.stockQty, 0) : p.stockQty;
      return vs.length > 0
        ? vs.reduce((n, v) => n + (v.itemId ? (invQty.get(v.itemId) ?? 0) : v.stockQty), 0)
        : p.itemId
          ? (invQty.get(p.itemId) ?? 0)
          : 0;
    };
  }

  async list(q: ListProductQuery) {
    await this.refreshNewDays(); // DEC-PRD-050
    const page = Math.max(1, parseInt(q.page ?? '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(q.pageSize ?? '20', 10) || 20));

    const where: Prisma.ProductWhereInput = {};
    if (q.search) {
      where.OR = [
        { name: { contains: q.search, mode: 'insensitive' } },
        { slug: { contains: q.search, mode: 'insensitive' } },
        /*  THE SKU IS WHAT STAFF SEARCH BY. It is the staff-facing short code
            on the packing slip and the one thing a phone order arrives as
            ("ROSE-78"), and this list returns it in every row - but typing it
            into the search box found nothing, because only the name and the
            slug were matched. (12 Sep 2026)  */
        { sku: { contains: q.search, mode: 'insensitive' } },
      ];
    }
    if (q.categoryId) where.categoryId = q.categoryId;
    /*  A query string is whatever the caller typed. These two were cast
        straight to the Prisma enum, so `?zone=DHAKAA` reached Postgres as an
        invalid enum value and came back a 500 with no message. A filter the
        database does not recognise is the caller's mistake, and it is told
        so.  */
    if (q.productType) where.productType = this.enumOr400(ProductType, q.productType, 'productType');
    if (q.zone) where.zone = this.enumOr400(ProductZone, q.zone, 'zone');
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

    const stockOf = await this.stockReader(items);

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
      items: items.map((p) => this.withOffer({ ...p, stockQty: stockOf(p) })),
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
    /*  ⚠️ `stockQty` STAYS RAW HERE, and the real figure travels beside it.

        The editor binds its stock box to `stockQty` and sends that number back
        on every save. Overwriting it with the DERIVED figure would make a save
        that only fixed a typo write the Inventory total (or the variant sum)
        into a column nothing reads for that product - which is exactly the
        fault the Stock board was deleted for on 11 Sep 2026. `stockOnHand` is
        read-only: it is what the list shows, so the two screens agree without
        either of them writing it.  */
    const stockOf = await this.stockReader([product]);
    return this.withOffer({ ...product, stockOnHand: stockOf(product) });
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
    await this.ensureSkuFree(dto.sku, null);
    await this.assertPublishReady(dto, null, null);

    const actorName = dto.actorName ?? 'Admin';

    /*  ALL OF IT, OR NONE OF IT. The row used to be committed first and its
        delivery links and variants written after, as separate statements. One
        bad variant then left a half-made product behind holding the slug, and
        the second attempt was refused with "slug already in use" — on a
        product the owner could not see.  */
    const created = await this.prisma.db.$transaction(
      async (t) => {
        const tx = t as unknown as TxDb;
        const row = await tx.product.create({
          data: this.buildCreateData(dto),
          select: { id: true },
        });
        /*  DEC-DLV-008 — the new product's delivery links. Deliberately not
            nested inside `create`: update calls these very same functions, so
            the rule is written once.  */
        await this.replaceDeliveryTypes(tx, row.id, dto.deliveryTypeIds);
        await this.replaceVariants(tx, row.id, dto.variants);
        /*  The gate again, on this transaction's own client and on the rows
            that are really there now - see `assertPublishReady`'s `db`. The
            check above the transaction is the one that gives a fast, cheap
            answer; this is the one that is true.  */
        await this.assertPublishReady(dto, null, row.id, tx, true);
        return row;
      },
      { timeout: 30_000, maxWait: 15_000 },
    );

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
    /*  The merged row for the rules that were always there; the payload alone
        for the rules added on 12 Sep. A new rule may not make a product that
        is already in some old state unsavable forever — the owner would meet
        it while changing a name.  */
    this.validateMoneyAndRules({ ...existing, ...dto } as CreateProductDto, dto);
    await this.validateRefs(dto);
    if (dto.slug && dto.slug !== existing.slug) await this.ensureSlugFree(dto.slug);
    if (dto.sku !== undefined && dto.sku !== existing.sku) await this.ensureSkuFree(dto.sku, id);
    await this.assertPublishReady(dto, existing, id);

    const actorName = dto.actorName ?? 'Admin';

    /*  ⚠️ THE HEADER AND ITS LISTS GO TOGETHER.
        The scalar update used to commit on its own and the child rows were
        written after. When the second half failed — one bad delivery id is
        enough — the price, the discount and `isPublished: true` had already
        landed, while the admin showed "Save failed". The owner then believed
        nothing had been saved on a product that was, by then, live.  */
    await this.prisma.db.$transaction(
      async (t) => {
        const tx = t as unknown as TxDb;
        await tx.product.update({
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
        await this.replaceChildrenIn(tx, id, dto);
        /*  LAST, AND INSIDE. The gate above this transaction read the photo
            and delivery counts on the loose client, so a request deleting them
            in parallel could slip between the check and the write and leave a
            published product with no photo. Re-asserted here, after our own
            child rows are in, it judges exactly what is about to be committed
            - and a refusal rolls the whole save back.  */
        await this.assertPublishReady(dto, existing, id, tx, true);
      },
      { timeout: 30_000, maxWait: 15_000 },
    );

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

    /*  WHAT MUST SURVIVE, AND WHAT ONLY LOOKS LIKE IT MUST (12 Sep 2026).

        The rule is unchanged: business history keeps the product. What was
        wrong is which records counted as history. Every one of these is a
        record of a transaction that happened; none of them can be rewritten
        to forget the product, so the product stays. They are counted
        SEPARATELY so the refusal can say which, because "sales, returns or
        POS" sent the owner looking through three modules for one wishlist.  */
    const [webLines, counterLines, variantLines, returnLines, replacementLines, otherBundles, discountRules, bookings] =
      await Promise.all([
        this.prisma.orderLine.count({
          where: { productId: id, order: { fulfillmentType: { not: 'COUNTER' } } },
        }),
        this.prisma.orderLine.count({
          where: { productId: id, order: { fulfillmentType: 'COUNTER' } },
        }),
        /*  A line written against a VARIANT carries no productId of its own.
            Counted here, not only in the error handler below, because this is
            the sentence the owner acts on.  */
        this.prisma.orderLine.count({ where: { productId: null, variant: { productId: id } } }),
        /*  DEC-RTN-002 - the return line keeps its own snapshot of what came
            back. Not an FK, so the database would let the delete through and
            the return would be left describing a product that is gone.  */
        this.prisma.salesReturnLine.count({ where: { productId: id } }),
        this.prisma.returnReplacementLine.count({ where: { productId: id } }),
        /*  ⚠️ ANOTHER PRODUCT'S ADD-ON OFFER.
            `Bundle.addsProductId` is NOT nullable, so freeing it means
            DELETING the bundle - and its combo rows cascade with it, quietly
            turning somebody else's priced 3-item combo into a 2-item combo at
            the same price. That is not ours to do inside a purge, so it is a
            blocker with a name instead.  */
        this.prisma.bundle.count({ where: { addsProductId: id, NOT: { productId: id } } }),
        /*  Non-FK pointers. Nothing stops the delete, so nothing would ever
            report them - the rule would just start matching a dead id.  */
        this.prisma.posDiscountRule.count({ where: { productId: id } }),
        this.prisma.capacityBooking.count({ where: { productId: id } }),
      ]);
    const held: string[] = [];
    if (webLines > 0)
      held.push(`${webLines} website order line${webLines === 1 ? '' : 's'}`);
    if (counterLines > 0)
      held.push(`${counterLines} counter (POS) sale line${counterLines === 1 ? '' : 's'}`);
    if (variantLines > 0)
      held.push(`${variantLines} order line${variantLines === 1 ? '' : 's'} on one of its variants`);
    if (returnLines > 0)
      held.push(`${returnLines} return line${returnLines === 1 ? '' : 's'}`);
    if (replacementLines > 0)
      held.push(`${replacementLines} replacement line${replacementLines === 1 ? '' : 's'}`);
    if (otherBundles > 0)
      held.push(`${otherBundles} add-on offer${otherBundles === 1 ? '' : 's'} on other products`);
    if (discountRules > 0)
      held.push(`${discountRules} counter discount rule${discountRules === 1 ? '' : 's'}`);
    if (bookings > 0)
      held.push(`${bookings} capacity booking${bookings === 1 ? '' : 's'}`);
    if (held.length > 0) {
      throw new BadRequestException(
        `"${existing.name}" appears on ${held.join(' and ')} - that history must keep it. It stays in recovery, hidden from everything else.`,
      );
    }

    try {
      await this.prisma.$transaction([
        /*  CATALOG DATA - ours, and meaningless once the product is gone. All
            of it is cleared here, because a product that only a wishlist or a
            dead delivery link pointed at used to fail the delete with a
            foreign-key error and be reported to the owner as sales history.  */
        this.prisma.productImage.deleteMany({ where: { productId: id } }),
        this.prisma.productSize.deleteMany({ where: { productId: id } }),
        this.prisma.productSpec.deleteMany({ where: { productId: id } }),
        this.prisma.productFaq.deleteMany({ where: { productId: id } }),
        this.prisma.productTrustBadge.deleteMany({ where: { productId: id } }),
        this.prisma.review.deleteMany({ where: { productId: id } }),
        /*  DEC-DLV-008 - which speeds it could travel on. Nothing but this
            product cares.  */
        this.prisma.productDeliveryType.deleteMany({ where: { productId: id } }),
        /*  The made-to-order story shown on ITS page. The category-level rows
            carry no productId and are untouched.  */
        this.prisma.craftPoint.deleteMany({ where: { productId: id } }),
        /*  Hand-picked shelves and saved-for-later lists. A shelf position or
            a heart on a product that no longer exists is not a record of
            anything.  */
        this.prisma.collectionProduct.deleteMany({ where: { productId: id } }),
        this.prisma.wishlistItem.deleteMany({ where: { productId: id } }),
        /*  DEC-PRD-017 - bundles. Only THIS product's own offers are cleared.
            A bundle where this product is the thing being ADDED belongs to a
            different product's page and is refused above by name, because
            freeing it would mean deleting it (the column is not nullable) and
            silently shrinking somebody else's priced combo.  */
        this.prisma.bundleItem.deleteMany({ where: { bundle: { productId: id } } }),
        this.prisma.bundle.deleteMany({ where: { productId: id } }),
        this.prisma.bundleCombo.deleteMany({ where: { productId: id } }),
        /*  The invite is the Orders/Reviews module's row and it survives - it
            can still ask about the order. Only the pointer to a product that
            will not exist is cleared; `productId: null` is a valid state there
            and means "review the shop".  */
        this.prisma.reviewInvite.updateMany({ where: { productId: id }, data: { productId: null } }),
        /*  DEC-PRD-016 - another product sold this one as its larger version.
            That other product stays; it simply stops being an upgrade.  */
        this.prisma.product.updateMany({
          where: { upgradeOfProductId: id },
          data: { upgradeOfProductId: null },
        }),
        /*  DEC-OFR - PRODUCT-shape targeting is a many-to-many, so the link
            rows have to go before the row they point at.  */
        this.prisma.product.update({ where: { id }, data: { offers: { set: [] } } }),
        /*  Variants, their values and their combo rows cascade from here.  */
        this.prisma.product.delete({ where: { id } }),
      ]);
    } catch (e) {
      /*  P2003 = something still points here that this method does not know
          about. The old message guessed - it blamed "sales, returns or POS"
          for what was usually a wishlist row it had simply forgotten to
          clear. Now that all of those ARE cleared, a P2003 means a table
          added since, so the remaining referrer is looked up and NAMED. The
          owner is entitled to know which record is holding his product.  */
      if ((e as { code?: string }).code === 'P2003') {
        const still = await this.findRemainingRefs(id);
        throw new BadRequestException(
          still.length > 0
            ? `"${existing.name}" is still referenced by ${still.join(' and ')} - it must stay in recovery.`
            : `"${existing.name}" is still referenced by another record - it must stay in recovery.`,
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

  /*  Who is still holding this product, in words the owner can act on. Only
      run after a permanent delete has been refused by the database.  */
  private async findRemainingRefs(id: string): Promise<string[]> {
    const checks: [string, Promise<number>][] = [
      ['an order line', this.prisma.orderLine.count({ where: { productId: id } })],
      [
        'an order line on one of its variants',
        this.prisma.orderLine.count({ where: { variant: { productId: id } } }),
      ],
      ['a return line', this.prisma.salesReturnLine.count({ where: { productId: id } })],
      ['a customer review', this.prisma.review.count({ where: { productId: id } })],
      ['a review invite', this.prisma.reviewInvite.count({ where: { productId: id } })],
      ['a wishlist', this.prisma.wishlistItem.count({ where: { productId: id } })],
      ['a collection', this.prisma.collectionProduct.count({ where: { productId: id } })],
      ['a delivery link', this.prisma.productDeliveryType.count({ where: { productId: id } })],
      [
        'a bundle',
        this.prisma.bundle.count({ where: { OR: [{ productId: id }, { addsProductId: id }] } }),
      ],
      ['a bundle item', this.prisma.bundleItem.count({ where: { addsProductId: id } })],
      ['a bundle combo', this.prisma.bundleCombo.count({ where: { productId: id } })],
      ['a craft point', this.prisma.craftPoint.count({ where: { productId: id } })],
      [
        'another product that lists it as an upgrade',
        this.prisma.product.count({ where: { upgradeOfProductId: id } }),
      ],
    ];
    const counts = await Promise.all(checks.map(([, q]) => q.catch(() => 0)));
    return checks.filter((_, i) => counts[i] > 0).map(([label]) => label);
  }

  /** deleted products — the only way an admin can reach `restore()`.
      Uses the base client so the soft-delete extension does not hide them. */
  async trash(q: { page?: string; pageSize?: string } = {}) {
    /*  IT USED TO TAKE 200 AND CALL THAT THE TOTAL (12 Sep 2026).
        `take: 200` with no `skip`, and `total: rows.length`, so a shop past
        200 trashed products was shown "200" and the 201st - the oldest, the
        ones most likely to be junk worth purging - could be neither restored
        nor deleted from any screen. There was no second page to ask for.
        Paged like every other list now, and the total is counted, not
        guessed. The default page size stays 200 so the existing screen, which
        asks for no page, shows exactly what it showed before.  */
    const page = Math.max(1, parseInt(q.page ?? '1', 10) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(q.pageSize ?? '200', 10) || 200));
    const where: Prisma.ProductWhereInput = { NOT: { deletedAt: null } };
    const rows = await this.prisma.product.findMany({
      where,
      orderBy: { deletedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        slug: true,
        sku: true,
        name: true,
        sellingPricePaisa: true,
        costPaisa: true,
        discountType: true,
        discountValue: true,
        /*  Without the window `withOffer` reads every discount as always-on,
            so a finished Valentine's 40% keeps depressing today's figures.  */
        discountStartsAt: true,
        discountEndsAt: true,
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
    const total = await this.prisma.product.count({ where });
    return {
      items: rows.map((r) => this.withOffer(r)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
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

  /*  A filter value out of the query string, checked against the enum it
      claims to be. Names the field and lists what it accepts, because the
      person reading this message is the one building the URL.  */
  private enumOr400<E extends Record<string, string>>(
    e: E,
    value: string,
    field: string,
  ): E[keyof E] {
    const allowed = Object.values(e) as string[];
    if (!allowed.includes(value))
      throw new BadRequestException(`${field} must be one of: ${allowed.join(', ')}`);
    return value as E[keyof E];
  }

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

  /*  `Product.sku` is @unique and publishing demands one, yet only the slug was
      ever checked — a second staff member typing the same code got a bare 500
      with no message. Same raw-client reasoning as the slug above: the index
      does not care that a row is soft-deleted.  */
  private async ensureSkuFree(sku: string | null | undefined, exceptId: string | null) {
    const code = sku?.trim();
    if (!code) return;
    const dupe = await this.prisma.product.findFirst({
      where: { sku: code, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true, name: true, deletedAt: true },
    });
    if (!dupe) return;
    if (!dupe.deletedAt) {
      throw new BadRequestException(`The code "${code}" is already on "${dupe.name}".`);
    }
    /*  DEC-GBL-007 — a buried row does not hold a code hostage: delete a
        master and its code is free again. The slug above is the deliberate
        exception (it is a public URL, and old links and ads point at it); a
        SKU is an internal code on a packing slip, so the promise stands.

        Freed by clearing the column, not by destroying the trashed product —
        and done HERE, before the save opens its transaction, because the
        buried-key extension resolves this by hard-deleting the row on a
        separate connection, which inside a transaction would commit that
        deletion even when the save itself rolls back.  */
    await this.prisma.product.update({ where: { id: dupe.id }, data: { sku: null } });
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
  private validateMoneyAndRules(dto: CreateProductDto, typed: UpdateProductDto = dto) {
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
    /*  A DISCOUNT MAY NEVER RAISE THE PRICE, AND MAY NEVER TAKE ALL OF IT.
        `discountValue` used to skip the integer loop above entirely, so a
        negative FLAT value went straight through: -10000 on a 150000 product
        made the customer pay 250000. The bounds are also closed on both ends
        here, the way the variant path already closes them — a discount equal
        to the price leaves a free product, which is a mistake, not an offer.  */
    if (dType !== DiscountType.NONE) {
      if (!Number.isInteger(dVal) || dVal < 0)
        throw new BadRequestException('discountValue must be a non-negative integer');
      /*  The ceilings stay exactly where they were. `update()` validates the
          MERGED row, so tightening them would make every later save of a
          product already stored at FLAT 0 (a cleared amount box) or PERCENT
          10000 (a giveaway) fail on a rule it never broke.  */
      if (dVal > 0) {
        if (dType === DiscountType.FLAT && dVal > (dto.sellingPricePaisa ?? 0))
          throw new BadRequestException('FLAT discount cannot exceed sellingPricePaisa');
        if (dType === DiscountType.PERCENT && dVal > 10000)
          throw new BadRequestException('PERCENT discount must be basis points 0..10000 (0-100%)');
      }
    }
    /*  A window that ends before it starts is never on, and nothing downstream
        would say so — it would simply behave like "no discount" forever.  */
    if (
      (typed.discountStartsAt !== undefined || typed.discountEndsAt !== undefined) &&
      dto.discountStartsAt &&
      dto.discountEndsAt &&
      new Date(dto.discountStartsAt) >= new Date(dto.discountEndsAt)
    )
      throw new BadRequestException('The discount end must be after its start');

    if (dto.advanceRequired) {
      if (!dto.advanceType) throw new BadRequestException('advanceType required when advanceRequired=true');
      if (dto.advanceType === 'PARTIAL') {
        /*  An empty box arrives as 0, not as absent. Treated as "given", it
            saved a product demanding an advance of nothing - which blocks the
            order and collects no money.  */
        const hasPct = dto.advancePercent != null && dto.advancePercent > 0;
        const hasAmt = dto.advanceAmountPaisa != null && dto.advanceAmountPaisa > 0;
        if (!hasPct && !hasAmt)
          throw new BadRequestException('PARTIAL advance needs advancePercent or advanceAmountPaisa');
        if (hasPct && (!Number.isInteger(dto.advancePercent!) || dto.advancePercent! < 1 || dto.advancePercent! > 100))
          throw new BadRequestException('advancePercent must be a whole number 1..100');
        /*  Asking for more upfront than the thing costs is never intended —
            but only where there IS a product price to compare against. A
            product priced only on its variants carries 0 here (DEC-PRD-035),
            and every advance would fail against that.  */
        if (
          hasAmt &&
          (typed.advanceAmountPaisa !== undefined || typed.sellingPricePaisa !== undefined) &&
          (dto.sellingPricePaisa ?? 0) > 0 &&
          dto.advanceAmountPaisa! > dto.sellingPricePaisa!
        )
          throw new BadRequestException('The advance cannot be more than the price');
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
  /*  `fromDb` - judge the rows that are really there, not the payload.
      The pre-transaction call answers fast from what was sent; the call
      inside the transaction has to look at the table, or it re-evaluates the
      same constants and closes no race at all.  */
  private async assertPublishReady(
    dto: { isPublished?: boolean; sellingPricePaisa?: number; categoryId?: string; sku?: string | null; supportsExpress?: boolean; supportsSameDay?: boolean; supportsMidnight?: boolean; deliveryTypeIds?: string[]; images?: { url: string }[]; variants?: ProductVariantInput[]; stockMode?: StockMode; itemId?: string | null; supplierId?: string | null },
    existing: {
      isPublished?: boolean;
      sellingPricePaisa?: number;
      categoryId?: string;
      sku?: string | null;
      supportsExpress?: boolean;
      supportsSameDay?: boolean;
      supportsMidnight?: boolean;
      stockMode?: StockMode;
      itemId?: string | null;
      supplierId?: string | null;
    } | null,
    productId: string | null,
    /*  RUN ME INSIDE THE TRANSACTION TOO (12 Sep 2026).
        Every count below used to be read on the loose client, before the
        transaction that writes. Two saves arriving together - one setting
        `isPublished: true`, one sending `{ images: [] }` - both passed their
        own gate on the photo the other was about to delete, and the shop was
        left with a published product and an empty gallery. The callers now
        re-assert on the transaction's own client after the children are
        written, so the gate judges the state that is actually committed.  */
    db: TxDb = this.prisma.db,
    fromDb = false,
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
      /*  ⚠️ ACTIVE rows only, and the table wins inside the transaction.
          This block ignored `fromDb`, and `dto.variants` always arrives from
          the editor - so the switched-off rows were never filtered out and a
          product whose only priced variants were all INACTIVE could publish
          at zero.  */
      const rows = (
        (!fromDb && dto.variants) ||
        (productId
          ? await db.productVariant.findMany({
              where: { productId, deletedAt: null },
              select: { pricePaisa: true, isActive: true },
            })
          : [])
      ).filter((r) => (r as { isActive?: boolean }).isActive !== false);
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

    /*  TRACKED MEANS "INVENTORY COUNTS IT" - AND SOMETHING HAS TO BE
        COUNTED (12 Sep 2026).

        `stockMode: TRACKED` with no `itemId` and no variant carrying one was
        accepted and publishable. The stock figure then comes from Inventory,
        Inventory has nothing to look at, and the answer is 0 forever: the
        listing goes live reading OUT OF STOCK, can never be bought, and
        nothing on the screen says why. The owner would go looking in the
        stockroom for a shortage that does not exist.

        Judged on the PAYLOAD, not on the merged row: an older product already
        stored in this state must still be savable while it is being fixed, so
        the refusal only fires when this save is the one deciding to publish
        or touching the stock link itself.  */
    /*  ⚠️ ONLY ON THE SAVE THAT TURNS PUBLISH ON.
        The first version fired whenever the payload MENTIONED any of these
        fields - and the editor sends all of them on every save, so it fired
        always. A product already stored in the bad state could then not be
        saved at all, not even to fix it, and not even to unpublish it.  */
    const goingLive = dto.isPublished === true && !existing?.isPublished;
    /*  A vendor product holds none of our stock: the editor hides the whole
        Stock card when a supplier is set, and the save deliberately clears
        `itemId`. Asking it for a stock link would be asking for a control the
        owner cannot see.  */
    const fromSupplier =
      dto.supplierId !== undefined ? !!dto.supplierId : !!existing?.supplierId;
    const stockMode = dto.stockMode ?? existing?.stockMode;
    if (goingLive && !fromSupplier && stockMode === 'TRACKED') {
      const productItemId = dto.itemId !== undefined ? dto.itemId : existing?.itemId;
      /*  DEC-PRD-015 - a variant may hold its own Item, and then the product
          does not need one of its own.  */
      const variantRows =
        (!fromDb && dto.variants) ||
        (productId
          ? await db.productVariant.findMany({
              where: { productId, deletedAt: null, isActive: true },
              select: { itemId: true },
            })
          : []);
      const someVariantTracked = variantRows.some((v) => !!v.itemId);
      if (!productItemId && !someVariantTracked) {
        throw new BadRequestException(
          'Stock is set to Tracked, so the count comes from Inventory - but nothing is linked to count. Pick a stock item for this product (or give each variant its own item) on the Stock tab, or set stock back to Manual before publishing.',
        );
      }
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
    /*  AND IT MUST BE A DELIVERY THAT CAN ACTUALLY BE OFFERED (12 Sep
        2026). The gate counted the LINKS, while `replaceDeliveryTypes` - two
        screens away, on the same save - only believes a type that is active,
        not deleted, and has a fee in at least one zone. So a product whose one
        ticked type had since been deleted or left without a rate published
        happily, showed no delivery badge, and reached checkout with nothing to
        offer the customer. The two now ask the same question.  */
    const linkedTypeIds =
      !fromDb && dto.deliveryTypeIds !== undefined
        ? [...new Set(dto.deliveryTypeIds)]
        : productId
          ? (
              await db.productDeliveryType.findMany({
                where: { productId },
                select: { typeId: true },
              })
            ).map((r) => r.typeId)
          : [];
    const linkedTypes = linkedTypeIds.length
      ? await db.deliveryType.count({
          where: {
            id: { in: linkedTypeIds },
            isActive: true,
            deletedAt: null,
            rates: { some: { deletedAt: null } },
          },
        })
      : 0;
    /*  The "offerable" half of this rule is new (12 Sep 2026), so it judges
        only a save that is turning publish ON. A product that has been live
        for weeks and whose delivery type was deleted last month must still be
        savable - otherwise the owner meets a 400 while editing its name, with
        no way out but a rule he cannot satisfy from that screen.  */
    if (linkedTypeIds.length === 0 || (goingLive && linkedTypes === 0)) {
      throw new BadRequestException(
        linkedTypeIds.length === 0
          ? 'Pick at least one delivery type on the Delivery tab before publishing.'
          : 'The delivery type on this product cannot be offered - it is switched off, deleted, or has no zone rate set up. Fix it in the Delivery module, or tick another one, before publishing.',
      );
    }

    // `images` is REPLACE-not-merge (see `replaceChildren`) — if it is in the
    // dto that is the final list; if not, whatever is in the DB survives.
    let imageCount: number;
    if (!fromDb && dto.images !== undefined) {
      imageCount = dto.images.length;
    } else if (productId) {
      imageCount = await db.productImage.count({
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
      sku: dto.sku === undefined ? undefined : (dto.sku?.trim() || null),
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
      allowOrderAtZero: dto.allowOrderAtZero ?? false, // the owner's switch, 4 Sep 2026
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
      discountOnVariants: dto.discountOnVariants,
      variantAxisOrder: dto.variantAxisOrder,
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
      /*  Same whitelist as the update path — the request body is not allowed
          to choose an `id` or arrive already `deletedAt`. `sortOrder` is set
          here too, so a gallery's order does not depend on the order Postgres
          happens to return rows in.  */
      images: dto.images?.length ? { create: ProductsService.ordered(dto.images, ProductsService.CHILD_KEYS.images) } : undefined,
      sizes: dto.sizes?.length ? { create: ProductsService.ordered(dto.sizes, ProductsService.CHILD_KEYS.sizes) } : undefined,
      specRows: dto.specRows?.length ? { create: ProductsService.ordered(dto.specRows, ProductsService.CHILD_KEYS.specRows) } : undefined,
      faqs: dto.faqs?.length ? { create: ProductsService.ordered(dto.faqs, ProductsService.CHILD_KEYS.faqs) } : undefined,
      trustBadges: dto.trustBadges?.length ? { create: ProductsService.ordered(dto.trustBadges, ProductsService.CHILD_KEYS.trustBadges) } : undefined,
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
  /*  Only the columns the editor is allowed to set. The rows used to be spread
      into `createMany` raw, so a body carrying `id` or `deletedAt` wrote them —
      a photo could arrive already deleted, counted by the publish gate and
      invisible on the page.  */
  private static readonly CHILD_KEYS = {
    images: ['url'],
    sizes: ['label', 'sub', 'pricePaisa'],
    specRows: ['item', 'qty'],
    faqs: ['question', 'answer'],
    trustBadges: ['icon', 'iconUrl', 'label', 'sub'],
  } as const;

  /*  The cast is only about types: at runtime the row really is stripped to
      the whitelist. Prisma's nested-create type wants the model's required
      columns named, and `pick` returns an index signature.  */
  private static ordered<T extends object>(rows: T[], keys: readonly string[]): (T & { sortOrder: number })[] {
    return ProductsService.pick(rows, keys).map((r, i) => ({ ...r, sortOrder: i })) as unknown as (T & {
      sortOrder: number;
    })[];
  }

  private static pick<T extends object>(rows: T[], keys: readonly string[]) {
    return rows.map((r) => {
      const out: Record<string, unknown> = {};
      for (const k of keys) if (k in r) out[k] = (r as Record<string, unknown>)[k];
      return out;
    });
  }

  private async replaceChildrenIn(db: TxDb, productId: string, dto: UpdateProductDto) {
    const now = new Date();
    const swap = async <T extends object>(
      model: {
        updateMany: (a: unknown) => Promise<unknown>;
        createMany: (a: unknown) => Promise<unknown>;
      },
      rows: T[] | undefined,
      keys: readonly string[],
    ) => {
      if (rows === undefined) return;
      await model.updateMany({
        where: { productId, deletedAt: null },
        data: { deletedAt: now },
      });
      if (rows.length === 0) return;
      await model.createMany({
        data: ProductsService.pick(rows, keys).map((r, i) => ({ ...r, productId, sortOrder: i })),
      });
    };

    const K = ProductsService.CHILD_KEYS;
    await swap(db.productImage, dto.images, K.images);
    await swap(db.productSize, dto.sizes, K.sizes);
    await swap(db.productSpec, dto.specRows, K.specRows);
    await swap(db.productFaq, dto.faqs, K.faqs);
    await swap(db.productTrustBadge, dto.trustBadges, K.trustBadges);
    await this.replaceDeliveryTypes(db, productId, dto.deliveryTypeIds);
    await this.replaceVariants(db, productId, dto.variants);
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
  private async replaceVariants(db: TxDb, productId: string, rows: ProductVariantInput[] | undefined) {
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
    const values = await db.variantValue.findMany({
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

    /*  What is already stored for each combination. A partial save is judged
        on the MERGED row, not on the handful of keys the screen sent: a
        price-only save that drops the price to 500 must still be refused if
        the row it lands on carries a flat discount of 1200.  */
    const stored = new Map(
      (
        await db.productVariant.findMany({
          /*  `deletedAt: undefined` on purpose — it overrides the soft-delete
              extension's injected `deletedAt: null`. A deleted combination
              KEEPS its comboKey (that is why the upsert below revives instead
              of creating), so without this the one case this merge exists for
              reads as "no stored row" and a stale discount survives.  */
          where: { productId, deletedAt: undefined, comboKey: { in: keep.length ? keep : ['—'] } },
          select: { comboKey: true, pricePaisa: true, discountType: true, discountValue: true },
        })
      ).map((v) => [v.comboKey, v]),
    );

    await db.productVariant.updateMany({
      where: { productId, deletedAt: null, comboKey: { notIn: keep.length ? keep : ['—'] } },
      data: { deletedAt: now },
    });

    for (const [i, r] of rows.entries()) {
      /*  DEC-PRD-032 — a discount with nothing to discount is a typo. The
          variant's own price is what it comes off; without one the product's
          price rules and the number here would never be applied, so it is
          refused loudly rather than saved and quietly ignored.  */
      const prev = stored.get(keyOf(combos[i]));
      /*  Handing the price back to the product ("use the product's price")
          takes the variant's own discount with it — it came off the variant's
          own price and would otherwise be pointing at nothing. Decided here,
          before the check below, or clearing a price on a discounted variant
          would be refused instead of saved.  */
      const clearing = r.pricePaisa === null && r.discountType === undefined;
      const merged = {
        pricePaisa: r.pricePaisa !== undefined ? r.pricePaisa : (prev?.pricePaisa ?? null),
        discountType: clearing ? 'NONE' : r.discountType !== undefined ? r.discountType : (prev?.discountType ?? 'NONE'),
        discountValue: clearing ? 0 : r.discountValue !== undefined ? r.discountValue : (prev?.discountValue ?? 0),
      };
      if (merged.discountType && merged.discountType !== 'NONE') {
        const r = merged;
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
      /*  A VARIANT'S PRICE AND STOCK ARE REAL MONEY — check them.
          Only the discount was ever inspected here; a row could carry
          `pricePaisa: -250000` or `stockQty: -5` and it was written verbatim,
          and the product's displayed stock was the sum of those.  */
      if (r.pricePaisa != null && (!Number.isInteger(r.pricePaisa) || r.pricePaisa < 0))
        throw new BadRequestException('A variant price has to be a whole amount, and not below zero.');
      if (r.stockQty != null && (!Number.isInteger(r.stockQty) || r.stockQty < 0))
        throw new BadRequestException('A variant stock count has to be a whole number, and not below zero.');

      /*  ⚠️ WHAT THE SCREEN DID NOT SEND, THE SCREEN IS NOT EDITING.
          These defaults used to be applied to the UPDATE branch too, so a
          price-only save (`{variantValueId, pricePaisa}` — all the pricing tab
          knows) set every variant's stock to 0 and dropped every swatch photo.
          On a product with `soldOutMode = STOCK_OUT` that put the whole thing
          out of stock on the website, and the audit diff recorded `variants`
          as one blob, so nobody could see what had happened.

          A new row still needs a full set of defaults — that is `create`
          below. An existing row is changed only where the caller spoke.  */
      const create = {
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
      const update: Record<string, unknown> = { deletedAt: null, sortOrder: r.sortOrder ?? i };
      if (r.imageUrl !== undefined) update.imageUrl = r.imageUrl?.trim() ? r.imageUrl : null;
      if (r.stockQty !== undefined) update.stockQty = r.stockQty;
      if (r.itemId !== undefined) update.itemId = r.itemId?.trim() ? r.itemId : null;
      if (r.pricePaisa !== undefined) {
        update.pricePaisa = r.pricePaisa;
        /*  Back to "use the product's price" — the variant's own discount came
            off the variant's own price, so it goes with it rather than being
            left pointing at nothing.  */
        if (clearing) {
          update.discountType = 'NONE';
          update.discountValue = 0;
        }
      }
      if (r.discountType !== undefined) {
        update.discountType = r.discountType;
        if (r.discountType === 'NONE') update.discountValue = 0;
      }
      if (r.discountValue !== undefined) update.discountValue = r.discountValue;
      if (r.isActive !== undefined) update.isActive = r.isActive;
      /*  If the same combination was deleted before it is brought back rather
          than created afresh — `@@unique([productId, comboKey])` demands it,
          and it keeps old orders' links intact. A soft-deleted row still
          holds its key (the trap of 21 Aug), so reviving is the only shape
          that works here.  */
      const ids = combos[i];
      const comboKey = keyOf(ids);
      const lead = leadOf(ids);
      const saved = await db.productVariant.upsert({
        where: { productId_comboKey: { productId, comboKey } },
        create: { productId, comboKey, variantValueId: lead, ...create },
        update: { ...update, variantValueId: lead },
        select: { id: true },
      });

      /*  DEC-PRD-045 — the values this row is made of. Rewritten whole: the
          set is small, and working out which one changed costs more than
          writing two rows.  */
      await db.productVariantValue.deleteMany({
        where: { productVariantId: saved.id, variantValueId: { notIn: ids } },
      });
      await db.productVariantValue.createMany({
        data: ids.map((variantValueId) => ({ productVariantId: saved.id, variantValueId })),
        skipDuplicates: true,
      });
    }
  }

  private async replaceDeliveryTypes(db: TxDb, productId: string, ids: string[] | undefined) {
    if (ids === undefined) return;
    await db.productDeliveryType.deleteMany({ where: { productId } });
    if (ids.length > 0) {
      await db.productDeliveryType.createMany({
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
      ? await db.deliveryType.findMany({
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
    await db.product.update({
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
      sku: dto.sku === undefined ? undefined : (dto.sku?.trim() || null),
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
      allowOrderAtZero: dto.allowOrderAtZero, // undefined = the form did not mention it
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
      discountOnVariants: dto.discountOnVariants,
      variantAxisOrder: dto.variantAxisOrder,
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
