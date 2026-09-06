import type { Metadata } from "next";

import { toCategoryConfig, toProduct } from "../../_data/categoryApi";
import { getShopBrand } from "../../_data/shop";
import CategorySections from "../../_components/Category/CategorySections";
import CategoryJsonLd from "../../_components/Category/CategoryJsonLd";
import Reviews from "../../_components/GBE/Reviews";
import VisitStore from "../../_components/GBE/VisitStore";
import {
  categoryMetadata,
  isFiltered,
  loadCategoryPage,
  loadFirstGrid,
  readFilters,
  zoneFromCookie,
  type SearchParams,
} from "../categoryPage";

/*
  Sub-category route — the category page's younger brother.

  A sub-category IS a category in the database (`Category.parentId`), so it
  reads the same endpoint, as parent + sub (a slug is unique per parent,
  DEC-PRD-043). Two differences, both deliberate:
   · LEAN. Banner and grid only — D42/D43. Somebody who pressed Roses wants
     roses, not a fresh set of rails offering lilies.
   · The parent in the URL must be the real parent: `/cake/rose` is a 404,
     not roses quietly rendered under Cakes with a second address for Google
     to split them across. The API enforces it — the child is looked up
     under that root only.
  Its own title, description, meta and picture are the sub-category's own
  fields in the admin, like any category's.
*/

type Params = { slug: string; sub: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug, sub } = await params;
  const page = await loadCategoryPage(slug, null, sub);
  return categoryMetadata(page, `/${slug}/${sub}`);
}

export default async function SubCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SearchParams>;
}) {
  const { slug, sub } = await params;
  const zone = await zoneFromCookie();
  const filters = await readFilters(await searchParams, zone);

  const page = await loadCategoryPage(slug, zone, sub);

  const gridCount = Number(page.sections.find((s) => s.key === "productGrid")?.config.count ?? 8);
  const [list, brand] = await Promise.all([loadFirstGrid(slug, zone, filters, sub, gridCount), getShopBrand()]);

  const config = toCategoryConfig(page, { lean: true });
  const filtered = isFiltered(filters);

  return (
    <main>
      <CategoryJsonLd page={page} path={`/${slug}/${sub}`} products={list?.items ?? []} siteName={brand?.name ?? "Radian"} />
      <CategorySections
        config={filtered && list ? { ...config, totalProducts: list.total } : config}
        filters={filters}
        products={(list?.items ?? []).map(toProduct)}
        apiSlug={slug}
        apiSub={sub}
        apiZone={zone}
        shopName={brand?.name ?? "Radian"}
        productsFailed={list === null}
      />
      <Reviews />
      <VisitStore />
    </main>
  );
}
