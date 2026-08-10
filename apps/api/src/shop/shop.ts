import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../auth/auth.guard';
import { HoursModule, HoursService } from '../storefront/hours';
import { LayoutModule, LayoutService } from '../storefront/layout';
/*  DEC-DLV-009 — "বেশি নির্দিষ্টতা জেতে"। একটাই function, Sales আর POS-ও
    এটাই পড়বে; দামের হিসাব দুবার লেখা হয় না। */
import { ratesForArea } from '../delivery/resolve';
import { cartTypeSets, methodOkForCart } from '../common/delivery-rule';

/** ঢাকা UTC+6। container ছয় ঘণ্টা পিছিয়ে চলে, তাই cut-off সবসময় এই offset ধরে। */
const BD_OFFSET_MS = 6 * 60 * 60 * 1000;

/**
 * Every word in this codebase that means "outside Dhaka".
 *
 * ⚠️ Three of them are in live use and none can be retired: the Prisma enum is
 * `BANGLADESH`, the storefront's `zoneCode()` sends `NATIONWIDE`, and the
 * browser's zone store holds lower-case `bangladesh`. Any entrance that checks
 * for only one of them silently answers as if the visitor were in Dhaka —
 * which is how the homepage came to promise 3-hour express to Khulna.
 */
const NATIONWIDE_ALIASES = new Set(['BANGLADESH', 'NATIONWIDE']);

/*
  ═══════════════════════════════════════════════════════════════════════════
  Public storefront read API — `/shop/*`

  WHY THIS EXISTS AS A SEPARATE SURFACE, 30 Jul 2026.

  `AuthModule` registers `AuthGuard` as `APP_GUARD`, so every route in the API
  is closed unless it carries `@Public()`. The storefront has no login and
  never will for browsing. So it had no way to read anything — this is the
  first thing found when connecting `apps/web` to the API at all.

  The tempting fix was to mark the existing admin controllers `@Public()`.
  That would have been wrong twice over:

   1. `@Controller('categories')` carries POST / PATCH / DELETE on the same
      class. Opening the class to read opens it to write.
   2. Admin list endpoints return the whole row. On Category that is merely
      untidy; the moment Products follow the same path it leaks `costPaisa` —
      the shop's own cost — into any browser's network tab. A competitor
      would not even need to try.

  So: a separate, read-only surface that names every field it returns. Nothing
  is spread, nothing is inherited. If a field is not written here, it cannot
  reach a shopper.

  RULES for anything added to this file:
   - read-only. No POST/PATCH/DELETE, ever. Storefront writes (cart, orders,
     review submissions) wait on the Ecommerce module lock and get their own
     guarded surface.
   - `select` explicitly. Never `include` a whole relation, never return a
      Prisma row as-is.
   - a shopper sees only what is live: `isActive` / `isPublished` and nothing
      soft-deleted. `prisma.db` handles deletedAt at the top level; nested
      relations do NOT get that filter (the soft-delete extension says so
      itself), so nested `where` clauses are written out by hand below.
  ═══════════════════════════════════════════════════════════════════════════
*/

/** Only published, live products count towards a category's tally. */
const LIVE_PRODUCTS = { deletedAt: null, isPublished: true } as const;

/**
 * Published products in this category that a courier can actually carry.
 *
 * This replaces the hard-coded `dhakaOnly` list the header nav used to keep
 * (Cakes and Balloons, by slug). Same intent, derived from real data instead of
 * a list somebody has to remember to update: a category belongs in the
 * nationwide menu when something in it ships nationwide.
 *
 * ⚠️ It fails toward hiding. If products have not been given a zone yet, the
 * nationwide menu comes back short. That is the intended direction — the same
 * reasoning as the zone rollout safeguard: an unlisted category loses a sale,
 * a wrongly listed one sends a fresh cream cake on a two-day courier run.
 */
const NATIONWIDE_PRODUCTS = { ...LIVE_PRODUCTS, zone: 'NATIONWIDE' } as const;

const LIVE_CHILD = { deletedAt: null, isActive: true } as const;

export interface ShopCategory {
  slug: string;
  name: string;
  /** the small line under the name on the card — "120+ arrangements" */
  summary: string | null;
  imageUrl: string | null;
  iconUrl: string | null;
  isFeatured: boolean;
  showOnNavbar: boolean;
  /** which zone's homepage rail carries this card — null = both */
  zone: string | null;
  sortOrder: number;
  /** live, published products only — a count that includes drafts is a lie */
  productCount: number;
  /** of those, how many ship outside Dhaka. 0 → hide in the nationwide zone */
  nationwideCount: number;
  children: {
    slug: string;
    name: string;
    imageUrl: string | null;
    sortOrder: number;
  }[];
}

@Injectable()
export class ShopService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hours: HoursService,
  ) {}

  /**
   * Top-level categories a shopper may see, in the order the admin set.
   *
   * Returns both the homepage rail and the header menu in one call — they are
   * the same list read two ways (`showOnNavbar` picks the menu). One request,
   * one cache entry, and the two can never disagree about a category's name.
   */
  async categories(): Promise<ShopCategory[]> {
    const rows = await this.prisma.db.category.findMany({
      where: { isActive: true, parentId: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true, // internal only — never returned to a shopper
        slug: true,
        name: true,
        summary: true,
        imageUrl: true,
        iconUrl: true,
        isFeatured: true,
        showOnNavbar: true,
        zone: true,
        sortOrder: true,
        children: {
          where: LIVE_CHILD,
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          select: { id: true, slug: true, name: true, imageUrl: true, sortOrder: true },
        },
      },
    });

    /*
      Counts come from a groupBy rather than two `_count` selects, because
      Prisma allows only one filter per relation in `_count` and we need two
      tallies of the same relation (all published vs nationwide-only).

      It also lets a child's products count towards its parent. `categoryId` is
      a single FK, so a product filed under "Roses" would otherwise leave
      "Fresh Flowers" reading zero — a rail card claiming an empty category
      while the category page below it is full.
    */
    const parentOf = new Map<string, string>();
    for (const p of rows) {
      parentOf.set(p.id, p.id);
      for (const c of p.children) parentOf.set(c.id, p.id);
    }

    const grouped = await this.prisma.db.product.groupBy({
      by: ['categoryId', 'zone'],
      where: LIVE_PRODUCTS,
      _count: { _all: true },
    });

    const total = new Map<string, number>();
    const nationwide = new Map<string, number>();
    for (const g of grouped) {
      const root = parentOf.get(g.categoryId);
      if (!root) continue; // product sits under an inactive category
      const n = g._count._all;
      total.set(root, (total.get(root) ?? 0) + n);
      if (g.zone === NATIONWIDE_PRODUCTS.zone) {
        nationwide.set(root, (nationwide.get(root) ?? 0) + n);
      }
    }

    return rows.map((c) => ({
      slug: c.slug,
      name: c.name,
      summary: c.summary,
      imageUrl: c.imageUrl,
      iconUrl: c.iconUrl,
      isFeatured: c.isFeatured,
      showOnNavbar: c.showOnNavbar,
      zone: c.zone,
      sortOrder: c.sortOrder,
      productCount: total.get(c.id) ?? 0,
      nationwideCount: nationwide.get(c.id) ?? 0,
      children: c.children.map((ch) => ({
        slug: ch.slug,
        name: ch.name,
        imageUrl: ch.imageUrl,
        sortOrder: ch.sortOrder,
      })),
    }));
  }

  /**
   * Banners a shopper should see right now, for one zone.
   *
   * Scheduling is enforced HERE rather than by a job that flips `isActive` at
   * midnight. A cron that has to run on time is a cron that eventually does not,
   * and the failure mode is a Valentine's banner still up in March. Comparing
   * two dates on read cannot drift.
   *
   * `zone: null` means every zone, so it is always included.
   */
  async banners(zone?: string) {
    const now = new Date();
    const rows = await this.prisma.db.banner.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ liveFrom: null }, { liveFrom: { lte: now } }] },
          { OR: [{ liveTo: null }, { liveTo: { gte: now } }] },
          { OR: [{ zone: null }, ...(zone ? [{ zone }] : [])] },
        ],
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        placement: true,
        eyebrow: true,
        titleMain: true,
        titleAccent: true,
        lead: true,
        cta1Label: true,
        cta1Href: true,
        cta2Label: true,
        cta2Href: true,
        proof: true,
        float1Icon: true,
        float1Title: true,
        float1Sub: true,
        float2Icon: true,
        float2Title: true,
        float2Sub: true,
        imageUrl: true,
      },
    });

    const settings = await this.prisma.db.storefrontSetting.findUnique({
      where: { id: 'singleton' },
      select: { heroRotateSeconds: true },
    });

    return { banners: rows, heroRotateSeconds: settings?.heroRotateSeconds ?? 6 };
  }

  /**
   * Every section heading for this zone, as one map.
   *
   * One request rather than one per section: nine round trips to fill nine
   * headings would make the page assemble itself visibly, line by line.
   */
  async sectionText(zone?: string) {
    const rows = await this.prisma.db.sectionText.findMany({
      where: { OR: [{ zone: '' }, ...(zone ? [{ zone }] : [])] },
      select: { key: true, zone: true, eyebrow: true, title: true, subtitle: true },
    });
    const out: Record<string, { eyebrow: string | null; title: string | null; subtitle: string | null }> = {};
    // defaults first, then the zone override writes over them — order matters
    for (const r of rows.filter((r) => r.zone === '')) {
      out[r.key] = { eyebrow: r.eyebrow, title: r.title, subtitle: r.subtitle };
    }
    for (const r of rows.filter((r) => r.zone !== '')) {
      out[r.key] = { eyebrow: r.eyebrow, title: r.title, subtitle: r.subtitle };
    }
    return out;
  }

  /**
   * The "Visit the shop" card: address, phone, map link, photo, and the live
   * open/closed state.
   *
   * The open/closed part is computed by `HoursService` in Bangladesh time — see
   * the note at the top of `hours.ts` for why it cannot be done in the browser.
   */
  async shopCard() {
    const c = await this.prisma.db.companySetting.findUnique({
      where: { id: 'singleton' },
      select: {
        tradeName: true,
        operatingAddress: true,
        registeredAddress: true,
        city: true,
        postcode: true,
        publicPhone: true,
        whatsappPhone: true,
        mapUrl: true,
        shopImageUrl: true,
      },
    });
    const sf = await this.prisma.db.storefrontSetting.findUnique({
      where: { id: 'singleton' },
      select: { shopChipTitle: true, shopChipSub: true },
    });

    return {
      // "if the shop address is blank, the registered one is where it is" —
      // the same fallback CompanySetting documents on the column itself.
      address: c?.operatingAddress || c?.registeredAddress || null,
      chipTitle: sf?.shopChipTitle ?? null,
      chipSub: sf?.shopChipSub ?? null,
      cityLine: [c?.city, c?.postcode].filter(Boolean).join(' ') || null,
      phone: c?.publicPhone ?? null,
      whatsapp: c?.whatsappPhone || c?.publicPhone || null,
      mapUrl: c?.mapUrl ?? null,
      imageUrl: c?.shopImageUrl ?? null,
      hours: await this.hours.status(),
    };
  }

  /**
   * Everything at the bottom of every page, plus the More panel, in one call.
   *
   * ⚠️ A social profile with no URL is DROPPED, not rendered as a dead icon.
   * The seeded rows have empty URLs on purpose — the shop's profiles are not
   * live yet — and an icon that goes nowhere reads as a broken site, not as a
   * coming-soon.
   */
  async footer() {
    const [groups, socials, badges, settings] = await Promise.all([
      this.prisma.db.linkGroup.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }],
        select: {
          placement: true,
          title: true,
          links: {
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
            select: { label: true, href: true },
          },
        },
      }),
      this.prisma.db.socialLink.findMany({
        where: { isActive: true, NOT: { url: '' } },
        orderBy: { sortOrder: 'asc' },
        select: { icon: true, label: true, url: true },
      }),
      this.prisma.db.paymentBadge.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: { label: true, imageUrl: true },
      }),
      this.prisma.db.storefrontSetting.findUnique({
        where: { id: 'singleton' },
        select: { footerTagline: true, footerLegal: true },
      }),
    ]);

    // An empty column would render as a heading with nothing under it.
    const live = groups.filter((g) => g.links.length > 0);

    return {
      footerGroups: live.filter((g) => g.placement === 'FOOTER').map(strip),
      moreGroups: live.filter((g) => g.placement === 'MORE').map(strip),
      socials,
      badges,
      tagline: settings?.footerTagline ?? null,
      legal: settings?.footerLegal ?? null,
    };
  }

  /**
   * The reviews rail, plus the Google summary above it.
   *
   * ⚠️ PUBLISHED only, and pending never leaks. The whole point of moderation
   * is that an unapproved review is invisible, so the filter lives here rather
   * than being something each caller has to remember.
   *
   * ⚠️ No aggregate is calculated across sources. Google's stars and the shop's
   * own selection are two different populations — one of which the shop chooses
   * — and averaging them produces a number that means nothing while looking
   * authoritative.
   */
  /**
   * DEC-WEB-005 (10 Aug 2026) — the /reviews page: EVERY published review, not
   * the twelve featured ones. Owner: *"kon review page nei jekhane gele
   * customer amder sob review aksathe dekhar sujog pabe"* — like FlowerAura's.
   * Product reviews come along with the product's name attached, so the page
   * can say what each one is about.
   */
  async allReviews() {
    const [rows, settings] = await Promise.all([
      this.prisma.db.review.findMany({
        where: { status: 'PUBLISHED' },
        orderBy: [{ isFeatured: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
        take: 200,
        select: {
          id: true,
          authorName: true,
          rating: true,
          body: true,
          context: true,
          imageUrl: true,
          source: true,
          verifiedPurchase: true,
          createdAt: true,
          product: { select: { name: true, slug: true } },
        },
      }),
      this.prisma.db.storefrontSetting.findUnique({
        where: { id: 'singleton' },
        select: { googleRating: true, googleReviewCount: true, googleProfileUrl: true },
      }),
    ]);
    const avg = rows.length
      ? Math.round((rows.reduce((s, r) => s + r.rating, 0) / rows.length) * 10) / 10
      : null;
    return {
      reviews: rows,
      count: rows.length,
      average: avg,
      google: settings?.googleRating
        ? {
            rating: settings.googleRating,
            count: settings.googleReviewCount,
            url: settings.googleProfileUrl,
          }
        : null,
    };
  }

  async reviews() {
    const [rows, settings] = await Promise.all([
      this.prisma.db.review.findMany({
        where: { status: 'PUBLISHED', isFeatured: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        take: 12,
        select: {
          id: true,
          authorName: true,
          rating: true,
          body: true,
          context: true,
          imageUrl: true,
          source: true,
          verifiedPurchase: true,
        },
      }),
      this.prisma.db.storefrontSetting.findUnique({
        where: { id: 'singleton' },
        select: { googleRating: true, googleReviewCount: true, googleProfileUrl: true },
      }),
    ]);

    return {
      reviews: rows,
      /*  The RATING alone is enough to show the card. The first version needed
          the count as well, so a shop that had filled in its stars saw nothing
          and had no way of telling why. The count is a detail — "Based on 127
          reviews" — and its line is simply left out when it is missing.  */
      google: settings?.googleRating
        ? {
            rating: settings.googleRating,
            count: settings.googleReviewCount ?? null,
            url: settings.googleProfileUrl ?? null,
          }
        : null,
    };
  }

  /** The budget rail — cards only. Their contents come with the collection page. */
  collections(zone?: string) {
    return this.prisma.db.collection.findMany({
      where: {
        isActive: true,
        isFeatured: true,
        OR: [{ zone: null }, ...(zone ? [{ zone }] : [])],
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { slug: true, name: true, kicker: true, subtitle: true, imageUrl: true, accent: true },
    });
  }

  /**
   * The "Every Occasion, Every Person" tabs — one tab per tag group.
   *
   * ⚠️ CHANGED 3 Aug 2026. This used to select `displayStyle: 'CARD'`, which
   * answers the wrong question. `displayStyle` says HOW a group is drawn —
   * chips on a filter bar, or big arch cards. Whether it belongs on the front
   * page is a separate decision, and borrowing one for the other meant the
   * owner could not take a tab off the homepage without changing how that group
   * renders on every other page.
   *
   * Now both the tab and each card inside it are chosen explicitly
   * (`isFeatured`), which is what the Homepage content screen writes.
   *
   * The link is `/{group.slug}/{tag.slug}` — which is exactly the
   * `/occasions/birthday` and `/recipients/her` the page uses today, with no
   * mapping table to keep in step.
   */
  async tagGroups() {
    const groups = await this.prisma.db.tagGroup.findMany({
      where: { isActive: true, isFeatured: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        slug: true,
        name: true,
        tags: {
          where: { isActive: true, isFeatured: true, deletedAt: null },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          select: { slug: true, name: true, summary: true, imageUrl: true },
        },
      },
    });
    // a tab with no cards behind it is a tab that does nothing when pressed
    return groups.filter((g) => g.tags.length > 0);
  }

  /**
   * The shop's name and logo, for the header and the footer.
   *
   * Both were the word RADIAN typed into two components. The owner asked for
   * the logo on 30 Jul and I agreed and then did not do it — recorded here
   * because it was the only item on that list left undone.
   */
  async brand() {
    const c = await this.prisma.db.companySetting.findUnique({
      where: { id: 'singleton' },
      select: { tradeName: true, logoUrl: true },
    });
    return { name: c?.tradeName || 'RADIAN', logoUrl: c?.logoUrl ?? null };
  }

  /**
   * The Google star rating, on its own, for the small places that quote it —
   * the hero's proof chips and the chip on the shop card.
   *
   * ⚠️ It was typed into three components by hand. The owner can now set the
   * real figure on the Reviews screen, and those three did not follow it: he
   * could correct 4.9 to 4.7 and the site would still claim 4.9 in three
   * places. Returning null when it is unset is what lets each of them drop the
   * claim rather than keep an invented one.
   */
  async googleRating() {
    const s = await this.prisma.db.storefrontSetting.findUnique({
      where: { id: 'singleton' },
      select: { googleRating: true },
    });
    return { rating: s?.googleRating ?? null };
  }

  /**
   * The Gift Finder's three questions.
   *
   * WHERE EACH ONE COMES FROM, and why it is not a fourth place to type things:
   *
   *   who / occasion — the two SYSTEM tag groups. They are seeded and
   *     undeletable, which makes them the only two groups guaranteed to exist,
   *     and they are already the answer to "who is it for" and "what for".
   *   budget — the price-range collections, in their own order. The wizard's
   *     third question was "Under ৳1,000 / ৳1,000–2,000 / Premium", which is
   *     the budget rail written out a second time. One list now.
   *
   * ⚠️ Nothing here is typed separately. A tag renamed in the admin changes the
   * question here too, and a price band that no longer exists stops being
   * offered — which is the failure the old hard-coded list could not avoid.
   */
  async giftFinder() {
    const [groups, collections] = await Promise.all([
      this.prisma.db.tagGroup.findMany({
        where: { isActive: true, isSystem: true },
        orderBy: { sortOrder: 'asc' },
        select: {
          slug: true,
          name: true,
          tags: {
            where: { isActive: true, deletedAt: null },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
            select: { slug: true, name: true, imageUrl: true },
          },
        },
      }),
      this.prisma.db.collection.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }],
        select: { slug: true, name: true, imageUrl: true },
      }),
    ]);

    const steps = groups
      .filter((g) => g.tags.length > 0)
      .map((g) => ({
        // the group's own name is a label, not a question — "Recipients" is not
        // something to ask a shopper, so the wizard keeps its own wording and
        // uses the group only for the options
        param: g.slug,
        title: g.name,
        options: g.tags.map((t) => ({ value: t.slug, label: t.name, imageUrl: t.imageUrl })),
      }));

    if (collections.length > 0) {
      steps.push({
        param: 'budget',
        title: 'Budget',
        options: collections.map((c) => ({ value: c.slug, label: c.name, imageUrl: c.imageUrl })),
      });
    }
    return steps;
  }

  /**
   * The delivery band — the mode tabs and the live countdown.
   *
   * ⚠️ THE COUNTDOWN WAS A TYPED STRING. "Order within 3 hrs 24 min" never
   * moved: it read the same at 9 AM and at 11 PM, and was wrong at both. The
   * component's own comment admitted it. `cutoffTime` has been sitting in the
   * admin since the Delivery module.
   *
   * Worked out here, in Bangladesh time, for the same reason as the shop's
   * "Open now" pill — a browser uses the visitor's clock, and the container
   * runs six hours behind Dhaka. Same `BD_OFFSET_MS`.
   */
  async deliveryModes(zone?: string) {
    const rows = await this.prisma.db.deliveryMethod.findMany({
      /*  `isFeatured` and not just `isActive` — 3 Aug 2026.

          These two lines answer different questions and were sharing one
          column. `isActive` decides whether a customer may CHOOSE this
          delivery at checkout. `isFeatured` decides whether the homepage
          BOASTS about it. Before this, taking "Schedule It" off the front page
          meant refusing scheduled orders entirely.

          ⚠️ `deliveryOptions()` below — the real checkout menu — deliberately
          does NOT filter on isFeatured. Un-advertising a service must never
          stop it being sold.  */
      /*  ⚠️ ALL THREE SPELLINGS. The enum says BANGLADESH, `_data/shop.ts`
          sends NATIONWIDE, and the browser's zone store says lower-case
          `bangladesh`. This line checked NATIONWIDE alone, so a visitor whose
          zone arrived any other way was shown DHAKA's delivery speeds — a
          nationwide shopper being promised 3-hour express. Same normalisation
          as `deliveryOptions()` below and `CheckoutService.normZone`.  */
      where: {
        isActive: true,
        isFeatured: true,
        zone: NATIONWIDE_ALIASES.has(String(zone ?? '').toUpperCase())
          ? 'BANGLADESH'
          : 'DHAKA',
      },
      orderBy: [{ sortOrder: 'asc' }],
      select: {
        id: true,
        label: true,
        etaLabel: true,
        cutoffTime: true,
        feePaisa: true,
        /*  DEC-DLV-008 — the SPEED PROMISE, so the storefront can write its own
            marketing line instead of carrying "2-Hour Delivery" in twenty
            files. Owner, 3 Aug 2026: *"আমরা এখন যা দেই এগুলা সব test purpose,
            আমি real কাজের time-এ সব customizable করতাসি যাতে change করা যায়।"*  */
        type: { select: { name: true, timing: true, promiseMinutes: true } },
      },
    });

    const now = new Date(Date.now() + 6 * 60 * 60 * 1000);
    const minutesNow = now.getUTCHours() * 60 + now.getUTCMinutes();

    return rows.map((m) => {
      const cut = parseHHMM(m.cutoffTime);
      /*  A mode with no cutoff has no countdown — nationwide courier is "1–3
          days", not "within 4 hours 12 minutes". Returning null here is what
          lets the storefront simply not draw the pill, rather than drawing an
          empty one.  */
      const left = cut === null ? null : cut - minutesNow;
      return {
        id: m.id,
        label: m.label,
        eta: m.etaLabel,
        feePaisa: m.feePaisa,
        /** minutes until today's cutoff. null = no cutoff. ≤0 = missed for today. */
        minutesLeft: left,
        /*  The type's own name and promise. The storefront builds every speed
            claim from these — "3-Hour Express", "within 3 hours" — so renaming
            the type or changing `promiseMinutes` in the admin rewrites the
            homepage, the category banners and the meta descriptions with it.  */
        typeName: m.type?.name ?? m.label,
        timing: m.type?.timing ?? null,
        promiseMinutes: m.type?.promiseMinutes ?? null,
      };
    });
  }

  /* ═════════════════════════════════════════════════════════════════════════
     CHECKOUT-এর পুরো delivery মেনু — DEC-DLV-009

     মালিক, ১ আগস্ট ২০২৬: *"delivery module-এ যা edit বা change করা হয়, তা
     যেন auto পুরা system-এ কাজ করে।"*

     ⚠️ `deliveryModes()` (উপরে) এটার জায়গা নেয় না। ওটা homepage-এর বিজ্ঞাপন
     — নাম আর কাউন্টডাউন। এটা checkout-এর মেনু: কোন delivery নেওয়া যাবে, কত
     টাকায়, কোন slot-এ, আর আজকের জন্য কখন দরজা বন্ধ। দুটো আলাদা প্রশ্ন, তাই
     আলাদা উত্তর — কিন্তু **একই টেবিল**।

     ⚠️ `areaId` না দিলে zone-এর সাধারণ দাম। দিলে "বেশি নির্দিষ্টতা জেতে"
     (DEC-DLV-009) — Dhanmondi-র ৳৮০, পুরো ঢাকার ৳১০০ নয়।
     ═════════════════════════════════════════════════════════════════════════ */
  async deliveryOptions(zone?: string, areaId?: string | null, itemsCsv?: string) {
    const zoneCode = NATIONWIDE_ALIASES.has(String(zone ?? '').toUpperCase())
      ? 'BANGLADESH'
      : 'DHAKA';

    /*  DEC-DLV-011 — cart-এর slug এলে সেই product-গুলোর টিক-দেওয়া
        DeliveryType-এর set আগে তুলে রাখা হয়; নিচে zone-এর তালিকা এই set
        দিয়ে ছাঁকা হবে। slug না এলে আগের zone-only আচরণ (PDP-র চিপ ইত্যাদি)। */
    const cartSlugs = (itemsCsv ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const typeSets = cartSlugs.length
      ? await cartTypeSets(this.prisma.db, cartSlugs)
      : [];

    const rows = await this.prisma.db.deliveryMethod.findMany({
      where: { isActive: true, zone: zoneCode },
      orderBy: [{ sortOrder: 'asc' }],
      select: {
        id: true, label: true, kind: true, feePaisa: true,
        etaLabel: true, cutoffTime: true, areaId: true, typeId: true,
        type: {
          select: {
            id: true, name: true, kind: true, sortOrder: true,
            timing: true, promiseMinutes: true,
            openFromMin: true, openToMin: true,
          },
        },
        slots: {
          where: { deletedAt: null, isActive: true },
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true, label: true, startMin: true, endMin: true,
            cutoffTime: true, capacityPerDay: true,
          },
        },
      },
    });

    /*  এক নামের একাধিক দাম থাকলে কোনটা খাটবে — একটাই function, যেটা
        Sales আর POS-ও পড়বে। */
    const chosen = ratesForArea(
      rows.map((r) => ({ ...r, typeId: r.typeId, areaId: r.areaId })),
      areaId ?? null,
    );

    const now = new Date(Date.now() + BD_OFFSET_MS);
    const minutesNow = now.getUTCHours() * 60 + now.getUTCMinutes();

    return [...chosen.values()]
      /*  DEC-DLV-011 — যে delivery পুরো cart বইতে পারে না, সে menu-তেই নেই।
          "multi product hole win hobe se method je method-এ sobgula product
          delivery possible" — মালিক, ৫ আগস্ট।  */
      .filter(
        (m) =>
          !typeSets.length ||
          methodOkForCart(m.type?.timing ?? null, m.typeId ?? m.type?.id ?? null, typeSets),
      )
      .sort((a, b) => (a.type?.sortOrder ?? 0) - (b.type?.sortOrder ?? 0))
      .map((m) => {
        const cut = parseHHMM(m.cutoffTime);
        const t = m.type;

        /*  ── আজ এই delivery নেওয়া যাবে কি না · DEC-DLV-010 ───────────────
            মালিক: *"২ ঘণ্টার delivery দোকান off/on পর্যন্ত কাজ করবে, তারও
            একটা সীমা থাকবে — like ১০টা থেকে ৯টা পর্যন্ত।"*

            ⚠️ Shop hours নয়, delivery-র নিজের জানালা। দোকান রাত ১২টা পর্যন্ত
            খোলা থাকতে পারে, কিন্তু রাত ১১টায় "২ ঘণ্টায়" মানে রাত ১টা — যে
            প্রতিশ্রুতি কেউ রাখতে পারবে না।  */
        const from = t?.openFromMin ?? null;
        const to = t?.openToMin ?? null;
        const beforeOpen = from !== null && minutesNow < from;
        const afterClose = to !== null && minutesNow >= to;

        return {
          /*  checkout এটা পড়েই ঠিক করে তারিখ চাইবে না slot চাইবে — নাম দেখে
              আন্দাজ করে নয়।  */
          timing: t?.timing ?? 'TODAY_SLOT',
          promiseMinutes: t?.promiseMinutes ?? null,
          openFromMin: from,
          openToMin: to,
          /** আজ এখন নেওয়া যাবে কি না, আর না গেলে কেন */
          closedNow: beforeOpen || afterClose,
          closedReason: beforeOpen
            ? 'Opens later today'
            : afterClose
              ? 'Closed for today'
              : null,
          /*  ⚠️ `typeId`, `id` নয়। Product যুক্ত থাকে নামের সাথে, দামের
              সারির সাথে নয় — checkout-কে মেলাতে হয় নাম দিয়ে।  */
          typeId: m.typeId,
          rateId: m.id,
          name: m.type?.name ?? m.label,
          kind: m.kind,
          feePaisa: m.feePaisa,
          eta: m.etaLabel,
          /** আজকের জন্য আর কত মিনিট। null = কোনো cut-off নেই। ≤0 = আজ শেষ। */
          minutesLeft: cut === null ? null : cut - minutesNow,
          slots: m.slots.map((sl) => {
            const slCut = parseHHMM(sl.cutoffTime);
            return {
              id: sl.id,
              label: sl.label,
              startMin: sl.startMin,
              endMin: sl.endMin,
              capacityPerDay: sl.capacityPerDay,
              /*  স্লটের নিজের ঘড়ি। না থাকলে স্লট শুরুর আগ পর্যন্ত —
                  পুরনো নিয়ম, আর সেটাই সবচেয়ে উদার।  */
              minutesLeft:
                slCut !== null
                  ? slCut - minutesNow
                  : sl.startMin != null
                    ? sl.startMin - minutesNow
                    : null,
            };
          }),
        };
      });
  }

  /** The trust strip. `zone: null` badges are true everywhere and always show. */
  trustBadges(zone?: string) {
    return this.prisma.db.trustBadge.findMany({
      where: {
        isActive: true,
        OR: [{ zone: null }, ...(zone ? [{ zone }] : [])],
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, icon: true, iconUrl: true, title: true, subtitle: true },
    });
  }
}

/** "20:00" → 1200. Anything unreadable is treated as no cutoff at all rather
 *  than as midnight, which would show a countdown that is always wrong.
 *
 *  Exported for `product-detail.ts`, which runs the same countdown on the
 *  product page. Copying eight lines would be two parsers for one format, and
 *  the day one of them starts accepting "8:00 PM" the two pages would disagree
 *  about when the shop closes. */
export function parseHHMM(v: string | null): number | null {
  if (!v) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** drop `placement` — the storefront already knows which list it asked for */
const strip = (g: { title: string; links: { label: string; href: string }[] }) => ({
  title: g.title,
  links: g.links,
});

@Controller('shop')
export class ShopController {
  constructor(
    private readonly svc: ShopService,
    private readonly layoutSvc: LayoutService,
  ) {}

  @Public()
  @Get('categories')
  categories() {
    return this.svc.categories();
  }

  @Public()
  @Get('banners')
  banners(@Query('zone') zone?: string) {
    return this.svc.banners(zone);
  }

  @Public()
  @Get('trust-badges')
  trustBadges(@Query('zone') zone?: string) {
    return this.svc.trustBadges(zone);
  }

  @Public()
  @Get('section-text')
  sectionText(@Query('zone') zone?: string) {
    return this.svc.sectionText(zone);
  }

  @Public()
  @Get('collections')
  collections(@Query('zone') zone?: string) {
    return this.svc.collections(zone);
  }

  @Public()
  @Get('tag-groups')
  tagGroups() {
    return this.svc.tagGroups();
  }

  @Public()
  @Get('brand')
  brand() {
    return this.svc.brand();
  }

  @Public()
  @Get('gift-finder')
  giftFinder() {
    return this.svc.giftFinder();
  }

  @Public()
  @Get('google-rating')
  googleRating() {
    return this.svc.googleRating();
  }

  @Public()
  @Get('delivery-modes')
  deliveryModes(@Query('zone') zone?: string) {
    return this.svc.deliveryModes(zone);
  }

  @Public()
  @Get('delivery-options')
  deliveryOptions(
    @Query('zone') zone?: string,
    @Query('areaId') areaId?: string,
    /*  DEC-DLV-011 — cart-এর slug, comma-separated। দিলে menu-তে শুধু সেই
        delivery আসে যেটা cart-এর সব product-এ চলে।  */
    @Query('items') items?: string,
  ) {
    return this.svc.deliveryOptions(zone, areaId || null, items);
  }

  @Public()
  @Get('shop-card')
  shopCard() {
    return this.svc.shopCard();
  }

  @Public()
  @Get('footer')
  footer() {
    return this.svc.footer();
  }

  @Public()
  @Get('reviews')
  reviews() {
    return this.svc.reviews();
  }

  /** DEC-WEB-005 — the /reviews page: every published review */
  @Public()
  @Get('reviews/all')
  allReviews() {
    return this.svc.allReviews();
  }

  /** the section keys to render, in order, for this zone */
  @Public()
  @Get('layout')
  layout(@Query('zone') zone?: string) {
    return this.layoutSvc.forStorefront('home', zone);
  }
}

@Module({
  imports: [HoursModule, LayoutModule],
  providers: [ShopService],
  controllers: [ShopController],
})
export class ShopModule {}
