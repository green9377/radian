import type { Metadata } from "next";

import { toCategoryConfig, toProduct } from "../_data/categoryApi";
import { getShopBrand } from "../_data/shop";
import CategorySections from "../_components/Category/CategorySections";
import CategoryJsonLd from "../_components/Category/CategoryJsonLd";
import Reviews from "../_components/GBE/Reviews";
import VisitStore from "../_components/GBE/VisitStore";
import {
  categoryMetadata,
  isFiltered,
  loadCategoryPage,
  loadFirstGrid,
  readFilters,
  zoneFromCookie,
  type SearchParams,
} from "./categoryPage";

/*
  ══════════════════════════════════════════════════════════════════════════
  One route, every category — from the admin, never from a list in code.

  WHY THIS IS A SERVER COMPONENT (D-CAT-05). A "flower delivery in Dhaka"
  search lands here, not on the homepage — this is the page Google actually
  indexes, and a page that assembles itself in the browser hands it an empty
  shell. The zone comes from a cookie so the server can pick the right
  products before rendering; `ZoneSync` keeps that cookie level with the zone
  store in the browser.

  NO FALLBACK CONTENT (owner, 6 Sep 2026). A slug nobody made is a 404; an
  API that cannot be reached is the error boundary. See `categoryPage.ts`.
  ══════════════════════════════════════════════════════════════════════════
*/

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const page = await loadCategoryPage(slug, null);
  return categoryMetadata(page, `/${slug}`);
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SearchParams>;
}) {
  const { slug } = await params;
  const zone = await zoneFromCookie();
  const filters = await readFilters(await searchParams, zone);

  const page = await loadCategoryPage(slug, zone);

  /*
    The first page of the grid only — as many as the grid shows before Load
    More, no more. The grid asks for the next batch itself as the shopper
    presses the button, rather than the server writing products nobody has
    scrolled to into the HTML of every category page.
  */
  const gridCount = Number(page.sections.find((s) => s.key === "productGrid")?.config.count ?? 8);
  // the shop's name comes from Company settings (DEC-GBL-003), not typed here
  const [list, brand] = await Promise.all([loadFirstGrid(slug, zone, filters, undefined, gridCount), getShopBrand()]);

  const config = toCategoryConfig(page);
  // with a filter on, the count under the grid must be the filtered count —
  // "24 of 312" beside twelve red roses is a lie about what was found
  const filtered = isFiltered(filters);

  return (
    <main>
      <CategoryJsonLd page={page} path={`/${slug}`} products={list?.items ?? []} siteName={brand?.name ?? "Radian"} />
      <CategorySections
        config={filtered && list ? { ...config, totalProducts: list.total } : config}
        filters={filters}
        products={(list?.items ?? []).map(toProduct)}
        rails={{
          bestsellers: page.rails.bestsellers.map(toProduct),
          readyToday: page.rails.readyToday.map(toProduct),
        }}
        apiSlug={slug}
        apiZone={zone}
        shopName={brand?.name ?? "Radian"}
        /* the raw rows — the sections the owner added ride along with these */
        blocks={page.sections}
        /* products could not be read — the grid says so rather than looking
           like a category nobody has filled in */
        productsFailed={list === null}
      />
      <Reviews />
      <VisitStore />
    </main>
  );
}
