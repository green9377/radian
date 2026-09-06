import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  OnModuleInit,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/*
  ═══════════════════════════════════════════════════════════════════════════
  Section headings — the small coloured line, the title, and the sentence under
  it, for every section of the storefront.

  Owner's request, 30 Jul 2026, after annotating five screenshots with the same
  arrow pointing at the same three lines.

  ONE STORE, NOT THIRTEEN FIELDS. The tempting reading is "add eyebrow/title/
  subtitle to each section's own table". That is thirteen builds on the homepage
  alone, a fresh one for every section added afterwards, and a guarantee that
  one of them is eventually forgotten.

  DECLARED IN CODE, UPSERTED ON BOOT — the same pattern `RegistryService` uses
  for access nodes. A new section names its key in the manifest below and shows
  up in the admin list by itself.
  ═══════════════════════════════════════════════════════════════════════════
*/

interface SectionDefault {
  key: string;
  /** which page it belongs to — only for grouping the admin list */
  page: string;
  /** what to call it on the admin screen; the owner never sees `key` */
  label: string;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
}

/**
 * ⚠️ The defaults are the CURRENT wording of the live site, not placeholders.
 *
 * The screen has to open showing what a visitor sees. Seeded with lorem, or
 * blank, the first save would silently rewrite a page nobody meant to touch —
 * and on a homepage that is the most expensive text in the business.
 */
export const SECTION_MANIFEST: SectionDefault[] = [
  {
    key: 'home.categories', page: 'Homepage', label: 'Shop by Category',
    eyebrow: 'Curated for every moment', title: 'Shop by Category',
  },
  {
    key: 'home.occasions', page: 'Homepage', label: 'Every Occasion, Every Person',
    eyebrow: 'Surprise your loved ones', title: 'Every Occasion, Every Person',
    subtitle: "Find the perfect gift by the moment — or by who it's for.",
  },
  {
    key: 'home.bestsellers', page: 'Homepage', label: 'Best Sellers',
    eyebrow: 'Loved by thousands', title: 'Best Selling Flowers & Gifts',
    subtitle: 'Our most-gifted arrangements, chosen again and again.',
  },
  {
    key: 'home.delivery', page: 'Homepage', label: 'Delivery band',
    eyebrow: "Radian's promise", title: "Need It Today? We've Got You",
  },
  {
    key: 'home.budget', page: 'Homepage', label: 'Gifts for Every Budget',
    eyebrow: 'Beautiful at every price', title: 'Gifts for Every Budget',
    subtitle: 'Thoughtful never has to mean expensive.',
  },
  {
    key: 'home.giftfinder', page: 'Homepage', label: 'Gift Finder',
    eyebrow: 'Still not sure what to send?', title: 'Find the Perfect Gift in 3 Easy Steps',
    subtitle: "Answer one simple question at a time — we'll match the perfect gift for you.",
  },
  {
    key: 'home.faq', page: 'Homepage', label: 'Questions people ask',
    eyebrow: 'FAQs for Radian Flower & Gift Shop', title: 'Questions people ask before they order',
    subtitle: 'Find quick answers to common questions about ordering, delivery, customization, and more.',
  },
  {
    key: 'home.reviews', page: 'Every page', label: 'Customer reviews',
    eyebrow: 'Trusted by thousands', title: 'Why Dhaka Loves Radian',
  },
  {
    key: 'home.blog', page: 'Homepage', label: 'Latest Articles',
    eyebrow: 'From our journal', title: 'Latest Articles',
  },
  {
    key: 'home.store', page: 'Every page', label: 'Visit the shop',
    eyebrow: "We're real, come say hello", title: 'Visit Radian Flower & Gift Shop',
    subtitle: 'Walk in, smell the flowers, watch us arrange your gift by hand.',
  },

  /*
    ── The category page, 31 Jul 2026 ────────────────────────────────────────
    Written for EVERY category at once. `category.colourGrid` is the wording on
    the flowers page, the cakes page and every page added next year.

    One category can disagree: the storefront also looks for
    `category.<slug>.<key>` first, so "Shop by colour" can become "Shop by
    shade" on one page without touching the other twelve. The Category page
    screen writes those; this list is the default underneath them.

    The banner's own words are NOT here — the heading and the paragraph are
    different for every category by definition, so they live on the category
    itself (Categories → Content).

    As with the homepage keys above, these defaults are the wording the live
    site is showing today, not placeholders. Anything else and the first save
    would quietly rewrite a page nobody meant to touch.
  */
  {
    key: 'category.subCategoryRail', page: 'Category page', label: 'Shop by type',
    eyebrow: 'Shop by type',
  },
  {
    key: 'category.bestsellers', page: 'Category page', label: 'Most ordered',
    eyebrow: 'Most ordered',
  },
  {
    key: 'category.attributeGrid', page: 'Category page', label: 'Shop by style',
    eyebrow: 'Shop by style',
  },
  {
    key: 'category.occasionGrid', page: 'Category page', label: 'Shop by occasion',
    eyebrow: 'Shop by occasion',
  },
  {
    key: 'category.readyToday', page: 'Category page', label: 'Ready to send now',
    eyebrow: 'Leaving the studio today', title: 'Ready To Send Right Now',
    subtitle: 'In stock, packed, and out the door within the hour.',
  },
  {
    key: 'category.colourGrid', page: 'Category page', label: 'Shop by colour',
    eyebrow: 'Shop by colour',
  },
  {
    key: 'category.budgetRail', page: 'Category page', label: 'Shop by budget',
    eyebrow: 'Shop by budget', title: 'Beautiful At Every Price',
    subtitle: 'Honest pricing. No surprise charges at checkout.',
  },
  {
    key: 'category.productGrid', page: 'Category page', label: 'All products',
    eyebrow: 'The full collection',
  },
  {
    key: 'category.comboRail', page: 'Category page', label: 'Better together',
    eyebrow: 'Better together', title: 'Pairs Well With These',
    subtitle: 'Hand-picked to go with this collection — one gift, one delivery.',
  },
  /*  The delivery band had no key here at all, so its three boxes in the admin
      opened empty and the storefront kept an eyebrow typed into the component.
      Its words are the shop's biggest promise; they belong with the rest.  */
  {
    key: 'category.deliveryBand', page: 'Category page', label: 'Delivery band',
    eyebrow: 'Delivery, done right',
  },
  {
    key: 'category.crossSellRail', page: 'Category page', label: 'Keep exploring',
    eyebrow: 'Keep exploring', title: 'You Might Also Love',
  },
  {
    key: 'category.giftFinder', page: 'Category page', label: 'Gift Finder',
    eyebrow: 'Still deciding?', title: 'Find the Perfect Gift in 3 Simple Steps',
    subtitle: "A few quick details, and we'll handpick the best gifts from this collection.",
  },
  {
    key: 'category.faq', page: 'Category page', label: 'Questions',
    eyebrow: 'Good to know', title: 'Questions People Ask Before They Order',
  },
];

export interface SectionRow {
  key: string;
  page: string;
  label: string;
  zone: string;
  eyebrow: string | null;
  title: string | null;
  subtitle: string | null;
}

@Injectable()
export class SectionsService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create any manifest key that has no default row yet.
   *
   * `createMany({ skipDuplicates })` rather than an upsert loop: an upsert would
   * overwrite the owner's edits with the manifest text on every restart, which
   * is the one thing this must never do. New keys appear; existing rows are not
   * touched, ever.
   */
  async onModuleInit() {
    const existing = await this.prisma.db.sectionText.findMany({
      where: { zone: '' },
      select: { key: true },
    });
    const have = new Set(existing.map((r) => r.key));
    const missing = SECTION_MANIFEST.filter((s) => !have.has(s.key));
    if (missing.length === 0) return;

    await this.prisma.db.sectionText.createMany({
      data: missing.map((s) => ({
        key: s.key,
        zone: '',
        eyebrow: s.eyebrow ?? null,
        title: s.title ?? null,
        subtitle: s.subtitle ?? null,
      })),
      skipDuplicates: true,
    });
  }

  /** every row, with the manifest's label and page attached for the admin list */
  async list(): Promise<SectionRow[]> {
    const rows = await this.prisma.db.sectionText.findMany({ orderBy: { key: 'asc' } });
    const meta = new Map(SECTION_MANIFEST.map((s) => [s.key, s]));
    return rows
      // A key the code no longer declares is not shown. It is left in the table
      // rather than deleted — a section removed today may come back, and its
      // wording with it.
      .filter((r) => meta.has(r.key))
      .map((r) => ({
        key: r.key,
        page: meta.get(r.key)!.page,
        label: meta.get(r.key)!.label,
        zone: r.zone,
        eyebrow: r.eyebrow,
        title: r.title,
        subtitle: r.subtitle,
      }));
  }

  /**
   * The map the storefront reads: key → text, with the zone override folded in.
   *
   * Resolved on the server so no component has to know that overrides exist.
   */
  async map(zone?: string): Promise<Record<string, { eyebrow: string | null; title: string | null; subtitle: string | null }>> {
    const rows = await this.prisma.db.sectionText.findMany({
      where: { OR: [{ zone: '' }, ...(zone ? [{ zone }] : [])] },
    });

    const out: Record<string, { eyebrow: string | null; title: string | null; subtitle: string | null }> = {};
    // defaults first, then let a zone row overwrite it — order matters
    for (const r of rows.filter((r) => r.zone === '')) {
      out[r.key] = { eyebrow: r.eyebrow, title: r.title, subtitle: r.subtitle };
    }
    for (const r of rows.filter((r) => r.zone !== '')) {
      out[r.key] = { eyebrow: r.eyebrow, title: r.title, subtitle: r.subtitle };
    }
    return out;
  }

  /** upsert, because a zone override usually does not exist until it is typed */
  async save(key: string, zone: string, body: { eyebrow?: string; title?: string; subtitle?: string }) {
    const data = {
      eyebrow: blank(body.eyebrow),
      title: blank(body.title),
      subtitle: blank(body.subtitle),
    };
    return this.prisma.db.sectionText.upsert({
      where: { key_zone: { key, zone } },
      create: { key, zone, ...data },
      update: data,
    });
  }

  /** removing an override falls the zone back to the default — not to nothing */
  async clearOverride(key: string, zone: string) {
    if (!zone) return { ok: false };
    await this.prisma.db.sectionText.deleteMany({ where: { key, zone } });
    return { ok: true };
  }
}

const blank = (v: string | undefined) => (v === undefined ? undefined : v.trim() === '' ? null : v.trim());

@Controller('sections')
export class SectionsController {
  constructor(private readonly svc: SectionsService) {}

  @Get()
  list() {
    return this.svc.list();
  }

  @Patch(':key')
  save(
    @Param('key') key: string,
    @Query('zone') zone = '',
    @Body() body: { eyebrow?: string; title?: string; subtitle?: string },
  ) {
    return this.svc.save(key, zone, body);
  }

  @Patch(':key/clear')
  clear(@Param('key') key: string, @Query('zone') zone = '') {
    return this.svc.clearOverride(key, zone);
  }
}

@Module({
  providers: [SectionsService],
  controllers: [SectionsController],
  exports: [SectionsService],
})
export class SectionsModule {}
