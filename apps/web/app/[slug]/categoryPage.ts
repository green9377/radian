import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getCategoryPage, getCollectionDetail, getShopProducts, type ShopCategoryPage } from "../_data/shop";

/*
  What the category page and the sub-category page share: reading the zone
  cookie, reading the filters off the query string, asking the API for the
  page, and turning its answer into either a page, a 404, or an error.

  THE THREE OUTCOMES ARE DELIBERATELY DIFFERENT (owner, 6 Sep 2026):
    · a slug nobody made          → notFound(): a real 404
    · the API could not be asked  → throw: the error boundary, with Try again
    · anything else               → the page, from real data only
  There is no fourth outcome. The hand-written category configs that used to
  render when the API was away are gone — a shop must never show invented
  products, prices or promises because a server was slow.
*/

export type Zone = "dhaka" | "bangladesh" | null;

/** what the zone store put there — anything else is treated as unset */
export async function zoneFromCookie(): Promise<Zone> {
  const c = await cookies();
  const v = c.get("radian-zone")?.value;
  return v === "bangladesh" || v === "dhaka" ? v : null;
}

export type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The filters a category address can carry, normalised to the names the API
 * reads. Two spellings are accepted for three of them because links with the
 * old words are in the wild (`?style=`, `?delivery=`, `?occasion=`) and an
 * address that ignores half of itself is a link that lies.
 *
 * `budget` is a price-range collection's slug (what the Gift Finder sends);
 * it becomes that collection's window here so the grid is right on the first
 * render. The API never sees the slug.
 */
export async function readFilters(sp: SearchParams, zone: Zone) {
  const one = (k: string) => {
    const v = sp[k];
    return typeof v === "string" && v ? v : undefined;
  };
  const budgetSlug = one("budget");
  const budget = budgetSlug ? await getCollectionDetail(budgetSlug, zone) : null;
  const taka = (paisa: number | null | undefined) =>
    paisa == null ? undefined : String(Math.round(paisa / 100));
  return {
    colour: one("colour"),
    occasion: one("occasions") ?? one("occasion"),
    tag: one("tag") ?? one("style"),
    recipient: one("recipients"),
    budget: budgetSlug,
    min: one("min") ?? taka(budget?.minPaisa),
    max: one("max") ?? taka(budget?.maxPaisa),
    speed: one("speed") ?? one("delivery"),
    sort: one("sort") ?? "popular",
  };
}

export type Filters = Awaited<ReturnType<typeof readFilters>>;

/** true when something other than the sort is narrowing the grid */
export const isFiltered = (f: Filters) =>
  Object.entries(f).some(([k, v]) => k !== "sort" && k !== "budget" && v);

/** the filters as the API takes them — without the budget slug */
export const apiFilters = (f: Filters) => {
  const { budget: _budget, ...rest } = f;
  void _budget;
  return rest;
};

/**
 * The page, or the right way out. `sub` names a sub-category under `slug`.
 */
export async function loadCategoryPage(slug: string, zone: Zone, sub?: string): Promise<ShopCategoryPage> {
  const res = await getCategoryPage(slug, zone, sub);
  if (res.ok) return res.data;
  if (res.status === 404) notFound();
  // 5xx, a timeout, no network: the error boundary — never invented content
  throw new Error(`The catalogue could not be read (${res.status ?? "no response"})`);
}

/** the first page of the grid; `null` = could not be read */
export const loadFirstGrid = (slug: string, zone: Zone, filters: Filters, sub?: string, limit = 8) =>
  getShopProducts({ category: slug, sub, zone, limit, ...apiFilters(filters) });

export function categoryMetadata(page: ShopCategoryPage, canonicalPath: string): Metadata {
  return {
    title: page.seo.title,
    description: page.seo.description,
    // an unfinished or private category can be kept out of Google from the
    // admin — the same escape hatch products and brands already have
    robots: page.seo.noIndex ? { index: false, follow: false } : undefined,
    // one address per category: the filtered variants all point back here
    alternates: { canonical: canonicalPath },
    openGraph: {
      title: page.seo.ogTitle ?? page.seo.title,
      description: page.seo.ogDescription ?? page.seo.description,
      images: page.seo.ogImageUrl ? [page.seo.ogImageUrl] : undefined,
    },
  };
}
