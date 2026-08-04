/*
  ═══════════════════════════════════════════════════════════════════════════
  Storefront → API client. The first one in `apps/web`.

  Until 30 Jul 2026 this app made no API calls at all — every page ran on the
  hard-coded files beside this one. This is the seam those files were written
  for; `_data/search.ts` says so in its own comment:

      `fetch('/api/search?q=')` হবে; component-এ একটা লাইনও বদলাবে না।

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
    const res = await fetch(`${baseFor()}${path}`, { cache: "no-store" });
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
  get<{ banners: ShopBanner[]; heroRotateSeconds: number }>(
    `/shop/banners${zone ? `?zone=${zone}` : ""}`,
  );

export interface LayoutBlock {
  key: string;
  /** null = one of the built-in sections, rendered by its own component */
  blockType: "PRODUCT_ROW" | "COLLECTION_ROW" | "BANNER_STRIP" | null;
  title: string | null;
  subtitle: string | null;
  config: Record<string, unknown>;
}

/** the sections to render, already ordered and filtered for this zone */
export const getShopLayout = (zone: string | null) =>
  get<LayoutBlock[]>(`/shop/layout${zone ? `?zone=${zone}` : ""}`);

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
  /** DeliveryType-এর নিজের নাম — "3-Hour Express" */
  typeName: string;
  /** FROM_CONFIRM · TODAY_SLOT · PICK_DATE_SLOT · PICK_DATE_FIXED · LEAD_DAYS */
  timing: string | null;
  /** FROM_CONFIRM হলে কত মিনিটের প্রতিশ্রুতি। ১৮০ = ৩ ঘণ্টা। */
  promiseMinutes: number | null;
}

export const getDeliveryModes = (zone: string | null) =>
  get<DeliveryMode[]>(`/shop/delivery-modes${zone ? `?zone=${zone}` : ""}`);

/* ═══════════════════════════════════════════════════════════════════════════
   CHECKOUT-এর পুরো মেনু — DEC-DLV-009 / DEC-DLV-010

   মালিক, ১ আগস্ট ২০২৬: *"delivery module-এ যা edit বা change করা হয়, তা যেন
   auto পুরা system-এ কাজ করে।"*

   ⚠️ `DeliveryMode` (উপরে) এটার জায়গা নেয় না। ওটা homepage-এর বিজ্ঞাপন —
   নাম আর কাউন্টডাউন। এটা checkout-এর মেনু: কী নেওয়া যাবে, কত টাকায়, কোন
   slot-এ, আর কীভাবে সময় ঠিক হবে। একই টেবিল, দুই প্রশ্ন।
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
  /** দিনের শুরু থেকে মিনিট। ⚠️ `endMin < startMin` মানে slot মধ্যরাত পেরোয়। */
  startMin: number | null;
  endMin: number | null;
  capacityPerDay: number | null;
  /** আজকের জন্য আর কত মিনিট বাকি। ≤0 = আজ শেষ, কিন্তু কাল আবার খোলা। */
  minutesLeft: number | null;
}

export interface DeliveryOption {
  /** product যার সাথে যুক্ত — মেলানো হয় এটা দিয়ে, নাম দিয়ে নয় */
  typeId: string | null;
  rateId: string;
  name: string;
  kind: "RIDER" | "COURIER";
  feePaisa: number;
  eta: string | null;
  timing: DeliveryTiming;
  /** FROM_CONFIRM হলে কত মিনিটের প্রতিশ্রুতি */
  promiseMinutes: number | null;
  openFromMin: number | null;
  openToMin: number | null;
  /** আজ এই মুহূর্তে নেওয়া যাবে কি না (দিনের জানালার বাইরে) */
  closedNow: boolean;
  closedReason: string | null;
  minutesLeft: number | null;
  slots: DeliveryOptionSlot[];
}

export const getDeliveryOptions = (zone: string | null, areaId?: string | null) =>
  get<DeliveryOption[]>(
    `/shop/delivery-options?zone=${zone === "bangladesh" ? "BANGLADESH" : "DHAKA"}` +
      (areaId ? `&areaId=${areaId}` : ""),
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
export const getShopBrand = () => get<{ name: string; logoUrl: string | null }>("/shop/brand");

export interface ShopCollection {
  slug: string;
  name: string;
  kicker: string | null;
  subtitle: string | null;
  imageUrl: string | null;
  /** the rose-gold treatment on the top tier */
  accent: boolean;
}

/** /collections/[slug] — admin-এর Collection সারি + সদস্য-card */
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
    blockType?: "PRODUCT_ROW" | "COLLECTION_ROW" | "BANNER_STRIP" | null;
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
  budgets: { kicker: string | null; label: string; href: string; bg: string }[];
  combos: ShopTile[];
  crossSell: ShopTile[];
  faqs: { question: string; answer: string }[];
  rails: { bestsellers: ShopProduct[]; readyToday: ShopProduct[] };
}

export const getCategoryPage = (slug: string, zone: string | null) =>
  get<ShopCategoryPage>(`/shop/category/${encodeURIComponent(slug)}${zone ? `?zone=${zone}` : ""}`);

export interface ProductQuery {
  category?: string;
  sub?: string;
  tag?: string;
  occasion?: string;
  colour?: string;
  /** taka, not paisa — these are the numbers already in the budget links */
  min?: string | number;
  max?: string | number;
  speed?: string;
  sort?: string;
  zone?: string | null;
  page?: number;
  limit?: number;
  /** নাম বা slug-এ contains-match — search পাতা এটাই ব্যবহার করে */
  search?: string;
}

export const getShopProducts = (q: ProductQuery) => {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  return get<{ items: ShopProduct[]; total: number; page: number; limit: number }>(
    `/shop/products?${params.toString()}`,
  );
};
