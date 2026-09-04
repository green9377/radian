import { isDemoMode } from "./demoMode";
import {
  demoList,
  demoGet,
  demoCreate,
  demoUpdate,
  demoRemove,
  demoSegmentList,
} from "./demoStore";

// ⇄ SWAP HERE base — Radian API (:4000) client. The mocks (_data/*) are replaced from here piece by piece.
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export interface ApiCategory {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
}
export interface ApiTag {
  id: string;
  slug: string;
  name: string;
  type?: "OCCASION" | "RECIPIENT" | null; // LEGACY — tags are grouped now (see ApiTagNode/tag-groups)
  /**
   * DEC-PRD-022 — which group this tag belongs to. `/tags` always sent it;
   * it was simply missing from this type — so the product editor could not
   * arrange by group and the chips were drawn from a hand-written list.
   */
  group?: { id: string; name: string } | null;
  groupId?: string | null;
  isActive?: boolean;
  sortOrder?: number;
}
/*  storefront base — "View on site" opens the real product page there.

    5 Aug, the owner caught it: View from the demo admin led to
    localhost:3000 — the env fallback was local dev's, and
    NEXT_PUBLIC_WEB_URL was never set on the demo admin. Render's env form
    silently loses saves (the CORS night's lesson), so env alone is never
    trusted again: use env if set; otherwise if the browser runs on
    localhost use the local shop, else the demo shop.  */
const WEB_FALLBACK =
  typeof window !== "undefined" && window.location.hostname !== "localhost"
    ? "https://radian-web-tan.vercel.app"
    : "http://localhost:3000";
export const WEB_BASE = process.env.NEXT_PUBLIC_WEB_URL || WEB_FALLBACK;
export const storefrontUrl = (slug: string) => `${WEB_BASE}/p/${slug}`;
/** display-only host of the live shop — never hardcode the domain in UI copy;
    whichever domain is live (demo today, radianbd.com later) shows itself */
export const WEB_HOST = WEB_BASE.replace(/^https?:\/\//, "");

/** DEC-PRD-012 — one variant of one product */
/** DEC-PRD-045 — one value inside a combination */
export interface ApiVariantValueRef {
  id: string;
  label: string;
  swatch: string | null;
  imageUrl: string | null;
  sortOrder?: number;
  attribute: { id: string; name: string; displayMode: string; sortOrder?: number };
}

export interface ApiProductVariant {
  id: string;
  /** the LEAD value — the axis the row is filed under */
  variantValueId: string;
  /**
   * DEC-PRD-045 — every value this row is made of. Two entries for
   * "Medium × Red". Absent on a row written before 23 August 2026, and then
   * `variantValue` alone stands in.
   */
  values?: { variantValue: ApiVariantValueRef }[];
  /** its own image. Empty = the product's main image. */
  imageUrl?: string | null;
  stockQty: number;
  /** DEC-PRD-015 — this colour's own stockroom Item. null = the product's. */
  itemId?: string | null;
  item?: { id: string; sku: string; name: string; imageUrl?: string | null } | null;
  /** optional. null = the product's base price (owner's rule: one price per colour). */
  pricePaisa?: number | null;
  /** DEC-PRD-032 — this variant's own discount. PERCENT = basis points, FLAT = paisa. */
  discountType?: "NONE" | "FLAT" | "PERCENT";
  discountValue?: number;
  sortOrder: number;
  isActive: boolean;
  variantValue?: ApiVariantValueRef;
}

export interface ApiProduct {
  id: string;
  slug: string;
  sku?: string | null;
  name: string;
  sellingPricePaisa: number;
  offerPricePaisa: number;
  costPaisa: number;
  discountType: "NONE" | "FLAT" | "PERCENT";
  discountValue: number;
  stockQty: number;
  showStock: boolean;
  /**
   * DEC-DLV-008 — which deliveries this product may ride on.
   * The API sends `deliveryTypes: [{ typeId }]`; the editor only wants the ids.
   */
  deliveryTypes?: { typeId: string }[];
  /** DEC-PRD-012 — colour / flavour / size, each with its own image, stock and price */
  variants?: ApiProductVariant[];
  /** DEC-PRD-028 — discount start and end (ISO datetime, null = no bound) */
  discountStartsAt?: string | null;
  discountEndsAt?: string | null;
  /** DEC-PRD-025 — each window's own starting number, and which one runs now */
  salesSeedToday?: number;
  salesSeedWeek?: number;
  salesSeedMonth?: number;
  salesSeedAll?: number;
  salesWindow?: "TODAY" | "WEEK" | "MONTH" | "ALL";
  /** DEC-PRD-026 — whether the customer may add their own text or photo */
  persoTitle?: string | null;
  persoText?: boolean;
  persoTextLabel?: string | null;
  persoTextMax?: number | null;
  persoTextHint?: string | null;
  /** DEC-PRD-048 — must the customer fill it in before buying */
  persoTextRequired?: boolean;
  persoImage?: boolean;
  persoImageLabel?: string | null;
  persoImageHint?: string | null;
  /** DEC-PRD-048 — must the customer upload before buying */
  persoImageRequired?: boolean;
  /** DEC-PRD-027 — the "Want this customised?" box */
  customiseOn?: boolean;
  customiseTitle?: string | null;
  customiseSub?: string | null;
  /** DEC-PDP-09 — what the page does the moment `stockQty` reaches 0 */
  soldOutMode?: "STOCK_OUT" | "PRE_ORDER";
  /** the owner's switch (4 Sep 2026): at 0, still take a normal order. One
   *  rule for MANUAL and Inventory-connected stock; nothing to do with CRAFTED */
  allowOrderAtZero?: boolean;
  /** ISO datetime, PRE_ORDER only. null = the owner promised no date. */
  preorderDate?: string | null;
  salesCount: number;
  /** the list sorts "newest first" by this (5 Aug) */
  createdAt?: string;
  productType: "READYMADE" | "CRAFTED";
  zone: "DHAKA" | "NATIONWIDE";
  natureType: "FRESH" | "ARTIFICIAL";
  isPublished: boolean;
  /*  ── DEC-PRD-050 · the badges are EARNED, not typed ────────────────────
      `isBestSeller` is READ-ONLY here: the server works it out from real
      delivered sales over the last 90 days, per category. `isNewArrival` is
      computed at read time from `publishedAt`. Sending either back does
      nothing — the form sends the two MODE fields instead.  */
  isBestSeller: boolean;
  isNewArrival: boolean;
  bestSellerMode?: "AUTO" | "ALWAYS" | "NEVER";
  newArrivalMode?: "AUTO" | "ALWAYS" | "NEVER";
  /** when it first went live — what "new arrival" is measured from */
  publishedAt?: string | null;
  category?: ApiCategory | null;
  brandId?: string | null; // single optional FK — Brand master
  unitId?: string | null; // display/selling unit — headline price suffix (DEC-PRD-009)
  tags?: ApiTag[];
  // made-to-order lead time (CRAFTED)
  leadTimeDays?: number | null;
  // upgrade link — this product is a bigger version of another
  upgradeOfProductId?: string | null;
  upgradeSortOrder?: number;
  // manually pinned add-on groups (besides the automatic rules)
  manualAddOnGroups?: { id: string; name: string }[];
  // variant link (colour / flavour sibling) — scalars come back on list too
  variantGroupId?: string | null;
  variantLabel?: string | null;
  variantSwatch?: string | null;
  /** D-CAT-01 — the colour, chosen from the Variant & Option master.
   *  An id, not a word: it is what "show me the red ones" filters on. */
  variantValueId?: string | null;
  // SEO-D01 — written from the product editor's "Search & sharing" section, or
  // in bulk from Marketing → SEO. Same six columns either way.
  metaTitle?: string | null;
  metaDescription?: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImageUrl?: string | null;
  noIndex?: boolean;

  /*
    The rest of the product page. Present on `GET /products/:slug`, absent from
    the list endpoint — the list draws a row, not a page.

    ⚠️ These were missing from this interface until 1 Aug 2026, which is part of
    why the editor never restored them: there was nothing here to read. Photos
    were uploaded, shown, and dropped on save; opening an existing product came
    back with the child lists empty and wrote that emptiness back.
  */
  shortDesc?: string | null;
  typeText?: string | null;
  natureLabel?: string | null;
  videoId?: string | null;
  nationwideMsg?: string | null;
  advanceRequired?: boolean;
  /*
    ⚠️ Caught in the 3 Aug audit: advanceRequired existed, the other three did
    not — so "PARTIAL 30%" could be saved but never read back. Reopening the
    product showed FULL, and the next save quietly wrote FULL for real.
  */
  advanceType?: "FULL" | "PARTIAL" | null;
  advancePercent?: number | null;
  advanceAmountPaisa?: number | null;
  supportsExpress?: boolean;
  supportsSameDay?: boolean;
  supportsMidnight?: boolean;
  stockMode?: "MANUAL" | "TRACKED";
  /**
   * DEC-ITM-002 — the stockroom thing this listing resolves to, and through
   * it (DEC-SUP-004) whoever supplies it.
   *
   * ⚠️ `item.sku` is NOT `sku` above. Two codes on purpose (DEC-ITM-021):
   * `sku` is the ecommerce code the data layer and Google speak; `item.sku`
   * is the stockroom code Inventory and Purchase speak. They are joined by
   * `itemId`, never by matching the text.
   */
  /** THE VENDOR who makes this listing. Not `item.supplier`, which is who we
   *  buy a stocked material from. Owner's ruling, 1 Aug 2026. */
  supplierId?: string | null;
  supplier?: {
    id: string;
    name: string;
    nickname?: string | null;
    notifyChannel: "SMS" | "WHATSAPP" | "OFF";
    notifyMode: "AUTO" | "MANUAL";
    leadTimeHours?: number | null;
  } | null;
  /** the number the website shows instead of the real one. null = show real */
  displayQty?: number | null;
  /** minutes to make one. null = nothing to make */
  makeMinutes?: number | null;
  itemId?: string | null;
  item?: {
    id: string;
    sku: string;
    /** absent on the LIST endpoint, which returns only what a row draws */
    name?: string;
    isStockTracked?: boolean;
    supplier?: {
      id: string;
      name: string;
      nickname?: string | null;
      notifyChannel: "SMS" | "WHATSAPP" | "OFF";
      notifyMode: "AUTO" | "MANUAL";
      leadTimeHours?: number | null;
    } | null;
  } | null;
  images?: { id: string; url: string; sortOrder: number }[];
  sizes?: { id: string; label: string; sub?: string | null; pricePaisa: number }[];
  specRows?: { id: string; item: string; qty: string }[];
  faqs?: { id: string; question: string; answer: string }[];
  /*  DEC-PRD-030 — when `iconUrl` is filled, `icon` is ignored.  */
  trustBadges?: { id: string; icon: string; iconUrl?: string | null; label: string; sub?: string | null }[];
}
export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/* ---- session (DEC-FIN-028) — set by AuthGate, sent on every call ---- */
let AUTH_TOKEN: string | null =
  typeof window !== "undefined" ? window.localStorage.getItem("radian.token") : null;
export function setAuthToken(t: string | null) { AUTH_TOKEN = t; }
/** the PIN is never stored — it rides along on one single money action */
let ONE_SHOT_PIN: string | null = null;
export function withPinHeader(pin: string) { ONE_SHOT_PIN = pin; }

/** AuthGate registers the PIN prompt here so any money action can raise it */
declare global {
  interface Window { __radianAskPin?: () => Promise<string | null> }
}

async function call(path: string, init?: RequestInit, pin?: string | null): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      ...(AUTH_TOKEN ? { "x-radian-token": AUTH_TOKEN } : {}),
      ...(pin ? { "x-radian-pin": pin } : {}),
      ...(init?.headers || {}),
    },
    ...init,
  });
}

/* ---- image upload (30 Jul 2026) ---------------------------------------------
   Deliberately NOT routed through `call()`. That helper sets
   `content-type: application/json` on every request, and a multipart upload
   must let the browser write its own content-type — it carries the boundary
   marker, and without it the server sees one unparseable blob.

   `folder` is checked against an allowlist on the server; passing anything else
   is rejected there rather than silently filed somewhere nobody will find.     */
export type UploadFolder =
  | "categories" | "tags" | "products" | "banners"
  | "icons" | "collections" | "reviews" | "brand"
  | "people" | "items" | "suppliers" | "purchases" | "delivery";

export interface UploadedImage { url: string; fileId: string; width: number; height: number }

export async function uploadImage(file: File, folder: UploadFolder): Promise<UploadedImage> {
  const body = new FormData();
  body.append("file", file);

  const r = await fetch(`${API_BASE}/media/upload?folder=${folder}`, {
    method: "POST",
    headers: { ...(AUTH_TOKEN ? { "x-radian-token": AUTH_TOKEN } : {}) },
    body,
  });

  if (!r.ok) {
    // The API returns a readable reason (wrong type, too big, key missing).
    // Show it — "upload failed" tells the owner nothing about what to do next.
    const msg = await r.json().then((b) => b?.message).catch(() => null);
    throw new Error(Array.isArray(msg) ? msg.join(", ") : msg || `Upload failed (${r.status})`);
  }
  return r.json() as Promise<UploadedImage>;
}

/* ---- banners (30 Jul 2026) --------------------------------------------------
   Hero slider, promo strip and announcement bar are one table with three
   placements — they always had the same shape (picture, words, link, season),
   and three tables would have meant writing the scheduling rule three times. */
export type BannerPlacement = "HERO" | "PROMO" | "ANNOUNCEMENT";

export interface ApiBanner {
  id: string;
  placement: BannerPlacement;
  /** null = every zone */
  zone: string | null;
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
  liveFrom: string | null;
  liveTo: string | null;
  sortOrder: number;
  isActive: boolean;
}
export type BannerWrite = Partial<Omit<ApiBanner, "id">> & { placement: BannerPlacement };

export const listBanners = () => j<ApiBanner[]>("/banners");
export const createBanner = (b: BannerWrite) =>
  j<ApiBanner>("/banners", { method: "POST", body: JSON.stringify(b) });
export const updateBanner = (id: string, b: Partial<BannerWrite>) =>
  j<ApiBanner>(`/banners/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteBanner = (id: string) => j<{ ok: true }>(`/banners/${id}`, { method: "DELETE" });

/*  ── DEC-PRD-050 · Best seller & New arrival rules ────────────────────────
    One row for the whole shop. Every number here is the owner's to set —
    house rule 7 — and there is deliberately NO ceiling on how many products
    a category may badge: the percentage decides, and the percentage alone. */
export interface ApiBadgeRules {
  /** how far back real sales are counted */
  bestSellerDays: number;
  /** the top slice of its own category a product must be in */
  bestSellerPercent: number;
  /** the floor, so a small category is not left with nothing */
  bestSellerMinCount: number;
  /** how many real sales before a product is eligible at all */
  bestSellerMinSales: number;
  /** days since it went live */
  newArrivalDays: number;
  lastComputedAt: string | null;
}

/** one line per top-level category on the rules screen */
export interface ApiBadgeRow {
  id: string;
  name: string;
  /** live products in this category */
  products: number;
  /** what the percentage asks for */
  target: number;
  /** what the shop can actually fill — never more than `target` */
  earned: number;
  /** how many have enough real sales to qualify */
  eligible: number;
  /** forced on by hand */
  pinned: number;
  /** forced off by hand */
  blocked: number;
}

export const getBadgeRules = () =>
  j<{ rules: ApiBadgeRules; rows: ApiBadgeRow[] }>("/products/badge-rules");
export const saveBadgeRules = (r: Partial<Omit<ApiBadgeRules, "lastComputedAt">>) =>
  j<ApiBadgeRules>("/products/badge-rules", { method: "PATCH", body: JSON.stringify(r) });
export const recomputeBadges = () =>
  j<ApiBadgeRules & { bestSellers: number; changed: number }>(
    "/products/badge-rules/recompute",
    { method: "POST" },
  );

export interface ApiStorefrontSettings {
  heroRotateSeconds: number;
  /** no announcement banner live: describe the delivery service (true) or show no bar */
  announcementAuto: boolean;
  /** the small card floating over the shop photograph — both blank hides it */
  shopChipTitle: string | null;
  shopChipSub: string | null;
  /** DEC-PRD-052 — the reassurance line under the PDP's Buy Now; blank = built-in wording */
  pdpUnderBuyText: string | null;
  pdpUnderBuyPreorderText: string | null;
}
export const getStorefrontSettings = () => j<ApiStorefrontSettings>("/banners/settings");
/** every field optional — the API only writes what is sent */
export const setStorefrontSettings = (s: Partial<Omit<ApiStorefrontSettings, never>>) =>
  j<ApiStorefrontSettings>("/banners/settings", { method: "PATCH", body: JSON.stringify(s) });

/* ---- trust badges (30 Jul 2026) ---------------------------------------------
   The row under the hero. `icon` and `iconUrl` are mutually exclusive and the
   API enforces it — setting one clears the other — so the screen never has to
   guess which of the two a saved row actually meant. */
export interface ApiTrustBadge {
  id: string;
  icon: string | null;
  iconUrl: string | null;
  title: string;
  subtitle: string | null;
  /** null = every zone */
  zone: string | null;
  sortOrder: number;
  isActive: boolean;
}
export type TrustWrite = Partial<Omit<ApiTrustBadge, "id">>;

export const listTrustBadges = () => j<ApiTrustBadge[]>("/trust-badges");
export const createTrustBadge = (b: TrustWrite) =>
  j<ApiTrustBadge>("/trust-badges", { method: "POST", body: JSON.stringify(b) });
export const updateTrustBadge = (id: string, b: TrustWrite) =>
  j<ApiTrustBadge>(`/trust-badges/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteTrustBadge = (id: string) =>
  j<{ ok: true }>(`/trust-badges/${id}`, { method: "DELETE" });

/* ---- section headings (30 Jul 2026) -----------------------------------------
   The eyebrow / title / subtitle above every storefront section, in one store.
   Rows are declared in the API's SECTION_MANIFEST and created on boot, so a new
   section appears here by itself — nothing to seed by hand. */
export interface ApiSectionText {
  key: string;
  /** which page it sits on — for grouping only */
  page: string;
  /** what to call it on screen; `key` is never shown to the owner */
  label: string;
  /** "" = the default used by every zone without an override */
  zone: string;
  eyebrow: string | null;
  title: string | null;
  subtitle: string | null;
}

export const listSectionText = () => j<ApiSectionText[]>("/sections");
export const saveSectionText = (
  key: string, zone: string, body: { eyebrow?: string; title?: string; subtitle?: string },
) => j<ApiSectionText>(`/sections/${encodeURIComponent(key)}?zone=${zone}`, {
  method: "PATCH", body: JSON.stringify(body),
});
export const clearSectionOverride = (key: string, zone: string) =>
  j<{ ok: boolean }>(`/sections/${encodeURIComponent(key)}/clear?zone=${zone}`, { method: "PATCH" });

/* ---- collections (31 Jul 2026) ----------------------------------------------
   Named shelves of products. PRICE_RANGE keeps itself up to date; MANUAL is a
   list the owner keeps. Money is paisa on the wire, like everywhere else. */
export type CollectionMode = "PRICE_RANGE" | "MANUAL";

export interface ApiCollection {
  id: string;
  slug: string;
  name: string;
  kicker: string | null;
  subtitle: string | null;
  imageUrl: string | null;
  mode: CollectionMode;
  minPaisa: number | null;
  maxPaisa: number | null;
  accent: boolean;
  isFeatured: boolean;
  zone: string | null;
  sortOrder: number;
  isActive: boolean;
  _count?: { products: number };
}
export type CollectionWrite = Partial<Omit<ApiCollection, "id" | "_count">>;

export const listCollections = () => j<ApiCollection[]>("/collections");
export const createCollection = (c: CollectionWrite) =>
  j<ApiCollection>("/collections", { method: "POST", body: JSON.stringify(c) });
export const updateCollection = (id: string, c: CollectionWrite) =>
  j<ApiCollection>(`/collections/${id}`, { method: "PATCH", body: JSON.stringify(c) });
export const deleteCollection = (id: string) =>
  j<{ ok: true }>(`/collections/${id}`, { method: "DELETE" });

/* ---- shop hours (31 Jul 2026) -----------------------------------------------
   Times are MINUTES SINCE MIDNIGHT — 9 AM is 540. Not "09:00" and not a
   DateTime: no timezone to get wrong, no parsing, and "is it open now" is one
   comparison. The screen converts at its own edge. */
export interface ApiShopHour {
  id: string;
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
  isClosed: boolean;
  openMin: number | null;
  closeMin: number | null;
}
export interface ApiShopClosure {
  id: string;
  /** ISO date */
  date: string;
  reason: string | null;
}

export const listShopHours = () => j<ApiShopHour[]>("/shop-hours");
export const setShopHour = (weekday: number, b: { isClosed?: boolean; openMin?: number | null; closeMin?: number | null }) =>
  j<ApiShopHour>(`/shop-hours/${weekday}`, { method: "PATCH", body: JSON.stringify(b) });
export const listShopClosures = () => j<ApiShopClosure[]>("/shop-hours/closures");
export const addShopClosure = (b: { date: string; reason?: string }) =>
  j<ApiShopClosure>("/shop-hours/closures", { method: "POST", body: JSON.stringify(b) });
export const removeShopClosure = (id: string) =>
  j<{ ok: true }>(`/shop-hours/closures/${id}`, { method: "DELETE" });

/* ---- footer & the More panel (31 Jul 2026) ----------------------------------
   One table for both, because they are the same list seen twice and several
   links appear in each. Kept apart, "Refund Policy" gets a new address in one
   and keeps the old one in the other. */
export type LinkPlacement = "FOOTER" | "MORE";

export interface ApiNavLink { id: string; groupId: string; label: string; href: string; sortOrder: number; isActive: boolean }
export interface ApiLinkGroup {
  id: string; placement: LinkPlacement; title: string;
  sortOrder: number; isActive: boolean; links: ApiNavLink[];
}
export interface ApiSocialLink { id: string; icon: string; label: string; url: string; sortOrder: number; isActive: boolean }
export interface ApiPaymentBadge { id: string; label: string; imageUrl: string | null; sortOrder: number; isActive: boolean }

export const listLinkGroups = () => j<ApiLinkGroup[]>("/footer/groups");
export const createLinkGroup = (b: { placement: LinkPlacement; title?: string; sortOrder?: number }) =>
  j<ApiLinkGroup>("/footer/groups", { method: "POST", body: JSON.stringify(b) });
export const updateLinkGroup = (id: string, b: { title?: string; sortOrder?: number; isActive?: boolean }) =>
  j<ApiLinkGroup>(`/footer/groups/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteLinkGroup = (id: string) => j<{ ok: true }>(`/footer/groups/${id}`, { method: "DELETE" });

export const createNavLink = (b: { groupId: string; label?: string; href?: string; sortOrder?: number }) =>
  j<ApiNavLink>("/footer/links", { method: "POST", body: JSON.stringify(b) });
export const updateNavLink = (id: string, b: { label?: string; href?: string; sortOrder?: number; isActive?: boolean }) =>
  j<ApiNavLink>(`/footer/links/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteNavLink = (id: string) => j<{ ok: true }>(`/footer/links/${id}`, { method: "DELETE" });

export const listSocialLinks = () => j<ApiSocialLink[]>("/footer/socials");
export const createSocialLink = (b: { icon?: string; label?: string; url?: string; sortOrder?: number }) =>
  j<ApiSocialLink>("/footer/socials", { method: "POST", body: JSON.stringify(b) });
export const updateSocialLink = (id: string, b: Partial<ApiSocialLink>) =>
  j<ApiSocialLink>(`/footer/socials/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteSocialLink = (id: string) => j<{ ok: true }>(`/footer/socials/${id}`, { method: "DELETE" });

export const listPaymentBadges = () => j<ApiPaymentBadge[]>("/footer/badges");
export const createPaymentBadge = (b: { label?: string; sortOrder?: number }) =>
  j<ApiPaymentBadge>("/footer/badges", { method: "POST", body: JSON.stringify(b) });
export const updatePaymentBadge = (id: string, b: Partial<ApiPaymentBadge>) =>
  j<ApiPaymentBadge>(`/footer/badges/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const deletePaymentBadge = (id: string) => j<{ ok: true }>(`/footer/badges/${id}`, { method: "DELETE" });

export const getFooterSettings = () => j<{ footerTagline: string | null; footerLegal: string | null }>("/footer/settings");
export const saveFooterSettings = (b: { footerTagline?: string; footerLegal?: string }) =>
  j<{ footerTagline: string | null; footerLegal: string | null }>("/footer/settings", { method: "PATCH", body: JSON.stringify(b) });

/* ---- reviews (31 Jul 2026) --------------------------------------------------
   ⚠️ `source` and `verifiedPurchase` are absent from the write type ON PURPOSE.
   The server sets both: an admin-created review is always SHOP, and the badge
   is derived from the order history. A review that could relabel itself as a
   customer's, or award itself a verified badge, is exactly the line the owner
   was warned about on 30 Jul. */
export type ReviewSource = "CUSTOMER" | "SHOP" | "GOOGLE";
export type ReviewStatus = "PENDING" | "PUBLISHED" | "REJECTED";

export interface ApiReview {
  id: string;
  source: ReviewSource;
  status: ReviewStatus;
  authorName: string;
  rating: number;
  body: string;
  context: string | null;
  imageUrl: string | null;
  productId: string | null;
  product?: { name: string; slug: string } | null;
  /** DEC-WEB-006 — the account it came from (phone is the session's claim) */
  customerPhone?: string | null;
  customer?: { name: string; phone: string; imageUrl?: string | null } | null;
  verifiedPurchase: boolean;
  /** DEC-WEB-007 — the shop's reply shown under the review on the site */
  replyText?: string | null;
  replyAt?: string | null;
  isFeatured: boolean;
  sortOrder: number;
  createdAt: string;
}
export interface ReviewWrite {
  authorName?: string; rating?: number; body?: string;
  context?: string | null; imageUrl?: string | null; productId?: string | null;
  status?: ReviewStatus; isFeatured?: boolean; sortOrder?: number;
  /** DEC-WEB-009 — picked from the customer book; server derives phone/verified */
  customerId?: string | null;
  /** when featuring a fifth: which one steps down */
  swapOutId?: string;
}

export const listReviews = (q?: { status?: string; source?: string }) =>
  j<ApiReview[]>(`/reviews${q?.status || q?.source ? `?${new URLSearchParams(q as Record<string, string>)}` : ""}`);
export const createReview = (b: ReviewWrite) =>
  j<ApiReview>("/reviews", { method: "POST", body: JSON.stringify(b) });
export const updateReview = (id: string, b: ReviewWrite) =>
  j<ApiReview>(`/reviews/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const replyReview = (id: string, replyText: string) =>
  j<ApiReview>(`/reviews/${id}/reply`, { method: "PATCH", body: JSON.stringify({ replyText }) });
export const deleteReview = (id: string) => j<{ ok: true }>(`/reviews/${id}`, { method: "DELETE" });

export const getGoogleSummary = () =>
  j<{ googleRating: number | null; googleReviewCount: number | null; googleProfileUrl: string | null }>("/reviews/google");
export const saveGoogleSummary = (b: { googleRating?: number | null; googleReviewCount?: number | null; googleProfileUrl?: string | null }) =>
  j<{ googleRating: number | null; googleReviewCount: number | null; googleProfileUrl: string | null }>("/reviews/google", { method: "PATCH", body: JSON.stringify(b) });

/* ---- page sections (31 Jul 2026) --------------------------------------------
   `movable: false` comes from the API's manifest, not from the database — the
   hero carries the page's only <h1>, and the bottom three sit in a fixed order
   with the footer. The server refuses a move regardless of what the screen
   allows, because a rule that only exists in the browser is not a rule. */
export type BlockType = "PRODUCT_ROW" | "COLLECTION_ROW" | "BANNER_STRIP";

export interface ApiPageSection {
  key: string;
  label: string;
  hint: string;
  movable: boolean;
  lockedReason: string | null;
  /** null = built-in; set = a section the owner added */
  blockType: BlockType | null;
  title: string | null;
  subtitle: string | null;
  config: Record<string, unknown>;
  /** true = a built-in section with settings of its own (Best Sellers, Latest Articles…) */
  hasSettings?: boolean;
  sortOrder: number;
  isActive: boolean;
  zone: string | null;
}

export const listPageSections = () => j<ApiPageSection[]>("/page-sections");
/** a built-in section's own settings — only the keys sent are changed; the
 *  API sanitises and returns the full settings in force */
export const updatePageSectionSettings = (key: string, config: Record<string, unknown>) =>
  j<Record<string, unknown>>("/page-sections/settings", { method: "PATCH", body: JSON.stringify({ key, config }) });
export const updatePageSection = (b: { key: string; isActive?: boolean; zone?: string | null }) =>
  j<unknown>("/page-sections", { method: "PATCH", body: JSON.stringify(b) });
export const reorderPageSections = (keys: string[]) =>
  j<ApiPageSection[]>("/page-sections/order", { method: "PATCH", body: JSON.stringify({ keys }) });
export const addPageBlock = (blockType: BlockType) =>
  j<unknown>("/page-sections/blocks", { method: "POST", body: JSON.stringify({ blockType }) });
export const editPageBlock = (key: string, b: { title?: string; subtitle?: string | null; config?: Record<string, unknown> }) =>
  j<unknown>(`/page-sections/blocks/${key}`, { method: "PATCH", body: JSON.stringify(b) });
export const removePageBlock = (key: string) =>
  j<{ ok: true }>(`/page-sections/blocks/${key}`, { method: "DELETE" });

/* ---- what is INSIDE each homepage section (3 Aug 2026) ----------------------
   `/page-sections` above answers "does this section appear, and where".
   This answers "and what is in it" — which categories, which occasion tabs and
   cards, which delivery speeds. Different question, so a different endpoint;
   the same screen shows both, one tab apart.

   ⚠️ It writes back to Category / TagGroup / Tag / DeliveryMethod. Nothing
   here owns a table of its own. */
export type HomeContentKind = "category" | "taggroup" | "tag" | "delivery";

export interface ApiHomeItem {
  id: string;
  name: string;
  note: string | null;
  imageUrl: string | null;
  /** ticked = on the homepage */
  shown: boolean;
  /** false = switched off entirely elsewhere, so ticking it here changes nothing */
  live: boolean;
  sortOrder: number;
  /** which zone shows it — null = both. Only category rows carry this. */
  zone?: string | null;
  children?: ApiHomeItem[];
}

export interface ApiHomeGroup {
  key: string;
  title: string;
  hint: string;
  warning: string | null;
  items: ApiHomeItem[];
}

export const loadHomeContent = () => j<ApiHomeGroup[]>("/storefront/home-content");
export const toggleHomeItem = (kind: HomeContentKind, id: string, shown: boolean) =>
  j<{ ok: true }>("/storefront/home-content/toggle", {
    method: "PATCH",
    body: JSON.stringify({ kind, id, shown }),
  });
/** ⚠️ send EVERY id in the list, in final order — the server renumbers 0..n */
export const reorderHomeItems = (kind: HomeContentKind, ids: string[]) =>
  j<{ ok: true }>("/storefront/home-content/reorder", {
    method: "PATCH",
    body: JSON.stringify({ kind, ids }),
  });
/** categories only — which zone's homepage shows the rail card (null = both) */
export const setHomeItemZone = (kind: HomeContentKind, id: string, zone: string | null) =>
  j<{ ok: true }>("/storefront/home-content/zone", {
    method: "PATCH",
    body: JSON.stringify({ kind, id, zone }),
  });

/* ---- category page sections (31 Jul 2026) -----------------------------------
   The same table, pointed at the category page.

   `slug` omitted = the settings EVERY category follows. With a slug = what that
   one category does differently, and `overridden` says which of the two the
   value on screen is coming from. Switch the colour grid off once for the whole
   shop, or off for chocolates alone.

   No ordering here at all: the fourteen sections are in a fixed order (D-CAT-04)
   and the server rejects a move even if a screen were to offer one. */
export interface ApiCategorySection {
  key: string;
  label: string;
  hint: string;
  movable: false;
  lockedReason: string | null;
  /** false = this one cannot be hidden (the banner and the grid) */
  canSwitchOff: boolean;
  isActive: boolean;
  config: Record<string, unknown>;
  /** true = this category's own decision, false = following the default */
  overridden: boolean;
  /** null = one of the fourteen built-in blocks; set = one you added */
  blockType: BlockType | null;
  title: string | null;
  subtitle: string | null;
  /** which built-in section an added block follows */
  after: string | null;
}

/* ---- the shopper's own product list, borrowed by the admin (2 Aug 2026) ----
   When the owner hand-picks the products for a rail, the list he chooses from
   has to be the list the page can actually show: published, in this category
   (children included), inside the delivery zone. That is exactly what
   `/shop/products` answers, and it answers it without `costPaisa`.

   The admin `/products` endpoint would have needed the same three filters
   rebuilt on top of a heavier row — and the day the two disagreed, he would be
   picking a product the page then refused to render. */
export interface ApiShopCard {
  slug: string;
  name: string;
  pricePaisa: number;
  imageUrl: string | null;
  best: boolean;
  exp: boolean;
  sd: boolean;
  mn: boolean;
}
export const listShopProducts = (p: { category?: string; search?: string; limit?: number }) => {
  const q = new URLSearchParams({ limit: String(p.limit ?? 40) });
  // no category = the whole published catalogue (the homepage Best Sellers picker)
  if (p.category) q.set("category", p.category);
  if (p.search?.trim()) q.set("search", p.search.trim());
  return j<{ items: ApiShopCard[]; total: number }>(`/shop/products?${q.toString()}`);
};

export const listCategorySections = (slug?: string) =>
  j<ApiCategorySection[]>(`/page-sections/category${slug ? `?slug=${encodeURIComponent(slug)}` : ""}`);

export const updateCategorySection = (b: {
  slug?: string;
  key: string;
  isActive?: boolean;
  config?: Record<string, unknown>;
}) => j<unknown>("/page-sections/category", { method: "PATCH", body: JSON.stringify(b) });

/** stop deciding for yourself and follow the shop-wide default again */
export const resetCategorySection = (slug: string, key: string) =>
  j<{ ok: true }>(`/page-sections/category/${encodeURIComponent(slug)}/${key}`, { method: "DELETE" });

/* Sections added to a category page. `slug` omitted = every category page.
   `after` names the built-in section it follows — placement without the
   ability to reorder the fourteen (D-CAT-04). */
export const addCategoryBlock = (b: { slug?: string; blockType: BlockType; after: string }) =>
  j<unknown>("/page-sections/category/blocks", { method: "POST", body: JSON.stringify(b) });
export const editCategoryBlock = (
  key: string,
  b: { slug?: string; title?: string; subtitle?: string | null; config?: Record<string, unknown> },
) => j<unknown>(`/page-sections/category/blocks/${key}`, { method: "PATCH", body: JSON.stringify(b) });
export const removeCategoryBlock = (key: string, slug?: string) =>
  j<{ ok: true }>(`/page-sections/category/blocks/${key}${slug ? `?slug=${encodeURIComponent(slug)}` : ""}`, { method: "DELETE" });

/* ---- category FAQ (D-CAT-03) ------------------------------------------------
   Owned by Category, so it is deleted with the category and needs no module of
   its own. Sub-categories have none: a lean sub-page shows its parent's. */
export interface ApiCategoryFaq {
  id: string;
  categoryId: string;
  question: string;
  answer: string;
  sortOrder: number;
  isActive: boolean;
}

/* ---- add-on recovery · bulk · sales (DEC-PRD-041/042/043) ---- */
export const listAddOnTrash = () =>
  j<{ items: (ApiAddOn & { deletedAt: string })[]; total: number }>(`/addons/trash`);
export const restoreAddOn = (id: string) =>
  j<ApiAddOn>(`/addons/${id}/restore`, { method: "POST" });
export const purgeAddOn = (id: string) =>
  j<{ id: string; purged: boolean }>(`/addons/${id}/purge`, { method: "DELETE" });
export const bulkAddOns = (body: {
  ids: string[];
  action: "ACTIVATE" | "DEACTIVATE" | "DELETE" | "DISCOUNT" | "ADD_TO_GROUP" | "REMOVE_FROM_GROUP";
  discountType?: "NONE" | "FLAT" | "PERCENT";
  discountValue?: number;
  groupId?: string;
}) => j<{ changed: number }>(`/addons/bulk`, { method: "POST", body: JSON.stringify(body) });
export interface ApiAddOnSales {
  days: number;
  totals: { units: number; revenuePaisa: number };
  items: { addOnId: string; name: string; sku: string | null; units: number; revenuePaisa: number }[];
}
export const getAddOnSales = (days = 30) =>
  j<ApiAddOnSales>(`/addons/sales?days=${days}`);

export const listCategoryFaqs = (categoryId: string) =>
  j<ApiCategoryFaq[]>(`/categories/${categoryId}/faqs`);
export const addCategoryFaq = (categoryId: string, b: { question: string; answer: string }) =>
  j<ApiCategoryFaq>(`/categories/${categoryId}/faqs`, { method: "POST", body: JSON.stringify(b) });
export const updateCategoryFaq = (
  faqId: string,
  b: { question?: string; answer?: string; sortOrder?: number; isActive?: boolean },
) => j<ApiCategoryFaq>(`/categories/faqs/${faqId}`, { method: "PATCH", body: JSON.stringify(b) });
export const removeCategoryFaq = (faqId: string) =>
  j<{ id: string; deleted: boolean }>(`/categories/faqs/${faqId}`, { method: "DELETE" });

/** the Gift Finder's live steps — what the homepage asks, so the settings
 *  screen can put a question beside each one */
export const listGiftFinderSteps = () =>
  j<{ param: string; title: string; options: { value: string; label: string }[] }[]>("/shop/gift-finder");

/* ---- journal / content (31 Jul 2026) ----------------------------------------
   `ContentService` was finished long ago with no controller in front of it, so
   none of this was reachable. The service is unchanged; only the doors are new. */
export interface ApiJournalPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  coverUrl: string | null;
  bodyHtml: string | null;
  author: string | null;
  isPublished: boolean;
  publishedAt: string | null;
  readMinutes: number | null;
  /** counted from the body by the server — shown so a stub is obvious */
  words?: number;
}
export type JournalWrite = Partial<Omit<ApiJournalPost, "id" | "words">>;

export const listJournalPosts = (q?: { search?: string; published?: string }) =>
  j<ApiJournalPost[]>(`/content/posts${q && (q.search || q.published) ? `?${new URLSearchParams(q as Record<string, string>)}` : ""}`);
export const createJournalPost = (b: JournalWrite) =>
  j<ApiJournalPost>("/content/posts", { method: "POST", body: JSON.stringify(b) });
export const updateJournalPost = (id: string, b: JournalWrite) =>
  j<ApiJournalPost>(`/content/posts/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteJournalPost = (id: string) =>
  j<unknown>(`/content/posts/${id}`, { method: "DELETE" });

/* ---- pages & FAQs (4 Aug 2026) --------------------------------------------
   The storefront's /terms, /refund-policy, /privacy-policy and /faq now draw
   from these two tables — this is the writing door for them. bKash/SSLCommerz
   merchant review wants these pages live. */
export interface ApiContentPage {
  id: string;
  slug: string;
  title: string;
  kind: string;
  bodyHtml: string | null;
  excerpt: string | null;
  isPublished: boolean;
  showInFooter: boolean;
  sortOrder: number;
  metaTitle: string | null;
  metaDescription: string | null;
  updatedAt: string;
}
export type ContentPageWrite = Partial<Omit<ApiContentPage, "id" | "updatedAt">>;

export const listContentPages = (q?: { search?: string }) =>
  j<ApiContentPage[]>(`/content/pages${q?.search ? `?search=${encodeURIComponent(q.search)}` : ""}`);
export const createContentPage = (b: ContentPageWrite) =>
  j<ApiContentPage>("/content/pages", { method: "POST", body: JSON.stringify(b) });
export const updateContentPage = (id: string, b: ContentPageWrite) =>
  j<ApiContentPage>(`/content/pages/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteContentPage = (id: string) =>
  j<unknown>(`/content/pages/${id}`, { method: "DELETE" });

export interface ApiFaqEntry {
  id: string;
  groupName: string;
  question: string;
  answerHtml: string | null;
  sortOrder: number;
  isPublished: boolean;
}
export type FaqWrite = Partial<Omit<ApiFaqEntry, "id">> & { id?: string };

export const listFaqs = () => j<ApiFaqEntry[]>("/content/faqs");
export const saveFaq = (b: FaqWrite) =>
  j<ApiFaqEntry>("/content/faqs", { method: "POST", body: JSON.stringify(b) });
export const deleteFaq = (id: string) =>
  j<unknown>(`/content/faqs/${id}`, { method: "DELETE" });

async function j<T>(path: string, init?: RequestInit): Promise<T> {
  const pin = ONE_SHOT_PIN;
  ONE_SHOT_PIN = null;
  let r = await call(path, init, pin);

  // the server asks for the PIN on money actions — raise the box, then retry once
  if (r.status === 403 && typeof window !== "undefined" && window.__radianAskPin) {
    const body = await r.clone().text().catch(() => "");
    if (body.includes("PIN")) {
      const entered = await window.__radianAskPin();
      if (!entered) throw new Error("Cancelled");
      r = await call(path, init, entered);
    }
  }

  // the session died (expired, signed out elsewhere, password changed) — drop
  // the dead token and let AuthGate put the sign-in screen back up, instead of
  // every panel showing its own "Please sign in again" error text
  if (r.status === 401 && typeof window !== "undefined") {
    window.localStorage.removeItem("radian.token");
    AUTH_TOKEN = null;
    window.dispatchEvent(new Event("radian:signed-out"));
  }

  if (!r.ok) {
    const body = await r.text().catch(() => "");
    let msg = body;
    try { msg = (JSON.parse(body) as { message?: string }).message ?? body; } catch { /* plain text */ }
    throw new Error(msg || `${init?.method || "GET"} ${path} → ${r.status}`);
  }
  return r.json() as Promise<T>;
}

/* ---------------- Products ---------------- */
export function listProducts(params?: { search?: string }): Promise<Paged<ApiProduct>> {
  const q = new URLSearchParams({ pageSize: "100" });
  if (params?.search) q.set("search", params.search);
  return j<Paged<ApiProduct>>(`/products?${q.toString()}`);
}
export function getProduct(id: string): Promise<ApiProduct> {
  return j<ApiProduct>(`/products/${id}`);
}
export function deleteProduct(id: string): Promise<{ id: string; deleted: boolean }> {
  return j(`/products/${id}`, { method: "DELETE" });
}
export interface ActivityEvent {
  id: string;
  kind: string;
  label: string;
  actorName: string | null;
  note: string | null;
  createdAt: string;
}
/** who changed what, and when — the audit trail the API has always recorded */
export function getProductTimeline(id: string): Promise<ActivityEvent[]> {
  return j(`/products/${id}/timeline`);
}

/** soft-deleted products — the only way to reach restore() from the admin */
export function listTrash(): Promise<{ items: (ApiProduct & { deletedAt: string })[]; total: number }> {
  return j(`/products/trash`);
}
/** permanent — server refuses unless it is in recovery AND no order ever sold it */
export function purgeProduct(id: string): Promise<{ id: string; purged: boolean }> {
  return j(`/products/${id}/permanent`, { method: "DELETE" });
}
export function restoreProduct(id: string): Promise<{ id: string; restored: boolean }> {
  return j(`/products/${id}/restore`, { method: "POST" });
}
export function createProduct(body: Record<string, unknown>): Promise<ApiProduct> {
  return j<ApiProduct>(`/products`, { method: "POST", body: JSON.stringify(body) });
}
export function updateProduct(id: string, body: Record<string, unknown>): Promise<ApiProduct> {
  return j<ApiProduct>(`/products/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}
/**
 * ⚠️ TWO CALLS, AND THE SECOND ONE IS THE POINT — 1 Aug 2026.
 *
 * This used to return the row it found in the LIST, and a list row is a row:
 * it carries no photos, sizes, spec, FAQ or trust badges. So the editor opened
 * every existing product with those five lists empty, and Publish wrote the
 * emptiness back. Photos uploaded fine and vanished on save; that is the same
 * bug seen from the other end.
 *
 * The list is still how a slug becomes an id — there is no `/products/slug/:x`
 * route — but the product itself now comes from `GET /products/:id`, which
 * includes everything the page owns.
 */
export async function getProductBySlug(slug: string): Promise<ApiProduct | null> {
  const res = await listProducts({ search: slug });
  const row = res.items.find((p) => p.slug === slug);
  if (!row) return null;
  try {
    return await getProduct(row.id);
  } catch {
    /*  Falling back to the list row keeps the screen usable if the detail call
        fails — but it is the shape that caused the data loss, so the editor
        must not treat a missing list as an empty one. It does not: every
        child list is restored with `if (p.images)` and friends, so an absent
        key leaves the state alone rather than clearing it.  */
    return row;
  }
}

/* ---------------- Funnel / analytics (Phase 1 — money half is real) ----------------
   views / addToCarts / checkouts are null until web-analytics tracking lands. */
export interface ApiFunnelItem {
  productId: string;
  slug: string;
  sku: string | null;
  name: string;
  /** the product's real photo — null only when it truly has none */
  imageUrl?: string | null;
  categoryId: string | null;
  categoryName: string | null;
  isPublished: boolean;
  stockQty: number;
  orders: number;
  cancelled: number;
  delivered: number;
  units: number;
  revenuePaisa: number;
  refundPaisa: number;
  marginPaisa: number;
  views: number | null;
  addToCarts: number | null;
  checkouts: number | null;
}
export interface ApiFunnelTotals {
  orders: number;
  delivered: number;
  cancelled: number;
  units: number;
  revenuePaisa: number;
  refundPaisa: number;
  marginPaisa: number;
}
export interface ApiCatalogFunnel {
  days: number;
  trackingConnected: boolean;
  totals: ApiFunnelTotals;
  items: ApiFunnelItem[];
}
export interface ApiProductAnalytics {
  days: number;
  trackingConnected: boolean;
  product: ApiProduct;
  funnel: {
    views: number | null;
    addToCarts: number | null;
    checkouts: number | null;
    orders: number;
    delivered: number;
    cancelled: number;
  };
  money: {
    units: number;
    revenuePaisa: number;
    refundPaisa: number;
    marginPaisa: number;
  };
  daily: { date: string; orders: number; units: number; revenuePaisa: number }[];
}
export function getCatalogFunnel(days = 30): Promise<ApiCatalogFunnel> {
  return j(`/products/analytics?days=${days}`);
}
export function getProductAnalytics(
  id: string,
  days = 30,
): Promise<ApiProductAnalytics> {
  return j(`/products/${id}/analytics?days=${days}`);
}

/* ---------------- masters ---------------- */
export function listCategories(): Promise<(ApiCategory & { parent?: ApiCategory | null; children?: ApiCategory[] })[]> {
  return j(`/categories`);
}
export function listTags(): Promise<(ApiTag & { _count?: { products: number } })[]> {
  return j(`/tags`);
}

/* ---------------- Variant groups (colour / flavour siblings) ---------------- */
export type VariantKind = "COLOUR" | "FLAVOUR";
export interface ApiVariantGroupProduct {
  id: string;
  name: string;
  slug: string;
  variantLabel: string | null;
  variantSwatch: string | null;
}
export interface ApiVariantGroup {
  id: string;
  kind: VariantKind;
  label: string;
  products: ApiVariantGroupProduct[];
}
export function listVariantGroups(): Promise<ApiVariantGroup[]> {
  return j(`/variant-groups`);
}
export function createVariantGroup(body: {
  kind: VariantKind;
  label: string;
}): Promise<ApiVariantGroup> {
  return j(`/variant-groups`, { method: "POST", body: JSON.stringify(body) });
}
export function updateVariantGroup(
  id: string,
  body: { kind?: VariantKind; label?: string },
): Promise<ApiVariantGroup> {
  return j(`/variant-groups/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}
export function deleteVariantGroup(id: string): Promise<{ id: string; deleted: boolean }> {
  return j(`/variant-groups/${id}`, { method: "DELETE" });
}

/* ---------------- Customers ---------------- */
export interface ApiSegment {
  id: string;
  slug: string;
  name: string;
}
export interface ApiRecipientOccasion {
  id: string;
  type: "BIRTHDAY" | "ANNIVERSARY" | "CUSTOM";
  /** "MM-DD" — recurring; the occasion list matches on this, never on the year */
  date: string;
  /** DEC-CUS-010 — optional, only if the customer gave it */
  year?: number | null;
  label?: string | null;
}
export interface ApiRecipient {
  id: string;
  name: string;
  phone: string;
  relationship: string;
  zone: "DHAKA" | "BANGLADESH";
  addressLine: string;
  note?: string | null;
  isFavorite: boolean;
  deliveriesCount: number;
  lastDeliveryAt?: string | null;
  occasions?: ApiRecipientOccasion[];
}
export interface ApiCustomer {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  whatsappVerified: boolean;
  country: string;
  ownAddressLine?: string | null;
  status: "ACTIVE" | "BLOCKED";
  note?: string | null;
  avatarBg?: string | null;
  /** DEC-CUS-009 — a photo if there is one; otherwise the initials stand in */
  imageUrl?: string | null;
  ordersCount: number;
  ltvPaisa: number;
  lastOrderAt?: string | null;
  firstOrderAt?: string | null;
  tier: "new" | "onetime" | "repeat";
  isAbroad: boolean;
  segments?: ApiSegment[];
  recipients?: ApiRecipient[];
}
export function listCustomers(params?: {
  search?: string;
  segmentId?: string;
  status?: string;
  abroad?: string;
}): Promise<Paged<ApiCustomer>> {
  const q = new URLSearchParams({ pageSize: "100" });
  if (params?.search) q.set("search", params.search);
  if (params?.status) q.set("status", params.status);
  if (params?.segmentId) q.set("segmentId", params.segmentId);
  if (params?.abroad) q.set("abroad", params.abroad);
  return j<Paged<ApiCustomer>>(`/customers?${q.toString()}`);
}
/** demo rows are served from an editable local store, so every button really works */
const isDemoRow = (id: string) => id.startsWith("demo-") || isDemoMode();

export function getCustomer(id: string): Promise<ApiCustomer> {
  if (isDemoRow(id)) {
    const found = demoGet(id);
    if (found) return Promise.resolve(found);
  }
  return j<ApiCustomer>(`/customers/${id}`);
}
export function createCustomer(body: Record<string, unknown>): Promise<ApiCustomer> {
  if (isDemoMode()) return Promise.resolve(demoCreate(body));
  return j<ApiCustomer>(`/customers`, { method: "POST", body: JSON.stringify(body) });
}
export function updateCustomer(id: string, body: Record<string, unknown>): Promise<ApiCustomer> {
  if (isDemoRow(id)) {
    const updated = demoUpdate(id, body);
    if (updated) return Promise.resolve(updated);
  }
  return j<ApiCustomer>(`/customers/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}
/* ---- the recipient book (DEC-CUS-011) ------------------------------------
   The customer PATCH deliberately ignores `recipients` — nesting writes there
   would need a diff the server cannot see. These three endpoints are how an
   existing customer's book actually changes. Until 10 Aug the editor simply
   dropped the recipients on save, so every edit to a recipient — including a
   birthday just typed in — was silently thrown away.                        */
export function addCustomerRecipient(id: string, body: Record<string, unknown>): Promise<ApiRecipient> {
  return j<ApiRecipient>(`/customers/${id}/recipients`, { method: "POST", body: JSON.stringify(body) });
}
export function updateCustomerRecipient(
  id: string, rid: string, body: Record<string, unknown>,
): Promise<ApiRecipient> {
  return j<ApiRecipient>(`/customers/${id}/recipients/${rid}`, { method: "PATCH", body: JSON.stringify(body) });
}
export function removeCustomerRecipient(id: string, rid: string): Promise<unknown> {
  return j(`/customers/${id}/recipients/${rid}`, { method: "DELETE" });
}

export function deleteCustomer(id: string): Promise<{ id: string; deleted: boolean }> {
  if (isDemoRow(id)) {
    demoRemove(id);
    return Promise.resolve({ id, deleted: true });
  }
  return j(`/customers/${id}`, { method: "DELETE" });
}
export function setCustomerBlocked(id: string, blocked: boolean): Promise<ApiCustomer> {
  if (isDemoRow(id)) {
    const updated = demoUpdate(id, { status: blocked ? "BLOCKED" : "ACTIVE" });
    if (updated) return Promise.resolve(updated);
  }
  return j<ApiCustomer>(`/customers/${id}/${blocked ? "block" : "unblock"}`, { method: "POST" });
}
export function listSegments(): Promise<(ApiSegment & { _count?: { customers: number } })[]> {
  return j(`/segments`);
}

/* ---------------- demo fallback ----------------
   When :4000 is down or nearly empty, serve the rich demo set so every Customer
   screen stays fully explorable. Demo rows carry ids prefixed "demo-", so the
   screens can label them and mutations on them are simulated (never hit the API).
   ⇄ SWAP HERE: remove these once the database is seeded with real customers. */
export async function listCustomersSafe(
  params?: Parameters<typeof listCustomers>[0],
): Promise<{ items: ApiCustomer[]; isDemo: boolean }> {
  if (isDemoMode()) return { items: demoList(), isDemo: true };
  try {
    const res = await listCustomers(params);
    if (res.items.length > 0) return { items: res.items, isDemo: false };
  } catch {
    /* API unreachable — fall through to demo */
  }
  return { items: demoList(), isDemo: true };
}

export async function listSegmentsSafe(): Promise<{
  items: (ApiSegment & { _count?: { customers: number } })[];
  isDemo: boolean;
}> {
  if (isDemoMode()) return { items: demoSegmentList(), isDemo: true };
  try {
    const res = await listSegments();
    if (res.length > 0) return { items: res, isDemo: false };
  } catch {
    /* ignore */
  }
  return { items: demoSegmentList(), isDemo: true };
}

/* ---------------- Orders (Sales) ---------------- */
export type SalesStatus = "placed" | "confirmed" | "completed" | "cancelled";
export type DeliveryStatus =
  | "unassigned"
  | "preparing"
  | "out_for_delivery"
  | "delivered"
  | "failed"
  | "stock_reverted";
export type PaymentMethod = "online" | "cod";
export type PaymentStatus =
  | "unpaid"
  | "advance_paid"
  | "paid"
  | "cod_collected"
  | "partially_refunded"
  | "refunded";

/*  REV-C4 — the order report, counted in the database.

    ⚠️ The screen used to work these out itself from `listOrders()`, which asks
    for `pageSize: "100"`. Every figure was a sum over the hundred most recent
    orders: right by accident under a hundred, quietly wrong past it, and
    healthy-looking on demo for ever. Revenue counts DELIVERED orders only,
    because DEC-FIN-002 posts revenue at delivered — anything else here would
    disagree with Finance's own books.  */
export interface ApiOrderReportRow {
  label: string;
  n: number;
  revenuePaisa: number;
}
export interface ApiOrderReport {
  range: { from: string | null; to: string | null };
  totalOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  revenuePaisa: number;
  aovPaisa: number;
  cancelRatePct: number;
  channel: ApiOrderReportRow[];
  zone: ApiOrderReportRow[];
  payment: ApiOrderReportRow[];
  type: ApiOrderReportRow[];
}
export function orderReport(params?: { from?: string; to?: string }): Promise<ApiOrderReport> {
  const q = new URLSearchParams();
  if (params?.from) q.set("from", params.from);
  if (params?.to) q.set("to", params.to);
  const qs = q.toString();
  return j<ApiOrderReport>(`/orders/report${qs ? `?${qs}` : ""}`);
}

export interface ApiOrderLine {
  id: string;
  productId: string;
  name: string;
  /**
   * DEC-PRD-014 — WHICH colour/size was actually sold.
   *
   * ⚠️ These two were in the database, on the API and missing from this type
   * until 30 Aug 2026, so every screen in the admin showed a variant order as
   * the parent product. A customer buys the Pink Small and the order reads
   * "variant - bundle, upgrade, add on": nobody packing it can tell which one
   * to make, and the stock came off the pink shelf while the page never said
   * pink.
   */
  variantId?: string | null;
  variantLabel?: string | null;
  sizeLabel?: string | null;
  bundleLabel?: string | null;
  addonLabels: string[];
  persoText?: string | null;
  /** DEC-PRD-061 — the customer's own photo, printed onto this item */
  persoImageUrl?: string | null;
  productType: "READYMADE" | "CRAFTED";
  /** R2 / DEC-SAL-015 — the product's own "payment required" flag, the ONE
   *  thing (with a gift) that closes Cash on Delivery. Not CRAFTED. */
  product?: { advanceRequired: boolean } | null;
  qty: number;
  unitPaisa: number;
  linePaisa: number;
  discountPaisa: number;
  /** thumbnail gradient/url placeholder until real product images */
  bg?: string | null;
  refundPaisa?: number | null;
  refundNote?: string | null;
}
export interface ApiOrderPhoto {
  id: string;
  kind: "PREP" | "DELIVERY";
  url?: string | null;
  bg?: string | null;
  caption?: string | null;
  capturedBy?: string | null;
  capturedAt: string;
}
export interface ApiOrderTxn {
  id: string;
  kind: string;
  method: PaymentMethod;
  amountPaisa: number;
  note?: string | null;
  actorName: string;
  createdAt: string;
}
export interface ApiChannel {
  id: string;
  slug: string;
  name: string;
  /** off = hidden from the New-order dropdown; history keeps the name */
  isActive?: boolean;
}
export interface ApiOrder {
  id: string;
  orderNo: string;
  placedAt: string;
  channelId: string;
  channel?: ApiChannel | null;
  customerId: string;
  customer?: { id: string; name: string; phone?: string } | null;
  senderName: string;
  senderPhone: string;
  senderEmail?: string | null;
  isGift: boolean;
  recipientName?: string | null;
  recipientPhone?: string | null;
  /** set when the gift recipient is also a saved Customer record */
  recipientCustomerId?: string | null;
  giftMessage?: string | null;
  anonymousGift: boolean;
  photoUpdates: boolean;
  salesStatus: SalesStatus;
  deliveryStatus: DeliveryStatus;
  zone: "DHAKA" | "BANGLADESH";
  address: string;
  deliveryNotes?: string | null;
  methodLabel?: string | null;
  date?: string | null;
  slotLabel?: string | null;
  etaLabel?: string | null;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  paidPaisa: number;
  duePaisa: number;
  refundPaisa: number;
  subtotalPaisa: number;
  couponCode?: string | null;
  discountPaisa: number;
  deliveryPaisa: number;
  deliveryWaivedPaisa: number;
  adjustmentPaisa: number;
  totalPaisa: number;
  internalNote?: string | null;
  lines?: ApiOrderLine[];
  photos?: ApiOrderPhoto[];
  transactions?: ApiOrderTxn[];
  editable?: { items: boolean; addItems?: boolean; recipient: boolean; delivery: boolean; notes: boolean };
  _count?: { lines: number };
}

export function listOrders(params?: {
  search?: string;
  salesStatus?: string;
  deliveryStatus?: string;
  needsAction?: string;
  /** counter bills live in the same table; only Returns asks for them */
  includeCounter?: boolean;
}): Promise<Paged<ApiOrder>> {
  const q = new URLSearchParams({ pageSize: "100" });
  if (params?.includeCounter) q.set("includeCounter", "true");
  if (params?.search) q.set("search", params.search);
  if (params?.salesStatus) q.set("salesStatus", params.salesStatus);
  if (params?.deliveryStatus) q.set("deliveryStatus", params.deliveryStatus);
  if (params?.needsAction) q.set("needsAction", params.needsAction);
  return j<Paged<ApiOrder>>(`/orders?${q.toString()}`);
}
export function getOrder(id: string): Promise<ApiOrder> {
  return j<ApiOrder>(`/orders/${id}`);
}
export function createOrder(body: Record<string, unknown>): Promise<ApiOrder> {
  return j<ApiOrder>(`/orders`, { method: "POST", body: JSON.stringify(body) });
}
export function editOrder(id: string, body: Record<string, unknown>): Promise<ApiOrder> {
  return j<ApiOrder>(`/orders/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}
export function orderAction(
  id: string,
  action: "confirm" | "prepare" | "out-for-delivery" | "delivered" | "fail",
): Promise<ApiOrder> {
  return j<ApiOrder>(`/orders/${id}/${action}`, { method: "POST" });
}
export function cancelOrder(id: string, reason?: string): Promise<ApiOrder> {
  return j<ApiOrder>(`/orders/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) });
}
export function listChannels(): Promise<ApiChannel[]> {
  return j(`/channels`);
}
export function getOrderTimeline(
  id: string,
): Promise<{ createdAt?: string; kind: string; label: string; actorName?: string; note?: string | null }[]> {
  return j(`/orders/${id}/timeline`);
}

/** record a money movement on the order — PAID | ADVANCE | COD_COLLECTED | REFUND */
export function addOrderPayment(id: string, body: Record<string, unknown>): Promise<ApiOrder> {
  return j<ApiOrder>(`/orders/${id}/payments`, { method: "POST", body: JSON.stringify(body) });
}
/*  `assignCourier` (POST /orders/:id/courier) LEFT THIS FILE — Phase 6.
    It bypassed Delivery entirely; use `createAssignment` instead. */
/** one plain-text order summary — reused by Copy / WhatsApp / Email everywhere */
export function orderShareText(o: ApiOrder): string {
  return [
    `Radian order ${o.orderNo}`,
    `${o.customer?.name ?? o.senderName} · ${o.senderPhone}`,
    o.isGift && o.recipientName ? `For: ${o.recipientName}${o.recipientPhone ? ` · ${o.recipientPhone}` : ""}` : "",
    ...(o.lines ?? []).map((l) => `• ${l.name} × ${l.qty} — ${formatTaka(l.linePaisa)}`),
    `Delivery: ${o.methodLabel ?? "-"}${o.slotLabel ? ` · ${o.slotLabel}` : ""}${o.date ? ` · ${o.date}` : ""}`,
    `Address: ${o.address}`,
    `Total: ${formatTaka(o.totalPaisa)}${o.duePaisa > 0 ? ` · Due ${formatTaka(o.duePaisa)}` : " · paid"}`,
    `Status: ${SALES_STATUS_META[o.salesStatus].label} / ${DELIVERY_STATUS_META[o.deliveryStatus].label}`,
  ]
    .filter(Boolean)
    .join("\n");
}
/** who the rider/CS should actually ring for this order */
export function orderContactPhone(o: ApiOrder): string {
  return (o.isGift ? o.recipientPhone : o.senderPhone) || o.senderPhone;
}
/*  The hardcoded COURIERS array LEFT THIS FILE — Phase 6. Couriers are a
    master kept in Administration (DEC-DLV-014); read `listCourierServices`. */

/* adapt API order → the shape the mock-based OrderEditor/EditForm expect */
/* eslint-disable @typescript-eslint/no-explicit-any */
export function adaptOrder(a: ApiOrder): any {
  const photo = (kind: "PREP" | "DELIVERY") => {
    const p = (a.photos || []).find((x) => x.kind === kind);
    return p
      ? {
          at: Date.parse(p.capturedAt) || Date.now(),
          by: p.capturedBy || "",
          caption: p.caption || "",
          bg: p.bg || p.url || "linear-gradient(160deg,#EFE4F8,#DBC3F0)",
        }
      : null;
  };
  return {
    id: a.id,
    orderNo: a.orderNo,
    placedAt: Date.parse(a.placedAt) || Date.now(),
    channel: a.channel?.slug || "website",
    customerId: a.customerId,
    sender: { name: a.senderName, phone: a.senderPhone, email: a.senderEmail || undefined },
    isGift: a.isGift,
    recipient: a.isGift
      ? { name: a.recipientName || "", phone: a.recipientPhone || "", customerId: a.recipientCustomerId || undefined }
      : null,
    giftMessage: a.giftMessage || "",
    anonymousGift: a.anonymousGift,
    photoUpdates: a.photoUpdates,
    salesStatus: a.salesStatus,
    deliveryStatus: a.deliveryStatus,
    timeline: [] as any[],
    zone: a.zone === "DHAKA" ? "dhaka" : "bangladesh",
    address: a.address,
    deliveryNotes: a.deliveryNotes || "",
    methodLabel: a.methodLabel || "",
    date: a.date || null,
    slotLabel: a.slotLabel || null,
    payment: {
      method: a.paymentMethod,
      status: a.paymentStatus,
      paidPaisa: a.paidPaisa,
      duePaisa: a.duePaisa,
      refundPaisa: a.refundPaisa,
    },
    lines: (a.lines || []).map((l) => ({
      id: l.id,
      productId: l.productId,
      name: l.name,
      bg: l.bg || "linear-gradient(160deg,#F1E6F8,#DFC8F0)",
      // DEC-PRD-014 — the colour that was sold, carried through to the screens
      variantLabel: l.variantLabel || undefined,
      sizeLabel: l.sizeLabel || "",
      bundleLabel: l.bundleLabel || null,
      addonLabels: l.addonLabels || [],
      persoText: l.persoText || undefined,
      persoImageUrl: l.persoImageUrl || undefined, // DEC-PRD-061
      productType: l.productType === "CRAFTED" ? "crafted" : "readymade",
      advanceRequired: l.product?.advanceRequired === true, // R2 / DEC-SAL-015
      qty: l.qty,
      unitPaisa: l.unitPaisa,
      linePaisa: l.linePaisa,
      discountPaisa: l.discountPaisa ?? 0,
      refundPaisa: l.refundPaisa ?? undefined,
      refundNote: l.refundNote ?? undefined,
    })),
    subtotalPaisa: a.subtotalPaisa,
    couponCode: a.couponCode || null,
    discountPaisa: a.discountPaisa,
    deliveryPaisa: a.deliveryPaisa,
    deliveryWaivedPaisa: a.deliveryWaivedPaisa,
    totalPaisa: a.totalPaisa,
    etaLabel: a.etaLabel || "",
    prepPhoto: photo("PREP"),
    deliveryPhoto: photo("DELIVERY"),
    internalNote: a.internalNote || "",
    editableGates: a.editable,
  };
}
export function adaptTimeline(
  rows: { createdAt?: string; kind: string; label: string; actorName?: string; note?: string | null }[],
): any[] {
  return rows.map((r) => ({
    at: Date.parse(r.createdAt || "") || Date.now(),
    kind: r.kind,
    label: r.label,
    actor: r.actorName || "System",
    note: r.note || undefined,
  }));
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface StatusMeta {
  label: string;
  chip: string;
  dot: string;
}
export const SALES_STATUS_META: Record<SalesStatus, StatusMeta> = {
  placed: { label: "Placed", chip: "bg-lavender text-purple border-lavender-deep", dot: "bg-orchid" },
  confirmed: { label: "Confirmed", chip: "bg-[#eef2ff] text-[#4338ca] border-[#dde3ff]", dot: "bg-[#4338ca]" },
  completed: { label: "Completed", chip: "bg-[#e8f9ee] text-[#0e7a3d] border-[#c4eed4]", dot: "bg-[#0e7a3d]" },
  cancelled: { label: "Cancelled", chip: "bg-[#fbecec] text-[#b42318] border-[#f5d5d2]", dot: "bg-[#b42318]" },
};
export const DELIVERY_STATUS_META: Record<DeliveryStatus, StatusMeta> = {
  unassigned: { label: "Not started", chip: "bg-lavender-deep/50 text-body-soft border-lavender-deep", dot: "bg-body-soft" },
  preparing: { label: "Preparing", chip: "bg-[#fff4e6] text-[#b45309] border-[#fce4c4]", dot: "bg-[#b45309]" },
  out_for_delivery: { label: "Out for delivery", chip: "bg-[#eaf6ff] text-[#0369a1] border-[#cde9fb]", dot: "bg-[#0369a1]" },
  delivered: { label: "Delivered", chip: "bg-[#e8f9ee] text-[#0e7a3d] border-[#c4eed4]", dot: "bg-[#0e7a3d]" },
  failed: { label: "Delivery failed", chip: "bg-[#fbecec] text-[#b42318] border-[#f5d5d2]", dot: "bg-[#b42318]" },
  stock_reverted: { label: "Stock reverted", chip: "bg-[#f4ecff] text-purple border-lavender-deep", dot: "bg-orchid" },
};
export const PAYMENT_STATUS_META: Record<PaymentStatus, StatusMeta> = {
  /*
    ⚠️ "Unpaid" IS NOT "COD" — corrected 29 Aug 2026, walking the fulfilment
    circle. This label read "COD due" for EVERY unpaid order, and an online
    order whose payment never arrived is not a cash-on-delivery order: nobody
    is going to hand the rider money for it.

    Found on RAD-69010 — placed online, payment not completed, and the order
    screen announced "COD due · ৳5,039.28". Staff reading that send the parcel
    out expecting the rider to collect, and the rider comes back empty-handed
    with the goods already gone.

    The API was right all along: `derivePaymentStatus` only returns `unpaid`,
    and it returns `cod_collected` when COD money actually arrives. The word
    COD was invented here, on the screen. `paymentLabel()` below now says which
    it is, because only the ORDER knows its method.
  */
  unpaid: { label: "Not paid", chip: "bg-[#fff4e6] text-[#b45309] border-[#fce4c4]", dot: "bg-[#b45309]" },
  advance_paid: { label: "Advance paid", chip: "bg-[#eef2ff] text-[#4338ca] border-[#dde3ff]", dot: "bg-[#4338ca]" },
  paid: { label: "Paid", chip: "bg-[#e8f9ee] text-[#0e7a3d] border-[#c4eed4]", dot: "bg-[#0e7a3d]" },
  cod_collected: { label: "COD collected", chip: "bg-[#e8f9ee] text-[#0e7a3d] border-[#c4eed4]", dot: "bg-[#0e7a3d]" },
  partially_refunded: { label: "Part refunded", chip: "bg-[#f4ecff] text-purple border-lavender-deep", dot: "bg-orchid" },
  refunded: { label: "Refunded", chip: "bg-[#fbecec] text-[#b42318] border-[#f5d5d2]", dot: "bg-[#b42318]" },
};
/**
 * What to call an order's payment state, given the METHOD as well as the
 * status — because "unpaid" alone cannot say who is expected to pay, or how.
 *
 * A cash order that has not been paid is money the rider will collect. An
 * online order that has not been paid is money nobody is going to hand over
 * at the door — somebody has to send the customer the pay link. Reading them
 * as the same sentence is how a parcel goes out with nothing to collect.
 */
export function paymentLabel(status: PaymentStatus, method?: string | null): string {
  if (status === "unpaid") return method === "cod" ? "COD due" : "Not paid";
  return PAYMENT_STATUS_META[status]?.label ?? status;
}

export function zoneLabel(z: string): string {
  return z === "DHAKA" ? "Dhaka" : "Nationwide";
}

/* ---------------- helpers ---------------- */
export function formatTaka(paisa: number): string {
  return "৳ " + (paisa / 100).toLocaleString("en-IN");
}
/** slug → soft brand-tinted gradient (thumbnail placeholder until real images) */
export function genBg(seed: string): string {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const a = 270 + (h % 60); // purple-pink band
  const b = 300 + ((h >> 4) % 60);
  return `linear-gradient(150deg,hsl(${a} 60% 92%),hsl(${b} 55% 84%))`;
}
/** avatar gradient (deeper — for initials circle) */
export function genAvatar(seed: string): string {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const a = 270 + (h % 80);
  return `linear-gradient(150deg,hsl(${a} 55% 58%),hsl(${(a + 45) % 360} 50% 44%))`;
}
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
/** ISO/ms → "3 days ago" */
export function ago(v?: string | number | null): string {
  if (!v) return "-";
  const ms = typeof v === "number" ? v : Date.parse(v);
  if (!ms) return "-";
  const d = Math.round((Date.now() - ms) / 86_400_000);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d} days ago`;
  const m = Math.round(d / 30);
  return m === 1 ? "1 month ago" : `${m} months ago`;
}

/* ============================================================
   Add-ons — real API (:4000/addons). Persisted in Postgres now.
   ============================================================ */
export interface ApiAddOn {
  id: string;
  name: string;
  sku: string | null;
  imageUrl: string | null;
  pricePaisa: number;
  /** DEC-PRD-049 — given away on purpose. ৳0 without it = not priced yet. */
  isFree?: boolean;
  discountType: "NONE" | "FLAT" | "PERCENT";
  discountValue: number; // FLAT=paisa · PERCENT=basis points (1000=10%)
  stockQty: number | null; // null = unlimited
  /** DEC-PRD-039 — linked stockroom Item; when set, Inventory owns the count */
  itemId?: string | null;
  item?: { id: string; sku: string; name: string } | null;
  isActive: boolean;
  groupIds: string[];
}
export interface ApiAddOnGroup { id: string; name: string; sortOrder: number; addonIds: string[]; }
export interface ApiAddOnRule {
  id: string;
  field: "CATEGORY" | "OCCASION" | "ZONE" | "PRODUCT_TYPE";
  values: string[];
  groupId: string;
  isActive: boolean;
}
export interface AddOnBundle { addons: ApiAddOn[]; groups: ApiAddOnGroup[]; rules: ApiAddOnRule[]; }

export const getAddOns = () => j<AddOnBundle>(`/addons`);
export const createAddOn = (b: Record<string, unknown>) => j<ApiAddOn>(`/addons`, { method: "POST", body: JSON.stringify(b) });
export const updateAddOn = (id: string, b: Record<string, unknown>) => j<ApiAddOn>(`/addons/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteAddOn = (id: string) => j(`/addons/${id}`, { method: "DELETE" });
export const createAddOnGroup = (b: Record<string, unknown>) => j<ApiAddOnGroup>(`/addons/groups`, { method: "POST", body: JSON.stringify(b) });
export const updateAddOnGroup = (id: string, b: Record<string, unknown>) => j(`/addons/groups/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteAddOnGroup = (id: string) => j(`/addons/groups/${id}`, { method: "DELETE" });
export const setAddOnGroupItems = (id: string, addOnIds: string[]) => j(`/addons/groups/${id}/items`, { method: "POST", body: JSON.stringify({ addOnIds }) });
export const createAddOnRule = (b: Record<string, unknown>) => j<ApiAddOnRule>(`/addons/rules`, { method: "POST", body: JSON.stringify(b) });
export const updateAddOnRule = (id: string, b: Record<string, unknown>) => j(`/addons/rules/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteAddOnRule = (id: string) => j(`/addons/rules/${id}`, { method: "DELETE" });

/* ============================================================
   Bundles — the "+ Chocolates" cards on a product page.
   Owner decision, 31 Jul 2026.

   ⚠️ NO PRICE IS SENT OR STORED. A bundle names a catalog product and a
   DISCOUNT; the price is the added product's own, read fresh every time.
   `alonePaisa` and `addPaisa` below come back computed by the server — the
   screen must display them, never recalculate them. Two implementations of
   one discount rule drift, and the owner checks his numbers against the
   wrong one.
   ============================================================ */
export interface ApiBundle {
  id: string;
  categoryId: string | null;
  productId: string | null;
  /** ⚠️ legacy — read `items` instead since DEC-PRD-017 */
  addsProductId: string;
  addsName: string;
  addsSlug: string;
  addsImageUrl: string | null;
  /** DEC-PRD-017 — everything this bundle contains */
  items: {
    id: string;
    name: string;
    slug: string;
    imageUrl: string | null;
    alonePaisa: number;
    hiddenReason: "draft" | "out-of-stock" | null;
  }[];
  label: string | null;
  discountType: "NONE" | "FLAT" | "PERCENT";
  /** FLAT = paisa · PERCENT = basis points (1000 = 10%) */
  discountValue: number;
  sortOrder: number;
  isBest: boolean;
  isActive: boolean;
  /** the main product's price today, after its discount. 0 at category level. */
  basePaisa: number;
  /** what this bundle's items cost bought separately */
  itemsPaisa: number;
  /** everything together (main included), before the discount */
  beforePaisa: number;
  /** everything together after the discount — what the customer pays */
  afterPaisa: number;
  savePaisa: number;
  /** ⚠️ legacy names — `itemsPaisa` and `addPaisa` now carry the same figure */
  alonePaisa: number;
  addPaisa: number;
  /** an active row that still will not show on the website, and why */
  hiddenReason: "draft" | "out-of-stock" | null;
}

/** one owner at a time — a category's defaults, or one product's own list */
export const getBundles = (owner: { categoryId?: string; productId?: string }) =>
  j<ApiBundle[]>(
    `/bundles?${new URLSearchParams(
      owner.productId ? { productId: owner.productId } : { categoryId: owner.categoryId ?? "" },
    )}`,
  );
/**
 * DEC-PRD-018 — one product = one bundle list, one discount.
 *
 * Owner, 2 Aug 2026: "the main product alone gets no discount; pick any extra
 * product from the bundle and the discount applies."
 *
 * ⚠️ The arithmetic happens on the server, never in the browser. The owner
 * sets his discount looking at these numbers — a second calculation here
 * would be the very number he mistakenly trusts.
 */
export interface ApiBundleList {
  /** `null` = no list exists yet */
  id: string | null;
  label: string | null;
  discountType: "NONE" | "FLAT" | "PERCENT";
  /** FLAT = paisa · PERCENT = basis points (1000 = 10%) */
  discountValue: number;
  items: {
    id: string;
    name: string;
    slug: string;
    imageUrl: string | null;
    alonePaisa: number;
    costPaisa?: number;
    hiddenReason: "draft" | "out-of-stock" | null;
  }[];
  /** the main product's price today. 0 at category level. */
  basePaisa: number;
  /** the items' price if all are taken */
  itemsPaisa: number;
  /** all taken, before the discount */
  beforePaisa: number;
  /** all taken, after the discount */
  afterPaisa: number;
  savePaisa: number;
}

export const getBundleList = (owner: { categoryId?: string; productId?: string }) =>
  j<ApiBundleList>(
    `/bundles/list?${new URLSearchParams(
      owner.productId ? { productId: owner.productId } : { categoryId: owner.categoryId ?? "" },
    )}`,
  );

export const saveBundleList = (b: {
  categoryId?: string | null;
  productId?: string | null;
  addsProductIds: string[];
  label?: string | null;
  discountType?: "NONE" | "FLAT" | "PERCENT";
  discountValue?: number;
}) => j<ApiBundleList>(`/bundles/list`, { method: "POST", body: JSON.stringify(b) });

/**
 * ⚠️ Unused — DEC-PRD-016's combos folded into DEC-PRD-018. The two tables
 * remain in the database (nothing is deleted); nobody reads them anymore.
 */
export interface ApiBundleCombo {
  id: string;
  productId: string;
  label: string | null;
  bundleIds: string[];
  pricePaisa: number;
  sortOrder: number;
  isActive: boolean;
  /** what it would cost today bought separately */
  normalPaisa: number;
  /** negative = the combo costs MORE than normal */
  savePaisa: number;
  names: string[];
}

export const getCombos = (productId: string) =>
  j<ApiBundleCombo[]>(`/bundles/combos?productId=${encodeURIComponent(productId)}`);
export const createCombo = (b: {
  productId: string;
  bundleIds: string[];
  pricePaisa: number;
  label?: string | null;
}) => j<ApiBundleCombo>(`/bundles/combos`, { method: "POST", body: JSON.stringify(b) });
export const updateCombo = (id: string, b: Record<string, unknown>) =>
  j<ApiBundleCombo>(`/bundles/combos/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteCombo = (id: string) => j(`/bundles/combos/${id}`, { method: "DELETE" });

export const createBundle = (b: Record<string, unknown>) =>
  j<ApiBundle>(`/bundles`, { method: "POST", body: JSON.stringify(b) });
export const updateBundle = (id: string, b: Record<string, unknown>) =>
  j<ApiBundle>(`/bundles/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteBundle = (id: string) => j(`/bundles/${id}`, { method: "DELETE" });
export const reorderBundles = (ids: string[]) =>
  j(`/bundles/reorder`, { method: "PATCH", body: JSON.stringify({ ids }) });

/* ============================================================
   Craft points — the three "why buy from us" cards.
   Same ownership rule as bundles: a category's default list, or
   one product's own, never both on one row.
   ============================================================ */
export interface ApiCraftPoint {
  id: string;
  categoryId: string | null;
  productId: string | null;
  icon: string;
  title: string;
  text: string;
  sortOrder: number;
  isActive: boolean;
}

/* ============================================================
   DEC-PRD-023 — the product page's trust badges and "What's inside",
   written once per category.

   ⚠️ `TrustBadge` (Storefront → Trust) is a different thing — that one is
   the homepage strip, site-wide, by zone. This one is the product page's,
   by category.
   ============================================================ */
export interface ApiCategoryTrustBadge {
  id: string;
  categoryId: string;
  /** a built-in icon name — `null` once an uploaded image takes over */
  icon: string | null;
  /** an uploaded image — when filled, this is what shows */
  iconUrl: string | null;
  label: string;
  sub: string | null;
  sortOrder: number;
  isActive: boolean;
}
export interface ApiCategorySpec {
  id: string;
  categoryId: string;
  /** DEC-PRD-046 — which named list this row belongs to */
  templateId?: string | null;
  item: string;
  qty: string;
  sortOrder: number;
  isActive: boolean;
}

export const listCategoryBadges = (categoryId: string) =>
  j<ApiCategoryTrustBadge[]>(`/category-story/trust?categoryId=${encodeURIComponent(categoryId)}`);
export const addCategoryBadge = (b: Record<string, unknown>) =>
  j<ApiCategoryTrustBadge>(`/category-story/trust`, { method: "POST", body: JSON.stringify(b) });
export const updateCategoryBadge = (id: string, b: Record<string, unknown>) =>
  j<ApiCategoryTrustBadge>(`/category-story/trust/${id}`, {
    method: "PATCH",
    body: JSON.stringify(b),
  });
export const removeCategoryBadge = (id: string) =>
  j(`/category-story/trust/${id}`, { method: "DELETE" });

/**
 * DEC-PRD-046 — a category holds SEVERAL named "What's inside" lists.
 * Picking one on a product COPIES its rows; it is a starting point, never a
 * live link (the owner's rule, 23 Aug 2026).
 */
export interface ApiCategorySpecList {
  id: string;
  categoryId: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  rows: ApiCategorySpec[];
}

export const listCategorySpecLists = (categoryId: string) =>
  j<ApiCategorySpecList[]>(`/category-story/spec-lists?categoryId=${encodeURIComponent(categoryId)}`);
export const addCategorySpecList = (categoryId: string, name?: string) =>
  j<ApiCategorySpecList>(`/category-story/spec-lists`, {
    method: "POST",
    body: JSON.stringify({ categoryId, name }),
  });
export const updateCategorySpecList = (id: string, b: Record<string, unknown>) =>
  j<ApiCategorySpecList>(`/category-story/spec-lists/${id}`, {
    method: "PATCH",
    body: JSON.stringify(b),
  });
export const removeCategorySpecList = (id: string) =>
  j(`/category-story/spec-lists/${id}`, { method: "DELETE" });

export const listCategorySpecs = (categoryId: string, templateId?: string) =>
  j<ApiCategorySpec[]>(
    `/category-story/spec?categoryId=${encodeURIComponent(categoryId)}` +
      (templateId ? `&templateId=${encodeURIComponent(templateId)}` : ""),
  );
export const addCategorySpec = (b: Record<string, unknown>) =>
  j<ApiCategorySpec>(`/category-story/spec`, { method: "POST", body: JSON.stringify(b) });
export const updateCategorySpec = (id: string, b: Record<string, unknown>) =>
  j<ApiCategorySpec>(`/category-story/spec/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const removeCategorySpec = (id: string) =>
  j(`/category-story/spec/${id}`, { method: "DELETE" });

export const getCraftPoints = (owner: { categoryId?: string; productId?: string }) =>
  j<ApiCraftPoint[]>(
    `/craft-points?${new URLSearchParams(
      owner.productId ? { productId: owner.productId } : { categoryId: owner.categoryId ?? "" },
    )}`,
  );
export const createCraftPoint = (b: Record<string, unknown>) =>
  j<ApiCraftPoint>(`/craft-points`, { method: "POST", body: JSON.stringify(b) });
export const updateCraftPoint = (id: string, b: Record<string, unknown>) =>
  j<ApiCraftPoint>(`/craft-points/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteCraftPoint = (id: string) => j(`/craft-points/${id}`, { method: "DELETE" });

/* ============================================================
   Daily capacity — "how much more can we make today?"

   ⚠️ MEASURED IN MINUTES, not in counts of products. "50 a day"
   assumes every job costs the same effort; a 15-minute bunch and
   a 6-hour installation are both "1", so the number is wrong the
   moment the day's mix is not the assumed one.

   ⚠️ THE DAY IS `workers × hoursEach`, never 24 hours. When the
   shop has three people instead of five, one number changes.
   ============================================================ */
export interface ApiCapacityGroup {
  id: string;
  name: string;
  workers: number;
  hoursEach: number;
  isActive: boolean;
  sortOrder: number;
  categories?: { id: string; name: string }[];
}

export interface CapacityBoardRow {
  id: string;
  name: string;
  workers: number;
  hoursEach: number;
  totalMinutes: number;
  usedMinutes: number;
  /** may be NEGATIVE — a day that has been overbooked must be visible */
  freeMinutes: number;
  freeLabel: string;
  categories: { id: string; name: string }[];
}

export const getCapacityBoard = (date?: string) =>
  j<{ date: string; groups: CapacityBoardRow[] }>(
    `/capacity/board${date ? `?date=${date}` : ""}`,
  );
/**
 * Can this product be made on this date — and if not, when?
 *
 * ⚠️ `nextAvailable` is the point of this call. Owner's ruling, 1 Aug 2026: a
 * full day is not a refused order, it is a later one. Checkout offers the date
 * it comes back with instead of showing an error. Null only when nothing in the
 * next sixty days fits, which means the capacity settings are wrong — not that
 * the customer should be turned away.
 */
export const checkCapacity = (productId: string, date?: string) =>
  j<{
    ok: boolean;
    reason: "NO_MAKE_TIME" | "NO_GROUP" | "CHECKED";
    group?: { id: string; name: string };
    needMinutes?: number;
    days: { date: string; freeMinutes: number; needMinutes: number; fits: boolean }[];
    nextAvailable: string | null;
  }>(`/capacity/check?productId=${encodeURIComponent(productId)}${date ? `&date=${date}` : ""}`);

export const listCapacityGroups = () => j<ApiCapacityGroup[]>(`/capacity`);
export const createCapacityGroup = (b: Record<string, unknown>) =>
  j<ApiCapacityGroup>(`/capacity`, { method: "POST", body: JSON.stringify(b) });
export const updateCapacityGroup = (id: string, b: Record<string, unknown>) =>
  j<ApiCapacityGroup>(`/capacity/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteCapacityGroup = (id: string) => j(`/capacity/${id}`, { method: "DELETE" });
export const setCapacityCategories = (id: string, categoryIds: string[]) =>
  j(`/capacity/${id}/categories`, { method: "POST", body: JSON.stringify({ categoryIds }) });

/* ============================================================
   Variant attribute templates — real API (:4000/variant-attributes).
   ============================================================ */
export interface ApiVariantValue {
  id: string; label: string;
  /** the colour dot — the product page's pill */
  swatch: string | null;
  /** the image — the category page's card. A second face of the same value, not an alternative. */
  imageUrl?: string | null;
  sortOrder: number; isActive: boolean;
}
export interface ApiVariantAttribute { id: string; name: string; displayMode: string; sortOrder: number; isActive: boolean; values: ApiVariantValue[]; }
export const getVariantAttributes = () => j<ApiVariantAttribute[]>(`/variant-attributes`);
export const createVariantAttribute = (b: Record<string, unknown>) => j<ApiVariantAttribute>(`/variant-attributes`, { method: "POST", body: JSON.stringify(b) });
export const updateVariantAttribute = (id: string, b: Record<string, unknown>) => j(`/variant-attributes/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteVariantAttribute = (id: string) => j(`/variant-attributes/${id}`, { method: "DELETE" });
export const setVariantValues = (id: string, values: Record<string, unknown>[]) => j<ApiVariantAttribute>(`/variant-attributes/${id}/values`, { method: "POST", body: JSON.stringify({ values }) });

/* ============================================================
   Categories — real API (:4000/categories). Full CRUD + CMS/SEO fields.
   Classification module · master data. DEC-PRD-001.
   ============================================================ */
export interface ApiCategoryNode {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  // CMS / SEO (persist after the category_cms_fields migration)
  description?: string | null;
  summary?: string | null;
  imageUrl?: string | null;
  iconUrl?: string | null;
  bannerUrl?: string | null;
  /** the big line on the category page — blank falls back to the name */
  bannerHeading?: string | null;
  /** heading above the size chooser on a product page — "Bouquet Size" */
  sizeLabel?: string | null;
  /** DEC-WEB-011 — the heading over the promise band. Blank = no heading. */
  craftTitle?: string | null;
  /** DEC-WEB-011 — the small line above it. Blank = none drawn. */
  craftKicker?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImageUrl?: string | null;
  showOnNavbar?: boolean;
  isFeatured?: boolean;
  _count?: { products: number };
  parent?: { id: string; name: string } | null;
  children?: ApiCategoryNode[];
}

export interface CategoryWrite {
  slug?: string;
  name?: string;
  parentId?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  description?: string | null;
  summary?: string | null;
  imageUrl?: string | null;
  iconUrl?: string | null;
  bannerUrl?: string | null;
  bannerHeading?: string | null;
  /** heading above the size chooser on a product page — "Bouquet Size" */
  sizeLabel?: string | null;
  /** DEC-WEB-011 — the heading over the promise band. Blank = no heading. */
  craftTitle?: string | null;
  /** DEC-WEB-011 — the small line above it. Blank = none drawn. */
  craftKicker?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImageUrl?: string | null;
  showOnNavbar?: boolean;
  isFeatured?: boolean;
}

/** all categories, flat (parents + children as separate rows), each with its own _count.products */
export function listCategoryTree(): Promise<ApiCategoryNode[]> {
  return j<ApiCategoryNode[]>(`/categories`);
}
export function createCategory(body: CategoryWrite & { slug: string; name: string }): Promise<ApiCategoryNode> {
  return j<ApiCategoryNode>(`/categories`, { method: "POST", body: JSON.stringify(body) });
}
export function updateCategory(id: string, body: CategoryWrite): Promise<ApiCategoryNode> {
  return j<ApiCategoryNode>(`/categories/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}
export function deleteCategory(id: string): Promise<{ id: string; deleted: boolean }> {
  return j(`/categories/${id}`, { method: "DELETE" });
}
export function categorySlug(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
/* Demo fallback — demo ONLY when the API is unreachable; empty-but-reachable DB is REAL. */
export async function listCategoriesSafe(): Promise<{ items: ApiCategoryNode[]; isDemo: boolean }> {
  try {
    const rows = await listCategoryTree();
    return { items: rows, isDemo: false };
  } catch {
    return { items: [], isDemo: true };
  }
}
/** POST a clean Bangladesh flower & gift starter taxonomy into an empty real DB */
/* ============================================================
   Occasions & Tags — real API. Dynamic groups + per-tag image.
   /tag-groups (group master; Occasions & Recipients seeded as system groups) +
   /tags (each tag belongs to a group, may carry an image). DEC-PRD-002 rev.
   ============================================================ */
export type TagDisplayStyle = "CHIP" | "CARD";

export interface ApiTagGroup {
  id: string;
  slug: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
  displayStyle: TagDisplayStyle;
  _count?: { tags: number };
}
export interface TagGroupWrite {
  slug?: string;
  name?: string;
  sortOrder?: number;
  isActive?: boolean;
  isSystem?: boolean;
  displayStyle?: TagDisplayStyle;
}
export interface ApiTagNode {
  id: string;
  slug: string;
  name: string;
  groupId: string | null;
  imageUrl?: string | null;
  sortOrder: number;
  isActive: boolean;
  group?: { id: string; name: string } | null;
  _count?: { products: number };
}
export interface TagWrite {
  slug?: string;
  name?: string;
  groupId?: string;
  imageUrl?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

export function tagSlug(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/* --- tag groups --- */
export const listTagGroups = () => j<ApiTagGroup[]>(`/tag-groups`);
export const createTagGroup = (b: TagGroupWrite & { slug: string; name: string }) =>
  j<ApiTagGroup>(`/tag-groups`, { method: "POST", body: JSON.stringify(b) });
export const updateTagGroup = (id: string, b: TagGroupWrite) =>
  j<ApiTagGroup>(`/tag-groups/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteTagGroup = (id: string) =>
  j<{ id: string; deleted: boolean }>(`/tag-groups/${id}`, { method: "DELETE" });
/** ensure the two system groups exist + pull legacy tags into them (idempotent) */
export const initTagSystem = () => j<ApiTagGroup[]>(`/tag-groups/init`, { method: "POST" });

/* --- tags --- */
export const listAllTags = (groupId?: string) =>
  j<ApiTagNode[]>(`/tags${groupId ? `?groupId=${groupId}` : ""}`);
export const createTag = (b: TagWrite & { slug: string; name: string; groupId: string }) =>
  j<ApiTagNode>(`/tags`, { method: "POST", body: JSON.stringify(b) });
export const updateTag = (id: string, b: TagWrite) =>
  j<ApiTagNode>(`/tags/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteTag = (id: string) =>
  j<{ id: string; deleted: boolean }>(`/tags/${id}`, { method: "DELETE" });

/* --- normalized shapes for the admin screen (identical for live + demo) --- */
export interface UiTagGroup {
  id: string;
  slug: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
  displayStyle: TagDisplayStyle;
}
export interface UiTag {
  id: string;
  slug: string;
  name: string;
  groupId: string;
  sortOrder: number;
  isActive: boolean;
  img?: string;
  products: number;
}

/* Demo ONLY when the API is unreachable; empty-but-reachable DB is REAL
   (system groups are auto-seeded via initTagSystem on first load). */
export async function loadTagsSafe(): Promise<{ groups: UiTagGroup[]; tags: UiTag[]; isDemo: boolean }> {
  try {
    let groups = await listTagGroups();
    if (groups.length === 0) groups = await initTagSystem(); // fresh DB → create Occasions/Recipients
    const tags = await listAllTags();
    return {
      isDemo: false,
      groups: groups.map((g) => ({
        id: g.id, slug: g.slug, name: g.name, sortOrder: g.sortOrder,
        isActive: g.isActive, isSystem: g.isSystem, displayStyle: g.displayStyle,
      })),
      tags: tags
        .filter((t) => t.groupId)
        .map((t) => ({
          id: t.id, slug: t.slug, name: t.name, groupId: t.groupId as string,
          sortOrder: t.sortOrder, isActive: t.isActive, img: t.imageUrl ?? undefined,
          products: t._count?.products ?? 0,
        })),
    };
  } catch {
    return { isDemo: true, groups: [], tags: [] };
  }
}

/** seed the sample groups + tags into a reachable DB (skips anything already there) */
/* ============================================================
   Brands — real API (:4000/brands). FLAT master (no parent-child).
   Product ↔ Brand = single FK. `website` + OG omitted (locked 20 Jul). DEC-PRD-008.
   ============================================================ */
export interface ApiBrand {
  id: string;
  slug: string;
  name: string;
  logoUrl?: string | null;
  description?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  isFeatured: boolean;
  sortOrder: number;
  isActive: boolean;
  _count?: { products: number };
}
export interface BrandWrite {
  slug?: string;
  name?: string;
  logoUrl?: string | null;
  description?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  isFeatured?: boolean;
  sortOrder?: number;
  isActive?: boolean;
}
export function brandSlug(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
/** storefront brand landing — "Shop by Brand" links here */
export const brandUrl = (slug: string) => `${WEB_BASE}/brands/${slug}`;

/* ── DEC-PRD-044 · the nature master ─────────────────────────────────────────
   The kind of thing a product is ("Fresh flower") and the line the customer
   reads for it ("100% Fresh Flowers"), so the sentence is written once and
   not retyped on every product. */
export interface ApiNature {
  id: string;
  name: string;
  label: string;
  isActive: boolean;
  sortOrder: number;
}
export const listNatures = () => j<ApiNature[]>(`/nature`);
export const createNature = (b: { name: string; label: string; sortOrder?: number }) =>
  j<ApiNature>(`/nature`, { method: "POST", body: JSON.stringify(b) });
export const updateNature = (id: string, b: Partial<{ name: string; label: string; sortOrder: number; isActive: boolean }>) =>
  j<ApiNature>(`/nature/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteNature = (id: string) => j(`/nature/${id}`, { method: "DELETE" });

export const listBrands = () => j<ApiBrand[]>(`/brands`);
export const createBrand = (b: BrandWrite & { slug: string; name: string }) =>
  j<ApiBrand>(`/brands`, { method: "POST", body: JSON.stringify(b) });
export const updateBrand = (id: string, b: BrandWrite) =>
  j<ApiBrand>(`/brands/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteBrand = (id: string) =>
  j<{ id: string; deleted: boolean; unbranded: number }>(`/brands/${id}`, { method: "DELETE" });

/* Demo ONLY when the API is unreachable; empty-but-reachable DB is REAL. */
export async function loadBrandsSafe(): Promise<{ items: ApiBrand[]; isDemo: boolean }> {
  try {
    const rows = await listBrands();
    return { items: rows, isDemo: false };
  } catch {
    return { items: [], isDemo: true };
  }
}
/** POST a clean starter brand set into an empty real DB */
/* ============================================================
   Units — real API (:4000/units). The THINNEST master: a Unit is only the
   measure WORD ("Bunch"), never the quantity ("Bunch of 12") — pack size stays
   in the product name / spec (locked 21 Jul). No slug/CMS/SEO/logo: a unit has
   no landing page, it only renders as a price suffix + an admin dropdown.
   Product ↔ Unit = single optional FK. Delete BLOCKED while products attached.
   DEC-PRD-009.
   ============================================================ */
export interface ApiUnit {
  id: string;
  name: string;
  shortCode: string;
  /** null = this is a base unit (nothing smaller) */
  baseUnitId?: string | null;
  baseUnit?: { id: string; name: string; shortCode: string } | null;
  /** 1 of this = baseQty of baseUnit. Always 1 for a base unit. */
  baseQty: number;
  sortOrder: number;
  isActive: boolean;
  /* resolved by the API — 1 Lily Bunch = 40 papri, so nobody multiplies by hand */
  rootUnitId?: string;
  rootUnitName?: string | null;
  rootUnitCode?: string | null;
  rootFactor?: number | null; // null when the chain loops — never guess
  chainDepth?: number;
  chainBroken?: boolean;
  _count?: {
    products: number; // Product.unitId
    items?: number; // Item.unitId — REQUIRED there (DEC-ITM-006)
    itemLines?: number; // ItemComponent.unitId — recipe lines (DEC-ITM-003)
    derivedUnits?: number; // other units that break down into this one
  };
}
export interface UnitWrite {
  name?: string;
  shortCode?: string;
  baseUnitId?: string | null;
  baseQty?: number;
  sortOrder?: number;
  isActive?: boolean;
}
/** "Lily Stick" -> "lilystick" — shortCode is machine-ish (no spaces/punctuation) */
export function unitCode(v: string): string {
  return v.toLowerCase().trim().replace(/[^a-z0-9]+/g, "");
}
/** how the unit reads on a price line: "\u09f31,200 / stick" */
export const unitSuffix = (u: Pick<ApiUnit, "shortCode"> | null | undefined) =>
  u?.shortCode ? `/ ${u.shortCode}` : "";

/** walk a unit's chain down to its base — mirrors the API so demo mode reads the same */
export function resolveUnitRoot(unit: ApiUnit, all: ApiUnit[]) {
  const byId = new Map(all.map((u) => [u.id, u]));
  let cur: ApiUnit | undefined = unit;
  let factor = 1;
  let depth = 0;
  while (cur?.baseUnitId && depth < 10) {
    factor *= cur.baseQty || 1;
    cur = byId.get(cur.baseUnitId);
    depth++;
  }
  const chainBroken = depth >= 10;
  return {
    rootUnitId: cur?.id ?? unit.id,
    rootUnitName: cur?.name ?? null,
    rootUnitCode: cur?.shortCode ?? null,
    rootFactor: chainBroken ? null : factor,
    chainDepth: depth,
    chainBroken,
  };
}

export const listUnits = () => j<ApiUnit[]>(`/units`);
export const createUnit = (u: UnitWrite & { name: string; shortCode: string }) =>
  j<ApiUnit>(`/units`, { method: "POST", body: JSON.stringify(u) });
export const updateUnit = (id: string, u: UnitWrite) =>
  j<ApiUnit>(`/units/${id}`, { method: "PATCH", body: JSON.stringify(u) });
export const deleteUnit = (id: string) =>
  j<{ id: string; deleted: boolean }>(`/units/${id}`, { method: "DELETE" });

/* Demo ONLY when the API is unreachable; empty-but-reachable DB is REAL. */
export async function loadUnitsSafe(): Promise<{ items: ApiUnit[]; isDemo: boolean }> {
  try {
    const rows = await listUnits();
    return { items: rows, isDemo: false };
  } catch {
    return { items: [], isDemo: true };
  }
}

/* Everything still pointing at a unit — so "3 items are using this" is clickable and
   the admin can actually move them, instead of hunting for them by hand. */
export interface UnitUsage {
  unit: { id: string; name: string };
  items: { id: string; sku: string; name: string; itemType: string }[];
  products: { id: string; slug: string; sku: string | null; name: string; isPublished: boolean }[];
  /** recipe lines carry their own unit — these block a delete too */
  itemLines: {
    id: string;
    qtyMilli: number;
    parentItem: { id: string; name: string; sku: string };
    componentItem: { id: string; name: string; sku: string };
  }[];
  derivedUnits: { id: string; name: string; shortCode: string; baseQty: number }[];
}
export const getUnitUsage = (id: string) => j<UnitUsage>(`/units/${id}/usage`);

/** Reassign through each owning module's OWN endpoint — never by writing to units. */
export const moveItemToUnit = (itemId: string, unitId: string) =>
  j<unknown>(`/items/${itemId}`, { method: "PATCH", body: JSON.stringify({ unitId }) });
export const moveProductToUnit = (productId: string, unitId: string | null) =>
  j<unknown>(`/products/${productId}`, { method: "PATCH", body: JSON.stringify({ unitId }) });
export const moveUnitBase = (unitId: string, baseUnitId: string | null) =>
  j<ApiUnit>(`/units/${unitId}`, { method: "PATCH", body: JSON.stringify({ baseUnitId }) });
/* ============================================================
   ITEM MANAGEMENT — real API (:4000/items).  Master Data.
   Architecture + reasoning: RADIAN_ITEM_MODULE_ARCHITECTURE.md (locked 21 Jul 2026).

   THE MODEL: everything Radian handles is an Item. Several Items together can also
   form ONE Item (a finished bouquet, with a recipe). A Product always points at
   exactly one Item — so Product and Inventory never branch on readymade/crafted.

   ⚠️ There is deliberately NO stock number here (DEC-ITM-005). Stock stays on Product
   until the Inventory module exists; putting a quantity on Item now would create a
   second owner and break the live DEC-MOD-003 deduction.
   ============================================================ */

export type ItemType = "RAW" | "FINISHED" | "PACKAGING" | "CONSUMABLE" | "SERVICE";
export type AssemblyMode = "NONE" | "MAKE_TO_ORDER" | "MAKE_TO_STOCK";
export type CostMode = "AUTO" | "MANUAL";

export interface ApiItemComponent {
  id: string;
  componentItemId: string;
  qtyMilli: number;      // integer thousandths — 24 stems = 24000
  unitId: string;
  wastageBp: number;     // basis points — 500 = 5%
  isOptional: boolean;
  displayText?: string | null;
  sortOrder: number;
  unit?: ApiUnit | null;
  componentItem?: {
    id: string;
    sku: string;
    name: string;
    itemType: ItemType;
    costMode: CostMode;
    standardCostPaisa: number;
    computedCostPaisa: number | null;
    unit?: ApiUnit | null;
  } | null;
}

/** DEC-ITM-015 — the Item module's OWN colour/size master, never the storefront one.
 *  Marketing renames storefront values freely ("Red" -> "Passion Red"); the stockroom
 *  cannot have its labels rewritten by a marketing decision. Two entities, two owners. */
export interface ApiItemAttrValue {
  id: string;
  attributeId?: string;
  label: string;
  swatch?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  attribute?: { id: string; name: string } | null;
  _count?: { items: number };
}
export interface ApiItemAttribute {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  values: ApiItemAttrValue[];
}

/** DEC-ITM-007 — the Item module's OWN category tree. Never the storefront Category. */
export interface ApiItemCategory {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  _count?: { items: number; children: number };
}
export interface ItemCategoryWrite {
  name?: string;
  parentId?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

export interface ApiItem {
  id: string;
  sku: string;                 // THE one SKU in the system (DEC-ITM-010)
  name: string;
  /** DEC-ITM-017 — `itemType` is the behaviour the rules read; `typeRef` is the label
   *  the owner picked and may have invented himself. */
  itemType: ItemType;
  itemTypeId?: string | null;
  typeRef?: ApiItemTypeRow | null;
  /** DEC-ITM-020 — set ONLY by the variant generator. Null = a standalone item, even if
   *  it carries a colour or size label. Guessing from the labels was the 21 Jul bug. */
  familyKey?: string | null;
  itemCategoryId?: string | null;
  itemCategory?: { id: string; name: string } | null;
  brandId?: string | null;
  brand?: { id: string; name: string } | null;
  /** DEC-SUP-004 — primary/usual supplier; labels vendor products on the site */
  supplierId?: string | null;
  supplier?: { id: string; name: string; nickname?: string | null } | null;
  unitId: string;
  unit?: ApiUnit | null;

  /** DEC-ITM-012 — ONE warehouse mugshot so staff recognise the thing on sight.
   *  The marketing gallery stays on Product. Data URL interim (like Brand.logoUrl). */
  imageUrl?: string | null;

  isStockTracked: boolean;
  assemblyMode: AssemblyMode;

  // DEC-ITM-013 — not derivable from the type, so they are their own flags
  isSaleable: boolean;
  isPurchasable: boolean;
  isReturnable: boolean;

  weightGram?: number | null; // DEC-ITM-014 — courier pricing is by weight

  /** DEC-ITM-015/016 — the Item module's own Colour/Size labels. Descriptive: they say
   *  WHICH variant this is. "Red Rose" and "White Rose" are still two separate Items. */
  attributeValues?: ApiItemAttrValue[];

  costMode: CostMode;
  /*  DEC-ADM-012 — every cost figure is ABSENT for anybody whose template does not
      say "See cost prices"; the server strips them, so a screen cannot leak one.  */
  standardCostPaisa?: number;  // the PURCHASE rate — what we pay
  computedCostPaisa?: number | null;
  effectiveCostPaisa?: number; // derived server-side so the maths lives in one place

  /** DEC-ITM-018 — Item owns the buy side and the FLOOR. */
  minMarginBp?: number | null;
  minMarginPaisa?: number | null;
  floorPricePaisa?: number | null; // derived: cost + the margin rule. null = no rule set

  /** DEC-ITM-024 — may this item also reach the website's product page */
  isOnline?: boolean;

  /** DEC-ITM-022/023 — the COUNTER price. The website's price lives on the Product. */
  sellingPricePaisa?: number | null; // manual override; null = follows cost + markup
  markupBp?: number | null;          // this item's own profit %; null = shop default
  markupUsedBp?: number;             // derived: the percent actually applied
  suggestedSellPricePaisa?: number | null; // derived: cost + markup (null when no cost)
  effectiveSellPricePaisa?: number | null; // derived: the override, else the suggestion
  sellPriceIsManual?: boolean;

  /** DEC-ITM-019 — starting figures for Sales, not the final ones */
  vatRateBp?: number | null;
  maxDiscountBp?: number | null;

  isPerishable: boolean;
  shelfLifeDays?: number | null;
  /** DEC-INV-007 — expiry lots only for items with a printed expiry date */
  trackExpiry?: boolean;
  reorderLevel?: number | null;
  description?: string | null;

  isActive: boolean;
  components?: ApiItemComponent[];
  _count?: { products: number; components: number; usedIn: number };
}

export interface ItemWrite {
  /** DEC-ITM-026 — resend with true after the UNIT_CONFIRM: refusal is shown to a human */
  confirmUnitChange?: boolean;
  sku?: string;
  name?: string;
  itemType?: ItemType;
  itemTypeId?: string | null;
  itemCategoryId?: string | null;
  brandId?: string | null;
  unitId?: string;
  imageUrl?: string | null;
  isStockTracked?: boolean;
  assemblyMode?: AssemblyMode;
  isSaleable?: boolean;
  isPurchasable?: boolean;
  isReturnable?: boolean;
  weightGram?: number | null;
  /** sending this REPLACES the whole set */
  attributeValueIds?: string[];
  costMode?: CostMode;
  standardCostPaisa?: number;
  isOnline?: boolean;                // DEC-ITM-024 — may go on the website
  sellingPricePaisa?: number | null; // DEC-ITM-022 — the counter price override
  markupBp?: number | null;          // DEC-ITM-023 — this item's own profit %
  minMarginBp?: number | null;
  minMarginPaisa?: number | null;
  vatRateBp?: number | null;
  maxDiscountBp?: number | null;
  isPerishable?: boolean;
  shelfLifeDays?: number | null;
  reorderLevel?: number | null;
  description?: string | null;
  isActive?: boolean;
}

/* ------------------------------------------------- item types (DEC-ITM-017) */

export interface ApiItemTypeRow {
  id: string;
  name: string;
  behaviour: ItemType;   // which of the five it acts like — the rules read THIS
  isSystem: boolean;     // the five seeded rows: undeletable, behaviour frozen
  colour?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  _count?: { items: number };
}

export const listItemTypes = () => j<ApiItemTypeRow[]>(`/item-types`);
export const createItemType = (b: { name: string; behaviour: ItemType; colour?: string | null }) =>
  j<ApiItemTypeRow>(`/item-types`, { method: "POST", body: JSON.stringify(b) });
export const updateItemType = (
  id: string,
  b: { name?: string; behaviour?: ItemType; colour?: string | null; isActive?: boolean },
) => j<ApiItemTypeRow>(`/item-types/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteItemType = (id: string) =>
  j<{ id: string; deleted: boolean }>(`/item-types/${id}`, { method: "DELETE" });

/** the five built-ins, for when the API is unreachable and the form still has to render */
export const FALLBACK_ITEM_TYPES: ApiItemTypeRow[] = [
  { id: "sys-raw", name: "Raw material", behaviour: "RAW", isSystem: true, colour: "#0e8f74" },
  { id: "sys-fin", name: "Finished", behaviour: "FINISHED", isSystem: true, colour: "#8b21c9" },
  { id: "sys-pack", name: "Packaging", behaviour: "PACKAGING", isSystem: true, colour: "#b5642f" },
  { id: "sys-cons", name: "Consumable", behaviour: "CONSUMABLE", isSystem: true, colour: "#8a6d1f" },
  { id: "sys-serv", name: "Service", behaviour: "SERVICE", isSystem: true, colour: "#2563a8" },
];

/** DEC-ITM-018 — the floor, computed the same way the server does it. */
export function floorPrice(
  costPaisa: number,
  minMarginBp?: number | null,
  minMarginPaisa?: number | null,
): number | null {
  if (minMarginBp) return Math.round(costPaisa * (1 + minMarginBp / 10_000));
  if (minMarginPaisa) return costPaisa + minMarginPaisa;
  return null;
}

export interface ComponentWrite {
  componentItemId?: string;
  qtyMilli?: number;
  unitId?: string;
  wastageBp?: number;
  isOptional?: boolean;
  displayText?: string | null;
  sortOrder?: number;
}

/** plain-English label + colour for each item type — one source, used by every screen */
export const ITEM_TYPE_META: Record<
  ItemType,
  { label: string; short: string; colour: string; bg: string; blurb: string }
> = {
  RAW: {
    label: "Raw material", short: "Raw", colour: "#0e8f74", bg: "#e7f5f1",
    blurb: "Goes INTO something — rose stems, lilies, foliage.",
  },
  FINISHED: {
    label: "Finished", short: "Finished", colour: "#7a2ea8", bg: "#f5eafb",
    blurb: "Sold as it is (teddy) or assembled from a recipe (bouquet).",
  },
  PACKAGING: {
    label: "Packaging", short: "Packing", colour: "#b5642f", bg: "#f9efe6",
    blurb: "Wraps the gift — box, ribbon, wrapping paper.",
  },
  CONSUMABLE: {
    label: "Consumable", short: "Consumable", colour: "#8a6d1f", bg: "#faf3df",
    blurb: "Used up, never sold — glue, tape, pins.",
  },
  SERVICE: {
    label: "Service", short: "Service", colour: "#2563a8", bg: "#e8f0fa",
    blurb: "Nothing to store — gift wrapping, card writing.",
  },
};

export const ASSEMBLY_META: Record<AssemblyMode, { label: string; blurb: string }> = {
  NONE: { label: "Simple item", blurb: "Bought as-is. No recipe." },
  MAKE_TO_ORDER: {
    label: "Made when ordered",
    blurb: "No stock of its own — we count how many we COULD make from the ingredients.",
  },
  MAKE_TO_STOCK: {
    label: "Made in advance",
    blurb: "Assembled ahead and kept on the shelf, so it has stock of its own.",
  },
};

/** 24000 → "24"; 500 → "0.5". Quantities are integer thousandths (never a float in the DB). */
export function fmtQty(milli: number): string {
  const v = milli / 1000;
  return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(3)));
}
/** "24" / "0.5" → integer thousandths */
export function toMilli(v: string | number): number {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? Math.round(n * 1000) : 0;
}

export const listItems = (q?: {
  search?: string; type?: string; status?: string; sort?: string; dir?: string;
}) => {
  const p = new URLSearchParams();
  if (q?.search) p.set("search", q.search);
  if (q?.type && q.type !== "ALL") p.set("type", q.type);
  if (q?.status && q.status !== "all") p.set("status", q.status);
  if (q?.sort) p.set("sort", q.sort);
  if (q?.dir) p.set("dir", q.dir);
  const qs = p.toString();
  return j<ApiItem[]>(`/items${qs ? `?${qs}` : ""}`);
};
export const getItem = (id: string) => j<ApiItem>(`/items/${id}`);

/** DEC-ITM-023 — the shop's default profit percent, one row */
export interface ApiItemSettings { defaultMarkupBp: number }
export const getItemSettings = () => j<ApiItemSettings>(`/items/settings`);
export const patchItemSettings = (b: { defaultMarkupBp: number }) =>
  j<ApiItemSettings>(`/items/settings`, { method: "PATCH", body: JSON.stringify(b) });
export const createItem = (b: ItemWrite & { name: string; itemType: ItemType; unitId: string }) =>
  j<ApiItem>(`/items`, { method: "POST", body: JSON.stringify(b) });
export const updateItem = (id: string, b: ItemWrite) =>
  j<ApiItem>(`/items/${id}`, { method: "PATCH", body: JSON.stringify(b) });
/** ITM-R07 — `detach` unlinks any Products first (Product.itemId is nullable, so the
 *  product itself is unharmed). Without it the API refuses and says how many are linked. */
export const deleteItem = (id: string, detach = false) =>
  j<{ id: string; deleted: boolean; detached: number }>(
    `/items/${id}${detach ? "?detach=1" : ""}`, { method: "DELETE" },
  );

/** The API prefixes a linked-product refusal with `LINKED:<n>:` so the screen can offer
 *  the one-click unlink instead of just printing a wall of red. */
export function linkedProductCount(e: unknown): number | null {
  // the thrown Error carries the whole JSON body, so search it rather than anchoring
  const m = /LINKED:(\d+):/.exec(e instanceof Error ? e.message : String(e));
  return m ? Number(m[1]) : null;
}
export const itemUsage = (id: string) =>
  j<{ products: { id: string; name: string; slug: string }[]; usedInRecipes: { id: string; name: string; sku: string }[] }>(
    `/items/${id}/usage`,
  );

export const addItemComponent = (itemId: string, b: ComponentWrite & { componentItemId: string; qtyMilli: number }) =>
  j<ApiItemComponent>(`/items/${itemId}/components`, { method: "POST", body: JSON.stringify(b) });
export const updateItemComponent = (lineId: string, b: ComponentWrite) =>
  j<ApiItemComponent>(`/items/components/${lineId}`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteItemComponent = (lineId: string) =>
  j<{ id: string; deleted: boolean }>(`/items/components/${lineId}`, { method: "DELETE" });

/** DEC-ITM-009 — one click, idempotent: every Product with no Item gets one */
export const generateItemsFromProducts = () =>
  j<{ created: number; linked: number; skipped: number; message: string }>(
    `/items/generate-from-products`,
    { method: "POST" },
  );

/* Demo ONLY when the API is unreachable; an empty-but-reachable DB is REAL. */
export async function loadItemsSafe(): Promise<{ items: ApiItem[]; isDemo: boolean }> {
  try {
    return { items: await listItems(), isDemo: false };
  } catch {
    return { items: [], isDemo: true };
  }
}

/** POST the starter set into an empty real DB (needs at least one Unit to exist) */
/* ---- Item visuals (DEC-ITM-012) -------------------------------------------------
   Every item gets SOMETHING to look at, immediately: a real photo when one has been
   uploaded, otherwise a stable colour tile derived from the SKU. Deterministic, so the
   same rose is the same colour on every screen and after every refresh — that is what
   makes a long list scannable.
--------------------------------------------------------------------------------- */

/** stable 0..359 hue from a string */
function hueOf(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}
/** the gradient shown when an item has no photo yet */
export function itemTint(seed: string): string {
  const h = hueOf(seed);
  return `linear-gradient(140deg, hsl(${h} 62% 62%), hsl(${(h + 38) % 360} 58% 48%))`;
}
/** "Red Rose (fresh cut)" → "RR" */
export function itemInitials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return (words[0][0] + (words[1]?.[0] ?? "")).toUpperCase();
}

/*
  ⚠️ THE PICTURE BUG — fixed 31 Jul 2026. Read this before touching it.

  This helper used to return a base64 data URL: it read the file in the browser,
  drew it onto a canvas, and handed back a ~40KB string that was then saved into
  a normal text column. It looked like it worked, because the preview on screen
  came from the browser and never from the server.

  Two things went wrong every time.

   1. base64 is about a third larger than the file it encodes, and it travelled
      inside the JSON body. Anything but a small PNG pushed the request past the
      body limit, so the save failed — but the picture was already on screen, so
      the owner had no way to tell. Refresh the page and it was gone.
   2. Even when it did fit, the photograph now lived inside the row. Every list
      request that read that table dragged the picture along with it.

  It is now a real upload. The file goes to ImageKit through `POST /media/upload`
  and only the URL — a short string — is stored. The preview is drawn from the
  returned URL, so what is on screen is what is in the database, always.

  The downscale is kept, but as a courtesy rather than a necessity: a 12MB phone
  photograph would be refused by the 10MB limit on the server, and shrinking it
  first turns a confusing rejection into a successful upload. Files already under
  the ceiling are sent untouched — ImageKit resizes on delivery, so there is no
  reason to throw away detail here.
 */
/* ⚠️ `SHRINK_ABOVE_BYTES` (3 MB) AND `shrink()` STOOD HERE AND ARE GONE,
   1 Aug 2026. They re-encoded only ABOVE a threshold, once, at a fixed
   quality — so a 2.5 MB photograph was stored untouched and a 4 MB one often
   came out at 2 MB. A threshold answers "when do we bother"; the owner's rule
   answers "what may be stored", and only the second one keeps a product page
   openable on mobile data. Everything now goes through `fitUnderBudget`. */

/**
 * Pick a photograph and get back the URL it now lives at.
 *
 * `maxPx` is the longest edge the picture is shrunk to IF it is over 3MB. It is
 * not a thumbnail size — never pass something small hoping to save space, because
 * the same URL is used at full size elsewhere.
 */
export async function uploadItemImage(
  file: File,
  folder: UploadFolder,
  maxPx = 1600,
): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("That file is not an image.");
  if (file.size > MAX_SOURCE_BYTES)
    throw new Error(`That file is too large to open (${(file.size / 1024 / 1024).toFixed(0)} MB).`);

  /*  ⚠️ IT USED TO RE-ENCODE ONLY ABOVE 3 MB, ONCE, AT q0.88 — so a 2.5 MB
      photograph went up untouched and a 4 MB one often came out at 2 MB. The
      owner's rule (1 Aug 2026) is a ceiling, not a trigger: nothing over 1 MB
      is stored, whatever it started as. Every image on the site now goes
      through the same budget.

      NOT squared here. This is the shared uploader — banners are wide, icons
      are icons, and forcing 1:1 on them would crop the sides off a hero. The
      1:1 rule (DEC-PDP-11) belongs to PRODUCT photos, and those go through
      `uploadProductPhoto`.  */
  const img = await loadImage(file);
  const blob = await fitUnderBudget(img, { square: false, maxPx });
  const toSend = new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
    type: "image/jpeg",
  });
  const { url } = await uploadImage(toSend, folder);
  return url;
}

/* ─────────────────── SQUARE, ALWAYS ───────────────────
   Owner's standing rule, 1 Aug 2026: *"image jen 1/1 hoy alwas"*.

   ⚠️ WHY THE CROP HAPPENS HERE AND NOT IN CSS. Every surface that shows a
   product photo — the PDP gallery, the category card, the admin tile, the
   WhatsApp share preview — already forces a square box with `bg-cover`, so a
   3:4 phone photo was ALREADY being cropped, just differently in each place and
   invisibly. Worse, the share preview and any Google Shopping feed take the raw
   file, so the picture a customer sees on WhatsApp was not the picture the shop
   approved. Cropping once, at upload, means the file IS the thing everyone sees.

   ⚠️ CENTRE CROP, AND THE OWNER IS TOLD WHEN IT HAPPENS. Silently cutting the
   top off a tall bouquet is exactly the kind of small dishonesty that gets
   noticed a week later. `wasCropped` comes back so the screen can say so.

   Not rejection: nearly every photo taken on a phone in this shop will be 4:3
   or 3:4, and a tool that refuses the camera its owner actually uses is a tool
   nobody uses.
*/
export const PRODUCT_IMAGE_PX = 1600;
/** below this the photo is too small to fill a product page cleanly */
export const MIN_IMAGE_PX = 600;

/* ─────────────────── ONE MEGABYTE, ALWAYS ───────────────────
   Owner's rule, 1 Aug 2026: *"max 1 mb, tar upore kono image na — tar upore
   image dileo eta resize kore 1 mb kore nibe"*.

   ⚠️ A CEILING ON WHAT IS STORED, NOT A DOOR ON WHAT MAY BE PICKED. The
   difference is the whole design. "Your file is 4 MB, the limit is 1 MB" is a
   dead end that makes somebody go and find image-compression software; the
   shop's own camera produces 3–6 MB files, so that error would fire on almost
   every photo. Instead the browser re-encodes until it fits, and the person
   never learns that a limit exists.

   Why it matters more here than anywhere else: nearly every Radian order comes
   from a phone on mobile data. A product page with eight 4 MB photographs is
   32 MB before a single word of it is read — the customer leaves before the
   flowers ever appear.

   HOW IT GETS THERE, in the order that costs the least quality:
     1. drop JPEG quality in steps — invisible on a photograph long before it
        is small enough
     2. only then shrink the pixels, which IS visible
   Doing it the other way round throws away detail that quality alone would
   have paid for.
*/
export const TARGET_BYTES = 1024 * 1024;
export const TARGET_MB = 1;
/**
 * The largest file we will even open. Not a rule about quality — a guard so a
 * mis-picked 200 MB file cannot lock up the browser decoding it.
 */
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

const QUALITY_STEPS = [0.9, 0.82, 0.74, 0.66, 0.58, 0.5];
const PX_STEPS = [1600, 1400, 1200, 1000, 800];

function draw(img: HTMLImageElement, px: number, square: boolean): HTMLCanvasElement {
  const { width: w, height: h } = img;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process that image.");
  if (square) {
    const side = Math.min(w, h);
    const out = Math.min(px, side); // never upscale
    canvas.width = out;
    canvas.height = out;
    /*  White, not transparent: JPEG has no alpha, so a PNG with a transparent
        background would otherwise come out black.  */
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, out, out);
    ctx.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, out, out);
  } else {
    const scale = Math.min(1, px / Math.max(w, h));
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  }
  return canvas;
}

const toBlob = (c: HTMLCanvasElement, q: number) =>
  new Promise<Blob>((res, rej) =>
    c.toBlob((b) => (b ? res(b) : rej(new Error("Could not process that image."))), "image/jpeg", q),
  );

/** Re-encode until it is under the budget. Returns the smallest acceptable try. */
async function fitUnderBudget(
  img: HTMLImageElement,
  opts: { square: boolean; maxPx: number },
): Promise<Blob> {
  let last: Blob | null = null;
  for (const px of PX_STEPS.filter((p) => p <= opts.maxPx)) {
    const canvas = draw(img, px, opts.square);
    for (const q of QUALITY_STEPS) {
      const blob = await toBlob(canvas, q);
      last = blob;
      if (blob.size <= TARGET_BYTES) return blob;
    }
  }
  /*  Every step tried and still over — in practice a photograph never gets
      here. Return the smallest rather than throwing: a picture slightly over
      budget is worth more to the shop than no picture at all, and the API's
      own 10 MB limit is still there as the real backstop.  */
  if (!last) throw new Error("Could not process that image.");
  return last;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not open that image."));
    };
    img.src = url;
  });
}

/* the old `squareCrop` lived here. It cropped, but it encoded once at q0.9 and
   whatever came out was what got stored — which is how a detailed photograph
   still went up at 2 MB. Replaced by `fitUnderBudget`, which keeps re-encoding
   until it is under 1 MB (owner's rule, 1 Aug 2026). */

/**
 * Upload a PRODUCT photo. Always comes back square, always under 1 MB.
 *
 * `wasShrunk` is true when the file we stored is smaller than the one picked,
 * so the screen can say so — a shop owner who has carefully exported a 6 MB
 * photograph deserves to know it did not go up untouched.
 */
export async function uploadProductPhoto(
  file: File,
): Promise<{ url: string; wasCropped: boolean; wasShrunk: boolean }> {
  if (!file.type.startsWith("image/")) throw new Error("not an image file");
  if (file.size > MAX_SOURCE_BYTES)
    throw new Error(
      `too large to open (${(file.size / 1024 / 1024).toFixed(0)} MB)`,
    );

  const img = await loadImage(file);
  if (Math.min(img.width, img.height) < MIN_IMAGE_PX)
    throw new Error(
      `too small (${img.width}\u00d7${img.height}) — needs at least ${MIN_IMAGE_PX}\u00d7${MIN_IMAGE_PX}`,
    );

  const blob = await fitUnderBudget(img, { square: true, maxPx: PRODUCT_IMAGE_PX });
  const squared = new File(
    [blob],
    file.name.replace(/\.[^.]+$/, "") + ".jpg",
    { type: "image/jpeg" },
  );
  const { url } = await uploadImage(squared, "products");
  return {
    url,
    wasCropped: img.width !== img.height,
    wasShrunk: blob.size < file.size,
  };
}

/**
 * What the Stock column shows TODAY (DEC-ITM-005, confirmed by sobuj 21 Jul).
 * Item never stores a quantity. Once Inventory exists this same helper starts
 * returning real numbers — the screen does not change.
 *   MAKE_TO_ORDER → "can build N" from the ingredients, never its own stock
 *   everything else → its own per-warehouse balance
 */
export function itemStockLabel(
  i: Pick<ApiItem, "isStockTracked" | "assemblyMode">,
  /** live figures from /inventory/stock — pass them and the label goes real (22 Jul night) */
  live?: { totalQtyMilli: number; canBuild: number | null; unitShort?: string } | null,
): {
  text: string; hint: string; tone: "muted" | "info";
} {
  if (!i.isStockTracked) return { text: "n/a", hint: "Nothing physical to count.", tone: "muted" };
  if (i.assemblyMode === "MAKE_TO_ORDER") {
    if (live) {
      return {
        text: `can build ${live.canBuild ?? 0}`,
        hint: "Derived from the ingredients on hand — min(component stock ÷ recipe qty). Never a stock of its own (DEC-ITM-004).",
        tone: "info",
      };
    }
    return {
      text: "—",
      hint: "Built when ordered, so it has no stock of its own. Shows “can build N” once the inventory migration has run.",
      tone: "info",
    };
  }
  if (live) {
    return {
      text: `${fmtQty(live.totalQtyMilli)}${live.unitShort ? ` ${live.unitShort}` : ""}`,
      hint: live.totalQtyMilli < 0
        ? "Ledger is negative — count the shelf and post an adjustment (Inventory → Stock board)."
        : "Live from the Inventory ledger, all warehouses combined. Item stores no quantity itself (DEC-ITM-005).",
      tone: "info",
    };
  }
  return {
    text: "—",
    hint: "Stock lives in Inventory (per warehouse). Run radian_inventory_migrate.bat and this column goes live.",
    tone: "muted",
  };
}

/* ---- Item categories (DEC-ITM-007) — the Item module's OWN tree ----
   Deliberately separate from the storefront `Category`: that one has slug / meta / OG /
   navbar and exists for eCommerce. "Rose Stems" is a stockroom concept and must never
   reach the site menu or Google.                                                    */
export const listItemCategories = () => j<ApiItemCategory[]>(`/item-categories`);
export const createItemCategory = (b: ItemCategoryWrite & { name: string }) =>
  j<ApiItemCategory>(`/item-categories`, { method: "POST", body: JSON.stringify(b) });
export const updateItemCategory = (id: string, b: ItemCategoryWrite) =>
  j<ApiItemCategory>(`/item-categories/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteItemCategory = (id: string) =>
  j<{ id: string; deleted: boolean }>(`/item-categories/${id}`, { method: "DELETE" });

export async function loadItemCategoriesSafe(): Promise<{ groups: ApiItemCategory[]; isDemo: boolean }> {
  try {
    return { groups: await listItemCategories(), isDemo: false };
  } catch {
    return { groups: [], isDemo: true };
  }
}

/** the starter stockroom tree for a flower & gift shop */
/* ---- Item attributes (DEC-ITM-015) — Colour / Size, the stockroom's own ---- */
export const listItemAttributes = () => j<ApiItemAttribute[]>(`/item-attributes`);
export const createItemAttribute = (name: string) =>
  j<ApiItemAttribute>(`/item-attributes`, { method: "POST", body: JSON.stringify({ name }) });
export const updateItemAttribute = (id: string, b: { name?: string; isActive?: boolean; sortOrder?: number }) =>
  j<ApiItemAttribute>(`/item-attributes/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteItemAttribute = (id: string) =>
  j<{ id: string; deleted: boolean }>(`/item-attributes/${id}`, { method: "DELETE" });
export const addItemAttrValue = (attrId: string, b: { label: string; swatch?: string | null }) =>
  j<ApiItemAttrValue>(`/item-attributes/${attrId}/values`, { method: "POST", body: JSON.stringify(b) });
export const updateItemAttrValue = (valueId: string, b: { label?: string; swatch?: string | null; isActive?: boolean }) =>
  j<ApiItemAttrValue>(`/item-attributes/values/${valueId}`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteItemAttrValue = (valueId: string) =>
  j<{ id: string; deleted: boolean }>(`/item-attributes/values/${valueId}`, { method: "DELETE" });

export async function loadItemAttributesSafe(): Promise<{ attrs: ApiItemAttribute[]; isDemo: boolean }> {
  try {
    return { attrs: await listItemAttributes(), isDemo: false };
  } catch {
    return { attrs: [], isDemo: true };
  }
}

/** the obvious starting set for a flower shop */
/** DEC-ITM-016 — "Rose" + Colour[Red, Yellow, White] => three independent Items */
export interface VariantGenerateBody {
  baseName: string;
  itemType: ItemType;
  unitId: string;
  itemCategoryId?: string | null;
  brandId?: string | null;
  valueIdGroups: string[][];
  standardCostPaisa?: number;
  isPerishable?: boolean;
  weightGram?: number | null;
  skuPrefix?: string;
  /** the family photo — used for every variant that has none of its own */
  imageUrl?: string | null;
  /** per-variant overrides, keyed by the exact combination of label values */
  variantImages?: { valueIds: string[]; imageUrl: string | null }[];
}
export const generateItemVariants = (b: VariantGenerateBody) =>
  j<{ created: { id: string; name: string; sku: string }[]; skipped: number; message: string }>(
    `/items/generate-variants`, { method: "POST", body: JSON.stringify(b) },
  );

/** everything the Item editor needs in one round-trip */
export async function loadItemFormRefs(): Promise<{
  units: ApiUnit[];
  groups: ApiItemCategory[];
  brands: ApiBrand[];
  attributes: ApiItemAttribute[];
}> {
  const [units, groups, brands, attributes] = await Promise.all([
    listUnits().catch(() => [] as ApiUnit[]),
    listItemCategories().catch(() => [] as ApiItemCategory[]),
    listBrands().catch(() => [] as ApiBrand[]),
    listItemAttributes().catch(() => [] as ApiItemAttribute[]),
  ]);
  return { units, groups, brands, attributes };
}

/* ---- Item boards: trash · recipes · usage · history --------------------------- */

/** an assembled item plus what its products sell for (so a losing recipe is visible) */
export interface ApiRecipeItem extends ApiItem {
  products?: { id: string; name: string; slug: string; sellingPricePaisa: number }[];
}

export const listItemTrash = () => j<ApiItem[]>(`/items/trash`);
export const restoreItem = (id: string) =>
  j<{ id: string; restored: boolean }>(`/items/${id}/restore`, { method: "POST" });

/** ITM-R14 — destroy for good. The SKU must be sent back; the server checks it too. */
export const purgeItem = (id: string, confirmSku: string) =>
  j<{ id: string; purged: boolean; name: string; sku: string }>(`/items/${id}/purge`, {
    method: "POST",
    body: JSON.stringify({ confirmSku }),
  });
export const listItemRecipes = () => j<ApiRecipeItem[]>(`/items/recipes`);

export interface ApiItemEvent {
  id: string;
  entityId: string;
  kind: string;
  label: string;
  actorName: string;
  note?: string | null;
  createdAt: string;
}
export const getItemTimeline = (id: string) => j<ApiItemEvent[]>(`/items/${id}/timeline`);

export async function loadItemTrashSafe(): Promise<{ items: ApiItem[]; isDemo: boolean }> {
  try { return { items: await listItemTrash(), isDemo: false }; }
  catch { return { items: [], isDemo: true }; }
}
export async function loadItemRecipesSafe(): Promise<{ items: ApiRecipeItem[]; isDemo: boolean }> {
  try { return { items: await listItemRecipes(), isDemo: false }; }
  catch {
    return { items: [], isDemo: true };
  }
}

/**
 * What one line of a recipe costs: unit cost × qty × (1 + wastage).
 * Mirrors the API exactly (paisa · thousandths · basis points) so the screen and the
 * database can never disagree by a rounding step.
 */
export function lineCostPaisa(l: ApiItemComponent): number {
  const c = l.componentItem;
  const unitCost = c ? (c.costMode === "AUTO" ? (c.computedCostPaisa ?? 0) : c.standardCostPaisa) : 0;
  return Math.round((unitCost * l.qtyMilli * (10000 + l.wastageBp)) / (1000 * 10000));
}

/* ================================================================== PURCHASES
   RADIAN_PURCHASE_MODULE_ARCHITECTURE.md (locked 22 Jul 2026), DEC-PUR-001..009.
   Purchase never writes stock (DEC-PUR-002); supplier is free text until the
   Supplier module exists (DEC-PUR-003).
------------------------------------------------------------------------------ */

export type PurchaseStatus = "ORDERED" | "ADVANCE_PAID" | "RECEIVED" | "CANCELLED";
export type PayMethod = "CASH" | "BKASH" | "NAGAD" | "BANK" | "CARD" | "OTHER";

/* ---------------------------------------------------------------- DEC-GBL-001
   The shop's payment methods — ONE list for the whole Business OS. The screens
   below used to keep their own copies, which is how bKash could be off at the
   till and on in a purchase bill. */
export interface ApiPaymentAccount {
  id: string;
  name: string;
  accountRef: string | null;
  accountHolder: string | null;
  bankName: string | null;
  branchName: string | null;
  routingNo: string | null;
  isActive: boolean;
  isSystem: boolean;
}
export interface ApiPaymentAccountWrite {
  name?: string;
  accountRef?: string | null;
  accountHolder?: string | null;
  bankName?: string | null;
  branchName?: string | null;
  routingNo?: string | null;
}
export interface ApiPaymentMethod {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  isSystem: boolean;
  sortOrder: number;
  /** DEC-GBL-006 — the actual bKash numbers / bank accounts under this method */
  accounts?: ApiPaymentAccount[];
}
export const listPaymentMethods = () =>
  j<ApiPaymentMethod[]>(`/administration/payment-methods`);
export const updatePaymentMethod = (
  id: string,
  b: { isActive?: boolean; name?: string; sortOrder?: number },
) => j<ApiPaymentMethod>(`/administration/payment-methods/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const addPaymentAccount = (methodId: string, b: ApiPaymentAccountWrite) =>
  j<ApiPaymentMethod[]>(`/administration/payment-methods/${methodId}/accounts`, { method: "POST", body: JSON.stringify(b) });
export const updatePaymentAccount = (accountId: string, b: ApiPaymentAccountWrite & { isActive?: boolean }) =>
  j<ApiPaymentMethod[]>(`/administration/payment-accounts/${accountId}`, { method: "PATCH", body: JSON.stringify(b) });
export const deletePaymentAccount = (accountId: string) =>
  j<ApiPaymentMethod[]>(`/administration/payment-accounts/${accountId}`, { method: "DELETE" });

/** the four the counter and the buying side share, in the shop's own order */
export const TILL_CODES = ["CASH", "BKASH", "NAGAD", "CARD", "BANK", "OTHER"];

export const PAY_METHODS: { id: PayMethod; label: string }[] = [
  { id: "CASH", label: "Cash" },
  { id: "BKASH", label: "bKash" },
  { id: "NAGAD", label: "Nagad" },
  { id: "BANK", label: "Bank" },
  { id: "CARD", label: "Card" },
  { id: "OTHER", label: "Other" },
];

export interface ApiPurchaseLine {
  id: string;
  itemId: string;
  item?: { id: string; sku: string; name: string; imageUrl?: string | null } | null;
  unitId: string;
  unit?: { id: string; name: string; shortCode: string } | null;
  factorSnapshot: number;
  qtyMilli: number;
  receivedQtyMilli: number;
  unitPricePaisa: number;
  lineTotalPaisa: number;
}
export interface ApiPurchasePayment {
  id: string;
  amountPaisa: number;
  method: PayMethod;
  paidAt: string;
  note?: string | null;
}
export interface ApiPurchaseReturn {
  id: string;
  returnNo: string;
  returnDate: string;
  reason?: string | null;
  totalPaisa: number;
  dueCutPaisa: number;
  creditPaisa: number;
  lines: { id: string; purchaseLineId: string; qtyMilli: number; valuePaisa: number }[];
  purchase?: { id: string; purchaseNo: string; supplierName: string };
}
export interface ApiPurchase {
  id: string;
  purchaseNo: string;
  status: PurchaseStatus;
  supplierName: string;
  supplierPhone?: string | null;
  purchaseDate: string;
  receivedAt?: string | null;
  supplierReceiptNo?: string | null;
  attachmentUrl?: string | null;
  notes?: string | null;
  subTotalPaisa: number;
  discountPaisa: number;
  /** rounding/bargain adjustment — negative or positive (39,920 → 39,900) */
  adjustmentPaisa?: number;
  /** DEC-PUR-012 — supplier VAT: the rate as typed, and what it came to */
  taxRateBps?: number;
  vatPaisa?: number;
  grandTotalPaisa: number;
  lines: ApiPurchaseLine[];
  payments: ApiPurchasePayment[];
  returns: ApiPurchaseReturn[];
  // derived server-side (shape()) so screens never re-do the maths
  paidPaisa: number;
  duePaisa: number;
  payablePaisa: number;
  returnedPaisa: number;
  partiallyReceived: boolean;
  /** DEC-PUR-010 — received goods that never reached stock (detail read only) */
  stockGap?: { itemId: string; name: string; missingMilli: number }[] | null;
  /** DEC-PUR-010 — list-level flag: received, and not one movement posted */
  stockMissing?: boolean;
  fullyReceived: boolean;
  paymentState: "PAID" | "PARTIAL" | "UNPAID";
}
export interface PurchaseStats {
  totalBoughtPaisa: number;
  totalPaidPaisa: number;
  totalDuePaisa: number;
  monthBoughtPaisa: number;
  monthCount: number;
  dueCount: number;
  advanceWaiting: {
    id: string; purchaseNo: string; supplierName: string;
    paidPaisa: number; grandTotalPaisa: number; purchaseDate: string;
  }[];
  openCreditPaisa: number;
  count: number;
}

export interface PurchaseLineWrite {
  itemId: string;
  unitId: string;
  qtyMilli: number;
  unitPricePaisa: number;
}
export interface PurchaseCreateWrite {
  supplierName: string;
  /** DEC-SUP-007 — Supplier master FK; name stays as the snapshot */
  supplierId?: string;
  supplierPhone?: string;
  purchaseDate?: string;
  supplierReceiptNo?: string;
  attachmentUrl?: string;
  notes?: string;
  discountPaisa?: number;
  adjustmentPaisa?: number;
  /** DEC-PUR-012 — supplier VAT rate in basis points (750 = 7.5%) */
  taxRateBps?: number;
  lines: PurchaseLineWrite[];
  mode?: "QUICK" | "ADVANCE";
  payment?: { amountPaisa: number; method: PayMethod; note?: string };
  confirmCost?: boolean;
}

export const listPurchases = (q?: { search?: string; status?: string; sort?: string; dir?: string }) => {
  const p = new URLSearchParams();
  if (q?.search) p.set("search", q.search);
  if (q?.status && q.status !== "ALL") p.set("status", q.status);
  if (q?.sort) p.set("sort", q.sort);
  if (q?.dir) p.set("dir", q.dir);
  const qs = p.toString();
  return j<ApiPurchase[]>(`/purchases${qs ? `?${qs}` : ""}`);
};
export const getPurchase = (id: string) => j<ApiPurchase>(`/purchases/${id}`);
export const getPurchaseStats = () => j<PurchaseStats>(`/purchases/stats`);
export const createPurchase = (b: PurchaseCreateWrite) =>
  j<ApiPurchase>(`/purchases`, { method: "POST", body: JSON.stringify(b) });
export const receivePurchase = (id: string, b?: { lines?: { lineId: string; qtyMilli: number }[]; confirmCost?: boolean }) =>
  j<ApiPurchase>(`/purchases/${id}/receive`, { method: "POST", body: JSON.stringify(b ?? {}) });
/** DEC-PUR-010 — received goods that never reached stock; safe to press twice */
export const repostPurchaseStock = (id: string) =>
  j<ApiPurchase>(`/purchases/${id}/repost-stock`, { method: "POST" });
export const addPurchasePayment = (id: string, b: { amountPaisa: number; method: PayMethod; accountId?: string; note?: string }) =>
  j<ApiPurchase>(`/purchases/${id}/payments`, { method: "POST", body: JSON.stringify(b) });
export const cancelPurchase = (id: string, note?: string) =>
  j<ApiPurchase>(`/purchases/${id}/cancel`, { method: "POST", body: JSON.stringify({ note }) });
export const createPurchaseReturn = (b: { purchaseId: string; reason?: string; lines: { purchaseLineId: string; qtyMilli: number }[] }) =>
  j<ApiPurchase>(`/purchases/returns`, { method: "POST", body: JSON.stringify(b) });
export const listPurchaseReturns = () => j<ApiPurchaseReturn[]>(`/purchases/returns`);
export const purchaseSuppliers = (search?: string) =>
  j<{ name: string; count: number }[]>(`/purchases/suppliers${search ? `?search=${encodeURIComponent(search)}` : ""}`);

/** PUR-R07 — the API refuses a wild cost jump with this prefix; the form offers a confirm */
export function isCostJumpRefusal(e: unknown): boolean {
  return /COST_JUMP:/.test(e instanceof Error ? e.message : String(e));
}

/** DEC-ITM-026 — the API wants a human to see the unit restatement numbers first */
export function isUnitConfirmRefusal(e: unknown): boolean {
  return /UNIT_CONFIRM:/.test(e instanceof Error ? e.message : String(e));
}

/* Demo ONLY when the API is unreachable; an empty-but-reachable DB is REAL. */
export async function loadPurchasesSafe(): Promise<{ purchases: ApiPurchase[]; isDemo: boolean }> {
  try {
    return { purchases: await listPurchases(), isDemo: false };
  } catch {
    return { purchases: [], isDemo: true };
  }
}
export async function loadPurchaseStatsSafe(): Promise<{ stats: PurchaseStats; isDemo: boolean }> {
  try {
    return { stats: await getPurchaseStats(), isDemo: false };
  } catch {
    return {
      stats: {
        totalBoughtPaisa: 0, totalPaidPaisa: 0, totalDuePaisa: 0, monthBoughtPaisa: 0,
        monthCount: 0, dueCount: 0, advanceWaiting: [], openCreditPaisa: 0, count: 0,
      },
      isDemo: true,
    };
  }
}

export const PURCHASE_STATUS_META: Record<PurchaseStatus, { label: string; colour: string; bg: string }> = {
  ORDERED: { label: "Ordered", colour: "#2563a8", bg: "#e8f0fa" },
  ADVANCE_PAID: { label: "Advance paid", colour: "#b45309", bg: "#fff4e6" },
  RECEIVED: { label: "Received", colour: "#0e7a3d", bg: "#e8f7ef" },
  CANCELLED: { label: "Cancelled", colour: "#8d7a97", bg: "#efe9f4" },
};

/** purchase timeline — same audit trail pattern as products (D9 lesson: UI tells the
 *  story top-down, so screens reverse the newest-first API order) */
export const getPurchaseTimeline = (id: string) => j<ActivityEvent[]>(`/purchases/${id}/timeline`);

export interface PurchasePriceHistory {
  averagePaisa: number | null;
  lines: {
    id: string;
    receivedQtyMilli: number;
    qtyMilli: number;
    unitPricePaisa: number;
    factorSnapshot: number;
    unit?: { name: string; shortCode: string } | null;
    purchase: { purchaseNo: string; supplierName: string; purchaseDate: string };
  }[];
}
export const getPurchasePriceHistory = (itemId: string) =>
  j<PurchasePriceHistory>(`/purchases/price-history/${itemId}`);

/* ================================================================ Inventory
   RADIAN_INVENTORY_MODULE_ARCHITECTURE.md (locked 22 Jul 2026).
   Stock's ONE owner (DEC-ITM-005). Ledger is immutable (DEC-INV-012) — there
   is deliberately no edit/delete call here. */

export interface ApiWarehouse {
  id: string;
  code: string; // SHOP · STORE · any code the owner types
  name: string;
  address?: string | null;
  isActive: boolean;
}

export interface InvStockRow {
  itemId: string;
  sku: string;
  name: string;
  imageUrl?: string | null;
  unitName: string;
  unitShort: string;
  assemblyMode: "NONE" | "MAKE_TO_ORDER" | "MAKE_TO_STOCK";
  trackExpiry: boolean;
  reorderLevel: number | null;
  perWarehouse: { warehouseId: string; qtyMilli: number }[];
  totalQtyMilli: number;
  unitCostPaisa: number;
  valuePaisa: number;
  canBuild: number | null; // DEC-INV-010 — MAKE_TO_ORDER only
  isNegative: boolean;
  isLow: boolean;
}

export type InvReason =
  | "OPENING" | "PURCHASE" | "PURCHASE_RETURN" | "SALE" | "SALE_RETURN"
  | "TRANSFER" | "WASTAGE" | "ADJUSTMENT" | "GIFT";

export interface InvMovement {
  id: string;
  reason: InvReason;
  qtyMilli: number; // signed
  unitCostPaisa: number;
  valuePaisa: number;
  note?: string | null;
  actor?: string | null;
  createdAt: string;
  item: { sku: string; name: string; imageUrl?: string | null };
  warehouse: { code: string; name: string };
}

export interface InvOverview {
  needsAttention: {
    negative: InvStockRow[];
    negativeCount: number;
    low: InvStockRow[];
    lowCount: number;
    expiring: { id: string; expiryDate: string; qtyMilli: number; item: { sku: string; name: string; imageUrl?: string | null } }[];
  };
  kpis: {
    totalValuePaisa: number;
    itemCount: number;
    wastageTodayPaisa: number;
    wastageMonthPaisa: number;
    giftMonthPaisa: number;
    movementsToday: number;
  };
}

export const INV_REASON_META: Record<InvReason, { label: string; colour: string; bg: string }> = {
  OPENING:         { label: "Opening",     colour: "#2563a8", bg: "#e8f0fa" },
  PURCHASE:        { label: "Purchase",    colour: "#0e7a3d", bg: "#e8f7ef" },
  PURCHASE_RETURN: { label: "Purch. return", colour: "#b45309", bg: "#fff4e6" },
  SALE:            { label: "Sale",        colour: "#470066", bg: "#f5eafb" },
  SALE_RETURN:     { label: "Sale return", colour: "#2563a8", bg: "#e8f0fa" },
  TRANSFER:        { label: "Transfer",    colour: "#0e8f74", bg: "#e7f5f1" },
  WASTAGE:         { label: "Wastage",     colour: "#c0392b", bg: "#fdecea" },
  ADJUSTMENT:      { label: "Adjustment",  colour: "#8d7a97", bg: "#efe9f4" },
  GIFT:            { label: "Gift",        colour: "#cf43ea", bg: "#fbeafe" },
};

export const listInvWarehouses = () => j<ApiWarehouse[]>(`/inventory/warehouses`);
/* DEC-INV-017 — the owner makes and names his own stores */
export const createInvWarehouse = (b: { code: string; name: string; address?: string }) =>
  j<ApiWarehouse>(`/inventory/warehouses`, { method: "POST", body: JSON.stringify(b) });
export const updateInvWarehouse = (
  id: string,
  b: { name?: string; address?: string | null; isActive?: boolean },
) => j<ApiWarehouse>(`/inventory/warehouses/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteInvWarehouse = (id: string) =>
  j<{ ok: boolean }>(`/inventory/warehouses/${id}`, { method: "DELETE" });
export const getInvOverview = () => j<InvOverview>(`/inventory/overview`);
export const listInvStock = (params?: { search?: string; filter?: string }) => {
  const q = new URLSearchParams();
  if (params?.search) q.set("search", params.search);
  if (params?.filter) q.set("filter", params.filter);
  return j<InvStockRow[]>(`/inventory/stock?${q.toString()}`);
};
export const listInvMovements = (params?: { itemId?: string; warehouseId?: string; reason?: string; days?: number }) => {
  const q = new URLSearchParams();
  if (params?.itemId) q.set("itemId", params.itemId);
  if (params?.warehouseId) q.set("warehouseId", params.warehouseId);
  if (params?.reason) q.set("reason", params.reason);
  if (params?.days) q.set("days", String(params.days));
  return j<InvMovement[]>(`/inventory/movements?${q.toString()}`);
};

export async function loadInvOverviewSafe(): Promise<{ overview: InvOverview; isDemo: boolean }> {
  try {
    return { overview: await getInvOverview(), isDemo: false };
  } catch {
    return {
      overview: {
        needsAttention: { negative: [], negativeCount: 0, low: [], lowCount: 0, expiring: [] },
        kpis: {
          totalValuePaisa: 0, itemCount: 0, wastageTodayPaisa: 0,
          wastageMonthPaisa: 0, giftMonthPaisa: 0, movementsToday: 0,
        },
      },
      isDemo: true,
    };
  }
}
export async function loadInvStockSafe(params?: { search?: string; filter?: string }): Promise<{ rows: InvStockRow[]; isDemo: boolean }> {
  try {
    return { rows: await listInvStock(params), isDemo: false };
  } catch {
    return { rows: [], isDemo: true };
  }
}
export async function loadInvMovementsSafe(params?: { reason?: string; warehouseId?: string }): Promise<{ rows: InvMovement[]; isDemo: boolean }> {
  try {
    return { rows: await listInvMovements(params), isDemo: false };
  } catch {
    return { rows: [], isDemo: true };
  }
}
export async function loadInvWarehousesSafe(): Promise<{ rows: ApiWarehouse[]; isDemo: boolean }> {
  try {
    return { rows: await listInvWarehouses(), isDemo: false };
  } catch {
    return { rows: [], isDemo: true };
  }
}

/* ---- Inventory write side + docs (Opening / Transfer / Issue / Adjust) ---- */

export interface InvTransfer {
  id: string;
  transferNo: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  note?: string | null;
  status: string;
  actor?: string | null;
  createdAt: string;
  lines: { id: string; itemId: string; qtyMilli: number; item: { sku: string; name: string; imageUrl?: string | null } }[];
}

export interface InvIssue {
  id: string;
  issueNo: string;
  kind: "WASTAGE" | "GIFT";
  warehouseId: string;
  reason?: string | null;
  note?: string | null;
  totalValuePaisa: number;
  status: string;
  actor?: string | null;
  createdAt: string;
  lines: { id: string; itemId: string; qtyMilli: number; unitCostPaisa: number; valuePaisa: number; item: { sku: string; name: string; imageUrl?: string | null } }[];
}

export const postInvOpening = (dto: {
  lines: { itemId: string; warehouseId: string; qtyMilli: number; expiryDate?: string }[];
  note?: string;
}) => j<{ posted: number }>(`/inventory/opening`, { method: "POST", body: JSON.stringify(dto) });

export const postInvTransfer = (dto: {
  fromWarehouseId: string; toWarehouseId: string;
  lines: { itemId: string; qtyMilli: number }[]; note?: string;
}) => j<InvTransfer>(`/inventory/transfers`, { method: "POST", body: JSON.stringify(dto) });

export const postInvIssue = (dto: {
  kind: "WASTAGE" | "GIFT"; warehouseId: string; reason?: string; note?: string;
  lines: { itemId: string; qtyMilli: number }[];
}) => j<InvIssue>(`/inventory/issues`, { method: "POST", body: JSON.stringify(dto) });

export const postInvAdjust = (dto: {
  itemId: string; warehouseId: string; deltaQtyMilli: number; note?: string;
}) => j<InvMovement>(`/inventory/adjustments`, { method: "POST", body: JSON.stringify(dto) });

export const listInvTransfers = () => j<InvTransfer[]>(`/inventory/transfers`);
export const listInvIssues = (kind?: string) =>
  j<InvIssue[]>(`/inventory/issues${kind ? `?kind=${kind}` : ""}`);

export async function loadInvTransfersSafe(): Promise<{ rows: InvTransfer[]; isDemo: boolean }> {
  try {
    return { rows: await listInvTransfers(), isDemo: false };
  } catch {
    return { rows: [], isDemo: true };
  }
}
export async function loadInvIssuesSafe(kind?: string): Promise<{ rows: InvIssue[]; isDemo: boolean }> {
  try {
    return { rows: await listInvIssues(kind), isDemo: false };
  } catch {
    return { rows: [], isDemo: true };
  }
}

/* ---- Inventory reports + settings ---- */

export interface InvIssueReport {
  days: number;
  series: { date: string; wastagePaisa: number; giftPaisa: number }[];
  totalWastagePaisa: number;
  totalGiftPaisa: number;
}
export interface InvValuation {
  totalPaisa: number;
  rows: InvStockRow[];
}
export interface InvSettings {
  id: string;
  defaultSaleWarehouseId: string | null;
  defaultReceiveWarehouseId: string | null;
  allowPerOrderWarehouse: boolean;
  negativeStockPolicy: "ALLOW_WARN" | "BLOCK";
  /** DEC-ASM-003 — null → fallback chain (sale default → first warehouse) */
  defaultAssemblyComponentWarehouseId?: string | null;
  defaultAssemblyFinishedWarehouseId?: string | null;
}

export const getInvIssueReport = (days = 30) => j<InvIssueReport>(`/inventory/reports/issues?days=${days}`);
export const getInvValuation = () => j<InvValuation>(`/inventory/reports/valuation`);
export const getInvSettings = () => j<InvSettings>(`/inventory/settings`);
/** DEC-GBL-004 — why goods leave without money, editable at last */
export interface ApiIssueReason { id: string; purpose: string; label: string; isActive: boolean; sortOrder: number }
export const getIssueReasons = (purpose: "WASTAGE" | "GIFT") =>
  j<ApiIssueReason[]>(`/inventory/issue-reasons?purpose=${purpose}`);
export const addIssueReason = (purpose: "WASTAGE" | "GIFT", label: string) =>
  j<ApiIssueReason>(`/inventory/issue-reasons`, { method: "POST", body: JSON.stringify({ purpose, label }) });
export const updateIssueReason = (id: string, label: string) =>
  j<ApiIssueReason>(`/inventory/issue-reasons/${id}`, { method: "PATCH", body: JSON.stringify({ label }) });
export const deleteIssueReason = (id: string) =>
  j<{ ok: boolean }>(`/inventory/issue-reasons/${id}`, { method: "DELETE" });

/** the Wastage & Gift analysis — every angle in one call */
export interface IssueAnalysis {
  days: number;
  totalWastagePaisa: number;
  totalGiftPaisa: number;
  entryCount: number;
  series: { date: string; wastagePaisa: number; giftPaisa: number }[];
  byMonth: { month: string; wastagePaisa: number; giftPaisa: number }[];
  byReason: { reason: string; kind: string; paisa: number; count: number }[];
  byWarehouse: { name: string; wastagePaisa: number; giftPaisa: number }[];
  byItem: {
    itemId: string; name: string; sku: string; imageUrl: string | null; unitName: string | null;
    wastagePaisa: number; giftPaisa: number; wastageQtyMilli: number; giftQtyMilli: number;
  }[];
}
export const getIssueAnalysis = (days = 30) =>
  j<IssueAnalysis>(`/inventory/reports/issue-analysis?days=${days}`);

export const patchInvSettings = (dto: Partial<Omit<InvSettings, "id">>) =>
  j<InvSettings>(`/inventory/settings`, { method: "PATCH", body: JSON.stringify(dto) });

export async function loadInvIssueReportSafe(days = 30): Promise<{ report: InvIssueReport; isDemo: boolean }> {
  try {
    return { report: await getInvIssueReport(days), isDemo: false };
  } catch {
    return {
      report: { days, series: [], totalWastagePaisa: 0, totalGiftPaisa: 0 },
      isDemo: true,
    };
  }
}
export async function loadInvValuationSafe(): Promise<{ valuation: InvValuation; isDemo: boolean }> {
  try {
    return { valuation: await getInvValuation(), isDemo: false };
  } catch {
    return { valuation: { totalPaisa: 0, rows: [] }, isDemo: true };
  }
}
export async function loadInvSettingsSafe(): Promise<{ settings: InvSettings; isDemo: boolean }> {
  try {
    return { settings: await getInvSettings(), isDemo: false };
  } catch {
    return {
      settings: {
        id: "singleton", defaultSaleWarehouseId: "wh-shop", defaultReceiveWarehouseId: "wh-store",
        allowPerOrderWarehouse: false, negativeStockPolicy: "ALLOW_WARN",
      },
      isDemo: true,
    };
  }
}

/* ---- Inventory stocktake (DEC-INV-009) ---- */

export interface InvStocktakeLine {
  id: string;
  itemId: string;
  ledgerQtyMilli: number;
  countedQtyMilli: number;
  diffValuePaisa: number;
  item: { sku: string; name: string; imageUrl?: string | null };
}
export interface InvStocktake {
  id: string;
  stocktakeNo: string;
  warehouseId: string;
  note?: string | null;
  status: "DRAFT" | "APPLIED" | string;
  appliedAt?: string | null;
  actor?: string | null;
  createdAt: string;
  lines: InvStocktakeLine[];
}

export const listInvStocktakes = () => j<InvStocktake[]>(`/inventory/stocktakes`);
export const createInvStocktake = (dto: {
  warehouseId: string; note?: string;
  lines: { itemId: string; countedQtyMilli: number }[];
}) => j<InvStocktake>(`/inventory/stocktakes`, { method: "POST", body: JSON.stringify(dto) });
export const applyInvStocktake = (id: string) =>
  j<InvStocktake>(`/inventory/stocktakes/${id}/apply`, { method: "POST", body: "{}" });

export async function loadInvStocktakesSafe(): Promise<{ rows: InvStocktake[]; isDemo: boolean }> {
  try {
    return { rows: await listInvStocktakes(), isDemo: false };
  } catch {
    return { rows: [], isDemo: true };
  }
}

/** single-item live stock — the Item editor's Stock panel reads this */
export interface InvItemStock {
  mode: "NA" | "NONE" | "STOCK" | "CAN_BUILD";
  perWarehouse: { warehouseId: string; qtyMilli: number }[];
  totalQtyMilli: number;
  canBuild: number | null;
}
export const getInvItemStock = (itemId: string) => j<InvItemStock>(`/inventory/item-stock/${itemId}`);

/* ================================================================ Assembly v2
   RADIAN_ASSEMBLY_MODULE_ARCHITECTURE.md (redesigned 23 Jul 2026,
   DEC-ASM-011…016). Template (standalone, NO stock touch) → Production
   (components → Assembly floor) → Finish (used+wasted) → Transfer (owner
   picks the finished Item; stock lands). */

export interface AsmTemplateLine {
  id: string;
  componentItemId: string;
  qtyMilli: number; // per ONE piece, component's own unit
  sortOrder: number;
  unitCostPaisa?: number;
  componentItem: {
    id: string; sku: string; name: string; imageUrl?: string | null;
    isStockTracked: boolean; itemType: string;
    unit?: { name: string; shortCode: string } | null;
  };
}

export interface AsmTemplate {
  id: string;
  name: string;
  imageUrl?: string | null;
  note?: string | null;
  isActive: boolean;
  lines: AsmTemplateLine[];
  estCostPaisa?: number;
  _count?: { productions: number };
}

export type AsmProductionStatus = "IN_PROGRESS" | "FINISHED" | "TRANSFERRED" | "CANCELLED";

export interface AsmProductionLine {
  id: string;
  componentItemId: string;
  plannedQtyMilli: number;
  pickedQtyMilli: number;
  usedQtyMilli: number;
  wastedQtyMilli: number;
  unitCostPaisa: number;
  usedValuePaisa: number;
  wastedValuePaisa: number;
  componentItem: { sku: string; name: string; imageUrl?: string | null; unit?: { shortCode: string } | null };
}

export interface AsmProduction {
  id: string;
  productionNo: string;
  templateId: string;
  templateName: string;
  qtyMilli: number;
  finishedQtyMilli: number;
  status: AsmProductionStatus;
  assignedTo?: string | null;
  actor?: string | null;
  startedAt: string;
  finishedAt?: string | null;
  durationMin?: number | null;
  sourceWarehouseId: string;
  floorWarehouseId: string;
  totalUsedValuePaisa: number;
  totalWastedValuePaisa: number;
  unitCostPaisa: number;
  issueId?: string | null;
  targetItemId?: string | null;
  transferWarehouseId?: string | null;
  transferredAt?: string | null;
  note?: string | null;
  template?: { id: string; name: string; imageUrl?: string | null } | null;
  targetItem?: { id: string; sku: string; name: string; imageUrl?: string | null; unit?: { shortCode: string } | null } | null;
  lines: AsmProductionLine[];
  /** returned by POST /assembly/productions only — stock shortage warnings */
  shortages?: { name: string; sku: string; needMilli: number; haveMilli: number }[];
}

export interface AsmOverview {
  kpis: {
    runningCount: number;
    awaitingTransferCount: number;
    awaitingTransferValuePaisa: number;
    runsToday: number;
    runsMonth: number;
    producedMonthPaisa: number;
    wastedMonthPaisa: number;
    templateCount: number;
  };
  noEntryToday: boolean;
  running: AsmProduction[];
  finishedAwaiting: AsmProduction[];
  byActor: { who: string; runs: number; piecesMilli: number; costPaisa: number; avgMinutes: number | null }[];
  topTemplates: { templateId: string; name: string; runs: number; piecesMilli: number; costPaisa: number }[];
}

export interface AsmWastageReport {
  days: number;
  totalWastedPaisa: number;
  byComponent: {
    componentItemId: string; sku: string; name: string; imageUrl?: string | null;
    unitShort: string; qtyMilli: number; valuePaisa: number;
  }[];
  docs: AsmProduction[];
}

export const ASM_STATUS_META: Record<AsmProductionStatus, { label: string; colour: string; bg: string }> = {
  IN_PROGRESS: { label: "In progress", colour: "#2563a8", bg: "#e8f0fa" },
  FINISHED:    { label: "Finished — transfer it", colour: "#b45309", bg: "#fff4e6" },
  TRANSFERRED: { label: "Transferred", colour: "#0e7a3d", bg: "#e8f7ef" },
  CANCELLED:   { label: "Cancelled", colour: "#8d7a97", bg: "#efe9f4" },
};

export const listAsmTemplates = () => j<AsmTemplate[]>(`/assembly/templates`);
export const createAsmTemplate = (dto: {
  name: string; imageUrl?: string | null; note?: string | null;
  lines: { componentItemId: string; qtyMilli: number }[];
}) => j<AsmTemplate>(`/assembly/templates`, { method: "POST", body: JSON.stringify(dto) });
export const updateAsmTemplate = (id: string, dto: {
  name?: string; imageUrl?: string | null; note?: string | null; isActive?: boolean;
  lines?: { componentItemId: string; qtyMilli: number }[];
}) => j<AsmTemplate>(`/assembly/templates/${id}`, { method: "PATCH", body: JSON.stringify(dto) });
export const deleteAsmTemplate = (id: string) =>
  j<{ id: string; deleted: boolean }>(`/assembly/templates/${id}`, { method: "DELETE" });

export const listAsmProductions = (status?: string) =>
  j<AsmProduction[]>(`/assembly/productions${status ? `?status=${status}` : ""}`);
export const startAsmProduction = (dto: {
  templateId: string; qtyMilli: number; assignedTo?: string; sourceWarehouseId?: string;
  /** DEC-ASM-014 — actual start time (ISO); default now */
  startedAt?: string; note?: string;
  quick?: {
    finishedQtyMilli: number; finishedAt?: string; durationMin?: number;
    lines?: { componentItemId: string; usedQtyMilli: number; wastedQtyMilli: number }[];
  };
  actorName?: string;
}) => j<AsmProduction>(`/assembly/productions`, { method: "POST", body: JSON.stringify(dto) });
export const finishAsmProduction = (id: string, dto: {
  finishedQtyMilli: number; finishedAt?: string; durationMin?: number;
  lines?: { componentItemId: string; usedQtyMilli: number; wastedQtyMilli: number }[];
  note?: string;
}) => j<AsmProduction>(`/assembly/productions/${id}/finish`, { method: "POST", body: JSON.stringify(dto) });
export const transferAsmProduction = (id: string, dto: { targetItemId: string; warehouseId?: string }) =>
  j<AsmProduction>(`/assembly/productions/${id}/transfer`, { method: "POST", body: JSON.stringify(dto) });
export const cancelAsmProduction = (id: string) =>
  j<AsmProduction>(`/assembly/productions/${id}/cancel`, { method: "POST", body: "{}" });

export const getAsmOverview = () => j<AsmOverview>(`/assembly/overview`);
export const getAsmWastage = (days = 30) => j<AsmWastageReport>(`/assembly/wastage?days=${days}`);

export async function loadAsmTemplatesSafe(): Promise<{ rows: AsmTemplate[]; isDemo: boolean }> {
  try {
    return { rows: await listAsmTemplates(), isDemo: false };
  } catch {
    return { rows: [], isDemo: true };
  }
}
export async function loadAsmProductionsSafe(status?: string): Promise<{ rows: AsmProduction[]; isDemo: boolean }> {
  try {
    return { rows: await listAsmProductions(status), isDemo: false };
  } catch {
    return { rows: [], isDemo: true };
  }
}
export async function loadAsmOverviewSafe(): Promise<{ overview: AsmOverview; isDemo: boolean }> {
  try {
    return { overview: await getAsmOverview(), isDemo: false };
  } catch {
    return {
      overview: {
        kpis: {
          runningCount: 0, awaitingTransferCount: 0, awaitingTransferValuePaisa: 0,
          runsToday: 0, runsMonth: 0, producedMonthPaisa: 0, wastedMonthPaisa: 0, templateCount: 0,
        },
        noEntryToday: false, running: [], finishedAwaiting: [], byActor: [], topTemplates: [],
      },
      isDemo: true,
    };
  }
}
export async function loadAsmWastageSafe(days = 30): Promise<{ report: AsmWastageReport; isDemo: boolean }> {
  try {
    return { report: await getAsmWastage(days), isDemo: false };
  } catch {
    return {
      report: { days, totalWastedPaisa: 0, byComponent: [], docs: [] },
      isDemo: true,
    };
  }
}

/* ============================================================================
   SUPPLIER MODULE — RADIAN_SUPPLIER_MODULE_ARCHITECTURE.md (locked 23 Jul 2026)
   DEC-SUP-001..008 · master of every party Radian pays.
   ========================================================================= */

export type SupplierStatus = "ACTIVE" | "INACTIVE";
export type NotifyChannel = "WHATSAPP" | "SMS" | "OFF";
export type NotifyMode = "MANUAL" | "AUTO";

export interface ApiSupplierType {
  id: string;
  name: string;
  sortOrder: number;
  isSystem: boolean;
  /** DEC-SUP-009 — behaviour flag: true → the Vendors workspace */
  isFulfillment: boolean;
  _count?: { suppliers: number };
}

export interface ApiSupplier {
  id: string;
  supplierNo: string;
  name: string;
  nickname: string | null;
  typeId: string;
  type?: ApiSupplierType | null;
  phone: string | null;
  contactPerson: string | null;
  market: string | null;
  address: string | null;
  photoUrl: string | null;
  paymentTerms: string | null;
  payoutInfo: string | null;
  notifyPhone: string | null;
  notifyChannel: NotifyChannel;
  notifyMode: NotifyMode;
  leadTimeHours: number | null;
  notes: string | null;
  /** DEC-SUP-010 — true: shows in BOTH the Suppliers and Vendors workspaces */
  dualRole?: boolean;
  status: SupplierStatus;
  openingDuePaisa: number;
  openingAsOf: string | null;
  openingNote: string | null;
  createdAt: string;
  _count?: { items: number };
  // derived balances (DEC-SUP-008)
  duePaisa: number;
  creditPaisa: number;
  netDuePaisa: number;
  totalBoughtPaisa: number;
  purchaseCount: number;
  lastPurchaseAt: string | null;
}

export interface ApiSupplierDetail extends ApiSupplier {
  /** DEC-SUP-009 (A) — vendor price = standardCostPaisa; products bring the selling side */
  items: {
    id: string; sku: string; name: string; imageUrl: string | null;
    isStockTracked: boolean; isActive: boolean; standardCostPaisa: number;
    products: { id: string; name: string; sellingPricePaisa: number; isPublished: boolean }[];
  }[];
  /** DEC-SUP-011 — what we actually buy from him, read off the purchase history */
  bought: {
    itemId: string; sku: string; name: string; imageUrl: string | null; unitName: string | null;
    timesBought: number; qtyMilli: number; lastPricePaisa: number; avgPricePaisa: number;
    lastAt: string | null; lastPurchaseNo: string | null;
  }[];
  credits: { id: string; amountPaisa: number; note: string | null; appliedPurchaseId: string | null; appliedAt: string | null; createdAt: string }[];
  adjustments: { id: string; amountPaisa: number; note: string; adjustedAt: string }[];
  openingRemaining: number;
  openingPaid: number;
  adjustmentPaisa: number;
  purchaseDues: { id: string; purchaseNo: string; purchaseDate: string; grandTotalPaisa: number; paidPaisa: number; dueCutPaisa: number; duePaisa: number }[];
}

export interface SupplierLedger {
  events: {
    at: string;
    kind: "OPENING" | "PURCHASE" | "PAYMENT" | "BILL_PAYMENT" | "RETURN" | "ADJUSTMENT";
    label: string;
    ref?: string;
    refId?: string;
    amountPaisa: number; // signed: + raises due, − lowers it
    detail?: { note?: string | null; allocations?: { purchaseId: string | null; amountPaisa: number }[]; dueCutPaisa?: number; creditPaisa?: number };
  }[];
  months: { month: string; bought: number; paid: number; returned: number }[];
  duePaisa: number;
  creditPaisa: number;
  netDuePaisa: number;
}

export interface SupplierStats {
  supplierCount: number;
  totalDuePaisa: number;
  totalCreditPaisa: number;
  dueCount: number;
  board: { id: string; name: string; nickname: string | null; typeName: string; isFulfillment: boolean; dualRole?: boolean; status: SupplierStatus; duePaisa: number; creditPaisa: number }[];
  unlinkedNameCount: number;
}

export interface SupplierSaveBody {
  name?: string;
  typeId?: string;
  nickname?: string;
  phone?: string;
  confirmDuplicatePhone?: boolean;
  contactPerson?: string;
  market?: string;
  address?: string;
  photoUrl?: string;
  paymentTerms?: string;
  payoutInfo?: string;
  notifyPhone?: string;
  notifyChannel?: NotifyChannel;
  notifyMode?: NotifyMode;
  leadTimeHours?: number;
  notes?: string;
  /** DEC-SUP-010 — one tick, both workspaces */
  dualRole?: boolean;
  status?: SupplierStatus;
  openingDuePaisa?: number;
  openingAsOf?: string;
  openingNote?: string;
}

/* ─────────────────── delivery: the NAMES · DEC-DLV-008 ───────────────────
   Owner, 1 Aug 2026: "whatever is edited or changed in the delivery module
   must work automatically across the whole system — frontend, product upload
   page, everywhere it is needed."

   ⚠️ The product upload page shows THIS list and nothing else. It used to
   carry two written-out lists named `DHAKA_SPEEDS` / `NATION_SPEEDS` — a new
   delivery type made in the module would never appear on a product, because
   the code knew only those three names. */
export type DeliveryTiming =
  | "FROM_CONFIRM"
  | "TODAY_SLOT"
  | "PICK_DATE_SLOT"
  | "PICK_DATE_FIXED"
  | "LEAD_DAYS";

export interface ApiDeliveryType {
  id: string;
  name: string;
  zone: "DHAKA" | "BANGLADESH";
  kind: "RIDER" | "COURIER";
  sortOrder: number;
  isActive: boolean;
  /** DEC-DLV-010 — which shape this delivery follows */
  timing?: DeliveryTiming;
  /** for FROM_CONFIRM: the promise in minutes (2 hours = 120) */
  promiseMinutes?: number | null;
  /** which part of the day it can be taken — minutes, 10am = 600 */
  openFromMin?: number | null;
  openToMin?: number | null;
  /**
   * how many zones carry a price for it. **0 means it cannot be bought** —
   * a name with no price, so checkout never shows it (DEC-DLV-009).
   */
  rateCount?: number;
}

/**
 * What the screen says, and which fields it must show.
 *
 * ⚠️ This list is the only place the shapes are described. A new shape goes
 * here AND in the enum — two places, one commit.
 */
export const TIMING_META: Record<
  DeliveryTiming,
  { label: string; hint: string; needsMinutes: boolean; needsWindow: boolean; needsSlots: boolean; picksDate: boolean }
> = {
  FROM_CONFIRM: {
    label: "Within X hours — from order confirm",
    hint: "The clock starts when the order is confirmed. No date, no time slot.",
    needsMinutes: true, needsWindow: true, needsSlots: false, picksDate: false,
  },
  TODAY_SLOT: {
    label: "Today — customer picks a time slot",
    hint: "Today only. The customer chooses one of your slots.",
    needsMinutes: false, needsWindow: false, needsSlots: true, picksDate: false,
  },
  PICK_DATE_SLOT: {
    label: "Any date + time slot",
    hint: "Schedule It. The customer picks both the day and the slot.",
    needsMinutes: false, needsWindow: false, needsSlots: true, picksDate: true,
  },
  PICK_DATE_FIXED: {
    /*  ⚠️ It used to say "No time slots", and that was wrong — the owner
        caught it: "for midnight surprise you say no slot is needed — then how
        do I set what hours MY midnight runs?" Fair question. The window must
        be written somewhere, and the slot fields (time + cut-off + capacity)
        ask exactly that. So ONE slot here — the shop writes it, the customer
        never picks, because there is no second choice to pick.  */
    label: "Customer picks the date, you set the time",
    hint: "Like Midnight Surprise. Add ONE time slot — that is your delivery window (e.g. 12:00 AM – 12:30 AM) and its cut-off (order by 6 PM for tonight). The customer never chooses it.",
    needsMinutes: false, needsWindow: false, needsSlots: true, picksDate: true,
  },
  LEAD_DAYS: {
    label: "In a few days — just a promise",
    hint: "Nationwide courier. No date, no slot — the page reads \"1–3 days\".",
    needsMinutes: false, needsWindow: false, needsSlots: false, picksDate: false,
  },
};

export const listDeliveryTypes = () => j<ApiDeliveryType[]>(`/delivery/types`);

export const listSuppliers = (q?: { search?: string; typeId?: string; status?: string; due?: boolean; sort?: string; dir?: string }) => {
  const p = new URLSearchParams();
  if (q?.search) p.set("search", q.search);
  if (q?.typeId) p.set("typeId", q.typeId);
  if (q?.status) p.set("status", q.status);
  if (q?.due) p.set("due", "1");
  if (q?.sort) p.set("sort", q.sort);
  if (q?.dir) p.set("dir", q.dir);
  const qs = p.toString();
  return j<ApiSupplier[]>(`/suppliers${qs ? `?${qs}` : ""}`);
};
export const getSupplierStats = () => j<SupplierStats>(`/suppliers/stats`);
export const getSupplier = (id: string) => j<ApiSupplierDetail>(`/suppliers/${id}`);
export const getSupplierLedger = (id: string) => j<SupplierLedger>(`/suppliers/${id}/ledger`);
export const getSupplierTimeline = (id: string) => j<ActivityEvent[]>(`/suppliers/${id}/timeline`);
export const createSupplier = (b: SupplierSaveBody) =>
  j<ApiSupplierDetail>(`/suppliers`, { method: "POST", body: JSON.stringify(b) });
export const updateSupplier = (id: string, b: SupplierSaveBody) =>
  j<ApiSupplierDetail>(`/suppliers/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const removeSupplier = (id: string) => j<{ ok: boolean }>(`/suppliers/${id}`, { method: "DELETE" });

export const supplierPayPreview = (id: string, amountPaisa: number) =>
  j<{ split: { purchaseId: string | null; purchaseNo: string | null; duePaisa: number; amountPaisa: number }[]; excessToCreditPaisa: number; duePaisa: number }>(
    `/suppliers/${id}/pay-preview?amountPaisa=${amountPaisa}`);
export const paySupplier = (id: string, b: {
  amountPaisa: number; method: string; paidAt?: string; note?: string;
  allocations?: { purchaseId: string | null; amountPaisa: number }[];
}) => j<{ paymentNo: string; excessToCreditPaisa: number }>(`/suppliers/${id}/payments`, { method: "POST", body: JSON.stringify(b) });
export const adjustSupplier = (id: string, b: { amountPaisa: number; note: string }) =>
  j<ApiSupplierDetail>(`/suppliers/${id}/adjustments`, { method: "POST", body: JSON.stringify(b) });
/** SUP-R11 — consume a credit against the current due */
export const applySupplierCredit = (id: string, creditId: string) =>
  j<ApiSupplierDetail>(`/suppliers/${id}/credits/${creditId}/apply`, { method: "POST", body: "{}" });

export const listSupplierTypes = () => j<ApiSupplierType[]>(`/suppliers/types`);
export const createSupplierType = (b: { name: string; sortOrder?: number; isFulfillment?: boolean }) =>
  j<ApiSupplierType>(`/suppliers/types`, { method: "POST", body: JSON.stringify(b) });
export const updateSupplierType = (id: string, b: { name?: string; sortOrder?: number; isFulfillment?: boolean }) =>
  j<ApiSupplierType>(`/suppliers/types/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const removeSupplierType = (id: string) =>
  j<{ ok: boolean }>(`/suppliers/types/${id}`, { method: "DELETE" });

export const supplierUnlinkedNames = () =>
  j<{ name: string; purchaseCount: number; totalPaisa: number }[]>(`/suppliers/unlinked-names`);
export const supplierLinkNames = (id: string, names: string[]) =>
  j<{ purchasesLinked: number; creditsLinked: number }>(`/suppliers/${id}/link-names`, { method: "POST", body: JSON.stringify({ names }) });

/* ================= POS (RADIAN_POS_MODULE_ARCHITECTURE.md) ================= */
export interface ApiPosSettings {
  id: string;
  openingFloatDefaultPaisa: number;
  defaultTaxRateBps: number;
  giftReceiptHidePrice: boolean;
  defaultCreditLimitPaisa: number;
  receiptHeader: string | null;
  receiptFooter: string | null;
  /** DEC-POS-021 — the methods this shop takes; empty means all of them */
  enabledMethods?: string[];
}
export interface ApiPosRegister { id: string; code: string; name: string; branchId: string | null; isActive: boolean; }
export interface ApiPosShift {
  id: string; shiftNo: string; registerId: string | null; cashierName: string;
  status: "OPEN" | "CLOSED"; openingFloatPaisa: number; openedAt: string; closedAt: string | null;
  expectedCashPaisa: number | null; countedCashPaisa: number | null; overShortPaisa: number | null;
  cashMovements?: { id: string; kind: string; amountPaisa: number; note: string | null }[];
}
export interface ApiPosSale {
  id: string; orderNo: string; placedAt: string; senderName: string; senderPhone: string;
  totalPaisa: number; duePaisa: number; paidPaisa: number; isGift: boolean;
  customer?: { id: string; name: string; phone: string } | null;
  transactions?: { method: string; amountPaisa: number }[];
  _count?: { lines: number };
}
export interface ApiPosDue {
  customerId: string; name: string; phone: string; duePaisa: number; oldest: string;
  orders: { id: string; orderNo: string; duePaisa: number; placedAt: string }[];
}
export interface ApiPosDiscountRule { id: string; categoryId: string | null; productId: string | null; maxPercent: number; requiresApproval: boolean; }
export interface ApiPosAnalytics { salesPaisa: number; count: number; avgPaisa: number; duePaisa: number; cashInDrawer: number; shiftOpen: boolean; }

export interface PosSaleInput {
  shiftId?: string; registerId?: string; branchId?: string;
  customerId?: string; customerName?: string; customerPhone?: string;
  isGift?: boolean;
  /** DEC-POS-019 — which channel brought the sale in; empty = the counter itself */
  channelId?: string;
  /** DEC-POS-020 — the bill's own date (ISO); today when empty, never the future */
  saleDate?: string;
  /** DEC-POS-020 — who sold it; whoever is signed in when empty */
  salespersonName?: string;
  /** DEC-POS-020 — the shop's own words about this sale */
  note?: string;
  /** DEC-POS-022 — ordered today, taken later; stock waits for the hand-over */
  advance?: { promisedFor: string };
  /** DEC-POS-018 — the counter sells items; productId is only the legacy path */
  lines: { itemId?: string; productId?: string; qty: number; unitPaisa?: number }[];
  discountPaisa?: number; discountApprovedBy?: string;
  adjustmentPaisa?: number; adjustmentNote?: string; taxRateBps?: number;
  payMode: "full" | "partial";
  payments: { method: "cash" | "bkash" | "nagad" | "card"; amountPaisa: number; accountId?: string }[];
  /** DEC-RTN-015 — part of the bill settled with the customer's store credit */
  storeCreditPaisa?: number;
  actorName?: string;
}

/** DEC-RTN-015 — what this customer could put on a bill of this size, right now */
export interface ApiCreditQuote {
  customerId: string;
  balancePaisa: number;
  capBps: number;
  capPaisa: number;
  usablePaisa: number;
}
export const creditQuote = (customerId: string, totalPaisa: number) =>
  j<ApiCreditQuote>(`/returns/credit/${customerId}/quote?totalPaisa=${Math.max(0, Math.round(totalPaisa))}`);

/** DEC-POS-018 — what the till may sell: items, never products */
export interface ApiPosCatalogueRow {
  id: string;
  sku: string;
  name: string;
  imageUrl: string | null;
  itemType: ItemType;
  unitName: string | null;
  /** the conversion, spelled out — "1 Stick = 4 Pice"; null for a base unit */
  unitBase: string | null;
  /** DEC-POS-024 — the pair the line's unit dropdown offers */
  unitId: string | null;
  baseUnitId: string | null;
  baseUnitName: string | null;
  baseQty: number | null;
  categoryId: string | null;
  categoryName: string | null;
  pricePaisa: number | null;
  priceIsFixed: boolean;
  /** DEC-ADM-012 — absent when this person may not see cost */
  costPaisa?: number;
  floorPricePaisa: number | null;
  /** null = not counted (a service); otherwise what the shop holds right now */
  stockQty: number | null;
}
export const posCatalogue = (search?: string) =>
  j<ApiPosCatalogueRow[]>(`/pos/catalogue${search?.trim() ? `?search=${encodeURIComponent(search.trim())}` : ""}`);

export const posSettings = () => j<ApiPosSettings>(`/pos/settings`);
export const updatePosSettings = (patch: Partial<ApiPosSettings>) =>
  j<ApiPosSettings>(`/pos/settings`, { method: "PATCH", body: JSON.stringify(patch) });
export const posRegisters = () => j<ApiPosRegister[]>(`/pos/registers`);
export const posCurrentShift = (registerId?: string) =>
  j<ApiPosShift | null>(`/pos/shifts/current${registerId ? `?registerId=${registerId}` : ""}`);
export const posOpenShift = (b: { registerId?: string; cashierName: string; openingFloatPaisa?: number }) =>
  j<ApiPosShift>(`/pos/shifts/open`, { method: "POST", body: JSON.stringify(b) });
/** P7-1 — what this shift took, from the shift's own bills */
export interface ApiPosShiftSummary {
  shiftId: string;
  shiftNo: string;
  cashierName: string;
  registerName: string | null;
  openedAt: string;
  openingFloatPaisa: number;
  expectedCashPaisa: number;
  salesPaisa: number;
  count: number;
  avgPaisa: number;
  duePaisa: number;
  sales: {
    id: string;
    orderNo: string;
    placedAt: string;
    customerName: string;
    totalPaisa: number;
    duePaisa: number;
    paymentStatus: string;
    salesStatus: string;
  }[];
}
export const posShiftSummary = (id: string) => j<ApiPosShiftSummary>(`/pos/shifts/${id}/summary`);
/** P7-2 — cash out of the till, always under a heading (Finance writes the expense) */
export const posTakeCashOut = (
  shiftId: string,
  b: {
    kind: "EXPENSE" | "DROP";
    amountPaisa: number;
    fromAccountId?: string;
    accountId?: string;
    toAccountId?: string;
    payeeName?: string;
    note?: string;
  },
) => j<{ document: string; expectedCashPaisa: number }>(`/pos/shifts/${shiftId}/cash-out`, { method: "POST", body: JSON.stringify(b) });
export const posCloseShift = (id: string, b: { countedCashPaisa: number; note?: string }) =>
  j<ApiPosShift>(`/pos/shifts/${id}/close`, { method: "POST", body: JSON.stringify(b) });
export const posCreateSale = (b: PosSaleInput) =>
  j<ApiPosSale>(`/pos/sales`, { method: "POST", body: JSON.stringify(b) });
export const posListSales = (p?: { search?: string; days?: number }) => {
  const q = new URLSearchParams();
  if (p?.search) q.set("search", p.search);
  if (p?.days) q.set("days", String(p.days));
  return j<ApiPosSale[]>(`/pos/sales${q.toString() ? `?${q}` : ""}`);
};
export const posDue = () => j<ApiPosDue[]>(`/pos/due`);
/** DEC-POS-027 — what the customer already owes the counter, and the shop's ceiling (0 = none) */
export interface ApiPosCredit {
  customerId: string;
  limitPaisa: number;
  outstandingPaisa: number;
  billsOpen: number;
  over: boolean;
}
export const posCreditStanding = (customerId: string) => j<ApiPosCredit>(`/pos/credit/${customerId}`);

/** DEC-POS-022 — counter orders promised for a later day, soonest first */
export interface ApiPosAdvance {
  id: string; orderNo: string; placedAt: string; promisedBy: string | null;
  customerName: string; customerPhone: string;
  totalPaisa: number; paidPaisa: number; duePaisa: number;
  lines: { id: string; name: string; qty: number; unitPaisa: number }[];
}
export const posAdvanceOrders = () => j<ApiPosAdvance[]>(`/pos/advance`);
export const posHandOverAdvance = (id: string, b: { payments?: { method: string; amountPaisa: number; accountId?: string }[] }) =>
  j<unknown>(`/pos/advance/${id}/handover`, { method: "POST", body: JSON.stringify(b) });
export const posCollectDue = (b: { orderId: string; payments: { method: string; amountPaisa: number; accountId?: string }[] }) =>
  j<ApiPosSale>(`/pos/due/collect`, { method: "POST", body: JSON.stringify(b) });
export const posDiscountRules = () => j<ApiPosDiscountRule[]>(`/pos/discount-rules`);
export const posAnalyticsToday = () => j<ApiPosAnalytics>(`/pos/analytics/today`);

/* ============================================================
   Returns & Refunds — real API (:4000/returns). DEC-RTN-005..015.
   Post-delivery grievance → resolution. Refund payout ≤ collected;
   restock via Inventory (SALE_RETURN); Order.salesStatus untouched.
   ============================================================ */
export type ReturnStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "completed"
  | "rejected"
  | "cancelled";
export type ReturnResolution = "REFUND" | "REPLACEMENT" | "PARTIAL_COMPENSATION" | "STORE_CREDIT";
export type ReturnRestockAction = "RESTOCK" | "WRITE_OFF";
export type ReturnRefundMethod =
  | "CASH"
  | "BKASH"
  | "NAGAD"
  | "CARD"
  | "BANK"
  | "ORIGINAL"
  /*  DEC-FIN-031 — money pushed back down the wire it came up, through
      SSLCommerz. Offered only when the order was really paid online and the
      gateway reference was recorded; the shop chooses per refund.  */
  | "GATEWAY"
  | "STORE_CREDIT";

export interface ApiReturnLine {
  id: string;
  orderLineId: string;
  productId: string;
  name: string;
  qty: number;
  unitPaisa: number;
  valuePaisa: number;
  restockAction: ReturnRestockAction;
}
export interface ApiReturnReason {
  id: string;
  code: string;
  label: string;
  requiresApproval: boolean;
  defaultRefundMethod: ReturnRefundMethod;
  isActive: boolean;
  sortOrder: number;
}
export interface ApiReturn {
  id: string;
  returnNo: string;
  orderId: string;
  customerId: string;
  reasonId?: string | null;
  reasonNote?: string | null;
  resolution: ReturnResolution;
  status: ReturnStatus;
  approvedBy?: string | null;
  approvedAt?: string | null;
  returnValuePaisa: number;
  refundPaisa: number;
  storeCreditPaisa: number;
  compensationPaisa: number;
  refundMethod: ReturnRefundMethod;
  refundReference?: string | null;
  actorName: string;
  note?: string | null;
  createdAt: string;
  order?: {
    id: string;
    orderNo: string;
    deliveryStatus: string;
    salesStatus: string;
    paidPaisa: number;
    refundPaisa: number;
    totalPaisa: number;
    paymentMethod: string;
  } | null;
  customer?: { id: string; name: string; phone?: string } | null;
  reason?: ApiReturnReason | null;
  lines?: ApiReturnLine[];
  /** DEC-RTN-018 — the credit the shop decided to give */
  creditAskPaisa?: number | null;
  /** DEC-RTN-017 — what went back OUT to the customer */
  replacements?: {
    id: string;
    itemId: string | null;
    productId: string | null;
    name: string;
    qty: number;
    unitPaisa: number;
  }[];
}
export interface EligibleLine {
  orderLineId: string;
  productId: string;
  /** DEC-POS-018 — a counter line carries the Item itself */
  itemId?: string | null;
  name: string;
  productType: "READYMADE" | "CRAFTED";
  qty: number;
  returnedQty: number;
  returnableQty: number;
  unitPaisa: number;
  bg?: string | null;
}
export interface EligibleOrder {
  order: {
    id: string;
    orderNo: string;
    deliveryStatus: string;
    salesStatus: string;
    paymentMethod: string;
    paidPaisa: number;
    refundPaisa: number;
    totalPaisa: number;
  };
  customer?: { id: string; name: string; phone?: string } | null;
  delivered: boolean;
  refundableCap: number;
  lines: EligibleLine[];
}
export interface ReturnSettings {
  returnWindowDays: number;
  approvalThresholdPaisa: number;
  restockDefaultPerishable: boolean;
}
export interface ReturnAnalytics {
  count: number;
  pending: number;
  completed: number;
  returnValuePaisa: number;
  refundPaisa: number;
  storeCreditPaisa: number;
  compensationPaisa: number;
}

/** DEC-RTN-016 — `channel` narrows the SAME book to the door it came in
 *  through: "online" = website orders, "counter" = POS sales, undefined =
 *  everything. Nothing is duplicated; the totals screen never passes it. */
export const listReturns = (params?: { search?: string; status?: string; channel?: "online" | "counter" }) => {
  const q = new URLSearchParams({ pageSize: "100" });
  if (params?.search) q.set("search", params.search);
  if (params?.status) q.set("status", params.status);
  if (params?.channel) q.set("channel", params.channel);
  return j<Paged<ApiReturn>>(`/returns?${q.toString()}`);
};
export const getReturn = (id: string) => j<ApiReturn>(`/returns/${id}`);
export const getReturnTimeline = (id: string) =>
  j<{ id: string; kind: string; label: string; note?: string | null; actorName: string; createdAt: string }[]>(
    `/returns/${id}/timeline`,
  );
export const returnAnalytics = (days = 30) => j<ReturnAnalytics>(`/returns/analytics?days=${days}`);
export const eligibleOrderForReturn = (orderId: string) => j<EligibleOrder>(`/returns/eligible/${orderId}`);
export const createReturn = (b: Record<string, unknown>) =>
  j<ApiReturn>(`/returns`, { method: "POST", body: JSON.stringify(b) });
export const approveReturn = (id: string) => j<ApiReturn>(`/returns/${id}/approve`, { method: "POST" });
export const rejectReturn = (id: string, note?: string) =>
  j<ApiReturn>(`/returns/${id}/reject`, { method: "POST", body: JSON.stringify({ note }) });
export const cancelReturn = (id: string) => j<ApiReturn>(`/returns/${id}/cancel`, { method: "POST" });
export const repostReturnRestock = (id: string) =>
  j<{ posted: number; skipped: string[]; already: number }>(`/returns/${id}/repost-restock`, { method: "POST" });
export const completeReturn = (id: string, b: Record<string, unknown>) =>
  j<ApiReturn>(`/returns/${id}/complete`, { method: "POST", body: JSON.stringify(b) });
export const deleteReturn = (id: string) => j(`/returns/${id}`, { method: "DELETE" });
export const getReturnReasons = () => j<ApiReturnReason[]>(`/returns/reasons`);
export const createReturnReason = (b: Record<string, unknown>) =>
  j<ApiReturnReason>(`/returns/reasons`, { method: "POST", body: JSON.stringify(b) });
export const updateReturnReason = (id: string, b: Record<string, unknown>) =>
  j<ApiReturnReason>(`/returns/reasons/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteReturnReason = (id: string) => j(`/returns/reasons/${id}`, { method: "DELETE" });
export const getReturnSettings = () => j<ReturnSettings>(`/returns/settings`);
export const updateReturnSettings = (b: Record<string, unknown>) =>
  j<ReturnSettings>(`/returns/settings`, { method: "PATCH", body: JSON.stringify(b) });
export const getCustomerCredit = (customerId: string) =>
  j<{ customerId: string; balancePaisa: number; ledger: { id: string; kind: string; amountPaisa: number; note?: string | null; createdAt: string }[] }>(
    `/returns/credit/${customerId}`,
  );

export const RETURN_STATUS_META: Record<ReturnStatus, { label: string; tone: string }> = {
  draft: { label: "Draft", tone: "#8a8a8a" },
  pending_approval: { label: "Needs approval", tone: "#c77700" },
  approved: { label: "Approved", tone: "#2563eb" },
  completed: { label: "Completed", tone: "#15803d" },
  rejected: { label: "Rejected", tone: "#b91c1c" },
  cancelled: { label: "Cancelled", tone: "#8a8a8a" },
};
export const RESOLUTION_LABEL: Record<ReturnResolution, string> = {
  REFUND: "Refund",
  REPLACEMENT: "Replacement",
  PARTIAL_COMPENSATION: "Partial compensation",
  STORE_CREDIT: "Store credit",
};

/* ============================================================
   PRICING & OFFERS — RADIAN_OFFERS_MODULE_ARCHITECTURE.md
   (DEC-OFR-001..009). Core-6 shapes live; deferred shapes stay mock.
   ============================================================ */

export type ApiOfferShape =
  | "SITEWIDE" | "CATEGORY" | "PRODUCT" | "FIRST_ORDER" | "PAYMENT" | "FREE_DELIVERY";
export type ApiOfferMechanism = "AUTOMATIC" | "COUPON";
export type ApiOfferStatus = "draft" | "pending_approval" | "approved" | "paused" | "archived";
export type ApiOfferLiveState =
  | "draft" | "pending_approval" | "scheduled" | "active" | "expired" | "paused" | "archived";
export type ApiOfferDiscountType = "PERCENT" | "FLAT" | "FREE_DELIVERY";

export interface ApiOffer {
  id: string;
  offerNo: string;
  name: string;
  internalNote?: string | null;
  publicTitle?: string | null;
  benefitLine?: string | null;
  description?: string | null;
  mechanism: ApiOfferMechanism;
  shape: ApiOfferShape;
  status: ApiOfferStatus;
  liveState: ApiOfferLiveState;
  code?: string | null;
  discountType: ApiOfferDiscountType;
  discountValue: number; // PERCENT=bp · FLAT=paisa
  maxDiscountPaisa?: number | null;
  minSpendPaisa?: number | null;
  perCustomerLimit?: number | null;
  totalLimit?: number | null;
  categoryId?: string | null;
  category?: { id: string; name: string; slug: string } | null;
  products?: { id: string; name: string; slug: string }[];
  paymentMethod?: string | null;
  combinable: boolean;
  priority: number;
  scarcity: boolean;
  bonusLines: string[];
  guaranteeText?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  belowCostFlag: boolean;
  approvedBy?: string | null;
  approvedAt?: string | null;
  redeemedCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ApiOfferAnalytics {
  days: number;
  totals: { redemptions: number; revenuePaisa: number; discountPaisa: number; newCustomers: number };
  liveCount: number;
  leaderboard: {
    offerId: string; name: string; shape: string; mechanism: string; code: string | null;
    redemptions: number; revenuePaisa: number; discountPaisa: number; newCustomers: number;
  }[];
}

export interface ApiQuoteResult {
  subtotalPaisa: number;
  discountPaisa: number;
  deliveryWaivedPaisa: number;
  applied: {
    offerId: string; offerNo: string; name: string; mechanism: ApiOfferMechanism;
    shape: ApiOfferShape; code?: string | null; discountPaisa: number; freeDelivery: boolean;
  }[];
  couponError?: string;
  skipped: { name: string; reason: string }[];
}

export function listOffers(params?: { search?: string; status?: string; mechanism?: string }): Promise<Paged<ApiOffer>> {
  const q = new URLSearchParams({ pageSize: "100" });
  if (params?.search) q.set("search", params.search);
  if (params?.status) q.set("status", params.status);
  if (params?.mechanism) q.set("mechanism", params.mechanism);
  return j<Paged<ApiOffer>>(`/offers?${q.toString()}`);
}
/** demo fallback wrapper — API down/empty ⇒ null (screen shows mock + Demo badge) */
export async function listOffersSafe(): Promise<ApiOffer[] | null> {
  try {
    const r = await listOffers();
    return r.items;
  } catch {
    return null;
  }
}
export const getOffer = (id: string) => j<ApiOffer>(`/offers/${id}`);
export const createOffer = (b: Record<string, unknown>) =>
  j<ApiOffer>(`/offers`, { method: "POST", body: JSON.stringify(b) });
export const updateOffer = (id: string, b: Record<string, unknown>) =>
  j<ApiOffer>(`/offers/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const offerAction = (id: string, action: "approve" | "decline" | "pause" | "resume" | "archive", b: Record<string, unknown> = {}) =>
  j<ApiOffer>(`/offers/${id}/${action}`, { method: "POST", body: JSON.stringify(b) });
export const deleteOffer = (id: string) => j(`/offers/${id}`, { method: "DELETE" });
export const offersAnalytics = (days = 30) => j<ApiOfferAnalytics>(`/offers/analytics?days=${days}`);

/** DEC-OFR — one offer's own redemptions, newest first (max 200 from the API) */
export interface ApiOfferRedemption {
  id: string;
  discountPaisa: number;
  createdAt: string;
  order?: { id: string; orderNo: string; totalPaisa: number; salesStatus: string; placedAt: string | null } | null;
  customer?: { id: string; name: string | null; phone: string | null } | null;
}
export const offerRedemptions = (id: string) => j<ApiOfferRedemption[]>(`/offers/${id}/redemptions`);
export const offerTimeline = (id: string) =>
  j<{ id: string; kind: string; label: string; actorName: string | null; createdAt: string }[]>(`/offers/${id}/timeline`);
export const offersApprovals = () => j<ApiOffer[]>(`/offers/approvals`);
export const getOfferRedemptions = (id: string) =>
  j<{ id: string; discountPaisa: number; code?: string | null; freeDelivery: boolean; createdAt: string;
      order: { id: string; orderNo: string; totalPaisa: number; salesStatus: string; placedAt: string };
      customer: { id: string; name: string; phone: string } }[]>(`/offers/${id}/redemptions`);
export const getOfferSettings = () =>
  j<{ approvalThresholdBp: number; defaultCombinable: boolean }>(`/offers/settings`);
export const updateOfferSettings = (b: Record<string, unknown>) =>
  j(`/offers/settings`, { method: "PATCH", body: JSON.stringify(b) });
export const quoteOffers = (b: Record<string, unknown>) =>
  j<ApiQuoteResult>(`/offers/quote`, { method: "POST", body: JSON.stringify(b) });

export const OFFER_LIVESTATE_META: Record<ApiOfferLiveState, { label: string; bg: string; text: string }> = {
  draft: { label: "Draft", bg: "#f0edf4", text: "#6b6b6b" },
  pending_approval: { label: "Needs approval", bg: "#fff4e2", text: "#b45309" },
  scheduled: { label: "Scheduled", bg: "#fff4e2", text: "#b45309" },
  active: { label: "Active", bg: "#e8f6ef", text: "#0f7d55" },
  expired: { label: "Expired", bg: "#f0edf4", text: "#6b6b6b" },
  paused: { label: "Paused", bg: "#fdecec", text: "#b91c1c" },
  archived: { label: "Archived", bg: "#f0edf4", text: "#6b6b6b" },
};

/* ============================================================
   DELIVERY MANAGEMENT — RADIAN_DELIVERY_MODULE_ARCHITECTURE.md
   (DEC-DLV-001..006). Board · riders · couriers · methods · assignments.
   ============================================================ */

export interface ApiDeliverySlot {
  id: string; label: string; capacityPerDay?: number | null; sortOrder: number; isActive: boolean;
  /*  DEC-DLV-007 — the slot's own window in minutes (9am = 540), and its
      own last-order clock ("08:00").  */
  startMin?: number | null;
  endMin?: number | null;
  cutoffTime?: string | null;
  /** DEC-DLV-018 — which slot master this connection was made from */
  templateId?: string | null;
}

/** DEC-DLV-018 — a slot MASTER: made once, connected to zone-methods in Setup */
export interface ApiSlotTemplate {
  id: string;
  label: string;
  startMin?: number | null;
  endMin?: number | null;
  cutoffTime?: string | null;
  capacityPerDay?: number | null;
  sortOrder: number;
  isActive: boolean;
  /** live connections — how many zone-methods carry this slot right now */
  usedCount?: number;
}
/** DEC-DLV-019 — one paused day. No typeId = every delivery pauses that day. */
export interface ApiDeliveryBlackout {
  id: string;
  date: string; // YYYY-MM-DD
  reason: string | null;
  typeId: string | null;
  type?: { id: string; name: string } | null;
}
export const listDeliveryBlackouts = () => j<ApiDeliveryBlackout[]>(`/delivery/blackouts`);
export const createDeliveryBlackout = (b: { date: string; reason?: string | null; typeId?: string | null }) =>
  j<ApiDeliveryBlackout>(`/delivery/blackouts`, { method: "POST", body: JSON.stringify(b) });
export const deleteDeliveryBlackout = (id: string) =>
  j<{ id: string; deleted: boolean }>(`/delivery/blackouts/${id}`, { method: "DELETE" });

/** DEC-DLV-020 — the enforced rule switches (photo gates) */
export interface ApiDeliverySettings {
  requirePrepPhoto: boolean;
  requireDeliveryPhoto: boolean;
}
export const getDeliverySettings = () => j<ApiDeliverySettings>(`/delivery/settings`);
export const updateDeliverySettings = (b: Partial<ApiDeliverySettings>) =>
  j<ApiDeliverySettings>(`/delivery/settings`, { method: "PATCH", body: JSON.stringify(b) });

export const listSlotTemplates = () => j<ApiSlotTemplate[]>(`/delivery/slot-templates`);
export const createSlotTemplate = (b: Partial<ApiSlotTemplate>) =>
  j<ApiSlotTemplate>(`/delivery/slot-templates`, { method: "POST", body: JSON.stringify(b) });
export const updateSlotTemplate = (id: string, b: Partial<ApiSlotTemplate>) =>
  j<ApiSlotTemplate>(`/delivery/slot-templates/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteSlotTemplate = (id: string) =>
  j<{ id: string; deleted: boolean }>(`/delivery/slot-templates/${id}`, { method: "DELETE" });
export interface ApiDeliveryMethod {
  id: string; label: string; zone: "DHAKA" | "BANGLADESH"; kind: "RIDER" | "COURIER";
  feePaisa: number; cutoffTime?: string | null; etaLabel?: string | null;
  sortOrder: number; isActive: boolean; slots: ApiDeliverySlot[];
  /*  DEC-DLV-007 — which area this price is for. null = same across the zone.  */
  areaId?: string | null;
  area?: { id: string; name: string; parentId: string | null } | null;
  /*  DEC-DLV-008 — which named delivery this price belongs to.  */
  typeId?: string | null;
  type?: { id: string; name: string; kind: "RIDER" | "COURIER" } | null;
}
export interface ApiRider {
  id: string; name: string; phone?: string | null; vehicle?: string | null;
  photoUrl?: string | null; note?: string | null; isActive: boolean;
  today?: { assigned: number; out: number; delivered: number; failed: number };
}
export interface ApiCourierService {
  id: string; name: string; phone?: string | null; trackingUrlTemplate?: string | null;
  note?: string | null; sortOrder: number; isActive: boolean;
}
export interface ApiAssignment {
  id: string; assignmentNo: string; orderId: string; kind: "RIDER" | "COURIER";
  riderId?: string | null; courierId?: string | null;
  rider?: { id: string; name: string } | null; courier?: { id: string; name: string } | null;
  consignmentNo?: string | null; trackingUrl?: string | null;
  /*  DEC-DLV-021 — SWAPPED is "it left and somebody else finished it", kept
      apart from CANCELLED ("it never left") so a mid-journey hand-over is
      visible and never counted as a failure.  */
  status: "ASSIGNED" | "OUT_FOR_DELIVERY" | "DELIVERED" | "FAILED" | "CANCELLED" | "SWAPPED";
  isActive: boolean; assignedAt: string; outAt?: string | null; deliveredAt?: string | null;
  failedAt?: string | null; failReason?: string | null; note?: string | null;
}
export interface ApiBoardOrder {
  id: string; orderNo: string; placedAt: string;
  /** when we promised it would arrive — null on orders taken before this existed */
  promisedBy?: string | null;
  customer: { id: string; name: string; phone: string };
  recipientName?: string | null; isGift: boolean; zone: string; address: string;
  methodLabel?: string | null; slotLabel?: string | null; date?: string | null;
  salesStatus: string; deliveryStatus: string; totalPaisa: number; duePaisa: number;
  paymentMethod: string; lineCount: number; photoCount: number;
  assignment: ApiAssignment | null;
}

/*  The board is paged now — it used to fetch a flat 300 and say nothing about
    what it left behind (12 Aug 2026). `total` and `counts` are what let the
    screen admit how much work there really is. */
export interface ApiBoardPage {
  rows: ApiBoardOrder[];
  total: number;
  page: number;
  limit: number;
  /** the WHOLE queue by status, never narrowed by the current filter */
  counts: Record<string, number>;
}
export interface BoardQuery {
  status?: string; zone?: string; methodId?: string;
  q?: string; page?: number; limit?: number;
}
export const deliveryBoard = (query: BoardQuery = {}) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  }
  const qs = p.toString();
  return j<ApiBoardPage>(`/delivery/board${qs ? `?${qs}` : ""}`);
};

/** Many parcels, one carrier. Never all-or-nothing — see `failed` in the reply. */
export const bulkAssign = (b: Record<string, unknown>) =>
  j<{
    assigned: number; failedCount: number;
    done: { orderId: string; assignmentNo: string }[];
    failed: { orderId: string; reason: string }[];
  }>(`/delivery/assignments/bulk`, { method: "POST", body: JSON.stringify(b) });
export const deliveryConfig = () => j<ApiDeliveryMethod[]>(`/delivery/config`);
export async function deliveryConfigSafe(): Promise<ApiDeliveryMethod[] | null> {
  try { return await deliveryConfig(); } catch { return null; }
}
export const listRiders = () => j<ApiRider[]>(`/delivery/riders`);
export const createRider = (b: Record<string, unknown>) => j<ApiRider>(`/delivery/riders`, { method: "POST", body: JSON.stringify(b) });
export const updateRider = (id: string, b: Record<string, unknown>) => j<ApiRider>(`/delivery/riders/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteRider = (id: string) => j(`/delivery/riders/${id}`, { method: "DELETE" });
export const listCourierServices = () => j<ApiCourierService[]>(`/delivery/couriers`);
export const createCourierService = (b: Record<string, unknown>) => j<ApiCourierService>(`/delivery/couriers`, { method: "POST", body: JSON.stringify(b) });
export const updateCourierService = (id: string, b: Record<string, unknown>) => j<ApiCourierService>(`/delivery/couriers/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteCourierService = (id: string) => j(`/delivery/couriers/${id}`, { method: "DELETE" });
/* ── areas & names · DEC-DLV-007 / DEC-DLV-008 ────────────────────────────
   Owner: "whatever is edited in the delivery module must work automatically
   across the whole system." These four endpoints are that single source. */
export interface ApiDeliveryArea {
  id: string;
  name: string;
  parentId: string | null;
  zone: "DHAKA" | "BANGLADESH";
  sortOrder: number;
  isActive: boolean;
}
export const listDeliveryAreas = () => j<ApiDeliveryArea[]>(`/delivery/areas`);
export const createDeliveryArea = (b: Record<string, unknown>) =>
  j<ApiDeliveryArea>(`/delivery/areas`, { method: "POST", body: JSON.stringify(b) });
export const updateDeliveryArea = (id: string, b: Record<string, unknown>) =>
  j<ApiDeliveryArea>(`/delivery/areas/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteDeliveryArea = (id: string) => j(`/delivery/areas/${id}`, { method: "DELETE" });

export const createDeliveryType = (b: Record<string, unknown>) =>
  j<ApiDeliveryType>(`/delivery/types`, { method: "POST", body: JSON.stringify(b) });
export const updateDeliveryType = (id: string, b: Record<string, unknown>) =>
  j<ApiDeliveryType>(`/delivery/types/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteDeliveryType = (id: string) => j(`/delivery/types/${id}`, { method: "DELETE" });

export const listDeliveryMethods = () => j<ApiDeliveryMethod[]>(`/delivery/methods`);
export const createDeliveryMethod = (b: Record<string, unknown>) => j<ApiDeliveryMethod>(`/delivery/methods`, { method: "POST", body: JSON.stringify(b) });
export const updateDeliveryMethod = (id: string, b: Record<string, unknown>) => j<ApiDeliveryMethod>(`/delivery/methods/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteDeliveryMethod = (id: string) => j(`/delivery/methods/${id}`, { method: "DELETE" });
export const addDeliverySlot = (methodId: string, b: Record<string, unknown>) => j<ApiDeliverySlot>(`/delivery/methods/${methodId}/slots`, { method: "POST", body: JSON.stringify(b) });
export const updateDeliverySlot = (slotId: string, b: Record<string, unknown>) => j<ApiDeliverySlot>(`/delivery/slots/${slotId}`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteDeliverySlot = (slotId: string) => j(`/delivery/slots/${slotId}`, { method: "DELETE" });
/*  DEC-DLV-022 — why a delivery failed, a master the owner keeps.

    Delivery serves these itself rather than borrowing Inventory's
    `/inventory/issue-reasons`: the ReasonMaster table is shared and scoped by
    `purpose`, but the endpoint belongs to whoever owns the purpose. */
export interface ApiFailReason { id: string; label: string; sortOrder: number }
export const listFailReasons = () => j<ApiFailReason[]>(`/delivery/fail-reasons`);
export const addFailReason = (label: string) =>
  j<ApiFailReason>(`/delivery/fail-reasons`, { method: "POST", body: JSON.stringify({ label }) });
export const updateFailReason = (id: string, b: { label?: string; isActive?: boolean }) =>
  j<ApiFailReason>(`/delivery/fail-reasons/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteFailReason = (id: string) =>
  j<{ ok: boolean }>(`/delivery/fail-reasons/${id}`, { method: "DELETE" });

export const createAssignment = (b: Record<string, unknown>) => j<ApiAssignment>(`/delivery/assignments`, { method: "POST", body: JSON.stringify(b) });
export const assignmentAction = (id: string, action: "out" | "delivered" | "fail" | "cancel", b: Record<string, unknown> = {}) =>
  j<ApiAssignment>(`/delivery/assignments/${id}/${action}`, { method: "POST", body: JSON.stringify(b) });
export const orderAssignments = (orderId: string) => j<ApiAssignment[]>(`/delivery/orders/${orderId}/assignments`);
/*  SETTLING A CARRIER — DEC-DLV-016/017.
    `costRecorded` is a separate fact from `costPaisa`, because 0 is a real
    cost and also the default. `codDuePaisa` is 0 on a prepaid parcel, which
    still appears here: no cash to reconcile, but the rider was still paid. */
export interface ApiUnsettledParcel {
  assignmentId: string; assignmentNo: string;
  deliveredAt: string | null; daysSince: number | null;
  kind: "RIDER" | "COURIER";
  carrier: { id: string; name: string } | null;
  carrierId: string | null;
  consignmentNo: string | null;
  orderId?: string; orderNo?: string; zone?: string; address?: string;
  codDuePaisa: number;
  costPaisa: number;
  costRecorded: boolean;
  codHandedOver: boolean;
}
export const listUnsettled = (carrierId?: string) =>
  j<ApiUnsettledParcel[]>(`/delivery/unsettled${carrierId ? `?carrierId=${encodeURIComponent(carrierId)}` : ""}`);

export const settleCarrier = (b: Record<string, unknown>) =>
  j<{
    /** `netPaisa` is null when no cash came back — there is no receipt to net */
    settled: number; grossPaisa: number; chargePaisa: number; netPaisa: number | null;
    carrierName: string; remittance: { id: string; remittanceNo: string } | null;
  }>(`/delivery/settle`, { method: "POST", body: JSON.stringify(b) });

/** proof photo upload — existing Delivery-owned OrderPhoto endpoint (DLV-R08) */
export const addOrderPhoto = (orderId: string, b: Record<string, unknown>) =>
  j(`/orders/${orderId}/photos`, { method: "POST", body: JSON.stringify(b) });

/* ── delivery performance — the real figures ──────────────────────────────
   Rates come back in BASIS POINTS, and `null` when nothing could be measured.
   `null` is not 0: "no delivery in this window carried a promised time" and
   "every delivery was late" are opposite facts, and a screen that prints 0%
   for the first one is lying. Divide by 100 for a percentage — never round a
   null into a number on the way. */
export interface ApiDeliveryAnalytics {
  from: string; to: string;
  delivered: number; failed: number; inFlight: number;
  measurable: number; unmeasurable: number; onTimeCount: number;
  onTimeBp: number | null; failedBp: number | null;
  avgMinutesToDeliver: number | null;
  chargedPaisa: number; costPaisa: number; marginPaisa: number;
  byZone: { name: string; delivered: number; onTimeBp: number | null; measurable: number }[];
  byCarrier: { name: string; kind: "RIDER" | "COURIER"; delivered: number; onTimeBp: number | null; measurable: number; costPaisa: number }[];
  daily: { onDate: string; delivered: number; onTimeCount: number; measurable: number }[];
}
export const deliveryPerformance = (days = 30) =>
  j<ApiDeliveryAnalytics>(`/delivery/performance?days=${days}`);

/* ============================================================
   FINANCE (ledger) — RADIAN_FINANCE_MODULE_ARCHITECTURE.md v1.1
   Double-entry lives in the API; this screen layer never shows Dr/Cr.
   ============================================================ */

export type FinAccountType = "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";
export type FinCostBehavior = "FIXED" | "VARIABLE";

export interface ApiFinanceAccount {
  id: string; code: string; name: string; type: FinAccountType; groupName?: string | null;
  isMoneyAccount: boolean; payMethod: string | null;
  costBehavior: FinCostBehavior | null;
  isSystem: boolean; isActive: boolean;
  openingBalancePaisa: number; note: string | null; sortOrder: number;
  balancePaisa: number; debitPaisa: number; creditPaisa: number;
}

export interface ApiFinanceSummary {
  cashPaisa: number; spendablePaisa: number; customerAdvancePaisa: number;
  carrierCashPaisa: number; receivablePaisa: number; payablePaisa: number;
  moneyAccountCount: number; openingPosted: boolean; openingPendingPaisa: number;
  goLiveDate: string | null; lastClosedDate: string | null; vatEnabled: boolean;
}

export interface ApiFinanceSetting {
  id: string;
  goLiveDate: string | null; fiscalYearStartMonth: number; defaultCashAccountId: string | null;
  expenseApprovalThresholdPaisa: number; paymentApprovalThresholdPaisa: number;
  refundApprovalThresholdPaisa: number; wastageApprovalThresholdPaisa: number;
  labourBonusPercentBp: number; assetThresholdPaisa: number; revenueRecognition: string;
  autoPostEnabled: boolean; lastClosedDate: string | null; openingPostedAt: string | null;
  vatEnabled: boolean; vatRateBps: number; vatInclusivePricing: boolean;
  businessBin: string | null; riderCashLimitPaisa: number;
}

export interface ApiJournalLine {
  id: string; accountId: string; debitPaisa: number; creditPaisa: number;
  partnerId: string | null; orderId: string | null; note: string | null;
  account?: { code: string; name: string; type: FinAccountType };
}
export interface ApiJournalEntry {
  id: string; entryNo: string; entryDate: string; sourceType: string;
  sourceId: string | null; narration: string; branchId: string | null;
  carrierId: string | null; reversesId: string | null; isManual: boolean;
  actorName: string | null; createdAt: string; lines: ApiJournalLine[];
}
export interface ApiReconciliation {
  id: string; reconNo: string; accountId: string; asOfDate: string;
  systemBalancePaisa: number; countedBalancePaisa: number; differencePaisa: number;
  journalEntryId: string | null; note: string | null; actorName: string | null;
  account?: { code: string; name: string };
}

export const financeAccounts = () => j<ApiFinanceAccount[]>(`/finance/accounts`);
export async function financeAccountsSafe(): Promise<ApiFinanceAccount[] | null> {
  try { return await financeAccounts(); } catch { return null; }
}
export const financeSummary = () => j<ApiFinanceSummary>(`/finance/accounts/summary`);
export const createFinanceAccount = (b: Record<string, unknown>) =>
  j<ApiFinanceAccount>(`/finance/accounts`, { method: "POST", body: JSON.stringify(b) });
export const updateFinanceAccount = (id: string, b: Record<string, unknown>) =>
  j<ApiFinanceAccount>(`/finance/accounts/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteFinanceAccount = (id: string) =>
  j(`/finance/accounts/${id}`, { method: "DELETE" });

export const financeSettings = () => j<ApiFinanceSetting>(`/finance/settings`);
export const updateFinanceSettings = (b: Record<string, unknown>) =>
  j<ApiFinanceSetting>(`/finance/settings`, { method: "PATCH", body: JSON.stringify(b) });

export const postOpeningBalances = (b: Record<string, unknown> = {}) =>
  j<ApiJournalEntry>(`/finance/opening`, { method: "POST", body: JSON.stringify(b) });

export const financeLedger = (q: { accountId?: string; from?: string; to?: string; take?: number } = {}) => {
  const p = new URLSearchParams();
  if (q.accountId) p.set("accountId", q.accountId);
  if (q.from) p.set("from", q.from);
  if (q.to) p.set("to", q.to);
  if (q.take) p.set("take", String(q.take));
  const qs = p.toString();
  return j<ApiJournalEntry[]>(`/finance/ledger${qs ? `?${qs}` : ""}`);
};
export const financeReconciliations = (accountId?: string) =>
  j<ApiReconciliation[]>(`/finance/reconciliations${accountId ? `?accountId=${accountId}` : ""}`);
export const financeReconcile = (b: Record<string, unknown>) =>
  j<ApiReconciliation>(`/finance/reconcile`, { method: "POST", body: JSON.stringify(b) });

export const FIN_TYPE_META: Record<FinAccountType, { label: string; bg: string; text: string }> = {
  ASSET: { label: "Asset", bg: "#e8f6ef", text: "#0f7d55" },
  LIABILITY: { label: "Liability", bg: "#fdecec", text: "#b91c1c" },
  EQUITY: { label: "Equity", bg: "#f3e8ff", text: "#7c3aed" },
  INCOME: { label: "Income", bg: "#e0f2fe", text: "#0369a1" },
  EXPENSE: { label: "Expense", bg: "#fff4e2", text: "#b45309" },
};

/** demo data for practice — every row carries a DEMO: key and can be cleared */
export const financeDemoSeed = () =>
  j<{ ok: boolean; created: number }>(`/finance/demo/seed`, { method: "POST", body: "{}" });
export const financeDemoClear = () =>
  j<{ ok: boolean; removed: number }>(`/finance/demo/clear`, { method: "POST", body: "{}" });

/* ---- Finance: manual money forms (expense · income · transfer · partner) ---- */

export interface ApiExpense {
  id: string; expenseNo: string; spentAt: string; accountId: string; paidFromId: string;
  amountPaisa: number; payeeName: string | null; note: string | null; attachmentUrl: string | null;
  approval: "AUTO" | "PENDING" | "APPROVED" | "DECLINED";
  approvedBy: string | null; approvedAt: string | null; journalEntryId: string | null;
  partnerId: string | null; actorName: string | null;
  account?: { code: string; name: string; costBehavior: FinCostBehavior | null };
  paidFrom?: { code: string; name: string };
}
export interface ApiIncome {
  id: string; incomeNo: string; earnedAt: string; accountId: string; receivedInId: string;
  amountPaisa: number; payerName: string | null; note: string | null; journalEntryId: string | null;
  account?: { code: string; name: string }; receivedIn?: { code: string; name: string };
}
export interface ApiTransfer {
  id: string; transferNo: string; movedAt: string; fromId: string; toId: string;
  amountPaisa: number; feePaisa: number; note: string | null; journalEntryId: string | null;
  from?: { code: string; name: string }; to?: { code: string; name: string };
}
export interface ApiPartner {
  id: string; name: string; kind: "CAPITAL" | "LABOUR" | "BOTH";
  sharePercentBp: number; monthlySalaryPaisa: number; phone: string | null; note: string | null;
  joinedAt: string; isActive: boolean;
  capitalInPaisa: number; capitalReturnedPaisa: number; capitalOutstandingPaisa: number;
  drawingsPaisa: number; salaryPaidPaisa: number; profitSharePaisa: number; standingPaisa: number;
  transactions: { id: string; kind: string; amountPaisa: number; happenedAt: string; note: string | null }[];
}

export const financeExpenses = (approval?: string) =>
  j<ApiExpense[]>(`/finance/expenses${approval ? `?approval=${approval}` : ""}`);
export const createFinanceExpense = (b: Record<string, unknown>) =>
  j<ApiExpense>(`/finance/expenses`, { method: "POST", body: JSON.stringify(b) });
export const approveFinanceExpense = (id: string, b: Record<string, unknown> = {}) =>
  j<ApiExpense>(`/finance/expenses/${id}/approve`, { method: "POST", body: JSON.stringify(b) });
export const declineFinanceExpense = (id: string, b: Record<string, unknown> = {}) =>
  j<ApiExpense>(`/finance/expenses/${id}/decline`, { method: "POST", body: JSON.stringify(b) });
export const deleteFinanceExpense = (id: string) =>
  j(`/finance/expenses/${id}`, { method: "DELETE" });

export const financeIncomes = () => j<ApiIncome[]>(`/finance/income`);
export const createFinanceIncome = (b: Record<string, unknown>) =>
  j<ApiIncome>(`/finance/income`, { method: "POST", body: JSON.stringify(b) });

export const financeTransfers = () => j<ApiTransfer[]>(`/finance/transfers`);
export const createFinanceTransfer = (b: Record<string, unknown>) =>
  j<ApiTransfer>(`/finance/transfers`, { method: "POST", body: JSON.stringify(b) });

export const financePartners = () => j<ApiPartner[]>(`/finance/partners`);
export const createFinancePartner = (b: Record<string, unknown>) =>
  j<ApiPartner>(`/finance/partners`, { method: "POST", body: JSON.stringify(b) });
export const updateFinancePartner = (id: string, b: Record<string, unknown>) =>
  j<ApiPartner>(`/finance/partners/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteFinancePartner = (id: string) =>
  j(`/finance/partners/${id}`, { method: "DELETE" });
export const financePartnerTxn = (b: Record<string, unknown>) =>
  j(`/finance/partner-transactions`, { method: "POST", body: JSON.stringify(b) });

/* ---- Finance: recurring · staff advance · accountant journal (Biznify gap fixes) ---- */

export interface ApiRecurring {
  id: string; name: string; accountId: string; paidFromId: string; amountPaisa: number;
  dayOfMonth: number; startsOn: string; endsOn: string | null; lastPostedFor: string | null;
  note: string | null; isActive: boolean; postedThisMonth: boolean; isDue: boolean; dueOn: string;
}
export interface ApiStaffAdvance {
  /** HR-D06 — null only on ledger rows written before the Employee list existed */
  employeeId: string | null;
  employeeNo: string | null;
  name: string;
  designation: string | null;
  /** true = a pre-HR row, shown as-is rather than guessed at */
  legacy: boolean;
  outstandingPaisa: number; givenPaisa: number; recoveredPaisa: number; lastAt: string | null;
}

export const financeRecurring = () => j<ApiRecurring[]>(`/finance/recurring`);
export const createFinanceRecurring = (b: Record<string, unknown>) =>
  j<ApiRecurring>(`/finance/recurring`, { method: "POST", body: JSON.stringify(b) });
export const updateFinanceRecurring = (id: string, b: Record<string, unknown>) =>
  j<ApiRecurring>(`/finance/recurring/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteFinanceRecurring = (id: string) =>
  j(`/finance/recurring/${id}`, { method: "DELETE" });
export const postFinanceRecurring = (id: string, b: Record<string, unknown> = {}) =>
  j(`/finance/recurring/${id}/post`, { method: "POST", body: JSON.stringify(b) });

export const financeStaffAdvances = () => j<ApiStaffAdvance[]>(`/finance/staff-advances`);
export const giveStaffAdvance = (b: Record<string, unknown>) =>
  j(`/finance/staff-advances`, { method: "POST", body: JSON.stringify(b) });
export const payStaffSalary = (b: Record<string, unknown>) =>
  j(`/finance/staff-salary`, { method: "POST", body: JSON.stringify(b) });

export const financeManualJournal = (b: Record<string, unknown>) =>
  j(`/finance/journal`, { method: "POST", body: JSON.stringify(b) });
export const reverseLedgerEntry = (id: string, b: Record<string, unknown> = {}) =>
  j(`/finance/ledger/${id}/reverse`, { method: "POST", body: JSON.stringify(b) });

export interface ApiFinanceOverview {
  period: { from: string; to: string; monthsBack: number };
  cashPaisa: number; spendablePaisa: number; customerAdvancePaisa: number;
  carrierCashPaisa: number; receivablePaisa: number; payablePaisa: number;
  inventoryPaisa: number; goodsOutPaisa: number; vatPayablePaisa: number;
  moneyAccounts: { id: string; code: string; name: string; balancePaisa: number }[];
  incomePaisa: number; expensePaisa: number; cogsPaisa: number; profitPaisa: number;
  fixedCostPaisa: number; variableCostPaisa: number;
  prevProfitPaisa: number; prevIncomePaisa: number;
  topExpenses: { code: string; name: string; paisa: number }[];
  breakEvenPaisa: number; breakEvenProgressBp: number; contributionMarginBp: number;
  runwayDays: number | null;
  staffAdvanceOutstandingPaisa: number; partnerCapitalOutstandingPaisa: number;
  dueRecurringCount: number; pendingApprovalCount: number; postingFailureCount: number;
  /** last books-vs-shop verdict (null until the first check has run) */
  drift: { ranAt: string; worst: DriftSeverity; wrongCount: number; watchCount: number } | null;
}

export const financeOverview = (monthsBack = 0) =>
  j<ApiFinanceOverview>(`/finance/overview?monthsBack=${monthsBack}`);

export interface ApiPostingFailure {
  id: string; sourceType: string; sourceId: string; error: string; retryCount: number; createdAt: string;
}
export const financeFailures = () => j<ApiPostingFailure[]>(`/finance/failures`);
export const replayFinanceFailure = (id: string) =>
  j<{ ok: boolean; message: string }>(`/finance/failures/${id}/replay`, { method: "POST", body: "{}" });

/** shared POST used by screens that build their own paths (keeps auth + PIN behaviour) */
export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  return j<T>(path, { method: "POST", body: JSON.stringify(body) });
}
export async function apiGet<T>(path: string): Promise<T> {
  return j<T>(path);
}
/** the PATCH twin of apiPost — settings screens edit, they do not create */
export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return j<T>(path, { method: "PATCH", body: JSON.stringify(body) });
}

/* ==================== DRIFT — do the books still match the shop? (G1) ==================== */

export type DriftSeverity = "ok" | "watch" | "wrong";
export interface ApiDriftCheck {
  key: string;
  title: string;
  why: string;
  booksPaisa: number | null;
  realPaisa: number | null;
  diffPaisa: number | null;
  severity: DriftSeverity;
  advice: string;
  count?: number;
  examples?: string[];
}
export interface ApiDriftReport {
  ranAt: string;
  worst: DriftSeverity;
  wrongCount: number;
  watchCount: number;
  checks: ApiDriftCheck[];
}
export interface ApiDriftRun {
  id: string;
  ranAt: string;
  reason: string;
  worst: DriftSeverity;
  wrongCount: number;
  watchCount: number;
  problems: { title: string; diffPaisa: number | null; count: number | null }[];
}
/** look now, without recording it */
export const financeDrift = () => j<ApiDriftReport>("/finance/drift");
/** run it AND write the verdict to the history (same thing the 2 AM job does) */
export const runFinanceDrift = () => j<ApiDriftReport>("/finance/drift/run", { method: "POST", body: "{}" });
export const financeDriftHistory = () => j<ApiDriftRun[]>("/finance/drift/history");

/* ---- loans: fix one that was typed wrong (G4) ---- */
export const updateFinanceLoan = (id: string, dto: Record<string, unknown>) =>
  j(`/finance/loans/${id}`, { method: "PATCH", body: JSON.stringify(dto) });
export const removeFinanceLoan = (id: string) =>
  j(`/finance/loans/${id}`, { method: "DELETE", body: JSON.stringify({}) });

/* ---- closing / reopening a month (G5) ---- */
export const closeMonth = (closeThrough?: string) =>
  j<{ closedTo: string | null }>("/finance/month-end", {
    method: "POST",
    body: JSON.stringify({ close: true, closeThrough }),
  });
export const reopenPeriod = (reason?: string) =>
  j<{ ok: boolean; wasClosedThrough: string }>("/finance/period/reopen", {
    method: "POST",
    body: JSON.stringify({ reason }),
  });

/* ==================== MUSHAK 6.3 — the government VAT challan (G3) ==================== */

export interface ApiMushakReadiness {
  ready: boolean;
  missing: string[];
  vatEnabled: boolean;
  vatRateBps: number;
  businessBin: string | null;
  businessName: string | null;
  businessAddress: string | null;
  businessVatCircle: string | null;
  signatoryName: string | null;
  signatoryDesignation: string | null;
}
export interface ApiMushakOrder {
  id: string;
  orderNo: string;
  placedAt: string;
  customerName: string;
  buyerBin: string | null;
  totalPaisa: number;
  vatPaisa: number;
  salesStatus: string;
}
export interface ApiMushakChallan {
  challanNo: string;
  issuedAt: string;
  seller: { name: string; address: string; bin: string; vatCircle: string | null };
  buyer: { name: string; address: string; bin: string | null; phone: string | null };
  lines: {
    description: string; unit: string; qty: number; unitPricePaisa: number;
    valuePaisa: number; sdPaisa: number; vatPaisa: number; totalPaisa: number;
  }[];
  subtotalPaisa: number; discountPaisa: number; deliveryPaisa: number;
  sdPaisa: number; vatPaisa: number; totalPaisa: number;
  inWords: string;
  signatory: { name: string; designation: string };
  vatRateBps: number;
}

export const mushakReadiness = () => j<ApiMushakReadiness>("/finance/mushak/readiness");
export const mushakOrders = () => j<ApiMushakOrder[]>("/finance/mushak/orders");
export const mushakChallan = (orderId: string) => j<ApiMushakChallan>(`/finance/mushak/${orderId}`);

/* ==================== PEOPLE — who may use this panel (DEC-FIN-028) ====================
   Three roles, and the line is drawn at MONEY, not seniority:
     STAFF   — runs the shop. Never sees cost, profit or what we owe.
     MANAGER — the above plus buying and the whole Finance module.
     OWNER   — everything, plus capital, profit sharing and this screen.
   Only an OWNER can reach these endpoints; the server enforces it too. */

export type ApiRole = "OWNER" | "MANAGER" | "STAFF";
export interface ApiAppUser {
  id: string;
  name: string;
  username: string;
  role: ApiRole;
  isActive: boolean;
  hasPin: boolean;
  lastLogin: string | null;
}
export interface AppUserWrite {
  name?: string;
  username?: string;
  password?: string;
  pin?: string;
  role?: ApiRole;
  isActive?: boolean;
}

/**
 * DEC-ADM-012 — who is signed in, and may they see what things cost.
 * Cached for the tab: every screen that draws a cost figure asks, and the answer
 * cannot change without signing in again.
 */
export interface ApiMe {
  id: string; name: string; username: string; role: ApiRole;
  hasPin: boolean; canSeeCost: boolean;
}
let mePromise: Promise<ApiMe> | null = null;
export const authMe = () => j<ApiMe>("/auth/me");
export function meCached(): Promise<ApiMe> {
  if (!mePromise) mePromise = authMe().catch((e) => { mePromise = null; throw e; });
  return mePromise;
}

export const listAppUsers = () => j<ApiAppUser[]>("/auth/users");
export const createAppUser = (dto: AppUserWrite) =>
  j<ApiAppUser>("/auth/users", { method: "POST", body: JSON.stringify(dto) });
export const updateAppUser = (id: string, dto: AppUserWrite) =>
  j<ApiAppUser>(`/auth/users/${id}`, { method: "PATCH", body: JSON.stringify(dto) });
export const removeAppUser = (id: string) =>
  j<{ ok: boolean }>(`/auth/users/${id}`, { method: "DELETE" });

/** change my own password / PIN — proving the current password first */
export const changeOwnAccess = (dto: {
  currentPassword: string;
  password?: string;
  pin?: string;
}) => j<{ ok: boolean; signedOutEverywhere: boolean }>("/auth/me", {
  method: "PATCH",
  body: JSON.stringify(dto),
});

/* ================= Employee / HR (28 Jul 2026) =================
   RADIAN_HR_MODULE_ARCHITECTURE.md. The person, the day sheet, the payroll run.
   HR-D06 — Finance's staff screen now picks from `hrPayable()`; there is no
   free-text name field anywhere in the money flow any more. */

export type PayType = "MONTHLY" | "DAILY" | "HOURLY";
export type EmployeeStatus = "ACTIVE" | "INACTIVE";
export type AttendanceStatus = "PRESENT" | "HALF_DAY" | "LEAVE" | "ABSENT";
export type PayrollStatus = "DRAFT" | "APPROVED" | "CANCELLED";

export interface ApiEmployee {
  id: string;
  employeeNo: string;
  name: string;
  phone: string | null;
  altPhone: string | null;
  /** HR-R10 — these five come back null unless you are the OWNER */
  nid: string | null;
  dateOfBirth: string | null;
  address: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  privateHidden?: boolean;
  photoUrl: string | null;
  roleId: string | null;
  role?: { id: string; name: string } | null;
  joinedOn: string;
  leftOn: string | null;
  status: EmployeeStatus;
  payType: PayType;
  ratePaisa: number;
  /** HR-D12 — what a full day means for this person; half day = half of it */
  dutyHoursPerDay: number;
  /** HR-D13 — usual shift, "09:00" / "19:00"; empty = no fixed hours */
  shiftStart: string | null;
  shiftEnd: string | null;
  appUserId: string | null;
  appUser?: { id: string; username: string; role: ApiRole } | null;
  note: string | null;
  advanceOutstandingPaisa: number;
  _count?: { documents: number };
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

/** HR-D10 — admin-managed job roles */
export interface ApiEmployeeRole {
  id: string;
  name: string;
  note: string | null;
  sortOrder: number;
  isActive: boolean;
  _count?: { employees: number };
}

/** HR-D11 — the list never carries the file; fetch one to open it */
export interface ApiEmployeeDocument {
  id: string;
  title: string;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number;
  note?: string | null;
  uploadedBy?: string | null;
  createdAt: string;
}

export interface ApiEmployeeStats {
  total: number;
  active: number;
  inactive: number;
  advanceOutstandingPaisa: number;
  monthlyWageBillPaisa: number;
  presentToday: number;
  attendanceMarkedToday: number;
}

export interface ApiPayableEmployee {
  id: string;
  employeeNo: string;
  name: string;
  role?: { id: string; name: string } | null;
  payType: PayType;
  ratePaisa: number;
  dutyHoursPerDay: number;
  /** HR-R25 — leavers stay on this list while money is still open between us */
  hasLeft?: boolean;
  leftOn?: string | null;
  advanceOutstandingPaisa: number;
}

export interface ApiAttendanceRow {
  employeeId: string;
  employeeNo: string;
  name: string;
  roleName: string | null;
  photoUrl: string | null;
  payType: PayType;
  ratePaisa: number;
  /** HR-D12 — a full day for THIS person; "half day" is half of this */
  dutyHoursPerDay: number;
  /** HR-D13 — their usual shift, and what actually happened today */
  shiftStart: string | null;
  shiftEnd: string | null;
  inTime: string | null;
  outTime: string | null;
  status: AttendanceStatus;
  isPaidLeave: boolean;
  minutes: number;
  note: string | null;
  markedBy: string | null;
  saved: boolean;
}
export interface ApiAttendanceSheet {
  onDate: string;
  isFuture: boolean;
  /** set when an approved payroll already covers this day (HR-R15) */
  lockedBy: string | null;
  everMarked: boolean;
  rows: ApiAttendanceRow[];
}

export interface ApiPayrollLine {
  id: string;
  employeeId: string;
  employee: { id: string; employeeNo: string; name: string; photoUrl: string | null; role?: { id: string; name: string } | null };
  payType: PayType;
  ratePaisa: number;
  daysWorked: number;
  absentDays: number;
  minutesWorked: number;
  basePaisa: number;
  extraPaisa: number;
  extraNote: string | null;
  deductionPaisa: number;
  deductionNote: string | null;
  advanceRecoveredPaisa: number;
  netPaisa: number;
  advanceOutstandingPaisa: number;
  earnedPaisa: number;
  /** HR-D12 — rate x absent days / days recorded. Shown, never auto-applied. */
  suggestedAbsenceDeductionPaisa: number;
}
export interface ApiPayroll {
  id: string;
  payrollNo: string;
  period: string;
  periodStart: string;
  periodEnd: string;
  status: PayrollStatus;
  grossPaisa: number;
  extraPaisa: number;
  deductionPaisa: number;
  advanceRecoveredPaisa: number;
  netPaisa: number;
  paidFromId: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  journalEntryId: string | null;
  note: string | null;
  lines: ApiPayrollLine[];
  /** things worth reading before Approve — none of them block (HR-R22/R23) */
  warnings?: string[];
  _count?: { lines: number };
}

export interface ApiEmployeeLedgerRow {
  id: string;
  entryNo: string;
  entryDate: string;
  narration: string;
  accountCode: string;
  accountName: string;
  debitPaisa: number;
  creditPaisa: number;
  note: string | null;
  kind: "ADVANCE_GIVEN" | "ADVANCE_RECOVERED" | "SALARY" | "OTHER";
}

/* ---- employees ---- */
export const listEmployees = (q?: { search?: string; status?: EmployeeStatus | "ALL"; payType?: PayType; roleId?: string }) => {
  const p = new URLSearchParams();
  if (q?.search) p.set("search", q.search);
  if (q?.status) p.set("status", q.status);
  if (q?.payType) p.set("payType", q.payType);
  if (q?.roleId) p.set("roleId", q.roleId);
  const qs = p.toString();
  return j<{ items: ApiEmployee[]; total: number }>(`/hr/employees${qs ? `?${qs}` : ""}`);
};
export const employeeStats = () => j<ApiEmployeeStats>("/hr/employees/stats");
export const hrPayable = () => j<ApiPayableEmployee[]>("/hr/employees/payable");
/* ---- job roles (HR-D10) ---- */
export const listEmployeeRoles = () => j<ApiEmployeeRole[]>("/hr/roles");
export const createEmployeeRole = (b: { name: string; note?: string | null }) =>
  j<ApiEmployeeRole>("/hr/roles", { method: "POST", body: JSON.stringify(b) });
export const updateEmployeeRole = (id: string, b: Record<string, unknown>) =>
  j<ApiEmployeeRole>(`/hr/roles/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteEmployeeRole = (id: string) =>
  j<{ id: string; deleted: boolean }>(`/hr/roles/${id}`, { method: "DELETE" });

/* ---- documents (HR-D11) ---- */
export const listEmployeeDocuments = (id: string) =>
  j<ApiEmployeeDocument[]>(`/hr/employees/${id}/documents`);
export const getEmployeeDocument = (id: string, docId: string) =>
  j<ApiEmployeeDocument & { dataUrl: string }>(`/hr/employees/${id}/documents/${docId}`);
export const addEmployeeDocument = (id: string, b: Record<string, unknown>) =>
  j<ApiEmployeeDocument>(`/hr/employees/${id}/documents`, { method: "POST", body: JSON.stringify(b) });
export const deleteEmployeeDocument = (id: string, docId: string) =>
  j<{ id: string; deleted: boolean }>(`/hr/employees/${id}/documents/${docId}`, { method: "DELETE" });

/* ---- practice data ---- */
export const hrDemoStatus = () => j<{ isSeeded: boolean; count: number }>("/hr/demo");
export const hrDemoSeed = () =>
  j<{ isSeeded: boolean; count: number; period?: string; message: string }>("/hr/demo/seed", { method: "POST" });
export const hrDemoClear = () =>
  j<{ cleared: number; message: string }>("/hr/demo/clear", { method: "POST" });
export const employeeTrash = () => j<{ items: ApiEmployee[]; total: number }>("/hr/employees/trash");
export const getEmployee = (id: string) => j<ApiEmployee>(`/hr/employees/${id}`);
export const getEmployeeTimeline = (id: string) => j<ActivityEvent[]>(`/hr/employees/${id}/timeline`);
export const getEmployeeLedger = (id: string) => j<ApiEmployeeLedgerRow[]>(`/hr/employees/${id}/ledger`);
export const getEmployeePayslips = (id: string) =>
  j<(ApiPayrollLine & { payroll: { payrollNo: string; period: string; status: PayrollStatus; approvedAt: string | null } })[]>(
    `/hr/employees/${id}/payslips`,
  );
export const getEmployeeMonth = (id: string, period: string) =>
  j<{ period: string; from: string; to: string; rows: { onDate: string; status: AttendanceStatus; isPaidLeave: boolean; inTime: string | null; outTime: string | null; minutes: number; note: string | null }[]; totals: { days: number; minutes: number; marked: number; absent: number } }>(
    `/hr/employees/${id}/attendance?period=${period}`,
  );
export const createEmployee = (b: Record<string, unknown>) =>
  j<ApiEmployee>("/hr/employees", { method: "POST", body: JSON.stringify(b) });
export const updateEmployee = (id: string, b: Record<string, unknown>) =>
  j<ApiEmployee>(`/hr/employees/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteEmployee = (id: string) =>
  j<{ id: string; deleted: boolean }>(`/hr/employees/${id}`, { method: "DELETE" });
export const restoreEmployee = (id: string) =>
  j<{ id: string; restored: boolean }>(`/hr/employees/${id}/restore`, { method: "POST" });

/* ---- attendance ---- */
export const attendanceSheet = (date?: string) =>
  j<ApiAttendanceSheet>(`/hr/attendance${date ? `?date=${date}` : ""}`);
export const saveAttendance = (b: {
  onDate: string;
  rows: {
    employeeId: string; status: AttendanceStatus; isPaidLeave?: boolean;
    inTime?: string | null; outTime?: string | null; minutes?: number; note?: string | null;
  }[];
}) => j<ApiAttendanceSheet>("/hr/attendance", { method: "POST", body: JSON.stringify(b) });

/* ---- payroll ---- */
export const listPayrolls = () => j<{ items: ApiPayroll[]; total: number }>("/hr/payroll");
export const getPayroll = (id: string) => j<ApiPayroll>(`/hr/payroll/${id}`);
export const buildPayroll = (b: { period: string; note?: string | null }) =>
  j<ApiPayroll>("/hr/payroll", { method: "POST", body: JSON.stringify(b) });
export const patchPayroll = (id: string, b: Record<string, unknown>) =>
  j<ApiPayroll>(`/hr/payroll/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const removePayrollLine = (id: string, employeeId: string) =>
  j<ApiPayroll>(`/hr/payroll/${id}/lines/${employeeId}`, { method: "DELETE" });
export const deletePayroll = (id: string) =>
  j<{ id: string; deleted: boolean }>(`/hr/payroll/${id}`, { method: "DELETE" });
/** money moment — OWNER + PIN (the `j` helper raises the PIN box on 403) */
export const approvePayroll = (id: string, b: { paidFromId?: string; paidOn?: string }) =>
  j<ApiPayroll & { journalPosted: boolean }>(`/hr/payroll/${id}/approve`, {
    method: "POST",
    body: JSON.stringify(b),
  });

/* ============================================================
   MARKETING — RADIAN_MARKETING_MODULE_ARCHITECTURE.md (28 Jul 2026)

   Marketing owns campaigns, attribution, affiliates and outreach. Every money
   figure it shows is READ from Finance (MKT-D05) — nothing here writes to the
   ledger except a payout, and that goes through the API with a PIN.
   ============================================================ */

export type CampaignPlatform =
  | "FACEBOOK" | "INSTAGRAM" | "GOOGLE" | "TIKTOK" | "YOUTUBE"
  | "INFLUENCER" | "PRINT" | "EVENT" | "PARTNERSHIP" | "OTHER";
export type CampaignStatus = "PLANNED" | "RUNNING" | "FINISHED" | "ARCHIVED";
export type AttributionSource = "REF_CODE" | "COUPON" | "UTM" | "MANUAL" | "UNATTRIBUTED";
export type AffiliateType = "INDIVIDUAL" | "BUSINESS";
export type CommissionState = "PENDING" | "AVAILABLE" | "PAID" | "REVERSED";
export type OutreachChannel = "WHATSAPP" | "PHONE" | "SMS" | "EMAIL";

export interface ApiCampaign {
  id: string;
  campaignNo: string;
  name: string;
  platform: CampaignPlatform;
  status: CampaignStatus;
  startDate: string;
  endDate: string;
  budgetPaisa: number;
  goalNote: string | null;
  note: string | null;
  offerIds: string[];
  utmKeys: string[];
  // computed, read from Finance + the ledger
  spentPaisa: number;
  orders: number;
  revenuePaisa: number;
  grossPaisa: number;
  contributionPaisa: number;
  roi: number | null;
}

export interface ApiCampaignDetail extends ApiCampaign {
  cogsPaisa: number;
  deliveryCostPaisa: number;
  expenses: {
    id: string; expenseNo: string; spentAt: string; amountPaisa: number;
    payeeName: string | null; note: string | null;
    account: { code: string; name: string };
  }[];
  attributions: {
    id: string; source: AttributionSource; evidence: string | null; decidedAt: string;
    decidedBy: string | null;
    order: {
      id: string; orderNo: string; placedAt: string; senderName: string;
      totalPaisa: number; vatPaisa: number; salesStatus: string; deliveryStatus: string;
    };
  }[];
  quality: { source: AttributionSource; count: number }[];
}

export interface ApiMarketingStats {
  campaigns: {
    running: number; planned: number; finished: number;
    liveSpendPaisa: number; liveContributionPaisa: number; liveOrders: number;
    orders30: number; attributed30: number; unattributed30: number;
    untaggedSpend30Paisa: number;
  };
  affiliates: {
    activeAffiliates: number; pendingPaisa: number; availablePaisa: number;
    paidPaisa: number; reversedPaisa: number; commissionRows: number;
  };
  quality: {
    days: number; totalOrders: number;
    rows: { source: AttributionSource; orders: number; revenuePaisa: number }[];
  };
}

export interface ApiAffiliate {
  id: string;
  affiliateNo: string;
  type: AffiliateType;
  status: "ACTIVE" | "PAUSED";
  name: string;
  phone: string;
  email: string | null;
  contactName: string | null;
  address: string | null;
  note: string | null;
  code: string;
  commissionBp: number;
  payoutMethod: string | null;
  payoutNumber: string | null;
  orders?: number;
  pendingPaisa?: number;
  availablePaisa?: number;
  paidPaisa?: number;
  reversedPaisa?: number;
}

export interface ApiAffiliateDetail extends ApiAffiliate {
  recoverablePaisa: number;
  commissions: {
    id: string; basePaisa: number; rateBp: number; amountPaisa: number;
    state: CommissionState; availableAt: string; reversedNote: string | null;
    journalEntryId: string | null; createdAt: string;
    order: {
      id: string; orderNo: string; placedAt: string; senderName: string;
      totalPaisa: number; salesStatus: string; deliveryStatus: string;
    };
  }[];
  payouts: {
    id: string; payoutNo: string; amountPaisa: number; recoveredPaisa: number;
    netPaisa: number; method: string | null; reference: string | null;
    createdAt: string; journalEntryId: string | null;
  }[];
}

export interface ApiOccasionRow {
  occasionId: string;
  type: string;
  label: string | null;
  date: string;
  onDate: string;
  inDays: number;
  occasionYear: number;
  recipient: { id: string; name: string; relationship: string };
  customer: { id: string; name: string; phone: string; ordersCount: number; lastOrderAt: string | null };
  alreadyContacted: boolean;
  lastOrder: { orderNo: string; placedAt: string; totalPaisa: number } | null;
}

export interface ApiOccasions {
  days: number;
  leadDays: number[];
  template: string;
  items: ApiOccasionRow[];
}

export interface ApiOutreach {
  id: string;
  customerId: string;
  recipientId: string | null;
  occasionType: string | null;
  occasionDate: string | null;
  occasionYear: number | null;
  channel: OutreachChannel;
  purpose: string;
  message: string | null;
  note: string | null;
  result: "SENT" | "REPLIED" | "ORDERED" | "NO_ANSWER" | "REFUSED";
  createdAt: string;
  actorName: string | null;
  customer?: { id: string; name: string; phone: string };
}

export interface ApiMarketingSetting {
  id: string;
  defaultCommissionBp: number;
  holdDays: number;
  minWithdrawPaisa: number;
  refWindowDays: number;
  reminderLeadDays: number[];
  whatsappTemplate: string;
  // MKT-D16 — referral reward rules, changeable whenever the owner likes
  referralEnabled: boolean;
  pointValuePaisa: number;
  referralPoints: number;
  friendDiscountBp: number;
  friendDiscountMaxPaisa: number;
  referralMinOrderPaisa: number;
  // MKT-D21 — loyalty points on ordinary purchases
  loyaltyEnabled: boolean;
  earnRateBp: number;
  earnMultiplierBp: number;
  multiplierUntil: string | null;
  redeemMaxBp: number;
  minRedeemPoints: number;
}

/* ---- overview & settings ---- */
export const marketingStats = () => j<ApiMarketingStats>("/marketing/stats");
export const marketingSettings = () => j<ApiMarketingSetting>("/marketing/settings");
export const saveMarketingSettings = (b: Partial<ApiMarketingSetting>) =>
  j<ApiMarketingSetting>("/marketing/settings", { method: "PATCH", body: JSON.stringify(b) });

/* ---- campaigns ---- */
export const listCampaigns = (p?: { status?: string; search?: string; includeArchived?: string }) => {
  const qs = new URLSearchParams(
    Object.entries(p ?? {}).filter(([, v]) => v) as [string, string][],
  ).toString();
  return j<ApiCampaign[]>(`/marketing/campaigns${qs ? `?${qs}` : ""}`);
};
export const getCampaign = (id: string) => j<ApiCampaignDetail>(`/marketing/campaigns/${id}`);
export const createCampaign = (b: Record<string, unknown>) =>
  j<ApiCampaign>("/marketing/campaigns", { method: "POST", body: JSON.stringify(b) });
export const updateCampaign = (id: string, b: Record<string, unknown>) =>
  j<ApiCampaign>(`/marketing/campaigns/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteCampaign = (id: string) =>
  j<{ id: string; deleted: boolean; archived: boolean; message?: string }>(
    `/marketing/campaigns/${id}`, { method: "DELETE" });

/* ---- attribution ---- */
export const attributionQuality = (days = 30) =>
  j<ApiMarketingStats["quality"]>(`/marketing/attribution/quality?days=${days}`);
export const runAttribution = (from?: string) =>
  j<{ scanned: number; decided: number; attributed: number; unattributed: number; from: string }>(
    "/marketing/attribution/run", { method: "POST", body: JSON.stringify({ from }) });
export const setOrderAttribution = (orderId: string, b: { campaignId?: string | null; affiliateId?: string | null; note?: string | null }) =>
  j(`/marketing/attribution/order/${orderId}`, { method: "PATCH", body: JSON.stringify(b) });

/* ---- affiliates ---- */
export const listAffiliates = (p?: { status?: string; type?: string; search?: string }) => {
  const qs = new URLSearchParams(
    Object.entries(p ?? {}).filter(([, v]) => v) as [string, string][],
  ).toString();
  return j<ApiAffiliate[]>(`/marketing/affiliates${qs ? `?${qs}` : ""}`);
};
export const getAffiliate = (id: string) => j<ApiAffiliateDetail>(`/marketing/affiliates/${id}`);
export const createAffiliate = (b: Record<string, unknown>) =>
  j<ApiAffiliate>("/marketing/affiliates", { method: "POST", body: JSON.stringify(b) });
export const updateAffiliate = (id: string, b: Record<string, unknown>) =>
  j<ApiAffiliate>(`/marketing/affiliates/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteAffiliate = (id: string) =>
  j<{ id: string; deleted: boolean; message?: string }>(`/marketing/affiliates/${id}`, { method: "DELETE" });
export const accrueCommissions = () =>
  j<{ scanned: number; accrued: number; skipped: number }>("/marketing/affiliates/accrue", { method: "POST" });
/** money leaving the shop — OWNER + PIN (the `j` helper raises the PIN box on 403) */
export const payAffiliate = (b: {
  affiliateId: string; commissionIds?: string[]; paidFromId: string;
  method?: string; reference?: string; note?: string;
}) => j<{ payoutNo: string; netPaisa: number; recoveredPaisa: number; entryNo: string }>(
  "/marketing/affiliates/payout", { method: "POST", body: JSON.stringify(b) });

/* ---- occasions & outreach ---- */
export const dueOccasions = (p?: { days?: number; search?: string }) => {
  const qs = new URLSearchParams();
  if (p?.days !== undefined) qs.set("days", String(p.days));
  if (p?.search) qs.set("search", p.search);
  const s = qs.toString();
  return j<ApiOccasions>(`/marketing/occasions${s ? `?${s}` : ""}`);
};
export const outreachHistory = (p?: { customerId?: string; days?: number }) => {
  const qs = new URLSearchParams();
  if (p?.customerId) qs.set("customerId", p.customerId);
  if (p?.days !== undefined) qs.set("days", String(p.days));
  const s = qs.toString();
  return j<ApiOutreach[]>(`/marketing/outreach${s ? `?${s}` : ""}`);
};
export const outreachEffect = (days = 90) =>
  j<{ days: number; contacted: number; ordered: number; revenuePaisa: number; byChannel: { channel: string; contacted: number; ordered: number }[] }>(
    `/marketing/outreach/effect?days=${days}`);
export const logOutreach = (b: Record<string, unknown>) =>
  j<ApiOutreach & { duplicate?: boolean; message?: string }>("/marketing/outreach", {
    method: "POST", body: JSON.stringify(b) });
export const setOutreachResult = (id: string, b: { result: string; resultOrderId?: string | null; note?: string | null }) =>
  j<ApiOutreach>(`/marketing/outreach/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const listOptOuts = () =>
  j<{ id: string; customerId: string; reason: string | null; createdAt: string; customer: { id: string; name: string; phone: string } }[]>(
    "/marketing/optouts");
export const optOutCustomer = (b: { customerId: string; reason?: string | null }) =>
  j("/marketing/optouts", { method: "POST", body: JSON.stringify(b) });
export const optInCustomer = (customerId: string) =>
  j(`/marketing/optouts/${customerId}`, { method: "DELETE" });

/* ---- the one-click WhatsApp link (MKT-D07) ----
   No API, no template approval, no per-message cost. wa.me opens the app with
   the message already written; a person presses Send. This is the same pattern
   radianbd.com already uses. */
export function waLink(phone: string, message: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  const full = digits.startsWith("88") ? digits : `88${digits.replace(/^0/, "")}`;
  return `https://wa.me/${full}?text=${encodeURIComponent(message)}`;
}

/** fill {customer} {recipient} {occasion} {date} in the saved template */
export function fillTemplate(
  tpl: string,
  v: { customer: string; recipient: string; occasion: string; date: string },
): string {
  return tpl
    .replace(/\{customer\}/g, v.customer)
    .replace(/\{recipient\}/g, v.recipient)
    .replace(/\{occasion\}/g, v.occasion)
    .replace(/\{date\}/g, v.date);
}

/* ---- Affiliates sub-module: its own overview, list, commissions, payouts ---- */

export interface ApiAffiliateOverview {
  activeAffiliates: number;
  people: number;
  businesses: number;
  pendingPaisa: number;
  availablePaisa: number;
  paidPaisa: number;
  reversedPaisa: number;
  commissionRows: number;
  totalSalesPaisa: number;
  totalCostPaisa: number;
  effectiveRateBp: number;
  minWithdrawPaisa: number;
  holdDays: number;
  leaderboard: {
    affiliate: { id: string; name: string; code: string; type: AffiliateType; commissionBp: number } | null;
    orders: number; salesPaisa: number; earnedPaisa: number;
  }[];
  readyToPay: {
    affiliate: { id: string; name: string; code: string; payoutMethod: string | null; payoutNumber: string | null } | null;
    amountPaisa: number; overMinimum: boolean;
  }[];
  recent: {
    id: string; amountPaisa: number; state: CommissionState; createdAt: string;
    affiliate: { id: string; name: string; code: string };
    order: { id: string; orderNo: string };
  }[];
}

export interface ApiCommissionRow {
  id: string; basePaisa: number; rateBp: number; amountPaisa: number;
  state: CommissionState; availableAt: string; reversedNote: string | null;
  journalEntryId: string | null; createdAt: string;
  affiliate: { id: string; name: string; code: string; type: AffiliateType };
  order: { id: string; orderNo: string; placedAt: string; senderName: string };
}

export interface ApiPayoutRow {
  id: string; payoutNo: string; amountPaisa: number; recoveredPaisa: number;
  netPaisa: number; method: string | null; reference: string | null;
  createdAt: string; journalEntryId: string | null;
  affiliate: { id: string; name: string; code: string; type: AffiliateType };
}

export const affiliateOverview = () => j<ApiAffiliateOverview>("/marketing/affiliates/overview");
export const listCommissions = (p?: { state?: string; affiliateId?: string }) => {
  const qs = new URLSearchParams(
    Object.entries(p ?? {}).filter(([, v]) => v) as [string, string][],
  ).toString();
  return j<ApiCommissionRow[]>(`/marketing/affiliates/commissions${qs ? `?${qs}` : ""}`);
};
export const listPayouts = () => j<ApiPayoutRow[]>("/marketing/affiliates/payouts");

/* ---- Marketing automation (MKT-D14) ----
   Five jobs that were already written and that nobody was calling. It
   reconciles rather than hooks: a hook that fails, fails silently. */

export interface ApiAutomationResult {
  at: string;
  scope: "light" | "nightly" | "manual";
  days: number;
  accrued: number;
  released: number;
  reversed: number;
  campaignsStarted: number;
  campaignsFinished: number;
  ordersChecked: number;
  stillUnattributed: number;
  errors: string[];
  ms: number;
}

export const marketingAutomation = () =>
  j<{ last: ApiAutomationResult | null; history: { id: string; createdAt: string; changes: ApiAutomationResult }[] }>(
    "/marketing/automation");
export const runMarketingAutomation = () =>
  j<ApiAutomationResult>("/marketing/automation/run", { method: "POST" });

/* ---- Sales channels — where an order came in through ----
   Owned by Sales, not Marketing. Marketing only reads it. The API has existed
   since the Sales module; there was simply never a screen. */
export interface ApiChannelRow {
  id: string; slug: string; name: string; isActive: boolean; sortOrder: number;
  _count?: { orders: number };
}
export const listChannelRows = (search?: string) =>
  j<ApiChannelRow[]>(`/channels${search ? `?search=${encodeURIComponent(search)}` : ""}`);
export const createChannel = (b: { slug: string; name: string; sortOrder?: number; isActive?: boolean }) =>
  j<ApiChannelRow>("/channels", { method: "POST", body: JSON.stringify(b) });
export const updateChannelRow = (id: string, b: Record<string, unknown>) =>
  j<ApiChannelRow>(`/channels/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteChannel = (id: string) =>
  j<{ id: string; deleted: boolean }>(`/channels/${id}`, { method: "DELETE" });

/* ============================================================
   AUDIT — the trail that has been collecting since day one.
   Read only, OWNER only. There is no write endpoint, deliberately.
   ============================================================ */

export type AuditAction = "CREATE" | "UPDATE" | "DELETE" | "RESTORE";

export interface ApiAuditRow {
  id: string;
  entityType: string;
  entityId: string;
  action: AuditAction;
  actorName: string;
  actorId: string | null;
  changes: Record<string, unknown> | null;
  createdAt: string;
}

export interface ApiActivityRow {
  id: string;
  entityType: string;
  entityId: string;
  kind: "sales" | "delivery" | "payment" | "system" | "general";
  label: string;
  actorName: string;
  note: string | null;
  createdAt: string;
}

export interface ApiAuditStats {
  total: number;
  today: number;
  week: number;
  money7: number;
  lastBackupAt: string | null;
  lastBackupHoursAgo: number | null;
  backupStale: boolean;
}

export interface ApiAuditFacets {
  types: { entityType: string; count: number }[];
  actors: { actorName: string; count: number }[];
  moneyEntities: string[];
}

export const auditStats = () => j<ApiAuditStats>("/audit/stats");
export const auditFacets = () => j<ApiAuditFacets>("/audit/facets");
export const auditBackups = (limit = 30) =>
  j<{ items: ApiAuditRow[]; total: number }>(`/audit/backups?limit=${limit}`);
export const auditActivity = (p?: { days?: number; kind?: string }) => {
  const qs = new URLSearchParams();
  if (p?.days !== undefined) qs.set("days", String(p.days));
  if (p?.kind) qs.set("kind", p.kind);
  const s = qs.toString();
  return j<ApiActivityRow[]>(`/audit/activity${s ? `?${s}` : ""}`);
};
/**
 * Everything ever recorded about ONE thing — "who changed this order".
 *
 * The endpoint has existed since the Audit module was built and nothing has
 * ever called it, so the question the owner actually asks ("what happened to
 * this order?") had a working answer with no way to reach it.
 */
export const auditForEntity = (entityType: string, entityId: string) =>
  j<{ audit: ApiAuditRow[]; activity: ApiActivityRow[] }>(
    `/audit/entity/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`,
  );

export const auditList = (p?: {
  entityType?: string; action?: string; actor?: string; moneyOnly?: string;
  search?: string; from?: string; to?: string; page?: number; pageSize?: number;
}) => {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(p ?? {})) if (v !== undefined && v !== "") qs.set(k, String(v));
  const s = qs.toString();
  return j<Paged<ApiAuditRow>>(`/audit${s ? `?${s}` : ""}`);
};

/* ============================================================
   SEO — what the search engines see, edited here and nowhere else.
   ============================================================ */

export type SeoPageKind = "product" | "category" | "brand";
export interface SeoIssue { level: "wrong" | "watch"; what: string }

export interface ApiSeoPage {
  id: string; slug: string; name: string; kind: SeoPageKind;
  description: string | null; published: boolean; salesCount?: number;
  metaTitle: string | null; metaDescription: string | null;
  ogTitle: string | null; ogDescription: string | null; ogImageUrl: string | null;
  noIndex: boolean;
  issues: SeoIssue[];
  health: "ok" | "watch" | "wrong";
}

export interface ApiSeoSetting {
  id: string;
  titleTemplate: string; siteName: string;
  defaultMetaDescription: string | null; defaultOgImageUrl: string | null;
  twitterHandle: string | null;
  googleVerification: string | null; bingVerification: string | null;
  robotsExtra: string | null;
  allowIndexing: boolean; sitemapEnabled: boolean;
}

export interface ApiSeoCoverage {
  products: { total: number; ok: number; watch: number; wrong: number; liveAndWrong: number };
  categories: { total: number; ok: number; watch: number; wrong: number; liveAndWrong: number };
  brands: { total: number; ok: number; watch: number; wrong: number; liveAndWrong: number };
  setup: SeoIssue[];
  redirects: number;
  limits: { titleMin: number; titleMax: number; descMin: number; descMax: number };
}

export interface ApiSeoRedirect {
  id: string; fromPath: string; toPath: string; permanent: boolean;
  note: string | null; hits: number; lastHitAt: string | null;
  isActive: boolean; createdAt: string;
}

export const seoSettings = () => j<ApiSeoSetting>("/seo/settings");
export const saveSeoSettings = (b: Partial<ApiSeoSetting>) =>
  j<ApiSeoSetting>("/seo/settings", { method: "PATCH", body: JSON.stringify(b) });
export const seoCoverage = () => j<ApiSeoCoverage>("/seo/coverage");
export const seoPages = (p?: { kind?: SeoPageKind; missing?: string; search?: string }) => {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(p ?? {})) if (v) qs.set(k, String(v));
  const s = qs.toString();
  return j<ApiSeoPage[]>(`/seo/pages${s ? `?${s}` : ""}`);
};
export const saveSeoPage = (kind: SeoPageKind, id: string, b: Record<string, unknown>) =>
  j(`/seo/pages/${kind}/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const seoRedirects = (search?: string) =>
  j<ApiSeoRedirect[]>(`/seo/redirects${search ? `?search=${encodeURIComponent(search)}` : ""}`);
export const addSeoRedirect = (b: { fromPath: string; toPath: string; permanent?: boolean; note?: string }) =>
  j<ApiSeoRedirect>("/seo/redirects", { method: "POST", body: JSON.stringify(b) });
export const bulkSeoRedirects = (text: string) =>
  j<{ added: number; failed: string[]; seen: number }>("/seo/redirects/bulk", {
    method: "POST", body: JSON.stringify({ text }) });
export const updateSeoRedirect = (id: string, b: Record<string, unknown>) =>
  j<ApiSeoRedirect>(`/seo/redirects/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteSeoRedirect = (id: string) =>
  j<{ id: string; deleted: boolean }>(`/seo/redirects/${id}`, { method: "DELETE" });

/* ---- Marketing tracking (MKT-D15) — every pixel id in one place ---- */

export interface ApiTracking {
  id: string;
  enabled: boolean; testMode: boolean;
  gtmId: string | null;
  metaPixelId: string | null;
  ga4MeasurementId: string | null;
  googleAdsId: string | null;
  googleAdsConversionLabel: string | null;
  tiktokPixelId: string | null;
  snapPixelId: string | null;
  pinterestTagId: string | null;
  clarityId: string | null;
  capiDatasetId: string | null;
  capiAccessToken: string | null; // always null coming back — the token never leaves the server
  capiTokenSet: boolean;
  capiEnabled: boolean;
  /* MKT-D20 — reading the ad account (ads_read), a different token to the one above */
  adAccountId: string | null;
  adsAccessToken: string | null; // always null coming back
  adsTokenSet: boolean;
  adsEnabled: boolean;
  adsCurrency: string | null;
}

export interface ApiTrackingStatus {
  enabled: boolean; testMode: boolean; liveCount: number;
  platforms: { key: string; name: string; hint: string; on: boolean }[];
  events: { name: string; ready: boolean; why: string }[];
  capi: { enabled: boolean; datasetSet: boolean; tokenSet: boolean; ready: boolean };
  ads: {
    enabled: boolean; accountSet: boolean; tokenSet: boolean;
    currency: string; ready: boolean;
  };
}

export const trackingSettings = () => j<ApiTracking>("/marketing/tracking");
export const trackingStatus = () => j<ApiTrackingStatus>("/marketing/tracking/status");
export const saveTracking = (b: Record<string, unknown>) =>
  j<ApiTracking>("/marketing/tracking", { method: "PATCH", body: JSON.stringify(b) });

/* ---- Meta ad numbers (MKT-D20) ----
   Read-only. Meta reports what it billed, in the ad account's currency; the
   bank charges something else once conversion and fees land. Both are true and
   they never match — so nothing here writes a taka. The "put it in the books"
   button hands the figure to the Finance expense form, where a person confirms
   what the statement actually says. Finance owns the money (MKT-D05). */

export interface ApiAdCampaign {
  id: string;                 // Meta's campaign id
  name: string;
  spendMinor: number;         // in `currency`, smallest unit — NOT taka unless currency is BDT
  impressions: number;
  clicks: number;
  reach: number;
  currency: string;
  ctr: number;                // 0…1
  cpcMinor: number;
  lastDay: string;
  linkedTo: { id: string; campaignNo: string; name: string } | null;
}

export interface ApiAdSummary {
  days: number;
  currency: string;
  isTaka: boolean;            // false for a USD ad account — the screen must say so
  totalSpendMinor: number;
  totalClicks: number;
  totalImpressions: number;
  lastFetched: string | null;
  items: ApiAdCampaign[];
  campaigns: { id: string; campaignNo: string; name: string }[];
}

export const adsSummary = (days = 30) =>
  j<ApiAdSummary>(`/marketing/ads/summary?days=${days}`);
export const adsTest = () =>
  j<{ ok: boolean; id: string; name: string; currency: string; active: boolean; note: string }>(
    "/marketing/ads/test", { method: "POST" });
export const adsPull = (days = 30) =>
  j<{ days: number; since: string; until: string; rows: number; currency: string }>(
    "/marketing/ads/pull", { method: "POST", body: JSON.stringify({ days }) });
export const adsLink = (externalCampaignId: string, campaignId: string | null) =>
  j<{ externalCampaignId: string; campaignId: string | null }>(
    "/marketing/ads/link",
    { method: "POST", body: JSON.stringify({ externalCampaignId, campaignId }) });

/* ---- Referral & points (MKT-D16/D17) ----
   One points ledger, shared with Loyalty when that arrives.
   1 point = ৳1 (the owner's rule) — the value is a setting all the same. */

export type ReferralState = "JOINED" | "REWARDED" | "REVERSED";
export type PointReason =
  | "REFERRAL" | "REFERRAL_REVERSED" | "PURCHASE" | "PURCHASE_REVERSED"
  | "OPENING" | "REDEEMED" | "ADJUSTMENT" | "EXPIRED";

export interface ApiReferralOverview {
  enabled: boolean;
  pointValuePaisa: number; referralPoints: number; friendDiscountBp: number;
  joined: number; rewarded: number; reversed: number;
  pointsOutstanding: number; liabilityPaisa: number;
  pointsGivenForReferrals: number; costPaisa: number; broughtInPaisa: number;
  returnRatio: number | null;
  leaderboard: { customer: { id: string; name: string; phone: string } | null; friends: number; points: number }[];
}

export interface ApiReferralRow {
  id: string; referralNo: string; state: ReferralState;
  pointsAwarded: number; orderId: string | null;
  rewardedAt: string | null; reversedAt: string | null; reversedNote: string | null;
  createdAt: string;
  referrer: { id: string; name: string; phone: string };
  friend: { id: string; name: string; phone: string; ordersCount: number };
}

export interface ApiPointRow {
  id: string; deltaPoints: number; reason: PointReason;
  refType: string | null; refId: string | null; note: string | null;
  journalEntryId: string | null; actorName: string | null; createdAt: string;
}

export interface ApiCustomerReferral {
  code: string | null; uses: number;
  points: number; worthPaisa: number;
  ledger: ApiPointRow[];
  referrals: (ApiReferralRow & { friend: { id: string; name: string; phone: string } })[];
}

export const referralOverview = () => j<ApiReferralOverview>("/marketing/referral");
export const referralList = (p?: { state?: string }) =>
  j<ApiReferralRow[]>(`/marketing/referral/list${p?.state ? `?state=${p.state}` : ""}`);
export const referralForCustomer = (customerId: string) =>
  j<ApiCustomerReferral>(`/marketing/referral/customer/${customerId}`);
export const makeReferralCode = (customerId: string) =>
  j<{ code: string }>(`/marketing/referral/code/${customerId}`, { method: "POST" });
export const referralJoin = (b: { code: string; friendId: string }) =>
  j<ApiReferralRow>("/marketing/referral/join", { method: "POST", body: JSON.stringify(b) });
export const runReferral = () =>
  j<{ scanned: number; rewarded: number; checked: number; reversed: number }>(
    "/marketing/referral/run", { method: "POST" });
export const adjustPoints = (b: { customerId: string; delta: number; note: string }) =>
  j<ApiPointRow>("/marketing/referral/points/adjust", { method: "POST", body: JSON.stringify(b) });
/*  redeemPoints() was removed on 29 Jul 2026 with the route behind it. Points
    are spent one way only now — against an order, inside the 20 % cap. See
    loyaltyRedeem() below. */

/* ---- Loyalty points (MKT-D21) ----
   Earned on DELIVERED, 1 % of (goods − discount). Spent at checkout, at most
   20 % of the same base, never on delivery or VAT — the customer always pays
   at least 80 % from their own pocket. Every number is a setting. */

export interface ApiLoyaltyRate {
  baseBp: number; multiplierBp: number; effectiveBp: number;
  festivalOn: boolean; until: string | null;
}

export interface ApiLoyaltyOverview {
  enabled: boolean;
  rate: ApiLoyaltyRate;
  pointValuePaisa: number;
  redeemMaxBp: number;
  minRedeemPoints: number;
  pointsGiven: number;
  pointsSpent: number;
  pointsTakenBack: number;
  outstanding: number;
  /** every unspent point is ৳1 of future revenue already promised away */
  liabilityPaisa: number;
  /** what account 2130 says the same promise is worth */
  ledgerPaisa: number;
  /** if these two ever disagree, something wrote points without a ledger entry */
  agrees: boolean;
  customersWithPoints: number;
}

export interface ApiLoyaltyHolder {
  customer: { id: string; name: string; phone: string; ordersCount: number } | null;
  points: number;
  worthPaisa: number;
}

export interface ApiLoyaltyQuote {
  orderId: string; orderNo: string;
  customer: { id: string; name: string } | null;
  enabled: boolean;
  basePaisa: number; deliveryPaisa: number; vatPaisa: number;
  capBp: number; capPoints: number; alreadyUsed: number;
  balance: number; maxUsable: number;
  minRedeemPoints: number; pointValuePaisa: number;
  why: string;
}

export const loyaltyOverview = () => j<ApiLoyaltyOverview>("/marketing/loyalty");
export const loyaltyHolders = (take = 50) =>
  j<ApiLoyaltyHolder[]>(`/marketing/loyalty/holders?take=${take}`);
export const loyaltyHistory = (customerId: string) =>
  j<{ balance: number; rows: ApiPointRow[] }>(`/marketing/loyalty/customer/${customerId}`);
export const loyaltyQuote = (orderId: string) =>
  j<ApiLoyaltyQuote>(`/marketing/loyalty/order/${orderId}`);
/** money-shaped — the PIN box comes up automatically */
export const loyaltyRedeem = (orderId: string, points: number) =>
  j<{ points: number; paisa: number; balance: number }>(
    `/marketing/loyalty/order/${orderId}/redeem`,
    { method: "POST", body: JSON.stringify({ points }) });
export const loyaltyEarn = (orderId: string) =>
  j<Record<string, unknown>>(`/marketing/loyalty/order/${orderId}/earn`, { method: "POST" });
/** a correction, or the opening balance imported from radianbd.com */
export const loyaltyAdjust = (b: { customerId: string; points: number; why: string; opening?: boolean }) =>
  j<ApiPointRow>("/marketing/loyalty/adjust", { method: "POST", body: JSON.stringify(b) });
export const loyaltyReconcile = (days = 30) =>
  j<{ earned: number; reversed: number }>(
    "/marketing/loyalty/reconcile", { method: "POST", body: JSON.stringify({ days }) });

/* ---- WhatsApp: templates & send lists (MKT-D18) ----
   No API needed. A send still writes an Outreach row, so the do-not-contact
   list and the effect report keep working. */

export interface ApiWaTemplate {
  id: string; name: string; purpose: string; body: string;
  isActive: boolean; sortOrder: number; usageCount: number;
}

export interface ApiBroadcastRow {
  id: string; no: string; name: string; bodySnapshot: string;
  state: "DRAFT" | "SENDING" | "DONE"; audienceNote: string | null;
  campaignId: string | null; createdAt: string;
  template: { id: string; name: string } | null;
  _count: { targets: number };
  sent: number; skipped: number; pending: number;
}

export interface ApiBroadcastTarget {
  id: string; state: "PENDING" | "SENT" | "SKIPPED";
  sentAt: string | null; note: string | null; message: string;
  customer: { id: string; name: string; phone: string; ordersCount: number; lastOrderAt: string | null };
}

export interface ApiBroadcastDetail extends Omit<ApiBroadcastRow, "_count" | "sent" | "skipped" | "pending"> {
  shopName: string;
  targets: ApiBroadcastTarget[];
  counts: { total: number; sent: number; skipped: number; pending: number };
}

export interface ApiAudienceFilter {
  orderedWithinDays?: number; notOrderedForDays?: number;
  minOrders?: number; neverOrdered?: boolean; segmentId?: string; limit?: number;
}

export const waTemplates = (purpose?: string) =>
  j<ApiWaTemplate[]>(`/marketing/whatsapp/templates${purpose ? `?purpose=${purpose}` : ""}`);
export const saveWaTemplate = (b: Record<string, unknown>) =>
  j<ApiWaTemplate>("/marketing/whatsapp/templates", { method: "POST", body: JSON.stringify(b) });
export const deleteWaTemplate = (id: string) =>
  j<{ id: string; deleted: boolean }>(`/marketing/whatsapp/templates/${id}`, { method: "DELETE" });

/*  Reveal one stored key in full (owner's decision, 6 Aug).
    ⚠️ Never on page load — only on the eye click, one at a time. OWNER-only,
    audited every time. overview() still sends masked values; that is unchanged.  */
export const revealIntegrationField = (kind: string, provider: string, field: string) =>
  j<{ field: string; value: string | null }>(
    `/administration/integrations/${kind}/${provider}/reveal/${field}`);

/*  The owner's one-click check. The endpoint existed since 2 Aug; the admin
    had no button — so it was "I put the key in, no idea if it works". It
    sends Meta's pre-approved `hello_world`, proving the key before our own
    templates are approved.
      sent:true                  → key works, message went
      sent:false configured:true → key present, Meta refused (reason in API log)
      configured:false           → no key was ever set                     */
export const waTestSend = (to: string) =>
  j<{ sent: boolean; configured: boolean }>(
    "/marketing/whatsapp/test-send", { method: "POST", body: JSON.stringify({ to }) });

/** One real email/SMS to a target of your choosing — proof the saved key works. */
export const messagingTestSend = (channel: "EMAIL" | "SMS", to: string) =>
  j<{ ok: boolean; error?: string; raw?: string }>(
    "/marketing/messaging/test", { method: "POST", body: JSON.stringify({ channel, to }) });

/*  Coexistence (DEC-WA-009) — the shop's number on the phone AND here at once.
    The popup is Meta's; these three only open it and finish what it starts.  */

export type ApiCoexistenceConfig = {
  appId: string; configId: string; graphVersion: string;
  connected: boolean; phoneNumberId: string | null; wabaId: string | null;
};
export const coexistenceConfig = () =>
  j<ApiCoexistenceConfig>("/messaging/coexistence/config");

export type ApiCoexistenceStatus = {
  connected: boolean; reason?: string;
  onBusinessApp?: boolean; platformType?: string | null; phone?: string | null;
};
export const coexistenceStatus = () =>
  j<ApiCoexistenceStatus>("/messaging/coexistence/status");

/** The popup's code becomes the sending token — server-side, so no secret ships here. */
export const coexistenceExchange = (b: { code: string; wabaId: string; phoneNumberId: string }) =>
  j<{
    connected: boolean; wabaId: string; phoneNumberId: string; subscribed: boolean;
    contactsSync: { ok: boolean; requestId?: string | null; error?: string };
    historySync: { ok: boolean; requestId?: string | null; error?: string };
  }>("/messaging/coexistence/exchange", { method: "POST", body: JSON.stringify(b) });

/* ── Facebook Page: connect by button, never by pasting a token ─────────── */

export type ApiFbPageConfig = {
  appId: string; graphVersion: string; scopes: string;
  connected: boolean; pageId: string | null;
};
export const fbPageConfig = () => j<ApiFbPageConfig>("/messaging/facebook-page/config");

export type ApiFbPageStatus = {
  connected: boolean; reason?: string; valid?: boolean;
  pageId?: string | null;
  /** What Meta says the token can do — its answer, not ours. */
  scopes?: string[];
  missing?: string[];
};
export const fbPageStatus = () => j<ApiFbPageStatus>("/messaging/facebook-page/status");

/** The popup's code becomes the Page token — server-side, so it never reaches this browser. */
export const fbPageExchange = (b: { code: string }) =>
  j<ApiFbPageStatus & { pageName: string | null }>(
    "/messaging/facebook-page/exchange", { method: "POST", body: JSON.stringify(b) });

/**
 * Fill in the names of threads that have been reading "Guest".
 * Answers per channel, because the poller now walks both.
 */
export type ApiNameBackfill = {
  ran: boolean;
  reason?: string;
  out: Record<string, { looked: number; named: number }>;
};
export const fbPageBackfillNames = () =>
  j<ApiNameBackfill>("/messaging/facebook-page/backfill-names", { method: "POST" });

export const waPreview = (b: ApiAudienceFilter) =>
  j<{ count: number; sample: { id: string; name: string; phone: string }[] }>(
    "/marketing/whatsapp/preview", { method: "POST", body: JSON.stringify(b) });
export const waBroadcasts = () => j<ApiBroadcastRow[]>("/marketing/whatsapp/broadcasts");
export const createBroadcast = (b: Record<string, unknown>) =>
  j<ApiBroadcastRow>("/marketing/whatsapp/broadcasts", { method: "POST", body: JSON.stringify(b) });
export const getBroadcast = (id: string) =>
  j<ApiBroadcastDetail>(`/marketing/whatsapp/broadcasts/${id}`);
export const broadcastEffect = (id: string) =>
  j<{ sent: number; ordered: number; revenuePaisa: number }>(
    `/marketing/whatsapp/broadcasts/${id}/effect`);
export const deleteBroadcast = (id: string) =>
  j<{ id: string; deleted: boolean }>(`/marketing/whatsapp/broadcasts/${id}`, { method: "DELETE" });
export const markTargetSent = (id: string) =>
  j<ApiBroadcastTarget>(`/marketing/whatsapp/target/${id}/sent`, { method: "POST" });
export const skipTarget = (id: string, note?: string) =>
  j<ApiBroadcastTarget>(`/marketing/whatsapp/target/${id}/skip`, {
    method: "POST", body: JSON.stringify({ note }) });

/* ---- Email & SMS (MKT-D19) ----
   Provider-agnostic: pick, paste the key, press Test. Keys never come back. */

export interface ApiMessaging {
  id: string;
  emailEnabled: boolean; emailProvider: string;
  emailApiKey: null; emailKeySet: boolean;
  emailFromName: string | null; emailFromAddress: string | null;
  emailReplyTo: string | null; emailDomain: string | null;
  smsEnabled: boolean; smsProvider: string;
  smsApiKey: null; smsKeySet: boolean;
  smsSenderId: string | null; smsCustomUrl: string | null;
  testEmail: string | null; testPhone: string | null;
}

export interface ApiMessagingStatus {
  email: { enabled: boolean; provider: string; keySet: boolean; fromSet: boolean; ready: boolean };
  sms: { enabled: boolean; provider: string; keySet: boolean; senderSet: boolean; ready: boolean };
  testEmail: string | null; testPhone: string | null;
}

export interface ApiMessageLog {
  id: string; channel: "EMAIL" | "SMS"; toAddress: string;
  subject: string | null; body: string;
  status: "SENT" | "FAILED"; providerRef: string | null; error: string | null;
  provider: string | null; isTest: boolean; actorName: string | null; createdAt: string;
}

export const messagingSettings = () => j<ApiMessaging>("/marketing/messaging");
export const messagingStatus = () => j<ApiMessagingStatus>("/marketing/messaging/status");
export const saveMessaging = (b: Record<string, unknown>) =>
  j<ApiMessaging>("/marketing/messaging", { method: "PATCH", body: JSON.stringify(b) });
export const testMessaging = (b: { channel: "EMAIL" | "SMS"; to?: string }) =>
  j<{ ok: boolean; providerRef?: string; error?: string; raw?: string }>(
    "/marketing/messaging/test", { method: "POST", body: JSON.stringify(b) });
export const messagingHistory = (p?: { channel?: string; status?: string; days?: number }) => {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(p ?? {})) if (v) qs.set(k, String(v));
  const s = qs.toString();
  return j<{ items: ApiMessageLog[]; sent: number; failed: number; days: number }>(
    `/marketing/messaging/history${s ? `?${s}` : ""}`);
};

/* ---------------- Intelligence (DEC-INT-001 · 29 Jul 2026) ----------------
   Every figure arrives wrapped in { value, source } and the SERVER decides
   which. The screen renders what it is told — it never works out whether a
   number is real, because a screen that decides that can be talked into
   lying, and eventually is (DEC-INT-006 condition 2). */

export type Provenance = "REAL" | "DEMO";
/** `unavailable` set = the figure could not be worked out; say so, don't print 0 */
export interface Figure { value: number; source: Provenance; unavailable?: string }

export type IntelTone = "ok" | "info" | "warn" | "danger";

export interface IntelTodayLine {
  key: string; label: string; count: number; href: string; tone: IntelTone;
}
export interface IntelKpi {
  key: string; label: string; unit: "paisa" | "bp" | "count";
  actual: Figure;
  targetValue: number | null;
  progressBp: number | null;
  rag: "none" | "green" | "amber" | "red";
  denominator?: { measurable: number; delivered: number; unmeasurable: number };
}
export interface IntelDashboard {
  role: "OWNER" | "MANAGER" | "STAFF";
  seesMoney: boolean;
  today: { lines: IntelTodayLine[]; ordersToday: number };
  business: {
    kpis: IntelKpi[];
    supporting: { key: string; label: string; value: Figure; unit: "paisa" | "bp" | "count" }[];
  };
  /** null for STAFF — the key is present and empty, never quietly absent */
  money: {
    figures: { key: string; label: string; value: Figure; unit: "paisa"; href: string }[];
    breakEven: { targetPaisa: number; progressBp: number; known: boolean };
    runwayDays: number | null;
  } | null;
  meta: { generatedAt: string; snapshotDays: number; historyReady: boolean };
}

export function getIntelDashboard(): Promise<IntelDashboard> {
  return j<IntelDashboard>("/intelligence/dashboard");
}

export interface IntelHistory {
  days: { onDate: string; revenuePaisa: number; grossProfitPaisa: number; grossMarginBp: number; ordersCount: number }[];
  readyAfterFirstNight: boolean;
}
export function getIntelHistory(days = 30): Promise<IntelHistory> {
  return j<IntelHistory>(`/intelligence/history?days=${days}`);
}

export interface ApiKpiTarget {
  id: string; year: number; month: number;
  kpi: "MONTHLY_SALES" | "GROSS_MARGIN" | "ON_TIME_DELIVERY";
  targetValue: number; note?: string | null;
}
export function listKpiTargets(year: number): Promise<ApiKpiTarget[]> {
  return j<ApiKpiTarget[]>(`/intelligence/targets?year=${year}`);
}
export function setKpiTarget(body: {
  year: number; month: number;
  kpi: "MONTHLY_SALES" | "GROSS_MARGIN" | "ON_TIME_DELIVERY";
  targetValue: number; note?: string;
}): Promise<ApiKpiTarget> {
  return j<ApiKpiTarget>("/intelligence/targets", { method: "POST", body: JSON.stringify(body) });
}

export function getIntelSweep(): Promise<{ last: { ranAt: string; filled: number; days: string[] } | null }> {
  return j("/intelligence/sweep");
}
export function runIntelSweep(): Promise<{ ranAt: string; filled: number; days: string[] }> {
  return j("/intelligence/sweep", { method: "POST" });
}

/** basis points → "46.0 %" */
export function formatBp(bp: number): string {
  return (bp / 100).toFixed(1) + " %";
}

/* ---------------- Intelligence · Analytics & KPIs (DEC-INT-003) ---------------- */

export type KpiName = "MONTHLY_SALES" | "GROSS_MARGIN" | "ON_TIME_DELIVERY";
export type Rag = "none" | "green" | "amber" | "red";

export interface KpiMonthCell {
  kpi: KpiName;
  unit: "paisa" | "bp";
  target: number | null;
  actual: number | null;
  progressBp: number | null;
  rag: Rag;
}
export interface KpiMonth {
  month: number;
  inFuture: boolean;
  actual: {
    revenuePaisa: number | null;
    grossMarginBp: number | null;
    onTimeBp: number | null;
    ordersCount: number | null;
    /** 0 = nothing recorded (so the figures are null, NOT zero) · -1 = live */
    daysRecorded: number;
    isCurrentMonth: boolean;
  };
  kpis: KpiMonthCell[];
}
export interface KpiYear {
  year: number;
  currentMonth: number | null;
  months: KpiMonth[];
  bands: { amberAtBp: number; redBelowBp: number };
}
export function getKpiYear(year: number): Promise<KpiYear> {
  return j<KpiYear>(`/intelligence/kpis?year=${year}`);
}

export type KpiMovement =
  | { known: false; why: string }
  | {
      known: true;
      totalChangePaisa: number;
      changeBp: number | null;
      volumePaisa: number;
      valuePaisa: number;
      ordersFrom: number;
      ordersTo: number;
      aovFromPaisa: number;
      aovToPaisa: number;
      leadingReason: "volume" | "value";
    };
export function getKpiMovement(year: number, month: number): Promise<KpiMovement> {
  return j<KpiMovement>(`/intelligence/kpis/movement?year=${year}&month=${month}`);
}

export interface KpiWeekdays {
  daysConsidered: number;
  known: boolean;
  weekdays: { name: string; days: number; avgRevenuePaisa: number; avgOrders: number }[];
}
export function getKpiWeekdays(days = 90): Promise<KpiWeekdays> {
  return j<KpiWeekdays>(`/intelligence/kpis/weekdays?days=${days}`);
}

export function saveKpiTarget(body: {
  year: number; month: number; kpi: KpiName; targetValue: number; note?: string;
}): Promise<ApiKpiTarget> {
  return j<ApiKpiTarget>("/intelligence/targets", { method: "POST", body: JSON.stringify(body) });
}
export function clearKpiTarget(body: { year: number; month: number; kpi: KpiName }): Promise<{ cleared: boolean }> {
  return j("/intelligence/targets/clear", { method: "POST", body: JSON.stringify(body) });
}
export function copyKpiTargets(body: {
  fromYear: number; fromMonth: number; toYear: number; months: number[];
}): Promise<{ written: number; skipped: number }> {
  return j("/intelligence/targets/copy", { method: "POST", body: JSON.stringify(body) });
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/* ---------------- Intelligence · Analytics lenses ----------------
   Nine lenses, one shape. The screen renders whatever the server sends, so a
   tenth lens needs no frontend change at all. */

export type LensKey =
  | "sales" | "delivery" | "inventory" | "products" | "customers"
  | "finance" | "marketing" | "purchases" | "staff";
export type RangeKey = "today" | "30d" | "month" | "year";
export type LensUnit = "paisa" | "count" | "bp" | "days" | "minutes";

/** value === null means NOT KNOWABLE. It renders as "—", never as 0. */
export interface LensCard {
  key: string; label: string; value: number | null; unit: LensUnit; hint?: string;
}
export type LensChart =
  | { kind: "line"; key: string; title: string; note?: string; unit: LensUnit; points: { label: string; value: number }[] }
  | { kind: "bar"; key: string; title: string; note?: string; unit: LensUnit; rows: { label: string; value: number; sub?: string }[] }
  | { kind: "split"; key: string; title: string; note?: string; unit: LensUnit; parts: { label: string; value: number }[] };

export type RangeMode = "full" | "lookback" | "none";

export interface LensResult {
  lens: LensKey; label: string; range: RangeKey;
  /** how much of the chosen period this lens could actually use */
  rangeMode: RangeMode;
  /** empty when the period is honoured exactly; otherwise says what really happened */
  rangeNote: string;
  from: string; to: string;
  cards: LensCard[]; charts: LensChart[];
  /** set when the lens genuinely has nothing to show — said in words, not drawn */
  emptyNote: string | null;
}

export function getLenses(): Promise<{ lenses: { key: LensKey; label: string; rangeMode: RangeMode }[] }> {
  return j("/intelligence/lenses");
}
export function getLens(lens: LensKey, range: RangeKey): Promise<LensResult> {
  return j<LensResult>(`/intelligence/analytics?lens=${lens}&range=${range}`);
}

export function formatLensValue(v: number | null, unit: LensUnit): string {
  if (v === null) return "—";
  switch (unit) {
    case "paisa": return formatTaka(v);
    case "bp": return (v / 100).toFixed(1) + " %";
    case "days": return `${v} days`;
    case "minutes": return v >= 60 ? `${Math.floor(v / 60)}h ${v % 60}m` : `${v} min`;
    default: return v.toLocaleString("en-IN");
  }
}

/* ---------------- Intelligence · Reports centre (DEC-INT-004) ----------------
   Every report arrives in the same { columns, rows, totals } shape, so one
   table draws all of them, one CSV writer exports all of them, and one print
   stylesheet prints all of them. */

export type ReportFormat = "text" | "paisa" | "count" | "bp" | "date";
export interface ReportColumn { key: string; label: string; format: ReportFormat; numeric?: boolean }
export type ReportCell = string | number | null;

export interface ReportMeta {
  key: string; title: string; group: string; description: string;
  usesRange: boolean; audience: string;
}
export interface ReportResult {
  key: string; title: string; subtitle: string;
  usesRange: boolean; from: string | null; to: string | null;
  columns: ReportColumn[];
  rows: Record<string, ReportCell>[];
  totals: Record<string, ReportCell> | null;
  emptyNote: string | null;
  /** something the report wants to say about its OWN numbers — never hidden */
  caveat?: string;
}

export function listReports(): Promise<{ reports: ReportMeta[] }> {
  return j("/intelligence/reports");
}
export function runReport(key: string, from?: string, to?: string): Promise<ReportResult> {
  const q = new URLSearchParams({ key });
  if (from) q.set("from", from);
  if (to) q.set("to", to);
  return j<ReportResult>(`/intelligence/report?${q.toString()}`);
}

/** how a cell is shown. null is "—", never 0 — the distinction is the point. */
export function formatReportCell(v: ReportCell, format: ReportFormat): string {
  if (v === null || v === undefined || v === "") return format === "text" ? "" : "—";
  if (format === "paisa") return formatTaka(Number(v));
  if (format === "bp") return (Number(v) / 100).toFixed(1) + " %";
  if (format === "count") return Number(v).toLocaleString("en-IN");
  if (format === "date") return String(v);
  return String(v);
}

/*  CSV for the accountant. No library: the API has zero third-party
    dependencies and this is not worth breaking that for.
    Money is written in TAKA with two decimals, not paisa — a spreadsheet that
    says 420000 when the shop made ৳4,200 is worse than no spreadsheet. */
export function reportToCsv(r: ReportResult): string {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const cell = (v: ReportCell, f: ReportFormat) => {
    if (v === null || v === undefined) return "";
    if (f === "paisa") return (Number(v) / 100).toFixed(2);
    if (f === "bp") return (Number(v) / 100).toFixed(2);
    return String(v);
  };
  const lines = [
    esc(r.title) + "," + esc(r.subtitle),
    r.from ? esc(`${r.from.slice(0, 10)} to ${r.to?.slice(0, 10) ?? ""}`) : esc("as it stands now"),
    "",
    r.columns.map((c) => esc(c.label)).join(","),
    ...r.rows.map((row) => r.columns.map((c) => esc(cell(row[c.key], c.format))).join(",")),
  ];
  if (r.totals) lines.push(r.columns.map((c) => esc(cell(r.totals![c.key], c.format))).join(","));
  return lines.join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  // BOM so Excel opens Bangla and ৳ correctly instead of as mojibake
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ---------------- Intelligence · Forecast & market (DEC-INT-006) ---------------- */

export type Provenance2 = "REAL" | "DEMO";

export interface Projection {
  key: string; label: string; horizon: string;
  source: Provenance2;
  /** how it was worked out, in words — so the reader can disbelieve it */
  method: string;
  needsDays: number; haveDays: number;
  lowPaisa: number; midPaisa: number; highPaisa: number;
  points: { label: string; value: number }[];
}
export interface ForecastResult {
  readiness: {
    daysRecorded: number; firstDay: string | null;
    weekReady: boolean; monthReady: boolean; daysUntilMonthReady: number;
  };
  projections: Projection[];
  market: {
    source: Provenance2;
    /** true = waiting will NOT make this real; there is no source at all */
    permanent: boolean;
    note: string;
    items: { label: string; changeBp: number; note: string }[];
  };
  recommendations: never[];
  recommendationNote: string;
}
export function getForecast(): Promise<ForecastResult> {
  return j<ForecastResult>("/intelligence/forecast");
}

/* ==========================================================================
   ADMINISTRATION — the one list (ADM-RULE-001)
   RADIAN_ADMINISTRATION_MODULE_ARCHITECTURE.md, 30 Jul 2026

   Everything below reads ONE registry on the server. The sidebar's own
   roles: array is on its way out: two lists answering the same question,
   with nobody reconciling them, is what hid the whole Intelligence module
   from STAFF for weeks without raising a single error.
   ========================================================================== */

export interface ApiAccessNode {
  key: string;
  label: string;
  href: string | null;
  kind: "MODULE" | "SCREEN";
  domain?: string;
  firstSeenAt: string;
  children: ApiAccessNode[];
}
export interface ApiPosition {
  id: string;
  name: string;
  note: string | null;
  isOwner: boolean;
  isLocked: boolean;
  /** DEC-ADM-012 — may this template see buying prices? */
  canSeeCost: boolean;
  /** how many people hold this position */
  people: number;
  /** how many explicit decisions are stored — the rest is inherited */
  rules: number;
}
export interface ApiUndecided {
  key: string; label: string; domain: string;
  href: string | null; firstSeenAt: string;
}

export function getAccessRegistry(): Promise<ApiAccessNode[]> {
  return j<ApiAccessNode[]>("/administration/registry");
}
/** ADM-D06 — arrived, but nobody has decided who gets it */
export function getUndecidedNodes(): Promise<ApiUndecided[]> {
  return j<ApiUndecided[]>("/administration/registry/undecided");
}
export function listPositions(): Promise<ApiPosition[]> {
  return j<ApiPosition[]>("/administration/positions");
}
export function createPosition(name: string, note?: string): Promise<ApiPosition> {
  return j<ApiPosition>("/administration/positions", {
    method: "POST",
    body: JSON.stringify({ name, note }),
  });
}
export function renamePosition(
  id: string, name: string, note?: string, canSeeCost?: boolean,
): Promise<ApiPosition> {
  return j<ApiPosition>(`/administration/positions/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name, note, canSeeCost }),
  });
}
export function removePosition(id: string): Promise<{ ok: boolean }> {
  return j<{ ok: boolean }>(`/administration/positions/${id}`, { method: "DELETE" });
}
/** only the exceptions come back — a missing key means "whatever the module says" */
export function getPositionAccess(id: string): Promise<Record<string, boolean>> {
  return j<Record<string, boolean>>(`/administration/positions/${id}/access`);
}
/** allowed: null removes the row, handing the node back to inheritance */
export function setPositionAccess(
  id: string, nodeKey: string, allowed: boolean | null,
): Promise<{ ok: boolean }> {
  return j<{ ok: boolean }>(`/administration/positions/${id}/access`, {
    method: "PATCH",
    body: JSON.stringify({ nodeKey, allowed }),
  });
}
/** what the signed-in person can actually reach — the sidebar will read this */
export function getMyAccess(): Promise<Record<string, boolean>> {
  return j<Record<string, boolean>>("/administration/my-access");
}

/** §7 stage 2 — who the guard WOULD have turned away, while turning nobody away */
export interface ApiWouldBlock {
  at: string; who: string; position: string | null;
  method: string; path: string; node: string;
}
export interface ApiWouldBlockReport {
  rows: ApiWouldBlock[];
  /**
   * ⚠️ Path prefixes the guard could not name, and therefore never checked.
   * An empty `rows` means either the ticks match reality OR the guard was not
   * looking — this is what tells the two apart. Enforcement must not be switched
   * on while this is non-empty.
   */
  unjudged: string[];
}
export function getWouldBlock(): Promise<ApiWouldBlockReport> {
  return j<ApiWouldBlockReport>("/administration/would-block");
}

/* ---- Administration: people (ADM, 30 Jul 2026) ---- */

export interface ApiPerson {
  id: string; name: string; username: string; email: string | null;
  positionId: string | null; positionName: string | null;
  legacyRole: "OWNER" | "MANAGER" | "STAFF";
  isActive: boolean; hasPassword: boolean; hasPin: boolean;
  lastLogin: string | null;
  pending: { kind: "INVITE" | "RESET"; expiresAt: string } | null;
}
/** the one-time link. Returned so it can be sent by hand until an email key exists. */
export interface ApiInviteLink {
  link: string; expiresAt: string; emailSent: boolean; note: string;
}

export function listPeople(): Promise<ApiPerson[]> {
  return j<ApiPerson[]>("/administration/people");
}
export function invitePerson(
  dto: { name?: string; email: string; positionId?: string | null },
): Promise<{ user: { id: string; name: string; email: string } } & ApiInviteLink> {
  return j("/administration/people/invite", { method: "POST", body: JSON.stringify(dto) });
}
export function resendInvite(id: string): Promise<ApiInviteLink> {
  return j<ApiInviteLink>(`/administration/people/${id}/resend`, { method: "POST" });
}
/** password only — a PIN is never resettable from a link (ADM-RULE-006) */
export function passwordResetLink(id: string): Promise<ApiInviteLink> {
  return j<ApiInviteLink>(`/administration/people/${id}/reset-link`, { method: "POST" });
}
export function assignPosition(id: string, positionId: string | null): Promise<{ ok: boolean }> {
  return j<{ ok: boolean }>(`/administration/people/${id}/position`, {
    method: "PATCH", body: JSON.stringify({ positionId }),
  });
}
export function getPersonOverrides(id: string): Promise<Record<string, boolean>> {
  return j<Record<string, boolean>>(`/administration/people/${id}/overrides`);
}
export function setPersonOverride(
  id: string, nodeKey: string, allowed: boolean | null,
): Promise<{ ok: boolean }> {
  return j<{ ok: boolean }>(`/administration/people/${id}/overrides`, {
    method: "PATCH", body: JSON.stringify({ nodeKey, allowed }),
  });
}

/* ---- the link pages — no session yet, so these bypass the token ---- */

export async function checkSetPasswordToken(
  token: string,
): Promise<{ valid: boolean; kind?: "INVITE" | "RESET"; name?: string; email?: string }> {
  const r = await fetch(`${API_BASE}/administration/set-password/check?token=${encodeURIComponent(token)}`, { cache: "no-store" });
  if (!r.ok) return { valid: false };
  return r.json();
}
export async function submitNewPassword(token: string, password: string): Promise<void> {
  const r = await fetch(`${API_BASE}/administration/set-password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, password }),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Could not set the password");
}
export async function forgotPassword(email: string): Promise<string> {
  const r = await fetch(`${API_BASE}/administration/forgot-password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const b = await r.json().catch(() => ({}));
  return b.message || "If that address has an account, a reset link is on its way";
}

/* ---- Administration: the company itself (ADM-D08) ---- */

export interface ApiCompany {
  id: string;
  legalName: string | null; tradeName: string | null;
  bin: string | null; tin: string | null;
  tradeLicenceNo: string | null; tradeLicenceExpiry: string | null;
  vatCircle: string | null;
  registeredAddress: string | null; operatingAddress: string | null;
  city: string | null; postcode: string | null; country: string;
  publicPhone: string | null; publicEmail: string | null;
  website: string | null; logoUrl: string | null;
  signatoryName: string | null; signatoryDesignation: string | null;
  /* the storefront's "Visit the shop" card (31 Jul 2026). Stored on the same
     row as the address and phone above, because they are the same kind of fact
     — Administration still owns the table; Storefront edits it through here. */
  mapUrl: string | null;
  whatsappPhone: string | null;
  shopImageUrl: string | null;
}
export interface ApiCompanyReadiness {
  /** false = the Mushak 6.3 challan screen refuses to print, on purpose */
  ready: boolean;
  missing: string[];
  licence: { expiry: string; daysLeft: number } | null;
}

export function getCompany(): Promise<ApiCompany> {
  return j<ApiCompany>("/administration/company");
}
export function getCompanyReadiness(): Promise<ApiCompanyReadiness> {
  return j<ApiCompanyReadiness>("/administration/company/readiness");
}
export function saveCompany(dto: Partial<ApiCompany>): Promise<ApiCompany> {
  return j<ApiCompany>("/administration/company", {
    method: "PATCH", body: JSON.stringify(dto),
  });
}

/* ---- Administration: sessions, backups, the settings map ---- */

export interface ApiSession {
  id: string; userId: string; name: string; email: string | null;
  position: string; startedAt: string; expiresAt: string;
  /** the chair you are sitting in — the screen refuses to sign this one out */
  isYou: boolean;
}
export interface ApiBackups {
  /** never = no dump was ever recorded; bad = over a week ago */
  state: "never" | "ok" | "stale" | "bad";
  hoursSince: number | null;
  last: { at: string; file: string | null; bytes: number | null; by: string } | null;
  count: number;
  /** dumps small enough to be empty — the .bat deletes those, so >0 means trouble */
  suspicious: number;
  history: { at: string; file: string | null; bytes: number | null; by: string }[];
}
export interface ApiSettingsEntry {
  key: string; label: string; owner: string; href: string;
  exists: boolean; what: string;
}

export function listSessions(): Promise<ApiSession[]> {
  return j<ApiSession[]>("/administration/sessions");
}
export function endSession(id: string): Promise<{ ok: boolean }> {
  return j<{ ok: boolean }>(`/administration/sessions/${id}`, { method: "DELETE" });
}
export function endAllSessions(userId: string): Promise<{ ok: boolean; ended: number }> {
  return j(`/administration/sessions/user/${userId}`, { method: "DELETE" });
}
export function getBackups(): Promise<ApiBackups> {
  return j<ApiBackups>("/administration/backups");
}
/** a map of where every setting lives — NOT one merged table */
export function getSettingsMap(): Promise<ApiSettingsEntry[]> {
  return j<ApiSettingsEntry[]>("/administration/settings-map");
}

/* ---- Administration: integrations, grouped by what they do (ADM-D09) ---- */

export interface ApiIntegrationField {
  key: string; label: string; hint?: string; secret: boolean;
  /** the service can turn on with this empty — e.g. WhatsApp's two webhook keys */
  optional?: boolean;
  /** secrets come back MASKED ("••••3f8a") — never the real value */
  value: string | null;
}
export type ApiIntKind = "PAYMENT" | "COURIER" | "MESSAGING" | "SOCIAL" | "ANALYTICS";
export interface ApiIntegration {
  provider: string; label: string; kind: ApiIntKind;
  matters: string; hasSandbox: boolean;
  fieldsTotal: number; fieldsFilled: number;
  isEnabled: boolean;
  /** ⚠️ false = sandbox. Enabled + sandbox = payments that never arrive. */
  isLive: boolean;
  courierId: string | null;
  note: string | null;
  lastCheckedAt: string | null;
  lastCheckOk: boolean | null;
  lastCheckNote: string | null;
  /** where the CONTENT that travels over this connection is edited */
  contentAt: { label: string; href: string } | null;
  /** the old column this was carried out of, so the move can be verified */
  movedFrom: string | null;
  fields: ApiIntegrationField[];
}
export interface ApiIntegrationsOverview {
  /** all five, in the order the screen shows them — money first */
  groups: { kind: ApiIntKind; label: string; blurb: string; services: ApiIntegration[] }[];
  /** CONTENT owned by other modules — the connection is here, the wording is not */
  contentElsewhere: { label: string; owner: string; href: string; why: string }[];
  /*  The whole courier record, not a name for a dropdown — Administration draws
      one card per courier and folds that courier's keys into it (12 Aug 2026).
      Inactive ones are here too, or a switched-off courier could never be
      switched back on. */
  couriers: ApiCourierService[];
}

export function getIntegrations(): Promise<ApiIntegrationsOverview> {
  return j<ApiIntegrationsOverview>("/administration/integrations");
}
/** a field left OUT is left alone; a field sent EMPTY is cleared */
export function saveIntegration(
  kind: ApiIntKind, provider: string,
  dto: Record<string, unknown>,
): Promise<{ ok: boolean }> {
  return j<{ ok: boolean }>(`/administration/integrations/${kind}/${provider}`, {
    method: "PATCH", body: JSON.stringify(dto),
  });
}
export function getPaymentReadiness(): Promise<{
  canTakeMoney: boolean; enabled: string[]; liveProviders: string[];
  sandboxOnly: string[]; warning: string | null;
}> {
  return j("/administration/integrations/payment-readiness");
}

/* ==================== INBOX — unified customer conversations (Phase 1) ==================== */
/*  RADIAN_INBOX_MODULE_ARCHITECTURE.md · DEC-INB-001…006.
    Phase 1 = WEB_CHAT with humans answering; the AI enters through this same door in Phase 2. */

export interface ApiInboxListItem {
  id: string;
  channel: "WEB_CHAT" | "MESSENGER" | "INSTAGRAM" | "WHATSAPP" | "SMS";
  status: "OPEN" | "WAITING_CUSTOMER" | "RESOLVED";
  aiEnabled: boolean;
  unreadForStaff: number;
  lastMessageAt: string;
  guestName: string | null;
  guestPhone: string | null;
  customer: { id: string; name: string; phone: string; ordersCount: number } | null;
  assignee: { id: string; name: string } | null;
  lastMessage: {
    body: string;
    authorType: string;
    createdAt: string;
    /* Null on a reply typed in Meta's own inbox — Meta never names the person. */
    authorUser: { name: string } | null;
  } | null;
}

export interface ApiInboxMessage {
  id: string;
  direction: "IN" | "OUT";
  authorType: "CUSTOMER" | "AI" | "STAFF" | "SYSTEM";
  body: string;
  createdAt: string;
  authorUser: { name: string } | null;
}

export interface ApiInboxDetail {
  id: string;
  channel: string;
  status: "OPEN" | "WAITING_CUSTOMER" | "RESOLVED";
  aiEnabled: boolean;
  guestName: string | null;
  guestPhone: string | null;
  customer: {
    id: string; name: string; phone: string; email: string | null;
    ordersCount: number; lastOrderAt: string | null;
  } | null;
  assignee: { id: string; name: string } | null;
  messages: ApiInboxMessage[];
  escalations: { id: string; reason: string; createdAt: string }[];
  createdAt: string;
}

export interface ApiInboxSetting {
  aiGloballyEnabled: boolean;
  aiProvider: "ANTHROPIC" | "OPENAI";
  aiModel: string;
  staffGraceSec: number;
  escalationAssigneeIds: string[];
  supportOpenMin: number;
  supportCloseMin: number;
  offHoursMessage: string;
  reopenWindowDays: number;
  webChatEnabled: boolean;
}

export const listInboxConversations = (q?: { status?: string; search?: string }) => {
  const p = new URLSearchParams();
  if (q?.status) p.set("status", q.status);
  if (q?.search) p.set("search", q.search);
  const qs = p.toString();
  return j<ApiInboxListItem[]>(`/inbox${qs ? `?${qs}` : ""}`);
};

export const getInboxBadge = () => j<{ unread: number }>("/inbox/badge");

export const getInboxConversation = (id: string) => j<ApiInboxDetail>(`/inbox/${id}`);

export const replyInboxConversation = (id: string, body: string) =>
  j<ApiInboxDetail>(`/inbox/${id}/reply`, { method: "POST", body: JSON.stringify({ body }) });

export const resolveInboxConversation = (id: string) =>
  j<ApiInboxDetail>(`/inbox/${id}/resolve`, { method: "POST" });

export const reopenInboxConversation = (id: string) =>
  j<ApiInboxDetail>(`/inbox/${id}/reopen`, { method: "POST" });

export const assignInboxConversation = (id: string, assigneeId: string | null) =>
  j<ApiInboxDetail>(`/inbox/${id}/assign`, { method: "POST", body: JSON.stringify({ assigneeId }) });

export const getInboxSettings = () => j<ApiInboxSetting>("/inbox/settings");

export const updateInboxSettings = (dto: Partial<ApiInboxSetting>) =>
  j<ApiInboxSetting>("/inbox/settings", { method: "PATCH", body: JSON.stringify(dto) });

/* ─────────── recovering lost orders · DEC-WA-002…008 ───────────
   Message accounting, unfinished checkouts, and the rules. Details in
   RADIAN_WHATSAPP_SETUP.md. */

export interface ApiRecoverySettings {
  recoveryEnabled: boolean;
  paymentFailedEnabled: boolean;
  paymentFailedRetryHours: number;
  abandonedEnabled: boolean;
  abandonedAfterMinutes: number;
  leadRetentionDays: number;
  sweeperEnabled: boolean;
  sweeperEveryMinutes: number;
  supportPhone: string | null;
}

export interface ApiCheckoutLead {
  id: string;
  clientKey: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  draft: Record<string, unknown> | null;
  stage: "CART" | "DETAILS" | "DELIVERY" | "PAYMENT";
  /*  two pictures of one cart: `summary` for human eyes (staff will call),
      `items` for restoring the cart (the `/cart/{id}` page).  */
  cart: {
    items?: unknown[];
    summary?: { name?: string; slug?: string; qty?: number; size?: string; variant?: string }[];
  } | null;
  itemCount: number;
  totalPaisa: number;
  lastSeenAt: string;
  orderId: string | null;
  status: "OPEN" | "CONVERTED" | "MESSAGED" | "SKIPPED";
  messageSentAt: string | null;
  messageError: string | null;
  skipReason: string | null;
  createdAt: string;
}

export interface ApiOrderMessage {
  id: string;
  orderId: string;
  kind: string;
  attempt: number;
  status: "QUEUED" | "SENT" | "FAILED" | "SKIPPED";
  providerMessageId: string | null;
  error: string | null;
  templateName: string | null;
  dueAt: string;
  sentAt: string | null;
}

export const getRecoverySettings = () =>
  j<ApiRecoverySettings>("/messaging/settings");

export const saveRecoverySettings = (b: Partial<ApiRecoverySettings>) =>
  j<ApiRecoverySettings>("/messaging/settings", { method: "POST", body: JSON.stringify(b) });

export const listCheckoutLeads = (status?: string) =>
  j<ApiCheckoutLead[]>(`/messaging/leads${status ? `?status=${status}` : ""}`);

export const orderMessagesFor = (orderId: string) =>
  j<ApiOrderMessage[]>(`/messaging/order/${orderId}`);

/** The sweeper is off on demo (DEC-WA-007), so this is the only way to verify */
export const runRecoverySweep = () =>
  j<Record<string, unknown>>("/messaging/sweep", { method: "POST" });

/* Meta's templates — submitting and watching status.
   ⚠️ Meta approves, not us. These two only submit and fetch news. */
export interface ApiTemplateResult {
  name: string;
  ok: boolean;
  status?: string;
  error?: string;
}
export const getWaTemplateStatus = () =>
  j<{ configured: boolean; templates: ApiTemplateResult[] }>("/messaging/templates");
export const submitWaTemplates = () =>
  j<{ configured: boolean; results: ApiTemplateResult[] }>("/messaging/templates", { method: "POST" });

/*  ── DEC-SAL-013 · what a cancelled order gives back ──────────────────────
    A share of the money the customer actually PAID, never of the order total.
    Owner, 25 Aug 2026. The "rider has left" case is fixed at nothing and is
    deliberately not a setting.  */
export const getCancelRules = () =>
  j<{ beforeStartPct: number; afterStartPct: number }>("/orders/cancel-rules");
export const saveCancelRules = (r: { beforeStartPct?: number; afterStartPct?: number }) =>
  j<{ beforeStartPct: number; afterStartPct: number }>("/orders/cancel-rules", {
    method: "PATCH",
    body: JSON.stringify(r),
  });
