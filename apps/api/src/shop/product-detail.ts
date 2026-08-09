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
import { paidPaisa } from '../common/discount-window';
import { bareImageUrl } from '../common/image-url';

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
    personalisation           — half of it belongs to OrderLine (§3ক, deferred
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
  ⚠️ অঙ্কটা এখন `common/discount-window.ts`-এ, একটাই জায়গায়। এখানে শুধু
  পুরনো নামটা রেখে দেওয়া হলো, কারণ এই ফাইলে ডজনখানেক জায়গা থেকে ডাকা হয়
  আর প্রতিটা বদলানোর মানে হতো একটা বাদ পড়া।

  কেন সরল: grid `offerPaisa()` ডাকত, page ডাকত `paidPaisa()` — তারিখের
  নিয়ম যোগ করার দিন page-এ ছাড় বন্ধ হলো আর grid-এ চলতেই থাকল।
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
export function mrpOrNull(p: {
  sellingPricePaisa: number;
  discountType: 'NONE' | 'FLAT' | 'PERCENT';
  discountValue: number;
  /*  DEC-PRD-028 — কাটা দামটাও মেয়াদ শেষে উঠে যায়। নাহলে offer ফুরানোর
      পরেও page-এ কাটা দাগ আর "20% OFF" বসে থাকত, অথচ দাম পুরোটাই।  */
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
/** child rows: the soft-delete extension does NOT reach nested relations */
const LIVE_ROW = { deletedAt: null } as const;

/*  DEC-PRD-017 — bundle-এর ভেতরের একটা জিনিস সম্পর্কে যা যা জানা দরকার।
    একবার লেখা, দুই জায়গায় পড়া (পুরনো একক কলাম আর নতুন `items`) — যাতে
    দুটো পথ কখনো আলাদা কথা না বলে।  */
/**
 * DEC-PRD-023 — প্রথম যে তালিকায় কিছু আছে, সেটাই পুরোটা।
 *
 * ⚠️ মেশানো হয় না। product-এর "24 sticks" আর category-র "12 sticks" একসাথে
 * দেখালে page নিজেই নিজের সাথে দ্বিমত করত। bundle আর craft-ও ঠিক এভাবেই
 * কাজ করে — এই page-এ উত্তরাধিকারের **একটাই** ধারণা থাকা দরকার।
 */
function pickList<T>(...lists: (readonly T[] | undefined)[]): T[] {
  for (const l of lists) if (l && l.length > 0) return [...l];
  return [];
}

const BUNDLE_ADDS = {
  /*  ⚠️ id লাগে — cart-এ কোন জিনিসটা নেওয়া হয়েছে সেটা এই id দিয়েই যায়,
      নাম দিয়ে নয়। মালিক নাম বদলালে cart-এর line ছিঁড়ে যেত।  */
  id: true,
  name: true,
  sellingPricePaisa: true,
  discountType: true,
  discountValue: true,
  /*  DEC-PRD-028 — ছাড়ের মেয়াদ, নাহলে bundle-এর card-এ ফুরিয়ে যাওয়া
      ছাড়ের দাম বসে থাকত।  */
  discountStartsAt: true,
  discountEndsAt: true,
  isPublished: true,
  deletedAt: true,
  stockMode: true,
  stockQty: true,
  /*  DEC-PRD-014 — মজুদ variant-এ থাকতে পারে। এটা না আনলে ১০টা লাল গোলাপ
      থাকা সত্ত্বেও card-টা "out of stock" ধরে লুকিয়ে যেত।  */
  variants: { where: { deletedAt: null, isActive: true }, select: { stockQty: true } },
  images: {
    where: { deletedAt: null },
    orderBy: { sortOrder: 'asc' as const },
    take: 1,
    select: { url: true },
  },
  /*
    ⚠️ `as const` ছিল এখানে, আর সেটাই API-কে compile হতে দেয়নি (৩ আগস্ট
    ২০২৬)। `as const` ভেতরের array-গুলোকে `readonly` করে দেয়, আর Prisma-র
    `orderBy` একটা **mutable** array চায় — তাই সাতটা type error, আর API
    পুরনো build নিয়ে চলতে থাকে চুপচাপ।

    ⚠️ শিক্ষাটা লিখে রাখছি: `radian_apply.bat` চালানোর পর সবকিছু আগের মতো
    দেখালে ধরে নেওয়া যায় না যে নতুন code চলছে — build ভেঙে গেলে পুরনোটাই
    চলতে থাকে। `_api_log.txt` দেখাই একমাত্র নিশ্চিত উপায়।
  */
};

export interface ShopProductDetail {
  slug: string;
  name: string;
  shortDesc: string | null;
  typeText: string | null;
  /** what they pay today — integer paisa */
  pricePaisa: number;
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
  nature: { type: 'fresh' | 'artificial'; label: string | null };
  /** COD is refused on this product — a made-to-order thing already engraved */
  prepaidOnly: boolean;
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
   * DEC-PRD-012 — এই product-এর রঙ / ফ্লেভার / মাপ, এক page-এই।
   *
   * ⚠️ `variant` (উপরে) এর জায়গা নেয় না — ওটা পুরনো নকশার, যেখানে প্রতিটা
   * রঙ ছিল আলাদা product আর swatch অন্য page-এ নিয়ে যেত। সেই নকশার জোড়া
   * লাগানোর পর্দা কখনো বানানো হয়নি, তাই `variant` বাস্তবে সবসময় `null`।
   * এটাই এখন আসল উত্তর।
   *
   * খালি array = এই product-এর কোনো variant নেই, আর page-এ ওই অংশটাই
   * দেখা যায় না — মালিকের নিয়ম।
   */
  variants: {
    id: string;
    label: string;
    /** কোন তালিকার মান — "Colour" / "Flavour"। শিরোনামে বসে। */
    attribute: string;
    /** master কী দেখাতে বলেছে — SWATCH | PHOTO | TEXT */
    displayMode: string;
    swatch: string | null;
    /** এই variant-এর নিজের ছবি, নাহলে master-এর ছবি, নাহলে null */
    imageUrl: string | null;
    /** যা গ্রাহক দেবে — offer, নাহলে নিজের দাম, নাহলে product-এর দাম */
    pricePaisa: number;
    /** DEC-PRD-032 — offer চললে কাটা দামটা (variant-এর regular), নাহলে null */
    wasPaisa: number | null;
    /** নিজের মজুদ। ০ = এই রঙটা শেষ, কিন্তু বাকিগুলো চলছে।
     *  Item-এ বাঁধা variant-এ এটা Inventory-র লাইভ গোনা। */
    stockQty: number;
  }[];
  sizes: { id: string; label: string; sub: string | null; pricePaisa: number }[];
  /** the heading above the size chooser — "Bouquet Size", "Cake Weight" */
  sizeLabel: string;
  /** the three "why buy from us" cards. Product's own, else its category's. */
  craft: { icon: string; title: string; text: string }[];
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
  /**
   * "214 orders this month" — real, or null.
   *
   * Null below a floor rather than a small true number: "3 orders this month"
   * under a product is an argument against buying it.
   */
  ordersThisMonth: number | null;
  /**
   * DEC-PRD-025 — উপরের সংখ্যাটা কোন সময়ের। লেখাটা page বানায়, কারণ
   * শব্দ page-এর কাজ; কিন্তু **কোন সময়** সেটা মালিকের সিদ্ধান্ত।
   *
   * ⚠️ এটা না পাঠালে page "this month" লিখেই যেত — মালিক "Today" বাছলেও।
   * এক জায়গায় সংখ্যা আর অন্য জায়গায় হাতে লেখা শব্দ, ঠিক এভাবেই মিথ্যা
   * জন্মায়।
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
   * DEC-PRD-018 — এক product = একটাই bundle তালিকা, একটাই ছাড়।
   *
   * মালিক, ২ আগস্ট ২০২৬:
   * > *"just main product নিলে কোনো discount নেই, আর সাথে extra কোনো bundle
   * >  থেকে product select করলেই সে discount পাবে।"*
   *
   * ⚠️ প্যাকেজ নয়, তালিকা। গ্রাহক যা খুশি নেয়, বাকিগুলো skip করে — আর
   * একটাও নিলেই ছাড় বসে, main product সহ মোট দামের উপর।
   *
   * ⚠️ শেষ দামটা এখানে পাঠানো হয় না, কাঁচা সংখ্যা যায়। ছাড় বসে গ্রাহক
   * **কী কী বেছেছেন** তার উপর, আর সেটা এখানে জানা নেই। হিসাবটা এক
   * জায়গায়: `_data/bundlePricing.ts`.
   */
  bundle: {
    discountType: 'NONE' | 'FLAT' | 'PERCENT';
    /** FLAT = paisa · PERCENT = basis points (1000 = 10%) */
    discountValue: number;
    items: {
      /** যোগ হওয়া product-এর id — cart-এ এটাই যায় */
      id: string;
      name: string;
      imageUrl: string | null;
      /** এটার আজকের দাম, নিজের ছাড় বসানোর পর */
      pricePaisa: number;
    }[];
  } | null;
  /**
   * DEC-PRD-020 — এটার বড় সংস্করণ, যেগুলো নিজেরাই আলাদা product।
   *
   * মালিক, ২ আগস্ট ২০২৬: *"upgrade product-এ click করলে price change হবে,
   * কিন্তু অন্য page-এ যেন না নেয়।"*
   *
   * ⚠️ ঘরটা schema-তে ২৬ জুলাই থেকেই ছিল আর admin-এ বাছাও যেত, কিন্তু
   * storefront কোনোদিন এটা পড়েনি — অর্থাৎ মালিক যা বাছতেন তা কোথাও
   * দেখাত না। ঠিক এই ভুলটাই variant swatch-এর বেলায় হয়েছিল: টেবিল ছিল,
   * admin ছিল, পর্দা ছিল না।
   *
   * ⚠️ প্রতিটা upgrade একটা **সত্যিকারের product** — নিজের দাম, নিজের
   * মজুদ, নিজের page। তাই বাছলে cart-এ ওরই `slug` যায়। page বদলায় না,
   * শুধু দাম আর ছবি বদলায় — মালিকের স্পষ্ট নির্দেশ।
   */
  upgrades: {
    slug: string;
    name: string;
    imageUrl: string | null;
    /** গ্রাহক যা দেবে — নিজের ছাড় বসানোর পর */
    pricePaisa: number;
  }[];
  /**
   * DEC-PRD-026 — গ্রাহক নিজের লেখা বা ছবি দিতে পারবে কি না।
   * `null` = এই product-এ কিছুই দেওয়ার নেই, আর page-এ অংশটাই আঁকা হয় না।
   *
   * ⚠️ ২ আগস্ট ২০২৬ পর্যন্ত storefront-এর seam-এ সোজা `perso: null` লেখা
   * ছিল, তাই কোনো product-এ এটা **কখনো** আসেনি।
   */
  perso: {
    title: string;
    text: { label: string; max: number | null; hint: string } | null;
    image: { label: string; hint: string } | null;
  } | null;
  /**
   * DEC-PRD-027 — "Want this customised?" সবুজ বাক্স। `null` = দেখাবে না।
   *
   * ⚠️ নম্বরটা Company settings-এর `publicPhone` থেকে। আগে page-এ
   * `wa.me/8801000000000` বসানো ছিল — একটা বানানো নম্বর।
   */
  customise: { title: string; sub: string; whatsapp: string | null } | null;
  spec: { item: string; qty: string }[];
  /** this product's own questions first, then the category's */
  faqs: { question: string; answer: string; scope: 'product' | 'category' }[];
  /**
   * DEC-PRD-023 — product-এর নিজের, নাহলে category-র, নাহলে parent-এর।
   * `iconUrl` ভরা থাকলে সেটাই আঁকা হয়; `icon` তখন খালি।
   */
  trust: { icon: string | null; iconUrl?: string | null; label: string; sub: string | null }[];
  addonTabs: {
    id: string;
    label: string;
    items: { id: string; name: string; pricePaisa: number; imageUrl: string | null }[];
  }[];
  /** published reviews of THIS product. `rating` is null until one exists —
   *  never a shop-wide or Google average wearing a product's name. */
  reviews: { rating: number | null; count: number };
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
        /*  DEC-PRD-025/026/027 — বিক্রির সংখ্যা, personalisation আর
            "Want this customised?" — তিনটেই product-এর নিজের সিদ্ধান্ত।  */
        salesSeedToday: true,
        salesSeedWeek: true,
        salesSeedMonth: true,
        salesSeedAll: true,
        salesSeedAt: true,
        salesWindow: true,
        persoTitle: true,
        persoText: true,
        persoTextLabel: true,
        persoTextMax: true,
        persoTextHint: true,
        persoImage: true,
        persoImageLabel: true,
        persoImageHint: true,
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
            /*  the parent's heading is the fallback: "Roses" inherits "Bouquet
                Size" from Fresh Flowers rather than making the owner type it
                again on all forty-four sub-categories  */
            parent: {
              select: {
                id: true,
                slug: true,
                name: true,
                sizeLabel: true,
                /*  DEC-PRD-023 — sub-category-তে কিছু না থাকলে parent-এরটা।
                    craft-এর সাথে একই সিঁড়ি: product → category → parent।  */
                trustBadges: {
                  where: { deletedAt: null, isActive: true },
                  orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
                  select: { icon: true, iconUrl: true, label: true, sub: true },
                },
                specRows: {
                  where: { deletedAt: null, isActive: true },
                  orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
                  select: { item: true, qty: true },
                },
              },
            },
            /*  DEC-PRD-023 — এই category-তে লেখা badge আর "What's inside"।
                product-এ নিজের কিছু না থাকলে এগুলোই যায়।  */
            trustBadges: {
              where: { deletedAt: null, isActive: true },
              orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
              select: { icon: true, iconUrl: true, label: true, sub: true },
            },
            specRows: {
              where: { deletedAt: null, isActive: true },
              orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
              select: { item: true, qty: true },
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
        /*  DEC-PRD-012 — এই product-এর রঙ / ফ্লেভার / মাপ। বন্ধ করে রাখা
            variant পাঠানো হয় না: মালিক OFF করা মানে গ্রাহক ওটা দেখবেই না।  */
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
          /*  DEC-PRD-023 — নিজের আপলোড করা icon-ও আসে।  */
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
      /*  DEC-PRD-027 — WhatsApp নম্বরটা এখান থেকেই, দুই জায়গায় দুটো নম্বর
          রাখার মানে নেই।  */
      company,
      craft,
      cutoffMinutesLeft,
      offers,
      ordersThisMonth,
      addonTabs,
      crossSell,
    ] = await Promise.all([
      this.rating(p.id),
      this.categoryFaqs(p.category.id),
      this.bundles(p.id, p.category.id),
      this.upgrades(p.id),
      this.prisma.db.companySetting.findFirst({ select: { publicPhone: true } }),
      this.craft(p.id, p.category.id, p.category.parent?.id ?? null),
      this.cutoffs(),
      this.offers(p.id, p.category.id, p.category.parent?.id ?? null),
      /*  ⚠️ বাছা সময়ের **নিজের** ঘরটা — মালিকের নিয়ম: আজকের জন্য এক
          সংখ্যা, মাসের জন্য আরেক।  */
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
        tagSlugs,
        manualGroupIds: p.manualAddOnGroups.map((g) => g.id),
      }),
      this.crossSell(p.id, p.category.id, tagSlugs),
    ]);

    /*
      ⚠️ DEC-PRD-028 — তারিখ দুটো এখানে থাকতেই হবে। ৩ আগস্ট এই দুটো লাইন
      বাদ পড়েছিল, ফলে গতকাল শেষ হওয়া ছাড় product page-এ বসেই ছিল: admin
      ৳2,400 দেখাত আর দোকান ৳2,160 নিত। `paidPaisa()` গেটটা চালায়, কিন্তু
      যা দেওয়া হয়নি তার উপর চালাতে পারে না।
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
      /*  ⚠️ শুধু Manual-এ। TRACKED product এমনিতেই gate-এর বাইরে
          (DEC-PDP-09), কারণ তাদের আসল গোনা Inventory-তে।  */
      variantStock: p.stockMode === 'MANUAL' ? p.variants.map(variantCount) : undefined,
    });

    return {
      slug: p.slug,
      name: p.name,
      shortDesc: p.shortDesc,
      typeText: p.typeText,
      pricePaisa: paidPaisa(money),
      unitSuffix: p.unit?.shortCode ?? null,
      mrpPaisa: mrpOrNull(money),
      zone: p.zone === 'NATIONWIDE' ? 'both' : 'dhaka',
      productType: p.productType as 'READYMADE' | 'CRAFTED',
      nature: {
        type: p.natureType === 'ARTIFICIAL' ? 'artificial' : 'fresh',
        label: p.natureLabel,
      },
      prepaidOnly: p.advanceRequired,
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
      /*  DEC-PRD-014 — variant থাকলে গোনাটা তাদের, তাই দেখানো সংখ্যাটাও
          তাদের যোগফল। মালিকের নিজের হাতে লেখা `displayQty` তার উপরেও
          চলে — ওটা বরাবরই একটা বিক্রির কথা, গোনা নয়।  */
      /*  ⚠️ Silenced whenever the availability gate says OUT_OF_STOCK —
          whatever showStock/displayQty say. See the comment above
          `availability`.  */
      stockQty:
        p.showStock && availability.state !== 'OUT_OF_STOCK'
          ? (p.displayQty ??
            /*  ⚠️ TRACKED হলে variant-এর হাতে লেখা সংখ্যাটা পড়া হয় না —
                DEC-PRD-015-এ তখন গোনাটা Inventory-র। যোগ করে দেখালে
                website একটা সংখ্যা বলত যা কেউ রাখেই না।  */
            (p.stockMode === 'MANUAL' && p.variants.length > 0
              ? p.variants.reduce((n, v) => n + variantCount(v), 0)
              : p.stockQty))
          : null,
      /*  DEC-PDP-09. The gate reads the REAL count — never `displayQty`. A
          made-up figure must not be able to open or close a till (owner,
          1 Aug). DEC-PRD-014 — variant থাকলে তাদের মজুদই দরজা খোলে বা
          বন্ধ করে; হিসাবটা `availabilityOf`-এর ভেতরে।  */
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
        DEC-PRD-012 — এক page, সব variant।

        ⚠️ দাম — DEC-PRD-031, মালিক ৮ আগস্ট ২০২৬: variant-এর **নিজের দাম
        থাকলে সেটাই চূড়ান্ত** — product-এর ছাড় তার উপর বসে না। আগে
        `paidPaisa()` দুটোতেই চলত, ফলে ৳2,400-এর সাপেক্ষে ঠিক করা FLAT
        ৳200 ছাড় ৳1,500-এর variant-এও বসে ৳1,300 দেখাত — মালিক ধরলেন,
        "আমি তো variant-এ কোনো discount দিইনি।" নিজের দাম না থাকলে
        product-এর (ছাড়সহ) দামই চলে। Checkout এই তালিকা থেকেই দাম নেয়,
        তাই নিয়মটা এক জায়গাতেই থাকে।

        ⚠️ ছবি: variant-এর নিজের ছবি → না থাকলে master-এর ছবি → না থাকলে
        null, আর তখন page product-এর মূল ছবিই রাখে। "লাল" বাছার পর সাদা
        গোলাপের ছবি দেখানোর চেয়ে ছবি না বদলানো ভালো।
      */
      variants: p.variants.map((v) => ({
        id: v.id,
        label: v.variantValue.label,
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
      })),
      sizes: p.sizes,
      /*  own heading → parent's → a plain word. Never blank: the size row
          would then open with a dash and nothing before it.  */
      sizeLabel: p.category.sizeLabel ?? p.category.parent?.sizeLabel ?? 'Size',
      bundle,
      upgrades,
      /*
        DEC-PRD-026 — দুটোর একটাও চালু না থাকলে `null`, আর page-এ অংশটাই
        আঁকা হয় না। লেখা না থাকলে সাধারণ শব্দ বসে — মালিককে প্রতিটা
        product-এ তিনটে বাক্য লিখতে বলা মানে ঘরগুলো ফাঁকাই থেকে যাওয়া।
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
                  }
                : null,
              image: p.persoImage
                ? {
                    label: p.persoImageLabel?.trim() || 'Your photo',
                    hint: p.persoImageHint?.trim() || '',
                  }
                : null,
            }
          : null,
      /*  DEC-PRD-027 — switch বন্ধ থাকলে বাক্সটাই নেই। নম্বর Company
          settings থেকে; সেখানে কিছু না থাকলে `null`, আর তখন page শুধু
          লেখাটা দেখায় — ভুয়া নম্বরে নিয়ে যাওয়ার চেয়ে সেটা সৎ।  */
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
      cutoffMinutesLeft,
      offers,
      ordersThisMonth,
      salesWindow: p.salesWindow,
      /*
        DEC-PRD-023 — product-এর নিজের → category-র → parent-এর।

        ⚠️ প্রথম যেটায় কিছু আছে সেটাই পুরোটা নেয়, **মেশানো হয় না** —
        bundle আর craft-এর হুবহু একই নিয়ম। মেশালে category-র "24 sticks"
        আর product-এর "50 sticks" পাশাপাশি বসত, আর গ্রাহক কোনটা বিশ্বাস
        করবেন সেটা page-টাই বলতে পারত না।
      */
      spec: pickList(p.specRows, p.category.specRows, p.category.parent?.specRows),
      /*  The product's own answers come first: "does this bouquet last a week"
          beats "how does delivery work" when somebody is holding a card.  */
      faqs: [
        ...p.faqs.map((f) => ({ ...f, scope: 'product' as const })),
        ...catFaqs.map((f) => ({ ...f, scope: 'category' as const })),
      ],
      /*  DEC-PRD-023 — একই সিঁড়ি। ⚠️ নাম নেই এমন badge বাদ, ঠিক craft-এর
          মতো: "Add a badge" চেপে কিছু না লিখে চলে গেলে website-এ একটা
          খালি বাক্স উঠত।  */
      /*  ⚠️ generic-টা হাতে লেখা: product-এর `icon` কলামটা NOT NULL আর
          category-রটা nullable, তাই TypeScript নিজে থেকে একটাই আকার
          বেছে নিতে পারে না।  */
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
    const agg = await this.prisma.db.review.aggregate({
      where: { productId, status: 'PUBLISHED', deletedAt: null },
      _avg: { rating: true },
      _count: { _all: true },
    });
    const count = agg._count._all;
    return {
      rating: count > 0 && agg._avg.rating !== null ? Math.round(agg._avg.rating * 10) / 10 : null,
      count,
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
   * its own sale price. That is what "একসাথে নিলে ছাড়" means to a shopper
   * looking at both pages, and the alternative (ignoring the product's own
   * discount) would show the bundle costing MORE than buying it separately.
   */
  /**
   * DEC-PRD-020 — এই product-এর বড় সংস্করণগুলো।
   *
   * ⚠️ শুধু বিক্রয়যোগ্যগুলো। একটা upgrade যদি draft হয় বা শেষ হয়ে যায়,
   * সেটা দেখানোর মানে হতো "৫০টা গোলাপ নিন" বলে তারপর ফোন করে ফিরিয়ে
   * নেওয়া — bundle card-এর সাথে হুবহু একই নিয়ম, একই কারণে।
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
        /*  DEC-PRD-014 — মজুদ variant-এ থাকতে পারে।  */
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
          /*  DEC-PRD-028 — মেয়াদ ফুরানো ছাড় upgrade-এর দামেও বসে না।  */
          discountStartsAt: u.discountStartsAt,
          discountEndsAt: u.discountEndsAt,
        }),
      }));
  }

  /*  ⚠️ DEC-PRD-016-এর `combos()` এখান থেকে উঠে গেছে — DEC-PRD-018-এ
      bundle নিজেই একটা তালিকা আর ছাড় তার নিচেই একটাই, তাই "ঠিক এই কটা
      বাছলে এই দাম" নামের দ্বিতীয় স্তরটার আর কাজ নেই। টেবিল দুটো
      database-এ আছে (কিছু মোছা হয় না), কেউ আর পড়ে না।  */
  private async bundles(productId: string, categoryId: string) {
    const rows = await this.prisma.db.bundle.findMany({
      where: {
        isActive: true,
        OR: [{ productId }, { categoryId }],
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        label: true,
        productId: true,
        discountType: true,
        discountValue: true,
        isBest: true,
        addsProduct: { select: BUNDLE_ADDS },
        /*  DEC-PRD-017 — এক bundle-এ কয়েকটা product।  */
        items: {
          orderBy: [{ sortOrder: 'asc' }],
          select: { addsProduct: { select: BUNDLE_ADDS } },
        },
      },
    });

    const own = rows.filter((b) => b.productId !== null);
    const list = own.length > 0 ? own : rows.filter((b) => b.productId === null);

    /*
      Out of stock disappears rather than greys out — owner's rule, 31 Jul.
      A card the shopper can see but not take is a promise the shop then has
      to withdraw by phone.

      ⚠️ DEC-PRD-017-এ card-এ কয়েকটা জিনিস থাকতে পারে, তাই নিয়মটা
      **যেকোনো একটা** না পাওয়া গেলেই card উধাও। অর্ধেক bundle পাঠানো মানে
      গ্রাহক তিনটের দাম দেখে দুটো পাবেন।
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
      DEC-PRD-018 — এক product = একটাই তালিকা, একটাই ছাড়।

      ⚠️ কয়েকটা সারি থাকলে (পুরনো তথ্য, তখন এক সারি = এক জিনিস) সবগুলোর
      জিনিস এক তালিকায় জোড়া লাগে আর ছাড় ধরা হয় প্রথম সারিরটা। মালিক
      admin-এ তালিকাটা একবার save করলেই সারিগুলো গুটিয়ে একটাই থাকে।
    */
    if (list.length === 0) return null;

    const seen = new Set<string>();
    const items = list
      .flatMap((b) => (b.items.length > 0 ? b.items.map((i) => i.addsProduct) : [b.addsProduct]))
      /*  একই জিনিস দুই সারিতে থাকলে একবারই — নাহলে গ্রাহক একই কেক দুবার
          দেখতেন, আর দুবার দামও গুনতেন।  */
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
          /*  DEC-PRD-028 — bundle-এর card-এও একই মেয়াদ।  */
          discountStartsAt: p.discountStartsAt,
          discountEndsAt: p.discountEndsAt,
        }),
      }));

    if (items.length === 0) return null;

    return {
      /*  ⚠️ ছাড় বসানোর কাজটা page করে, এখানে নয় — আর সেটা ইচ্ছাকৃত।
          মালিকের নিয়ম (DEC-PRD-018): ছাড় বসে **main সহ** মোট দামের উপর,
          কিন্তু গ্রাহক কোনগুলো নেবেন সেটা এখানে জানা নেই। তাই কাঁচা
          সংখ্যা যায়, আর হিসাবটা এক জায়গায়: `_data/bundlePricing.ts`.  */
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
          ⚠️ নাম নেই এমন card পাঠানো হয় না — ২ আগস্ট ২০২৬-এ ধরা পড়েছে।
          "Add a card" চেপে কিছু না লিখে চলে গেলে একটা খালি সারি থেকে যায়,
          আর website সেটা একটা **খালি সাদা বাক্স** হিসেবে এঁকে দিত। দোকান
          বুঝতেই পারত না কোথা থেকে এল।

          ⚠️ ভরাটগুলো ফেলে দেওয়া হয় না, শুধু খালিটা বাদ — তাই ভুল করে একটা
          খালি card রেখে দিলেও বাকি দুটো ঠিকই দেখা যায়।
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
   * DEC-PRD-025 — মালিকের বসানো সংখ্যা + বাছা সময়ের সত্যিকারের বিক্রি।
   *
   * মালিক, ২ আগস্ট ২০২৬: *"প্রথমে একটা fake sale account বসাব... তারপর real
   * sell হলে সেই সংখ্যার সাথে add হবে। আমাদের stock-এর মতো।"*
   *
   * ⚠️ আগে এই function শুধু গত ৩০ দিনের সত্যিকারের order গুনত, আর ১০-এর কম
   * হলে `null` — অর্থাৎ মালিকের লেখা সংখ্যাটা page-এ কোনোদিন উঠত না। তিনি
   * সেটাই ধরেছেন।
   *
   * ⚠️ `salesSeed`, `salesCount` নয়। `salesCount` বিক্রি হলে বাড়ে, তাই ওটাকে
   * শুরুর সংখ্যা ধরলে সপ্তাহের হিসাবে পুরনো বিক্রি দুবার গোনা হতো।
   *
   * ⚠️ ১০-এর নিচে লুকানোর নিয়মটা **শুধু তখনই** খাটে যখন মালিক নিজে কিছু
   * বসাননি। "৩ orders this month" কেনার বিরুদ্ধে যুক্তি — কিন্তু সেটা
   * আমাদের সিদ্ধান্ত, মালিকের সংখ্যা চাপা দেওয়ার অজুহাত নয়।
   */
  /**
   * মালিকের বসানো সংখ্যাটা এখনো গোনা হবে কি না — DEC-PRD-025।
   *
   * ⚠️ TODAY মানে **আজকের দিন**, "গত ২৪ ঘণ্টা" নয়। মালিকের কথা *"daily এটা
   * restart হওয়াই ভালো"* — রাত ১২টা মানে রাত ১২টা। ২৪ ঘণ্টা ধরলে রাত ৮টায়
   * বসানো সংখ্যা পরদিন সকাল ৭টাতেও দেখাত, আর সেটাই তিনি থামাতে বলেছেন।
   *
   * ⚠️ দিনটা **বাংলাদেশ সময়ে**। server অন্য দেশে থাকলে UTC-র মধ্যরাত ঢাকার
   * সন্ধ্যা ৬টা — সংখ্যাটা দিনের মাঝখানে উধাও হয়ে যেত।
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
      ⚠️ মালিকের সংখ্যাটার একটা মেয়াদ আছে — DEC-PRD-025, ২ আগস্ট ২০২৬:
      *"always যদি মানুষ দেখে today 10 sale, তাহলে Google আর মানুষের কাছে
      এটা fake হয়ে যাবে। daily এটা restart হওয়াই ভালো।"*

      TODAY-র সংখ্যা কেবল সেই দিনটাতেই, WEEK ৭ দিন, MONTH ৩০ দিন। ALL-এর
      কোনো মেয়াদ নেই — ওটা জমতে থাকা মোট, আর সেটাই মালিক চেয়েছেন।

      ⚠️ সংখ্যাটা মুছে ফেলা হয় না, শুধু গোনা হয় না। মালিক ঢুকে আবার save
      করলেই ঘড়িটা নতুন করে শুরু — তাঁর নিজের কথা: *"আবার আমাদের যদি দরকার
      হয়, product-এ ঢুকে আমরা আবার সংখ্যা add করব।"*

      ⚠️ `seedAt` না থাকলে (পুরনো সারি) সংখ্যাটা গোনা হয় না। জানা নেই কবে
      বসানো হয়েছিল, আর অজানা তারিখের ভিত্তিতে "আজ ১০টা বিক্রি" বলা ঠিক
      সেই মিথ্যাটাই যেটা মালিক থামাতে বলেছেন।
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
    /*  মালিক কিছু বসাননি, আর সত্যিকারের বিক্রিও কম — তখন চুপ থাকাই ভালো।  */
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
        discountType: true,
        discountValue: true,
        imageUrl: true,
        isActive: true,
        stockQty: true,
      },
    });
    return rows.map((a) => ({
      id: a.id,
      name: a.name,
      pricePaisa: paidPaisa({
        sellingPricePaisa: a.pricePaisa,
        discountType: a.discountType as 'NONE' | 'FLAT' | 'PERCENT',
        discountValue: a.discountValue,
      }),
      imageUrl: bareImageUrl(a.imageUrl),
      /** false → the cart can say so; it does not remove the line itself */
      available: a.isActive && (a.stockQty === null || a.stockQty > 0),
    }));
  }

  /** D-CAT-03 — "flowers, generally". Merged under the product's own answers. */
  private categoryFaqs(categoryId: string) {
    return this.prisma.db.categoryFaq.findMany({
      where: { categoryId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { question: true, answer: true },
    });
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
                discountType: true,
                discountValue: true,
                imageUrl: true,
                isActive: true,
                deletedAt: true,
                stockQty: true,
              },
            },
          },
        },
      },
    });

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
          .filter((a) => a.isActive && a.deletedAt === null && (a.stockQty === null || a.stockQty > 0))
          .map((a) => ({
            id: a.id,
            name: a.name,
            pricePaisa: paidPaisa({
              sellingPricePaisa: a.pricePaisa,
              discountType: a.discountType as 'NONE' | 'FLAT' | 'PERCENT',
              discountValue: a.discountValue,
            }),
            imageUrl: bareImageUrl(a.imageUrl),
          })),
      }))
      /*  An empty tab is worse than a missing one — it reads as a page that
          failed to load half of itself.  */
      .filter((g) => g.items.length > 0);
  }

  /**
   * "You may also like" — AUTO, the same answer D-CAT-02 gave on the category
   * page: shared occasion, a DIFFERENT category, best sellers first.
   *
   * Different category on purpose. Six more bouquets under a bouquet is a
   * shopper comparing instead of buying; a cake under a bouquet is a bigger
   * order. This is the rule the mock `crossSellFor()` already used — kept, so
   * connecting the page does not quietly change what it recommends.
   *
   * ⚠️ IT CAN COME BACK EMPTY, AND THAT IS ALLOWED. A shop selling only
   * flowers has no other category to draw from. The rail then does not render
   * at all — better than relaxing the rule and filling it with six more
   * bouquets, which turns a buying decision back into a browsing one.
   *
   * The cards themselves are built by `ShopCatalogService`, the same builder
   * the category grid uses, so a product looks the same wherever it appears.
   */
  private async crossSell(productId: string, categoryId: string, tagSlugs: string[]) {
    const rows = await this.prisma.db.product.findMany({
      where: {
        ...LIVE,
        id: { not: productId },
        categoryId: { not: categoryId },
        ...(tagSlugs.length > 0 ? { tags: { some: { slug: { in: tagSlugs }, isActive: true } } } : {}),
      },
      orderBy: [{ isBestSeller: 'desc' }, { salesCount: 'desc' }, { createdAt: 'desc' }],
      take: 6,
      select: { id: true },
    });
    return this.catalog.cardsByIds(rows.map((r) => r.id));
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
