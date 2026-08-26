import { baseFor, type ShopProduct } from "./shop";
import { SHOP_TAG } from "./cacheTags";
import type { Occasion, Product, ProductBadge, ProductCategory, Recipient } from "./products";
import {
  CAT_META,
  TEMPLATES,
  asIconName,
  guard,
  type AddonItem,
  type ProductDetail,
} from "./productDetails";

/*
  ═══════════════════════════════════════════════════════════════════════════
  API → the shape the product page has always been given.

  Written beside `categoryApi.ts`, which does the same job for the category
  page, and for the same reason: `productDetails.ts` said so itself —

      ⇄ SWAP HERE — the inside of this function becomes a fetch().
      Not one line changes in any component.

  Six components read `ProductDetail`. This file returns exactly that object,
  so none of them changes.

  ⚠️ THE FALLBACK RULE IS THE OPPOSITE OF EVERY OTHER GETTER.

  A category rail that cannot be read falls back to its hard-coded list, and a
  stale rail still sells flowers. A PRODUCT does not get that treatment. Falling
  back to the mock catalogue would put 71 invented bouquets, at invented prices,
  on a live shop that does not stock one of them. When the catalogue cannot be
  read this returns null and the page 404s — a visible failure instead of an
  invisible lie. That is the rule `_data/shop.ts` states above `ShopProduct`,
  and the reason the category page was left 404ing on 30 Jul.

  WHAT STILL COMES FROM THE CATEGORY TEMPLATE, AND WHY IT IS ALLOWED.

  Four things below are read from `TEMPLATES` rather than the API: the size
  heading, the "why us" cards, the customisation invitation, and the
  out-of-zone sentence. All four are SHOP COPY — sentences about how Radian
  works, true of every bouquet, and each has an audit row of its own
  (`RADIAN_PRODUCT_PAGE_AUDIT.md` §3). None of them is a claim about stock or
  price, which is the line that matters. They move to the admin as those rows
  are closed.
  ═══════════════════════════════════════════════════════════════════════════
*/

interface ApiSize {
  id: string;
  label: string;
  sub: string | null;
  pricePaisa: number;
}

interface ApiVariantOption {
  slug: string;
  label: string;
  swatch: string | null;
  imageUrl: string | null;
  active: boolean;
}

/*  `SPEED_CLAIM_LABELS` removed with DEC-PRD-034 (9 Aug 2026). It existed to
    strip speed promises out of the template badge list; there is no template
    badge list any more, so there is nothing left to filter.  */

/** the one speed badge this product has earned, or null if it has earned none */
function deliveryTrust(a: ApiProductDetail) {
  if (a.zone !== "dhaka")
    return { icon: "truck" as const, label: "Nationwide Delivery", sub: "64 districts" };
  if (a.supportsExpress)
    return { icon: "bolt" as const, label: "2-Hour Delivery", sub: "inside Dhaka" };
  if (a.supportsSameDay)
    return { icon: "sun" as const, label: "Same Day", sub: "order before 6 PM" };
  if (a.supportsMidnight)
    return { icon: "moon" as const, label: "Midnight Delivery", sub: "12:00 AM sharp" };
  return null;
}

export interface ApiProductDetail {
  slug: string;
  name: string;
  /** DEC-PRD-031, 6 Aug — the API always sent this, but `guard()` below never
   *  read it, so the owner could not see his own text on the PDP at all. */
  shortDesc: string | null;
  typeText: string | null;
  pricePaisa: number;
  unitSuffix: string | null;
  mrpPaisa: number | null;
  /** DEC-PRD-042 — when the offer ends, so the page can say so */
  offer?: { endsAtMs: number | null; startsAtMs: number | null; percentOff: number } | null;
  /** DEC-PRD-035 — headline is the cheapest variant, page says "from" */
  priceFrom?: boolean;
  zone: "dhaka" | "both";
  productType: "READYMADE" | "CRAFTED";
  nature: { type: "fresh" | "artificial"; label: string | null };
  prepaidOnly: boolean;
  /** DEC-PRD-050 — earned by 90 days of real sales in this category */
  bestSeller?: boolean;
  /** the category it is a best seller IN — "Best seller in Fresh Flowers" */
  bestSellerIn?: string | null;
  newArrival?: boolean;
  leadTimeDays: number | null;
  supportsExpress: boolean;
  supportsSameDay: boolean;
  supportsMidnight: boolean;
  nationwideMsg: string | null;
  stockQty: number | null;
  /** DEC-PDP-09 — the server's answer to "may they buy it" */
  availability:
    | { state: "IN_STOCK" }
    | { state: "OUT_OF_STOCK" }
    | { state: "PRE_ORDER"; backOn: string | null };
  videoId: string | null;
  images: string[];
  crumb: { catLabel: string; catSlug: string; subLabel: string | null; subSlug: string | null };
  colour: { label: string; swatch: string | null; imageUrl: string | null } | null;
  variant: { kind: "colour" | "flavour"; label: string; options: ApiVariantOption[] } | null;
  /** DEC-PRD-012 — variants inside one page, each with its own photo, price and stock */
  variants: {
    id: string;
    /**
     * DEC-PRD-045 — the values this one is made of, so the page can draw a
     * row of buttons per list. One part on a single-list product.
     */
    parts?: {
      valueId: string;
      label: string;
      attribute: string;
      attributeId: string;
      displayMode: string;
      swatch: string | null;
      imageUrl: string | null;
    }[];
    label: string;
    attribute: string;
    displayMode: string;
    swatch: string | null;
    imageUrl: string | null;
    pricePaisa: number;
    /** DEC-PRD-032 — the struck-through price while an offer runs */
    wasPaisa?: number | null;
    stockQty: number;
  }[];
  sizes: ApiSize[];
  sizeLabel: string;
  /** DEC-PRD-018 — one list, one discount. `null` = there is nothing to add. */
  bundle: {
    discountType: "NONE" | "FLAT" | "PERCENT";
    discountValue: number;
    items: { id: string; name: string; imageUrl: string | null; pricePaisa: number }[];
  } | null;
  /** DEC-PRD-020 — bigger versions of this one, each a separate product itself */
  upgrades: { slug: string; name: string; imageUrl: string | null; pricePaisa: number }[];
  /** DEC-PRD-026 — whether the customer may supply their own text or photo */
  perso: {
    title: string;
    text: { label: string; max: number | null; hint: string; required?: boolean } | null;
    image: { label: string; hint: string; required?: boolean } | null;
  } | null;
  /** DEC-PRD-027 — the "Want this customised?" box, phone number included */
  customise: { title: string; sub: string; whatsapp: string | null } | null;
  craft: { icon: string; title: string; text: string }[];
  /** DEC-WEB-011 — the promise band's heading, written on the category. */
  craftTitle?: string | null;
  /** DEC-WEB-011 — the small line above it, written on the category. */
  craftKicker?: string | null;
  cutoffMinutesLeft: { dhaka: number | null; nationwide: number | null };
  offers: { key: string; logo: string; color: string; text: string; code: string | null; note: string | null }[];
  underBuyText?: string | null;
  underBuyPreorderText?: string | null;
  journey?: string[];
  ordersThisMonth: number | null;
  /** DEC-PRD-025 — which period the number above covers */
  salesWindow: "TODAY" | "WEEK" | "MONTH" | "ALL";
  crossSell: ShopProduct[];
  spec: { item: string; qty: string }[];
  faqs: { question: string; answer: string; scope: "product" | "category" }[];
  /** DEC-PRD-023 — when `iconUrl` is filled, it is the shop's own image */
  trust: { icon: string | null; iconUrl?: string | null; label: string; sub: string | null }[];
  addonTabs: {
    id: string;
    label: string;
    items: {
      id: string;
      name: string;
      pricePaisa: number;
      /** DEC-PRD-049 — given away on purpose; the card says "Free" */
      isFree?: boolean;
      imageUrl: string | null;
    }[];
  }[];
  reviews: {
    rating: number | null;
    count: number;
    byStar: number[];
    items: {
      id: string; authorName: string; rating: number; body: string;
      context: string | null; imageUrl: string | null;
      verifiedPurchase: boolean; createdAt: string;
    }[];
  };
  crossSlugs: string[];
  seo: {
    title: string | null;
    description: string | null;
    ogTitle: string | null;
    ogDescription: string | null;
    ogImageUrl: string | null;
    noIndex: boolean;
  };
}

/*
  Not routed through `shop.ts`'s `get()` — that helper is private to it, and
  this call wants a different failure story anyway. 404 and "API is down" are
  both `null` here, and the page treats both as "no such product". They are the
  same thing to a shopper standing in front of a page that has nothing on it.
*/
async function getJson<T>(path: string): Promise<T | null> {
  try {
    // `baseFor()`, not `API_BASE` — this page renders on the server, where
    // localhost:4000 is the web container itself. See the note in shop.ts.
    // 5 Aug: `no-store` → a 60 second cache — the reasoning is in shop.ts's
    // get(). The final truth on stock and price is checkout's server-side
    // pricing anyway.
    /*  DEC-WEB-004, 9 Aug 2026 — `tags` added. The 60 seconds is now only a
        **net**; the real work is done by the admin's save: the API then calls
        web to invalidate this tag, and the page is fresh immediately. The
        owner used to wait a minute or two and reload twice.  */
    const res = await fetch(`${baseFor()}${path}`, {
      next: { revalidate: 60, tags: [SHOP_TAG] },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Photography is still a launch dependency. Until then, the tinted panel the
 *  page has always drawn — never a grey box, which reads as a broken image. */
/** the small tile behind an add-on with no picture yet */
const GREY_TILE = "linear-gradient(150deg,#EFE4F7,#DDC9EC)";

const PLACEHOLDER = [
  "linear-gradient(150deg,#F7E4F1,#EBC7E4)",
  "linear-gradient(150deg,#EFE4F7,#DDC9EC)",
  "linear-gradient(150deg,#FBEAF0,#F4C0D1)",
  "linear-gradient(150deg,#EFE4F7,#DDC9EC)",
];

/**
 * The admin's category slug, mapped onto the eight the mock knew.
 *
 * ⚠️ ONLY USED TO PICK THE COPY TEMPLATE, never to price or place anything. A
 * category the owner invents ("corporate-hampers") has no template of its own,
 * so it borrows the flower one and gets a size heading that reads "Bouquet
 * Size". That is the visible edge of audit §3c — the templates belong in the
 * admin, on the category, and this line disappears when they get there.
 */
function templateKey(catSlug: string): ProductCategory {
  const known = Object.keys(TEMPLATES) as ProductCategory[];
  const hit = known.find((k) => k === catSlug || CAT_META[k]?.slug === catSlug);
  return hit ?? "flowers";
}

/**
 * ⇄ THE SWAP. `getProductDetail(slug)` reads the mock; this reads the shop.
 *
 * Returns null when there is no such published product, which the route turns
 * into a 404. Nothing here falls back to the mock catalogue — see the header.
 */
export async function fetchProductDetail(slug: string): Promise<ProductDetail | null> {
  const a = await getJson<ApiProductDetail>(`/shop/products/${encodeURIComponent(slug)}`);
  if (!a) return null;

  const t = TEMPLATES[templateKey(a.crumb.catSlug)];

  /*  `guard()` wraps the returned object below — see the end of this
      function. A product saved with no sizes is normal in the admin and used
      to take this page down with it.  */

  /*
    A cut-down `Product`. The page reads exactly three fields off it — name,
    slug and zone (checked with grep before writing this, not assumed) — and
    the rest exist because the interface asks for them. Filling `stars` and
    `meta` with invented strings is what this whole exercise is removing, so
    they are given the honest empty value instead.
  */
  const product: Product = {
    slug: a.slug,
    name: a.name,
    pricePaisa: a.pricePaisa,
    cat: templateKey(a.crumb.catSlug),
    sub: a.crumb.subSlug ?? undefined,
    zone: a.zone,
    badge: a.supportsMidnight ? "midnight" : a.zone === "dhaka" ? "express" : "courier",
    stars: "",
    meta: "",
    /*  5 Aug — the real photo. This was stuck on the placeholder, which is why
        cart and checkout never showed a product's photo even when one had been
        uploaded.  */
    bg: a.images[0] ? `url(${a.images[0]}) center/cover` : PLACEHOLDER[0],
    /*  DEC-PRD-050 — the API answers this now; it was hardcoded false, so a
        best seller in the cart or the wishlist lost its badge on the way.  */
    best: a.bestSeller ?? false,
    exp: a.supportsExpress,
    sd: a.supportsSameDay,
    mn: a.supportsMidnight,
    neu: a.newArrival ?? false,
    prepaidOnly: a.prepaidOnly,
  };

  return guard({
    product,
    crumb: {
      catLabel: a.crumb.catLabel,
      catSlug: a.crumb.catSlug,
      /*  The crumb has a fixed number of rungs. A product filed straight under
          "Fresh Flowers" has no middle one, so the top name is repeated rather
          than leaving a bare "›" hanging in the trail.  */
      subLabel: a.crumb.subLabel ?? a.crumb.catLabel,
      short: a.name.split("—")[0].trim(),
    },
    nature: {
      type: a.nature.type,
      /*  The nature line is the customer's first question — fresh or
          artificial. If the owner left the sentence blank, the template's
          wording stands in; the TYPE is still his, so the answer is never
          wrong, only less specific.  */
      label: a.nature.label ?? t.nature(product).label,
    },
    /*  DEC-PRD-031 — the one line under the title. It said "On cards only"
        because this field reached nowhere on the PDP, even though the API
        always sent it (owner, 6 Aug: "ata dorkar bolei to rakhsi" — "I keep it
        precisely because it is needed"). An empty string means the line does
        not appear on the page at all; nothing invented is shown.  */
    shortDesc: a.shortDesc?.trim() || null,
    /*  ⚠️ IT USED TO READ THE ZONE AND NOTHING ELSE:

            a.zone === "dhaka" ? "30–120 Min Delivery" : "Delivered Nationwide"

        So EVERY Dhaka product advertised two-hour delivery on its own page,
        whether or not the shop had ticked express for it — the most visible
        lie on the whole page, in green, above the price. It now says the
        fastest thing the product can ACTUALLY do, and says nothing at all when
        it can do none of them, which is the honest answer for a made-to-order
        hamper that only ships on a scheduled day. (Owner, 1 Aug 2026.)  */
    /*  ⚠️ "30–120 Min" removed, 3 Aug 2026 — the express promise is 180
        minutes in the admin, so this chip contradicted the delivery step two
        clicks later. The chip names the SERVICE; the exact promise ("within 3
        hours") belongs to the delivery masters and shows where the customer
        picks it. `supportsExpress` already answers "does this product qualify",
        which is all a product chip can truthfully say.  */
    deliveryChip:
      a.zone !== "dhaka"
        ? "Delivered Nationwide"
        : a.supportsExpress
          ? "Express Delivery"
          : a.supportsSameDay
            ? "Same-day in Dhaka"
            : a.supportsMidnight
              ? "Midnight delivery"
              : null,
    speeds: {
      express: a.supportsExpress,
      sameDay: a.supportsSameDay,
      midnight: a.supportsMidnight,
    },
    /*  ⚠️ `gallery` entries are CSS BACKGROUND values, not image addresses —
        the page draws every tile with `style={{ background: … }}`. The mock's
        gradients worked because a gradient IS a background; a bare URL is not,
        so the first real photographs uploaded saved correctly, reached this
        line, and rendered as nothing at all. Wrapped in `url()` here, at the
        seam, rather than teaching six components a second shape.  */
    gallery:
      a.images.length > 0
        ? a.images.map((u) => `url(${u}) center/cover no-repeat`)
        : PLACEHOLDER,
    videoId: a.videoId ?? undefined,
    /*
      ⚠️ THE FALLBACK BADGES CLAIMED A SPEED TOO, AND IT WAS THE SAME LIE.
      When the shop has set no trust badges of its own, the category template
      supplies three — and the first is hard-coded `p.zone === "dhaka" ?
      "2-Hour Delivery" : "Nationwide Delivery"`. So a basket with express
      deliberately unticked still carried a lightning bolt and the words
      "2-Hour Delivery · inside Dhaka" under its photograph, even after the
      green chip above the price had been fixed to say "Same-day in Dhaka".
      One page, two answers.

      The template's speed claim is dropped and replaced with what the product
      can actually do. Badges the owner set HIMSELF are never touched — if he
      typed it, he meant it, and second-guessing his words is not this seam's
      job.
    */
    /*  DEC-PRD-034, owner 9 Aug 2026 (translated): *"when there is no trust
        badge, faq or inside, it puts something there automatically on its own
        — why is it doing this?"*

        ⚠️ The template's invented badges were removed. They were not the
        shop's words but words written in code — and the "4.9 on Google · 412
        real reviews" number came from nowhere at all. A shop does not say what
        its owner did not write. When empty, the section is not drawn.

        ⚠️ The delivery badge stayed, because it is not invented — it is read
        off the product's own three tick-boxes, and so it is always true.  */
    trust:
      a.trust.length > 0
        ? a.trust.map((x) => ({
            icon: asIconName(x.icon ?? ""),
            iconUrl: x.iconUrl ?? null,
            label: x.label,
            sub: x.sub ?? "",
          }))
        : deliveryTrust(a)
          ? [deliveryTrust(a)!]
          : [],
    variant: a.variant
      ? {
          kind: a.variant.kind,
          label: a.variant.label,
          options: a.variant.options.map((o) => ({
            slug: o.slug,
            label: o.label,
            /*  A colour with no swatch would render an invisible button. The
                page's own neutral is safer than a black circle claiming to be
                a colour nobody chose.  */
            swatch: o.swatch ?? o.imageUrl ?? "#DDC9EC",
            active: o.active,
          })),
        }
      : null,
    /*
      DEC-PRD-012 — passed straight through, because the server has already
      done the arithmetic: the discounted price, and the master's photo when
      there is none of its own.

      ⚠️ `?? []` is needed — on an older API (before a restart) the field does
      not arrive, and `.map` on it turned the whole page white.
    */
    variants: a.variants ?? [],
    sizes: a.sizes.map((s) => ({
      id: s.id,
      label: s.label,
      sub: s.sub ?? undefined,
      pricePaisa: s.pricePaisa,
    })),
    sizeLabel: a.sizeLabel,
    /*
      DEC-PRD-018 — one list, one discount. The cards are the list's items, and
      the discount travels separately on `bundle`.

      `bg` is the tinted panel behind the card until the added product has a
      photo. The image itself, when there is one, comes through `imageUrl`.
    */
    bundles: (a.bundle?.items ?? []).map((i, n) => ({
      id: i.id,
      label: i.name,
      pricePaisa: i.pricePaisa,
      bg: i.imageUrl ? `url(${i.imageUrl}) center/cover` : PLACEHOLDER[n % PLACEHOLDER.length],
    })),
    /*  ⚠️ `?? null` — on an older API the field does not arrive, and trying to
        apply the discount broke the page.  */
    bundle: a.bundle ?? null,
    /*  DEC-PRD-024 — Search & sharing's six fields. Not `?? null`; the whole
        object is passed through — the page decides for itself which are
        empty.  */
    seo: a.seo,
    /*  DEC-PRD-020 — the bigger versions. The photo becomes CSS right here,
        because every other image on the page is drawn in that same form.  */
    upgrades: (a.upgrades ?? []).map((u) => ({
      slug: u.slug,
      name: u.name,
      pricePaisa: u.pricePaisa,
      bg: u.imageUrl ? `url(${u.imageUrl}) center/cover` : PLACEHOLDER[0],
    })),
    bundleHint: t.bundleHint,
    /*
      `addonTabs` stays empty: it is a list of tab IDs that only mean something
      in `productDetails.ts`. The real tabs go in `addonGroups`, which carries
      the add-ons themselves — and which the cart can now price, because
      `resolveCart` reads them from the API too.
    */
    addonTabs: [],
    addonGroups: a.addonTabs.map((g) => ({
      id: g.id,
      label: g.label,
      items: g.items.map((i) => ({
        key: i.id,
        name: i.name,
        pricePaisa: i.pricePaisa,
        isFree: i.isFree === true,
        bg: i.imageUrl ? `url(${i.imageUrl}) center/cover` : GREY_TILE,
        /*  Every database add-on is a catalog row the owner maintains. The
            flag existed to separate those from the mock's inline services
            (a card, a wrap) that were never rows anywhere.  */
        fromCatalog: true,
      })),
    })),
    /*
      DEC-PRD-026 — Owner, 2 Aug 2026 (translated): *"a customise product needs
      somewhere to upload an image and somewhere to write text — I could not
      find where to configure that."*

      ⚠️ This line used to read simply `perso: null`. Which meant that whether
      or not the fields existed in the admin, that box **never** appeared on the
      product page. Cart, checkout and order were already carrying the text and
      the image — one line in the middle had the whole thing switched off.
    */
    perso: a.perso
      ? {
          title: a.perso.title,
          fields: [
            ...(a.perso.text
              ? [
                  {
                    type: "text" as const,
                    label: a.perso.text.label,
                    max: a.perso.text.max ?? undefined,
                    hint: a.perso.text.hint,
                    /*  DEC-PRD-048 — the page used to print "required" beside
                        this section with nothing behind the word.  */
                    required: a.perso.text.required === true,
                  },
                ]
              : []),
            ...(a.perso.image
              ? [
                  {
                    type: "upload" as const,
                    label: a.perso.image.label,
                    hint: a.perso.image.hint,
                    required: a.perso.image.required === true,
                  },
                ]
              : []),
          ],
        }
      : null,
    /*  DEC-PRD-027 — `null` when switched off, and the page does not draw the box.  */
    customise: a.customise,
    spec: a.spec.map((r) => ({ item: r.item, qty: r.qty })),
    /*  DEC-PRD-034 — the template fallback is gone (owner, 9 Aug 2026).
        The old note said a stale sentence costs nothing. It was wrong: the
        fresh-flower template ("Cut this morning · market run before sunrise,
        no cold-storage roses") was appearing under an ARTIFICIAL bouquet.
        That is not stale copy, it is a false claim about the goods. Written
        by the shop or not shown at all.  */
    craft: a.craft.map((c) => ({ icon: asIconName(c.icon), title: c.title, text: c.text })),
    craftTitle: a.craftTitle ?? null,
    craftKicker: a.craftKicker ?? null,
    cutoffMinutesLeft: a.cutoffMinutesLeft,
    /*  No template fallback, unlike the craft cards. A stale sentence about
        how flowers are wrapped costs nothing; a cashback offer the shop is not
        actually running costs a customer who paid with bKash expecting ৳300
        back. Nothing running → the strip is absent.  */
    underBuyText: a.underBuyText ?? null,
    underBuyPreorderText: a.underBuyPreorderText ?? null,
    journey: a.journey ?? [],
    offers: a.offers.map((o) => ({
      logo: o.logo,
      color: o.color,
      text: o.text,
      code: o.code ?? undefined,
      note: o.note ?? undefined,
    })),
    faqs: a.faqs.map((f) => ({ q: f.question, a: f.answer })),
    custom: t.custom,
    /*  Kept for the type, and empty. The rail is fed by `crossProducts` below
        now — a slug would send `RelatedRail` looking through the mock
        catalogue, which is the one place it must not look.  */
    crossSlugs: [],
    ozReason: a.nationwideMsg ?? t.ozReason,
    reviews: {
      rating: a.reviews.rating === null ? null : a.reviews.rating.toFixed(1),
      count: a.reviews.count,
      byStar: a.reviews.byStar ?? [0, 0, 0, 0, 0],
      items: a.reviews.items ?? [],
      /*
        DEC-PRD-025 — the owner's threshold plus the real orders in the chosen
        period. If he sets nothing, the API sends `null` below 10 and the line
        does not appear at all — a small true number argues against the
        product.

        ⚠️ The wording now **matches the period**. "orders this month" used to
        be hand-written here, so the page talked about the month even when the
        owner had chosen "Today" — a number from one place and a word from
        another is exactly how a lie gets born.
      */
      live:
        a.ordersThisMonth === null
          ? null
          : `${a.ordersThisMonth} ${
              a.salesWindow === "TODAY"
                ? "orders today"
                : a.salesWindow === "WEEK"
                  ? "orders this week"
                  : a.salesWindow === "ALL"
                    ? "orders so far"
                    : "orders this month"
            }`,
    },
    mrpPaisa: a.mrpPaisa,
    /*  ⚠️ Forgetting this one line is exactly how the dates stayed invisible
        for a week: the API sent them, nothing carried them across.  */
    offer: a.offer ?? null,
    priceFrom: a.priceFrom,
    unitSuffix: a.unitSuffix,
    /*  Checkout reads this to work out the earliest date and to grey out
        express/same-day. Sent by the API all along; this line is what was
        missing.  */
    leadTimeDays: a.leadTimeDays,
    /*  DEC-PRD-050 — the badges, straight through. The page draws them as a
        quiet line beside the rating, never as a ribbon on the photograph.  */
    bestSeller: a.bestSeller ?? false,
    bestSellerIn: a.bestSellerIn ?? null,
    newArrival: a.newArrival ?? false,
    stockLeft: a.stockQty,
    /*  DEC-PDP-09 — passed straight through, never recomputed here. The
        server owns "may they buy it"; the browser is the last place that
        should be allowed a second opinion about it.  */
    availability: a.availability,
    crossProducts: a.crossSell.map(toMockProduct),
  });
}

/**
 * Add-ons by id, for the cart.
 *
 * The cart stores only which add-ons were ticked, never their prices, so that
 * a price change reaches a cart filled yesterday. This is how it turns those
 * ids back into money.
 *
 * An id the shop no longer knows is simply absent from the answer, and the
 * cart drops it from the line — the same thing that happens to a deleted size.
 */
export async function fetchAddons(ids: string[]): Promise<AddonItem[]> {
  if (ids.length === 0) return [];
  const rows = await getJson<
    { id: string; name: string; pricePaisa: number; imageUrl: string | null; available: boolean }[]
  >(`/shop/addons?ids=${ids.map(encodeURIComponent).join(",")}`);
  if (!rows) return [];
  return rows.map((a) => ({
    key: a.id,
    name: a.name,
    pricePaisa: a.pricePaisa,
    bg: a.imageUrl ? `url(${a.imageUrl}) center/cover` : GREY_TILE,
    fromCatalog: true,
  }));
}

/**
 * A card from the API in the shape `ProductCard` has always been handed.
 *
 * The two are nearly the same object — `ShopProduct` was written from this
 * interface — so this is a rename and two casts, not a translation. `cat`,
 * `occ` and `rec` are open strings on the API (the owner can invent a category
 * or a tag) and closed unions here, which is the mock's memory of a fixed
 * catalogue. They are used for filtering and links, never for prices, so the
 * cast is safe; the unions go when the mock does.
 */
function toMockProduct(c: ShopProduct): Product {
  return {
    slug: c.slug,
    name: c.name,
    pricePaisa: c.pricePaisa,
    priceFrom: c.priceFrom,
    cat: c.cat as ProductCategory,
    sub: c.sub ?? undefined,
    zone: c.zone,
    badge: c.badge as ProductBadge,
    stars: c.stars,
    meta: c.meta,
    /*  A real photo wins; the API's gradient is the fallback it already
        chose for a product without one.  */
    bg: c.imageUrl ? `url(${c.imageUrl}) center/cover` : c.bg,
    best: c.best,
    exp: c.exp,
    sd: c.sd,
    mn: c.mn,
    neu: c.neu,
    occ: c.occ as Occasion[],
    rec: c.rec as Recipient[],
    prepaidOnly: c.prepaidOnly,
  };
}
