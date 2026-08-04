import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { getSubCategoryConfig } from "../../../_data/categories";
import { toCategoryConfig, toProduct } from "../../../_data/categoryApi";
import { getCategoryPage, getShopProducts } from "../../../_data/shop";
import CategorySections from "../../../_components/Category/CategorySections";
import Reviews from "../../../_components/GBE/Reviews";
import VisitStore from "../../../_components/GBE/VisitStore";

/*
  Sub-category route — the category page's younger brother, connected 31 Jul.

  A sub-category IS a category in the database (`Category.parentId`), so it
  reads the same endpoint. Two differences, both deliberate:

   · LEAN. Banner and grid only — D42/D43. Somebody who pressed Roses wants
     roses, not a fresh set of rails offering lilies.
   · The parent in the URL must be the real parent. `/categories/cakes/roses`
     is checked and 404s instead of quietly rendering roses under Cakes, which
     would give the same products two addresses and split them in Google.
*/

type Params = { slug: string; sub: string };

async function zoneFromCookie(): Promise<"dhaka" | "bangladesh" | null> {
  const c = await cookies();
  const v = c.get("radian-zone")?.value;
  return v === "bangladesh" || v === "dhaka" ? v : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug, sub } = await params;
  const page = await getCategoryPage(sub, null);

  if (page && page.parent?.slug === slug) {
    return {
      title: page.seo.title,
      description: page.seo.description,
      robots: page.seo.noIndex ? { index: false, follow: false } : undefined,
    };
  }

  const fallback = getSubCategoryConfig(slug, sub);
  return fallback ? { title: fallback.seo.title, description: fallback.seo.description } : {};
}

export default async function SubCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, sub } = await params;
  const zone = await zoneFromCookie();
  const sp = await searchParams;

  /*
    The same filters the parent page reads — 2 Aug 2026.

    They were not read here at all, so `/categories/fresh-flowers/roses?colour=red`
    quietly showed every rose. Nobody links there from the shop, but people
    share addresses, and an address that ignores half of itself is a link that
    lies about what it will show. Lean means fewer SECTIONS (D42/D43), not a
    grid that disagrees with its own URL.
  */
  const one = (k: string) => {
    const v = sp[k];
    return typeof v === "string" && v ? v : undefined;
  };
  const filters = {
    colour: one("colour"),
    occasion: one("occasions") ?? one("occasion"),
    tag: one("tag") ?? one("style"),
    min: one("min"),
    max: one("max"),
    speed: one("speed") ?? one("delivery"),
    sort: one("sort") ?? "popular",
  };

  const page = await getCategoryPage(sub, zone);

  if (!page || page.parent?.slug !== slug) {
    const fallback = getSubCategoryConfig(slug, sub);
    if (!fallback) return notFound();
    return (
      <main>
        <CategorySections config={fallback} />
        <Reviews />
        <VisitStore />
      </main>
    );
  }

  const list = await getShopProducts({ category: sub, zone, limit: 24, ...filters });

  const config = toCategoryConfig(page, { lean: true });
  // filtered = the count under the grid is the filtered count, as on the
  // parent page: "24 of 312" beside twelve red roses is a lie about the search
  const filtered = Object.entries(filters).some(([k, v]) => k !== "sort" && v);

  return (
    <main>
      <CategorySections
        config={filtered && list ? { ...config, totalProducts: list.total } : config}
        filters={filters}
        products={(list?.items ?? []).map(toProduct)}
        apiSlug={sub}
        apiZone={zone}
        productsFailed={list === null}
      />
      <Reviews />
      <VisitStore />
    </main>
  );
}
