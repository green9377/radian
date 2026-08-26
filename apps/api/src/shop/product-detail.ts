import {
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../auth/auth.guard';
import { parseHHMM } from './shop';
import { ShopCatalogModule, ShopCatalogService, type ShopProduct } from './catalog';
/*  DEC-PDP-09 — kept in `common/` because Sales enforces the same rule at the
    order endpoint. Two copies of "is it buyable" is how a page ends up saying
    "Out of stock" above a button that still takes money. */
import { availabilityOf, type Availability } from '../common/availability';
import { paidPaisa, discountEndsMs, discountStartsMs } from '../common/discount-window';
import { bareImageUrl } from '../common/image-url';
/*  DEC-PRD-050 — one rule for "is this new", shared with grid and admin.  */
import { isNewNow, MERCH_DEFAULTS } from '../products/merch';

/*
  ═══════════════════════════════════════════════════════════════════════════
  Public product-detail read API — `GET /shop/products/:slug`

  WHY A SEPARATE FILE FROM `shop.ts`, 31 Jul 2026.

  Two things are being connected in the same week: the category page (the
  product LIST) and this, the product page (one product, everything about it).
  Both live under `/shop`. Nest is happy with two controllers on one prefix, and
  two files means two people are not editing the same 700 lines at once.

  The rules of `shop.ts` apply here unchanged, and one of them matters more on
  this route than anywhere else in the API:

  ⚠️ EVERY FIELD IS NAMED. `costPaisa` is on this table. A single `include:
     { product: true }` publishes what the shop pays for its own flowers to
     anyone who opens a network tab. There is no `select: { ...rest }` in this
     file and there must never be one.

  Also deliberately absent: `stockQty` unless the owner ticked `showStock`.

  ── SKU: A CORRECTION FROM THE OWNER, 1 Aug 2026 ───────────────────────────
  This file used to say `sku` was "staff-facing, never sent to the website".
  Too absolute, and he caught it: the moment product data is published as DATA
  rather than as words — a Merchant Center feed, `Product` JSON-LD for Google,
  `item_id` in the analytics data layer — the SKU is the identifier every one
  of those expects. Without it the same bouquet is a different product to
  Google every time its name is edited.

  So the rule is not "never leaves". It is:

      SKU may appear in MACHINE-READABLE data.
      SKU is never RENDERED as visible text on a page.

  It stays out of THIS payload because this payload draws a page. When the
  feed and the JSON-LD are built they get their own surface, and it is named
  there. `costPaisa` has no such exception — that one really is never.

  WHAT IS NOT HERE YET, and why — see `RADIAN_PRODUCT_PAGE_AUDIT.md` §1:
    personalisation           - half of it belongs to OrderLine (§3a, deferred
                                with the Ecommerce lock)
  The storefront keeps rendering its own copy for those three until they are
  decided. They are not silently dropped; they are just not coming from here.
  ═══════════════════════════════════════════════════════════════════════════
*/

/*
  ── THE PRICE RULE, WRITTEN ONCE ───────────────────────────────────────────

  Exported because the category grid needs the identical answer. A shopper who
  sees ৳1,240 on the grid and ৳1,290 on the product page does not conclude that
  one of two code paths rounds differently — they conclude the shop moves its
  prices while they are looking at them, and they leave.

  ⚠️ PERCENT is stored in BASIS POINTS (1000 = 10%), not as a float. Dividing by
  100 instead of 10000 is the mistake this comment exists to prevent; it turns
  a 10% discount into a 1000% one and prices everything at zero.
*/
/*
  The arithmetic now lives in `common/discount-window.ts`, in one place. Only
  the old name is re-exported here, because a dozen call sites in this file use
  it and renaming every one of them means missing one.

  Why it moved: the grid called `offerPaisa()` and the page called
  `paidPaisa()` - so the day the date rules were added, the discount stopped on
  the page and carried on running on the grid.
*/
export { paidPaisa };

/**
 * The struck-through price, or null.
 *
 * ⚠️ THIS REPLACES AN INVENTED NUMBER. The storefront has been computing
 * `price ÷ 0.81` in the browser and printing "19% OFF" on all 71 products —
 * on every product, whether or not anything was ever discounted. That is a
 * fabricated saving shown to every visitor.
 *
 * Null when nothing is off, so the page can simply not draw the line rather
 * than draw a strike-through equal to the price.
 */
/**
 * DEC-PRD-042 — what the shop needs to talk about the offer, or null.
 *
 * Deliberately returns null unless a discount is REALLY reducing the price
 * right now: a window on a product with no discount is not an offer, and an
 * expired one must not leave a countdown behind.
 */
export function offerOrNull(p: {
  sellingPricePaisa: number;
  discountType: 'NONE' | 'FLAT' | 'PERCENT';
  discountValue: number;
  discountStartsAt?: Date | null;
  discountEndsAt?: Date | null;
}): ShopOfferWindow | null {
  const paid = paidPaisa(p);
  if (paid >= p.sellingPricePaisa || p.sellingPricePaisa <= 0) return null;
  return {
    endsAtMs: discountEndsMs(p),
    startsAtMs: discountStartsMs(p),
    percentOff: Math.round(((p.sellingPricePaisa - paid) / p.sellingPricePaisa) * 100),
  };
}

export function mrpOrNull(p: {
  sellingPricePaisa: number;
  discountType: 'NONE' | 'FLAT' | 'PERCENT';
  discountValue: number;
  /*  DEC-PRD-028 - the struck-through price expires with the window too.
      Otherwise the strike and "20% OFF" would sit on the page after the offer
      ended, while the price charged was the full one.  */
  discountStartsAt?: Date | null;
  discountEndsAt?: Date | null;
}): number | null {
  const paid = paidPaisa(p);
  return paid < p.sellingPricePaisa ? p.sellingPricePaisa : null;
}

/*
  The badge beside an offer line.

  Kept here rather than made admin-editable: these are other companies' marks,
  and bKash's pink is bKash's, not a colour anyone at Radian should be choosing.
  An offer on a payment method we have no badge for falls back to the shop's own
  purple, which is honest — it is Radian's offer.
*/
const BRAND: Record<string, { logo: string; color: string }> = {
  bkash: { logo: 'bKash', color: '#E2136E' },
  nagad: { logo: 'Nagad', color: '#F5811F' },
  card: { logo: 'Card', color: '#1A1F71' },
  cod: { logo: 'COD', color: '#0E7A3D' },
  FREE_DELIVERY: { logo: '🚚', color: '#CF43EA' },
  FIRST_ORDER: { logo: 'NEW', color: '#B76E79' },
  default: { logo: 'RAD', color: '#470066' },
};

/** Live to a shopper. Drafts and soft-deleted rows never leave this file. */
const LIVE = { deletedAt: null, isPublished: true } as const;

/**
 * The price a shopper actually SEES for a product — DEC-PRD-035.
 *
 * When every live variant carries its own price, the headline is the cheapest
 * of them and the page says "from". Otherwise the product's own price stands.
 *
 * ⚠️ Exists because "You may also like" ranked on the price COLUMN while the
 * card printed the cheapest variant, so a bouquet whose card reads "from
 * ৳1,200" was being sorted as a ৳3,500 one. Any rule that compares prices
 * across products has to compare the numbers on the cards.
 */
function cardPricePaisa(p: {
  sellingPricePaisa: number;
  discountType: string;
  discountValue: number;
  discountStartsAt?: Date | null;
  discountEndsAt?: Date | null;
  variants: { pricePaisa: number | null; discountType: string; discountValue: number }[];
}): number {
  const own = paidPaisa({
    sellingPricePaisa: p.sellingPricePaisa,
    discountType: p.discountType as 'NONE' | 'FLAT' | 'PERCENT',
    discountValue: p.discountValue,
    discountStartsAt: p.discountStartsAt,
    discountEndsAt: p.discountEndsAt,
  });
  const priced = p.variants.filter((v) => v.pricePaisa !== null);
  if (p.variants.length === 0 || priced.length !== p.variants.length) return own;
  return Math.min(
    ...priced.map((v) =>
      paidPaisa({
        sellingPricePaisa: v.pricePaisa!,
        discountType: v.discountType as 'NONE' | 'FLAT' | 'PERCENT',
        discountValue: v.discountValue,
      }),
    ),
  );
}
/** child rows: the soft-delete extension does NOT reach nested relations */
const LIVE_ROW = { deletedAt: null } as const;

/*  DEC-PRD-017 - everything worth knowing about one thing inside a bundle.
    Written once, read from two places (the old single column and the new
    `items`), so the two paths can never say different things.  */
/**
 * DEC-PRD-023 - the first list that has anything in it is the whole answer.
 *
 * Lists are never merged. Showing the product's "24 sticks" together with the
 * category's "12 sticks" would have the page disagreeing with itself. Bundles
 * and craft points work exactly the same way - this page needs ONE idea of
 * inheritance, not several.
 */
function pickList<T>(...lists: (readonly T[] | undefined)[]): T[] {
  for (const l of lists) if (l && l.length > 0) return [...l];
  return [];
}

/**
 * DEC-PRD-046 — ONE named list out of the several a category may hold.
 *
 * The owner asked for four or five "What's inside" lists per category (a rose
 * bouquet, a mixed one, a basket). A product that has written none of its own
 * still shows the category's, and "the category's" has to mean exactly one of
 * them or the page prints two contents tables joined end to end.
 *
 * The first one — the category's own order — is that one. Any other choice is
 * the product's to make, and making it copies the rows onto the product.
 */
function firstList<T extends { templateId: string | null }>(rows: readonly T[] | undefined): T[] {
  if (!rows || rows.length === 0) return [];
  const first = rows[0].templateId;
  return rows.filter((r) => r.templateId === first);
}

const BUNDLE_ADDS = {
  /*  The id is required - what was taken travels to the cart as this id, never
      as a name. Renaming a product would otherwise snap the cart line.  */
  id: true,
  name: true,
  sellingPricePaisa: true,
  discountType: true,
  discountValue: true,
  /*  DEC-PRD-028 - the discount window, or an expired discount's price would
      sit on the bundle card forever.  */
  discountStartsAt: true,
  discountEndsAt: true,
  isPublished: true,
  deletedAt: true,
  stockMode: true,
  stockQty: true,
  /*  DEC-PRD-014 - the stock may live on the variants. Without fetching this,
      the card counted itself "out of stock" and hid, with ten red roses in
      the shop.  */
  variants: { where: { deletedAt: null, isActive: true }, select: { stockQty: true } },
  images: {
    where: { deletedAt: null },
    orderBy: { sortOrder: 'asc' as const },
    take: 1,
    select: { url: true },
  },
  /*
    There used to be an `as const` here, and it was what stopped the API
    compiling (3 August 2026). `as const` makes the inner arrays `readonly`,
    and Prisma's `orderBy` wants a MUTABLE array - so seven type errors, while
    the API carried on quietly serving the previous build.

    The lesson, written down: after running `radian_apply.bat`, everything
    looking unchanged does NOT mean the new code is running - when the build
    breaks, the old one keeps running. Reading `_api_log.txt` is the only way
    to be sure.
  */
};

/**
 * DEC-PRD-042 — the offer window, sent to the shop.
 *
 * Owner, 10 Aug 2026: the start and end he sets *"just admin a thake, amder
 * frontend a show kre na"*. Quite right — the dates gated the price and then
 * stayed behind the counter, so a shopper could not tell whether the number
 * in front of them was ending tonight or standing all month.
 *
 * `endsAtMs` is an absolute instant, not a formatted string: the page draws a
 * calm date most of the time and a live countdown in the final hours, and both
 * need arithmetic, not prose. `null` means no end — nothing is drawn.
 */
export interface ShopOfferWindow {
  endsAtMs: number | null;
  startsAtMs: number | null;
  /** whole percent off, for the badge — computed, never stored */
  percentOff: number;
}

export interface ShopProductDetail {
  slug: string;
  name: string;
  shortDesc: string | null;
  typeText: string | null;
  /** what they pay today — integer paisa */
  pricePaisa: number;
  /** DEC-PRD-042 — null when nothing is discounted right now */
  offer: ShopOfferWindow | null;
  /**
   * "stick", "kg" — printed after the price as "৳2,400 / stick".
   *
   * ⚠️ Owner, 1 Aug 2026: "is there a place to show this on the site, and if
   * it is only for us, why is it not connected?" He was right on both counts.
   * `Unit.shortCode`'s own schema comment has said *"storefront suffix +
   * packing slip"* since the Item module was written — the storefront half was
   * simply never built. Null when he has not set one, and most products will
   * not: a bouquet priced "per piece" is noise, a rose priced "per stick" is
   * the whole point.
   */
  unitSuffix: string | null;
  /** struck-through price, or null when nothing is actually off */
  mrpPaisa: number | null;
  zone: 'dhaka' | 'both';
  productType: 'READYMADE' | 'CRAFTED';
  /** DEC-PRD-035 — `pricePaisa` is the cheapest variant, not a fixed price */
  priceFrom?: boolean;
  nature: { type: 'fresh' | 'artificial'; label: string | null };
  /** COD is refused on this product — a made-to-order thing already engraved */
  prepaidOnly: boolean;
  /** DEC-PRD-050 — earned, never typed. See the payload for where it draws. */
  bestSeller: boolean;
  /** the category it is a best seller IN — "Best seller in Fresh Flowers" */
  bestSellerIn: string | null;
  newArrival: boolean;
  leadTimeDays: number | null;
  supportsExpress: boolean;
  supportsSameDay: boolean;
  supportsMidnight: boolean;
  /** the honest line for a shopper outside Dhaka looking at a Dhaka-only item */
  nationwideMsg: string | null;
  /** null unless the owner ticked "show stock on the site" */
  stockQty: number | null;
  /** DEC-PDP-09 — may they buy it, and in what words. Never null: the page
   *  must never have to guess, and "we did not send it" would read as yes. */
  availability: Availability;
  videoId: string | null;
  /** uploaded photos, in the owner's order. May be empty — the page draws its
   *  gradient placeholder, which is still a launch dependency. */
  images: string[];
  crumb: {
    catLabel: string;
    catSlug: string;
    subLabel: string | null;
    subSlug: string | null;
  };
  colour: { label: string; swatch: string | null; imageUrl: string | null } | null;
  variant: {
    kind: 'colour' | 'flavour';
    label: string;
    options: { slug: string; label: string; swatch: string | null; imageUrl: string | null; active: boolean }[];
  } | null;
  /**
   * DEC-PRD-012 - this product's colours, flavours and sizes, all on one page.
   *
   * This does not replace `variant` above - that belongs to the old design,
   * where each colour was a separate product and a swatch took you to another
   * page. The screen that tied that design together was never built, so
   * `variant` is in practice always `null`. This is the real answer now.
   *
   * An empty array means this product has no variants, and then that section
   * does not appear on the page at all - the owner's rule.
   */
  variants: {
    id: string;
    label: string;
    /** Which master list the value came from - "Colour" / "Flavour". Used as
     *  the heading. */
    attribute: string;
    /** What the master says to render - SWATCH | PHOTO | TEXT */
    displayMode: string;
    swatch: string | null;
    /** This variant's own photo, else the master's, else null */
    imageUrl: string | null;
    /** What the customer pays - the offer, else its own price, else the
     *  product's */
    pricePaisa: number;
    /** DEC-PRD-032 - the struck-through price while an offer runs (the
     *  variant's regular price), else null */
    wasPaisa: number | null;
    /** Its own stock. 0 means this colour is gone while the others sell on.
     *  On a variant tied to an Item this is Inventory's live count. */
    stockQty: number;
  }[];
  sizes: { id: string; label: string; sub: string | null; pricePaisa: number }[];
  /** the heading above the size chooser — "Bouquet Size", "Cake Weight" */
  sizeLabel: string;
  /** the three "why buy from us" cards. Product's own, else its category's. */
  craft: { icon: string; title: string; text: string }[];
  /** DEC-WEB-011 — the heading over the promise band. `null` = the shop wrote
   *  none, and then the band shows its cards with no heading at all. */
  craftTitle: string | null;
  /** DEC-WEB-011 — the small line above that heading. `null` = none drawn. */
  craftKicker: string | null;
  /**
   * Minutes until today's order cut-off, per zone. Null = no cut-off there.
   *
   * BOTH ZONES, because the storefront picks. The visitor's zone lives in a
   * browser store, not in this request, and returning one number would make
   * the countdown silently wrong for half the shop.
   */
  cutoffMinutesLeft: { dhaka: number | null; nationwide: number | null };
  /**
   * The "Offers Available" strip. DISPLAY ONLY — see the note on `offers()`.
   * `code` is set for a coupon, `note` for one that applies by itself.
   */
  offers: { key: string; logo: string; color: string; text: string; code: string | null; note: string | null }[];
  /** DEC-PRD-052 — the reassurance line under Buy Now, set in Setup -> Website
   *  look (StorefrontSetting). Null = the storefront's built-in wording. */
  underBuyText: string | null;
  underBuyPreorderText: string | null;
  /** DEC-PRD-054 — the "How it arrives" photos, shop-wide; empty = no strip */
  journey: string[];
  /**
   * "214 orders this month" — real, or null.
   *
   * Null below a floor rather than a small true number: "3 orders this month"
   * under a product is an argument against buying it.
   */
  ordersThisMonth: number | null;
  /**
   * DEC-PRD-025 - which window the number above covers. The page writes the
   * wording, because words are the page's job; but WHICH WINDOW is the
   * owner's decision.
   *
   * Without sending this the page kept writing "this month" even when the
   * owner had chosen "Today". A number in one place and a hand-written word
   * in another is exactly how a lie gets born.
   */
  salesWindow: 'TODAY' | 'WEEK' | 'MONTH' | 'ALL';
  /**
   * "Pairs beautifully with" — full cards, not slugs.
   *
   * Slugs would mean the storefront looking each one up somewhere, and the only
   * place it could look is the mock catalogue. Cards come from the same builder
   * the category grid uses, so a product looks identical wherever it appears.
   */
  crossSell: ShopProduct[];
  /**
   * DEC-PRD-018 - one product means one bundle list and one discount.
   *
   * The owner, 2 August 2026:
   * > *"taking just the main product gets no discount; the discount comes as
   * >  soon as an extra product is selected from a bundle."*
   *
   * A list, not a package. The customer takes whichever they want and skips
   * the rest - and taking even one applies the discount, against the total
   * including the main product.
   *
   * The final price is NOT sent from here, only the raw numbers. The discount
   * depends on WHAT THE CUSTOMER SELECTED, which is not known at this point.
   * The arithmetic lives in one place: `_data/bundlePricing.ts`.
   */
  bundle: {
    discountType: 'NONE' | 'FLAT' | 'PERCENT';
    /** FLAT = paisa · PERCENT = basis points (1000 = 10%) */
    discountValue: number;
    items: {
      /** The added product's id - this is what travels to the cart */
      id: string;
      name: string;
      imageUrl: string | null;
      /** Its price today, with its own discount already applied */
      pricePaisa: number;
    }[];
  } | null;
  /**
   * DEC-PRD-020 - the larger versions of this, each a separate product in its
   * own right.
   *
   * The owner, 2 August 2026: *"clicking an upgrade product should change the
   * price, but it must not take me to another page."*
   *
   * The field had been in the schema since 26 July and was selectable in the
   * admin, but the storefront never read it - meaning whatever the owner chose
   * appeared nowhere. This is the same mistake the variant swatches made: the
   * table existed, the admin existed, the screen did not.
   *
   * Each upgrade is A REAL PRODUCT - its own price, its own stock, its own
   * page. So selecting one sends ITS `slug` to the cart. The page does not
   * change; only the price and the photo do - the owner's explicit
   * instruction.
   */
  upgrades: {
    slug: string;
    name: string;
    imageUrl: string | null;
    /** What the customer pays - with its own discount applied */
    pricePaisa: number;
  }[];
  /**
   * DEC-PRD-026 - whether the customer may supply their own text or image.
   * `null` means there is nothing to supply on this product, and the section
   * is not drawn on the page at all.
   *
   * Until 2 August 2026 the storefront seam had a literal `perso: null`, so
   * this NEVER arrived on any product.
   */
  perso: {
    title: string;
    text: { label: string; max: number | null; hint: string; required: boolean } | null;
    image: { label: string; hint: string; required: boolean } | null;
  } | null;
  /**
   * DEC-PRD-027 - the green "Want this customised?" box. `null` means do not
   * show it.
   *
   * The number comes from Company settings' `publicPhone`. The page used to
   * carry `wa.me/8801000000000` - an invented number.
   */
  customise: { title: string; sub: string; whatsapp: string | null } | null;
  spec: { item: string; qty: string }[];
  /** this product's own questions first, then the category's */
  faqs: { question: string; answer: string; scope: 'product' | 'category' }[];
  /**
   * DEC-PRD-023 - the product's own, else the category's, else the parent's.
   * When `iconUrl` is filled that is what gets drawn, and `icon` stays empty.
   */
  trust: { icon: string | null; iconUrl?: string | null; label: string; sub: string | null }[];
  addonTabs: {
    id: string;
    label: string;
    items: {
      id: string;
      name: string;
      pricePaisa: number;
      /** DEC-PRD-049 — given away on purpose, so the card says "Free" */
      isFree: boolean;
      imageUrl: string | null;
    }[];
  }[];
  /** published reviews of THIS product, with the list itself (DEC-WEB-005). `rating` is null until one exists —
   *  never a shop-wide or Google average wearing a product's name. */
  reviews: {
    rating: number | null;
    count: number;
    /** index 0 → 1★ … index 4 → 5★ */
    byStar: number[];
    items: {
      id: string;
      authorName: string;
      rating: number;
      body: string;
      context: string | null;
      imageUrl: string | null;
      verifiedPurchase: boolean;
      /** DEC-WEB-007 — the shop's own words under theirs */
      replyText: string | null;
      replyAt: Date | null;
      createdAt: Date;
    }[];
  };
  seo: {
    title: string | null;
    description: string | null;
    ogTitle: string | null;
    ogDescription: string | null;
    ogImageUrl: string | null;
    noIndex: boolean;
  };
}

@Injectable()
export class ProductDetailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: ShopCatalogService,
  ) {}

  /*  DEC-PRD-050 — the one setting this page needs, read at most once a
      minute. Same cache as the grid keeps, for the same reason.  */
  private newDays = MERCH_DEFAULTS.newArrivalDays;
  private newDaysAt = 0;

  private async newArrivalDays(): Promise<number> {
    if (Date.now() - this.newDaysAt < 60_000) return this.newDays;
    this.newDaysAt = Date.now();
    try {
      const row = await this.prisma.db.merchSetting.findUnique({ where: { id: 'singleton' } });
      if (row) this.newDays = row.newArrivalDays;
    } catch {
      /*  No settings row yet — the default stands rather than the product
          page failing to render.  */
    }
    return this.newDays;
  }

  async detail(slug: string): Promise<ShopProductDetail> {
    const p = await this.prisma.db.product.findFirst({
      where: { slug, ...LIVE },
      select: {
        id: true, // internal only — never returned
        slug: true,
        name: true,
        shortDesc: true,
        typeText: true,
        sellingPricePaisa: true,
        discountType: true,
        discountValue: true,
        discountStartsAt: true,
        discountEndsAt: true,
        zone: true,
        productType: true,
        natureType: true,
        natureLabel: true,
        advanceRequired: true,
        leadTimeDays: true,
        supportsExpress: true,
        supportsSameDay: true,
        supportsMidnight: true,
        nationwideMsg: true,
        showStock: true,
        /*  DEC-PRD-050 — the two badges. They worked on the category grid and
            never reached this page, so a bouquet the shop calls a best seller
            in the listing said nothing about it once you opened it.  */
        isBestSeller: true,
        newArrivalMode: true,
        publishedAt: true,
        createdAt: true,
        /*  DEC-PRD-025/026/027 - the sales figure, personalisation and
            "Want this customised?" are all decisions the product makes for
            itself.  */
        salesSeedToday: true,
        salesSeedWeek: true,
        salesSeedMonth: true,
        salesSeedAll: true,
        salesSeedAt: true,
        salesWindow: true,
        persoTitle: true,
        persoText: true,
        persoTextLabel: true,
        persoTextRequired: true,
        persoTextMax: true,
        persoTextHint: true,
        persoImage: true,
        persoImageLabel: true,
        persoImageHint: true,
        persoImageRequired: true,
        customiseOn: true,
        customiseTitle: true,
        customiseSub: true,
        stockQty: true,
        displayQty: true,
        stockMode: true,
        soldOutMode: true,
        preorderDate: true,
        /*  ⚠️ ONLY for `availabilityOf` — a vendor's identity is not shoppers'
            business and is never put in the response body. */
        supplierId: true,
        videoId: true,
        metaTitle: true,
        metaDescription: true,
        ogTitle: true,
        ogDescription: true,
        ogImageUrl: true,
        noIndex: true,
        unit: { select: { shortCode: true } },
        // costPaisa: deliberately absent. See the header.
        category: {
          select: {
            id: true,
            slug: true,
            name: true,
            sizeLabel: true,
            craftTitle: true,
            craftKicker: true,
            /*  the parent's heading is the fallback: "Roses" inherits "Bouquet
                Size" from Fresh Flowers rather than making the owner type it
                again on all forty-four sub-categories  */
            parent: {
              select: {
                id: true,
                slug: true,
                name: true,
                sizeLabel: true,
                craftTitle: true,
                craftKicker: true,
                /*  DEC-PRD-023 - when a sub-category has none, the parent's are
                    used. The same ladder craft points climb:
                    product -> category -> parent.  */
                trustBadges: {
                  where: { deletedAt: null, isActive: true },
                  orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
                  select: { icon: true, iconUrl: true, label: true, sub: true },
                },
                /*  DEC-PRD-046 — a category holds SEVERAL named lists now,
                    so the rows of all of them arrive together and
                    `firstList()` keeps only the first one's. Concatenating
                    them would print a rose bouquet and a gift basket in one
                    table.  */
                specRows: {
                  where: {
                    deletedAt: null,
                    isActive: true,
                    template: { is: { deletedAt: null, isActive: true } },
                  },
                  orderBy: [
                    { template: { sortOrder: 'asc' as const } },
                    { sortOrder: 'asc' as const },
                    { createdAt: 'asc' as const },
                  ],
                  select: { item: true, qty: true, templateId: true },
                },
              },
            },
            /*  DEC-PRD-023 - the badges and "What's inside" written on this
                category. These are used when the product has none of its
                own.  */
            trustBadges: {
              where: { deletedAt: null, isActive: true },
              orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
              select: { icon: true, iconUrl: true, label: true, sub: true },
            },
            /*  DEC-PRD-046 — see the note on the parent's copy above.  */
            specRows: {
              where: {
                deletedAt: null,
                isActive: true,
                template: { is: { deletedAt: null, isActive: true } },
              },
              orderBy: [
                { template: { sortOrder: 'asc' as const } },
                { sortOrder: 'asc' as const },
                { createdAt: 'asc' as const },
              ],
              select: { item: true, qty: true, templateId: true },
            },
          },
        },
        tags: { where: { isActive: true }, select: { slug: true } },
        images: {
          where: LIVE_ROW,
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          select: { url: true },
        },
        sizes: {
          where: LIVE_ROW,
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          select: { id: true, label: true, sub: true, pricePaisa: true },
        },
        /*  DEC-PRD-012 - this product's colours, flavours and sizes. A
            deactivated variant is never sent: the owner switching it off means
            the customer does not see it at all.  */
        variants: {
          where: { ...LIVE_ROW, isActive: true },
          orderBy: [{ sortOrder: 'asc' }],
          select: {
            id: true,
            imageUrl: true,
            stockQty: true,
            pricePaisa: true,
            discountType: true,
            discountValue: true,
            itemId: true,
            variantValue: {
              select: {
                label: true,
                swatch: true,
                imageUrl: true,
                attribute: { select: { name: true, displayMode: true } },
              },
            },
            /*  DEC-PRD-045 — every value this row is made of, so the page can
                draw one row of buttons per list instead of one flat row that
                reads as "Medium or Red".  */
            values: {
              select: {
                variantValue: {
                  select: {
                    id: true,
                    label: true,
                    swatch: true,
                    imageUrl: true,
                    sortOrder: true,
                    attribute: { select: { id: true, name: true, displayMode: true, sortOrder: true } },
                  },
                },
              },
            },
          },
        },
        specRows: {
          where: LIVE_ROW,
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          select: { item: true, qty: true },
        },
        faqs: {
          where: LIVE_ROW,
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          select: { question: true, answer: true },
        },
        trustBadges: {
          where: LIVE_ROW,
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          /*  DEC-PRD-023 - an uploaded icon comes through too.  */
          select: { icon: true, iconUrl: true, label: true, sub: true },
        },
        variantValue: { select: { label: true, swatch: true, imageUrl: true } },
        variantGroup: {
          select: {
            kind: true,
            label: true,
            products: {
              where: LIVE,
              orderBy: [{ name: 'asc' }],
              select: {
                slug: true,
                name: true,
                variantLabel: true, // DEPRECATED fallback — see below
                variantSwatch: true,
                variantValue: { select: { label: true, swatch: true, imageUrl: true } },
              },
            },
          },
        },
        manualAddOnGroups: {
          where: LIVE_ROW,
          orderBy: [{ sortOrder: 'asc' }],
          select: { id: true },
        },
      },
    });

    if (!p) throw new NotFoundException('product not found');

    /*
      Everything below is a second round trip on purpose. Folding the review
      aggregate, the category FAQ, the add-on rules and the cross-sell list into
      the query above would mean four joins against one product row; run in
      parallel they cost one round trip between them.
    */
    const tagSlugs = p.tags.map((t) => t.slug);
    const [
      rating,
      catFaqs,
      bundle,
      upgrades,
      /*  DEC-PRD-027 - the WhatsApp number comes from here; there is no sense
          keeping two numbers in two places.  */
      company,
      craft,
      cutoffMinutesLeft,
      offers,
      ordersThisMonth,
      addonTabs,
      crossSell,
      storefront,
    ] = await Promise.all([
      this.rating(p.id),
      this.categoryFaqs(p.category.id, p.category.parent?.id ?? null),
      this.bundles(p.id, p.category.id, p.category.parent?.id ?? null),
      this.upgrades(p.id),
      this.prisma.db.companySetting.findFirst({ select: { publicPhone: true } }),
      this.craft(p.id, p.category.id, p.category.parent?.id ?? null),
      this.cutoffs(),
      this.offers(p.id, p.category.id, p.category.parent?.id ?? null),
      /*  The chosen window's OWN box - the owner's rule: one number for
          today, a different one for the month.  */
      this.salesSignal(
        p.id,
        p.salesWindow === 'TODAY'
          ? p.salesSeedToday
          : p.salesWindow === 'WEEK'
            ? p.salesSeedWeek
            : p.salesWindow === 'ALL'
              ? p.salesSeedAll
              : p.salesSeedMonth,
        p.salesWindow,
        p.salesSeedAt,
      ),
      this.addonTabs({
        productId: p.id,
        categoryName: p.category.name,
        zone: p.zone,
        productType: p.productType,
        pricePaisa: paidPaisa({
          sellingPricePaisa: p.sellingPricePaisa,
          discountType: p.discountType as 'NONE' | 'FLAT' | 'PERCENT',
          discountValue: p.discountValue,
          discountStartsAt: p.discountStartsAt,
          discountEndsAt: p.discountEndsAt,
        }),
        tagSlugs,
        manualGroupIds: p.manualAddOnGroups.map((g) => g.id),
      }),
      /*  DEC-PRD-051 — same category, nearest price. The reference is the
          HEADLINE this page will print (DEC-PRD-035), not the price column,
          so the rail is compared against the number the shopper is looking
          at while they look at it.  */
      this.crossSell(p.id, p.category.id, p.category.parent?.id ?? null, tagSlugs, cardPricePaisa(p)),
      /*  DEC-PRD-052 — the line under Buy Now, one row for the whole shop.
          Cast because a stale generated client predates the columns.  */
      this.prisma.db.storefrontSetting.findFirst({
        where: { id: 'singleton' },
        select: { ...({ pdpUnderBuyText: true, pdpUnderBuyPreorderText: true, pdpJourneyImg1: true, pdpJourneyImg2: true, pdpJourneyImg3: true } as object) },
      }) as Promise<{ pdpUnderBuyText?: string | null; pdpUnderBuyPreorderText?: string | null; pdpJourneyImg1?: string | null; pdpJourneyImg2?: string | null; pdpJourneyImg3?: string | null } | null>,
    ]);

    /*
      DEC-PRD-028 - both dates MUST be selected here. On 3 August these two
      lines were missed, so a discount that had ended the day before was still
      sitting on the product page: the admin showed ৳2,400 while the shop
      charged ৳2,160. `paidPaisa()` runs the gate, but it cannot run it on
      something it was never given.
    */
    const money = {
      sellingPricePaisa: p.sellingPricePaisa,
      discountType: p.discountType as 'NONE' | 'FLAT' | 'PERCENT',
      discountValue: p.discountValue,
      discountStartsAt: p.discountStartsAt,
      discountEndsAt: p.discountEndsAt,
    };

    /*
      A sub-category is a category with a parent. The breadcrumb wants the top
      of the tree first, so when this product sits under "Roses" the crumb reads
      Home › Fresh Flowers › Roses, and when it sits directly under "Fresh
      Flowers" the middle rung simply is not there.
    */
    const parent = p.category.parent;

    /*  DEC-PRD-032 — a variant linked to a stockroom Item counts from
        Inventory LIVE, not from its hand-typed box. One query for all
        linked items; milli-units floor to whole pieces.  */
    const linkedIds = [...new Set(p.variants.flatMap((v) => (v.itemId ? [v.itemId] : [])))];
    const invSums = linkedIds.length
      ? await this.prisma.db.inventoryStock.groupBy({
          by: ['itemId'],
          where: { itemId: { in: linkedIds } },
          _sum: { qtyMilli: true },
        })
      : [];
    const invQty = new Map(
      invSums.map((r) => [r.itemId, Math.max(0, Math.floor((r._sum.qtyMilli ?? 0) / 1000))]),
    );
    const variantCount = (v: { itemId: string | null; stockQty: number }) =>
      v.itemId ? (invQty.get(v.itemId) ?? 0) : v.stockQty;

    /*  DEC-PDP-09 / DEC-PRD-014 — computed BEFORE the payload because the
        published stock number below must never contradict it. Owner caught
        the page saying "20 in stock" and "Out of stock" in one breath
        (8 Aug 2026): displayQty is a selling line, and a selling line may
        not keep talking after the till has closed.  */
    const availability = availabilityOf({
      ...p,
      /*  Manual only. A TRACKED product is outside this gate anyway
          (DEC-PDP-09), because its real count lives in Inventory.  */
      variantStock: p.stockMode === 'MANUAL' ? p.variants.map(variantCount) : undefined,
    });

    return {
      slug: p.slug,
      name: p.name,
      shortDesc: p.shortDesc,
      typeText: p.typeText,
      /*  DEC-PRD-035 — the page opens with nothing picked (8 Aug), so the
          headline number must be one a shopper can actually pay. Every variant
          priced → the cheapest of them, and the page marks it "from". One
          blank → the product's own price still applies to that variant, so it
          stays the headline.  */
      /*  One expression, shared with the "You may also like" ranking above
          (`cardPricePaisa`). It was written out twice; the copy in the rail
          drifted and sorted a "from ৳1,200" bouquet as a ৳3,500 one.  */
      pricePaisa: cardPricePaisa(p),
      /*  DEC-PRD-042 — the window itself, so the page can say when it ends.
          Suppressed on a "from ৳X" product: that headline is a variant's
          price, and the product's own window says nothing true about it.  */
      offer:
        p.variants.length > 0 && p.variants.every((v) => v.pricePaisa !== null)
          ? null
          : offerOrNull(money),
      /*  true → the page writes "from ৳450" and draws no struck price  */
      priceFrom:
        p.variants.length > 0 && p.variants.every((v) => v.pricePaisa !== null),
      unitSuffix: p.unit?.shortCode ?? null,
      /*  ⚠️ No struck price beside a "from" — see the card (DEC-PRD-035).  */
      mrpPaisa:
        p.variants.length > 0 && p.variants.every((v) => v.pricePaisa !== null)
          ? null
          : mrpOrNull(money),
      zone: p.zone === 'NATIONWIDE' ? 'both' : 'dhaka',
      productType: p.productType as 'READYMADE' | 'CRAFTED',
      nature: {
        type: p.natureType === 'ARTIFICIAL' ? 'artificial' : 'fresh',
        label: p.natureLabel,
      },
      prepaidOnly: p.advanceRequired,
      /*  ── DEC-PRD-050 · the two badges, and where they belong ─────────────
          On the GRID a badge earns its space: it is how one card is picked out
          of twenty. On THIS page the shopper has already chosen — FlowerAura
          carries a Best Seller ribbon all over its listings and puts none at
          all on the product page (checked, 24 Aug 2026). So the storefront
          draws these as one quiet line beside the rating, never as a ribbon
          over the photograph.

          `bestSellerIn` names the category on purpose. "Best seller" is a
          boast; "Best seller in Fresh Flowers" is a fact with a scope, and it
          is also the truth — the ranking IS per category.  */
      bestSeller: p.isBestSeller,
      bestSellerIn: p.isBestSeller ? (p.category.parent?.name ?? p.category.name) : null,
      newArrival: isNewNow(p, await this.newArrivalDays()),
      leadTimeDays: p.leadTimeDays,
      supportsExpress: p.supportsExpress,
      supportsSameDay: p.supportsSameDay,
      supportsMidnight: p.supportsMidnight,
      nationwideMsg: p.nationwideMsg,
      /*  A number the owner did not choose to publish is not published. "3
          left" is a selling tool when he means it and an embarrassment when he
          does not — and it is the one field on this page that changes without
          anybody editing anything.

          ⚠️ `displayQty` WINS WHEN IT IS SET — added 1 Aug 2026, and it was a
          hole: the admin has had a "Show a different number" field since the
          vendor/stock work, the value was being SAVED, and this line published
          `stockQty` anyway. So the field did nothing and the owner had no way
          of knowing. Empty (`null`) still means "publish the real one".  */
      /*  DEC-PRD-014 - with variants, the count belongs to them, so the number
          shown is their sum. The owner's hand-written `displayQty` still wins
          over that - it has always been a sales line, not a count.  */
      /*  ⚠️ Silenced whenever the availability gate says OUT_OF_STOCK —
          whatever showStock/displayQty say. See the comment above
          `availability`.  */
      stockQty:
        p.showStock && availability.state !== 'OUT_OF_STOCK'
          ? (p.displayQty ??
            /*  When TRACKED, a variant's hand-typed number is not read -
                DEC-PRD-015 puts the count in Inventory. Summing them anyway
                would have the website quoting a number nobody keeps.  */
            (p.stockMode === 'MANUAL' && p.variants.length > 0
              ? p.variants.reduce((n, v) => n + variantCount(v), 0)
              : p.stockQty))
          : null,
      /*  DEC-PDP-09. The gate reads the REAL count — never `displayQty`. A
          made-up figure must not be able to open or close a till (owner,
          1 Aug). DEC-PRD-014 - with variants, it is their stock that opens or
          closes the door; the arithmetic lives inside `availabilityOf`.  */
      availability,
      videoId: p.videoId,
      images: p.images.map((i) => i.url),
      crumb: {
        catLabel: parent ? parent.name : p.category.name,
        catSlug: parent ? parent.slug : p.category.slug,
        subLabel: parent ? p.category.name : null,
        subSlug: parent ? p.category.slug : null,
      },
      colour: p.variantValue
        ? {
            label: p.variantValue.label,
            swatch: p.variantValue.swatch,
            imageUrl: p.variantValue.imageUrl,
          }
        : null,
      variant: p.variantGroup
        ? {
            kind: p.variantGroup.kind === 'FLAVOUR' ? 'flavour' : 'colour',
            label: p.variantGroup.label,
            /*
              ⚠️ `variantValue` FIRST, the two old strings only as a fallback.
              `variantLabel` / `variantSwatch` are marked DEPRECATED in the
              schema (D-CAT-01): they hold a copy of the master's word and hex,
              which drift the moment the master is renamed. Reading the FK first
              means a rename is correct here on the next request, and the
              fallback quietly stops being used as products are backfilled —
              at which point these two lines are deleted with the columns.
            */
            options: p.variantGroup.products.map((s) => ({
              slug: s.slug,
              label: s.variantValue?.label ?? s.variantLabel ?? s.name,
              swatch: s.variantValue?.swatch ?? s.variantSwatch ?? null,
              imageUrl: s.variantValue?.imageUrl ?? null,
              active: s.slug === p.slug,
            })),
          }
        : null,
      /*
        DEC-PRD-012 - one page, every variant.

        On price - DEC-PRD-031, the owner, 8 August 2026: WHEN A VARIANT HAS
        ITS OWN PRICE THAT PRICE IS FINAL, and the product's discount does not
        stack on it. `paidPaisa()` used to run on both, so a FLAT ৳200 discount
        set against ৳2,400 also landed on a ৳1,500 variant and showed ৳1,300 -
        which the owner caught: "but I never gave the variant a discount."
        With no price of its own, the product's price (discount included)
        applies. Checkout reads its prices from this same list,
        so the rule stays in one place.

        On images: the variant's own photo, else the master's, else null - and
        then the page keeps the product's main photo. Not changing the picture
        beats showing a white rose after somebody picked "red".
      */
      variants: p.variants.map((v) => {
        /*  DEC-PRD-045 — the parts of this combination, in the master's own
            order so the Size row is always drawn above the Colour row. One
            part for a plain colour product; the page then behaves exactly as
            it did before, because one row of buttons is one row of buttons.

            `values` can be empty only for a row written before the migration
            ran, and then the lead value alone stands in — no page ever loses
            its chooser over a half-finished deploy.  */
        const parts = (v.values.length
          ? v.values.map((pv) => pv.variantValue)
          : []
        )
          .slice()
          .sort(
            (a, b) =>
              a.attribute.sortOrder - b.attribute.sortOrder ||
              a.attribute.name.localeCompare(b.attribute.name) ||
              a.sortOrder - b.sortOrder,
          )
          .map((val) => ({
            valueId: val.id,
            label: val.label,
            attribute: val.attribute.name,
            attributeId: val.attribute.id,
            displayMode: val.attribute.displayMode,
            swatch: val.swatch,
            imageUrl: val.imageUrl,
          }));
        return {
        id: v.id,
        parts,
        /*  The old single-value fields, still sent. A one-axis product reads
            them exactly as before; a two-axis one gets "Medium · Red" here,
            which is what the cart line and the receipt want to print.  */
        label: parts.length > 1 ? parts.map((x) => x.label).join(' · ') : v.variantValue.label,
        attribute: v.variantValue.attribute.name,
        displayMode: v.variantValue.attribute.displayMode,
        swatch: v.variantValue.swatch,
        imageUrl: v.imageUrl ?? v.variantValue.imageUrl ?? null,
        /*  DEC-PRD-032 — the variant's own price with its OWN discount taken
            off, run through the same `paidPaisa()` as everything else so the
            date window behaves identically. No own price → the product's paid
            price. `wasPaisa` is the struck figure, and only when a discount
            actually reduced something — never a number derived backwards from
            a ratio (that produced the ৳1,418 nonsense on 8 Aug).  */
        pricePaisa:
          v.pricePaisa !== null
            ? paidPaisa({
                sellingPricePaisa: v.pricePaisa,
                discountType: v.discountType as 'NONE' | 'FLAT' | 'PERCENT',
                discountValue: v.discountValue,
              })
            : paidPaisa(p),
        wasPaisa:
          v.pricePaisa !== null &&
          paidPaisa({
            sellingPricePaisa: v.pricePaisa,
            discountType: v.discountType as 'NONE' | 'FLAT' | 'PERCENT',
            discountValue: v.discountValue,
          }) < v.pricePaisa
            ? v.pricePaisa
            : null,
        stockQty: variantCount(v),
        };
      }),
      sizes: p.sizes,
      /*  own heading → parent's → a plain word. Never blank: the size row
          would then open with a dash and nothing before it.  */
      sizeLabel: p.category.sizeLabel ?? p.category.parent?.sizeLabel ?? 'Size',
      bundle,
      upgrades,
      /*
        DEC-PRD-026 - `null` when neither is switched on, and then the section
        is not drawn on the page at all. With no wording written, plain
        defaults are used: asking the owner to write three sentences on every
        product means the boxes simply stay empty.
      */
      perso:
        p.persoText || p.persoImage
          ? {
              title: p.persoTitle?.trim() || 'Make it personal',
              text: p.persoText
                ? {
                    label: p.persoTextLabel?.trim() || 'Your message',
                    max: p.persoTextMax,
                    hint: p.persoTextHint?.trim() || '',
                    /*  DEC-PRD-048 — the page said "required" without one.  */
                    required: p.persoTextRequired,
                  }
                : null,
              image: p.persoImage
                ? {
                    label: p.persoImageLabel?.trim() || 'Your photo',
                    hint: p.persoImageHint?.trim() || '',
                    required: p.persoImageRequired,
                  }
                : null,
            }
          : null,
      /*  DEC-PRD-027 - switch off and the box does not exist. The number comes
          from Company settings; with nothing there it is `null` and the page
          shows only the wording - honest, next to sending somebody to a fake
          number.  */
      customise: p.customiseOn
        ? {
            title: p.customiseTitle?.trim() || 'Want this customised?',
            sub:
              p.customiseSub?.trim() ||
              'Different colours, sizes or a theme — chat with our florists.',
            whatsapp: company?.publicPhone?.replace(/[^\d]/g, '') || null,
          }
        : null,
      craft,
      /*  DEC-WEB-011 — the band's heading walks the same ladder its cards do:
          the sub-category's words if it wrote any, else the parent's. Blank on
          both means the band draws no heading, which is the honest answer when
          nobody has yet decided what the shop should say.  */
      craftTitle:
        p.category.craftTitle?.trim() || p.category.parent?.craftTitle?.trim() || null,
      craftKicker:
        p.category.craftKicker?.trim() || p.category.parent?.craftKicker?.trim() || null,
      cutoffMinutesLeft,
      offers,
      ordersThisMonth,
      salesWindow: p.salesWindow,
      /*
        DEC-PRD-023 - the product's own, then the category's, then the parent's.

        The first list with anything in it is taken whole; THEY ARE NEVER
        MERGED - exactly the rule bundles and craft points follow. Merging
        would sit the category's "24 sticks" beside the product's "50 sticks",
        and the page itself could not tell the customer which to believe.
      */
      spec: pickList(
        p.specRows,
        firstList(p.category.specRows),
        firstList(p.category.parent?.specRows),
      ),
      /*  ── DEC-PRD-047 · FAQ REPLACES, it no longer adds up (23 Aug 2026) ──
          Owner: *"nirdisto product a FAQ change hote pare, but ta krar kon
          option nai. new add and edit and delete option thaka uchit, ar jonno
          category te newa dorkar nai. abr akhane change krle category te
          change hbe amn o na."*

          He wants the category's questions brought onto the product and
          edited there. The moment that is possible, adding up stops working:
          copy three questions in, change one word, and the page would print
          all three twice.

          So FAQ now follows the rule the other two inherited things already
          follow, and this page is back to ONE idea of inheritance:
              the product's own if it has any, else the category's ladder.
          Nothing is lost — "Use these and edit" copies them in first.  */
      faqs: [
        ...(p.faqs.length > 0
          ? p.faqs.map((f) => ({ ...f, scope: 'product' as const }))
          : catFaqs.map((f) => ({ ...f, scope: 'category' as const }))),
      ],
      /*  DEC-PRD-023 - the same ladder. Badges with no label are dropped, just
          as craft points are: press "Add a badge", write nothing, walk away,
          and an empty box would appear on the website.  */
      /*  The generic is written out by hand: the product's `icon` column is
          NOT NULL while the category's is nullable, so TypeScript cannot pick
          one shape for both on its own.  */
      trust: pickList<{
        icon: string | null;
        iconUrl: string | null;
        label: string;
        sub: string | null;
      }>(p.trustBadges, p.category.trustBadges, p.category.parent?.trustBadges).filter(
        (b) => b.label.trim().length > 0,
      ),
      addonTabs,
      reviews: rating,
      crossSell,
      underBuyText: storefront?.pdpUnderBuyText ?? null,
      underBuyPreorderText: storefront?.pdpUnderBuyPreorderText ?? null,
      journey: [storefront?.pdpJourneyImg1, storefront?.pdpJourneyImg2, storefront?.pdpJourneyImg3]
        .filter((u): u is string => !!u && u.trim().length > 0),
      seo: {
        title: p.metaTitle,
        description: p.metaDescription,
        ogTitle: p.ogTitle,
        ogDescription: p.ogDescription,
        ogImageUrl: p.ogImageUrl,
        noIndex: p.noIndex,
      },
    };
  }

  /**
   * This product's own star rating.
   *
   * ⚠️ PUBLISHED, PRODUCT-SCOPED, AND NEVER MIXED. Reviews about the shop carry
   * `productId: null` and stay out; a Google average belongs to the shop, not
   * to a bouquet. Averaging the two populations is the thing the homepage audit
   * warned against on 30 Jul, and doing it here would be worse — it would put a
   * number under a product name that no one ever gave that product.
   *
   * Null, not 0 and not 4.9, when nobody has reviewed it. The storefront has
   * been printing a hard-coded "4.9 · 412 reviews" on all 71 products.
   */
  private async rating(productId: string) {
    /*  DEC-WEB-005 (10 Aug) — the page now shows the reviews THEMSELVES under
        the product, FlowerAura-style, not just the average. One query serves
        the average, the star histogram and the list; at a hundred reviews per
        bouquet this shop has other problems worth having.  */
    const rows = await this.prisma.db.review.findMany({
      where: { productId, status: 'PUBLISHED', deletedAt: null },
      orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
      take: 100,
      select: {
        id: true,
        authorName: true,
        rating: true,
        body: true,
        context: true,
        imageUrl: true,
        verifiedPurchase: true,
        replyText: true,
        replyAt: true,
        createdAt: true,
      },
    });
    const count = rows.length;
    const byStar = [0, 0, 0, 0, 0]; // index 0 → 1★
    for (const r of rows) byStar[Math.min(Math.max(r.rating, 1), 5) - 1]++;
    return {
      rating:
        count > 0 ? Math.round((rows.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10 : null,
      count,
      byStar,
      items: rows,
    };
  }

  /**
   * "Make It a Bundle" — a second product offered alongside this one.
   *
   * WHERE THE LIST COMES FROM. The product's own rows if it has any, otherwise
   * its category's. Not merged: a product that overrides its category is saying
   * "not those, these" — merging would mean the override can only ever add, and
   * the one case the owner needs it for is taking something away.
   *
   * ⚠️ THE PRICE IS READ FROM THE ADDED PRODUCT, EVERY TIME. Nothing about the
   * chocolate's price is stored on the bundle row. Raising it on the chocolate
   * raises it on all eleven bouquet pages at once, which is the entire reason
   * this is a FK and not a `pricePaisa` column.
   *
   * The owner's discount is applied on top of whatever that product is already
   * selling for — so a chocolate at 10% off, bundled at ৳50 off, is ৳50 below
   * its own sale price. That is what "a discount for taking them together"
   * means to a shopper
   * looking at both pages, and the alternative (ignoring the product's own
   * discount) would show the bundle costing MORE than buying it separately.
   */
  /**
   * DEC-PRD-020 - the larger versions of this product.
   *
   * Sellable ones only. Showing an upgrade that is a draft or has sold out
   * would mean offering "take 50 roses" and then phoning to take it back -
   * exactly the rule the bundle cards follow, for exactly the same reason.
   */
  private async upgrades(productId: string) {
    const rows = await this.prisma.db.product.findMany({
      where: { upgradeOfProductId: productId, isPublished: true },
      orderBy: [{ upgradeSortOrder: 'asc' }, { sellingPricePaisa: 'asc' }],
      select: {
        slug: true,
        name: true,
        sellingPricePaisa: true,
        discountType: true,
        discountValue: true,
        discountStartsAt: true,
        discountEndsAt: true,
        stockMode: true,
        stockQty: true,
        /*  DEC-PRD-014 — the stock may live on the variants.  */
        variants: { where: { deletedAt: null, isActive: true }, select: { stockQty: true } },
        images: {
          where: { deletedAt: null },
          orderBy: [{ sortOrder: 'asc' }],
          take: 1,
          select: { url: true },
        },
      },
    });

    return rows
      .filter(
        (u) =>
          !(
            u.stockMode === 'MANUAL' &&
            (u.variants.length > 0
              ? u.variants.reduce((n, v) => n + v.stockQty, 0)
              : u.stockQty) <= 0
          ),
      )
      .map((u) => ({
        slug: u.slug,
        name: u.name,
        imageUrl: u.images[0]?.url ?? null,
        pricePaisa: paidPaisa({
          sellingPricePaisa: u.sellingPricePaisa,
          discountType: u.discountType as 'NONE' | 'FLAT' | 'PERCENT',
          discountValue: u.discountValue,
          /*  DEC-PRD-028 — an expired discount is not applied to an upgrade's
              price either.  */
          discountStartsAt: u.discountStartsAt,
          discountEndsAt: u.discountEndsAt,
        }),
      }));
  }

  /*  ⚠️ DEC-PRD-016's `combos()` has been lifted out of here — under
      DEC-PRD-018 a bundle is itself a list with a single discount beneath it,
      so the second layer called "pick exactly these and pay this" has no job
      left. The two tables are still in the database (nothing is deleted);
      nobody reads them any more.  */
  /*  ⚠️ CLIMBS TO THE PARENT TOO (23 Aug 2026) — found while fixing the FAQ,
      the same fault one table over. Craft points, badges and "What's inside"
      all walk product → category → parent; this stopped at the category. A
      "+ Chocolates" card written on Fresh flower would have reached nothing,
      because every product in this shop sits in a sub-category. No bundle
      existed yet, so nobody had seen it fail.

      Bundles REPLACE rather than add up, exactly as craft points do: the
      product's own if it has any, else its category's, else the parent's.  */
  private async bundles(productId: string, categoryId: string, parentCategoryId: string | null) {
    const rows = await this.prisma.db.bundle.findMany({
      where: {
        isActive: true,
        OR: [
          { productId },
          { categoryId },
          ...(parentCategoryId ? [{ categoryId: parentCategoryId }] : []),
        ],
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        label: true,
        productId: true,
        categoryId: true,
        discountType: true,
        discountValue: true,
        isBest: true,
        addsProduct: { select: BUNDLE_ADDS },
        /*  DEC-PRD-017 — several products in one bundle.  */
        items: {
          orderBy: [{ sortOrder: 'asc' }],
          select: { addsProduct: { select: BUNDLE_ADDS } },
        },
      },
    });

    const own = rows.filter((b) => b.productId !== null);
    const mine = rows.filter((b) => b.productId === null && b.categoryId === categoryId);
    const list =
      own.length > 0
        ? own
        : mine.length > 0
          ? mine
          : rows.filter((b) => b.productId === null && b.categoryId === parentCategoryId);

    /*
      Out of stock disappears rather than greys out — owner's rule, 31 Jul.
      A card the shopper can see but not take is a promise the shop then has
      to withdraw by phone.

      ⚠️ Under DEC-PRD-017 a card may hold several items, so the rule is that
      the card disappears if **any one** of them is unavailable. Shipping half
      a bundle means the customer sees the price of three and receives two.
    */
    const sellable = (p: {
      isPublished: boolean;
      deletedAt: Date | null;
      stockMode: string;
      stockQty: number;
      variants: { stockQty: number }[];
    }) =>
      p.isPublished &&
      p.deletedAt === null &&
      !(
        p.stockMode === 'MANUAL' &&
        (p.variants.length > 0
          ? p.variants.reduce((n, v) => n + v.stockQty, 0)
          : p.stockQty) <= 0
      );

    /*
      DEC-PRD-018 — one product = one list, one discount.

      ⚠️ When there are several rows (old data, from when one row = one item),
      all their items are joined into one list and the discount is taken from
      the first row. Once the owner saves the list in the admin even one time,
      the rows are folded down to one.
    */
    if (list.length === 0) return null;

    const seen = new Set<string>();
    const items = list
      .flatMap((b) => (b.items.length > 0 ? b.items.map((i) => i.addsProduct) : [b.addsProduct]))
      /*  The same item in two rows counts once — otherwise the customer would
          see the same cake twice and be charged for it twice.  */
      .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
      .filter(sellable)
      .map((p) => ({
        id: p.id,
        name: p.name,
        imageUrl: p.images[0]?.url ?? null,
        pricePaisa: paidPaisa({
          sellingPricePaisa: p.sellingPricePaisa,
          discountType: p.discountType as 'NONE' | 'FLAT' | 'PERCENT',
          discountValue: p.discountValue,
          /*  DEC-PRD-028 — the same expiry applies on a bundle's card too.  */
          discountStartsAt: p.discountStartsAt,
          discountEndsAt: p.discountEndsAt,
        }),
      }));

    if (items.length === 0) return null;

    return {
      /*  ⚠️ The page applies the discount, not this — and that is deliberate.
          The owner's rule (DEC-PRD-018): the discount applies to the total
          **including the main product**, but which ones the customer will take
          is not known here. So the raw numbers go out and the arithmetic lives
          in one place: `_data/bundlePricing.ts`.  */
      discountType: list[0].discountType as 'NONE' | 'FLAT' | 'PERCENT',
      discountValue: list[0].discountValue,
      items,
    };
  }

  /**
   * The three "why buy from us" cards.
   *
   * Three places are tried in order and the FIRST non-empty one wins: this
   * product's own rows, then its category's, then its parent category's.
   * Not merged — the same rule as bundles, so there is one inheritance idea on
   * this page and not two.
   *
   * The parent step matters more here than anywhere else: the story is about
   * flowers, and there are forty-four sub-categories. Without it the owner
   * writes the same three paragraphs on Roses, Lilies, Gerbera and Tuberose,
   * which means he writes them once and the other forty-three stay empty.
   */
  private async craft(productId: string, categoryId: string, parentCategoryId: string | null) {
    const rows = await this.prisma.db.craftPoint.findMany({
      where: {
        isActive: true,
        OR: [
          { productId },
          { categoryId },
          ...(parentCategoryId ? [{ categoryId: parentCategoryId }] : []),
        ],
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { icon: true, title: true, text: true, productId: true, categoryId: true },
    });

    const pick =
      rows.filter((r) => r.productId === productId).length > 0
        ? rows.filter((r) => r.productId === productId)
        : rows.filter((r) => r.categoryId === categoryId).length > 0
          ? rows.filter((r) => r.categoryId === categoryId)
          : rows.filter((r) => r.categoryId === parentCategoryId);

    return (
      pick
        /*
          ⚠️ A card with no title is not sent — caught on 2 Aug 2026. Pressing
          "Add a card" and leaving without typing anything leaves an empty row
          behind, and the website drew it as an **empty white box**. The shop
          had no idea where it came from.

          ⚠️ The filled ones are not thrown away, only the empty one is dropped
          — so leaving one blank card by mistake still shows the other two.
        */
        .filter((r) => r.title.trim().length > 0)
        .map((r) => ({ icon: r.icon, title: r.title, text: r.text }))
    );
  }

  /**
   * Minutes to today's cut-off, per zone.
   *
   * ⚠️ THE COUNTDOWN ON THE PRODUCT PAGE IS HARD-CODED TO 6 PM. The component
   * builds a Date, calls `setHours(18, 0, 0, 0)` and counts to it — so it is
   * wrong for every delivery mode whose real cut-off is not six, and it is
   * computed on the VISITOR'S clock, which tells someone in Toronto that
   * Dhaka's cut-off is nine hours away.
   *
   * Worked out here in Bangladesh time, the same `+6h` the shop's "Open now"
   * pill and `orders/promise.ts` use. The browser only ticks down from the
   * number it is given.
   *
   * The soonest cut-off in the zone wins — "order within" is a promise about
   * the next thing that closes, not the last.
   */
  private async cutoffs() {
    const rows = await this.prisma.db.deliveryMethod.findMany({
      where: { isActive: true },
      select: { zone: true, cutoffTime: true },
    });

    const now = new Date(Date.now() + 6 * 60 * 60 * 1000);
    const minutesNow = now.getUTCHours() * 60 + now.getUTCMinutes();

    const soonest = (zone: string) => {
      const left = rows
        .filter((m) => m.zone === zone)
        .map((m) => parseHHMM(m.cutoffTime))
        .filter((c): c is number => c !== null)
        .map((c) => c - minutesNow)
        /*  today's cut-off already gone is not tomorrow's countdown — the page
            should stop promising, not restart the clock  */
        .filter((n) => n > 0);
      return left.length > 0 ? Math.min(...left) : null;
    };

    return { dhaka: soonest('DHAKA'), nationwide: soonest('BANGLADESH') };
  }

  /**
   * The "Offers Available" strip.
   *
   * ⚠️ THIS DISPLAYS OFFERS. IT DOES NOT APPLY THEM. No price on this page
   * moves because of anything returned here — working out which offer wins,
   * whether they stack, and what the customer actually pays is Marketing's
   * rule set (`combinable`, `priority`, `minSpendPaisa`, `perCustomerLimit`)
   * and it happens at checkout, once. A second implementation of it here would
   * be a second answer, and the shopper would meet both.
   *
   * WHAT IS FILTERED OUT, AND WHY EACH ONE MATTERS:
   *  - anything not `approved` — a draft is a thought, not an offer, and
   *    `pending_approval` exists precisely because someone has not agreed yet
   *  - anything outside its dates — Valentine's in July
   *  - anything with no shopper-facing wording. `name` is the INTERNAL name
   *    ("BK cashback Q3 - margin test"); printing it because `benefitLine` is
   *    empty is how internal notes reach customers.
   */
  private async offers(productId: string, categoryId: string, parentCategoryId: string | null) {
    const now = new Date();
    const rows = await this.prisma.db.offer.findMany({
      where: {
        status: 'approved',
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
        OR: [
          { shape: { in: ['SITEWIDE', 'FIRST_ORDER', 'PAYMENT', 'FREE_DELIVERY'] } },
          {
            shape: 'CATEGORY',
            categoryId: { in: parentCategoryId ? [categoryId, parentCategoryId] : [categoryId] },
          },
          { shape: 'PRODUCT', products: { some: { id: productId } } },
        ],
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take: 6,
      select: {
        id: true,
        publicTitle: true,
        benefitLine: true,
        mechanism: true,
        code: true,
        shape: true,
        paymentMethod: true,
      },
    });

    return rows
      .map((o) => {
        const text = o.benefitLine ?? o.publicTitle;
        if (!text) return null;
        const brand = BRAND[o.paymentMethod ?? ''] ?? BRAND[o.shape] ?? BRAND.default;
        return {
          key: o.id,
          logo: brand.logo,
          color: brand.color,
          text,
          /*  A coupon that a shopper cannot see the code of is not an offer,
              it is a secret. Automatic ones say so instead — "Auto-applied"
              stops people hunting for a code that does not exist.  */
          code: o.mechanism === 'COUPON' ? o.code : null,
          note: o.mechanism === 'COUPON' ? null : 'Auto-applied',
        };
      })
      .filter((o): o is NonNullable<typeof o> => o !== null);
  }

  /**
   * "214 orders this month" — the live line beside the rating.
   *
   * ⚠️ IT WAS A TYPED STRING ON EVERY PRODUCT. All 71 carried a number somebody
   * invented, and it never moved. This counts real order lines from the last
   * 30 days.
   *
   * Cancelled orders do not count. A cancelled order is not evidence that
   * anyone wanted the thing — often the opposite.
   *
   * Below 10 it returns null and the line disappears. Not shyness: "3 orders
   * this month" printed under a product argues against buying it, and a
   * shop's own page should not do that for it. Above the floor the number is
   * exact, never rounded up.
   */
  /**
   * DEC-PRD-025 — the owner's seeded number plus the real sales in the chosen
   * period.
   *
   * Owner, 2 Aug 2026 (translated): *"first I'll put in a fake sale count...
   * then when real sales happen they'll add to that number. Like our stock."*
   *
   * ⚠️ This function used to count only the real orders of the last 30 days,
   * and return `null` below 10 — meaning the owner's own number never reached
   * the page at all. He is the one who spotted it.
   *
   * ⚠️ `salesSeed`, not `salesCount`. `salesCount` grows with each sale, so
   * treating it as the starting number would count old sales twice in the
   * weekly figure.
   *
   * ⚠️ The hide-below-10 rule applies **only** when the owner has set nothing
   * himself. "3 orders this month" argues against buying — but that is our
   * decision, not an excuse to bury the owner's number.
   */
  /**
   * Whether the owner's seeded number still counts — DEC-PRD-025.
   *
   * ⚠️ TODAY means **today's date**, not "the last 24 hours". The owner's
   * words: *"it's better if this restarts daily"* — midnight means midnight.
   * On a 24-hour reading, a number seeded at 8 PM would still show at 7 AM the
   * next morning, which is exactly what he asked to stop.
   *
   * ⚠️ The day is in **Bangladesh time**. If the server sits in another
   * country, UTC midnight is 6 PM in Dhaka — the number would vanish in the
   * middle of the day.
   */
  private seedStillCounts(
    window: 'TODAY' | 'WEEK' | 'MONTH' | 'ALL',
    seedAt: Date | null,
  ): boolean {
    if (window === 'ALL') return true;
    if (!seedAt) return false;

    const BD = 6 * 60 * 60 * 1000;
    if (window === 'TODAY') {
      const dayOf = (d: Date) => Math.floor((d.getTime() + BD) / 86_400_000);
      return dayOf(seedAt) === dayOf(new Date());
    }

    const days = window === 'WEEK' ? 7 : 30;
    return Date.now() - seedAt.getTime() <= days * 86_400_000;
  }

  private async salesSignal(
    productId: string,
    rawSeed: number,
    window: 'TODAY' | 'WEEK' | 'MONTH' | 'ALL',
    seedAt: Date | null,
  ): Promise<number | null> {
    const DAY = 24 * 60 * 60 * 1000;
    const since =
      window === 'ALL'
        ? null
        : new Date(Date.now() - (window === 'TODAY' ? 1 : window === 'WEEK' ? 7 : 30) * DAY);

    /*
      ⚠️ The owner's number has an expiry — DEC-PRD-025, 2 Aug 2026
      (translated): *"if people always see 10 sales today, then to Google and
      to people it becomes fake. It's better if this restarts daily."*

      A TODAY number counts only on that day, WEEK for 7 days, MONTH for 30.
      ALL has no expiry — it is a running total, and that is what the owner
      wanted.

      ⚠️ The number is not deleted, it simply stops counting. The moment the
      owner goes in and saves again, the clock restarts — in his own words:
      *"if we need it again, we'll go into the product and add the number
      again."*

      ⚠️ Without `seedAt` (an old row) the number does not count. We do not
      know when it was seeded, and saying "10 sales today" on the strength of
      an unknown date is precisely the lie the owner asked us to stop.
    */
    const seed = this.seedStillCounts(window, seedAt) ? rawSeed : 0;

    const real = await this.prisma.db.orderLine.count({
      where: {
        productId,
        order: {
          ...(since ? { createdAt: { gte: since } } : {}),
          salesStatus: { not: 'cancelled' },
        },
      },
    });

    const total = seed + real;
    if (total === 0) return null;
    /*  The owner set nothing and real sales are low — better to stay quiet.  */
    if (seed === 0 && real < 10) return null;
    return total;
  }

  /**
   * Add-ons by id — what the CART needs to price a line.
   *
   * ⚠️ WHY A SECOND ENDPOINT WHEN THE PRODUCT PAGE ALREADY RETURNS THESE.
   * The cart holds only a configuration: a slug, a size, and a list of add-on
   * keys. It deliberately stores no prices, so that a price change reaches a
   * cart that was filled yesterday. To show a total it must therefore look the
   * add-ons up — and it may hold add-ons from four different products, so
   * asking each product page again would be four requests to get one number.
   *
   * Inactive and deleted ones still resolve, ON PURPOSE. A shopper who added
   * gift wrap an hour ago should see it in the cart with its price, not watch
   * it vanish. Whether it can still be BOUGHT is the checkout's question, and
   * checkout is where that answer belongs.
   */
  async addonsByIds(ids: string[]) {
    if (ids.length === 0) return [];
    const rows = await this.prisma.db.addOn.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        name: true,
        pricePaisa: true,
        isFree: true,
        discountType: true,
        discountValue: true,
        imageUrl: true,
        isActive: true,
        stockQty: true,
        itemId: true,
      },
    });
    /*  DEC-PRD-039 — same live count as the product page uses, so the cart
        cannot call an add-on available that the page has already hidden.  */
    const linked = [...new Set(rows.flatMap((a) => (a.itemId ? [a.itemId] : [])))];
    const sums = linked.length
      ? await this.prisma.db.inventoryStock.groupBy({
          by: ['itemId'],
          where: { itemId: { in: linked } },
          _sum: { qtyMilli: true },
        })
      : [];
    const qty = new Map(
      sums.map((r) => [r.itemId, Math.max(0, Math.floor((r._sum.qtyMilli ?? 0) / 1000))]),
    );
    return rows.map((a) => ({
      id: a.id,
      name: a.name,
      /*  DEC-PRD-049 — a deliberately free add-on costs nothing here too, or
          the cart would charge for what the page gave away.  */
      pricePaisa: a.isFree
        ? 0
        : paidPaisa({
            sellingPricePaisa: a.pricePaisa,
            discountType: a.discountType as 'NONE' | 'FLAT' | 'PERCENT',
            discountValue: a.discountValue,
          }),
      isFree: a.isFree,
      imageUrl: bareImageUrl(a.imageUrl),
      /** false → the cart can say so; it does not remove the line itself */
      available: (() => {
        if (!a.isActive) return false;
        const left = a.itemId ? (qty.get(a.itemId) ?? 0) : a.stockQty;
        return left === null || left > 0;
      })(),
    }));
  }

  /**
   * D-CAT-03 — "flowers, generally". Merged under the product's own answers.
   *
   * ⚠️ IT CLIMBS TO THE PARENT (23 Aug 2026). Owner: *"category te badges,
   * what's inside, why buy from us — agula sobei create krle automatic product
   * upload page a kaj krche. but faq kaj kre na."*
   *
   * He was right, and it was this one line. Every product in the shop sits in
   * a SUB-category (Fresh flower › rose) and he had written the question on
   * the parent, Fresh flower. Badges, "What's inside" and the why-buy cards
   * all walk the ladder to the parent; this asked for one category and
   * stopped. So the question existed, was live, and reached nothing.
   *
   * FAQ ADDS UP, it does not replace — that is already the rule between the
   * product and its category, and the same rule simply carries one step
   * further. The sub-category's answers come first, then the parent's, and a
   * question written in both is shown once (the nearer wording wins).
   */
  private async categoryFaqs(categoryId: string, parentCategoryId: string | null) {
    const ids = parentCategoryId ? [categoryId, parentCategoryId] : [categoryId];
    const rows = await this.prisma.db.categoryFaq.findMany({
      where: { categoryId: { in: ids }, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { question: true, answer: true, categoryId: true },
    });
    const near = rows.filter((r) => r.categoryId === categoryId);
    const far = rows.filter((r) => r.categoryId !== categoryId);
    const seen = new Set<string>();
    return [...near, ...far]
      .filter((r) => {
        const k = r.question.trim().toLowerCase();
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .map((r) => ({ question: r.question, answer: r.answer }));
  }

  /**
   * "Make It Extra Special" — one tab per add-on group this product qualifies
   * for, by rule (automatic) or by hand (`manualAddOnGroups`).
   *
   * ⚠️ THE MATCH IS COPIED FROM THE ADMIN'S PREVIEW, INCLUDING ITS WEAKNESS.
   * `AddOnRule.values` holds a CATEGORY rule as the category's NAME, not its
   * id or slug — that is what `AddonsView` writes and what its preview reads.
   * So renaming "Cakes" to "Cakes & Desserts" silently detaches every rule
   * pointing at it. Matching on the id here instead would be more correct and
   * would make the live page disagree with the preview the owner tested
   * against, which is worse. Recorded, to be fixed on both sides at once.
   *
   * A product hit by several rules gets the union, one tab each — deliberate
   * (schema note on `AddOnRule`), so an add-on in two groups is not shown twice.
   */
  private async addonTabs(ctx: {
    productId: string;
    categoryName: string;
    zone: string;
    productType: string;
    /** DEC-PRD-040 — what the customer pays today, for the PRICE_RANGE rule */
    pricePaisa: number;
    tagSlugs: string[];
    manualGroupIds: string[];
  }) {
    const rules = await this.prisma.db.addOnRule.findMany({
      where: { isActive: true },
      select: { field: true, values: true, groupId: true },
    });

    const hit = (field: string, values: string[]) => {
      if (field === 'CATEGORY') return values.includes(ctx.categoryName);
      if (field === 'ZONE') return values.includes(ctx.zone);
      if (field === 'PRODUCT_TYPE') return values.includes(ctx.productType);
      /*  DEC-PRD-040 — owner, 9 Aug 2026. Two conditions the four original
          ones could not express: "premium extras only above ৳3,000", and
          "just these few products". `values` is [min, max] in paisa for the
          first (either end may be blank) and a list of product ids for the
          second.  */
      if (field === 'PRICE_RANGE') {
        const min = Number(values[0]);
        const max = Number(values[1]);
        if (Number.isFinite(min) && ctx.pricePaisa < min) return false;
        if (Number.isFinite(max) && max > 0 && ctx.pricePaisa > max) return false;
        return true;
      }
      if (field === 'PRODUCT') return values.includes(ctx.productId);
      return ctx.tagSlugs.some((t) => values.includes(t));
    };

    const groupIds = new Set(ctx.manualGroupIds);
    for (const r of rules) if (hit(r.field, r.values)) groupIds.add(r.groupId);
    if (groupIds.size === 0) return [];

    const groups = await this.prisma.db.addOnGroup.findMany({
      where: { id: { in: [...groupIds] } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        items: {
          orderBy: [{ sortOrder: 'asc' }],
          select: {
            addOn: {
              select: {
                id: true,
                name: true,
                pricePaisa: true,
                isFree: true,
                discountType: true,
                discountValue: true,
                imageUrl: true,
                isActive: true,
                deletedAt: true,
                stockQty: true,
                /*  DEC-PRD-039 — linked to a stockroom Item, so the count is
                    Inventory's, not the hand-typed box.  */
                itemId: true,
              },
            },
          },
        },
      },
    });

    /*  DEC-PRD-039 — an add-on bound to a stockroom Item counts from Inventory
        LIVE, exactly as a linked variant does. One query for all of them.  */
    const addonItemIds = [
      ...new Set(groups.flatMap((g) => g.items.flatMap((i) => (i.addOn.itemId ? [i.addOn.itemId] : [])))),
    ];
    const addonInv = addonItemIds.length
      ? await this.prisma.db.inventoryStock.groupBy({
          by: ['itemId'],
          where: { itemId: { in: addonItemIds } },
          _sum: { qtyMilli: true },
        })
      : [];
    const addonQty = new Map(
      addonInv.map((r) => [r.itemId, Math.max(0, Math.floor((r._sum.qtyMilli ?? 0) / 1000))]),
    );
    /** what this add-on really has: Inventory when linked, the typed box otherwise */
    const addonStock = (a: { itemId: string | null; stockQty: number | null }) =>
      a.itemId ? (addonQty.get(a.itemId) ?? 0) : a.stockQty;

    return groups
      .map((g) => ({
        id: g.id,
        label: g.name,
        items: g.items
          .map((i) => i.addOn)
          /*  Out of stock is not "greyed out" here, it is absent. An add-on is
              a two-second impulse decision; a disabled card only teaches the
              shopper that the page has broken parts. `stockQty: null` means a
              service (gift wrap) that never runs out.  */
          .filter((a) => {
            if (!a.isActive || a.deletedAt !== null) return false;
            /*  DEC-PRD-049 — ৳0 and not marked Free means nobody priced it.
                Offering it would give stock away on a typing mistake; the
                shop sees it missing and fixes the price.  */
            if (a.pricePaisa <= 0 && !a.isFree) return false;
            const left = addonStock(a);
            return left === null || left > 0;
          })
          .map((a) => ({
            id: a.id,
            name: a.name,
            pricePaisa: a.isFree
              ? 0
              : paidPaisa({
                  sellingPricePaisa: a.pricePaisa,
                  discountType: a.discountType as 'NONE' | 'FLAT' | 'PERCENT',
                  discountValue: a.discountValue,
                }),
            isFree: a.isFree,
            imageUrl: bareImageUrl(a.imageUrl),
          })),
      }))
      /*  An empty tab is worse than a missing one — it reads as a page that
          failed to load half of itself.  */
      .filter((g) => g.items.length > 0);
  }

  /**
   * "You may also like" — DEC-PRD-051.
   *
   * ⚠️ THIS RULE WAS THE OPPOSITE UNTIL 24 AUGUST 2026, and the old comment
   * argued for it well enough that it is worth saying plainly why it was
   * wrong. It required a DIFFERENT category ("six more bouquets is a shopper
   * comparing instead of buying"), and it conceded that the rail may come back
   * empty. It came back empty on every product this shop sells, because every
   * product this shop sells is in one category. A rail that never renders is
   * not a strict rule; it is a missing feature.
   *
   * The new rule is the one FlowerAura's "Similar Products" uses, checked on
   * their own page the same day: SAME category, and a NEARBY PRICE. Under a
   * ৳695 bouquet they show ৳595, ৳745, ৳795 — never ৳3,000, never ৳150.
   *
   * Why nearby price is the thing that matters: somebody looking at a ৳695
   * bouquet has decided roughly what this gift is worth to them. Showing a
   * ৳4,000 arrangement does not raise that budget, it just wastes the row.
   * Showing a ৳150 one makes them wonder what is wrong with the ৳695. Six
   * products they could actually swap to is a row that can be clicked.
   *
   * Order: nearest price first, best sellers breaking the tie. Shared occasion
   * tags are a PREFERENCE, not a filter — they sort a product up, they never
   * exclude one, because excluding on tags is how the old rule emptied itself.
   *
   * The cards are built by `ShopCatalogService`, the same builder the category
   * grid uses, so a product looks identical wherever it appears.
   */
  private async crossSell(
    productId: string,
    categoryId: string,
    parentCategoryId: string | null,
    tagSlugs: string[],
    pricePaisaNow: number,
  ) {
    /*  Scope climbs to the parent, exactly like FAQ, bundles and craft cards
        do (DEC-PRD-047). A shopper on a rose is happy to be shown a lily; the
        sub-category is a shelf, the category is the shop's aisle.  */
    const scope = parentCategoryId
      ? { category: { OR: [{ id: categoryId }, { parentId: parentCategoryId }, { id: parentCategoryId }] } }
      : { category: { OR: [{ id: categoryId }, { parentId: categoryId }] } };

    const rows = await this.prisma.db.product.findMany({
      where: { ...LIVE, id: { not: productId }, ...scope },
      /*  A wide net, then ranked in memory: "nearest price" cannot be an
          `orderBy`, and 60 rows of four columns is cheaper than the six
          round-trips a banded query would take.  */
      take: 60,
      select: {
        id: true,
        sellingPricePaisa: true,
        discountType: true,
        discountValue: true,
        discountStartsAt: true,
        discountEndsAt: true,
        isBestSeller: true,
        salesCount: true,
        tags: { where: { isActive: true, deletedAt: null }, select: { slug: true } },
        /*  ⚠️ DEC-PRD-035, AND THIS WAS CAUGHT LIVE. Ranking read the
            product's own price column while the CARD quotes the cheapest
            variant — so a bouquet whose card says "from ৳1,200" was being
            compared at its ৳3,500 column price. The number that has to be
            close is the number the shopper can see.  */
        variants: {
          where: { deletedAt: null, isActive: true },
          select: { pricePaisa: true, discountType: true, discountValue: true },
        },
      },
    });

    const wanted = new Set(tagSlugs);
    const ranked = rows
      .map((r) => {
        const price = cardPricePaisa(r);
        /*  Distance as a RATIO, not in taka. ৳300 apart means nothing on its
            own — it is next door to a ৳3,000 arrangement and a different
            world from a ৳400 one.  */
        const gap =
          pricePaisaNow > 0 ? Math.abs(price - pricePaisaNow) / pricePaisaNow : 0;
        const sharesOccasion = r.tags.some((t) => wanted.has(t.slug));
        /*  ⚠️ A shared occasion DISCOUNTS the distance; it is not a tier above
            it. Sorted as two tiers, one tagged product at ten times the price
            beat every untagged product sitting right next to it — which is
            the ৳4,000 arrangement under a ৳400 bouquet this rule exists to
            avoid. 0.6 is deliberately mild: a birthday tag is worth roughly
            "a bit closer in price", not "any price at all".  */
        const score = sharesOccasion ? gap * 0.6 : gap;
        return { id: r.id, score, best: r.isBestSeller, sold: r.salesCount };
      })
      .sort(
        (a, b) =>
          a.score - b.score ||
          /*  The badge only ever breaks a tie.  */
          Number(b.best) - Number(a.best) ||
          b.sold - a.sold,
      )
      .slice(0, 6);

    return this.catalog.cardsByIds(ranked.map((r) => r.id));
  }
}

@Controller('shop')
export class ProductDetailController {
  constructor(private readonly svc: ProductDetailService) {}

  /**
   * ⚠️ Route order note for whoever adds the LIST endpoint: `products/:slug`
   * and `products` are different paths and do not shadow each other. Adding
   * `products/featured` later WOULD be shadowed by this one, and must be
   * declared above it.
   */
  /*  Declared BEFORE `products/:slug` is not needed — different first
      segment — but it is declared first anyway so the two read together. */
  @Public()
  @Get('addons')
  addons(@Query('ids') ids?: string) {
    return this.svc.addonsByIds((ids ?? '').split(',').filter(Boolean));
  }

  @Public()
  @Get('products/:slug')
  detail(@Param('slug') slug: string) {
    return this.svc.detail(slug);
  }
}

@Module({
  imports: [ShopCatalogModule],
  providers: [ProductDetailService],
  controllers: [ProductDetailController],
  exports: [ProductDetailService],
})
export class ProductDetailModule {}
