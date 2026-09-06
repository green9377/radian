import { Controller, Get, Injectable, Module, NotFoundException, Param, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../auth/auth.guard';
import { LayoutModule, LayoutService, type BestSellerMode } from '../storefront/layout';
import { paidPaisa } from '../common/discount-window';
/*  DEC-PRD-050 — one rule for "is this new", shared with the admin.  */
import { displayCut, loadDisplayOffers, type DisplayOffer } from './display-offers';
import { isNewNow, MERCH_DEFAULTS } from '../products/merch';

/*
  ═══════════════════════════════════════════════════════════════════════════
  Public storefront catalogue — `/shop/products` and `/shop/category/:slug`.

  Part of the same read-only surface as `shop.ts`, and bound by every rule in
  that file's header. It lives apart only because it is large: the category
  page is fourteen sections, and putting them in shop.ts would bury the eight
  small readers already there.

  ⚠️ THE RULE THAT MATTERS MOST HERE. `shop.ts` warns that the moment products
  are served on a public route, a careless `include` publishes `costPaisa` —
  what the shop pays — to anyone who opens the network tab. This is that
  moment. Every product field returned is named in CARD_SELECT below, there is
  no spread anywhere in this file, and `costPaisa` appears nowhere in it. If a
  field is not in that select, it cannot reach a shopper.

  Until today `apps/web` had never read a single product from the API — every
  price on the site came from the mock array in `_data/products.ts`. This is
  the endpoint that ends that, and PDP, collections, occasions and search will
  all stand on it.
  ═══════════════════════════════════════════════════════════════════════════
*/

const LIVE = { deletedAt: null, isPublished: true } as const;

/**
 * Card art when a product has no photograph yet.
 *
 * Indexed by a hash of the slug rather than by list position, so a product
 * keeps the same colour on every page it appears on and does not change
 * colour when the sort order changes. Never grey: real photography is still a
 * launch dependency and a grey box reads as a broken image.
 */
const GRADIENTS = [
  'linear-gradient(160deg,#F6E3F3,#EAC3E6)',
  'linear-gradient(160deg,#FBEDE4,#F2D3C0)',
  'linear-gradient(160deg,#F1E4F8,#DFC5F0)',
  'linear-gradient(160deg,#F4E6DE,#E5CBBB)',
  'linear-gradient(160deg,#E7F2E7,#CBE3CE)',
  'linear-gradient(160deg,#F3E7F8,#E1C9F1)',
  'linear-gradient(160deg,#FBEAF0,#F2CBDD)',
  'linear-gradient(160deg,#F1E6F6,#DFC8ED)',
];

const gradientFor = (seed: string) => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
};

/** "Baby Pink" → "baby-pink". Colour values have a label, not a slug. */
export const slugifyLabel = (s: string) =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * What an added "row of products" block asks the catalogue for — the same
 * question on the homepage and on a category page, so the two cannot drift.
 *
 * `bestseller` = the earned badge only (`best=1`), ranked by the window sales
 * behind it. Until 4 Sep 2026 the homepage version of this block read a mock
 * array and the category version a popularity sort padded with newest
 * products — two rows called "best sellers" and neither of them was.
 */
export function productRowQuery(cfg: Record<string, unknown>): Pick<ProductQuery, 'best' | 'speed' | 'sort' | 'limit'> {
  const rule = String(cfg.rule ?? 'bestseller');
  const speed = rule === 'express' || rule === 'same_day' || rule === 'midnight' ? rule : undefined;
  return {
    best: rule === 'bestseller' ? '1' : undefined,
    speed,
    sort: rule === 'new' ? 'new' : rule === 'bestseller' ? 'best' : 'popular',
    limit: String(Math.min(Math.max(Number(cfg.count) || 8, 2), 12)),
  };
}

/*
  ⚠️ This used to be a hand-written sum, with a note beside it saying "keep
  this in step with offers.service.ts". It was not kept in step: on 3 Aug,
  after the discount window was added, the product page stopped discounting
  while this grid carried on — one product, two prices, on two pages.

  Both now call `common/discount-window.ts`. A comment cannot keep two copies
  identical; one copy can.
*/
const offerPaisa = (
  selling: number,
  type: string,
  value: number,
  startsAt?: Date | null,
  endsAt?: Date | null,
): number =>
  paidPaisa({
    sellingPricePaisa: selling,
    discountType: type,
    discountValue: value,
    discountStartsAt: startsAt,
    discountEndsAt: endsAt,
  });

/*
  Every product field the storefront may see. Nothing outside this list leaves
  the server — see the header. Read it before adding to it.
*/
const CARD_SELECT = {
  id: true, // internal — stripped in toCard, used only for the ratings join
  slug: true,
  name: true,
  shortDesc: true,
  sellingPricePaisa: true,
  discountType: true,
  discountValue: true,
  /*  DEC-PRD-028 — the grid and the PDP call the same `paidPaisa()`, so the
      window is needed in both places; otherwise the card would show a discount
      and the page the full price.  */
  discountStartsAt: true,
  discountEndsAt: true,
  zone: true,
  supportsExpress: true,
  supportsSameDay: true,
  supportsMidnight: true,
  isBestSeller: true,
  /*  DEC-PRD-050 — "new" is worked out from these three, never read from the
      `isNewArrival` column: a stored answer to a date question is wrong from
      the day after it is written.  */
  newArrivalMode: true,
  publishedAt: true,
  createdAt: true,
  advanceRequired: true,
  salesCount: true,
  leadTimeDays: true,
  category: { select: { id: true, slug: true, name: true, parent: { select: { id: true, slug: true } } } },
  images: {
    where: { deletedAt: null },
    orderBy: { sortOrder: 'asc' },
    take: 1,
    select: { url: true },
  },
  tags: {
    where: { isActive: true, deletedAt: null },
    select: { slug: true, group: { select: { slug: true } } },
  },
  variantValue: { select: { label: true, swatch: true, imageUrl: true } },
  /*  DEC-PRD-035 — a card must not quote a price nothing is sold at. When
      every live variant carries its own price, the card shows the cheapest
      of them, marked "from". Owner, 9 Aug 2026: *"if two variants have
      different prices, what is the main price box for?"* — on the card, none, and it was showing
      ৳4,400 for a product whose colours cost ৳450, ৳320 and ৳50.  */
  variants: {
    where: { deletedAt: null, isActive: true },
    select: { pricePaisa: true, discountType: true, discountValue: true },
  },
} satisfies Prisma.ProductSelect;

type CardRow = Prisma.ProductGetPayload<{ select: typeof CARD_SELECT }>;

/** The shape `apps/web`'s ProductCard has always been given. */
export interface ShopProduct {
  slug: string;
  name: string;
  /** what they pay, after any discount — integer paisa, always */
  pricePaisa: number;
  /** the struck-through price, or null when nothing is off */
  mrpPaisa: number | null;
  /** DEC-PRD-035 — true when `pricePaisa` is the cheapest of several variant
   *  prices, so the card reads "from ৳450" rather than promising that exact
   *  number for whatever the shopper ends up choosing. */
  priceFrom?: boolean;
  cat: string;
  sub: string | null;
  zone: 'dhaka' | 'both';
  badge: 'express' | 'midnight' | 'courier';
  stars: string;
  rating: number | null;
  reviewCount: number;
  meta: string;
  bg: string;
  imageUrl: string | null;
  best: boolean;
  exp: boolean;
  sd: boolean;
  mn: boolean;
  neu: boolean;
  occ: string[];
  rec: string[];
  prepaidOnly: boolean;
  colour: { label: string; swatch: string | null; imageUrl: string | null } | null;
}

export interface ProductQuery {
  category?: string;
  sub?: string;
  /** name or slug, contains-match — what the admin's hand-pick box types into */
  search?: string;
  tag?: string;
  occasion?: string;
  /** a tag from the `recipients` group — the Gift Finder's "who is it for" */
  recipient?: string;
  colour?: string;
  /** in TAKA, not paisa — these come straight off the budget links in the page.
   *  string | number: the query string gives a string, the internal caller
   *  (collectionPage) gives a number — both go through `Number()`, so both are valid. */
  min?: string | number;
  max?: string | number;
  speed?: string;
  /** '1' = badge holders only (DEC-PRD-050) — the one definition of "best seller" */
  best?: string | number | boolean;
  sort?: string;
  zone?: string;
  page?: string | number;
  limit?: string | number;
}

@Injectable()
export class ShopCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly layout: LayoutService,
  ) {}

  /* ═══════════════════ product list ═══════════════════ */

  /**
   * The grid, the rails and every filter on them.
   *
   * `category` accepts a parent and includes its children — a shopper on Fresh
   * Flowers expects the roses to be there. The owner said it plainly: same
   * category, filter by colour, show those products.
   */
  async products(q: ProductQuery) {
    const limit = Math.min(Math.max(Number(q.limit) || 24, 1), 60);
    const page = Math.max(Number(q.page) || 1, 1);

    const catIds = await this.categoryIds(q.category, q.sub);
    if (catIds === null) return { items: [], total: 0, page, limit };

    const where = await this.buildWhere(q, catIds);

    /*
      Two paths, and the reason for the slow one is honest.

      A discounted product is displayed at its discounted price, so a budget
      band must filter on THAT price — otherwise "Under ৳1,000" hides a ৳1,200
      bouquet marked down to ৳900, which is exactly the product most likely to
      sell. The discount lives in two columns, and no `where` clause can
      compare against their result. So when a price filter is present the
      matching rows are read lean and filtered in memory.

      It is bounded (published products in one category), and it is correct.
      When the catalogue outgrows it the answer is a stored effective price
      maintained by the Product module — not a wrong filter that nobody notices.
    */
    const hasPriceFilter = q.min !== undefined || q.max !== undefined;
    /*  5 Sep 2026 — the price SORT takes the slow path too. `sellingPricePaisa`
        is the price before the discount, before the cheapest variant and
        before an automatic offer; sorting on it put a ৳2,000 bouquet marked
        down to ৳900 after a ৳1,200 one. Low-to-high must be the numbers the
        shopper sees, in order — the same number the card prints.  */
    const priceSort = q.sort === 'price_asc' || q.sort === 'price_desc';

    if (!hasPriceFilter && !priceSort) {
      const [rows, total] = await Promise.all([
        this.prisma.db.product.findMany({
          where,
          orderBy: this.orderBy(q.sort),
          skip: (page - 1) * limit,
          take: limit,
          select: CARD_SELECT,
        }),
        this.prisma.db.product.count({ where }),
      ]);
      return { items: await this.toCards(rows), total, page, limit };
    }

    const minPaisa = q.min === undefined ? null : Math.round(Number(q.min) * 100);
    const maxPaisa = q.max === undefined ? null : Math.round(Number(q.max) * 100);

    const [all, displayOffers] = await Promise.all([
      this.prisma.db.product.findMany({
        where,
        orderBy: this.orderBy(priceSort ? 'popular' : q.sort),
        select: CARD_SELECT,
      }),
      loadDisplayOffers(this.prisma),
    ]);
    /*  ⚠️ THE PRICE THE CARD PRINTS, NOT `sellingPricePaisa` — 5 Sep 2026.
        The band used to test the product's own discounted price only, while
        the card showed the cheapest variant minus the automatic offer. So
        "৳2,000 – ৳5,000" held a ৳1,800 bouquet (a ৳2,000 one with 10 % off
        applied on the card but not here) and a "from ৳1,080" one. One
        function now, the card's own: what is filtered is what is shown.  */
    const priced = all.map((r) => ({ r, p: this.cardPrice(r, displayOffers) }));
    const inBand = priced.filter(({ p }) => {
      if (minPaisa !== null && p < minPaisa) return false;
      if (maxPaisa !== null && p > maxPaisa) return false;
      return true;
    });
    if (priceSort) {
      inBand.sort((a, b) => (q.sort === 'price_asc' ? a.p - b.p : b.p - a.p) || a.r.name.localeCompare(b.r.name));
    }
    const slice = inBand.slice((page - 1) * limit, page * limit).map(({ r }) => r);
    return { items: await this.toCards(slice), total: inBand.length, page, limit };
  }

  /* ═══════════════════ the homepage Best Sellers grid ═══════════════════ */

  /**
   * Everything the homepage grid draws, in one answer: the tabs, the cards
   * under each tab, and the words around them — all from the section's own
   * settings (Storefront → Homepage → Layout → Best Sellers).
   *
   * ⚠️ WHY THE TABS AND THE CARDS ARE DECIDED HERE, NOT IN THE BROWSER.
   * Until 4 Sep 2026 the component carried five tab slugs from the July mock
   * (`flowers`, `cakes`…) that matched no live category, so only "All" ever
   * showed; and "All" was one popularity SORT of 24 products — not a filter —
   * padded with whatever `salesCount` (a typed field) and newest-first put
   * next. A shelf called Best Sellers was showing products that had never
   * sold. Now:
   *
   *   · the tabs are the owner's chosen top-level categories, in his order —
   *     or, until he chooses, the categories featured on the homepage
   *   · each tab is its own query against THAT category, so a tab shows that
   *     category's best sellers and not whatever reached a global pool
   *   · "All" spans the tab categories (every category when there are none)
   *   · AUTO shows the earned badge only (DEC-PRD-050), ranked by the window
   *     sales the badge was decided on — never `salesCount`
   *
   * A tab with nothing under it is left out, as before; "All" with nothing
   * under it is the section's own empty state, in the owner's words.
   */
  async homeBestSellers(zone?: string) {
    const cfg = await this.layout.sectionConfig('home', 'bestsellers');
    const mode = String(cfg.mode) as BestSellerMode;
    const perTab = Math.min(Math.max(Number(cfg.perTab) || 8, 2), 12);
    const zc = ['bangladesh', 'nationwide'].includes(String(zone ?? '').toLowerCase()) ? 'NATIONWIDE' : 'DHAKA';

    const chosen = Array.isArray(cfg.categories) ? (cfg.categories as string[]) : null;
    const found = await this.prisma.db.category.findMany({
      where: {
        parentId: null,
        isActive: true,
        ...(chosen ? { slug: { in: chosen } } : { isFeatured: true }),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true, slug: true, name: true, zone: true,
        children: { where: { isActive: true }, select: { id: true } },
      },
    });
    // the owner's order when he chose; a category shown to one zone only stays
    // out of the other zone's tabs, the same rule the category rail follows
    const tabCats = (chosen ? chosen.map((s) => found.find((c) => c.slug === s)) : found)
      .filter((c): c is (typeof found)[number] => Boolean(c) && (!c!.zone || c!.zone === zc));
    const idsOf = (c: (typeof found)[number]) => [c.id, ...c.children.map((k) => k.id)];

    const picked = mode === 'MANUAL' ? (cfg.products as string[]) : [];
    const pickedCards = picked.length
      ? await this.pickedCards(picked, zone)
      : [];

    const shelf = async (catIds: string[] | null): Promise<ShopProduct[]> => {
      // MANUAL with nothing picked yet falls back to AUTO — the state between
      // switching the mode on and finishing the list, same as the category rails
      if (mode === 'MANUAL' && pickedCards.length > 0) {
        const allowed = catIds ? new Set(catIds) : null;
        return pickedCards
          .filter((c) => !allowed || allowed.has(c.categoryId))
          .slice(0, perTab)
          .map(({ categoryId: _own, ...card }) => card);
      }
      const scope: Prisma.ProductWhereInput = {
        ...LIVE,
        ...(zc === 'NATIONWIDE' ? { zone: 'NATIONWIDE' as const } : {}),
        ...(catIds ? { categoryId: { in: catIds } } : {}),
      };
      const earned = await this.prisma.db.product.findMany({
        where: { ...scope, isBestSeller: true },
        orderBy: this.orderBy('best'),
        take: perTab,
        select: CARD_SELECT,
      });
      const rows = [...earned];
      if (mode === 'AUTO_FILL' && rows.length < perTab) {
        rows.push(
          ...(await this.prisma.db.product.findMany({
            where: { ...scope, isBestSeller: false },
            orderBy: this.orderBy('best'),
            take: perTab - rows.length,
            select: CARD_SELECT,
          })),
        );
      }
      return this.toCards(rows);
    };

    const allIds = tabCats.length ? tabCats.flatMap(idsOf) : null;
    const [all, ...perCat] = await Promise.all([shelf(allIds), ...tabCats.map((c) => shelf(idsOf(c)))]);

    return {
      mode,
      tabs: [
        { key: 'all', label: String(cfg.allLabel || 'All Products'), items: all },
        ...tabCats
          .map((c, i) => ({ key: c.slug, label: c.name, items: perCat[i] }))
          .filter((t) => t.items.length > 0),
      ],
      viewAll: cfg.showViewAll ? { text: String(cfg.viewAllText), href: String(cfg.viewAllHref) } : null,
      empty: { title: String(cfg.emptyTitle ?? ''), text: String(cfg.emptyText ?? '') },
    };
  }

  /** the owner's hand-picked cards, in his order, still subject to the shop's
   *  own rules — published, and inside the zone (a pick that fails them leaves) */
  private async pickedCards(slugs: string[], zone?: string) {
    const rows = await this.prisma.db.product.findMany({
      where: {
        ...LIVE,
        slug: { in: slugs },
        ...(['bangladesh', 'nationwide'].includes(String(zone ?? '').toLowerCase()) ? { zone: 'NATIONWIDE' as const } : {}),
      },
      select: CARD_SELECT,
    });
    const cards = await this.toCards(rows);
    const byId = new Map(rows.map((r) => [r.slug, r.category.id]));
    const bySlug = new Map(cards.map((c) => [c.slug, c]));
    return slugs
      .map((s) => bySlug.get(s))
      .filter((c): c is ShopProduct => Boolean(c))
      .map((c) => ({ ...c, categoryId: byId.get(c.slug) ?? '' }));
  }

  /* ═══════════════════ one category page ═══════════════════ */

  /**
   * Everything the category page renders, in one request.
   *
   * One call rather than fourteen. The page is server-rendered now, so each
   * extra round trip is added latency before anything reaches the browser —
   * and the sections are all reading the same set of products anyway.
   */
  async categoryPage(slug: string, zone?: string, sub?: string) {
    /*
      The category and its section settings are read together, because the
      settings decide WHAT the queries below ask for: a hand-picked rail is a
      different query from an automatic one. Fetching the settings inside the
      big Promise.all would mean choosing the rails before knowing the mode,
      and then throwing one of the two answers away.

      `sub` — DEC-PRD-043 (fixed 6 Sep 2026). A slug is unique per PARENT, so a
      sub-category is only reachable as parent + sub: the root is looked up by
      `slug`, then the child by `sub` under that root. Before this the
      sub-category page asked for the child by its slug alone, the root-only
      lookup answered 404, and every "Shop by type" tile led to a dead page.
      The sub page reads the parent's layout — it is the parent's page,
      narrowed — and the sub's own words, picture, SEO and questions.
    */
    const CATEGORY_SELECT = {
      id: true,
      slug: true,
      name: true,
      summary: true,
      description: true,
      bannerHeading: true,
      bannerUrl: true,
      imageUrl: true,
      metaTitle: true,
      metaDescription: true,
      ogTitle: true,
      ogDescription: true,
      ogImageUrl: true,
      noIndex: true,
      parent: { select: { slug: true, name: true } },
      children: {
        where: { isActive: true, deletedAt: null },
        orderBy: [{ sortOrder: 'asc' as const }, { name: 'asc' as const }],
        select: { id: true, slug: true, name: true, summary: true, imageUrl: true },
      },
      faqs: {
        where: { isActive: true, deletedAt: null },
        orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
        select: { question: true, answer: true },
      },
    };
    const [root, sections] = await Promise.all([
      this.prisma.db.category.findFirst({
        // DEC-PRD-043 — the root page; a sub is reached through its parent
        where: { slug, parentId: null, isActive: true },
        select: CATEGORY_SELECT,
      }),
      this.layout.forCategory(slug, zone),
    ]);
    if (!root) throw new NotFoundException('No such category');

    const cat = sub
      ? await this.prisma.db.category.findFirst({
          where: { slug: sub, parentId: root.id, isActive: true, deletedAt: null },
          select: CATEGORY_SELECT,
        })
      : root;
    if (!cat) throw new NotFoundException('No such category');

    /** the address this page lives at, for every link that stays on it */
    const base = sub ? `${root.slug}/${cat.slug}` : root.slug;
    /** how the product query names this page */
    const scopeQuery = sub ? { category: root.slug, sub: cat.slug } : { category: root.slug };


    const ids = [cat.id, ...cat.children.map((c) => c.id)];
    const zoneWhere = zone === 'bangladesh' ? { zone: 'NATIONWIDE' as const } : {};
    const scope = { ...LIVE, ...zoneWhere, categoryId: { in: ids } };
    const configOf = (key: string) => sections.find((s) => s.key === key)?.config ?? {};

    const [total, childCounts, bestsellers, readyToday, colours, budgets, siblings] =
      await Promise.all([
        this.prisma.db.product.count({ where: scope }),
        this.prisma.db.product.groupBy({ by: ['categoryId'], where: scope, _count: { _all: true } }),
        this.railProducts(configOf('bestsellers'), { ...scopeQuery, zone, sort: 'popular', limit: '8' }),
        /*
          Hand-picked items on this row must still be able to leave today —
          owner, 2 Aug. The admin only offers 2-hour / same-day products, and
          this repeats the test at read time because a product can lose express
          delivery months after it was picked, and the heading above it would
          go on promising something the shop cannot do.
        */
        this.railProducts(
          configOf('readyToday'),
          { ...scopeQuery, zone, speed: 'express', limit: '4' },
          { OR: [{ supportsExpress: true }, { supportsSameDay: true }] },
        ),
        this.colourTiles(scope, base),
        this.prisma.db.collection.findMany({
          where: { isActive: true, mode: 'PRICE_RANGE' },
          orderBy: [{ sortOrder: 'asc' }],
          select: { slug: true, name: true, kicker: true, subtitle: true, imageUrl: true, accent: true, minPaisa: true, maxPaisa: true },
        }),
        this.prisma.db.category.findMany({
          where: { isActive: true, parentId: null, slug: { not: root.slug }, deletedAt: null },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          select: { slug: true, name: true, summary: true, imageUrl: true },
        }),
      ]);

    const countBy = new Map(childCounts.map((g) => [g.categoryId, g._count._all]));
    const copy = await this.sectionCopy(slug, sections.map((s) => s.key), zone);

    /*
      Shop by type — automatic, or the owner's own list in his own order.

      An empty sub-category is still hidden either way (owner, 31 Jul): being
      picked by hand does not make a tile leading to nothing worth showing, and
      the alternative is a card that reads as a broken page.
    */
    const liveChildren = cat.children.filter((c) => (countBy.get(c.id) ?? 0) > 0);
    const subCfg = configOf('subCategoryRail');
    const subPicked = Array.isArray(subCfg.slugs) ? (subCfg.slugs as string[]) : [];
    const orderedChildren =
      (subCfg.mode as string) === 'MANUAL' && subPicked.length > 0
        ? subPicked
            .map((s) => liveChildren.find((c) => c.slug === s))
            .filter((c): c is (typeof liveChildren)[number] => Boolean(c))
        : liveChildren;

    /*
      The four chips under the banner — "2-hour delivery", "Same day"…

      They were four strings typed into `CategoryBanner.tsx`, in two zone
      variants, and the owner asked on 31 Jul where they are edited. Nowhere,
      was the answer. They are the shop's biggest promises and they change
      when a delivery promise or a payment method changes, so they cannot live
      in a component.

      They come from `TrustBadge` — the same rows as the homepage trust strip,
      zone-aware already. One place, one set of claims: if the shop stops doing
      midnight delivery it stops saying so everywhere, in one edit.
    */
    const promises = await this.prisma.db.trustBadge.findMany({
      where: { isActive: true, OR: [{ zone: null }, ...(zone ? [{ zone }] : [])] },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      take: 4,
      select: { title: true },
    });

    // one pass over this category's products, shared by both tile blocks
    const tagTally = await this.tagTally(scope);
    const [attributes, occasions] = await Promise.all([
      this.tagTiles(tagTally, base, configOf('attributeGrid'), 'style'),
      this.tagTiles(tagTally, base, configOf('occasionGrid'), 'occasions'),
    ]);

    return {
      slug: cat.slug,
      label: cat.name,
      /*
        The banner's own line, then the category's name. `metaTitle` is NOT
        consulted: that one is written for Google's results page, and using it
        here meant editing the search snippet silently rewrote the shop's
        headline — two jobs, one field, and no way to do either properly.
      */
      h1: cat.bannerHeading || cat.name,
      lead: cat.description || cat.summary || '',
      bannerUrl: cat.bannerUrl || cat.imageUrl,
      bannerBg: gradientFor(cat.slug),
      totalProducts: total,
      /** empty = nothing set up, and the banner keeps the four it ships with */
      promises: promises.map((p) => p.title),
      parent: cat.parent ? { label: cat.parent.name, slug: cat.parent.slug } : null,
      seo: {
        title: cat.metaTitle || `${cat.name} — Radian`,
        description: cat.metaDescription || cat.summary || '',
        ogTitle: cat.ogTitle,
        ogDescription: cat.ogDescription,
        ogImageUrl: cat.ogImageUrl,
        noIndex: cat.noIndex,
      },
      sections: await Promise.all(
        sections.map(async (s) => ({
          ...s,
          copy: copy[s.key] ?? null,
          // an added block carries its contents with it — see `resolveBlock`
          block: s.blockType ? await this.resolveBlock(s, slug, zone) : null,
        })),
      ),

      subCategories: orderedChildren.map((c) => ({
        label: c.name,
        sub: c.summary,
        href: `/categories/${base}/${c.slug}`,
        bg: gradientFor(c.slug),
        imageUrl: c.imageUrl,
        count: countBy.get(c.id) ?? 0,
      })),

      attributes,
      occasions,
      colours,

      budgets: budgets.map((b) => ({
        kicker: b.kicker,
        label: b.name,
        sub: b.subtitle,
        imageUrl: b.imageUrl,
        accent: b.accent,
        // …#all-products: a filter lands on the grid, not back at the banner
        href: `/categories/${base}?${[
          b.minPaisa != null ? `min=${Math.round(b.minPaisa / 100)}` : '',
          b.maxPaisa != null ? `max=${Math.round(b.maxPaisa / 100)}` : '',
        ]
          .filter(Boolean)
          .join('&')}#all-products`,
        bg: gradientFor(b.slug),
      })),

      // Combos and cross-sell are the same idea twice: cards to somewhere else
      // on the site. Both read the sibling categories; MANUAL narrows to the
      // owner's picks, in his order.
      /*
        Better together = related PRODUCTS, the owner's own pairing for this
        category (flowers + a cake, a plant + chocolate), from anywhere in the
        shop; nothing picked, nothing shown. Keep exploring = other
        CATEGORIES. Two rows, two purposes — they used to be the same four
        sibling cards twice (owner, 6 Sep 2026).
      */
      combos: await this.pickedProducts(configOf('comboRail'), zone, 4),
      crossSell: this.categoryTiles(siblings, configOf('crossSellRail'), 4),

      faqs: cat.faqs,
      rails: { bestsellers, readyToday },
    };
  }

  /**
   * The three lines above each section — eyebrow, title, subtitle.
   *
   * They live in `SectionText`, the same table the homepage headings use, so
   * there is one screen for wording on the whole site rather than a second one
   * hidden inside the category editor.
   *
   * Four keys are consulted, most specific first:
   *
   *   category.fresh-flowers.colourGrid   this category, this zone
   *   category.fresh-flowers.colourGrid   this category, any zone
   *   category.colourGrid                 every category, this zone
   *   category.colourGrid                 every category  ← what is normally set
   *
   * So the wording is written once for all categories and one category can
   * disagree — the same default-plus-override shape as the sections
   * themselves. A key with no row at all returns null and the storefront keeps
   * the wording it ships with; nothing is blank while the shop fills these in.
   */
  private async sectionCopy(slug: string, keys: string[], zone?: string) {
    const wanted = keys.flatMap((k) => [`category.${k}`, `category.${slug}.${k}`]);
    const rows = await this.prisma.db.sectionText.findMany({
      where: { key: { in: wanted }, zone: { in: zone ? ['', zone] : [''] } },
      select: { key: true, zone: true, eyebrow: true, title: true, subtitle: true },
    });

    const pick = (key: string) =>
      rows.find((r) => r.key === key && r.zone !== '') ?? rows.find((r) => r.key === key);

    const out: Record<string, { eyebrow: string | null; title: string | null; subtitle: string | null } | null> = {};
    for (const k of keys) {
      const row = pick(`category.${slug}.${k}`) ?? pick(`category.${k}`);
      out[k] = row ? { eyebrow: row.eyebrow, title: row.title, subtitle: row.subtitle } : null;
    }
    return out;
  }

  /**
   * A section the owner added — filled in here rather than on the page.
   *
   * The storefront gets a block it can render immediately: products already
   * chosen, collections already looked up, banner already resolved. The
   * alternative is a request per added block, which is a page that builds
   * itself in front of the visitor a strip at a time.
   *
   * Three shapes only, deliberately — the same boundary the homepage accepted.
   * A free canvas breaks an approved design in public.
   */
  private async resolveBlock(
    s: { key: string; blockType: string | null; title: string | null; subtitle: string | null; config: Record<string, unknown> },
    catSlug: string,
    zone?: string,
  ) {
    const cfg = s.config;

    if (s.blockType === 'PRODUCT_ROW') {
      /*
        Scoped to this category, always. The owner's rule for the Gift Finder
        was the same one: on a category page, a row of products means products
        from this category. A row of chocolates on the flowers page is a row
        nobody asked for.
      */
      const list = await this.products({
        category: catSlug,
        zone,
        ...productRowQuery(cfg),
      });
      return { kind: 'PRODUCT_ROW' as const, products: list.items };
    }

    if (s.blockType === 'COLLECTION_ROW') {
      const slugs = Array.isArray(cfg.slugs) ? (cfg.slugs as string[]) : [];
      if (slugs.length === 0) return { kind: 'COLLECTION_ROW' as const, cards: [] };
      const rows = await this.prisma.db.collection.findMany({
        where: { slug: { in: slugs }, isActive: true },
        select: { slug: true, name: true, kicker: true, subtitle: true, imageUrl: true, accent: true },
      });
      // the owner's order, not the database's
      const bySlug = new Map(rows.map((r) => [r.slug, r]));
      return {
        kind: 'COLLECTION_ROW' as const,
        cards: slugs.map((sl) => bySlug.get(sl)).filter((c): c is (typeof rows)[number] => Boolean(c)),
      };
    }

    if (s.blockType === 'BANNER_STRIP') {
      const id = cfg.bannerId ? String(cfg.bannerId) : null;
      if (!id) return { kind: 'BANNER_STRIP' as const, banner: null };
      const now = new Date();
      const b = await this.prisma.db.banner.findFirst({
        where: {
          id,
          isActive: true,
          // a seasonal banner that has finished does not come back because
          // somebody pinned it to a category page
          AND: [
            { OR: [{ liveFrom: null }, { liveFrom: { lte: now } }] },
            { OR: [{ liveTo: null }, { liveTo: { gte: now } }] },
          ],
        },
        select: {
          id: true, eyebrow: true, titleMain: true, titleAccent: true, lead: true,
          cta1Label: true, cta1Href: true, imageUrl: true,
        },
      });
      return { kind: 'BANNER_STRIP' as const, banner: b };
    }

    return null;
  }

  /* ═══════════════════ rails ═══════════════════ */

  /**
   * A row of products — automatic, or the owner's own list in his own order.
   *
   * D-CAT-02 said every TILE block is AUTO or MANUAL. The owner extended it to
   * the two product rows on 2 Aug: the shop's judgement about what to put in
   * front of a customer this week is not always what the sales counter says.
   *
   * MANUAL IS NOT A FALLBACK, AND IT IS NOT TOPPED UP. His decision, and the
   * right one: a picked product that has been unpublished, moved out of the
   * category or put out of the delivery zone simply leaves the row, and the
   * row gets shorter. Filling the gap from the automatic list would mean a
   * page where nobody — including him — could tell which cards he chose.
   *
   * An EMPTY manual list still falls back to automatic, which is a different
   * thing: it is the state between switching the mode on and finishing the
   * picking, and a heading with no cards under it is not what that should look
   * like. The admin says so on the row.
   *
   * `guard` is an extra condition the picked products must still satisfy —
   * see the express test on the "Ready to send now" row.
   */
  private async railProducts(
    config: Record<string, unknown>,
    auto: ProductQuery,
    guard?: Prisma.ProductWhereInput,
  ): Promise<ShopProduct[]> {
    const picked = Array.isArray(config.products) ? (config.products as string[]) : [];
    if ((config.mode as string) !== 'MANUAL' || picked.length === 0) {
      return (await this.products(auto)).items;
    }

    // the same cap the automatic row uses — a hand-picked list of thirty would
    // otherwise redraw the page it was designed for
    const cap = Math.max(Number(auto.limit) || 8, 1);
    const catIds = (await this.categoryIds(auto.category, auto.sub)) ?? [];

    const rows = await this.prisma.db.product.findMany({
      where: {
        ...LIVE,
        slug: { in: picked.slice(0, cap) },
        ...(catIds.length ? { categoryId: { in: catIds } } : {}),
        ...(auto.zone === 'bangladesh' ? { zone: 'NATIONWIDE' as const } : {}),
        ...(guard ?? {}),
      },
      select: CARD_SELECT,
    });

    const cards = await this.toCards(rows);
    const bySlug = new Map(cards.map((c) => [c.slug, c]));
    // his order, not the database's
    return picked
      .slice(0, cap)
      .map((s) => bySlug.get(s))
      .filter((c): c is ShopProduct => Boolean(c));
  }

  /** the owner's hand-picked products, in his order, from the whole shop */
  private async pickedProducts(config: Record<string, unknown>, zone: string | undefined, cap: number): Promise<ShopProduct[]> {
    const picked = Array.isArray(config.products) ? (config.products as string[]).slice(0, cap) : [];
    if (picked.length === 0) return [];
    const rows = await this.prisma.db.product.findMany({
      where: {
        ...LIVE,
        slug: { in: picked },
        ...(['bangladesh', 'nationwide'].includes(String(zone ?? '').toLowerCase()) ? { zone: 'NATIONWIDE' as const } : {}),
      },
      select: CARD_SELECT,
    });
    const bySlug = new Map((await this.toCards(rows)).map((c) => [c.slug, c]));
    return picked.map((s) => bySlug.get(s)).filter((c): c is ShopProduct => Boolean(c));
  }

  /* ═══════════════════ tiles ═══════════════════ */

  /**
   * D-CAT-02, owner 31 Jul: every tile block is either AUTO or MANUAL.
   *
   * AUTO — the tags actually on this category's products, most-used first.
   *        A category created this morning has a full page by lunchtime with
   *        nobody configuring anything, which is the whole point.
   * MANUAL — his list, in his order.
   *
   * Eight at most either way (his number). A shop with thirty occasion tags
   * would otherwise put thirty cards on every category page.
   */
  /**
   * How many products in this category carry each tag.
   *
   * One query and a tally in memory, NOT one `count` per tag. The obvious
   * version issues a query per tag and both tile blocks want the same numbers,
   * so a shop with twenty occasion tags would open every category page with
   * forty round trips. Prisma cannot group an implicit m2m; this reads the
   * rows once and counts them here.
   */
  private async tagTally(scope: Prisma.ProductWhereInput) {
    const rows = await this.prisma.db.product.findMany({
      where: scope,
      select: { tags: { select: { id: true } } },
    });
    const tally = new Map<string, number>();
    for (const r of rows) for (const t of r.tags) tally.set(t.id, (tally.get(t.id) ?? 0) + 1);
    return tally;
  }

  private async tagTiles(
    tally: Map<string, number>,
    catSlug: string,
    config: Record<string, unknown>,
    defaultGroup: string,
  ) {
    const groupSlug = (config.tagGroup as string) || defaultGroup;
    const manual = Array.isArray(config.tags) ? (config.tags as string[]) : [];
    const mode = (config.mode as string) === 'MANUAL' && manual.length > 0 ? 'MANUAL' : 'AUTO';

    const group = await this.prisma.db.tagGroup.findFirst({
      where: { slug: groupSlug, isActive: true },
      select: {
        slug: true,
        tags: {
          where: { isActive: true, deletedAt: null },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          select: { id: true, slug: true, name: true, summary: true, imageUrl: true },
        },
      },
    });
    if (!group) return [];

    const withCount = group.tags.map((t) => ({ ...t, count: tally.get(t.id) ?? 0 }));

    const chosen =
      mode === 'MANUAL'
        ? manual
            .map((s) => withCount.find((t) => t.slug === s))
            .filter((t): t is (typeof withCount)[number] => Boolean(t))
        : withCount.filter((t) => t.count > 0).sort((a, b) => b.count - a.count);

    /*
      ⚠️ THE PARAMETER IS NAMED AFTER WHAT THE PAGE READS, NOT AFTER THE GROUP
      (2 Aug 2026 — this was broken).

      These links used to be `?<group>=<tag>` — `?style=bouquet`. The category
      page reads `colour`, `occasions`, `tag`, `min`, `max`, `speed` and `sort`,
      and nothing else, so every "Shop by style" tile reloaded the same page
      unfiltered: eight cards that looked like buttons and did nothing.

      `occasions` keeps its own name because it is one the page already reads
      and links to it are in the wild; everything else says `tag`, which is
      what the filter is actually called.
    */
    const param = group.slug === 'occasions' ? 'occasions' : 'tag';

    return chosen.slice(0, 8).map((t) => ({
      label: t.name,
      sub: t.summary,
      // the tag stays inside the category — Fresh Flowers + birthday, never
      // every birthday product in the shop
      href: `/categories/${catSlug}?${param}=${t.slug}#all-products`,
      bg: gradientFor(t.slug),
      imageUrl: t.imageUrl,
      count: t.count,
    }));
  }

  /**
   * The colour grid — D-CAT-01.
   *
   * Derived, never listed. The question "which colours exist in Fresh
   * Flowers" is asked of the products themselves, so chocolate pages show no
   * Red tile when nothing there is red, and nobody has to keep a list per
   * category in step with the catalogue.
   *
   * This is the whole reason `Product.variantValueId` had to be a real link
   * instead of the typed-in word it used to be: a typed word cannot be
   * grouped, counted or renamed.
   */
  private async colourTiles(scope: Prisma.ProductWhereInput, catSlug: string) {
    const grouped = await this.prisma.db.product.groupBy({
      by: ['variantValueId'],
      where: { ...scope, variantValueId: { not: null } },
      _count: { _all: true },
    });
    if (grouped.length === 0) return [];

    const values = await this.prisma.db.variantValue.findMany({
      where: {
        id: { in: grouped.map((g) => g.variantValueId!).filter(Boolean) },
        isActive: true,
        attribute: { isActive: true, displayMode: 'SWATCH' },
      },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      select: { id: true, label: true, swatch: true, imageUrl: true },
    });
    const countBy = new Map(grouped.map((g) => [g.variantValueId, g._count._all]));

    return values.slice(0, 8).map((v) => ({
      label: v.label,
      sub: `${countBy.get(v.id) ?? 0} available`,
      swatch: v.swatch,
      imageUrl: v.imageUrl,
      href: `/categories/${catSlug}?colour=${slugifyLabel(v.label)}#all-products`,
      count: countBy.get(v.id) ?? 0,
    }));
  }

  private categoryTiles(
    siblings: { slug: string; name: string; summary: string | null; imageUrl: string | null }[],
    config: Record<string, unknown>,
    take: number,
  ) {
    const manual = Array.isArray(config.slugs) ? (config.slugs as string[]) : [];
    const list =
      (config.mode as string) === 'MANUAL' && manual.length > 0
        ? manual
            .map((s) => siblings.find((c) => c.slug === s))
            .filter((c): c is (typeof siblings)[number] => Boolean(c))
        : siblings;

    return list.slice(0, take).map((c) => ({
      label: c.name,
      sub: c.summary,
      href: `/categories/${c.slug}`,
      bg: gradientFor(c.slug),
      imageUrl: c.imageUrl,
    }));
  }

  /* ═══════════════════ plumbing ═══════════════════ */

  /** null = the slug names nothing live, so the answer is an empty list */
  private async categoryIds(slug?: string, sub?: string): Promise<string[] | null> {
    if (!slug) return [];
    /*  DEC-PRD-043 — a ROOT category, and only a root. Since a slug is now
        unique per parent, "roses" can also be a sub of something; without
        `parentId: null` this lookup could answer /roses with a sub-category
        that has its own address at /fresh-flower/roses.  */
    const cat = await this.prisma.db.category.findFirst({
      where: { slug, parentId: null, isActive: true },
      select: { id: true, children: { where: { isActive: true, deletedAt: null }, select: { id: true, slug: true } } },
    });
    if (!cat) return null;
    if (sub) {
      const child = cat.children.find((c) => c.slug === sub);
      return child ? [child.id] : null;
    }
    return [cat.id, ...cat.children.map((c) => c.id)];
  }

  private async buildWhere(q: ProductQuery, catIds: string[]): Promise<Prisma.ProductWhereInput> {
    const where: Prisma.ProductWhereInput = { ...LIVE };
    if (catIds.length) where.categoryId = { in: catIds };

    /*
      "All Bangladesh" shows only what a courier can carry. Same rule the
      header nav uses, and it fails toward hiding for the same reason: an
      unlisted product loses a sale, a wrongly listed one sends a fresh cream
      cake on a two-day courier run.
    */
    /*  ⚠️ Any of the spellings — the same reading as NATIONWIDE_ALIASES in
        `shop.ts`. Recognising only 'bangladesh' let the 'NATIONWIDE' that
        zoneCode() sends slip through unfiltered, and a nationwide customer
        saw Dhaka-only cake.  */
    if (['bangladesh', 'nationwide'].includes(String(q.zone ?? '').toLowerCase()))
      where.zone = 'NATIONWIDE';

    // DEC-PRD-050 — "best seller" is the earned badge, nothing looser
    if (q.best === true || q.best === 1 || q.best === '1' || q.best === 'true') where.isBestSeller = true;

    if (q.search?.trim()) {
      const s = q.search.trim();
      where.OR = [
        { name: { contains: s, mode: 'insensitive' } },
        { slug: { contains: s, mode: 'insensitive' } },
      ];
    }

    const tagSlugs = [q.tag, q.occasion, q.recipient].filter(Boolean) as string[];
    if (tagSlugs.length) {
      where.AND = tagSlugs.map((s) => ({ tags: { some: { slug: s, isActive: true, deletedAt: null } } }));
    }

    if (q.speed === 'express') where.supportsExpress = true;
    if (q.speed === 'same_day') where.supportsSameDay = true;
    if (q.speed === 'midnight') where.supportsMidnight = true;

    /*
      Colour arrives as a slug ("baby-pink") because that is what belongs in a
      URL, but `VariantValue` has a label and no slug. Resolving it here rather
      than matching text in SQL means "Baby Pink", "baby pink" and "BABY PINK"
      cannot become three different colours in the filter.
    */
    if (q.colour) {
      const values = await this.prisma.db.variantValue.findMany({
        where: { isActive: true, attribute: { displayMode: 'SWATCH' } },
        select: { id: true, label: true },
      });
      const match = values.filter((v) => slugifyLabel(v.label) === q.colour);
      // a colour nothing is filed under must return nothing, not everything
      where.variantValueId = { in: match.map((v) => v.id) };
    }

    return where;
  }

  private orderBy(sort?: string): Prisma.ProductOrderByWithRelationInput[] {
    switch (sort) {
      case 'price_asc':
        return [{ sellingPricePaisa: 'asc' }, { name: 'asc' }];
      case 'price_desc':
        return [{ sellingPricePaisa: 'desc' }, { name: 'asc' }];
      case 'new':
        return [{ createdAt: 'desc' }];
      case 'best':
        /*  Inside a best-seller row: the window sales the badge was decided on,
            then newest. The badge says which products; this says which first.  */
        return [{ bestSellerSales: 'desc' }, { createdAt: 'desc' }];
      case 'popular':
      default:
        /*  Badge holders first, then real delivered sales in the badge window,
            then newest. ⚠️ Never `salesCount` — it carries the owner's typed
            `salesSeed` figures (DEC-PRD-025), and a number typed to reassure a
            shopper must not reorder the shelf (4 Sep 2026).  */
        return [{ isBestSeller: 'desc' }, { bestSellerSales: 'desc' }, { createdAt: 'desc' }];
    }
  }

  /**
   * Ratings come from one grouped query for the whole page, not one per card.
   * Only PUBLISHED reviews count — a pending review is one the owner has not
   * seen yet, and it must not move a star rating in the meantime.
   */
  /**
   * Cards for a known set of ids, in the order asked for.
   *
   * Added 31 Jul for the product page's cross-sell rail, which chooses its own
   * six products and then needs them drawn exactly like every other card on the
   * site. Re-sorted here because `findMany` answers in the database's order,
   * not the caller's, and the caller's order is the ranking it just worked out.
   *
   * Published-only, like everything else on this surface: an id can be stale by
   * the time it is used.
   */
  /**
   * One collection plus its member cards — the owner's ruling: *"nothing is
   * static."*
   *
   * Two shapes, by the admin's own split (CollectionMode):
   * · PRICE_RANGE — the band matches today's **after-discount** price, with the
   *   same logic as `products()`: in "Under ৳1,000" the ৳1,200→৳900 bouquet is
   *   the one that sells first, and it cannot be hidden.
   * · MANUAL — in the order the owner arranged, and no other.
   *
   * 404, not a fallback — the days of showing the mock list are over; the
   * honest answer for a collection that does not exist is "none".
   */
  async collectionPage(slug: string, zone?: string) {
    const col = await this.prisma.db.collection.findFirst({
      where: { slug, isActive: true },
      include: {
        products: { orderBy: { sortOrder: 'asc' }, select: { productId: true } },
      },
    });
    if (!col) throw new NotFoundException('collection not found');

    let items: ShopProduct[];
    if (col.mode === 'PRICE_RANGE') {
      const res = await this.products({
        min: col.minPaisa == null ? undefined : col.minPaisa / 100,
        max: col.maxPaisa == null ? undefined : col.maxPaisa / 100,
        zone,
        sort: 'popular',
        limit: 60,
      });
      items = res.items;
    } else {
      items = await this.cardsByIds(col.products.map((p) => p.productId));
      if (zone === 'bangladesh') items = items.filter((i) => i.zone === 'both');
    }

    return {
      slug: col.slug,
      name: col.name,
      kicker: col.kicker,
      subtitle: col.subtitle,
      imageUrl: col.imageUrl,
      accent: col.accent,
      minPaisa: col.minPaisa,
      maxPaisa: col.maxPaisa,
      items,
    };
  }

  async cardsByIds(ids: string[]): Promise<ShopProduct[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.db.product.findMany({
      where: { id: { in: ids }, isPublished: true },
      select: CARD_SELECT,
    });
    const cards = await this.toCards(rows);
    const bySlug = new Map(rows.map((r, i) => [r.id, cards[i]]));
    return ids.map((id) => bySlug.get(id)).filter((c): c is ShopProduct => Boolean(c));
  }

  private async toCards(rows: CardRow[]): Promise<ShopProduct[]> {
    if (rows.length === 0) return [];
    const [grouped, newDays, displayOffers] = await Promise.all([
      this.prisma.db.review.groupBy({
        by: ['productId'],
        where: { productId: { in: rows.map((r) => r.id) }, status: 'PUBLISHED', deletedAt: null },
        _avg: { rating: true },
        _count: { _all: true },
      }),
      this.newArrivalDays(),
      // DEC-PRD-059 — one fetch for the whole grid, applied per card below
      loadDisplayOffers(this.prisma),
    ]);
    const byProduct = new Map(grouped.map((g) => [g.productId, g]));
    return rows.map((r) => this.toCard(r, byProduct.get(r.id), newDays, displayOffers));
  }

  /*  DEC-PRD-050 — one row, read at most once a minute. A page of sixty cards
      must not ask sixty times, and a badge rule up to a minute stale has
      never hurt anybody.  */
  private newDays = MERCH_DEFAULTS.newArrivalDays;
  private newDaysAt = 0;

  private async newArrivalDays(): Promise<number> {
    if (Date.now() - this.newDaysAt < 60_000) return this.newDays;
    this.newDaysAt = Date.now();
    try {
      const row = await this.prisma.db.merchSetting.findUnique({ where: { id: 'singleton' } });
      if (row) this.newDays = row.newArrivalDays;
    } catch {
      /*  No settings row yet — the default stands rather than the shop
          failing to draw a grid.  */
    }
    return this.newDays;
  }

  /**
   * The one price a card prints — and, since 5 Sep 2026, the one the price
   * band filters on and the price sort orders by. Three things in it:
   *
   *   DEC-PRD-035 — every live variant priced → the cheapest of them ("from").
   *     If even one is blank it falls back to the product's own price.
   *     ⚠️ Each variant's own discount is taken off too, as the product page
   *     does it — a card promising ৳500 next to a page charging ৳450 is the
   *     one-page-two-answers bug in a different place.
   *   DEC-PRD-028 — the product's own discount, inside its window.
   *   DEC-PRD-059 — an unconditional automatic offer shows up IN the price,
   *     on the same base and formula the checkout engine uses for a solo line.
   */
  private cardPrice(r: CardRow, displayOffers: DisplayOffer[]): number {
    return this.cardPricing(r, displayOffers).price;
  }

  private cardPricing(r: CardRow, displayOffers: DisplayOffer[]): { price: number; allPriced: boolean; basePrice: number; offerCut: number } {
    const ownPrice = offerPaisa(r.sellingPricePaisa, r.discountType, r.discountValue, r.discountStartsAt, r.discountEndsAt);
    const variantPrices = r.variants
      .filter((v) => v.pricePaisa !== null)
      .map((v) =>
        offerPaisa(v.pricePaisa!, v.discountType, v.discountValue, null, null),
      );
    const allPriced = r.variants.length > 0 && variantPrices.length === r.variants.length;
    const basePrice = allPriced ? Math.min(...variantPrices) : ownPrice;
    const offerCut = displayCut(
      displayOffers,
      { id: r.id, categoryId: r.category.id, parentCategoryId: r.category.parent?.id ?? null },
      basePrice,
    );
    return { price: basePrice - offerCut, allPriced, basePrice, offerCut };
  }

  private toCard(
    r: CardRow,
    review?: { _avg: { rating: number | null }; _count: { _all: number } },
    newDays: number = MERCH_DEFAULTS.newArrivalDays,
    displayOffers: DisplayOffer[] = [],
  ): ShopProduct {
    const neu = isNewNow(r, newDays); // DEC-PRD-050
    const { price, allPriced, basePrice, offerCut } = this.cardPricing(r, displayOffers);

    const rating = review?._avg.rating ?? null;
    const reviewCount = review?._count._all ?? 0;

    /*
      One badge, and delivery speed wins over the courier note: "today, 2 hrs"
      is the shop's biggest claim and the reason someone chooses it over a
      florist down the road. The card re-decides this for the nationwide zone
      anyway (a courier-safe product always shows the courier badge there).
    */
    const badge = r.supportsExpress
      ? 'express'
      : r.supportsMidnight
        ? 'midnight'
        : r.zone === 'NATIONWIDE'
          ? 'courier'
          : 'express';

    /*
      The little line beside the stars. Real numbers only — the mock array said
      "214 orders this month" for products that had never been ordered, and
      that sentence is a claim to a customer, not decoration. Nothing true to
      say → say nothing.
    */
    /*  DEC-PRD-050 — "New arrival" used to be a fallback line here. The card
        now carries a New pill on the photograph, and saying it twice on one
        card is the crowding the brief forbids, so this line goes on to the
        next true thing it has.  */
    const meta =
      r.salesCount > 0
        ? `${r.salesCount} sold`
        : r.leadTimeDays
          ? `Made to order · ${r.leadTimeDays} day${r.leadTimeDays === 1 ? '' : 's'}`
          : (r.shortDesc ?? '');

    return {
      slug: r.slug,
      name: r.name,
      pricePaisa: price,
      /*  ⚠️ No struck price on a "from" card. The product's ৳2,400 has nothing
          to do with the cheapest colour's ৳450, and putting them side by side
          would invent a saving nobody offered (DEC-PRD-035).  */
      /*  With an offer cut the struck figure is what the shopper would have
          paid without it — on a "from" card that is the pre-cut cheapest, on
          a plain card the full selling price wins where it is higher.  */
      mrpPaisa:
        offerCut > 0
          ? allPriced
            ? basePrice
            : Math.max(basePrice, r.sellingPricePaisa)
          : allPriced
            ? null
            : price < r.sellingPricePaisa
              ? r.sellingPricePaisa
              : null,
      priceFrom: allPriced || undefined,
      cat: r.category.parent?.slug ?? r.category.slug,
      sub: r.category.parent ? r.category.slug : null,
      zone: r.zone === 'NATIONWIDE' ? 'both' : 'dhaka',
      badge,
      // rounded down: four-and-a-half stars shown as five is the shop marking
      // its own homework
      stars: '★'.repeat(rating ? Math.floor(rating) : 0),
      rating,
      reviewCount,
      meta,
      bg: gradientFor(r.slug),
      imageUrl: r.images[0]?.url ?? null,
      best: r.isBestSeller,
      exp: r.supportsExpress,
      sd: r.supportsSameDay,
      mn: r.supportsMidnight,
      neu,
      occ: r.tags.filter((t) => t.group?.slug === 'occasions').map((t) => t.slug),
      rec: r.tags.filter((t) => t.group?.slug === 'recipients').map((t) => t.slug),
      prepaidOnly: r.advanceRequired,
      colour: r.variantValue
        ? {
            label: r.variantValue.label,
            swatch: r.variantValue.swatch,
            imageUrl: r.variantValue.imageUrl,
          }
        : null,
    };
  }
}

@Controller('shop')
export class ShopCatalogController {
  constructor(private readonly svc: ShopCatalogService) {}

  @Public()
  @Get('products')
  products(@Query() q: ProductQuery) {
    return this.svc.products(q);
  }

  /** the homepage Best Sellers grid — tabs, cards and wording in one answer */
  @Public()
  @Get('home-bestsellers')
  homeBestSellers(@Query('zone') zone?: string) {
    return this.svc.homeBestSellers(zone);
  }

  @Public()
  @Get('category/:slug')
  category(@Param('slug') slug: string, @Query('zone') zone?: string, @Query('sub') sub?: string) {
    return this.svc.categoryPage(slug, zone, sub || undefined);
  }

  /**
   * /collections/[slug] — the admin's Collection row plus its member cards.
   *
   * ⚠️ ROUTE ORDER: `collections/:slug` here does NOT shadow the plain
   * `collections` list in `shop.ts` — different segment counts. It is noted
   * because that trap already bit `products/:slug` once.
   */
  @Public()
  @Get('collections/:slug')
  collection(@Param('slug') slug: string, @Query('zone') zone?: string) {
    return this.svc.collectionPage(slug, zone);
  }
}

@Module({
  imports: [LayoutModule],
  providers: [ShopCatalogService],
  controllers: [ShopCatalogController],
  /*  Exported for `product-detail.ts`, whose "Pairs beautifully with" rail
      needs product CARDS. Copying `CARD_SELECT` and `toCard` into that file
      would be a second card shape — and the day one of them starts showing a
      rating or a badge differently, the same product would look like two
      different products on two pages of the same shop.  */
  exports: [ShopCatalogService],
})
export class ShopCatalogModule {}
