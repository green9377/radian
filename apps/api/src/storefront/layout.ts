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
    { key: 'about', label: 'About Radian', hint: 'The story card with the picture', movable: true },
    { key: 'faq', label: 'Questions people ask', hint: 'The FAQ accordion from Pages & FAQs', movable: true },
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
    { key: 'giftFinder', label: 'Gift Finder', hint: 'The three-step wizard, searching this category only', movable: false },
    { key: 'faq', label: 'Questions', hint: "This category's own FAQ", movable: false },
    { key: 'story', label: 'The story at the bottom', hint: 'SEO text with a picture — like About Radian on the homepage; written per category', movable: false },
  ],
};

export const BLOCK_LABEL: Record<BlockType, string> = {
  PRODUCT_ROW: 'A row of products',
  COLLECTION_ROW: 'Cards linking to collections',
  BANNER_STRIP: 'A banner strip',
  IMAGE_BANNER: 'A picture banner',
};

/** what a freshly added block starts as — never empty, so it renders something
 *  the moment it is switched on rather than looking broken */
const DEFAULT_CONFIG: Record<BlockType, Record<string, unknown>> = {
  PRODUCT_ROW: { rule: 'bestseller', count: 8 },
  COLLECTION_ROW: { slugs: [] },
  BANNER_STRIP: { bannerId: null },
  /*  the owner's own creative, shown exactly as uploaded: the picture, where a
      click goes, the words a screen reader says, and whether it sits inside
      the page width or runs edge to edge. Nothing is drawn over it.  */
  IMAGE_BANNER: { imageUrl: '', href: '', alt: '', width: 'contained' },
};

/*
  ── Settings of the BUILT-IN homepage sections (4 Sep 2026) ────────────────

  Until now a built-in section had an on/off switch, a zone and a heading, and
  everything else about it — which tabs the Best Sellers grid drew, how many
  cards, what the button under it said — was typed into the component. The
  homepage audit of 4 Sep listed every one of those; this is where they moved.

  Stored on the section's own `config` column, the one the added blocks already
  use, and never written raw: every key has a sanitiser below, so the storefront
  can trust the shape it reads and a typo in the admin cannot take the page
  down. `SECTION_DEFAULTS` is merged in on every read, which is what lets a
  component drop its own hard-coded fallbacks.
*/
export type BestSellerMode = 'AUTO' | 'MANUAL' | 'AUTO_FILL';

export const SECTION_DEFAULTS: Record<string, Record<string, unknown>> = {
  bestsellers: {
    /*  AUTO      — badge holders only (DEC-PRD-050), ranked by the window sales
                    the badge was decided on. Fewer than `perTab` means fewer cards.
        MANUAL    — the owner's own list, in his order; a tab shows the picks
                    that belong to that category
        AUTO_FILL — badge holders first, then the rest of the category by real
                    window sales, then newest. The old behaviour, now a choice.  */
    mode: 'AUTO' as BestSellerMode,
    /** top-level category slugs, in tab order. null = the featured categories */
    categories: null as string[] | null,
    perTab: 8,
    allLabel: 'All Products',
    showViewAll: true,
    viewAllText: 'View All Products',
    viewAllHref: '/products',
    emptyTitle: 'Nothing here yet',
    emptyText: 'More gifts for your area are coming soon.',
    /** MANUAL picks — product slugs in the owner's order */
    products: [] as string[],
  },
  categories: {
    /** how many category cards at most; 0 = every featured one */
    limit: 0,
  },
  blog: {
    count: 3,
    /** hand-picked post slugs in order; empty = the newest ones */
    slugs: [] as string[],
  },
  giftfinder: {
    /** the question above each step, by the step's parameter */
    questions: {
      occasions: "What's the occasion?",
      recipients: 'Who is the gift for?',
      budget: "What's your budget?",
    } as Record<string, string>,
    /** the small line under each question, by the step's parameter */
    hints: {
      occasions: 'Pick the moment you are celebrating.',
      recipients: 'Let us know the special person.',
      budget: 'Every budget has something beautiful.',
    } as Record<string, string>,
    nextLabel: 'Next Step →',
    doneLabel: 'Show My Gifts →',
    skipLabel: 'Skip for now',
    /** the purple panel on the left — owner's reference, 5 Sep 2026 */
    panelTitle: "It's better when it's personal",
    panelText: 'Tell us a bit about your gifting moment and we will take care of the rest.',
    panelScript: 'Thoughtful Gifts, Happier People',
    panelImageUrl: '',
    /** the slim caption column on the right */
    sideCaption: 'Small gestures, big happiness',
  },
  /** the story card — owner's reference, 5 Sep 2026. Every word and the picture are his. */
  about: {
    eyebrow: 'About Radian',
    title: 'Radian Flower & Gift Shop — Bringing Smiles Across Bangladesh',
    /** paragraphs, separated by a blank line */
    body: '',
    highlightBold: '',
    highlightText: '',
    highlightIcon: 'truck',
    /** the small icon + two-line chips under the text */
    features: [] as { icon: string; title: string; sub: string }[],
    ctaText: 'Read more about Radian',
    ctaHref: '/about',
    imageUrl: '',
    scriptLine: '',
    /** the three little cards beside the picture */
    stats: [] as { icon: string; title: string; sub: string }[],
    sideCaption: '',
  },
  /** the category page's own story card (5 Sep 2026) — the About Radian shape, empty until written */
  story: {
    eyebrow: '',
    title: '',
    body: '',
    highlightBold: '',
    highlightText: '',
    highlightIcon: 'truck',
    features: [] as { icon: string; title: string; sub: string }[],
    ctaText: '',
    ctaHref: '/products',
    imageUrl: '',
    scriptLine: '',
    stats: [] as { icon: string; title: string; sub: string }[],
    sideCaption: '',
  },
  /** the FAQ accordion — the questions themselves live under Pages & FAQs */
  faq: {
    /** a group name from Pages & FAQs, '' = every group */
    group: '',
    count: 7,
    scriptLine: 'Here to Help',
    sideText: "Still have a question? We're always here to make your gifting experience smooth and joyful.",
    footerLine: 'Thoughtful gifts. Happier people.',
    linkText: 'See every question',
    linkHref: '/faq',
  },
  delivery: {
    perTab: 4,
    showViewAll: true,
    viewAllText: 'View All Products',
    viewAllHref: '/products',
  },
};

const text = (v: unknown, fallback: string, max = 160): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : fallback;
const int = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fallback;
};
const slugs = (v: unknown, max: number): string[] =>
  Array.isArray(v)
    ? Array.from(new Set(v.filter((s): s is string => typeof s === 'string' && /^[a-z0-9-]+$/.test(s)))).slice(0, max)
    : [];
/** a link the storefront may follow — its own paths only, never an outside site */
const href = (v: unknown, fallback: string): string => {
  const s = text(v, fallback, 200);
  return s.startsWith('/') ? s : fallback;
};

/** icon + two lines, a list of them — the about card's chips and stat cards */
const iconRows = (v: unknown, max: number): { icon: string; title: string; sub: string }[] =>
  Array.isArray(v)
    ? v
        .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === 'object')
        .map((r) => ({
          icon: text(r.icon, '', 24).replace(/[^a-z0-9-]/g, ''),
          title: text(r.title, '', 60),
          sub: text(r.sub, '', 80),
        }))
        .filter((r) => r.title || r.sub)
        .slice(0, max)
    : [];

/** the About-Radian shape, shared by the homepage card and every category's story */
const storyShape = (c: Record<string, unknown>, d: Record<string, unknown>) => {
  const img = text(c.imageUrl, '', 400);
  return {
    eyebrow: text(c.eyebrow, d.eyebrow as string, 60),
    title: text(c.title, d.title as string, 120),
    body: text(c.body, '', 4000),
    highlightBold: text(c.highlightBold, '', 80),
    highlightText: text(c.highlightText, '', 300),
    highlightIcon: text(c.highlightIcon, d.highlightIcon as string, 24).replace(/[^a-z0-9-]/g, ''),
    features: iconRows(c.features, 6),
    ctaText: text(c.ctaText, d.ctaText as string, 40),
    ctaHref: href(c.ctaHref, d.ctaHref as string),
    imageUrl: /^https?:\/\//.test(img) ? img : '',
    scriptLine: text(c.scriptLine, '', 60),
    stats: iconRows(c.stats, 4),
    sideCaption: text(c.sideCaption, '', 80),
  };
};

const SECTION_SANITISERS: Record<string, (cfg: Record<string, unknown>) => Record<string, unknown>> = {
  story: (c) => storyShape(c, SECTION_DEFAULTS.story),
  faq: (c) => {
    const d = SECTION_DEFAULTS.faq;
    return {
      group: text(c.group, '', 60),
      count: int(c.count, 2, 12, d.count as number),
      scriptLine: text(c.scriptLine, d.scriptLine as string, 40),
      sideText: text(c.sideText, d.sideText as string, 240),
      footerLine: text(c.footerLine, d.footerLine as string, 80),
      linkText: text(c.linkText, d.linkText as string, 40),
      linkHref: href(c.linkHref, d.linkHref as string),
    };
  },
  about: (c) => storyShape(c, SECTION_DEFAULTS.about),
  bestsellers: (c) => {
    const d = SECTION_DEFAULTS.bestsellers;
    const mode = ['AUTO', 'MANUAL', 'AUTO_FILL'].includes(String(c.mode)) ? String(c.mode) : d.mode;
    return {
      mode,
      categories: c.categories === null || c.categories === undefined ? null : slugs(c.categories, 12),
      perTab: int(c.perTab, 2, 12, d.perTab as number),
      allLabel: text(c.allLabel, d.allLabel as string, 40) || (d.allLabel as string),
      showViewAll: c.showViewAll === undefined ? d.showViewAll : Boolean(c.showViewAll),
      viewAllText: text(c.viewAllText, d.viewAllText as string, 40) || (d.viewAllText as string),
      viewAllHref: href(c.viewAllHref, d.viewAllHref as string),
      emptyTitle: text(c.emptyTitle, d.emptyTitle as string, 60),
      emptyText: text(c.emptyText, d.emptyText as string, 160),
      products: slugs(c.products, 40),
    };
  },
  categories: (c) => ({ limit: int(c.limit, 0, 24, 0) }),
  blog: (c) => ({ count: int(c.count, 1, 6, 3), slugs: slugs(c.slugs, 6) }),
  giftfinder: (c) => {
    const d = SECTION_DEFAULTS.giftfinder;
    const q = (c.questions && typeof c.questions === 'object' ? c.questions : {}) as Record<string, unknown>;
    const questions: Record<string, string> = {};
    for (const [k, v] of Object.entries(q).slice(0, 8)) {
      if (/^[a-z0-9-]+$/.test(k) && typeof v === 'string' && v.trim()) questions[k] = v.trim().slice(0, 80);
    }
    const h = (c.hints && typeof c.hints === 'object' ? c.hints : {}) as Record<string, unknown>;
    const hints: Record<string, string> = {};
    for (const [k, v] of Object.entries(h).slice(0, 8)) {
      if (/^[a-z0-9-]+$/.test(k) && typeof v === 'string') hints[k] = v.trim().slice(0, 120);
    }
    const img = text(c.panelImageUrl, '', 400);
    return {
      questions: { ...(d.questions as Record<string, string>), ...questions },
      hints: { ...(d.hints as Record<string, string>), ...hints },
      nextLabel: text(c.nextLabel, d.nextLabel as string, 30) || (d.nextLabel as string),
      doneLabel: text(c.doneLabel, d.doneLabel as string, 30) || (d.doneLabel as string),
      skipLabel: text(c.skipLabel, d.skipLabel as string, 30),
      panelTitle: text(c.panelTitle, d.panelTitle as string, 80),
      panelText: text(c.panelText, d.panelText as string, 200),
      panelScript: text(c.panelScript, d.panelScript as string, 60),
      panelImageUrl: /^https?:\/\//.test(img) ? img : '',
      sideCaption: text(c.sideCaption, d.sideCaption as string, 60),
    };
  },
  delivery: (c) => {
    const d = SECTION_DEFAULTS.delivery;
    return {
      perTab: int(c.perTab, 2, 8, d.perTab as number),
      showViewAll: c.showViewAll === undefined ? d.showViewAll : Boolean(c.showViewAll),
      viewAllText: text(c.viewAllText, d.viewAllText as string, 40) || (d.viewAllText as string),
      viewAllHref: href(c.viewAllHref, d.viewAllHref as string),
    };
  },
};

/** the settings in force for a built-in section: defaults, then what is stored */
/*  The category page's Gift Finder is the homepage's, so it keeps the same
    settings shape under the category manifest's own key (owner, 5 Sep 2026).  */
SECTION_DEFAULTS.giftFinder = SECTION_DEFAULTS.giftfinder;
SECTION_SANITISERS.giftFinder = SECTION_SANITISERS.giftfinder;

export const withSectionDefaults = (key: string, stored: unknown): Record<string, unknown> => {
  const d = SECTION_DEFAULTS[key];
  const s = (stored ?? {}) as Record<string, unknown>;
  return d ? { ...d, ...s } : s;
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

  /**
   * Create any manifest section that has no row yet — never touch existing
   * ones' settings or on/off.
   *
   * ⚠️ A new built-in lands WHERE THE MANIFEST PUTS IT, not on top of an old
   * row (5 Sep 2026). A row created with `sortOrder: i` tied with the row that
   * already held i, and behind the fixed Reviews block a new section could
   * then never be dragged above it — the reorder guard rightly refuses to
   * move Reviews. So the rows at or after that position slide down by one:
   * the owner's own order is kept, the newcomer takes the manifest's slot.
   */
  async onModuleInit() {
    for (const [page, defs] of Object.entries(PAGE_SECTION_MANIFEST)) {
      const existing = await this.prisma.db.pageSection.findMany({ where: { page }, select: { key: true } });
      const have = new Set(existing.map((r) => r.key));
      const missing = defs
        .map((d, i) => ({ d, i }))
        .filter(({ d }) => !have.has(d.key));
      if (missing.length === 0) continue;
      for (const { d, i } of missing) {
        await this.prisma.db.pageSection.updateMany({
          where: { page, sortOrder: { gte: i } },
          data: { sortOrder: { increment: 1 } },
        });
        await this.prisma.db.pageSection.createMany({
          data: [{ page, key: d.key, sortOrder: i }],
          skipDuplicates: true,
        });
      }
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
          config: r.blockType ? ((r.config ?? {}) as Record<string, unknown>) : withSectionDefaults(r.key, r.config),
          /** true = this built-in section has settings of its own on this screen */
          hasSettings: !r.blockType && Boolean(SECTION_SANITISERS[r.key]),
          sortOrder: r.sortOrder,
          isActive: r.isActive,
          zone: r.zone,
        };
      });
  }

  /** the settings in force for one built-in homepage section — what the
   *  storefront's own endpoints (the Best Sellers grid) read */
  async sectionConfig(page: string, key: string): Promise<Record<string, unknown>> {
    const row = await this.prisma.db.pageSection.findUnique({
      where: { page_key: { page, key } },
      select: { config: true },
    });
    return withSectionDefaults(key, row?.config);
  }

  /**
   * Write a built-in section's settings. Only keys with a sanitiser can be
   * written, and only through it — the storefront trusts the stored shape.
   */
  async updateSettings(page: string, key: string, config: Record<string, unknown>) {
    const clean = SECTION_SANITISERS[key];
    if (!clean || !defsFor(page).some((d) => d.key === key))
      throw new BadRequestException('This section has no settings of its own');
    const row = await this.prisma.db.pageSection.findUnique({ where: { page_key: { page, key } } });
    if (!row) throw new BadRequestException('No such section');
    const merged = clean({ ...withSectionDefaults(key, row.config), ...(config ?? {}) });
    await this.prisma.db.pageSection.update({
      where: { page_key: { page, key } },
      data: { config: merged as object },
    });
    return merged;
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
      config: r.blockType ? ((r.config ?? {}) as Record<string, unknown>) : withSectionDefaults(r.key, r.config),
    }));
  }

  /**
   * A section the owner adds. Born switched off, like a new banner.
   *
   * ⚠️ It is born ABOVE the fixed tail (Reviews · … · Visit the shop), not at
   * the very end (5 Sep 2026). Appended after "Visit the shop" it could never
   * be dragged up: the reorder guard keeps every fixed section at its index,
   * and moving anything past them changes that index. So the newcomer takes
   * the slot just before the first fixed section that is not the top one,
   * and the rows from there slide down.
   */
  async addBlock(page: string, blockType: BlockType) {
    const rows = await this.prisma.db.pageSection.findMany({
      where: { page }, orderBy: { sortOrder: 'asc' }, select: { key: true, sortOrder: true },
    });
    const defs = defsFor(page);
    const fixedTail = rows.find((r, i) => i > 0 && defs.some((d) => d.key === r.key && !d.movable));
    const sortOrder = fixedTail ? fixedTail.sortOrder : (rows[rows.length - 1]?.sortOrder ?? 0) + 1;
    if (fixedTail) {
      await this.prisma.db.pageSection.updateMany({
        where: { page, sortOrder: { gte: sortOrder } },
        data: { sortOrder: { increment: 1 } },
      });
    }
    return this.prisma.db.pageSection.create({
      data: {
        page,
        key: `custom_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`,
        blockType,
        title: BLOCK_LABEL[blockType],
        config: DEFAULT_CONFIG[blockType],
        sortOrder,
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
    // a section with its own settings shape keeps them in that shape
    if (dto.config && SECTION_SANITISERS[key]) dto = { ...dto, config: SECTION_SANITISERS[key](dto.config) };

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
  /** a built-in section's own settings — Best Sellers tabs and mode, article count… */
  @Patch('settings')
  updateSettings(@Body() dto: { key: string; config: Record<string, unknown> }) {
    return this.svc.updateSettings('home', dto.key, dto.config);
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
