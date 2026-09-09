import { SHOP_TAG } from "./cacheTags";
/*
  ═══════════════════════════════════════════════════════════════════════════
  Storefront → API client. The first one in `apps/web`.

  Until 30 Jul 2026 this app made no API calls at all — every page ran on the
  hard-coded files beside this one. This is the seam those files were written
  for; `_data/search.ts` says so in its own comment:

      it will be `fetch('/api/search?q=')`; not a line in a component changes.

  So the rule for everything added here: **the shape a component receives does
  not change.** A component asks for the same thing it always asked for; only
  what happens inside these functions changes. That is what keeps this
  migration from touching eighty components.

  Reads only. Cart, checkout and review submission are writes and wait on the
  Ecommerce module lock.
  ═══════════════════════════════════════════════════════════════════════════
*/

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export interface ShopCategory {
  slug: string;
  name: string;
  summary: string | null;
  imageUrl: string | null;
  iconUrl: string | null;
  isFeatured: boolean;
  showOnNavbar: boolean;
  /** which zone's homepage rail carries this card — null = both */
  zone: string | null;
  sortOrder: number;
  /** published products only — drafts are not advertised */
  productCount: number;
  /** of those, how many ship by courier. 0 → hidden in the nationwide zone */
  nationwideCount: number;
  children: {
    slug: string;
    name: string;
    imageUrl: string | null;
    sortOrder: number;
  }[];
}

/*
  A shopper must never see a broken page because the API is slow or down.

  Every getter here returns `null` on failure rather than throwing, and each
  caller keeps its existing hard-coded list as the fallback it renders instead.
  That is deliberate: a stale category rail sells flowers, an error boundary
  does not. The console warning is for us, not for them.
*/
/*
  TWO ADDRESSES FOR ONE API, and the difference cost an afternoon on 31 Jul.

  The browser reaches the API at localhost:4000 because Docker publishes that
  port to the host. A page rendering INSIDE the web container cannot: there,
  `localhost` is the web container itself and nothing answers on 4000. Docker
  resolves the service name instead, which is what `API_INTERNAL_URL` holds.

  It never came up while every fetch happened in the browser. The category page
  renders on the server (D-CAT-05), so the first thing it did was ask an
  address that does not exist and 404 a category that was sitting right there
  in the database.

  Unset outside Docker → falls back to the public URL, which is correct there.
*/
export const baseFor = (): string =>
  typeof window === "undefined" ? process.env.API_INTERNAL_URL || API_BASE : API_BASE;

async function get<T>(path: string): Promise<T | null> {
  try {
    /*  5 Aug — this was `no-store`, and that is what kept the shop slow: on
        every page change the server called the free Render API again (hundreds
        of ms per call). It is also why the admin felt fast — it is an SPA and
        does not fetch on a page change.

        All of these are public catalogue/content reads — nobody is harmed by
        them being 60 seconds stale (prices are verified server-side at checkout
        anyway, per the DEC). content.ts and seo.ts already ran on the same
        60-second rule. Cart/checkout/track fetches live in checkoutApi.ts and
        stay `no-store`, as they should.  */
    const res = await fetch(`${baseFor()}${path}`, {
      next: { revalidate: 60, tags: [SHOP_TAG] },
    });
    if (!res.ok) {
      console.warn(`[shop] ${path} → ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (e) {
    console.warn(`[shop] ${path} failed`, e);
    return null;
  }
}

/**
 * The same read, but telling "no such thing" apart from "could not ask".
 *
 * A page that only gets `null` back cannot choose between a 404 and an error
 * state — and the category page must: a slug nobody made is a real 404, an API
 * that is down is not, and showing invented content for either is out (owner,
 * 6 Sep 2026).
 */
export type Fetched<T> = { ok: true; data: T } | { ok: false; status: number | null };

async function getResult<T>(path: string): Promise<Fetched<T>> {
  try {
    const res = await fetch(`${baseFor()}${path}`, { next: { revalidate: 60, tags: [SHOP_TAG] } });
    if (!res.ok) {
      console.warn(`[shop] ${path} → ${res.status}`);
      return { ok: false, status: res.status };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch (e) {
    console.warn(`[shop] ${path} failed`, e);
    return { ok: false, status: null };
  }
}

export const getShopCategories = () => get<ShopCategory[]>("/shop/categories");

export type BannerPlacement = "HERO" | "PROMO" | "ANNOUNCEMENT";

export interface ShopBanner {
  id: string;
  placement: BannerPlacement;
  eyebrow: string | null;
  titleMain: string | null;
  titleAccent: string | null;
  lead: string | null;
  cta1Label: string | null;
  cta1Href: string | null;
  cta2Label: string | null;
  cta2Href: string | null;
  proof: string[];
  float1Icon: string | null;
  float1Title: string | null;
  float1Sub: string | null;
  float2Icon: string | null;
  float2Title: string | null;
  float2Sub: string | null;
  imageUrl: string | null;
  float1Show: boolean;
  float2Show: boolean;
}

/**
 * One call for all three placements.
 *
 * Scheduling and zone are applied on the server, so whatever comes back is
 * already what this visitor should see — the components do no date arithmetic.
 * Asking three times would mean three round trips and three chances for the
 * hero and the announcement line to disagree about which season it is.
 */
export const getShopBanners = (zone: string | null) =>
  get<{ banners: ShopBanner[]; heroRotateSeconds: number; announcementAuto: boolean }>(
    `/shop/banners${zone ? `?zone=${zone}` : ""}`,
  );

/**
 * The delivery words a product card prints — from the delivery masters. Null
 * means the shop advertises no such service, and the card says less rather
 * than inventing a number (the "Today, 2 hrs" that sat on every card until
 * 4 Sep 2026 while the admin's fastest service was three hours).
 */
export interface CardWording {
  express: string | null;
  sameDay: string | null;
  midnight: string | null;
  /** the whole courier pill — "1–3 days, nationwide", or the method's name */
  courier: string | null;
}
export const getCardWording = () => get<CardWording>("/shop/card-wording");

export interface LayoutBlock {
  key: string;
  /** null = one of the built-in sections, rendered by its own component */
  blockType: "PRODUCT_ROW" | "COLLECTION_ROW" | "BANNER_STRIP" | "IMAGE_BANNER" | null;
  title: string | null;
  subtitle: string | null;
  config: Record<string, unknown>;
}

/** the sections to render, already ordered and filtered for this zone */
export const getShopLayout = (zone: string | null) =>
  get<LayoutBlock[]>(`/shop/layout${zone ? `?zone=${zone}` : ""}`);

/**
 * The homepage Best Sellers grid, decided by the API from the section's own
 * settings: which tabs (the owner's categories), what is under each (badge
 * holders, his picks, or badge holders topped up), and the words around them.
 */
export interface HomeBestSellers {
  mode: "AUTO" | "MANUAL" | "AUTO_FILL";
  tabs: { key: string; label: string; items: ShopProduct[] }[];
  viewAll: { text: string; href: string } | null;
  empty: { title: string; text: string };
}
export const getHomeBestSellers = (zone: string | null) =>
  get<HomeBestSellers>(`/shop/home-bestsellers${zone ? `?zone=${zone}` : ""}`);

export interface ShopReview {
  id: string;
  authorName: string;
  rating: number;
  body: string;
  context: string | null;
  imageUrl: string | null;
  source: "CUSTOMER" | "SHOP" | "GOOGLE";
  /** earned from the order history, never self-awarded */
  verifiedPurchase: boolean;
}

export const getShopReviews = () =>
  get<{
    reviews: ShopReview[];
    /** null until the owner enters a rating — the card is hidden rather than faked.
     *  `count` may be null on its own; the "Based on N reviews" line is dropped. */
    google: { rating: number; count: number | null; url: string | null } | null;
  }>("/shop/reviews");

export interface ShopFooter {
  footerGroups: { title: string; links: { label: string; href: string }[] }[];
  moreGroups: { title: string; links: { label: string; href: string }[] }[];
  /** already filtered — a profile with no URL is never returned */
  socials: { icon: string; label: string; url: string }[];
  badges: { label: string; imageUrl: string | null }[];
  tagline: string | null;
  /** the year is added at render time, never stored */
  legal: string | null;
}

export const getShopFooter = () => get<ShopFooter>("/shop/footer");

export interface ShopCard {
  address: string | null;
  /** the small card floating over the photograph */
  chipTitle: string | null;
  chipSub: string | null;
  cityLine: string | null;
  phone: string | null;
  whatsapp: string | null;
  /** the address a customer writes to — Company settings (9 Sep 2026) */
  email: string | null;
  /** printed on About only when the shop actually has them */
  bin: string | null;
  tradeLicence: string | null;
  mapUrl: string | null;
  imageUrl: string | null;
  hours: {
    /** "Open every day, 9 AM – 10 PM" — generated from the weekday rows */
    line: string;
    /** the next upcoming closure, e.g. "Closed 8 Apr — Eid" */
    note: string | null;
    isOpenNow: boolean;
    /** "Open now · till 10 PM" — worked out server-side, in Bangladesh time */
    pill: string;
  };
}

export const getShopCard = () => get<ShopCard>("/shop/shop-card");

export interface DeliveryMode {
  id: string;
  label: string;
  eta: string | null;
  feePaisa: number;
  /** minutes until today's cutoff · null = no cutoff · ≤0 = missed for today */
  minutesLeft: number | null;
  /** the DeliveryType's own name — "3-Hour Express" */
  typeName: string;
  /** FROM_CONFIRM · TODAY_SLOT · PICK_DATE_SLOT · PICK_DATE_FIXED · LEAD_DAYS */
  timing: string | null;
  /** for FROM_CONFIRM, the promise in minutes. 180 = 3 hours. */
  promiseMinutes: number | null;
}

export const getDeliveryModes = (zone: string | null) =>
  get<DeliveryMode[]>(`/shop/delivery-modes${zone ? `?zone=${zone}` : ""}`);

/* ═══════════════════════════════════════════════════════════════════════════
   CHECKOUT's whole delivery menu — DEC-DLV-009 / DEC-DLV-010

   Owner, 1 Aug 2026: *"whatever is edited or changed in the delivery module
   must work automatically across the whole system."*

   ⚠️ `DeliveryMode` (above) does not replace this. That one is the homepage's
   advertisement — a name and a countdown. This is the checkout menu: what can
   be chosen, at what price, in which slot, and how the time is fixed. One
   table, two questions.
   ═══════════════════════════════════════════════════════════════════════════ */
export type DeliveryTiming =
  | "FROM_CONFIRM"
  | "TODAY_SLOT"
  | "PICK_DATE_SLOT"
  | "PICK_DATE_FIXED"
  | "LEAD_DAYS";

export interface DeliveryOptionSlot {
  id: string;
  label: string;
  /** minutes from the start of the day. ⚠️ `endMin < startMin` means the slot crosses midnight. */
  startMin: number | null;
  endMin: number | null;
  capacityPerDay: number | null;
  /** minutes left for today. ≤0 = over for today, but open again tomorrow. */
  minutesLeft: number | null;
}

export interface DeliveryOption {
  /** what a product is linked to — matched by this, never by name */
  typeId: string | null;
  rateId: string;
  name: string;
  /** PICKUP = nobody carries it; the customer comes to the shop (9 Sep 2026) */
  kind: "RIDER" | "COURIER" | "PICKUP";
  feePaisa: number;
  eta: string | null;
  timing: DeliveryTiming;
  /** for FROM_CONFIRM, the promise in minutes */
  promiseMinutes: number | null;
  openFromMin: number | null;
  openToMin: number | null;
  /** whether it can be taken right now (outside the day's window) */
  closedNow: boolean;
  closedReason: string | null;
  minutesLeft: number | null;
  slots: DeliveryOptionSlot[];
}

export const getDeliveryOptions = (
  zone: string | null,
  areaId?: string | null,
  /** DEC-DLV-011 — given the cart's slugs, the menu holds only the deliveries
      that work for *every* product in the cart; an order is never split */
  itemSlugs?: string[],
) =>
  get<DeliveryOption[]>(
    `/shop/delivery-options?zone=${zone === "bangladesh" ? "BANGLADESH" : "DHAKA"}` +
      (areaId ? `&areaId=${areaId}` : "") +
      (itemSlugs?.length
        ? `&items=${encodeURIComponent([...new Set(itemSlugs)].join(","))}`
        : ""),
  );

/** null until the owner enters it — every place that quotes it drops the claim */
export const getGoogleRating = () => get<{ rating: number | null }>("/shop/google-rating");

/**
 * Where a tag card should link.
 *
 * `/occasions/<tag>` is a real, established page. Nothing else is — and now
 * that tag GROUPS are admin-managed, a new group called "Bouquet Style" would
 * otherwise link to `/bouquet-style/…`, which will never exist.
 *
 * Everything without its own page goes to the product listing with the tag as a
 * filter, which is the page that will do the filtering for real anyway. It is
 * also where the Gift Finder sends people, so there is one destination, not two.
 */
export const GROUPS_WITH_PAGES = new Set(["occasions"]);
export const tagHref = (groupSlug: string, tagSlug: string) =>
  GROUPS_WITH_PAGES.has(groupSlug)
    ? `/${groupSlug}/${tagSlug}`
    : `/products?${groupSlug}=${tagSlug}`;

export interface JournalCard {
  slug: string;
  title: string;
  excerpt: string | null;
  coverUrl: string | null;
  author: string | null;
  publishedAt: string | null;
  readMinutes: number | null;
}

/** published posts only — the API filters, so nothing draft can leak */
export const getJournal = () => get<JournalCard[]>("/content/public/journal");

/** one post, for the article page's <title> — the admin's own row, or null */
export const getJournalPost = (slug: string) =>
  get<{ slug: string; title: string; excerpt: string | null }>(
    `/content/public/journal?slug=${encodeURIComponent(slug)}`,
  );

export interface GiftFinderStep {
  /** the query parameter this answer becomes — "occasions", "recipients", "budget" */
  param: string;
  title: string;
  options: { value: string; label: string; imageUrl: string | null }[];
}

export const getGiftFinder = () => get<GiftFinderStep[]>("/shop/gift-finder");

export interface ShopTagGroup {
  slug: string;
  name: string;
  tags: { slug: string; name: string; summary: string | null; imageUrl: string | null }[];
}

export const getShopTagGroups = () => get<ShopTagGroup[]>("/shop/tag-groups");

/** the shop's logo and name, for the header and the footer */
export const getShopBrand = () => get<{ name: string; logoUrl: string | null; logoLightUrl: string | null }>("/shop/brand");

export interface ShopCollection {
  slug: string;
  name: string;
  kicker: string | null;
  subtitle: string | null;
  imageUrl: string | null;
  /** the rose-gold treatment on the top tier */
  accent: boolean;
}

/** /collections/[slug] — the admin's Collection row plus its member cards */
export interface CollectionDetail {
  slug: string;
  name: string;
  kicker: string | null;
  subtitle: string | null;
  imageUrl: string | null;
  accent: boolean;
  minPaisa: number | null;
  maxPaisa: number | null;
  items: ShopProduct[];
}

export const getCollectionDetail = (slug: string, zone?: string | null) =>
  get<CollectionDetail>(
    `/shop/collections/${encodeURIComponent(slug)}${zone ? `?zone=${zone}` : ""}`,
  );

export const getShopCollections =(zone: string | null) =>
  get<ShopCollection[]>(`/shop/collections${zone ? `?zone=${zone}` : ""}`);

export interface SectionCopy {
  eyebrow: string | null;
  title: string | null;
  subtitle: string | null;
}

/** key → text, zone override already folded in by the server */
export const getSectionText = (zone: string | null) =>
  get<Record<string, SectionCopy>>(`/shop/section-text${zone ? `?zone=${zone}` : ""}`);

export interface ShopTrustBadge {
  id: string;
  /** a name from the built-in set */
  icon: string | null;
  /** or an uploaded file — never both, the API enforces it */
  iconUrl: string | null;
  title: string;
  subtitle: string | null;
}

export const getTrustBadges = (zone: string | null) =>
  get<ShopTrustBadge[]>(`/shop/trust-badges${zone ? `?zone=${zone}` : ""}`);

/** The storefront's zone names are not the API's. One place to translate. */
export const zoneCode = (z: "dhaka" | "bangladesh" | null) =>
  z === "bangladesh" ? "NATIONWIDE" : z === "dhaka" ? "DHAKA" : null;

/**
 * "120+ arrangements" — the line under a category card.
 *
 * Rounded DOWN to a ten and suffixed with "+", so the number never has to be
 * exact and never looks auto-generated. Under ten products we say nothing at
 * all rather than advertise "3 arrangements", which reads as an empty shop.
 *
 * `summary` from the admin always wins — if the owner wrote a line, that is
 * the line. This only fills the gap.
 */
export function categoryCountLabel(
  c: Pick<ShopCategory, "summary" | "productCount">,
  noun = "products",
): string {
  if (c.summary) return c.summary;
  if (c.productCount < 10) return "";
  return `${Math.floor(c.productCount / 10) * 10}+ ${noun}`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   The catalogue — products, and the category page.

   ⚠️ THE FALLBACK RULE CHANGES HERE, AND IT IS DELIBERATE.

   Everything above falls back to its hard-coded list when the API is quiet: a
   stale category rail still sells flowers. Products do NOT get that treatment.
   Showing invented products at invented prices is not a degraded page, it is
   a shop offering things it does not have — the same reason a generic category
   page was refused on 30 Jul. When the catalogue cannot be read, the page says
   so and shows nothing.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface ShopProduct {
  slug: string;
  name: string;
  /** what they pay, after any discount — integer paisa */
  pricePaisa: number;
  /** struck-through price, or null when nothing is off */
  mrpPaisa: number | null;
  /** FLAT = "৳150 OFF", PERCENT = "20% OFF" — the card badge, as the owner set it */
  discountKind?: "FLAT" | "PERCENT" | null;
  /** the one availability rule at card size — OUT_OF_STOCK draws "Sold out", no Add */
  availability?: "IN_STOCK" | "OUT_OF_STOCK" | "PRE_ORDER";
  /** DEC-PRD-035 — `pricePaisa` is the cheapest of several variant prices,
   *  so the card reads "from ৳450" instead of promising that exact number */
  priceFrom?: boolean;
  cat: string;
  sub: string | null;
  zone: "dhaka" | "both";
  badge: "express" | "midnight" | "courier";
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

export interface ShopTile {
  label: string;
  sub: string | null;
  href: string;
  bg: string;
  imageUrl?: string | null;
  count?: number;
}

export interface ShopColourTile {
  label: string;
  sub: string;
  swatch: string | null;
  imageUrl: string | null;
  href: string;
  count: number;
}

export interface ShopCategoryPage {
  slug: string;
  label: string;
  h1: string;
  lead: string;
  bannerUrl: string | null;
  bannerBg: string;
  totalProducts: number;
  /** the chips under the banner — the trust badges, zone-aware. [] = use ours */
  promises: string[];
  parent: { label: string; slug: string } | null;
  seo: {
    title: string;
    description: string;
    ogTitle: string | null;
    ogDescription: string | null;
    ogImageUrl: string | null;
    noIndex: boolean;
  };
  /** every section in locked order, `enabled` as the admin left it */
  sections: {
    key: string;
    enabled: boolean;
    /** null = one of the fourteen built-in blocks; set = one the owner added */
    blockType?: "PRODUCT_ROW" | "COLLECTION_ROW" | "BANNER_STRIP" | "IMAGE_BANNER" | null;
    title?: string | null;
    subtitle?: string | null;
    /** icon name / uploaded icon / background image live here for built-ins */
    config: Record<string, unknown>;
    /** null = nothing written in the admin, keep the wording the page ships with */
    copy: { eyebrow: string | null; title: string | null; subtitle: string | null } | null;
    /** an added block arrives with its contents already resolved */
    block?:
      | { kind: "PRODUCT_ROW"; products: ShopProduct[] }
      | {
          kind: "COLLECTION_ROW";
          cards: {
            slug: string;
            name: string;
            kicker: string | null;
            subtitle: string | null;
            imageUrl: string | null;
            accent: boolean;
          }[];
        }
      | {
          kind: "BANNER_STRIP";
          banner: {
            id: string;
            eyebrow: string | null;
            titleMain: string | null;
            titleAccent: string | null;
            lead: string | null;
            cta1Label: string | null;
            cta1Href: string | null;
            imageUrl: string | null;
          } | null;
        }
      | null;
  }[];
  subCategories: ShopTile[];
  attributes: ShopTile[];
  occasions: ShopTile[];
  colours: ShopColourTile[];
  budgets: { kicker: string | null; label: string; sub: string | null; imageUrl: string | null; accent: boolean; href: string; bg: string }[];
  /** Better together — hand-picked related products, from the whole shop */
  combos: ShopProduct[];
  /** Keep exploring — other categories */
  crossSell: ShopTile[];
  faqs: { question: string; answer: string }[];
  rails: { bestsellers: ShopProduct[]; readyToday: ShopProduct[] };
}

/** `sub` — a sub-category is parent + sub (a slug is unique per parent, DEC-PRD-043) */
export const getCategoryPage = (slug: string, zone: string | null, sub?: string) => {
  const q = new URLSearchParams();
  if (zone) q.set("zone", zone);
  if (sub) q.set("sub", sub);
  const qs = q.toString();
  return getResult<ShopCategoryPage>(`/shop/category/${encodeURIComponent(slug)}${qs ? `?${qs}` : ""}`);
};

export interface ProductQuery {
  category?: string;
  sub?: string;
  tag?: string;
  occasion?: string;
  /** a `recipients` tag — the Gift Finder's "who is it for" */
  recipient?: string;
  colour?: string;
  /** taka, not paisa — these are the numbers already in the budget links */
  min?: string | number;
  max?: string | number;
  speed?: string;
  /** 1 = the earned Best seller badge only (DEC-PRD-050) */
  best?: 1;
  sort?: string;
  zone?: string | null;
  page?: number;
  limit?: number;
  /** contains-match on name or slug — the search page uses this */
  search?: string;
}

/** cards for the slugs the browser saved (wishlist) — unknown slugs are left out */
export const getShopProductsBySlugs = (slugs: string[]) =>
  slugs.length === 0
    ? Promise.resolve<ShopProduct[] | null>([])
    : get<ShopProduct[]>(`/shop/products-by-slugs?slugs=${encodeURIComponent(slugs.join(","))}`);

export const getShopProducts = (q: ProductQuery) => {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  return get<{ items: ShopProduct[]; total: number; page: number; limit: number }>(
    `/shop/products?${params.toString()}`,
  );
};
