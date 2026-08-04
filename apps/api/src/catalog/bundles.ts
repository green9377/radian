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
   * DEC-PRD-017 — এই bundle-এ যে যে product যাবে।
   *
   * ⚠️ `addsProductId` (নিচে) পুরনো — এক bundle = এক product-এর দিনের।
   * নতুন পর্দা `addsProductIds` পাঠায়; একটাও থাকতে পারে, চারটাও।
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
  /*  DEC-PRD-019 — মালিক Pricing tab-এ লাভ দেখতে চান, আর bundle-এর জিনিস
      নিলে লাভও বদলায়। তাই খরচটাও আসে। ⚠️ এটা admin-এর পথ, storefront
      কখনো এই select পড়ে না — খরচ গ্রাহকের দেখার জিনিস নয়।  */
  costPaisa: true,
  discountType: true,
  discountValue: true,
  isPublished: true,
  stockMode: true,
  stockQty: true,
  /*  DEC-PRD-014 — মজুদ variant-এ থাকতে পারে। shop-এর filter-এর সাথে
      হুবহু একই নিয়ম, নাহলে admin বলত "showing" আর website লুকিয়ে রাখত।  */
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
      DEC-PRD-017 — মালিক, ২ আগস্ট ২০২৬: ছাড় বসে **main product সহ** মোট
      দামের উপর। তাই main-এর আজকের দামটা এখানেই লাগে।

      ⚠️ category-স্তরের bundle-এ কোনো main নেই (সেটা তো অনেক product-এর
      সাধারণ তালিকা), তখন `basePaisa` শূন্য — ছাড় শুধু যোগ হওয়া জিনিসের
      উপর বসে। এটা লুকানো হয় না; admin-এ লেখা থাকে।
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
      /*  পুরনো সারিতে item না-ও থাকতে পারে (migration-এর আগে তৈরি) — তখন
          পুরনো একক কলামটাই ধরা হয়, যাতে কিছু হারিয়ে না যায়।  */
      const list = b.items.length > 0 ? b.items.map((i) => i.addsProduct) : [b.addsProduct];

      const itemsPaisa = list.reduce(
        (n, p) => n + paid(p.sellingPricePaisa, p.discountType, p.discountValue),
        0,
      );

      /*  ছাড়ের আগে যা পড়ত, আর ছাড়ের পরে যা পড়বে — দুটোই server-এ।
          মালিক এই সংখ্যা দেখেই ছাড় ঠিক করেন; browser-এ আলাদা হিসাব
          থাকলে তিনি যেটা দেখে সিদ্ধান্ত নিতেন সেটাই ভুলটা হতো।  */
      const beforePaisa = basePaisa + itemsPaisa;
      const afterPaisa = paid(beforePaisa, b.discountType, b.discountValue);

      return {
        id: b.id,
        categoryId: b.categoryId,
        productId: b.productId,
        /** ⚠️ পুরনো — নতুন পর্দা `items` পড়ে */
        addsProductId: b.addsProductId,
        addsName: b.addsProduct.name,
        addsSlug: b.addsProduct.slug,
        addsImageUrl: b.addsProduct.images[0]?.url ?? null,
        /** DEC-PRD-017 — এই bundle-এ যা যা আছে */
        items: list.map((p) => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          imageUrl: p.images[0]?.url ?? null,
          alonePaisa: paid(p.sellingPricePaisa, p.discountType, p.discountValue),
          /** DEC-PRD-019 — লাভের হিসাবের জন্য। admin-only। */
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
        /** main product-এর আজকের দাম, ছাড় বসানোর পর। category-তে 0। */
        basePaisa,
        /** এই bundle-এর জিনিসগুলো আলাদা করে কিনলে যত */
        itemsPaisa,
        /** ছাড়ের আগে সব মিলিয়ে (main সহ) */
        beforePaisa,
        /** ছাড়ের পরে সব মিলিয়ে — গ্রাহক যা দেবে */
        afterPaisa,
        /** কত বাঁচল */
        savePaisa: beforePaisa - afterPaisa,
        /** ⚠️ পুরনো নাম, storefront-এর জন্য: main-এর উপরে কত যোগ হচ্ছে */
        alonePaisa: itemsPaisa,
        addPaisa: Math.max(0, afterPaisa - basePaisa),
        /*  একটাও জিনিস দেখা না গেলে card-টাই website-এ আসবে না। মালিককে
            এখানেই বলা হয়, নাহলে তিনি bundle বানিয়ে কিছু না দেখে ধরে
            নেন জিনিসটা ভাঙা।  */
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
    এক product = একটাই bundle তালিকা — DEC-PRD-018, মালিক ২ আগস্ট ২০২৬

    > *"just main product নিলে কোনো discount নেই, আর সাথে extra কোনো bundle
    >  থেকে product select করলেই সে discount পাবে — এটা আমার concept।"*

    ⚠️ "প্যাকেজ" নয়, **তালিকা**। মালিক ৩-৪টা জিনিস রাখেন; গ্রাহক তার থেকে
    যা খুশি নেয়, বাকিগুলো skip করে। একটাও নিলেই ছাড় বসে — main product
    সহ মোট দামের উপর।

    ⚠️ এই কারণেই "গ্রাহক কয়টা bundle নিতে পারবে" প্রশ্নটাই আর নেই, আর
    "কোন bundle-এ main গোনা হবে" সমস্যাটাও নেই। একটাই তালিকা, একটাই ছাড়।
    আমি ভুল প্রশ্ন করেছিলাম, আর মালিক সেটা ধরিয়ে দিয়েছেন।

    ⚠️ পুরনো তথ্যে এক product-এর নিচে কয়েকটা সারি থাকতে পারে (তখন এক সারি
    = এক জিনিস ছিল)। পড়ার সময় সবগুলোর জিনিস এক তালিকায় জোড়া লাগে, আর ছাড়
    ধরা হয় **প্রথম** সারিরটা। মালিক তালিকাটা একবার save করলেই বাড়তি সারি
    গুলো গুটিয়ে একটাই থাকে (`saveList`)।
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
    /*  একই product দুবার থাকলে একবারই — দুটো পুরনো সারিতে একই জিনিস থাকা
        সম্ভব ছিল, আর গ্রাহক তখন একই কেক দুবার দেখতেন।  */
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
      /** main product-এর আজকের দাম। category-স্তরে 0। */
      basePaisa: first.basePaisa,
      /** সবগুলো নিলে জিনিসগুলোর দাম */
      itemsPaisa,
      /** DEC-PRD-019 — জিনিসগুলোর খরচ, লাভ দেখানোর জন্য (admin-only) */
      itemsCostPaisa,
      /** সবগুলো নিলে, ছাড়ের আগে */
      beforePaisa,
      /** সবগুলো নিলে, ছাড়ের পরে */
      afterPaisa,
      savePaisa: beforePaisa - afterPaisa,
    };
  }

  /**
   * পুরো তালিকাটা একবারে লেখা — DEC-PRD-018।
   *
   * ⚠️ একটাই সারি থাকে। আগে কয়েকটা থেকে থাকলে সেগুলো এখানেই গুটিয়ে যায় —
   * নাহলে দুই সারিতে দুই ছাড় বসে থাকত আর কোনটা চলছে সেটা পর্দা থেকে
   * বোঝাই যেত না।
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

    /*  ⚠️ `?? undefined` — `owner` থেকে `categoryId` আসে `string | null`
        হয়ে, আর `listOne` চায় `string | undefined`। এই একটা অমিলে API
        compile হতে পারেনি আর পুরনো build নিয়ে চলছিল (৩ আগস্ট ২০২৬)।  */
    const where = owner.productId
      ? { productId: owner.productId }
      : { categoryId: owner.categoryId ?? undefined };
    const existing = await this.prisma.db.bundle.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });

    /*  কিছুই না থাকলে তালিকাটাই তুলে দেওয়া — সব সারি নরম করে মুছে যায়।  */
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
      /*  বাড়তি পুরনো সারিগুলো — তাদের জিনিস উপরে জোড়া লেগেছে, তাই এখন
          গুটিয়ে দেওয়া নিরাপদ।  */
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

    /*  DEC-PRD-017 — এক bundle-এ কয়েকটা। পুরনো একক field-টাও মানা হয়,
        কারণ অন্য পর্দা (নতুন product-এর form) এখনো সেটাই পাঠাতে পারে।  */
    const ids = [...new Set(dto.addsProductIds ?? (dto.addsProductId ? [dto.addsProductId] : []))];
    if (ids.length === 0) {
      throw new BadRequestException('pick at least one product for this bundle');
    }
    for (const id of ids) await this.checkAdded(id, owner.productId);

    const b = await this.prisma.db.bundle.create({
      data: {
        categoryId: owner.categoryId,
        productId: owner.productId,
        /*  ⚠️ পুরনো কলামটা এখনো ভরা হয় — প্রথম জিনিসটা দিয়ে। কলামটা
            `NOT NULL`, আর সেটা বদলানো আলাদা কাজ।  */
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

    /*  DEC-PRD-017 — তালিকাটা এলে পুরোটা বদলে যায়, একটাও না এলে কিছুই
        ছোঁয়া হয় না। `undefined` আর `[]` আলাদা রাখাই এখানে আসল কাজ —
        নাহলে শুধু ছাড় বদলাতে গেলে জিনিসগুলো মুছে যেত।  */
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
    COMBO PRICES — DEC-PRD-016, মালিক ২ আগস্ট ২০২৬

    গ্রাহক যা tick করল সেই set যদি এখানে লেখা কোনো combo-র সাথে **হুবহু**
    মেলে, তবে যোগফলের বদলে combo দামটা বসে।

    ⚠️ আজকের স্বাভাবিক দামটাও এখানেই হিসাব হয় (`normalPaisa`), browser-এ
    নয়। দুই জায়গায় দুটো হিসাব থাকলে মালিক যেটা দেখে সিদ্ধান্ত নেন সেটাই
    ভুলটা হতো — bundle-এর ছাড়ের বেলায় ঠিক এই কারণেই অঙ্কটা server-এ।
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

    /*  মূল product-এর আজকের দাম — গ্রাহক যা দেয়, নিজের ছাড় বসানোর পর।  */
    const basePaisa = paid(
      product.sellingPricePaisa,
      product.discountType,
      product.discountValue,
    );

    const bundles = await this.list({ productId });
    const addBy = new Map(bundles.map((b) => [b.id, b]));

    return rows.map((c) => {
      const ids = c.items.map((i) => i.bundleId);
      /*  ⚠️ কোনো bundle মুছে ফেলা হলে সেটা এখানে আর নেই, তাই স্বাভাবিক
          দামটাও কম আসে। সেটা ঢাকা হয় না — মালিক দেখবেন সাশ্রয় কমে গেছে,
          আর সেটাই ইঙ্গিত যে combo-টা আবার দেখা দরকার।  */
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
        /** আজ এগুলো আলাদা আলাদা নিলে যত পড়ত */
        normalPaisa,
        /** ঋণাত্মক হলে combo-টা স্বাভাবিকের চেয়ে দামি — admin সেটা বলে দেয় */
        savePaisa: normalPaisa - c.pricePaisa,
        /** কোনটার নাম কী — admin-এ সারিটা পড়ার জন্য */
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
    /*  ⚠️ একটার combo হয় না। একটা add-on-এর দাম bundle-এর নিজের ছাড়েই
        বসানো যায়, আর দুই জায়গায় একই কাজ থাকলে একদিন দুটো আলাদা উত্তর
        দেবে।  */
    if (ids.length < 2) {
      throw new BadRequestException('a combo needs at least two bundles');
    }
    if (!Number.isInteger(dto.pricePaisa) || dto.pricePaisa <= 0) {
      throw new BadRequestException('pricePaisa must be a positive whole number');
    }

    /*  সবগুলো এই product-এরই bundle কি না। অন্য product-এর card এখানে
        ঢুকলে গ্রাহকের tick কখনো মিলত না, আর কেন মিলছে না তা বোঝাও যেত না।  */
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
    /*  soft delete — order-এর দাম এই সারি থেকে এসেছিল, আর সেই কারণটা
        পরে পড়তে পারা দরকার।  */
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
    DEC-PRD-018 — এক product = একটাই তালিকা। নতুন পর্দা এই দুটোই ডাকে;
    উপরের `list`/`create` পুরনো পাঠকদের জন্য রয়ে গেছে।

    ⚠️ `:id`-র রুটগুলোর **আগে**। নিচে থাকলে "list" শব্দটা একটা id হিসেবে
    ধরা পড়ত আর প্রতিটা ডাক 404 দিত — combos-এর বেলায় ঠিক এটাই ধরা পড়েছিল।
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

  /*  ⚠️ `:id`-র রুটগুলোর **আগে**। নিচে থাকলে "combos" শব্দটা একটা id
      হিসেবে ধরা পড়ত আর প্রতিটা ডাক 404 দিত।  */
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
