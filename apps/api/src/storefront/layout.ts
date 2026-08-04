import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  OnModuleInit,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { BlockType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/*
  ═══════════════════════════════════════════════════════════════════════════
  Which sections a page shows, and in what order.

  Declared in code, upserted on boot — the same pattern as SECTION_MANIFEST.
  This table stores only the owner's decisions: on or off, and where.

  ⚠️ `locked` LIVES IN THE CODE, NOT THE DATABASE. Two sections cannot be
  hidden or moved:

    · the hero carries the page's only <h1>. A page without one is a page
      Google cannot categorise, and the cost of that is invisible for months.
    · the shop card and the reviews sit in a fixed order with the footer
      (the "GBE" order the design locks), so the bottom of every page reads
      the same way.

  Held as data, "locked" is one UPDATE away from being untrue, and nobody
  would review that UPDATE.
  ═══════════════════════════════════════════════════════════════════════════
*/

/**
 * One stored page_section row, as the read paths below use it.
 *
 * Kept as an explicit shape (not inferred from Prisma) because listCategory
 * merges two queries where one branch may be an empty array — inference there
 * collapses to `{}` and the merge stops type-checking. Naming the shape once
 * keeps that from happening again.
 */
export interface SectionRow {
  key: string;
  isActive: boolean;
  config: unknown;
  blockType?: BlockType | null;
  title?: string | null;
  subtitle?: string | null;
}

export interface SectionDef {
  key: string;
  label: string;
  /** what it is, in the owner's words — the admin list shows this, not the key */
  hint: string;
  /** false = cannot be hidden or moved, and the screen says why */
  movable: boolean;
  lockedReason?: string;
}

export const PAGE_SECTION_MANIFEST: Record<string, SectionDef[]> = {
  home: [
    { key: 'hero', label: 'Big banner', hint: 'The slider at the very top', movable: false, lockedReason: 'It carries the page title Google reads' },
    { key: 'trust', label: 'Trust strip', hint: '2-hour delivery, freshness…', movable: true },
    { key: 'categories', label: 'Shop by Category', hint: 'The row of category cards', movable: true },
    { key: 'occasions', label: 'Every Occasion, Every Person', hint: 'Birthday, anniversary…', movable: true },
    { key: 'bestsellers', label: 'Best Sellers', hint: 'The product grid with tabs', movable: true },
    { key: 'promo', label: 'Promo strip', hint: 'The seasonal band', movable: true },
    { key: 'delivery', label: 'Delivery band', hint: 'The dark purple 2-hour / same-day section', movable: true },
    { key: 'budget', label: 'Gifts for Every Budget', hint: 'The four price cards', movable: true },
    { key: 'giftfinder', label: 'Gift Finder', hint: 'The three-step wizard', movable: true },
    { key: 'reviews', label: 'Reviews', hint: 'Google card and customer stories', movable: false, lockedReason: 'Fixed with the shop card and footer at the bottom of every page' },
    { key: 'blog', label: 'Latest Articles', hint: 'Journal cards', movable: true },
    { key: 'store', label: 'Visit the shop', hint: 'Address, hours, map', movable: false, lockedReason: 'Fixed with the reviews and footer at the bottom of every page' },
  ],

  /*
    The category page — one manifest for every category (31 Jul 2026).

    ⚠️ ORDER IS NOT MOVABLE ON THIS PAGE, and not because it was easier.
    D-CAT-04, carried from `_data/categories.ts` (D2) and the PDP contract:
    fourteen sections in any order is an unbounded number of layouts, none of
    them ever tested, and a bad order costs sales silently. The owner switches
    a section OFF or edits its words; he does not rearrange them.

    Hence `movable: false` on all fourteen. The admin screen shows no arrows
    here and says why once at the top, rather than fourteen times.

    TWO CANNOT BE SWITCHED OFF EITHER:
      · banner      — carries the page's only <h1>, exactly as `hero` does
      · productGrid — a category page without its products is a page that
                      makes no sense to have arrived at
  */
  category: [
    { key: 'banner', label: 'Top banner', hint: 'Title, description, photo', movable: false, lockedReason: 'It carries the page title Google reads' },
    { key: 'subCategoryRail', label: 'Shop by type', hint: 'Roses, lilies, orchids…', movable: false },
    { key: 'bestsellers', label: 'Most ordered', hint: 'The best-selling row', movable: false },
    { key: 'attributeGrid', label: 'Shop by style', hint: 'Bouquet, box, basket…', movable: false },
    { key: 'occasionGrid', label: 'Shop by occasion', hint: 'Birthday, anniversary…', movable: false },
    { key: 'readyToday', label: 'Ready to send now', hint: 'Express / same-day items', movable: false },
    { key: 'colourGrid', label: 'Shop by colour', hint: 'Red, pink, white…', movable: false },
    { key: 'budgetRail', label: 'Shop by budget', hint: 'The price cards', movable: false },
    { key: 'productGrid', label: 'All products', hint: 'The full grid with filters', movable: false, lockedReason: 'It is what the page is for' },
    { key: 'comboRail', label: 'Better together', hint: 'Combo cards', movable: false },
    { key: 'deliveryBand', label: 'Delivery band', hint: 'The dark purple delivery promise', movable: false },
    { key: 'crossSellRail', label: 'Keep exploring', hint: 'Cards to other categories', movable: false },
    { key: 'giftFinder', label: 'Gift Finder', hint: 'The still-deciding block', movable: false },
    { key: 'faq', label: 'Questions', hint: "This category's own FAQ", movable: false },
  ],
};

export const BLOCK_LABEL: Record<BlockType, string> = {
  PRODUCT_ROW: 'A row of products',
  COLLECTION_ROW: 'Cards linking to collections',
  BANNER_STRIP: 'A banner strip',
};

/** what a freshly added block starts as — never empty, so it renders something
 *  the moment it is switched on rather than looking broken */
const DEFAULT_CONFIG: Record<BlockType, Record<string, unknown>> = {
  PRODUCT_ROW: { rule: 'bestseller', count: 8 },
  COLLECTION_ROW: { slugs: [] },
  BANNER_STRIP: { bannerId: null },
};

/*
  ── Per-category pages ─────────────────────────────────────────────────────
  `page` is "home", "category", or "category:fresh-flowers".

  THE THIRD FORM IS AN OVERRIDE, NOT A COPY. "category" holds the settings
  every category uses; "category:<slug>" holds only what one category does
  differently, and a row is written there the first time the owner changes
  something for that category. So switching the colour grid off for all
  categories is one edit, not one per category, and a category created
  tomorrow inherits today's decisions without anyone remembering to set it up.

  It is the same default-plus-override shape `SectionText` uses for zones
  (zone "" = the default). One idea, learned once.
*/
export const CATEGORY_PAGE = 'category';
export const categoryPageKey = (slug?: string) =>
  slug ? `${CATEGORY_PAGE}:${slug}` : CATEGORY_PAGE;

/** "category:fresh-flowers" and "category" both read the "category" manifest */
const defsFor = (page: string): SectionDef[] =>
  PAGE_SECTION_MANIFEST[page.split(':')[0]] ?? [];

@Injectable()
export class LayoutService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  /** create any manifest section that has no row yet — never touch existing ones */
  async onModuleInit() {
    for (const [page, defs] of Object.entries(PAGE_SECTION_MANIFEST)) {
      const existing = await this.prisma.db.pageSection.findMany({ where: { page }, select: { key: true } });
      const have = new Set(existing.map((r) => r.key));
      const missing = defs
        .map((d, i) => ({ d, i }))
        .filter(({ d }) => !have.has(d.key));
      if (missing.length === 0) continue;
      await this.prisma.db.pageSection.createMany({
        data: missing.map(({ d, i }) => ({ page, key: d.key, sortOrder: i })),
        skipDuplicates: true,
      });
    }
  }

  /** the admin list: the owner's rows, with the manifest's words attached */
  async list(page = 'home') {
    const rows = await this.prisma.db.pageSection.findMany({ where: { page }, orderBy: { sortOrder: 'asc' } });
    const defs = defsFor(page);
    const byKey = new Map(defs.map((d) => [d.key, d]));
    return rows
      // A built-in key the code no longer declares is not shown; the row stays,
      // because a section removed today may come back with its settings intact.
      // Added sections have no manifest entry and are always shown.
      .filter((r) => r.blockType !== null || byKey.has(r.key))
      .map((r) => {
        const d = byKey.get(r.key);
        return {
          key: r.key,
          label: r.blockType ? r.title || BLOCK_LABEL[r.blockType] : d!.label,
          hint: r.blockType ? BLOCK_LABEL[r.blockType] : d!.hint,
          // an added section is always the owner's to move and to remove
          movable: r.blockType ? true : d!.movable,
          lockedReason: r.blockType ? null : (d!.lockedReason ?? null),
          blockType: r.blockType,
          title: r.title,
          subtitle: r.subtitle,
          config: (r.config ?? {}) as Record<string, unknown>,
          sortOrder: r.sortOrder,
          isActive: r.isActive,
          zone: r.zone,
        };
      });
  }

  /**
   * What the storefront renders — keys for built-in sections, and the whole
   * definition for added ones.
   *
   * Sent together rather than as a second request per added section: the page
   * already assembles in the browser, and one more round trip per block would
   * make it visibly build itself.
   */
  async forStorefront(page = 'home', zone?: string) {
    const rows = await this.prisma.db.pageSection.findMany({
      where: { page, isActive: true, OR: [{ zone: null }, ...(zone ? [{ zone }] : [])] },
      orderBy: { sortOrder: 'asc' },
      select: { key: true, blockType: true, title: true, subtitle: true, config: true },
    });
    return rows.map((r) => ({
      key: r.key,
      blockType: r.blockType,
      title: r.title,
      subtitle: r.subtitle,
      config: (r.config ?? {}) as Record<string, unknown>,
    }));
  }

  /** a section the owner adds. Born switched off, like a new banner. */
  async addBlock(page: string, blockType: BlockType) {
    const last = await this.prisma.db.pageSection.findFirst({
      where: { page }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true },
    });
    return this.prisma.db.pageSection.create({
      data: {
        page,
        key: `custom_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`,
        blockType,
        title: BLOCK_LABEL[blockType],
        config: DEFAULT_CONFIG[blockType],
        sortOrder: (last?.sortOrder ?? 0) + 1,
        isActive: false,
      },
    });
  }

  async editBlock(page: string, key: string, dto: { title?: string; subtitle?: string | null; config?: Record<string, unknown> }) {
    const row = await this.prisma.db.pageSection.findUnique({ where: { page_key: { page, key } } });
    if (!row) throw new BadRequestException('No such section');
    // Built-in sections take their heading from SectionText, which is where
    // every other heading lives; letting this screen write one too would give
    // the same line two homes.
    if (!row.blockType) throw new BadRequestException('This is a built-in section — edit its wording under Section headings');
    return this.prisma.db.pageSection.update({
      where: { page_key: { page, key } },
      data: {
        title: dto.title?.trim(),
        subtitle: dto.subtitle === undefined ? undefined : dto.subtitle?.trim() || null,
        config: dto.config === undefined ? undefined : (dto.config as object),
      },
    });
  }

  async removeBlock(page: string, key: string) {
    const row = await this.prisma.db.pageSection.findUnique({ where: { page_key: { page, key } } });
    if (!row) throw new BadRequestException('No such section');
    if (!row.blockType) throw new BadRequestException('A built-in section can be switched off, but not removed');
    await this.prisma.db.pageSection.delete({ where: { page_key: { page, key } } });
    return { ok: true };
  }

  async update(page: string, key: string, dto: { isActive?: boolean; zone?: string | null }) {
    const def = defsFor(page).find((d) => d.key === key);
    // an added section has no manifest entry, and everything about it is the
    // owner's — including switching it off
    if (!def) {
      const row = await this.prisma.db.pageSection.findUnique({ where: { page_key: { page, key } } });
      if (!row) throw new BadRequestException('No such section');
      return this.prisma.db.pageSection.update({
        where: { page_key: { page, key } },
        data: { isActive: dto.isActive, zone: dto.zone === undefined ? undefined : dto.zone || null },
      });
    }
    if (!def.movable && dto.isActive === false) {
      throw new BadRequestException(`"${def.label}" cannot be switched off — ${def.lockedReason}`);
    }
    return this.prisma.db.pageSection.update({
      where: { page_key: { page, key } },
      data: { isActive: dto.isActive, zone: dto.zone === undefined ? undefined : dto.zone || null },
    });
  }

  /**
   * Reorder by writing the whole list, and refuse if a locked section moved.
   *
   * Checked here rather than trusted from the screen: the screen already
   * disables those arrows, but a rule that only exists in the browser is not a
   * rule.
   */
  async reorder(page: string, keys: string[]) {
    const defs = defsFor(page);
    const current = await this.prisma.db.pageSection.findMany({ where: { page }, orderBy: { sortOrder: 'asc' } });
    const before = current.map((r) => r.key);

    for (const d of defs) {
      if (d.movable) continue;
      if (before.indexOf(d.key) !== keys.indexOf(d.key)) {
        throw new BadRequestException(`"${d.label}" cannot be moved — ${d.lockedReason}`);
      }
    }

    await Promise.all(
      keys.map((key, i) =>
        this.prisma.db.pageSection.update({ where: { page_key: { page, key } }, data: { sortOrder: i } }),
      ),
    );
    return this.list(page);
  }

  /* ═══════════════ category pages — default + override ═══════════════ */

  /**
   * The category page as the admin screen needs it: every section in manifest
   * order, carrying the value in force for this category and whether that
   * value is this category's own or inherited.
   *
   * `slug` omitted = the defaults screen, the one that applies to all.
   */
  async listCategory(slug?: string) {
    const defs = defsFor(CATEGORY_PAGE);
    const base: SectionRow[] = await this.prisma.db.pageSection.findMany({
      where: { page: CATEGORY_PAGE },
    });
    const own: SectionRow[] = slug
      ? await this.prisma.db.pageSection.findMany({ where: { page: categoryPageKey(slug) } })
      : [];
    const baseBy = new Map<string, SectionRow>(base.map((r) => [r.key, r] as const));
    const ownBy = new Map<string, SectionRow>(own.map((r) => [r.key, r] as const));

    const builtIn = defs.map((d) => {
      const b = baseBy.get(d.key);
      const o = ownBy.get(d.key);
      const row = o ?? b;
      return {
        key: d.key,
        label: d.label,
        hint: d.hint,
        // D-CAT-04 — nothing on this page moves. The screen draws no arrows.
        movable: false,
        lockedReason: d.lockedReason ?? null,
        canSwitchOff: !d.lockedReason,
        blockType: null as BlockType | null,
        title: null as string | null,
        subtitle: null as string | null,
        isActive: row?.isActive ?? true,
        config: ((o ?? b)?.config ?? {}) as Record<string, unknown>,
        /** true = this category decides for itself; false = following the default */
        overridden: Boolean(o),
        /** where it sits — built-ins are pinned by the manifest */
        after: null as string | null,
      };
    });

    /*
      Sections the owner added. Same three shapes the homepage offers, and the
      same reasoning: a fixed set of blocks, not a free canvas, because an
      arbitrary layout breaks an approved design in front of customers.

      They cannot be dropped anywhere — each one names the built-in section it
      follows (`config.after`). That is what lets him place a block without
      being handed the ability to reorder the fourteen, which is the thing
      D-CAT-04 exists to prevent.

      Added on "All categories" → shows on every category page. Added on one →
      that page only. No third rule to learn.
    */
    const customRows = [...base, ...own].filter((r) => r.blockType);
    const custom = customRows.map((r) => {
      const cfg = (r.config ?? {}) as Record<string, unknown>;
      return {
        key: r.key,
        label: r.title || BLOCK_LABEL[r.blockType as BlockType],
        hint: BLOCK_LABEL[r.blockType as BlockType],
        movable: false,
        lockedReason: null as string | null,
        canSwitchOff: true,
        blockType: r.blockType as BlockType,
        title: r.title ?? null,
        subtitle: r.subtitle ?? null,
        isActive: r.isActive,
        config: cfg,
        overridden: ownBy.has(r.key),
        after: (cfg.after as string) ?? null,
      };
    });

    // interleaved, so the screen reads as the page reads
    const out: typeof builtIn = [];
    for (const row of builtIn) {
      out.push(row);
      for (const c of custom.filter((c) => c.after === row.key)) out.push(c);
    }
    // anything pointing at a section that no longer exists still has to appear,
    // or it becomes invisible and un-deletable
    for (const c of custom) if (!out.includes(c)) out.push(c);
    return out;
  }

  /* ── sections the owner adds to a category page ── */

  /** born switched off, like a new banner — nothing appears mid-edit */
  async addCategoryBlock(slug: string | undefined, blockType: BlockType, after: string) {
    const page = categoryPageKey(slug);
    const last = await this.prisma.db.pageSection.findFirst({
      where: { page },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return this.prisma.db.pageSection.create({
      data: {
        page,
        key: `custom_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`,
        blockType,
        title: BLOCK_LABEL[blockType],
        config: { ...DEFAULT_CONFIG[blockType], after },
        sortOrder: (last?.sortOrder ?? 100) + 1,
        isActive: false,
      },
    });
  }

  async editCategoryBlock(
    slug: string | undefined,
    key: string,
    dto: { title?: string; subtitle?: string | null; config?: Record<string, unknown> },
  ) {
    const page = categoryPageKey(slug);
    const row = await this.prisma.db.pageSection.findUnique({ where: { page_key: { page, key } } });
    if (!row) throw new BadRequestException('No such section');
    if (!row.blockType) throw new BadRequestException('This is a built-in section');
    return this.prisma.db.pageSection.update({
      where: { page_key: { page, key } },
      data: {
        title: dto.title?.trim(),
        subtitle: dto.subtitle === undefined ? undefined : dto.subtitle?.trim() || null,
        config: dto.config === undefined ? undefined : (dto.config as object),
      },
    });
  }

  async removeCategoryBlock(slug: string | undefined, key: string) {
    const page = categoryPageKey(slug);
    const row = await this.prisma.db.pageSection.findUnique({ where: { page_key: { page, key } } });
    if (!row) throw new BadRequestException('No such section');
    if (!row.blockType) throw new BadRequestException('A built-in section can be switched off, but not removed');
    await this.prisma.db.pageSection.delete({ where: { page_key: { page, key } } });
    return { ok: true };
  }

  /**
   * Change one section for one category — or, with no slug, for all of them.
   *
   * Writes an override row the first time a category disagrees with the
   * default. Nothing is copied wholesale: a category that overrides only the
   * colour grid keeps following the default for the other thirteen, so a later
   * change to the defaults still reaches it.
   */
  async updateCategory(
    slug: string | undefined,
    key: string,
    dto: { isActive?: boolean; config?: Record<string, unknown> },
  ) {
    const def = defsFor(CATEGORY_PAGE).find((d) => d.key === key);
    if (!def) throw new BadRequestException('No such section');
    if (def.lockedReason && dto.isActive === false) {
      throw new BadRequestException(`"${def.label}" cannot be switched off — ${def.lockedReason}`);
    }

    const page = categoryPageKey(slug);
    const order = defsFor(CATEGORY_PAGE).findIndex((d) => d.key === key);
    const existing = await this.prisma.db.pageSection.findUnique({ where: { page_key: { page, key } } });

    // what the override starts from — the default in force, not the manifest,
    // so switching one thing off does not silently reset the rest of the row
    const base = slug
      ? await this.prisma.db.pageSection.findUnique({ where: { page_key: { page: CATEGORY_PAGE, key } } })
      : null;

    if (!existing) {
      return this.prisma.db.pageSection.create({
        data: {
          page,
          key,
          sortOrder: order,
          isActive: dto.isActive ?? base?.isActive ?? true,
          config: (dto.config ?? base?.config ?? {}) as object,
        },
      });
    }
    return this.prisma.db.pageSection.update({
      where: { page_key: { page, key } },
      data: {
        isActive: dto.isActive,
        config: dto.config === undefined ? undefined : (dto.config as object),
      },
    });
  }

  /** stop deciding for yourself and follow the default again */
  async resetCategory(slug: string, key: string) {
    const page = categoryPageKey(slug);
    const row = await this.prisma.db.pageSection.findUnique({ where: { page_key: { page, key } } });
    if (row) await this.prisma.db.pageSection.delete({ where: { page_key: { page, key } } });
    return { ok: true };
  }

  /**
   * What the storefront renders for one category: manifest order, each section
   * resolved override → default → manifest.
   *
   * Returns the switched-off ones too, marked `enabled: false`. The page needs
   * to know a section exists and is off — otherwise a section added to the
   * manifest later would be indistinguishable from one the owner hid.
   */
  async forCategory(slug: string, zone?: string) {
    const defs = defsFor(CATEGORY_PAGE);
    const rows = await this.prisma.db.pageSection.findMany({
      where: {
        page: { in: [CATEGORY_PAGE, categoryPageKey(slug)] },
        OR: [{ zone: null }, ...(zone ? [{ zone }] : [])],
      },
      select: {
        page: true, key: true, isActive: true, config: true,
        blockType: true, title: true, subtitle: true,
      },
    });
    const baseBy = new Map<string, SectionRow>(
      rows.filter((r) => r.page === CATEGORY_PAGE && !r.blockType).map((r) => [r.key, r] as const),
    );
    const ownBy = new Map<string, SectionRow>(
      rows.filter((r) => r.page !== CATEGORY_PAGE && !r.blockType).map((r) => [r.key, r] as const),
    );

    const builtIn = defs.map((d) => {
      const row = ownBy.get(d.key) ?? baseBy.get(d.key);
      return {
        key: d.key,
        enabled: row?.isActive ?? true,
        blockType: null as BlockType | null,
        title: null as string | null,
        subtitle: null as string | null,
        config: (row?.config ?? {}) as Record<string, unknown>,
      };
    });

    /*
      Sections the owner added, switched on only.

      They cannot land anywhere they like: each one names the built-in section
      it follows (`config.after`). That gives him placement without handing him
      the ability to reorder the fourteen, which is the thing D-CAT-04 exists
      to prevent.
    */
    const custom = rows
      .filter((r) => r.blockType && r.isActive)
      .map((r) => ({
        key: r.key,
        enabled: true,
        blockType: (r.blockType ?? null) as BlockType | null,
        title: r.title ?? null,
        subtitle: r.subtitle ?? null,
        config: (r.config ?? {}) as Record<string, unknown>,
      }));

    const out: typeof builtIn = [];
    for (const row of builtIn) {
      out.push(row);
      for (const c of custom) if ((c.config.after as string) === row.key) out.push(c);
    }
    // one pointing at a section that no longer exists still has to render
    for (const c of custom) if (!out.includes(c)) out.push(c);
    return out;
  }
}

@Controller('page-sections')
export class LayoutController {
  constructor(private readonly svc: LayoutService) {}

  @Get()
  list() {
    return this.svc.list('home');
  }
  @Patch()
  update(@Body() dto: { key: string; isActive?: boolean; zone?: string | null }) {
    return this.svc.update('home', dto.key, dto);
  }
  @Patch('order')
  reorder(@Body() dto: { keys: string[] }) {
    return this.svc.reorder('home', dto.keys);
  }

  @Post('blocks')
  addBlock(@Body() dto: { blockType: BlockType }) {
    return this.svc.addBlock('home', dto.blockType);
  }
  @Patch('blocks/:key')
  editBlock(@Param('key') key: string, @Body() dto: { title?: string; subtitle?: string | null; config?: Record<string, unknown> }) {
    return this.svc.editBlock('home', key, dto);
  }
  @Delete('blocks/:key')
  removeBlock(@Param('key') key: string) {
    return this.svc.removeBlock('home', key);
  }

  /*
    Category pages. `slug` absent = the defaults every category follows.
    Kept on this controller rather than a new one because it is the same
    table, the same rules and the same screen, pointed at a different page.
  */
  @Get('category')
  listCategory(@Query('slug') slug?: string) {
    return this.svc.listCategory(slug);
  }
  @Patch('category')
  updateCategory(@Body() dto: { slug?: string; key: string; isActive?: boolean; config?: Record<string, unknown> }) {
    return this.svc.updateCategory(dto.slug, dto.key, dto);
  }
  /*
    Sections the owner adds to a category page. `slug` absent = every category.

    ⚠️ THESE MUST STAY ABOVE `category/:slug/:key`. Nest matches in declaration
    order, so with the wildcard first, DELETE category/blocks/abc would be read
    as slug="blocks", key="abc" — a delete that silently does nothing.
  */
  @Post('category/blocks')
  addCategoryBlock(@Body() dto: { slug?: string; blockType: BlockType; after: string }) {
    return this.svc.addCategoryBlock(dto.slug, dto.blockType, dto.after);
  }
  @Patch('category/blocks/:key')
  editCategoryBlock(
    @Param('key') key: string,
    @Body() dto: { slug?: string; title?: string; subtitle?: string | null; config?: Record<string, unknown> },
  ) {
    return this.svc.editCategoryBlock(dto.slug, key, dto);
  }
  @Delete('category/blocks/:key')
  removeCategoryBlock(@Param('key') key: string, @Query('slug') slug?: string) {
    return this.svc.removeCategoryBlock(slug, key);
  }

  @Delete('category/:slug/:key')
  resetCategory(@Param('slug') slug: string, @Param('key') key: string) {
    return this.svc.resetCategory(slug, key);
  }
}

@Module({
  providers: [LayoutService],
  controllers: [LayoutController],
  exports: [LayoutService],
})
export class LayoutModule {}
