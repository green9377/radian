import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { DiscountType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';

/*
  Bundle — the "+ Chocolates" card on a product page. Owner decision, 31 Jul 2026.

  A bundle adds a REAL catalog product. So this table stores no price: only
  which product is added, and the discount the owner gives for taking them
  together. The price is read from that product on every request. Storing
  ৳400 here would be right the day it was typed and wrong every day after.

  Written once on a CATEGORY, overridden on a PRODUCT that needs something
  different — the pattern the owner chose for craft cards on the same day.
*/

interface BundleDto {
  /** exactly one of these two */
  categoryId?: string | null;
  productId?: string | null;
  /**
   * DEC-PRD-017 — the products that go into this bundle.
   *
   * ⚠️ `addsProductId` (below) is the old one — from the days of one bundle =
   * one product. The new screen sends `addsProductIds`; there may be one, there
   * may be four.
   */
  addsProductIds?: string[];
  addsProductId?: string;
  label?: string | null;
  discountType?: DiscountType;
  discountValue?: number;
  sortOrder?: number;
  isBest?: boolean;
  isActive?: boolean;
  actorName?: string;
}

/** what a shopper pays for the added product, after ITS own discount */
function paid(sellingPricePaisa: number, type: DiscountType, value: number): number {
  if (type === 'FLAT') return Math.max(0, sellingPricePaisa - value);
  if (type === 'PERCENT') return Math.max(0, Math.round(sellingPricePaisa * (1 - value / 10000)));
  return sellingPricePaisa;
}

const ADDS = {
  id: true,
  slug: true,
  name: true,
  sellingPricePaisa: true,
  /*  DEC-PRD-019 — the owner wants to see profit on the Pricing tab, and
      taking a bundle item changes the profit too. So the cost comes along.
      ⚠️ This is the admin's path; the storefront never reads this select —
      cost is not a thing customers see.  */
  costPaisa: true,
  discountType: true,
  discountValue: true,
  isPublished: true,
  stockMode: true,
  stockQty: true,
  /*  DEC-PRD-014 — the stock may live on the variants. Exactly the same rule
      as the shop's filter, otherwise the admin would say "showing" while the
      website kept it hidden.  */
  variants: {
    where: { deletedAt: null, isActive: true },
    select: { stockQty: true },
  },
  /*  the main photo, so the admin row shows the thing being added rather than
      a generated colour that looks like one  */
  images: {
    where: { deletedAt: null },
    orderBy: { sortOrder: 'asc' },
    take: 1,
    select: { url: true },
  },
} as const;

@Injectable()
export class BundlesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * One owner's list. `productId` returns that product's own rows; `categoryId`
   * returns the category's defaults.
   *
   * Each row carries the price the shopper would actually see, worked out here
   * rather than in the browser. The admin screen must not do this arithmetic
   * itself — two implementations of one discount rule drift, and the one the
   * owner checks his numbers against would be the wrong one.
   */
  async list(q: { categoryId?: string; productId?: string }) {
    if (!q.categoryId && !q.productId) {
      throw new BadRequestException('categoryId or productId is required');
    }
    const rows = await this.prisma.db.bundle.findMany({
      where: q.productId ? { productId: q.productId } : { categoryId: q.categoryId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        addsProduct: { select: ADDS },
        items: {
          orderBy: [{ sortOrder: 'asc' }],
          include: { addsProduct: { select: ADDS } },
        },
      },
    });

    /*
      DEC-PRD-017 — Owner, 2 Aug 2026: the discount applies to the total
      **including the main product**. So the main's price today is needed right
      here.

      ⚠️ A category-level bundle has no main (it is the shared list for many
      products), and then `basePaisa` is zero — the discount applies only to
      the added items. This is not hidden; it is written in the admin.
    */
    const main = q.productId
      ? await this.prisma.db.product.findFirst({
          where: { id: q.productId },
          select: { sellingPricePaisa: true, discountType: true, discountValue: true },
        })
      : null;
    const basePaisa = main
      ? paid(main.sellingPricePaisa, main.discountType, main.discountValue)
      : 0;

    return rows.map((b) => {
      /*  An older row may have no items (created before the migration) — the
          old single column is used then, so that nothing is lost.  */
      const list = b.items.length > 0 ? b.items.map((i) => i.addsProduct) : [b.addsProduct];

      const itemsPaisa = list.reduce(
        (n, p) => n + paid(p.sellingPricePaisa, p.discountType, p.discountValue),
        0,
      );

      /*  What it cost before the discount and what it costs after — both on
          the server. The owner sets the discount by looking at these numbers;
          a second calculation in the browser would make the very figure he
          decides on the wrong one.  */
      const beforePaisa = basePaisa + itemsPaisa;
      const afterPaisa = paid(beforePaisa, b.discountType, b.discountValue);

      return {
        id: b.id,
        categoryId: b.categoryId,
        productId: b.productId,
        /** ⚠️ the old one — the new screen reads `items` */
        addsProductId: b.addsProductId,
        addsName: b.addsProduct.name,
        addsSlug: b.addsProduct.slug,
        addsImageUrl: b.addsProduct.images[0]?.url ?? null,
        /** DEC-PRD-017 — everything in this bundle */
        items: list.map((p) => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          imageUrl: p.images[0]?.url ?? null,
          alonePaisa: paid(p.sellingPricePaisa, p.discountType, p.discountValue),
          /** DEC-PRD-019 — for working out profit. Admin-only. */
          costPaisa: p.costPaisa,
          hiddenReason: !p.isPublished
            ? ('draft' as const)
            : p.stockMode === 'MANUAL' &&
                (p.variants.length > 0
                  ? p.variants.reduce((n, v) => n + v.stockQty, 0)
                  : p.stockQty) <= 0
              ? ('out-of-stock' as const)
              : null,
        })),
        label: b.label,
        discountType: b.discountType,
        discountValue: b.discountValue,
        sortOrder: b.sortOrder,
        isBest: b.isBest,
        isActive: b.isActive,
        /** the main product's price today, after its discount. 0 on a category. */
        basePaisa,
        /** what this bundle's items would cost bought separately */
        itemsPaisa,
        /** everything together before the discount (main included) */
        beforePaisa,
        /** everything together after the discount — what the customer pays */
        afterPaisa,
        /** how much was saved */
        savePaisa: beforePaisa - afterPaisa,
        /** ⚠️ the old name, for the storefront: how much is added on top of main */
        alonePaisa: itemsPaisa,
        addPaisa: Math.max(0, afterPaisa - basePaisa),
        /*  If not one item is visible, the card itself never reaches the
            website. The owner is told so right here, otherwise he builds a
            bundle, sees nothing, and concludes the thing is broken.  */
        hiddenReason: list.every((p) => p.isPublished === false)
          ? ('draft' as const)
          : list.every(
                (p) =>
                  p.stockMode === 'MANUAL' &&
                  (p.variants.length > 0
                    ? p.variants.reduce((n, v) => n + v.stockQty, 0)
                    : p.stockQty) <= 0,
              )
            ? ('out-of-stock' as const)
            : null,
      };
    });
  }

  /*
    ═══════════════════════════════════════════════════════════════════════
    ONE PRODUCT = ONE BUNDLE LIST — DEC-PRD-018, owner 2 Aug 2026

    > *"taking just the main product gets no discount, and the moment they
    >  select any extra product from a bundle they get the discount — that is
    >  my concept."* (translated)

    ⚠️ Not a "package", a **list**. The owner puts 3–4 items on it; the customer
    takes whichever they like and skips the rest. Taking even one applies the
    discount — to the total including the main product.

    ⚠️ This is why the question "how many bundles can a customer take" no
    longer exists, and neither does the problem of "which bundle counts the
    main". One list, one discount. I had been asking the wrong question, and
    the owner pointed it out.

    ⚠️ Old data may have several rows under one product (back when one row =
    one item). On read, the items of all of them are joined into one list, and
    the discount is taken from the **first** row. Once the owner saves the list
    even once, the extra rows are folded away and one remains (`saveList`).
    ═══════════════════════════════════════════════════════════════════════
  */
  async listOne(q: { categoryId?: string; productId?: string }) {
    const rows = await this.list(q);
    if (rows.length === 0) {
      return {
        id: null as string | null,
        label: null as string | null,
        discountType: 'NONE' as DiscountType,
        discountValue: 0,
        items: [] as (typeof rows)[number]['items'],
        basePaisa: 0,
        itemsPaisa: 0,
        itemsCostPaisa: 0,
        beforePaisa: 0,
        afterPaisa: 0,
        savePaisa: 0,
      };
    }

    const first = rows[0];
    /*  The same product twice counts once — two old rows could hold the same
        item, and the customer would then see the same cake twice.  */
    const seen = new Set<string>();
    const items = rows
      .flatMap((r) => r.items)
      .filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)));

    const itemsPaisa = items.reduce((n, i) => n + i.alonePaisa, 0);
    const itemsCostPaisa = items.reduce((n, i) => n + i.costPaisa, 0);
    const beforePaisa = first.basePaisa + itemsPaisa;
    const afterPaisa = paid(beforePaisa, first.discountType, first.discountValue);

    return {
      id: first.id,
      label: first.label,
      discountType: first.discountType,
      discountValue: first.discountValue,
      items,
      /** the main product's price today. 0 at category level. */
      basePaisa: first.basePaisa,
      /** what the items cost if all of them are taken */
      itemsPaisa,
      /** DEC-PRD-019 — the items' cost, for showing profit (admin-only) */
      itemsCostPaisa,
      /** all of them taken, before the discount */
      beforePaisa,
      /** all of them taken, after the discount */
      afterPaisa,
      savePaisa: beforePaisa - afterPaisa,
    };
  }

  /**
   * Writes the whole list in one go — DEC-PRD-018.
   *
   * ⚠️ One row remains. If several existed before, they are folded away right
   * here — otherwise two rows would each carry a discount and the screen would
   * give no way to tell which one was in force.
   */
  async saveList(dto: {
    categoryId?: string | null;
    productId?: string | null;
    addsProductIds: string[];
    label?: string | null;
    discountType?: DiscountType;
    discountValue?: number;
    actorName?: string;
  }) {
    const owner = this.owner(dto);
    const ids = [...new Set(dto.addsProductIds ?? [])];
    for (const id of ids) await this.checkAdded(id, owner.productId);

    /*  ⚠️ `?? undefined` — `categoryId` arrives from `owner` as
        `string | null`, while `listOne` wants `string | undefined`. This one
        mismatch stopped the API compiling, and it was running on an old build
        (3 Aug 2026).  */
    const where = owner.productId
      ? { productId: owner.productId }
      : { categoryId: owner.categoryId ?? undefined };
    const existing = await this.prisma.db.bundle.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });

    /*  Nothing left means the list itself goes — every row is soft-deleted.  */
    if (ids.length === 0) {
      for (const r of existing) {
        await this.prisma.db.bundle.update({
          where: { id: r.id },
          data: { deletedAt: new Date() },
        });
      }
      return this.listOne(where);
    }

    const keep = existing[0]?.id;
    if (keep) {
      await this.prisma.db.bundleItem.deleteMany({ where: { bundleId: keep } });
      await this.prisma.db.bundleItem.createMany({
        data: ids.map((addsProductId, i) => ({ bundleId: keep, addsProductId, sortOrder: i })),
      });
      await this.prisma.db.bundle.update({
        where: { id: keep },
        data: {
          addsProductId: ids[0],
          label: dto.label === undefined ? undefined : dto.label || null,
          discountType: dto.discountType,
          discountValue: dto.discountValue,
        },
      });
      /*  The surplus old rows — their items were joined in above, so folding
          them away now is safe.  */
      for (const r of existing.slice(1)) {
        await this.prisma.db.bundle.update({
          where: { id: r.id },
          data: { deletedAt: new Date() },
        });
      }
      await this.log(keep, 'UPDATE', dto.actorName, `Bundle list saved (${ids.length} items)`);
    } else {
      const b = await this.prisma.db.bundle.create({
        data: {
          categoryId: owner.categoryId,
          productId: owner.productId,
          addsProductId: ids[0],
          label: dto.label?.trim() || null,
          discountType: dto.discountType ?? 'NONE',
          discountValue: dto.discountValue ?? 0,
          sortOrder: 0,
          isActive: true,
          items: { create: ids.map((addsProductId, i) => ({ addsProductId, sortOrder: i })) },
        },
      });
      await this.log(b.id, 'CREATE', dto.actorName, `Bundle list created (${ids.length} items)`);
    }

    return this.listOne(where);
  }

  async create(dto: BundleDto) {
    const owner = this.owner(dto);

    /*  DEC-PRD-017 — several in one bundle. The old single field is still
        accepted, because another screen (the new-product form) may still be
        sending it.  */
    const ids = [...new Set(dto.addsProductIds ?? (dto.addsProductId ? [dto.addsProductId] : []))];
    if (ids.length === 0) {
      throw new BadRequestException('pick at least one product for this bundle');
    }
    for (const id of ids) await this.checkAdded(id, owner.productId);

    const b = await this.prisma.db.bundle.create({
      data: {
        categoryId: owner.categoryId,
        productId: owner.productId,
        /*  ⚠️ The old column is still filled — with the first item. The column
            is `NOT NULL`, and changing that is a separate job.  */
        addsProductId: ids[0],
        items: { create: ids.map((addsProductId, i) => ({ addsProductId, sortOrder: i })) },
        label: dto.label ?? null,
        discountType: dto.discountType ?? 'NONE',
        discountValue: dto.discountValue ?? 0,
        sortOrder: dto.sortOrder ?? 0,
        isBest: dto.isBest ?? false,
        /*  Created switched OFF is NOT the rule here, unlike banners. A banner
            is fourteen fields and half-filling one is easy; a bundle is a
            product and a discount, both chosen in the same click. Making the
            owner then find a second switch is a step that teaches nothing. */
        isActive: dto.isActive ?? true,
      },
    });
    await this.log(b.id, 'CREATE', dto.actorName, 'Bundle created');
    return b;
  }

  async update(id: string, dto: Partial<BundleDto>) {
    await this.ensure(id);

    /*  DEC-PRD-017 — if the list arrives it replaces the lot; if it does not
        arrive nothing is touched. Keeping `undefined` and `[]` apart is the
        real work here — otherwise changing only the discount would wipe the
        items.  */
    if (dto.addsProductIds !== undefined) {
      const ids = [...new Set(dto.addsProductIds)];
      if (ids.length === 0) {
        throw new BadRequestException('a bundle needs at least one product');
      }
      const row = await this.prisma.db.bundle.findFirst({
        where: { id },
        select: { productId: true },
      });
      for (const x of ids) await this.checkAdded(x, row?.productId ?? null);
      await this.prisma.db.bundleItem.deleteMany({ where: { bundleId: id } });
      await this.prisma.db.bundleItem.createMany({
        data: ids.map((addsProductId, i) => ({ bundleId: id, addsProductId, sortOrder: i })),
      });
      await this.prisma.db.bundle.update({ where: { id }, data: { addsProductId: ids[0] } });
    }

    if (dto.addsProductId) {
      const row = await this.prisma.db.bundle.findFirst({
        where: { id },
        select: { productId: true },
      });
      await this.checkAdded(dto.addsProductId, row?.productId ?? null);
    }
    return this.prisma.db.bundle.update({
      where: { id },
      data: {
        addsProductId: dto.addsProductId,
        label: dto.label === undefined ? undefined : dto.label || null,
        discountType: dto.discountType,
        discountValue: dto.discountValue,
        sortOrder: dto.sortOrder,
        isBest: dto.isBest,
        isActive: dto.isActive,
      },
    });
  }

  async remove(id: string, actorName = 'Admin') {
    await this.ensure(id);
    await this.prisma.db.bundle.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.log(id, 'DELETE', actorName, 'Bundle deleted (soft)');
    return { id, deleted: true };
  }

  /** drag-to-reorder: renumber the whole list 0…n-1 in one call */
  async reorder(ids: string[]) {
    await this.prisma.$transaction(
      ids.map((id, i) => this.prisma.db.bundle.update({ where: { id }, data: { sortOrder: i } })),
    );
    return { count: ids.length };
  }

  /**
   * ⚠️ The database has the same two CHECK constraints. This is not belt and
   * braces for its own sake: a constraint violation reaches the owner as
   * "23514 Bundle_one_owner", which tells him nothing he can act on.
   */
  private owner(dto: BundleDto) {
    const categoryId = dto.categoryId || null;
    const productId = dto.productId || null;
    if (Boolean(categoryId) === Boolean(productId)) {
      throw new BadRequestException(
        'A bundle belongs either to a category (the default for everything in it) or to one product — not both, and not neither.',
      );
    }
    return { categoryId, productId };
  }

  private async checkAdded(addsProductId: string, ownerProductId: string | null) {
    if (ownerProductId && ownerProductId === addsProductId) {
      throw new BadRequestException('A product cannot bundle itself.');
    }
    const p = await this.prisma.db.product.findFirst({
      where: { id: addsProductId },
      select: { id: true },
    });
    if (!p) throw new NotFoundException('The product you are adding does not exist.');
  }

  private async ensure(id: string) {
    const row = await this.prisma.db.bundle.findFirst({ where: { id }, select: { id: true } });
    if (!row) throw new NotFoundException('bundle not found');
  }

  /*
    ═══════════════════════════════════════════════════════════════════════
    COMBO PRICES — DEC-PRD-016, owner 2 Aug 2026

    If the set the customer ticked matches a combo written here **exactly**,
    the combo price replaces the sum.

    ⚠️ Today's normal price is worked out here too (`normalPaisa`), not in the
    browser. Two calculations in two places would make the very figure the
    owner decides on the wrong one — the same reason the bundle discount's
    arithmetic lives on the server.
    ═══════════════════════════════════════════════════════════════════════
  */
  async listCombos(productId: string) {
    if (!productId) throw new BadRequestException('productId is required');

    const [rows, product] = await Promise.all([
      this.prisma.db.bundleCombo.findMany({
        where: { productId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: { items: { select: { bundleId: true } } },
      }),
      this.prisma.db.product.findFirst({
        where: { id: productId },
        select: { sellingPricePaisa: true, discountType: true, discountValue: true },
      }),
    ]);
    if (!product) throw new NotFoundException('Product not found');

    /*  The main product's price today — what the customer pays, after its own
        discount.  */
    const basePaisa = paid(
      product.sellingPricePaisa,
      product.discountType,
      product.discountValue,
    );

    const bundles = await this.list({ productId });
    const addBy = new Map(bundles.map((b) => [b.id, b]));

    return rows.map((c) => {
      const ids = c.items.map((i) => i.bundleId);
      /*  ⚠️ If a bundle was deleted it is no longer here, so the normal price
          comes out lower. That is not papered over — the owner sees the saving
          shrink, and that is the signal that the combo needs another look.  */
      const normalPaisa =
        basePaisa + ids.reduce((n, id) => n + (addBy.get(id)?.addPaisa ?? 0), 0);
      return {
        id: c.id,
        productId: c.productId,
        label: c.label,
        bundleIds: ids,
        pricePaisa: c.pricePaisa,
        sortOrder: c.sortOrder,
        isActive: c.isActive,
        /** what these would cost today taken separately */
        normalPaisa,
        /** negative means the combo is dearer than normal — the admin says so */
        savePaisa: normalPaisa - c.pricePaisa,
        /** which is which — for reading the row in the admin */
        names: ids.map((id) => addBy.get(id)?.addsName ?? '—'),
      };
    });
  }

  async createCombo(dto: {
    productId: string;
    bundleIds: string[];
    pricePaisa: number;
    label?: string | null;
    sortOrder?: number;
    actorName?: string;
  }) {
    if (!dto.productId) throw new BadRequestException('productId is required');
    const ids = [...new Set(dto.bundleIds ?? [])];
    /*  ⚠️ There is no combo of one. A single add-on's price can be set by the
        bundle's own discount, and the same job living in two places will one
        day give two different answers.  */
    if (ids.length < 2) {
      throw new BadRequestException('a combo needs at least two bundles');
    }
    if (!Number.isInteger(dto.pricePaisa) || dto.pricePaisa <= 0) {
      throw new BadRequestException('pricePaisa must be a positive whole number');
    }

    /*  Check every one belongs to this product. Let another product's card in
        here and the customer's ticks would never match, with no way to see
        why.  */
    const owned = await this.prisma.db.bundle.findMany({
      where: { id: { in: ids }, productId: dto.productId },
      select: { id: true },
    });
    if (owned.length !== ids.length) {
      throw new BadRequestException("every bundle must belong to this product's own list");
    }

    const combo = await this.prisma.db.bundleCombo.create({
      data: {
        productId: dto.productId,
        label: dto.label?.trim() || null,
        pricePaisa: dto.pricePaisa,
        sortOrder: dto.sortOrder ?? 0,
        items: { create: ids.map((bundleId) => ({ bundleId })) },
      },
    });
    await this.log(combo.id, 'CREATE', dto.actorName, `Combo price added (${ids.length} items)`);
    return (await this.listCombos(dto.productId)).find((c) => c.id === combo.id);
  }

  async updateCombo(
    id: string,
    dto: { pricePaisa?: number; label?: string | null; isActive?: boolean; actorName?: string },
  ) {
    const found = await this.prisma.db.bundleCombo.findFirst({ where: { id } });
    if (!found) throw new NotFoundException('Combo not found');
    if (dto.pricePaisa !== undefined && (!Number.isInteger(dto.pricePaisa) || dto.pricePaisa <= 0)) {
      throw new BadRequestException('pricePaisa must be a positive whole number');
    }
    await this.prisma.db.bundleCombo.update({
      where: { id },
      data: {
        ...(dto.pricePaisa !== undefined ? { pricePaisa: dto.pricePaisa } : {}),
        ...(dto.label !== undefined ? { label: dto.label?.trim() || null } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    await this.log(id, 'UPDATE', dto.actorName, 'Combo price changed');
    return (await this.listCombos(found.productId)).find((c) => c.id === id);
  }

  async removeCombo(id: string, actorName = 'Admin') {
    const found = await this.prisma.db.bundleCombo.findFirst({ where: { id } });
    if (!found) throw new NotFoundException('Combo not found');
    /*  soft delete — an order's price came from this row, and that reason has
        to stay readable afterwards.  */
    await this.prisma.db.bundleCombo.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.log(id, 'DELETE', actorName, 'Combo price removed');
    return { ok: true };
  }

  private async log(
    entityId: string,
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    actorName = 'Admin',
    label: string,
  ) {
    await this.audit.record({ entityType: 'Bundle', entityId, action, actorName });
    await this.audit.event({ entityType: 'Bundle', entityId, kind: 'general', label, actorName });
  }
}

@Controller('bundles')
export class BundlesController {
  constructor(private readonly svc: BundlesService) {}

  @Get()
  list(@Query('categoryId') categoryId?: string, @Query('productId') productId?: string) {
    return this.svc.list({ categoryId, productId });
  }

  @Post()
  create(@Body() dto: BundleDto, @Headers('x-actor-name') a?: string) {
    return this.svc.create({ ...dto, actorName: dto.actorName ?? a });
  }

  /*
    DEC-PRD-018 — one product = one list. The new screen calls these two;
    `list`/`create` above remain for older readers.

    ⚠️ **Before** the `:id` routes. Below them, the word "list" would be read as
    an id and every call would 404 — exactly what was caught with combos.
  */
  @Get('list')
  listOne(@Query('categoryId') categoryId?: string, @Query('productId') productId?: string) {
    return this.svc.listOne({ categoryId, productId });
  }

  @Post('list')
  saveList(
    @Body()
    dto: {
      categoryId?: string | null;
      productId?: string | null;
      addsProductIds: string[];
      label?: string | null;
      discountType?: DiscountType;
      discountValue?: number;
    },
    @Headers('x-actor-name') a?: string,
  ) {
    return this.svc.saveList({ ...dto, actorName: a });
  }

  /*  ⚠️ **Before** the `:id` routes. Below them, the word "combos" would be
      read as an id and every call would 404.  */
  @Get('combos')
  listCombos(@Query('productId') productId: string) {
    return this.svc.listCombos(productId);
  }

  @Post('combos')
  createCombo(
    @Body() dto: { productId: string; bundleIds: string[]; pricePaisa: number; label?: string | null },
    @Headers('x-actor-name') a?: string,
  ) {
    return this.svc.createCombo({ ...dto, actorName: a });
  }

  @Patch('combos/:id')
  updateCombo(
    @Param('id') id: string,
    @Body() dto: { pricePaisa?: number; label?: string | null; isActive?: boolean },
    @Headers('x-actor-name') a?: string,
  ) {
    return this.svc.updateCombo(id, { ...dto, actorName: a });
  }

  @Delete('combos/:id')
  removeCombo(@Param('id') id: string, @Headers('x-actor-name') a?: string) {
    return this.svc.removeCombo(id, a ?? 'Admin');
  }

  @Patch('reorder')
  reorder(@Body() body: { ids: string[] }) {
    return this.svc.reorder(body.ids ?? []);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<BundleDto>) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Headers('x-actor-name') a?: string) {
    return this.svc.remove(id, a ?? 'Admin');
  }
}

@Module({ providers: [BundlesService], controllers: [BundlesController] })
export class BundlesModule {}
